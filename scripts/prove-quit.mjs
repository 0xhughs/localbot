#!/usr/bin/env node
/**
 * Stage 18 prove-it: quit flush (run: `npm run prove:quit`).
 *
 * Static gates (always):
 *   - desktop/main.mjs: stopChildren() is called by nothing but the coordinator;
 *     before-quit holds the quit (preventDefault, quitReady) and window-all-closed /
 *     the first win.close() go through quitCoordinator.requestQuit; the timeout
 *     is QUIT_FLUSH_TIMEOUT_MS (2000), not a literal
 *   - desktop/preload.cjs exposes onFlushRequest / flushDone on the coordinator's
 *     IPC names; the Stage 17 token bridge is unchanged
 *   - src/lib/store.ts: flushChatSaves(): Promise<void> awaits pending + in-flight
 *     chatSave; chatSave / channelsAppend / host-index writes are tracked; pagehide
 *     is the bare-browser fallback only
 *   - the renderer flush cancels turns through harnessCancel (session/cancel) and
 *     finishes claimed routines as "stopped"; shell.tsx mounts it
 *   - chat.tsx keeps runAgentTurn; src/start.ts keeps the token middleware;
 *     dsh / ACP pins exact; dsh/localbot-fs.mjs sha256
 *
 * Live gate 1 (skip with --static): the real coordinator drives a real child
 * process that writes its file 300 ms after being asked to flush.
 *   - with the handshake: the file exists at the moment stopChildren() kills
 *     the child; the order is requestFlush → ack → stopChildren → quit
 *   - the counter-example (what main.mjs did before Stage 18): kill right after
 *     asking → the file is missing
 *   - a child that never acks: the coordinator proceeds after 2000 ms, no hang
 *
 * Live gate 2 (skip with --static or --no-electron; UNVERIFIED when there is no
 * electron binary): dev Electron (`desktop/main.mjs`, main spawns `npm run dev`)
 * against a temp LOCALBOT_DATA_DIR. In the setup chat a line is typed and
 * within the 400 ms chat debounce the app is told to quit — once through the
 * title-bar X (`window.localbotDesktop.close()` → win.close()), once through
 * `app.quit()` (Cmd+Q). Pass: main logs "renderer flushed", the process exits
 * within 15 s, and `{dataDir}/chats/{id}.json` contains the typed line.
 * The packaged .app is not launched here — it stays UNVERIFIED.
 *
 * Usage:
 *   npm run prove:quit
 *   npm run prove:quit -- --static
 *   npm run prove:quit -- --no-electron
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createQuitCoordinator, FLUSH_DONE_CHANNEL, FLUSH_REQUEST_CHANNEL, QUIT_FLUSH_TIMEOUT_MS } from "../desktop/quit-flush.mjs";
import { seedLocalBotData } from "./seed-localbot-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const log = (...a) => console.log("[prove-quit]", ...a);
const fail = (msg) => {
  console.error("[prove-quit] FAIL:", msg);
  process.exit(1);
};
const gate = (ok, msg) => {
  if (!ok) fail(msg);
  log("ok:", msg);
};
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const code = (src) => src.replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/[^\n"'`]*$/gm, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOCALBOT_FS_SHA256 = "0bb5593abecbc116a7b3c614882cfc109831e88c45b735962ce14ef904c2b0a6";

// ---- 0. static gates -------------------------------------------------------
const electronOnly = flag("--electron-only");
if (!electronOnly) {
  const main = code(read("desktop/main.mjs"));
  const calls = main.match(/\bstopChildren\(\)/g) ?? [];
  gate(calls.length === 1 && /function stopChildren\(\) \{/.test(main), "main.mjs: stopChildren() is called by nothing but the coordinator");
  const bq = main.match(/app\.on\("before-quit", \(event\) => \{([\s\S]*?)\n\}\);/);
  gate(
    bq && /if \(quitReady\) return;/.test(bq[1]) && /event\.preventDefault\(\);/.test(bq[1]) && /quitCoordinator\.requestQuit\("before-quit"\)/.test(bq[1]) && !/stopChildren|app\.quit\(\)/.test(bq[1]),
    "main.mjs: before-quit holds the quit (preventDefault + quitReady) and asks the coordinator; no stopChildren / app.quit of its own",
  );
  const wac = main.match(/app\.on\("window-all-closed", \(\) => \{([\s\S]*?)\n\}\);/);
  gate(wac && /quitCoordinator\.requestQuit\("window-all-closed"\)/.test(wac[1]) && !/stopChildren|app\.quit\(\)/.test(wac[1]), "main.mjs: window-all-closed joins the coordinator");
  const close = main.match(/win\.on\("close", \(event\) => \{([\s\S]*?)\n {2}\}\);/);
  gate(
    close && /if \(quitReady\) return;/.test(close[1]) && /event\.preventDefault\(\);/.test(close[1]) && /quitCoordinator\.requestQuit\("window-close"\)/.test(close[1]),
    "main.mjs: the first win.close() (title-bar X / Cmd+W) is held for the flush",
  );
  gate(
    /const quitCoordinator = createQuitCoordinator\(\{[\s\S]*?requestFlush: requestRendererFlush,\s*stopChildren,\s*quit: \(\) => \{\s*quitReady = true;\s*app\.quit\(\);\s*\},\s*timeoutMs: QUIT_FLUSH_TIMEOUT_MS,/.test(main) && !/timeoutMs:\s*\d/.test(main),
    `main.mjs: coordinator built with stopChildren, a quitReady quit and QUIT_FLUSH_TIMEOUT_MS (${QUIT_FLUSH_TIMEOUT_MS} ms)`,
  );
  gate(/ipcMain\.on\(FLUSH_DONE_CHANNEL, \(_e, summary\) => \{\s*quitCoordinator\.flushDone\(summary\);/.test(main), "main.mjs: flushDone IPC feeds the coordinator");
  gate(QUIT_FLUSH_TIMEOUT_MS === 2000, "coordinator default timeout is 2000 ms");

  const preload = read("desktop/preload.cjs");
  gate(
    /onFlushRequest: \(fn\) => \{[\s\S]*?ipcRenderer\.on\("localbot:flush", wrap\);/.test(preload) && /flushDone: \(summary\) => ipcRenderer\.send\("localbot:flushDone", summary\)/.test(preload),
    "preload.cjs: onFlushRequest / flushDone on the coordinator's IPC names",
  );
  gate(preload.includes(`"${FLUSH_REQUEST_CHANNEL}"`) && preload.includes(`"${FLUSH_DONE_CHANNEL}"`), "preload.cjs and quit-flush.mjs agree on the channel names");
  gate(
    /const SIDECAR_TOKEN_ARG = "--localbot-sidecar-token=";/.test(preload) && /\n {2}sidecarToken,/.test(preload) && !/^\s*import\s/m.test(preload),
    "preload.cjs: Stage 17 token bridge unchanged (argv only, CJS)",
  );

  const store = read("src/lib/store.ts");
  gate(/export async function flushChatSaves\(\): Promise<void> \{/.test(store) && !/export function flushChatSaves\(\): void/.test(store), "store.ts: flushChatSaves(): Promise<void> (was void)");
  gate(/for \(const p of chatSavesInFlight\) waits\.push\(p\);\s*await Promise\.allSettled\(waits\);/.test(store), "store.ts: flushChatSaves awaits the debounced and the in-flight chatSave calls");
  for (const fn of ["chatSave", "channelsAppend", "statePatchAgent", "statePatchIndex", "sectionCreate", "sectionRename", "sectionDelete", "stateMigrate", "stateReset"]) {
    gate(new RegExp(`^const ${fn} = tracked\\(${fn}Fn\\);$`, "m").test(store), `store.ts: ${fn} is tracked (pending-writes)`);
  }
  gate(
    /window\.addEventListener\("pagehide", \(\) => \{\s*if \(typeof window\.localbotDesktop\?\.onFlushRequest === "function"\) return;\s*void flushChatSaves\(\);/.test(store) && !/keepalive/.test(store),
    "store.ts: pagehide is the bare-browser fallback only; no keepalive fetch stands in for the handshake",
  );

  const qf = read("src/lib/quit-flush.ts");
  gate(/cancelTurns: cancelInFlightTurns,/.test(qf) && /routinesFinish\(\{ data: \{ id: r\.id, status: "stopped", error: null \} \}\)/.test(qf) && /flushChats: flushChatSaves,/.test(qf) && /otherWrites: pendingWrites,/.test(qf), "quit-flush.ts: cancel turns (session/cancel), routinesFinish stopped, flushChatSaves, tracked writes");
  const adapter = read("src/runtime/harnessAdapter.ts");
  gate(/const forgetTurn = registerTurn\(\{ turnId, botId: opts\.botId, cancel: onAbort \}\);/.test(adapter) && /void harnessCancel\(\{ data: \{ turnId \} \}\);/.test(adapter), "harnessAdapter.ts: every runAgentTurn registers its session/cancel");
  gate(/const forgetClaim = registerRoutineClaim\(\{ id, agentId: due\.agentId \}\);/.test(read("src/runtime/routineRunner.ts")), "routineRunner.ts: claimed routines are registered until routinesFinish");
  gate(/useEffect\(\(\) => installQuitFlush\(\), \[\]\);/.test(read("src/components/localbot/shell.tsx")), "shell.tsx mounts installQuitFlush");

  const chat = read("src/components/localbot/chat.tsx");
  gate(/import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/.test(chat) && /await runAgentTurn\(\{/.test(chat), "chat.tsx keeps runAgentTurn");
  gate(/functionMiddleware: \[sidecarTokenMiddleware\]/.test(read("src/start.ts")), "src/start.ts keeps the Stage 17 token gate as global functionMiddleware");
  const pkg = JSON.parse(read("package.json"));
  gate(pkg.dependencies["@deepseek-ai/dsh"] === "0.1.2-alpha.5", "dsh pin is exact 0.1.2-alpha.5");
  gate(pkg.dependencies["@agentclientprotocol/sdk"] === "1.4.0", "ACP SDK pin is exact 1.4.0");
  gate(createHash("sha256").update(read("dsh/localbot-fs.mjs")).digest("hex") === LOCALBOT_FS_SHA256, "dsh/localbot-fs.mjs unchanged (sha256 pin)");
  gate(/src\/lib\/quit-flush\.test\.ts/.test(pkg.scripts.test), "npm test runs src/lib/quit-flush.test.ts");
}

if (flag("--static")) {
  console.log("STAGE18_QUIT_PASS static");
  process.exit(0);
}

// ---- 1. live: the coordinator and a child that delays its write ------------------
// The child stands in for the sidecar: it holds a write until asked to flush,
// takes 300 ms to land it (temp + rename, like atomicWriteJson) and then acks.
const CHILD = `
  import fs from "node:fs";
  const file = process.argv[1];
  const mode = process.argv[2]; // "ack" | "silent"
  process.stdout.write("ready\\n");
  let buf = "";
  process.stdin.on("data", (d) => {
    buf += String(d);
    if (!buf.includes("flush")) return;
    buf = "";
    setTimeout(() => {
      fs.writeFileSync(file + ".tmp", JSON.stringify({ flushed: true, at: Date.now() }));
      fs.renameSync(file + ".tmp", file);
      if (mode === "ack") process.stdout.write("done\\n");
    }, 300);
  });
  process.stdin.resume();
`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-prove-quit-"));
const cleanups = [];
process.on("exit", () => {
  for (const fn of cleanups.reverse()) {
    try {
      fn();
    } catch {
      /* best effort */
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

