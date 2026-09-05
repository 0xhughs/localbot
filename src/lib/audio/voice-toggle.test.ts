/**
 * Stage 13 — click-to-toggle mic. These fail when: a short click on the Mic
 * does not toggle (i.e. the control still needs a hold); the second click does
 * not stop; a hold ≥ HOLD_MS does not stop on release (the fallback is gone);
 * Escape is not wired to cancel; the timer does not count whole seconds; the
 * 60 s cap never reaches the hook's stop(); the button's aria-label is still
 * "Hold to talk"; the hook or button gains a send path; chat.tsx drops
 * runAgentTurn; or the dsh / ACP pins float.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { ACP_SDK_PIN, DSH_PIN } from "../harness/process.ts";
import { STT_MAX_SECONDS, STT_SAMPLE_RATE } from "./wav.ts";
import {
  HOLD_MS,
  elapsedSeconds,
  formatTimer,
  micAriaLabel,
  micPress,
  micRelease,
  micTitle,
  micToggleAction,
  takeForCap,
  type MicPress,
} from "./voice-toggle.ts";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const pkg = JSON.parse(read("package.json"));
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Stage 13: click-to-toggle gesture (pure)", () => {
  it("one activation toggles: idle → start, listening → stop, transcribing → nothing", () => {
    assert.equal(micToggleAction("idle"), "start");
    assert.equal(micToggleAction("listening"), "stop");
    assert.equal(micToggleAction("transcribing"), "none");
  });

  it("a short click starts and keeps listening; the second click stops", () => {
    // click 1: down at t=0 (start), up at t=80 → still listening (no hold needed)
    const p1 = micPress("idle", 0);
    assert.equal(p1.action, "start");
    assert.equal(micRelease(p1.press, 80), "none", "a click must not stop the mic — that would be hold-only");
    // click 2 while listening: down does nothing, up stops
    const p2 = micPress("listening", 5000);
    assert.equal(p2.action, "none");
    assert.equal(micRelease(p2.press, 5090), "stop");
  });

  it("a press held for HOLD_MS or longer is the hold-to-talk fallback: release stops", () => {
    const p = micPress("idle", 1000);
    assert.equal(p.action, "start");
    assert.equal(micRelease(p.press, 1000 + HOLD_MS - 1), "none");
    assert.equal(micRelease(p.press, 1000 + HOLD_MS), "stop");
    assert.equal(micRelease(p.press, 1000 + 4000), "stop");
  });

  it("the threshold is a real click/hold boundary and a release with no press is inert", () => {
    assert.ok(HOLD_MS >= 300 && HOLD_MS <= 800, `HOLD_MS ${HOLD_MS} is neither a click nor a hold`);
    assert.equal(micRelease(null, 0), "none");
    assert.equal(micPress("transcribing", 0).action, "none");
    assert.equal(micPress("transcribing", 0).press, null);
    const stuck: MicPress = { pressedAt: 0, startedListening: false };
    assert.equal(micRelease(stuck, 1), "stop", "a press that began while listening stops on release regardless of length");
  });

  it("the accessible name is start/stop, never a hold", () => {
    assert.equal(micAriaLabel("idle"), "Start voice input");
    assert.equal(micAriaLabel("listening"), "Stop listening");
    assert.equal(micAriaLabel("transcribing"), "Transcribing");
    for (const s of ["idle", "listening", "transcribing"] as const) assert.equal(/hold to talk/i.test(micAriaLabel(s)), false);
    assert.match(micTitle("idle", null), /click/i);
    assert.match(micTitle("listening", null), /escape/i);
    assert.equal(micTitle("idle", "Wait for the current turn to finish."), "Wait for the current turn to finish.");
  });

  it("the timer counts whole seconds and formats m:ss", () => {
    assert.equal(elapsedSeconds(1000, 1000), 0);
    assert.equal(elapsedSeconds(1000, 1999), 0);
    assert.equal(elapsedSeconds(1000, 2000), 1);
    assert.equal(elapsedSeconds(1000, 61000), 60);
    assert.equal(elapsedSeconds(5000, 1000), 0, "never negative");
    assert.equal(formatTimer(0), "0:00");
    assert.equal(formatTimer(7), "0:07");
    assert.equal(formatTimer(59), "0:59");
    assert.equal(formatTimer(60), "1:00");
    assert.equal(formatTimer(STT_MAX_SECONDS), "1:00");
  });

  it("the cap fires exactly once, on the block that fills the clip, and nothing is kept after it", () => {
    const cap = STT_MAX_SECONDS * STT_SAMPLE_RATE; // 960 000 samples
    const block = 4096;
    let captured = 0;
    let fired = 0;
    let blocks = 0;
    while (blocks < 400) {
      const r = takeForCap({ captured, incoming: block, cap });
      captured = r.captured;
      if (r.reachedCap) fired++;
      blocks++;
      if (r.take === 0) break;
    }
    assert.equal(fired, 1, "onCap must fire once");
    assert.equal(captured, cap, "the clip is exactly 60 s");
    // The block that crosses the cap is trimmed; the next one takes nothing and does not fire again.
    const edge = takeForCap({ captured: cap - 10, incoming: block, cap });
    assert.deepEqual(edge, { take: 10, captured: cap, reachedCap: true });
    assert.deepEqual(takeForCap({ captured: cap, incoming: block, cap }), { take: 0, captured: cap, reachedCap: false });
    // Below the cap nothing fires.
    assert.equal(takeForCap({ captured: 0, incoming: block, cap }).reachedCap, false);
  });
});

describe("Stage 13: source invariants", () => {
  const chat = read("src/components/localbot/chat.tsx");
  const hook = read("src/components/localbot/use-voice-input.ts");
  const mic = read("src/lib/audio/mic-capture.ts");
  const micButton = /<Button[^>]*data-testid="mic-button"[\s\S]*?<\/Button>/.exec(chat)?.[0] ?? "";

  it("chat.tsx: the Mic button is a toggle (click path), with hold only as the fallback", () => {
    assert.ok(micButton, "no data-testid=\"mic-button\" in chat.tsx");
    assert.match(micButton, /data-voice-gesture="toggle"/);
    assert.match(micButton, /aria-label=\{micAriaLabel\(voice\.state\)\}/, "aria-label must follow the state (start/stop)");
    assert.equal(/Hold to talk/.test(micButton), false, "the Mic is no longer described as hold-to-talk");
    // The gesture runs through the pure helpers, so the tested rules are the shipped rules.
    assert.match(micButton, /micPress\(voice\.state, Date\.now\(\)\)/);
    assert.match(micButton, /micRelease\(micPressRef\.current, Date\.now\(\)\)/);
    assert.match(micButton, /onPointerDown=/);
    assert.match(micButton, /onPointerUp=/);
    // A keyboard activation toggles; a mouse click is not double-counted.
    assert.match(micButton, /onClick=\{\(e\) => \{[\s\S]*?if \(e\.detail === 0\) voice\.toggle\(\);/);
    // The old hold-only plumbing is gone: no pointer capture that would stop the mic when the click releases.
    assert.equal(/setPointerCapture|onLostPointerCapture/.test(micButton), false, "pointer capture would turn every click back into a hold");
    assert.equal(/onKeyUp=/.test(micButton), false, "Space keyup → stop is the hold-only keyboard path");
    // Live timer while listening.
    assert.match(micButton, /data-elapsed-seconds=/);
    assert.match(chat, /data-testid="voice-timer"/);
    assert.match(chat, /formatTimer\(voice\.elapsedSeconds\)/);
    assert.match(chat, /Listening \$\{formatTimer\(voice\.elapsedSeconds\)\}/);
    // Disabled while a turn runs / no mic / no whisper-cli: the hook's reason drives `disabled`.
    assert.match(micButton, /disabled=\{Boolean\(voice\.disabledReason\)\}/);
    assert.match(chat, /useVoiceInput\(\{\s*enabled: !turnRunning/);
  });

  it("the hook: toggle + timer + Escape → cancel + the 60 s cap → stop(); still no send path", () => {
    assert.match(hook, /toggle: \(\) => void;/);
    assert.match(hook, /elapsedSeconds: number;/);
    assert.match(hook, /const toggle = useCallback\(\(\) => \{[\s\S]*?micToggleAction\(stateRef\.current\)/);
    assert.match(hook, /startMicCapture\(\{ onCap: \(\) => stop\(\) \}\)/, "the cap must end the clip through stop() so it is transcribed");
    assert.match(hook, /e\.key !== "Escape"\) return;[\s\S]*?cancel\(\);/, "Escape must cancel while listening");
    assert.match(hook, /window\.addEventListener\("keydown", onKey\)/);
    assert.match(hook, /setInterval\(tick, 250\)/);
    const code = strip(hook);
    assert.equal(/\bsend\(/.test(code), false);
    assert.equal(code.includes("runAgentTurn"), false);
    assert.equal(code.includes("appendMessage"), false);
    assert.equal(code.includes("MediaRecorder"), false);
    // Engine unchanged: same sidecar call, same WAV.
    assert.match(hook, /sttTranscribe\(\{ data: \{ wavBase64: bytesToBase64\(clip\.wav\), language: "en" \} \}\)/);
    assert.equal(/whisper-server|https?:\/\/(?!127\.0\.0\.1|localhost)/.test(code), false);
  });

  it("mic-capture.ts: the cap calls onCap once and keeps nothing past 60 s", () => {
    assert.match(mic, /onCap\?: \(\) => void/);
    assert.match(mic, /takeForCap\(\{ captured, incoming: input\.length, cap \}\)/);
    assert.match(mic, /if \(r\.reachedCap && !capFired\) \{[\s\S]*?capFired = true;[\s\S]*?opts\.onCap\?\.\(\);/);
    assert.match(mic, /const cap = Math\.ceil\(maxSeconds \* ctx\.sampleRate\)/);
    assert.match(mic, /maxSeconds = opts\.maxSeconds \?\? STT_MAX_SECONDS/);
  });

  it("the onText callback only fills the composer; Send is the one path to runAgentTurn; pins exact", () => {
    assert.match(chat, /import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/);
    assert.match(chat, /await runAgentTurn\(\{/);
    const onText = chat.slice(chat.indexOf("onText: (text) =>"), chat.indexOf("},", chat.indexOf("onText: (text) =>")));
    assert.match(onText, /appendTranscript\(cur, text\)/);
    assert.equal(/\bsend\(|runAgentTurn|appendMessage/.test(onText), false, onText);
    assert.equal(/\bsend\(|runAgentTurn|appendMessage/.test(micButton), false, "the Mic button must not send");
    assert.equal(pkg.dependencies["@deepseek-ai/dsh"], DSH_PIN);
    assert.equal(pkg.dependencies["@agentclientprotocol/sdk"], ACP_SDK_PIN);
    assert.equal(DSH_PIN, "0.1.2-alpha.5");
    assert.equal(ACP_SDK_PIN, "1.4.0");
  });

  it("this suite and the prove script are wired into package.json", () => {
    assert.match(pkg.scripts.test, /src\/lib\/audio\/voice-toggle\.test\.ts/);
    assert.match(pkg.scripts["prove:mic"] ?? "", /scripts\/prove-mic-toggle\.mjs/);
    const prove = read("scripts/prove-mic-toggle.mjs");
    assert.match(prove, /STAGE13_MIC_TOGGLE_PASS/);
    assert.match(prove, /use-file-for-fake-audio-capture/);
    assert.match(prove, /ask not what your country can do for you/);
    // The live proof must fail when a click releases into a stop (hold-only control).
    assert.match(prove, /still requires a hold|hold-only/);
    const mac = read("scripts/prove-mac.mjs");
    assert.match(mac, /click-click|click to start/i);
  });
});
