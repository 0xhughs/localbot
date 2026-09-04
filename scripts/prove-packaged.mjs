#!/usr/bin/env node
/**
 * Stage 8 prove-it for the packaged app (run: `npm run prove:packaged`).
 *
 * Fails when:
 *   - package.json still builds only `dir` for this OS, or the build script hardcodes --dir
 *   - the app tree lacks the bundled Node / dsh tree / dsh overlay / plugin sources
 *   - the bundled Node is < 22.15 or cannot run with node/npm/npx removed from PATH
 *   - the sidecar's real spawn path (src/lib/harness/process.ts, LOCALBOT_PACKAGED=1)
 *     cannot start dsh and complete ACP initialize with that PATH, or starts it with
 *     any Node other than the bundled one
 *   - the packaged Electron binary, launched with that PATH and a seeded AppData,
 *     does not answer on 127.0.0.1:18790, writes to the repo's data/, or has a child
 *     process whose executable lives outside the app (a host node, npm, …)
 *
 * Usage:
 *   npm run prove:packaged                       # newest dist/desktop/*.AppImage, else linux-unpacked
 *   npm run prove:packaged -- --app <AppImage | .deb | unpacked dir>
 *   npm run prove:packaged -- --no-launch        # skip step 5 (no display / no GTK)
 *   npm run prove:packaged -- --keep             # keep the temp HOME / extracted app
 *
 * Linux without $DISPLAY re-executes itself under `xvfb-run -a`.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { harnessResourcePaths, packagedHarnessEnv, SIDECAR_URL } from "../desktop/packaged.mjs";
import { hasInstallerTarget, versionAtLeast } from "./desktop-stage.mjs";
import { seedLocalBotData } from "./seed-localbot-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const log = (...a) => console.log("[prove]", ...a);
const fail = (msg) => {
  console.error("[prove] FAIL:", msg);
  process.exit(1);
};

// ---- 0. static gates -------------------------------------------------------
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const osKey = process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "linux";
if (!hasInstallerTarget(pkg, osKey)) fail(`package.json build.${osKey}.target is dir-only`);
if (pkg.build.mac.identity !== null) fail("build.mac.identity is not null");
const buildSrc = fs.readFileSync(path.join(root, "scripts/build-desktop.mjs"), "utf8");
if (buildSrc.includes('"--dir"')) fail("scripts/build-desktop.mjs hardcodes --dir");
log("static gates ok: targets", JSON.stringify(pkg.build[osKey].target), "| identity null | no --dir");

// ---- re-exec under Xvfb when headless ---------------------------------------
function displayUsable() {
  if (process.env.WAYLAND_DISPLAY) return true;
  const m = /^:(\d+)/.exec(process.env.DISPLAY ?? "");
  return Boolean(m) && fs.existsSync(`/tmp/.X11-unix/X${m[1]}`);
}
const xauthority = process.env.XAUTHORITY || path.join(os.homedir(), ".Xauthority");
if (process.platform === "linux" && (!displayUsable() || flag("--xvfb")) && !flag("--no-launch") && !process.env.LOCALBOT_PROVE_XVFB) {
  const xvfb = spawnSync("which", ["xvfb-run"], { encoding: "utf8" }).stdout.trim();
  if (!xvfb) fail("no DISPLAY and no xvfb-run; pass --no-launch to skip the window");
  log("no DISPLAY — re-running under xvfb-run -a");
  const r = spawnSync("xvfb-run", ["-a", "-s", "-screen 0 1280x820x24", process.execPath, ...process.execArgv, ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, LOCALBOT_PROVE_XVFB: "1" },
  });
  process.exit(r.status ?? 1);
}

// ---- 1. locate / extract the app --------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-prove-"));
const keep = flag("--keep");
process.on("exit", () => {
  if (!keep) fs.rmSync(tmp, { recursive: true, force: true });
  else log("kept", tmp);
});

function newestInstaller() {
  const out = path.join(root, "dist/desktop");
  if (!fs.existsSync(out)) return null;
  const names = fs.readdirSync(out).filter((n) => n.endsWith(".AppImage"));
  names.sort((a, b) => fs.statSync(path.join(out, b)).mtimeMs - fs.statSync(path.join(out, a)).mtimeMs);
  return names[0] ? path.join(out, names[0]) : null;
}

let appInput = opt("--app") ?? newestInstaller() ?? path.join(root, "dist/desktop/linux-unpacked");
appInput = path.resolve(appInput);
if (!fs.existsSync(appInput)) fail(`no app at ${appInput}; run npm run build:desktop first`);

let appDir;
if (appInput.endsWith(".AppImage")) {
  log("extracting", path.basename(appInput));
  fs.chmodSync(appInput, 0o755);
  const r = spawnSync(appInput, ["--appimage-extract"], { cwd: tmp, encoding: "utf8", stdio: ["ignore", "ignore", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) fail(`--appimage-extract failed: ${r.stderr}`);
  appDir = path.join(tmp, "squashfs-root");
} else if (appInput.endsWith(".deb")) {
  log("extracting", path.basename(appInput));
  const r = spawnSync("dpkg-deb", ["-x", appInput, path.join(tmp, "deb")], { encoding: "utf8" });
  if (r.status !== 0) fail(`dpkg-deb -x failed: ${r.stderr}`);
  const opt = path.join(tmp, "deb/opt");
  const first = fs.readdirSync(opt)[0];
  appDir = path.join(opt, first);
} else {
  appDir = appInput;
}
const resources = path.join(appDir, "resources");
const exeName = process.platform === "win32" ? "LocalBot.exe" : "LocalBot";
const exe = path.join(appDir, exeName);
if (!fs.existsSync(resources) || !fs.existsSync(exe)) fail(`${appDir} is not an unpacked LocalBot (need ${exeName} + resources/)`);
log("app dir", appDir);

// ---- 2. layout ------------------------------------------------------------------
const res = harnessResourcePaths({ resourcesPath: resources });
const mustExist = [
  path.join(resources, "localbot-sidecar/sidecar.mjs"),
  path.join(resources, "localbot-server/server/index.mjs"),
  res.nodeBin,
  path.join(res.dshDir, "localbot-acp.cordis.yml"),
  path.join(res.dshDir, "localbot-fs.mjs"),
  path.join(res.modulesDir, "@deepseek-ai/dsh/lib/bin.js"),
  path.join(res.modulesDir, "@deepseek-ai/dsh-fs-local/package.json"),
  path.join(resources, "localbot-harness/src/lib/fs/scopes.ts"),
  path.join(resources, "localbot-harness/src/lib/fs/disk.ts"),
  path.join(resources, "localbot-harness/catalog/llama-assets.json"),
];
const missing = mustExist.filter((p) => !fs.existsSync(p));
if (missing.length) fail(`missing in the packaged app:\n  ${missing.join("\n  ")}`);
log("layout ok: bundled node + dsh tree + overlay + plugin sources present");

// ---- 3. a PATH with no node / npm / npx ------------------------------------------
const cleanBin = path.join(tmp, "bin");
fs.mkdirSync(cleanBin);
const banned = /^(node|nodejs|npm|npx|corepack|electron)(\.exe|\.cmd)?$/i;
for (const dir of ["/usr/bin", "/bin", "/usr/sbin"]) {
  if (!fs.existsSync(dir)) continue;
  for (const n of fs.readdirSync(dir)) {
    if (banned.test(n)) continue;
    const target = path.join(dir, n);
    const link = path.join(cleanBin, n);
    if (fs.existsSync(link)) continue;
    try {
      fs.symlinkSync(target, link);
    } catch {
      /* dup */
    }
  }
}
const cleanPath = cleanBin;
const shellCheck = spawnSync("/bin/sh", ["-c", "command -v node || command -v npm || command -v npx"], { env: { PATH: cleanPath }, encoding: "utf8" });
if (shellCheck.status === 0) fail(`PATH=${cleanPath} still resolves ${shellCheck.stdout.trim()}`);
log("PATH without node/npm/npx:", cleanPath);

