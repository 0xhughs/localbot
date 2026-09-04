#!/usr/bin/env node
/**
 * Stage 8 — two-process share, one host (run: `npm run prove:two-process`).
 *
 * Two LocalBot processes with two different LOCALBOT_DATA_DIRs point their
 * `department-shared` scope at the SAME real folder:
 *   A = the packaged app (Electron + its sidecar on 127.0.0.1:18790), launched from
 *       dist/desktop (AppImage / unpacked dir), AppData under a temp HOME
 *   B = `npm run dev` on 127.0.0.1:8080 with LOCALBOT_DATA_DIR = a temp dir
 * A writes a file through its own sidecar (the `@Editor` handoff in Writer's chat
 * writes `department-shared/task-*.md`; no model needed). B's Computer pane must
 * list that file without a reload (Stage 3 watch + status poll). Then the same
 * in the other direction. Both instances' `employee-shared` is unset so the
 * handoff lands in `department-shared`.
 *
 * This is two processes on ONE host sharing ONE real directory. It is not two
 * laptops and not a NAS; a real SMB/NFS share stays UNVERIFIED until someone runs
 * this with `--shared /path/to/mounted/share` on two machines.
 *
 * Usage:
 *   npm run prove:two-process                       # newest dist/desktop/*.AppImage, temp shared folder
 *   npm run prove:two-process -- --app <AppImage | unpacked dir> --shared <real folder> --shots <dir> --keep
 *   npm run prove:two-process -- --a-url http://127.0.0.1:18790   # A is already running (its data dir must
 *                                                                #  point department-shared at --shared)
 *
 * Needs: `npm install` (Playwright is a devDependency; `npx playwright install chromium` once),
 * Linux without $DISPLAY re-executes itself under `xvfb-run -a`.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLocalBotData } from "./seed-localbot-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const log = (...a) => console.log("[two-process]", ...a);
const fail = (msg) => {
  console.error("[two-process] FAIL:", msg);
  process.exitCode = 1;
  throw new Error(msg);
};

const A_URL = "http://127.0.0.1:18790/";
const B_URL = "http://127.0.0.1:8080/";
const SCOPE = "department-shared";
const LIST_TIMEOUT_MS = Number(process.env.LOCALBOT_SHARE_TIMEOUT_MS || 30000);

function displayUsable() {
  if (process.env.WAYLAND_DISPLAY) return true;
  const m = /^:(\d+)/.exec(process.env.DISPLAY ?? "");
  return Boolean(m) && fs.existsSync(`/tmp/.X11-unix/X${m[1]}`);
}
const xauthority = process.env.XAUTHORITY || path.join(os.homedir(), ".Xauthority");
if (process.platform === "linux" && (!displayUsable() || flag("--xvfb")) && !process.env.LOCALBOT_PROVE_XVFB) {
  log("no DISPLAY — re-running under xvfb-run -a");
  const r = spawnSync("xvfb-run", ["-a", "-s", "-screen 0 1400x900x24", process.execPath, ...process.execArgv, ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, LOCALBOT_PROVE_XVFB: "1" },
  });
  process.exit(r.status ?? 1);
}

const { chromium, _electron } = await import("playwright");

async function up(url, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function killTree(pid) {
  if (!pid) return;
  const kids = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" }).stdout.split(/\s+/).filter(Boolean).map(Number);
  for (const k of kids) killTree(k);
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* gone */
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-share-"));
const keep = flag("--keep");
const shots = opt("--shots") ? path.resolve(opt("--shots")) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const shared = path.resolve(opt("--shared") ?? path.join(tmp, "department-shared"));
fs.mkdirSync(shared, { recursive: true });

const cleanup = [];
process.on("exit", () => {
  for (const fn of cleanup.reverse()) {
    try {
      fn();
    } catch {
      /* best effort */
    }
  }
  if (!keep) fs.rmSync(tmp, { recursive: true, force: true });
  else log("kept", tmp);
});

