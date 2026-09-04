#!/usr/bin/env node
/**
 * Stage 8 — a real chat turn inside the PACKAGED app (run: `npm run prove:packaged-chat -- --gguf <file>`).
 *
 * Launches the packaged Electron binary (Playwright's electron driver) with a
 * seeded AppData under a temp HOME, copies the given verified GGUF into
 * `{appData}/models/`, opens Writer, sends one prompt, and waits for the reply.
 * Passing means the packaged sidecar started llama-server (downloading the
 * pinned llama.cpp build into `{appData}/bin/` if needed) and spawned DeepSeek
 * Harness with the app's bundled Node and bundled dsh tree — checked against
 * /proc — with node/npm/npx removed from PATH.
 *
 * Usage:
 *   npm run prove:packaged-chat -- --gguf /path/to/qwen2.5-0.5b-instruct-q4_k_m.gguf
 *       [--app <AppImage | unpacked dir>] [--shots <dir>] [--keep] [--prompt "…"]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { harnessResourcePaths, SIDECAR_URL } from "../desktop/packaged.mjs";
import { seedLocalBotData } from "./seed-localbot-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const log = (...a) => console.log("[packaged-chat]", ...a);
const fail = (msg) => {
  console.error("[packaged-chat] FAIL:", msg);
  process.exitCode = 1;
  throw new Error(msg);
};

const gguf = opt("--gguf");
if (!gguf || !fs.existsSync(gguf)) fail("--gguf <verified .gguf file> is required (it is copied into the packaged app's AppData/models)");

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

const { _electron } = await import("playwright");

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

function descendants(rootPid) {
  const out = [];
  if (process.platform !== "linux") return out;
  const byParent = new Map();
  for (const n of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(n)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${n}/stat`, "utf8");
      const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      if (!byParent.has(ppid)) byParent.set(ppid, []);
      byParent.get(ppid).push(Number(n));
    } catch {
      /* gone */
    }
  }
  const stack = [rootPid];
  while (stack.length) {
    const p = stack.pop();
    for (const c of byParent.get(p) ?? []) {
      let exe = null;
      let cmd = [];
      try {
        exe = fs.realpathSync(fs.readlinkSync(`/proc/${c}/exe`));
        cmd = fs.readFileSync(`/proc/${c}/cmdline`, "utf8").split("\0").filter(Boolean);
      } catch {
        /* gone */
      }
      out.push({ pid: c, exe, cmd });
      stack.push(c);
    }
  }
  return out;
}

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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-chat-"));
const keep = flag("--keep");
const shots = opt("--shots") ? path.resolve(opt("--shots")) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
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

// PATH without node / npm / npx: the packaged app must not need them.
const cleanBin = path.join(tmp, "bin");
fs.mkdirSync(cleanBin);
const banned = /^(node|nodejs|npm|npx|corepack|electron)(\.exe|\.cmd)?$/i;
for (const dir of ["/usr/bin", "/bin", "/usr/sbin"]) {
  if (!fs.existsSync(dir)) continue;
  for (const n of fs.readdirSync(dir)) {
    if (banned.test(n) || fs.existsSync(path.join(cleanBin, n))) continue;
    try {
      fs.symlinkSync(path.join(dir, n), path.join(cleanBin, n));
    } catch {
      /* dup */
    }
  }
}
if (spawnSync("/bin/sh", ["-c", "command -v node || command -v npm || command -v npx"], { env: { PATH: cleanBin } }).status === 0) fail("clean PATH still has node");