function spawnChild(file, mode) {
  const child = spawn(process.execPath, ["--input-type=module", "-e", CHILD, file, mode], { stdio: ["pipe", "pipe", "inherit"] });
  cleanups.push(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      /* gone */
    }
  });
  const exited = new Promise((r) => child.on("exit", (code, sig) => r({ code, sig })));
  const lines = [];
  const waiters = [];
  child.stdout.on("data", (d) => {
    for (const line of String(d).split("\n").filter(Boolean)) {
      lines.push(line);
      for (const w of [...waiters]) w();
    }
  });
  const waitFor = (line, ms) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`child never printed ${line}`)), ms);
      const check = () => {
        if (lines.includes(line)) {
          clearTimeout(t);
          resolve(true);
        }
      };
      waiters.push(check);
      check();
    });
  return { child, exited, waitFor, onLine: (fn) => waiters.push(() => fn(lines[lines.length - 1])) };
}

async function driveCoordinator({ mode, timeoutMs, label }) {
  const file = path.join(tmp, `${label}.json`);
  const c = spawnChild(file, mode);
  await c.waitFor("ready", 10000);
  const order = [];
  let fileAtKill = null;
  const co = createQuitCoordinator({
    requestFlush: (reason) => {
      order.push(`requestFlush:${reason}`);
      c.child.stdin.write("flush\n");
      return true;
    },
    stopChildren: () => {
      fileAtKill = fs.existsSync(file);
      order.push(`stopChildren(file ${fileAtKill ? "present" : "MISSING"})`);
      c.child.kill();
    },
    quit: (o) => order.push(`quit(${o.acked ? "acked" : o.timedOut ? "timed out" : "unasked"} after ${o.waitedMs} ms)`),
    timeoutMs,
    log: (line) => log("  coordinator:", line),
  });
  c.onLine((line) => {
    if (line === "done") {
      order.push("ack");
      co.flushDone({ from: "child" });
    }
  });
  const t0 = Date.now();
  const outcome = await co.requestQuit("window-close");
  const exit = await Promise.race([c.exited, sleep(5000).then(() => null)]);
  return { order, outcome, fileAtKill, exit, elapsed: Date.now() - t0 };
}