const bundledVersion = spawnSync(res.nodeBin, ["--version"], { env: { PATH: cleanPath }, encoding: "utf8" });
if (bundledVersion.status !== 0) fail(`bundled node did not run: ${bundledVersion.stderr}`);
const bv = bundledVersion.stdout.trim();
if (!versionAtLeast(bv, "22.15.0")) fail(`bundled node is ${bv}, need >= 22.15.0`);
log("bundled node", bv, "at", res.nodeBin);

// ---- 4. the sidecar's real spawn path, packaged env, clean PATH -------------------------
const dataDirHarness = path.join(tmp, "appdata-harness");
fs.mkdirSync(dataDirHarness, { recursive: true });
const harnessEnv = packagedHarnessEnv({ resourcesPath: resources, exists: (p) => fs.existsSync(p) });
const savedEnv = { ...process.env };
Object.assign(process.env, harnessEnv, { LOCALBOT_PACKAGED: "1", PATH: cleanPath, LOCALBOT_DATA_DIR: dataDirHarness });
delete process.env.NODE_OPTIONS;
const { HarnessProcess, findHarnessNode } = await import("../src/lib/harness/process.ts");
const found = findHarnessNode();
if (!found.ok) fail(`findHarnessNode (packaged): ${found.error}`);
if (found.source !== "explicit" || path.resolve(found.bin) !== path.resolve(res.nodeBin)) {
  fail(`findHarnessNode picked ${found.bin} (${found.source}); expected the bundled ${res.nodeBin}`);
}
log("findHarnessNode →", found.bin, found.version, `(${found.source})`);

