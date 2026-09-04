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
 *       [--app <AppImage | unpacked dir | LocalBot.app>] [--shots <dir>] [--keep] [--prompt "…"]
 *
 * macOS (Stage 10): the app is dist/desktop/mac-arm64/LocalBot.app, the process
 * tree comes from `ps`, and AppData is the real ~/Library/Application Support/LocalBot
 * (Electron ignores $HOME for appData on macOS) — a config is seeded there only
 * if none exists and removed again afterwards. On darwin-arm64 the proof also
 * requires llama-server to run from bin/darwin-arm64/metal/ with --n-gpu-layers > 0
 * and Settings to show the Metal build (STAGE10_MAC_GPU_PASS).
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

/** macOS: one `ps` pass gives pid, ppid and the executable path for every process. */
function descendantsMac(rootPid) {
  const out = [];
  const ps = spawnSync("ps", ["-axo", "pid=,ppid=,comm="], { encoding: "utf8" });
  if (ps.status !== 0) return out;
  const byParent = new Map();
  for (const line of ps.stdout.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const pid = Number(m[1]);
    const ppid = Number(m[2]);
    if (!byParent.has(ppid)) byParent.set(ppid, []);
    byParent.get(ppid).push({ pid, exe: m[3].trim() });
  }
  const stack = [rootPid];
  while (stack.length) {
    const p = stack.pop();
    for (const c of byParent.get(p) ?? []) {
      const args = spawnSync("ps", ["-o", "args=", "-ww", "-p", String(c.pid)], { encoding: "utf8" }).stdout.trim();
      out.push({ pid: c.pid, exe: c.exe, cmd: args.split(/\s+/) });
      stack.push(c.pid);
    }
  }
  return out;
}