if (!electronOnly) {
  // (a) the handshake: ack before kill, file on disk at kill time
  const a = await driveCoordinator({ mode: "ack", timeoutMs: QUIT_FLUSH_TIMEOUT_MS, label: "handshake" });
  log("  order:", a.order.join(" → "));
  gate(a.fileAtKill === true, "live: with the handshake the child's file is on disk when stopChildren() runs");
  gate(a.order[0].startsWith("requestFlush") && a.order[1] === "ack" && a.order[2].startsWith("stopChildren") && a.order[3].startsWith("quit"), "live: order is requestFlush → ack → stopChildren → quit");
  gate(a.outcome.acked && !a.outcome.timedOut && a.outcome.waitedMs >= 250 && a.outcome.waitedMs < QUIT_FLUSH_TIMEOUT_MS, `live: the coordinator waited for the ack (${a.outcome.waitedMs} ms), not for the timeout`);
  gate(a.exit !== null, "live: the child was killed after the ack (exited)");

  // (b) the counter-example: what before-quit did before Stage 18 (ask, then kill at once)
  const file = path.join(tmp, "no-handshake.json");
  const c = spawnChild(file, "ack");
  await c.waitFor("ready", 10000);
  c.child.stdin.write("flush\n");
  c.child.kill();
  await Promise.race([c.exited, sleep(5000)]);
  await sleep(400);
  gate(!fs.existsSync(file), "live: the counter-example (kill right after asking, the pre-Stage-18 order) loses the write — that was the bug");

  // (c) a renderer that never acks: bounded by 2000 ms, then the child is still killed
  const s = await driveCoordinator({ mode: "silent", timeoutMs: QUIT_FLUSH_TIMEOUT_MS, label: "silent" });
  log("  order:", s.order.join(" → "));
  gate(s.outcome.timedOut && !s.outcome.acked && s.outcome.waitedMs >= QUIT_FLUSH_TIMEOUT_MS - 20 && s.elapsed < QUIT_FLUSH_TIMEOUT_MS + 1500, `live: no ack → stopChildren after ${s.outcome.waitedMs} ms (bounded by ${QUIT_FLUSH_TIMEOUT_MS}), no hang`);
  gate(s.exit !== null, "live: the silent child was still killed");
}

