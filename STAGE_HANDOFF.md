## Stage 13 — Click-to-toggle mic

Date: 2026-09-05
Branch: `stage-13-mic-toggle` (PR → `main`, off `6b958b3` = merge of PR #12)
Host: Darwin 25.5.0 (macOS 26.5.2) · arm64 (Mac mini, Apple M4 Pro) · Electron 36.3.1 · Node v24.12.0 on PATH

Status words: WORKS / STUB / NOT BUILT / UNVERIFIED. This stage changed the **gesture, not the engine**: the Mic button is now click-to-toggle (GrokBot-style) with press-and-hold kept as a fallback, a live seconds timer while listening, Escape to cancel, and the 60 s cap now ends the clip through the same stop → transcribe path. `sttTranscribe` → `transcribeWav` → one-shot `whisper-cli -m … -f … -l en -nt -np` (whisper.cpp v1.9.2, built row on darwin-arm64), the PCM16 mono 16 kHz WAV built in the renderer, the `desktop/main.mjs` media permission handlers, `runAgentTurn`, dsh `0.1.2-alpha.5`, ACP `1.4.0`, the four scopes, host index, sections, profile and the Stage 11 chrome are unchanged. No cloud STT, no whisper-server, no auto-send, no streaming partials, no plugins / routines / channels, no Windows work. Still **UNSIGNED**, not notarized.

### Built

- **Click to start, click to stop: WORKS.** `src/lib/audio/voice-toggle.ts` (pure, no React) holds the rules; `chat.tsx` wires them. Pointer down at idle → `micPress` → `voice.start()` — listening begins at once. Pointer up: `micRelease` decides — a press shorter than `HOLD_MS` (500 ms) is a **click** and leaves the mic listening (`"none"`); a press ≥ 500 ms was a **hold** and stops (`"stop"`). A press that begins while already listening is the second click: its release stops. Space / Enter on the focused button go through `onClick` (keyboard clicks have `detail === 0`) → `voice.toggle()` (`micToggleAction`: idle → start, listening → stop, transcribing → nothing); a mouse click is not double-counted (`detail ≥ 1` is ignored there because pointerdown / pointerup already handled it). The old `setPointerCapture` / `onLostPointerCapture` / Space-keyup plumbing is gone — it turned every release into a stop. `aria-label` is `micAriaLabel(state)`: **Start voice input** / **Stop listening** / **Transcribing** (never "Hold to talk"); `data-voice-gesture="toggle"`; the icon becomes a stop square while listening. Live (dev Electron, `prove:mic`): one Playwright `click()` → `data-voice-state=listening`, aria "Stop listening", still listening 2.2 s later (a hold-only control would have been idle by then); second click → transcribing → idle, composer = `"And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country."` (`Heard 11.8 s · base.en · 304 ms`), **0 messages sent**, clip dir empty.
- **Transcript fills the composer, nothing sends: WORKS (unchanged).** `onText` → `appendTranscript(ui.composer, text)` only. The hook has no `send(` / `runAgentTurn` / `appendMessage`; `send()` in `chat.tsx` (Enter / Send button) is still the only path to `runAgentTurn`.
- **Live timer: WORKS.** The hook keeps `listeningSince` and ticks `elapsedSeconds` every 250 ms while listening (`elapsedSeconds()` = whole seconds, never negative). The header badge reads **Listening 0:07** (`formatTimer`, m:ss) and a `data-testid="voice-timer"` counter sits next to the Mic; the button carries `data-elapsed-seconds`. Live: `Listening 0:02` / `0:02` at 2.2 s; reached `59` before the cap fired.
- **Escape cancels: WORKS.** Chosen semantics: **cancel, not stop-without-send** — the clip is thrown away, whisper-cli is never run, the composer is untouched, the note says `Cancelled — nothing transcribed.` The listener is on `window` (only while listening), so it works whichever element has focus. Live: click → listening → 1.5 s → Escape → idle, composer identical, note "Cancelled — nothing transcribed.", 0 messages sent, no clip on disk.
- **60 s cap → auto-stop + transcribe: WORKS.** `mic-capture.ts` now routes each block through `takeForCap` and calls `opts.onCap()` exactly once on the block that fills the clip (`capFired` guard); the hook passes `startMicCapture({ onCap: () => stop() })`, so the cap ends the clip through the same `stop()` as the second click. Before this stage the recorder silently dropped everything after 60 s and waited for a release. Live (`prove:mic -- --cap`): one click, no second click → after 60 s the state went transcribing → idle on its own, `Heard 60.0 s · base.en · 760 ms`, transcript in the composer, 0 sent.
- **Hold fallback: WORKS.** Press ≥ 500 ms and release → stop → transcribe, as in Stage 9/10. Live: 3 s press → `Heard 2.8 s · base.en · 250 ms`, 29 chars appended.
- **Disabled: WORKS (unchanged rules).** `disabled={Boolean(voice.disabledReason)}` — "Wait for the current turn to finish." while `session.running`; the `micUnavailableReason()` when there is no `mediaDevices` / Web Audio / secure context; `sttStatus().reason` when no whisper-cli row / binary for this arch (darwin-x64 → NOT BUILT text); "Transcribing the last clip…" between stop and idle.
- **Tests.** `npm test` → 203 (scripts) + **258** (TS suite, was 246) pass; `npm run lint` and `npx tsc --noEmit` clean. New `src/lib/audio/voice-toggle.test.ts` (12): pure gesture (click keeps listening, second click stops, ≥ HOLD_MS hold stops, threshold sanity, transcribing inert), aria start/stop never "hold", timer maths + m:ss, `takeForCap` fires once at exactly 60 s × 16 kHz; source gates that fail when the Mic loses `data-voice-gesture="toggle"` / `micAriaLabel` / `micPress` / `micRelease` / the keyboard toggle, regains `setPointerCapture` / `onLostPointerCapture` / Space keyup (hold-only), loses the timer, the hook loses `toggle` / `elapsedSeconds` / Escape → `cancel` / `onCap: () => stop()`, `mic-capture.ts` stops firing `onCap`, the hook or button gains `send(` / `runAgentTurn` / `appendMessage`, `chat.tsx` drops `runAgentTurn`, or the dsh / ACP pins float. `stt.test.ts` Stage 9 gates rewritten from `aria-label="Hold to talk"` to the toggle control (and now fail if "Hold to talk" comes back). **Negative check done:** swapping in main's hold-only `chat.tsx` fails 2 tests (`chat.tsx: the Mic button is a toggle…`, `the voice path never sends…`) and `prove:mic -- --static` (`FAIL: the Mic button is not marked as a toggle (data-voice-gesture="toggle") — hold-only control`).
- **Proofs.** New `scripts/prove-mic-toggle.mjs` (`npm run prove:mic`) — dev Electron + Playwright on a temp `LOCALBOT_DATA_DIR`, Chromium's fake microphone fed whisper.cpp's `jfk.wav` (`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=…`, plus `--disable-features=AudioServiceOutOfProcess,AudioServiceSandbox` because the sandboxed out-of-process audio service cannot read the file — measured all-zero samples without it; proof-only flags, the app is unchanged), whisper-cli + model linked read-only from the real AppData install. `scripts/prove-mac.mjs` (Stage 10, packaged app + **real** microphone via speakers) now drives **click → afplay jfk.wav → click** as the default and fails if the mic is idle 1.5 s after the single click or the timer is not counting; the press-and-hold fallback is checked second with the same fixture. `npm run prove:stt -- --data-dir …` still `STAGE9_STT_PASS` (304 ms). `npm run prove:chrome` still `STAGE11_CHROME_PASS`.

### Not built

- **Plugins / marketplace (Stage 14), routines, multi-agent channels, Windows NSIS** — NOT BUILT, by rule.
- **Streaming partial transcripts, auto-send, multilingual models** — NOT BUILT, by rule. Language is still hard-pinned `en`.
- **Stop-without-send on Escape** — NOT BUILT by choice: Escape **cancels** (discards). To keep the words, click the Mic (or press Space / Enter on it) instead.
- **A "Nothing heard" clip under 0.4 s** now says `Nothing heard — click the Mic, speak, then click again.` (was "Hold the Mic while you speak."). Streaming level meter / waveform — NOT BUILT.
- **Windows / Linux: UNVERIFIED** — the gesture code is platform-neutral; no build made here. **Signing / notarization: NOT BUILT** (`build.mac.identity` still `null`).
- **Hold threshold on touch / pen: UNVERIFIED** — pointer events only exercised with a mouse (Playwright) and the real mouse in `prove:mac`.

### Files changed

- `src/lib/audio/voice-toggle.ts` (new, pure: `HOLD_MS`, `micToggleAction`, `micAriaLabel`, `micTitle`, `micPress`, `micRelease`, `elapsedSeconds`, `formatTimer`, `takeForCap`, `VoiceState`) · `src/lib/audio/voice-toggle.test.ts` (new)
- `src/lib/audio/mic-capture.ts` (`onCap`, `takeForCap`, single fire) · `src/components/localbot/use-voice-input.ts` (`toggle`, `elapsedSeconds`, Escape → `cancel`, `onCap: () => stop()`, cancel note) · `src/components/localbot/chat.tsx` (Mic button: `micPress` / `micRelease` / keyboard `toggle`, aria start/stop, `data-voice-gesture`, `data-elapsed-seconds`, `voice-timer`, header `Listening m:ss`; `runAgentTurn`, setup path, layout untouched)
- `src/lib/runtime/stt.test.ts` (Stage 9 Mic gate → toggle) · `scripts/prove-mic-toggle.mjs` (new) · `scripts/prove-mac.mjs` (click-click default + hold fallback) · `package.json` (`test` list, `prove:mic`)
- `STAGE_HANDOFF.md`, `LOCALBOT_HANDOFF.md`

### Prove it

Command:

```
npm test && npm run prove:mic -- --cap
```

Pass looks like:

```
ℹ pass 258
[prove-mic] static gates ok: Mic is a toggle (micPress/micRelease, aria start/stop, keyboard toggle, no pointer capture) | timer | Escape → cancel | cap → stop() | no send path | runAgentTurn kept | dsh 0.1.2-alpha.5
[prove-mic] click 1 → listening · aria "Stop listening" · header "Listening 0:02" · timer 0:02 · still listening after 2 s (not hold-only)
[prove-mic] click 2 → transcribing → idle · Voice · Heard 11.8 s · base.en · 304 ms · composer "And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country." · 0 messages sent · clip deleted
[prove-mic] Escape → idle · Voice · Cancelled — nothing transcribed. · composer unchanged · 0 messages sent
[prove-mic] hold 3 s → release → Voice · Heard 2.8 s · base.en · 250 ms · appended (29 chars)
[prove-mic] 60 s cap → stopped on its own → Voice · Heard 60.0 s · base.en · 760 ms (timer reached 59 s, transcribing seen: true)
STAGE13_MIC_TOGGLE_PASS gesture=toggle click1=listening timer=2s click2=transcribed heard_s=11.8 model=base.en ms=304 text="And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country." escape=cancelled hold_fallback=WORKS cap="Voice · Heard 60.0 s · …" sent=0 whisper=…/bin/darwin-arm64/whisper/whisper-cli data_dir=temp
```

`prove:mic` exits 1 when: the Mic is still described as hold-to-talk or lacks `data-voice-gesture="toggle"`; the mic is back to idle within 2 s of a single click (**hold-only**); `data-elapsed-seconds` / the `Listening m:ss` header / the timer are missing or not counting; the second click yields no `Heard …` note or the composer lacks the JFK phrase; any `li[data-role='user']` was added (something sent); a clip is left in `{dataDir}/stt/`; Escape does not return to idle, changes the composer, or lacks the "Cancelled" note; a 3 s hold appends nothing; with `--cap`, the mic does not stop and transcribe by itself at 60 s (± 0.5 s). Without `--cap` the run is ~25 s; `--static` runs the source gates only; `-- --screenshot /tmp/stage13.png` saves a picture. Requires the built whisper-cli + `ggml-base.en.bin` in `~/Library/Application Support/LocalBot` (or `--app-data <dir>`).

Packaged, real microphone (Stage 10 proof, rerun on the rebuilt app): `npm run prove:mac` → see "Stage 10 (still true)" below for the line that counts.

### How I test in the app

1. `npm run desktop` (or the rebuilt `LocalBot.app`). Pick an agent. The Mic button's tooltip reads "Click to talk, click again to stop (or press and hold)".
2. **Click** the Mic once and let go. The button turns red with a stop square, the header reads **Listening 0:01, 0:02, …** and a matching counter sits beside the button. Speak. **Click** again → "Transcribing" → your words appear in the composer. Nothing was sent; press Enter (or Send) when you want to.
3. Click the Mic, say something, press **Escape**: the mic stops, the composer is unchanged and the grey line under it says "Cancelled — nothing transcribed."
4. Click the Mic and wait without clicking again: at **1:00** it stops by itself and the transcript of the full minute lands in the composer.
5. Press and **hold** the Mic while you speak, then release: it still works like before (release = stop + transcribe).
6. Tab to the Mic and press Space or Enter: same toggle. While the agent is working (Stop button lit) the Mic is disabled with "Wait for the current turn to finish."

### Ready for

Stage 14 (plugins) only after you say GO.

## Stage 12 — Agent identity (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 12". Invariants still checked by `src/lib/agent-identity.test.ts` and `npm run prove:identity`: Edit profile through `agentUpdateProfile` (rename → row → forgetSession → agent.json / AGENTS.md), colour painting through `agentColorHex`, sections in `localbot-agents.json`, `+ New agent` → scripted setup chat, Advanced → modal, `runAgentTurn` kept, exact dsh / ACP pins. Stage 13 touched none of it.

## Stage 11 — Desktop chrome + composer (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 11". Invariants still checked by `src/lib/desktop-chrome.test.ts` and `npm run prove:chrome` (rerun this stage: `STAGE11_CHROME_PASS`): `desktop/preload.cjs` (CommonJS under `sandbox: true`), `hiddenInset` + `trafficLightPosition {14, 12}`, the native Edit menu roles, `+ New agent` above the search above the roster with Settings in the footer, the 6-line native `<textarea>` composer, jump-to-latest, `runAgentTurn` kept, exact dsh / ACP pins.

## Stage 10 — Mac unsigned package + whisper-cli + proofs (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 10". Invariants the Stage 10 proof (`npm run prove:mac`) still reads from this file: `build.mac.identity` is `null`, so the Mac build is **UNSIGNED** and not notarized — no line here may claim otherwise; the `.dmg` sha256 must be listed here. Stage 10's artifact: `LocalBot-0.1.0-mac-arm64.dmg` sha256 `4eff4caab6daafabfaf8f49f6137c4d23a7150ac84c5e2fee4e6c3f9cc9b34e6` (whisper-cli v1.9.2 built from source, Metal 3B / 7B, real-mic hold-to-talk `STAGE10_MAC_MIC_PASS`). The Stage 11 rebuild was `6e90420c1fa798cb221428fe9532f36aa8abb188b034b4d89b89fb8ccd61c297`. **Stage 13 rebuild** (`npm run build:desktop`, this branch): `LocalBot-0.1.0-mac-arm64.dmg` sha256 `e843f469c7762f4f6a7fe404c053057384185f7dc4b9121f4218c8cb9fdd5061` — UNSIGNED, not notarized, `dist/` not committed. `npm run prove:mac` on that app (node-less PATH, real USB microphone, TCC `granted`): click → `jfk.wav` out of the speakers → click → composer `"Hello. And so my fellow Americans, ask not what your country can do for you. Ask what you can do for your country."` (`Heard 13.6 s · base.en · 282 ms`), then the hold fallback `Heard 11.5 s`, 0 messages sent, clip deleted → `STAGE10_MAC_MIC_PASS tcc=granted gesture=click-click heard_s=13.6 model=base.en ms=282 … hold_fallback=WORKS … dmg_sha256=e843f469c7762f4f6a7fe404c053057384185f7dc4b9121f4218c8cb9fdd5061`.

## Stage 8 — Installers + two-process share (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Update after Stage 8". Invariants still checked by `src/lib/desktop-packaging.test.ts`: every installer is **UNSIGNED** — `mac.identity` is `null`, no certificate, nothing notarized, and no handoff line may claim otherwise. The Linux AppImage / `.deb` were last built in Stage 8 on a Linux host; not rebuilt here.