function descendants(rootPid) {
  const out = [];
  if (process.platform === "darwin") return descendantsMac(rootPid);
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
  if (process.platform === "darwin") return path.join(out, process.arch === "arm64" ? "mac-arm64" : "mac", "LocalBot.app");
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
const mac = process.platform === "darwin";
const exe = mac ? path.join(appDir, "Contents/MacOS/LocalBot") : path.join(appDir, process.platform === "win32" ? "LocalBot.exe" : "LocalBot");
if (!fs.existsSync(exe)) fail(`no packaged app at ${exe}; run npm run build:desktop`);
const res = harnessResourcePaths({ resourcesPath: path.join(appDir, mac ? "Contents/Resources" : "resources") });
const bundledNode = fs.realpathSync(res.nodeBin);

if (await up(SIDECAR_URL, 500)) fail(`${SIDECAR_URL} already answering — stop the other LocalBot first`);

const home = mac ? os.homedir() : path.join(tmp, "home");
const appData = mac ? path.join(home, "Library", "Application Support", "LocalBot") : path.join(home, ".config", "LocalBot");
const work = path.join(tmp, "work");
const configPath = path.join(appData, "localbot-config.json");
const seeded = !fs.existsSync(configPath);
if (seeded) {
  seedLocalBotData({
    dataDir: appData,
    folders: { employeeRoot: path.join(work, "employees/Sam"), employeeShared: null, departmentShared: path.join(work, "departments/Ops/shared"), companyShared: null },
    agents: [{ name: "Writer" }],
    idPrefix: "chat",
  });
  if (mac) {
    log("AppData had no localbot-config.json — seeded one agent (Writer); removed again afterwards");
    cleanup.push(() => {
      fs.rmSync(configPath, { force: true });
      fs.rmSync(path.join(appData, "agents"), { recursive: true, force: true });
    });
  }
} else {
  log("AppData config exists at", configPath, "— using it as is");
}
fs.mkdirSync(path.join(appData, "models"), { recursive: true });
const ggufDest = path.join(appData, "models", path.basename(gguf));
if (path.resolve(gguf) !== path.resolve(ggufDest)) fs.copyFileSync(gguf, ggufDest);
{
  // The turn must run on THIS file even when models/ holds others: point the
  // config's default at it (the sidecar re-verifies size + magic + sha256 before
  // loading). The previous default is restored on exit when the config was not seeded.
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const prev = { activeModelId: cfg.activeModelId ?? null, activeModelPath: cfg.activeModelPath ?? null };
  const catalogRow = JSON.parse(fs.readFileSync(path.join(root, "catalog/models.json"), "utf8")).models.find((m) => m.filename === path.basename(gguf));
  cfg.activeModelId = catalogRow?.id ?? null;
  cfg.activeModelPath = ggufDest;
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n");
  if (!seeded)
    cleanup.push(() => {
      const c = JSON.parse(fs.readFileSync(configPath, "utf8"));
      Object.assign(c, prev);
      fs.writeFileSync(configPath, JSON.stringify(c, null, 2) + "\n");
    });
}
if (!mac) fs.mkdirSync(path.join(home, ".local/share"), { recursive: true });
log("AppData", appData, "| GGUF", path.basename(gguf), "→ models/");

const electronApp = await _electron.launch({
  executablePath: exe,
  args: mac ? [] : ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  env: {
    PATH: cleanBin,
    HOME: home,
    TMPDIR: process.env.TMPDIR ?? "/tmp",
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

if (seeded) {
  await page.getByText("Writer", { exact: true }).first().waitFor({ timeout: 60000 });
  await page.getByText("Writer", { exact: true }).first().click();
}
const box = page.getByPlaceholder(seeded ? /Message Writer/ : /Message /);
await box.waitFor({ timeout: 30000 });
const prompt = opt("--prompt") ?? "Reply with one short sentence saying hello.";
// Chats live in the renderer's localStorage: an earlier run against the same AppData leaves its replies on screen.
const before = await page.locator("li[data-role='assistant']").count();
if (before) log(`chat already shows ${before} assistant message(s) from an earlier run; waiting for a new one`);
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
  if (llama && !globalThis.__llamaSeen) {
    globalThis.__llamaSeen = llama;
    log("llama-server running from", llama.exe);
    log("llama-server cmdline:", llama.cmd.join(" "));
  }
  const msgs = await page.locator("li[data-role='assistant']").allInnerTexts().catch(() => []);
  if (msgs.length > before) {
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

// ---- Stage 10, darwin-arm64: the turn ran on the Metal build with layers on the GPU.
if (mac && process.arch === "arm64") {
  const llama = globalThis.__llamaSeen ?? descendants(aPid).find((p) => /llama-server/.test(p.exe ?? ""));
  if (!llama) fail("no llama-server process was observed under the packaged app");
  const metalDir = path.join(appData, "bin", "darwin-arm64", "metal");
  if (!llama.exe.startsWith(metalDir)) fail(`llama-server ran from ${llama.exe}, not the macos-arm64 Metal tree ${metalDir}`);
  const ngl = Number(llama.cmd[llama.cmd.indexOf("--n-gpu-layers") + 1]);
  if (!(ngl > 0)) fail(`llama-server --n-gpu-layers is ${llama.cmd[llama.cmd.indexOf("--n-gpu-layers") + 1] ?? "absent"}; Metal must offload layers`);
  const props = await fetch("http://127.0.0.1:18789/props", { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).catch(() => null);
  if (!props) fail("llama-server /props did not answer on 127.0.0.1:18789");
  log("llama-server /props:", JSON.stringify({ model_path: props.model_path, build_info: props.build_info, n_ctx: props.default_generation_settings?.n_ctx, total_slots: props.total_slots }));
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Models", exact: true }).first().click({ timeout: 30000 });
  const choice = page.getByTestId("runtime-choice"); // Settings › Models › "llama.cpp build"
  await choice.waitFor({ timeout: 30000 });
  const choiceText = (await choice.textContent()) ?? "";
  if (!/Metal/.test(choiceText)) fail(`Settings runtime line does not say Metal: "${choiceText}"`);
  log("Settings:", choiceText.trim());
  if (shots) await page.screenshot({ path: path.join(shots, "packaged-settings-metal.png") });
  console.log(`STAGE10_MAC_GPU_PASS runtime=metal n_gpu_layers=${ngl} llama_server=${llama.exe} gguf=${path.basename(gguf)} reply_ms=${ms}`);
}
await electronApp.close().catch(() => {});
process.exit(0);