if (flag("--no-electron")) {
  console.log("STAGE18_QUIT_PASS static+live coordinator/child-file-before-kill/counter-example/2s-bound (electron skipped)");
  process.exit(0);
}

// ---- 2. live: dev Electron, quit during the chat debounce --------------------------
let electronBin = null;
try {
  electronBin = require("electron");
  if (!fs.existsSync(electronBin)) electronBin = null;
} catch {
  electronBin = null;
}
if (!electronBin) {
  log("UNVERIFIED: no electron binary in node_modules — the Electron quit-during-debounce gate did not run");
  console.log("STAGE18_QUIT_PASS static+live coordinator/child-file-before-kill/counter-example/2s-bound electron=UNVERIFIED");
  process.exit(0);
}

if (process.platform === "linux" && !process.env.DISPLAY && !flag("--in-xvfb")) {
  // No display: re-run this gate under xvfb-run when it exists.
  const xvfb = ["/usr/bin/xvfb-run", "/usr/local/bin/xvfb-run"].find((p) => fs.existsSync(p));
  if (!xvfb) {
    log("UNVERIFIED: no DISPLAY and no xvfb-run — the Electron quit-during-debounce gate did not run");
    console.log("STAGE18_QUIT_PASS static+live coordinator/child-file-before-kill/counter-example/2s-bound electron=UNVERIFIED");
    process.exit(0);
  }
  log("no DISPLAY — re-running the Electron gate under", xvfb);
  const r = spawn(xvfb, ["-a", "-s", "-screen 0 1400x900x24", process.execPath, ...process.execArgv, fileURLToPath(import.meta.url), ...args, "--in-xvfb", "--electron-only"], { stdio: "inherit" });
  const codeOut = await new Promise((res) => r.on("exit", (c) => res(c ?? 1)));
  process.exit(codeOut);
}