function seed(name, dataDir, employee) {
  const work = path.join(tmp, name);
  seedLocalBotData({
    dataDir,
    folders: {
      employeeRoot: path.join(work, "employees", employee),
      employeeShared: null,
      departmentShared: shared,
      companyShared: null,
    },
    agents: [{ name: "Writer" }, { name: "Editor", mascotId: "researcher" }],
    labels: { company: "Acme", department: "Ops", employee },
    idPrefix: name,
  });
}

function newestApp() {
  const out = path.join(root, "dist/desktop");
  if (fs.existsSync(out)) {
    const names = fs.readdirSync(out).filter((n) => n.endsWith(".AppImage"));
    names.sort((a, b) => fs.statSync(path.join(out, b)).mtimeMs - fs.statSync(path.join(out, a)).mtimeMs);
    if (names[0]) return path.join(out, names[0]);
  }
  return path.join(root, "dist/desktop/linux-unpacked");
}

function unpack(appInput) {
  if (appInput.endsWith(".AppImage")) {
    fs.chmodSync(appInput, 0o755);
    const r = spawnSync(appInput, ["--appimage-extract"], { cwd: tmp, encoding: "utf8", stdio: ["ignore", "ignore", "pipe"], maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) fail(`--appimage-extract failed: ${r.stderr}`);
    return path.join(tmp, "squashfs-root");
  }
  return appInput;
}

// ---- A: packaged app ---------------------------------------------------------------
let electronApp = null;
let pageA;
const aUrl = opt("--a-url");
if (aUrl) {
  if (!(await up(aUrl, 2000))) fail(`${aUrl} is not answering`);
  log("A = already running packaged sidecar at", aUrl, "(its department-shared must be", shared + ")");
} else {
  if (await up(A_URL, 500)) fail(`${A_URL} already answering — stop the other LocalBot or pass --a-url`);
  const appDir = unpack(path.resolve(opt("--app") ?? newestApp()));
  const exe = path.join(appDir, process.platform === "win32" ? "LocalBot.exe" : "LocalBot");
  if (!fs.existsSync(exe)) fail(`no packaged app at ${exe}; run npm run build:desktop`);
  const homeA = path.join(tmp, "homeA");
  const appDataA = path.join(homeA, ".config", "LocalBot");
  seed("A", appDataA, "Alice");
  fs.mkdirSync(path.join(homeA, ".local/share"), { recursive: true });
  log("A = packaged", exe, "| AppData", appDataA);
  electronApp = await _electron.launch({
    executablePath: exe,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    env: {
      ...process.env,
      HOME: homeA,
      XAUTHORITY: process.env.XAUTHORITY || (fs.existsSync(xauthority) ? xauthority : ""),
      XDG_CONFIG_HOME: path.join(homeA, ".config"),
      XDG_DATA_HOME: path.join(homeA, ".local/share"),
      XDG_CACHE_HOME: path.join(homeA, ".cache"),
    },
    timeout: 90000,
  });
  const aPid = electronApp.process().pid;
  // Electron's before-quit kills its sidecar on a normal close; a hard kill would orphan it, so sweep the tree too.
  cleanup.push(() => killTree(aPid));
  pageA = await electronApp.firstWindow({ timeout: 90000 });
  if (!(await up(A_URL, 60000))) fail("packaged sidecar never answered on " + A_URL);
}

// ---- B: npm run dev ------------------------------------------------------------------
let devChild = null;
const dataDirB = path.join(tmp, "dataB");
if (await up(B_URL, 500)) fail(`${B_URL} already answering — this test needs its own npm run dev with LOCALBOT_DATA_DIR=${dataDirB}`);
seed("B", dataDirB, "Bob");
log("B = npm run dev on", B_URL, "| LOCALBOT_DATA_DIR", dataDirB);
devChild = spawn("npm", ["run", "dev"], {
  cwd: root,
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, LOCALBOT_DATA_DIR: dataDirB, BROWSER: "none" },
});
let devLog = "";
devChild.stdout.on("data", (b) => (devLog += String(b)));
devChild.stderr.on("data", (b) => (devLog += String(b)));
cleanup.push(() => {
  try {
    process.kill(-devChild.pid, "SIGTERM");
  } catch {
    /* gone */
  }
});
if (!(await up(B_URL, 120000))) fail("npm run dev never answered on " + B_URL + "\n" + devLog.slice(-2000));

