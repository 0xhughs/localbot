#!/usr/bin/env node
/**
 * Stage 13 prove-it: click-to-toggle mic (run: `npm run prove:mic`).
 *
 * Static gates (always):
 *   - chat.tsx: the Mic button carries data-voice-gesture="toggle", its aria-label
 *     follows the state through micAriaLabel (never "Hold to talk"), the press /
 *     release go through micPress / micRelease, a keyboard click toggles, no
 *     pointer capture turns a click back into a hold, a live timer is rendered
 *   - use-voice-input.ts: toggle(), elapsedSeconds, Escape → cancel(), the 60 s
 *     cap → stop(); still no send / runAgentTurn / appendMessage
 *   - mic-capture.ts: onCap fires once at the cap
 *   - chat.tsx keeps runAgentTurn; the dsh / ACP pins are exact
 *
 * Live gates (skip with --static): dev Electron + Playwright against a temp
 * LOCALBOT_DATA_DIR seeded with one agent. Chromium's fake microphone is fed
 * whisper.cpp's jfk.wav (`--use-fake-device-for-media-stream
 * --use-file-for-fake-audio-capture=<jfk.wav>`, looped), so no speaker → mic
 * loop and no TCC prompt are needed. whisper-cli and ggml-base.en.bin are the
 * ones `npm run build:whisper-mac` / first use put in the real AppData; they are
 * linked (read-only) into the temp data dir. The engine is the real one:
 * sttTranscribe → transcribeWav → whisper-cli, exactly as in the app.
 *   1. one click → data-voice-state=listening, aria-label "Stop listening",
 *      the header reads "Listening 0:0N" and data-elapsed-seconds counts up.
 *      If the mic is back to idle within 2 s of that single click, the control
 *      still requires a hold → FAIL (hold-only).
 *   2. a second click (≥ 12 s later, one full pass of the 11 s fixture) →
 *      transcribing → idle; the composer contains the JFK phrase; zero messages
 *      were sent; the clip dir is empty.
 *   3. Escape: click → listening → Escape → idle, composer unchanged, note
 *      "Cancelled", nothing sent.
 *   4. hold fallback: press for 3 s, release → a transcript is appended.
 *   5. --cap: one click, no second click; after 60 s the mic stops on its own,
 *      transcribes, and the note says "Heard 60.0 s".
 *
 * Usage:
 *   npm run prove:mic                 # dev Electron; starts vite on :8080
 *   npm run prove:mic -- --static     # static gates only
 *   npm run prove:mic -- --cap        # also run the 60 s cap gate (adds ~65 s)
 *   npm run prove:mic -- --app-data <dir>   # where whisper-cli + models live (default: ~/Library/Application Support/LocalBot, or $XDG_CONFIG_HOME/LocalBot)
 *   npm run prove:mic -- --screenshot /tmp/stage13.png
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { seedLocalBotData } from "./seed-localbot-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const log = (...a) => console.log("[prove-mic]", ...a);
const fail = (msg) => {
  console.error("[prove-mic] FAIL:", msg);
  process.exit(1);
};
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const JFK_PHRASE = "ask not what your country can do for you";
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// ---- 0. static gates -------------------------------------------------------
const pkg = JSON.parse(read("package.json"));
const chat = read("src/components/localbot/chat.tsx");
const hook = read("src/components/localbot/use-voice-input.ts");
const mic = read("src/lib/audio/mic-capture.ts");
const catalog = JSON.parse(read("catalog/whisper-assets.json"));
const micButton = /<Button[^>]*data-testid="mic-button"[\s\S]*?<\/Button>/.exec(chat)?.[0] ?? "";

if (!micButton) fail("chat.tsx has no data-testid=\"mic-button\"");
if (!/data-voice-gesture="toggle"/.test(micButton)) fail("the Mic button is not marked as a toggle (data-voice-gesture=\"toggle\") — hold-only control");
if (!/aria-label=\{micAriaLabel\(voice\.state\)\}/.test(micButton)) fail("the Mic aria-label does not follow the state (start/stop)");
if (/Hold to talk/.test(micButton)) fail("the Mic button still says \"Hold to talk\"");
if (!/micPress\(voice\.state, Date\.now\(\)\)/.test(micButton) || !/micRelease\(micPressRef\.current, Date\.now\(\)\)/.test(micButton)) fail("the Mic press/release do not go through micPress/micRelease (the tested click-vs-hold rules)");
if (!/if \(e\.detail === 0\) voice\.toggle\(\);/.test(micButton)) fail("a keyboard click on the Mic does not toggle");
if (/setPointerCapture|onLostPointerCapture/.test(micButton)) fail("pointer capture on the Mic would stop the mic when a click releases (hold-only)");
if (!/data-elapsed-seconds=/.test(micButton) || !/data-testid="voice-timer"/.test(chat)) fail("no live timer on the Mic");
if (!/Listening \$\{formatTimer\(voice\.elapsedSeconds\)\}/.test(chat)) fail("the header does not show the listening timer");
if (!/toggle: \(\) => void;/.test(hook)) fail("use-voice-input.ts has no toggle()");
if (!/startMicCapture\(\{ onCap: \(\) => stop\(\) \}\)/.test(hook)) fail("the 60 s cap does not call stop() — the employee would get no transcript");
if (!/e\.key !== "Escape"\) return;[\s\S]*?cancel\(\);/.test(hook)) fail("Escape does not cancel while listening");
if (!/if \(r\.reachedCap && !capFired\) \{[\s\S]*?opts\.onCap\?\.\(\);/.test(mic)) fail("mic-capture.ts does not fire onCap at the cap");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
if (/\bsend\(|runAgentTurn|appendMessage/.test(strip(hook))) fail("the voice hook gained a send path");
if (/\bsend\(|runAgentTurn|appendMessage/.test(micButton)) fail("the Mic button sends");
if (!/import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/.test(chat) || !/await runAgentTurn\(\{/.test(chat)) fail("chat.tsx dropped runAgentTurn");
const { DSH_PIN, ACP_SDK_PIN } = await import("../src/lib/harness/process.ts");
if (pkg.dependencies["@deepseek-ai/dsh"] !== DSH_PIN || !/^\d/.test(DSH_PIN)) fail("dsh pin floats");
if (pkg.dependencies["@agentclientprotocol/sdk"] !== ACP_SDK_PIN || !/^\d/.test(ACP_SDK_PIN)) fail("ACP pin floats");
log("static gates ok: Mic is a toggle (micPress/micRelease, aria start/stop, keyboard toggle, no pointer capture) | timer | Escape → cancel | cap → stop() | no send path | runAgentTurn kept | dsh", DSH_PIN);

if (flag("--static")) {
  console.log("STAGE13_MIC_TOGGLE_STATIC_PASS");
  process.exit(0);
}

// ---- 1. the real whisper install + fixture ----------------------------------
const defaultAppData =
  process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Application Support", "LocalBot")
    : path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "LocalBot");
const appData = path.resolve(opt("--app-data") ?? defaultAppData);
const target = `${process.platform}-${process.arch}`;
const whisperSrc = path.join(appData, "bin", target, "whisper");
const whisperCli = path.join(whisperSrc, process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli");
const modelsSrc = path.join(appData, "models", "whisper");
const modelFile = path.join(modelsSrc, catalog.models[catalog.defaultModel].filename);
if (!catalog.targets[target]) fail(`catalog/whisper-assets.json has no ${target} row: voice input is NOT BUILT on this host`);
if (!fs.existsSync(whisperCli)) fail(`whisper-cli NOT BUILT at ${whisperCli} — run: ${catalog.targets[target].build ?? "npm run prove:stt (downloads it)"}`);
if (!fs.existsSync(modelFile)) fail(`whisper model missing at ${modelFile} — run npm run prove:stt -- --data-dir ${JSON.stringify(appData)} once to download it`);
const wav = path.join(appData, "fixtures", catalog.fixture.filename);
if (!fs.existsSync(wav) || sha256(wav) !== catalog.fixture.sha256) {
  fs.mkdirSync(path.dirname(wav), { recursive: true });
  const r = await fetch(catalog.fixture.url, { redirect: "follow" });
  if (!r.ok) fail(`fixture download ${r.status}`);
  fs.writeFileSync(wav, Buffer.from(await r.arrayBuffer()));
  if (sha256(wav) !== catalog.fixture.sha256) fail("fixture sha256 mismatch");
}
log(`whisper-cli ${whisperCli} | model ${path.basename(modelFile)} | fake mic plays ${wav} (sha256 ok, looped)`);

// ---- 2. temp data dir with the whisper install linked in ---------------------
const { _electron } = await import("playwright");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-prove-mic-"));
const work = path.join(tmp, "work");
const dataDir = path.join(tmp, "data");
const employeeRoot = path.join(work, "employees/Sam");
const cleanup = [];
process.on("exit", () => {
  for (const fn of cleanup.reverse()) {
    try {
      fn();
    } catch {
      /* best effort */
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});
seedLocalBotData({
  dataDir,
  folders: { employeeRoot, employeeShared: null, departmentShared: path.join(work, "departments/Ops/shared"), companyShared: null },
  agents: [{ name: "Writer", job: "Drafts launch briefs", color: "clay", mascotId: "writer" }],
  idPrefix: "mic",
});
// bin/{target}/whisper and models/whisper point at the real install (read-only use: verify + spawn).
fs.mkdirSync(path.join(dataDir, "bin", target), { recursive: true });
fs.symlinkSync(whisperSrc, path.join(dataDir, "bin", target, "whisper"), "dir");
fs.mkdirSync(path.join(dataDir, "models"), { recursive: true });
fs.symlinkSync(modelsSrc, path.join(dataDir, "models", "whisper"), "dir");
const clipDir = path.join(dataDir, "stt");

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
if (await up("http://127.0.0.1:8080/", 500)) fail("127.0.0.1:8080 already answering — stop the other npm run dev first (the proof needs vite on its own LOCALBOT_DATA_DIR)");
const electronBin = require("electron");
const env = { ...process.env, LOCALBOT_DATA_DIR: dataDir, BROWSER: "none" };
delete env.ELECTRON_RUN_AS_NODE;
log("dev Electron", electronBin, "| LOCALBOT_DATA_DIR", dataDir);
// Chromium's fake capture device reads the WAV in the audio service; that
// service is sandboxed out of process and then cannot open the file (measured:
// all-zero samples). In-process for this proof only; the app itself is unchanged.
const fakeWav = path.join(tmp, "jfk.wav");
fs.copyFileSync(wav, fakeWav);
const electronApp = await _electron.launch({
  executablePath: electronBin,
  // Chromium's fake capture device reads this WAV in a loop instead of opening a real microphone.
  args: [
    path.join(root, "desktop/main.mjs"),
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${fakeWav}`,
    "--disable-features=AudioServiceOutOfProcess,AudioServiceSandbox",
  ],
  cwd: root,
  env,
  timeout: 180000,
});
const pid = electronApp.process().pid;
cleanup.push(() => {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* gone */
  }
});
electronApp.process().stderr?.on("data", (d) => {
  const t = String(d);
  if (/preload|Unable to load|ERR_/i.test(t)) process.stderr.write("[electron] " + t);
});
const page = await electronApp.firstWindow({ timeout: 180000 });
await page.getByTestId("sidebar").waitFor({ timeout: 180000 });

const row = page.locator('[data-testid="roster-row"]', { has: page.locator("span.truncate.text-sm.font-medium", { hasText: /^Writer$/ }) }).first();
await row.waitFor({ timeout: 30000 });
await row.locator("button").first().click();
const box = page.getByPlaceholder(/Message /);
await box.waitFor({ timeout: 30000 });
const micBtn = page.getByTestId("mic-button");
await micBtn.waitFor({ timeout: 30000 });
const deadline = Date.now() + 30000;
while (Date.now() < deadline && (await micBtn.isDisabled())) await page.waitForTimeout(250);
if (await micBtn.isDisabled()) fail(`Mic button stays disabled: ${await micBtn.getAttribute("title")}`);
if ((await micBtn.getAttribute("data-voice-gesture")) !== "toggle") fail("mic-button is not a toggle control");
if ((await micBtn.getAttribute("aria-label")) !== "Start voice input") fail(`idle aria-label is ${JSON.stringify(await micBtn.getAttribute("aria-label"))}`);
log("Mic enabled:", await micBtn.getAttribute("title"));

const state = () => micBtn.getAttribute("data-voice-state");
const note = async () => (await page.getByTestId("voice-note").textContent().catch(() => "")) ?? "";
const sentCount = () => page.locator("li[data-role='user']").count();
const waitState = async (want, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await state()) === want) return true;
    await page.waitForTimeout(100);
  }
  return false;
};
const waitIdleWithNote = async (ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const n = await note();
    if ((await state()) === "idle" && n) return n;
    await page.waitForTimeout(250);
  }
  return null;
};

// ---- 3. click → listening (+ timer); a click must not release into a stop ------
await box.fill("");
const sent0 = await sentCount();
await micBtn.click();
if (!(await waitState("listening", 5000))) fail(`first click did not start listening: ${await state()} · ${await note()}`);
if ((await micBtn.getAttribute("aria-label")) !== "Stop listening") fail(`listening aria-label is ${JSON.stringify(await micBtn.getAttribute("aria-label"))}`);
await page.waitForTimeout(2200);
if ((await state()) !== "listening") fail(`the mic went back to ${await state()} 2 s after a single click — the control still requires a hold (hold-only); note: ${await note()}`);
const elapsed2 = Number(await micBtn.getAttribute("data-elapsed-seconds"));
const header = (await page.getByTestId("voice-state").textContent().catch(() => "")) ?? "";
const timerText = (await page.getByTestId("voice-timer").textContent().catch(() => "")) ?? "";
if (!(elapsed2 >= 2 && elapsed2 <= 4)) fail(`timer is not counting: data-elapsed-seconds=${elapsed2} after ~2.2 s`);
if (!/^Listening \d:\d\d$/.test(header.trim())) fail(`header does not show "Listening m:ss": ${JSON.stringify(header)}`);
if (!/^\d:\d\d$/.test(timerText.trim())) fail(`no timer next to the Mic: ${JSON.stringify(timerText)}`);
log(`click 1 → listening · aria "Stop listening" · header ${JSON.stringify(header.trim())} · timer ${timerText.trim()} · still listening after 2 s (not hold-only)`);

// ---- 4. second click → transcribing → transcript in the composer, nothing sent ---
// One full pass of the 11 s fixture has to be in the clip: wait until ≥ 12 s listened.
while (Number(await micBtn.getAttribute("data-elapsed-seconds")) < 12) await page.waitForTimeout(200);
await micBtn.click();
if (!(await waitState("transcribing", 3000)) && (await state()) !== "idle") fail(`second click did not stop: ${await state()}`);
const n1 = await waitIdleWithNote(60000);
if (!n1) fail(`no transcript after the second click (state ${await state()}, note ${JSON.stringify(await note())})`);
const composer1 = await box.inputValue();
if (!/Heard /.test(n1)) fail(`no transcript: ${n1}`);
if (!norm(composer1).includes(norm(JFK_PHRASE))) fail(`composer ${JSON.stringify(composer1)} does not contain "${JFK_PHRASE}"`);
if ((await sentCount()) !== sent0) fail("click-to-toggle sent a message; the transcript must only land in the composer");
if ((await micBtn.getAttribute("aria-label")) !== "Start voice input") fail("aria-label did not return to the start label");
const leftover = fs.existsSync(clipDir) ? fs.readdirSync(clipDir) : [];
if (leftover.length) fail(`voice clip left behind: ${leftover.join(", ")}`);
const heard = /Heard ([\d.]+) s · (\S+) · (\d+) ms/.exec(n1);
log(`click 2 → transcribing → idle · ${n1} · composer ${JSON.stringify(composer1)} · 0 messages sent · clip deleted`);

// ---- 5. Escape cancels: nothing transcribed, nothing sent -------------------------
await micBtn.click();
if (!(await waitState("listening", 5000))) fail("click did not start listening (Escape gate)");
await page.waitForTimeout(1500);
await page.keyboard.press("Escape");
if (!(await waitState("idle", 2000))) fail(`Escape did not stop listening: ${await state()}`);
await page.waitForTimeout(500);
const composer2 = await box.inputValue();
if (composer2 !== composer1) fail(`Escape changed the composer: ${JSON.stringify(composer2)}`);
const n2 = await note();
if (!/Cancelled/i.test(n2)) fail(`Escape note is ${JSON.stringify(n2)}, expected "Cancelled — nothing transcribed."`);
if ((await sentCount()) !== sent0) fail("Escape sent a message");
if ((fs.existsSync(clipDir) ? fs.readdirSync(clipDir) : []).length) fail("Escape left a clip on disk");
log(`Escape → idle · ${n2} · composer unchanged · 0 messages sent`);

// ---- 6. hold fallback: press ≥ HOLD_MS, release → transcript ----------------------
const bb = await micBtn.boundingBox();
if (!bb) fail("mic button has no bounding box");
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
await page.mouse.down();
if (!(await waitState("listening", 5000))) fail("press did not start listening (hold gate)");
await page.waitForTimeout(3000);
await page.mouse.up();
const n3 = await waitIdleWithNote(60000);
if (!n3 || !/Heard /.test(n3)) fail(`hold fallback gave no transcript: ${n3 ?? (await note())}`);
const composer3 = await box.inputValue();
if (composer3.length <= composer1.length) fail("hold fallback did not append to the composer");
if ((await sentCount()) !== sent0) fail("hold fallback sent a message");
log(`hold 3 s → release → ${n3} · appended (${composer3.length - composer1.length} chars)`);

// ---- 7. optional: the 60 s cap stops and transcribes on its own -------------------
let capNote = "skipped (pass --cap)";
if (flag("--cap")) {
  await box.fill("");
  await micBtn.click();
  if (!(await waitState("listening", 5000))) fail("click did not start listening (cap gate)");
  log("cap gate: listening with no second click; waiting for the 60 s cap…");
  const capEnd = Date.now() + 80000;
  let maxElapsed = 0;
  let sawTranscribing = false;
  while (Date.now() < capEnd) {
    const st = await state();
    if (st === "listening") maxElapsed = Math.max(maxElapsed, Number(await micBtn.getAttribute("data-elapsed-seconds")));
    if (st === "transcribing") sawTranscribing = true;
    if (st === "idle" && (await note())) break;
    await page.waitForTimeout(250);
  }
  const n4 = await note();
  if ((await state()) !== "idle" || !/Heard /.test(n4)) fail(`the cap did not stop + transcribe: state ${await state()}, note ${JSON.stringify(n4)}`);
  if (maxElapsed < 59) fail(`the timer only reached ${maxElapsed} s before the cap`);
  const s = Number(/Heard ([\d.]+) s/.exec(n4)?.[1]);
  if (!(s >= 59.5 && s <= 60.5)) fail(`cap clip is ${s} s, expected 60 s`);
  if (!(await box.inputValue()).trim()) fail("the cap transcript did not land in the composer");
  if ((await sentCount()) !== sent0) fail("the cap sent a message");
  capNote = `${n4} (timer reached ${maxElapsed} s, transcribing seen: ${sawTranscribing})`;
  log(`60 s cap → stopped on its own → ${capNote}`);
}

if (opt("--screenshot")) {
  await page.screenshot({ path: opt("--screenshot") });
  log("screenshot", opt("--screenshot"));
}

console.log(
  `STAGE13_MIC_TOGGLE_PASS gesture=toggle click1=listening timer=${elapsed2}s click2=transcribed heard_s=${heard?.[1] ?? "?"} model=${heard?.[2] ?? "?"} ms=${heard?.[3] ?? "?"} text=${JSON.stringify(composer1)} escape=cancelled hold_fallback=WORKS cap=${JSON.stringify(capNote)} sent=0 whisper=${whisperCli} data_dir=temp`,
);
await electronApp.close().catch(() => {});
process.exit(0);