async function up(url, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (r.ok || r.status < 500) return true;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  return false;
}

/** Pids (not ours) whose environment carries this LOCALBOT_DATA_DIR — the npm → vite tree main spawned. */
function pidsForDataDir(dataDir) {
  const out = [];
  for (const d of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(d) || Number(d) === process.pid) continue;
    try {
      const env = fs.readFileSync(`/proc/${d}/environ`, "latin1");
      if (env.includes(`LOCALBOT_DATA_DIR=${dataDir}\0`)) out.push(Number(d));
    } catch {
      /* not ours / gone */
    }
  }
  return out;
}

async function reapDevServer(dataDir) {
  // Pre-existing (not Stage 18): main kills the `npm` it spawned, and the vite
  // underneath may outlive it. The proof reaps by pid so the next scenario's
  // main starts a fresh dev server on its own data dir.
  for (let i = 0; i < 20; i++) {
    const pids = pidsForDataDir(dataDir);
    if (pids.length === 0 && !(await up("http://127.0.0.1:8080/", 300))) return true;
    for (const pid of pids) {
      try {
        process.kill(pid, i < 10 ? "SIGTERM" : "SIGKILL");
      } catch {
        /* gone */
      }
    }
    await sleep(500);
  }
  return !(await up("http://127.0.0.1:8080/", 300));
}

const { _electron } = await import("playwright");