// ---- browser for B (and for A when A was already running) ------------------------------
const browser = await chromium.launch({ headless: false, args: ["--no-sandbox"] });
cleanup.push(() => browser.close());
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const pageB = await ctxB.newPage();
await pageB.goto(B_URL);
if (!pageA) {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  pageA = await ctxA.newPage();
  await pageA.goto(aUrl);
}

async function openRoster(page, who) {
  await page.getByText("Writer", { exact: true }).first().waitFor({ timeout: 60000 });
  await page.getByText("Writer", { exact: true }).first().click();
  await page.getByPlaceholder(/Message Writer/).waitFor({ timeout: 30000 });
  // Chat header on md+ ("Show computer"); the narrow top bar on small screens ("Computer").
  const computer = page.locator('button[aria-label="Show computer"]:visible, button[aria-label="Computer"]:visible');
  const section = page.locator(`[data-scope="${SCOPE}"]`);
  if (!(await section.count())) await computer.first().click();
  await section.waitFor({ timeout: 30000 });
  log(who, "shows the roster from disk and the Department section");
}

async function listing(page) {
  return (await page.locator(`[data-scope="${SCOPE}"]`).innerText()).replace(/\s+/g, " ");
}

async function handoffFrom(page, who, text) {
  const before = new Set(fs.readdirSync(shared));
  const box = page.getByPlaceholder(/Message Writer/);
  await box.fill(text);
  await box.press("Enter");
  await page.getByText(/Handed work to Editor via department-shared\//).first().waitFor({ timeout: 30000 });
  const created = fs.readdirSync(shared).filter((n) => !before.has(n) && n.startsWith("task-"));
  if (created.length !== 1) fail(`${who}: expected one new task-*.md in ${shared}, got ${JSON.stringify(created)}`);
  log(who, "wrote", path.join(shared, created[0]), "through its own sidecar");
  return created[0];
}

async function waitListed(page, who, file) {
  const t0 = Date.now();
  while (Date.now() - t0 < LIST_TIMEOUT_MS) {
    if ((await listing(page)).includes(file)) {
      const ms = Date.now() - t0;
      log(who, "Computer pane lists", file, "after", ms, "ms — no reload, no Refresh click");
      return ms;
    }
    await page.waitForTimeout(500);
  }
  fail(`${who}'s Computer pane did not list ${file} within ${LIST_TIMEOUT_MS} ms: ${await listing(page)}`);
}

await openRoster(pageB, "B (dev :8080)");
await openRoster(pageA, "A (packaged :18790)");
const baselineB = await listing(pageB);
log("B baseline Department listing:", baselineB.slice(0, 200));

const fileAB = await handoffFrom(pageA, "A", "@Editor Please review the Q3 notes and reply in the shared folder.");
const msAB = await waitListed(pageB, "B", fileAB);
if (shots) {
  await pageB.screenshot({ path: path.join(shots, "two-process-B-sees-A-file.png") });
  await pageA.screenshot({ path: path.join(shots, "two-process-A-after-handoff.png") });
}

const fileBA = await handoffFrom(pageB, "B", "@Editor Second file, from the other process.");
const msBA = await waitListed(pageA, "A", fileBA);
if (shots) await pageA.screenshot({ path: path.join(shots, "two-process-A-sees-B-file.png") });

for (const f of [fileAB, fileBA]) {
  if (!fs.existsSync(path.join(shared, f))) fail(`${f} is not on disk in ${shared}`);
}

console.log(
  `STAGE8_TWO_PROCESS_PASS mode="two-process, one host" shared=${shared} A_to_B=${fileAB} (${msAB} ms) B_to_A=${fileBA} (${msBA} ms)`,
);
console.log("[two-process] Two processes on one host, one real folder. Not two laptops, not a NAS — those stay UNVERIFIED.");

if (electronApp) await electronApp.close().catch(() => {});
await browser.close().catch(() => {});
process.exit(0);