const proc = new HarnessProcess({
  dataDir: dataDirHarness,
  llamaBaseUrl: "http://127.0.0.1:18789/v1",
  model: "local",
  modelName: "prove-packaged",
  hooks: { onSessionUpdate: () => {}, onRequestPermission: async () => ({ outcome: { outcome: "cancelled" } }) },
});
let init;
try {
  init = await proc.start();
} catch (err) {
  fail(`dsh did not start from the packaged tree: ${err instanceof Error ? err.message : String(err)}`);
}
const dshPid = proc.pid;
let dshExe = null;
if (process.platform === "linux" && dshPid) {
  try {
    dshExe = fs.readlinkSync(`/proc/${dshPid}/exe`);
  } catch {
    dshExe = null;
  }
}
if (proc.nodeBin !== res.nodeBin) fail(`HarnessProcess launched dsh with ${proc.nodeBin}`);
if (dshExe && fs.realpathSync(dshExe) !== fs.realpathSync(res.nodeBin)) fail(`dsh pid ${dshPid} exe is ${dshExe}, not the bundled node`);
const cmdline = process.platform === "linux" && dshPid ? fs.readFileSync(`/proc/${dshPid}/cmdline`, "utf8").split("\0").filter(Boolean) : [];
if (cmdline.length && !cmdline.some((a) => a.startsWith(res.modulesDir))) fail(`dsh cmdline does not use the bundled tree: ${cmdline.join(" ")}`);
log("dsh started: pid", dshPid, "exe", dshExe ?? "(n/a)", "agent", init.agentInfo?.name, init.agentInfo?.version ?? "");
log("dsh cmdline:", cmdline.length ? cmdline.join(" ") : "(n/a)");
await proc.stop();
Object.assign(process.env, savedEnv);
for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
if (!fs.existsSync(path.join(dataDirHarness, "dsh-home"))) fail("DSH_HOME was not created under the data dir");
log("dsh stopped; DSH_HOME at", path.join(dataDirHarness, "dsh-home"));

// ---- 5. launch the packaged Electron binary ---------------------------------------------
async function up(url, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return r;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
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
      let cmd = "";
      try {
        exe = fs.readlinkSync(`/proc/${c}/exe`);
        cmd = fs.readFileSync(`/proc/${c}/cmdline`, "utf8").split("\0").filter(Boolean).slice(0, 3).join(" ");
      } catch {
        /* gone */
      }
      out.push({ pid: c, exe, cmd });
      stack.push(c);
    }
  }
  return out;
}