async function quitScenario({ label, quitVia }) {
  const dataDir = path.join(tmp, `data-${label}`);
  const work = path.join(tmp, `work-${label}`);
  seedLocalBotData({
    dataDir,
    folders: { employeeRoot: path.join(work, "employees/Sam"), employeeShared: null, departmentShared: path.join(work, "departments/Ops/shared"), companyShared: null },
    agents: [
      { name: "Writer", job: "Drafts launch briefs" },
      { name: "Editor", job: "Copy edits and tone" },
    ],
    idPrefix: `quit${label}`,
  });
  if (await up("http://127.0.0.1:8080/", 500)) fail("127.0.0.1:8080 already answering — stop the other npm run dev first (the proof needs vite on its own LOCALBOT_DATA_DIR)");
  const env = { ...process.env, LOCALBOT_DATA_DIR: dataDir, BROWSER: "none" };
  delete env.ELECTRON_RUN_AS_NODE;
  log(`[${label}] dev Electron`, electronBin, "| LOCALBOT_DATA_DIR", dataDir);
  const electronApp = await _electron.launch({ executablePath: electronBin, args: [path.join(root, "desktop/main.mjs")], cwd: root, env, timeout: 180000 });
  const proc = electronApp.process();
  const pid = proc.pid;
  cleanups.push(() => {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* gone */
    }
  });
  cleanups.push(() => {
    for (const p of pidsForDataDir(dataDir)) {
      try {
        process.kill(p, "SIGKILL");
      } catch {
        /* gone */
      }
    }
  });
  const mainLog = [];
  proc.stderr?.on("data", (d) => {
    for (const line of String(d).split("\n")) if (/^\[quit\]/.test(line.trim())) mainLog.push(line.trim());
  });
  const exited = new Promise((r) => proc.on("exit", (c, s) => r({ code: c, signal: s })));

  const page = await electronApp.firstWindow({ timeout: 180000 });
  await page.getByTestId("sidebar").waitFor({ timeout: 180000 });
  const bridge = await page.evaluate(() => ({
    onFlushRequest: typeof window.localbotDesktop?.onFlushRequest,
    flushDone: typeof window.localbotDesktop?.flushDone,
    token: typeof window.localbotDesktop?.sidecarToken === "string" && /^[0-9a-f]{64}$/.test(window.localbotDesktop.sidecarToken),
  }));
  gate(bridge.onFlushRequest === "function" && bridge.flushDone === "function", `[${label}] the window's bridge has onFlushRequest / flushDone`);
  gate(bridge.token, `[${label}] the Stage 17 token still reaches the window through preload argv`);

  // A setup chat: + New agent → the composer's first answer is appended with no Harness turn.
  await page.getByTestId("new-agent").click();
  await page.locator('[data-testid="chat-pane"][data-setup="true"]').waitFor({ timeout: 30000 });
  const index0 = JSON.parse(fs.readFileSync(path.join(dataDir, "localbot-agents.json"), "utf8"));
  const row = index0.agents.find((a) => a.name === "New agent");
  gate(Boolean(row), `[${label}] agents/New agent/ has a host-index row (agentEnsure ran)`);
  const chatFile = path.join(dataDir, "chats", `${row.id}.json`);
  const line = `Quitter${label}`;
  const composer = page.getByTestId("composer");
  await composer.fill(line);
  await composer.press("Enter");
  await page.getByText(line, { exact: true }).first().waitFor({ timeout: 5000 });
  const tTyped = Date.now();
  const pendingAtQuit = !(fs.existsSync(chatFile) && fs.readFileSync(chatFile, "utf8").includes(line));
  if (quitVia === "close") {
    await page.evaluate(() => window.localbotDesktop.close());
  } else {
    await electronApp.evaluate(({ app }) => app.quit());
  }
  const tQuit = Date.now();
  log(`[${label}] typed → ${quitVia === "close" ? "title-bar X (win.close)" : "app.quit() (Cmd+Q)"} in ${tQuit - tTyped} ms; chat file ${pendingAtQuit ? "did NOT yet have the line (debounce pending)" : "already had the line"}`);
  const exit = await Promise.race([exited, sleep(15000).then(() => null)]);
  gate(exit !== null, `[${label}] Electron exited on its own within 15 s (code ${exit?.code ?? "?"}, signal ${exit?.signal ?? "none"})`);
  const flushed = mainLog.find((l) => /renderer flushed in \d+ ms/.test(l));
  log(`[${label}] main log:`, mainLog.join(" | ") || "(none)");
  gate(Boolean(flushed), `[${label}] main waited for the renderer's flushDone before stopping children (${flushed ?? "no '[quit] … renderer flushed' line"})`);
  gate(!mainLog.some((l) => /no flush ack/.test(l)), `[${label}] main did not fall back to the 2 s timeout`);
  const saved = fs.existsSync(chatFile) ? JSON.parse(fs.readFileSync(chatFile, "utf8")) : null;
  gate(saved && saved.messages.some((m) => m.role === "user" && m.content === line), `[${label}] chats/${row.id}.json holds the line typed ${tQuit - tTyped} ms before quit${pendingAtQuit ? " (it was still debounced when quit was requested)" : ""}`);
  const index1 = JSON.parse(fs.readFileSync(path.join(dataDir, "localbot-agents.json"), "utf8"));
  gate(index1.version === 1 && index1.agents.length === index0.agents.length, `[${label}] localbot-agents.json intact after quit`);
  gate(await reapDevServer(dataDir), `[${label}] dev server tree reaped; :8080 free for the next scenario`);
  return { pendingAtQuit, flushed, ms: tQuit - tTyped };
}

const a = await quitScenario({ label: "X", quitVia: "close" });
const b = await quitScenario({ label: "Q", quitVia: "app.quit" });
console.log(
  `STAGE18_QUIT_PASS static+live coordinator/child-file-before-kill/counter-example/2s-bound electron=dev-window close=${a.pendingAtQuit ? "debounce-pending" : "already-saved"}/${a.ms}ms cmdq=${b.pendingAtQuit ? "debounce-pending" : "already-saved"}/${b.ms}ms packaged=UNVERIFIED`,
);
process.exit(0);