function newestApp() {
  const out = path.join(root, "dist/desktop");
  if (fs.existsSync(out)) {
    const names = fs.readdirSync(out).filter((n) => n.endsWith(".AppImage"));
    names.sort((a, b) => fs.statSync(path.join(out, b)).mtimeMs - fs.statSync(path.join(out, a)).mtimeMs);
    if (names[0]) return path.join(out, names[0]);
  }
  return path.join(root, "dist/desktop/linux-unpacked");
}
let appDir = path.resolve(opt("--app") ?? newestApp());
if (appDir.endsWith(".AppImage")) {
  fs.chmodSync(appDir, 0o755);
  const r = spawnSync(appDir, ["--appimage-extract"], { cwd: tmp, encoding: "utf8", stdio: ["ignore", "ignore", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) fail(`--appimage-extract failed: ${r.stderr}`);
  appDir = path.join(tmp, "squashfs-root");
}
const exe = path.join(appDir, process.platform === "win32" ? "LocalBot.exe" : "LocalBot");
if (!fs.existsSync(exe)) fail(`no packaged app at ${exe}; run npm run build:desktop`);
const res = harnessResourcePaths({ resourcesPath: path.join(appDir, "resources") });
const bundledNode = fs.realpathSync(res.nodeBin);

if (await up(SIDECAR_URL, 500)) fail(`${SIDECAR_URL} already answering — stop the other LocalBot first`);

const home = path.join(tmp, "home");
const appData = path.join(home, ".config", "LocalBot");
const work = path.join(tmp, "work");
seedLocalBotData({
  dataDir: appData,
  folders: { employeeRoot: path.join(work, "employees/Sam"), employeeShared: null, departmentShared: path.join(work, "departments/Ops/shared"), companyShared: null },
  agents: [{ name: "Writer" }],
  idPrefix: "chat",
});
fs.mkdirSync(path.join(appData, "models"), { recursive: true });
fs.copyFileSync(gguf, path.join(appData, "models", path.basename(gguf)));
fs.mkdirSync(path.join(home, ".local/share"), { recursive: true });
log("AppData", appData, "| GGUF", path.basename(gguf), "→ models/");

const electronApp = await _electron.launch({
  executablePath: exe,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  env: {
    PATH: cleanBin,
    HOME: home,
    XAUTHORITY: process.env.XAUTHORITY || (fs.existsSync(xauthority) ? xauthority : ""),
    DISPLAY: process.env.DISPLAY ?? "",
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local/share"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    LANG: process.env.LANG ?? "C.UTF-8",
  },
  timeout: 90000,
});
const aPid = electronApp.process().pid;
cleanup.push(() => killTree(aPid));
const page = await electronApp.firstWindow({ timeout: 90000 });
if (!(await up(SIDECAR_URL, 60000))) fail("packaged sidecar never answered on " + SIDECAR_URL);
log("packaged app up: pid", aPid, "sidecar", SIDECAR_URL);

await page.getByText("Writer", { exact: true }).first().waitFor({ timeout: 60000 });
await page.getByText("Writer", { exact: true }).first().click();
const box = page.getByPlaceholder(/Message Writer/);
await box.waitFor({ timeout: 30000 });
const prompt = opt("--prompt") ?? "Reply with one short sentence saying hello.";
const t0 = Date.now();
await box.fill(prompt);
await box.press("Enter");
log("sent:", JSON.stringify(prompt), "— first turn downloads llama.cpp into AppData/bin and hashes the GGUF; waiting up to 10 min");

// Poll until an assistant reply is on screen (or an error line names the reason).
let reply = null;
let dshSeen = null;
const deadline = Date.now() + 10 * 60 * 1000;
while (Date.now() < deadline) {
  const tree = descendants(aPid);
  const dsh = tree.find((p) => p.cmd.some((a) => a.endsWith("@deepseek-ai/dsh/lib/bin.js")));
  if (dsh && !dshSeen) {
    dshSeen = dsh;
    log("dsh spawned by the packaged sidecar: pid", dsh.pid, "exe", dsh.exe);
    log("dsh cmdline:", dsh.cmd.join(" "));
  }
  const llama = tree.find((p) => /llama-server/.test(p.exe ?? ""));
  if (llama && !globalThis.__llamaLogged) {
    globalThis.__llamaLogged = true;
    log("llama-server running from", llama.exe);
  }
  const msgs = await page.locator("li[data-role='assistant']").allInnerTexts().catch(() => []);
  if (msgs.length) {
    reply = msgs[msgs.length - 1];
    break;
  }
  const errLine = await page.getByText(/DeepSeek Harness .* needs Node|LOCALBOT_DSH_NODE|no bundled Node|dsh exited/).first().textContent({ timeout: 200 }).catch(() => null);
  if (errLine) fail(`the packaged Harness refused: ${errLine}`);
  await page.waitForTimeout(1000);
}
if (shots) await page.screenshot({ path: path.join(shots, "packaged-chat-reply.png") });
if (!reply) {
  const text = await page.locator("main, body").first().innerText().catch(() => "");
  fail(`no assistant reply within 10 min. Screen text:\n${text.slice(-1500)}`);
}
const ms = Date.now() - t0;
log(`assistant replied after ${ms} ms:`, JSON.stringify(reply.slice(0, 200)));

if (!dshSeen) {
  // The reply may have arrived between polls; look once more before giving up.
  const dsh = descendants(aPid).find((p) => p.cmd.some((a) => a.endsWith("@deepseek-ai/dsh/lib/bin.js")));
  if (dsh) dshSeen = dsh;
}
if (!dshSeen) fail("no dsh process was observed under the packaged app");
if (dshSeen.exe !== bundledNode) fail(`dsh ran on ${dshSeen.exe}, not the bundled ${bundledNode}`);
if (!dshSeen.cmd.some((a) => a.startsWith(fs.realpathSync(res.modulesDir)) || a.startsWith(res.modulesDir))) fail("dsh did not run from the bundled @deepseek-ai/dsh tree");
const foreign = descendants(aPid).filter((p) => p.exe && !p.exe.startsWith(fs.realpathSync(appDir)) && !p.exe.startsWith(fs.realpathSync(appData)));
if (foreign.length) fail(`processes outside the app / AppData: ${foreign.map((p) => p.exe).join(", ")}`);
log("every process under the app is the app itself, its bundled Node, or llama-server in AppData/bin");

const cfg = JSON.parse(fs.readFileSync(path.join(appData, "localbot-config.json"), "utf8"));
if (!cfg.activeModelPath || !cfg.activeModelPath.startsWith(appData)) fail(`activeModelPath is ${cfg.activeModelPath}, not under AppData`);
log("activeModelPath", cfg.activeModelPath, "| verified:", Object.keys(cfg.verifiedModels ?? {}).length, "file(s)");

console.log(`STAGE8_PACKAGED_CHAT_PASS dsh_node=${dshSeen.exe} reply_ms=${ms} gguf=${path.basename(gguf)}`);
await electronApp.close().catch(() => {});
process.exit(0);