if (flag("--no-launch")) {
  log("--no-launch: skipping the Electron window");
} else {
  if (await up(SIDECAR_URL, 500)) fail(`${SIDECAR_URL} is already answering — stop the other LocalBot first`);
  const home = path.join(tmp, "home");
  const xdgConfig = path.join(home, ".config");
  const appData = path.join(xdgConfig, "LocalBot");
  const work = path.join(tmp, "work");
  seedLocalBotData({
    dataDir: appData,
    folders: {
      employeeRoot: path.join(work, "employees/Sam"),
      employeeShared: path.join(work, "employees/Sam/shared"),
      departmentShared: path.join(work, "departments/Ops/shared"),
      companyShared: null,
    },
    agents: [{ name: "Writer" }, { name: "Editor", mascotId: "researcher" }],
    idPrefix: "prove",
  });
  const repoData = path.join(root, "data");
  const repoDataBefore = fs.existsSync(repoData) ? fs.readdirSync(repoData).sort().join(",") : null;

  const env = {
    PATH: cleanPath,
    HOME: home,
    XDG_CONFIG_HOME: xdgConfig,
    XDG_DATA_HOME: path.join(home, ".local/share"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    DISPLAY: process.env.DISPLAY ?? "",
    XAUTHORITY: process.env.XAUTHORITY || (fs.existsSync(xauthority) ? xauthority : ""),
    LANG: process.env.LANG ?? "C.UTF-8",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
  };
  fs.mkdirSync(env.XDG_DATA_HOME, { recursive: true });
  fs.mkdirSync(env.XDG_CACHE_HOME, { recursive: true });
  log("launching", exe, "(PATH has no node; HOME =", home + ")");
  const child = spawn(exe, ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"], { cwd: tmp, env, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (b) => {
    stderr += String(b);
  });
  child.stdout.on("data", () => {});
  let exited = null;
  child.on("exit", (code) => {
    exited = code;
  });

  const html = await up(SIDECAR_URL, 60000);
  if (!html) {
    child.kill("SIGKILL");
    fail(`sidecar never answered on ${SIDECAR_URL} (exit ${exited})\n${stderr.slice(-2000)}`);
  }
  const body = await html.text();
  if (!/LocalBot/.test(body)) fail("sidecar answered but the page is not LocalBot");
  log("sidecar up on", SIDECAR_URL, "— HTML", body.length, "bytes");

  await new Promise((r) => setTimeout(r, 3000));
  const tree = descendants(child.pid);
  for (const p of tree) log(`  pid ${p.pid}  exe ${p.exe ?? "?"}  ${p.cmd}`);
  const appReal = fs.realpathSync(appDir);
  const foreign = tree.filter((p) => p.exe && !fs.realpathSync(p.exe).startsWith(appReal));
  if (foreign.length) fail(`child processes outside the app dir: ${foreign.map((p) => p.exe).join(", ")}`);
  const hostNode = tree.filter((p) => /(^|\/)(node|npm|npx)(\.exe)?$/.test(p.exe ?? "") && !p.exe.startsWith(appReal));
  if (hostNode.length) fail(`a host node/npm is in the packaged spawn tree: ${hostNode.map((p) => p.exe).join(", ")}`);
  log("process tree: every executable is under the app dir; no host node/npm/npx");

  for (const sub of ["models", "bin"]) {
    if (!fs.existsSync(path.join(appData, sub))) fail(`packaged app did not create ${path.join(appData, sub)}`);
  }
  const repoDataAfter = fs.existsSync(repoData) ? fs.readdirSync(repoData).sort().join(",") : null;
  if (repoDataAfter !== repoDataBefore) fail("the packaged app touched the repo's data/ directory");
  log("AppData at", appData, "(models/, bin/ created); repo data/ untouched");

  child.kill("SIGTERM");
  const t0 = Date.now();
  while (exited === null && Date.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 200));
  if (exited === null) child.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 1000));
  if (await up(SIDECAR_URL, 1500)) fail("sidecar still answering after the app exited");
  const cfg = JSON.parse(fs.readFileSync(path.join(appData, "localbot-config.json"), "utf8"));
  for (const p of Object.values(cfg.folders)) {
    if (p && !fs.existsSync(p)) fail(`work folder ${p} vanished`);
  }
  fs.rmSync(appData, { recursive: true, force: true });
  for (const p of Object.values(cfg.folders)) {
    if (p && !fs.existsSync(p)) fail(`deleting AppData removed the work folder ${p}`);
  }
  log("app exited cleanly; deleting AppData left every work folder in place");
}

console.log(`STAGE8_PACKAGED_PASS node=${bv} app=${appInput}`);
