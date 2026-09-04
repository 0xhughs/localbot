## Stage 9 — Voice-to-text with whisper.cpp (hold-to-talk → composer → existing `runAgentTurn`)

Date: 2026-09-04
Branch: `stage-9-whisper-stt` (PR → `main`, off `3d45a7a`)

Hold-to-talk local speech-to-text and nothing else. Status words: WORKS / STUB / NOT BUILT / UNVERIFIED. Audio never leaves the machine: the renderer captures it, the sidecar on loopback transcribes it with a one-shot `whisper-cli`, the text lands in the composer, the employee presses Enter. No cloud STT, no hosted fallback, no auto-send, no `whisper-server`, no second port.

### Built

- **Catalog — WORKS.** `catalog/whisper-assets.json` pins `ggml-org/whisper.cpp` **v1.9.2** (2026-08-04; v1.9.3 exists but is marked Pre-release). Rows and hashes, every one computed from a real download on this host on 2026-09-04:

  | row | file | bytes | sha256 |
  |---|---|---|---|
  | `linux-x64` | `whisper-bin-ubuntu-x64.tar.gz` → `whisper-cli` | 9,497,583 | `46811a3ecf584307480a220b9ef5ff81b7b22dc41577cbc274ce3afc61f753b1` |
  | `win32-x64` | `whisper-bin-x64.zip` → `Release/whisper-cli.exe` | 8,194,445 | `49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a` |
  | model `base.en` (default) | `ggml-base.en.bin` | 147,964,211 | `a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002` |
  | model `tiny.en` (low RAM) | `ggml-tiny.en.bin` | 77,704,715 | `921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f` |
  | fixture | `samples/jfk.wav` @ v1.9.2 | 352,078 | `59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e` |

  No darwin row: the v1.9.2 release ships `whisper-v1.9.2-xcframework.zip` (a library) and no CLI — **NOT BUILT** on macOS, no URL invented. No GPU / cuBLAS / BLAS rows. The `tiny.en` row is pinned and hashed but the app only uses `base.en` this stage (no picker) — **UNVERIFIED** in the UI.
- **Sidecar `sttTranscribe({ wavBase64, language: "en" })` — WORKS** (`src/lib/runtime/stt.ts`, `stt-server.ts`). Refuses anything that is not RIFF/WAVE, PCM (format 1), mono, 16 kHz, 16-bit, non-empty, ≤ 60 s and ≤ 2 MiB (`validateSttWav`, walks RIFF chunks so a `LIST` chunk before `data` — as in jfk.wav — is fine). Writes `{dataDir}/stt/{uuid}.wav` (mode 0600) after `assertSttOutsideScopes` refuses a clip dir under any of the four roots. First use downloads the runtime archive to `{binRoot}/`, verifies size + sha256, unpacks it **flattened** into `{binRoot}/{target}/whisper/` (so `whisper-cli` and its `libggml*.so` / `libwhisper.so` sit in the one folder `LD_LIBRARY_PATH` / `PATH` points at) and deletes the archive's `whisper-server`; the model downloads into `{modelsDir}/whisper/` and passes size + ggml magic (`6c 6d 67 67`, "lmgg") + sha256 — never `verifyGgufFile`. Spawns `whisper-cli -m <model> -f <wav> -l en -nt -np` from that folder; 60 s → `SIGKILL`; one job at a time (a second call gets `BUSY`); `finally` deletes the clip whatever happened. Returns `{ text, ms, model, seconds }`; the transcript is never logged (`stt.ts` has no `console.*`); nothing imports dsh. `assertWhisperExe` refuses to spawn from any `bin/{target}/{runtime}/` or any folder that also holds `llama-server` (both ship a libggml — the collision this layout avoids). `sttStatus()` tells the UI `supported` / `reason` / `runtimeReady` / `modelReady`.
- **Renderer capture — WORKS in Chromium.** `src/lib/audio/mic-capture.ts`: `getUserMedia({ audio, video: false })` → `AudioContext({ sampleRate: 16000 })` → `ScriptProcessorNode` Float32 blocks → (resample if the context refused 16 kHz) → PCM16 → hand-built 44-byte WAV (`src/lib/audio/wav.ts`, shared with the sidecar gate). No `MediaRecorder`, no ffmpeg, no codec. Clip capped at 60 s in the renderer too.
- **Chat UI — WORKS.** Mic button (`aria-label="Hold to talk"`, `data-testid="mic-button"`) next to Attach in `chat.tsx`. Hold with the pointer (pointer capture; right-click ignored) or hold Space with the button focused. Header slot (where **Working** / **Switching model** live) shows **Listening** while held and **Transcribing** after release. The transcript is appended to `ui.composer` with a space (`appendTranscript`); **Enter still goes through the existing `send()` → `runAgentTurn`** — the voice hook (`use-voice-input.ts`) has no `send(`, no `runAgentTurn`, no `appendMessage`. Disabled (with the reason in the tooltip) while `session.running`, when `mediaDevices` / `AudioContext` are missing (e.g. a non-secure origin), when the sidecar reports `supported: false` (darwin), and while a clip is transcribing. Clips under 0.4 s are ignored ("Hold the Mic while you speak."). Errors and the "Heard 11.8 s · base.en · 1022 ms" note replace the footer path line until the next press; nothing goes into the chat transcript.
- **Electron — WORKS (code), UNVERIFIED (window).** `desktop/main.mjs` installs `setPermissionRequestHandler` + `setPermissionCheckHandler` on the default session before the window is created; `mediaPermissionDecision` (`desktop/packaged.mjs`, pure) grants `media` only when every requested media type is `audio` and the requesting origin is the UI origin — `http://127.0.0.1:18790` packaged, `http://127.0.0.1:8080` dev — denies media to every other origin and denies video always. This tightens today's default (Electron with no handler grants everything). `build.mac.extendInfo.NSMicrophoneUsageDescription` is set even though the mac CLI is NOT BUILT. Not exercised in a running Electron window on this VM (no mic; the AppImage was not rebuilt) — the decision function is tested.
- **Kept:** `@deepseek-ai/dsh` `0.1.2-alpha.5` and `@agentclientprotocol/sdk` `1.4.0` exact; `dsh/localbot-acp.cordis.yml` untouched; `chat.tsx` → `runAgentTurn`; four scopes; Stage 3 watch; rename / archive / duplicate; host index; llama.cpp `bin/{target}/{runtime}/` untouched. No UI redesign — one icon button, one header label, one footer note.
- **Tests.** `src/lib/runtime/stt.test.ts` (26) in `npm test` → 205 in the TS suite (was 179) + 203 in `scripts/`. Fails when: any runtime / model / fixture row lacks a 64-hex sha256; a darwin row appears; a `whisper-server` or GPU row appears; a non-WAV, stereo, 44.1 kHz, 8-bit, float, > 60 s or > 2 MiB clip is accepted; `assertSttOutsideScopes` accepts a clip dir under a root; a fake `whisper-cli` in `bin/linux-x64/cpu/` (or beside a `llama-server`) is spawned; the args are not exactly `-m … -f … -l en -nt -np`; `LD_LIBRARY_PATH` does not start with the whisper dir; the clip survives success, a non-zero exit, or a `SIGKILL`ed hang; two jobs overlap; `stt.ts` logs, imports dsh or calls `verifyGgufFile`; the renderer files mention `MediaRecorder` / ffmpeg / a remote URL; the voice hook can send; `chat.tsx` drops `runAgentTurn`; the dsh / ACP pins float; Electron grants video, grants media to another origin, or `main.mjs` lacks the handlers; `NSMicrophoneUsageDescription` is missing. Mutation-checked: blanking the `base.en` sha256 (suite 2 fail, proof `FAIL: catalog model row base.en has no sha256`), aliasing the `runAgentTurn` import (suite 1 fail, proof `FAIL: chat.tsx dropped runAgentTurn`), and removing the `finally` delete (suite 6 fail, proof `FAIL: clip left on disk: …wav`).

### Not built

- **macOS whisper-cli: NOT BUILT.** Upstream ships no darwin CLI for v1.9.2. The Mic is disabled on a mac sidecar with the tooltip "Voice input is NOT BUILT on macOS: whisper.cpp v1.9.2 ships an xcframework, not a whisper-cli binary." Building one from source, or a Metal/Core ML path, is not in this stage.
- **Real microphone: UNVERIFIED.** This VM has no audio device. The renderer path was exercised with Chromium's fake capture device playing `jfk.wav` (`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture`) — real renderer code, real sidecar, real `whisper-cli`, fake device. A human with a headset is the remaining step.
- **Windows: UNVERIFIED.** `whisper-bin-x64.zip` is pinned and hashed, `Release/whisper-cli.exe` is found by the same walk, `PATH` is prefixed with the whisper dir; never run here.
- **Electron window with a mic: UNVERIFIED** (see above). `tiny.en` in the UI, a model picker, streaming partials, auto-send on release, multilingual models, speaker diarization, `whisper-server`, GPU whisper builds: **NOT BUILT** (out of scope).
- Out of scope and untouched: sidecar auth token, `pagehide` flush handshake, `session/close`, template auth / db / PWA deletion, Harness mkdir / delete / rename / copy tools, installer signing (still NOT BUILT — everything is UNSIGNED), two-laptop NAS, painted GPU, 3B / 7B re-hash, UI redesign.

### Files changed

- `catalog/whisper-assets.json` (new) — v1.9.2 runtime rows, `base.en` / `tiny.en` model rows, jfk.wav fixture row, all with sha256 + size.
- `src/lib/runtime/stt.ts` (new) — catalog accessors, `whisperTarget` / `whisperUnsupportedReason`, paths (`whisperDir`, `whisperModelsDir`, `sttDir`), `assertSttOutsideScopes`, `assertWhisperExe`, `verifyWhisperModel` / `verifyWhisperArchive`, `ensureWhisperRuntime` / `ensureWhisperModel`, `whisperSpawnPlan`, `cleanTranscript`, `transcribeWav`, `sttStatus`.
- `src/lib/runtime/stt-server.ts` (new) — `sttStatus`, `sttTranscribe` server functions.
- `src/lib/audio/wav.ts` (new) — `inspectWav`, `validateSttWav`, `encodeWavPcm16Mono`, `floatTo16BitPCM`, `resampleLinear`, `concatFloat32`, `bytesToBase64`. `src/lib/audio/mic-capture.ts` (new) — `micSupported`, `micUnavailableReason`, `startMicCapture`. `src/lib/audio/voice-text.ts` (new) — `appendTranscript`, `MIN_CLIP_SECONDS`.
- `src/components/localbot/use-voice-input.ts` (new) — `useVoiceInput` (idle / listening / transcribing, disabled reasons, notes). `src/components/localbot/chat.tsx` — Mic button, header label, footer note, `onText` → composer only.
- `desktop/packaged.mjs` — `mediaPermissionDecision`, `normalizeOrigin`. `desktop/main.mjs` — `installPermissionHandlers(uiUrl)` before `BrowserWindow`.
- `package.json` — `build.mac.extendInfo.NSMicrophoneUsageDescription`; `npm test` adds `src/lib/runtime/stt.test.ts`; script `prove:stt`.
- `src/lib/runtime/stt.test.ts` (new, 26), `scripts/prove-stt.mjs` (new).
- `STAGE_HANDOFF.md`, `LOCALBOT_HANDOFF.md`, `README.md`, `ARCHITECTURE.md`, `FOLDER_CONTRACT.md`, `CATALOG.md`.

### Prove it

Command (linux-x64 or win32-x64; Node ≥ 22.15 on PATH for the Stage 4–8 Harness suite, as before; `npm install` first; network for the 9.5 MB runtime archive, the 148 MB model and the 352 KB fixture on the first run — they are cached in `$TMPDIR/localbot-prove-stt` and reused; `--fresh` deletes that cache first):

```
npm run lint && npm run typecheck && npm test && \
  npm run prove:stt && \
  echo STAGE9_PASS
```

Pass looks like (this host, 2026-09-04, `--fresh`):

```
# tests 203
# pass 203
# fail 0
# tests 205
# pass 205
# fail 0
[prove-stt] static gates ok: 2 runtime rows, 2 model rows hashed | runAgentTurn kept | dsh 0.1.2-alpha.5
[prove-stt] fixture jfk.wav sha256 ok (352078 B)
[prove-stt] fixture shape ok: PCM16 mono 16000 Hz, 11.00 s
[prove-stt] runtime ok: …/bin/linux-x64/whisper/whisper-cli (323 ms; archive sha256 46811a3ecf58…)
[prove-stt] model ok: …/models/whisper/ggml-base.en.bin sha256 a03779c86df3… (1951 ms)
[prove-stt] non-WAV refused: Not a WAV file (missing RIFF/WAVE header).
[prove-stt] scoped clip dir refused: Refusing to write voice clips under a scope folder (…)
[prove-stt] whisper-cli …/bin/linux-x64/whisper/whisper-cli
[prove-stt] args -m {dataDir}/models/whisper/ggml-base.en.bin -f {dataDir}/stt/<uuid>.wav -l en -nt -np
[prove-stt] transcript (832 ms, model base.en, 11.00 s of audio): "And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country."
[prove-stt] clip deleted: …/stt is empty
STAGE9_STT_PASS text="And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country." ms=832 model=base.en release=v1.9.2 exe=…/bin/linux-x64/whisper/whisper-cli total_ms=832
STAGE9_PASS
```

(205 = 179 Stage 1–8 tests + 26 in `stt.test.ts`.) On `main` (`3d45a7a`) `npm run prove:stt` fails as a missing script and `npm test` lists no Stage 9 suite. The proof goes through the real `transcribeWav` with the spawn seam instrumented; it fails with `WAV_NEVER_REACHED` when `transcribeWav` returns without spawning `whisper-cli` or when the `-f` path does not exist at spawn time, and fails when: any catalog row has an empty sha256; the fixture's sha256 differs from the pin; a non-WAV buffer is accepted; a clip dir under a scope root is accepted; `whisper-cli` is spawned from anywhere but `{dataDir}/bin/{target}/whisper/`, or a `llama-server` / `whisper-server` sits in that folder; the library path does not include the whisper dir; the args are not `-m … -f … -l en -nt -np`; the clip is still on disk afterwards; the transcript lacks "ask not what your country can do for you"; `chat.tsx` dropped `runAgentTurn`; the dsh / ACP pins float. `npm run prove:stt -- --wav <file.wav> --expect "<phrase>"` runs another PCM16 mono 16 kHz clip; `-- --data-dir ~/.config/LocalBot` reuses a real install's whisper folder.

### How I test in the app

Done on this Linux VM (X display `:1`) against `npm run dev` with `LOCALBOT_DATA_DIR=/tmp/lb-stt-demo/data` (seeded with `scripts/seed-localbot-data.mjs`: employee Sam, agent Writer, no GGUF) in Chromium launched with `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=jfk.wav%noloop` because the VM has no microphone; recording and screenshot attached to the PR.

1. **Mic next to Attach.** Select **Writer**. Under the composer, right of the paperclip, a microphone icon; hover → tooltip "Hold to talk (release to transcribe on this computer)". With no model downloaded the header badge says **Local model not ready** and the Mic is still enabled — voice input does not need llama.cpp.
2. **Hold, speak, release.** Type `Draft a note:` first. Press and hold the Mic (the button goes red, the header shows **Listening**). Speak — here the fake device played the 11 s JFK clip. Release: header shows **Transcribing** for ~1 s (first use adds the runtime + model download, ~5 s on this host). The composer now reads `Draft a note: And so my fellow Americans ask not what your country can do for you, ask what you can do for your country.` and the footer line reads `Voice · Heard 11.8 s · base.en · 1022 ms`. **No message was sent** — the chat area still shows the empty-state suggestions; `li[data-role]` count is 0. Enter (or Send) is the employee's move and goes through the same `send()` as typed text.
3. **On disk.** `ls /tmp/lb-stt-demo/data/LocalBot/bin/linux-x64/` → `whisper/` beside no llama runtime dir (llama.cpp was never downloaded here); `ls …/whisper` → `whisper-cli`, `libwhisper.so*`, `libggml*.so`, no `whisper-server`; `ls …/data/models/whisper` → `ggml-base.en.bin`; `ls …/data/stt` → empty after every clip. Nothing appears under `/tmp/lb-stt-demo/work` (the employee root).
4. **Refusals.** Send a non-WAV body to the server function (the proof does this) → `Not a WAV file (missing RIFF/WAVE header).`, nothing written. Point `employeeRoot` at the data dir → `Refusing to write voice clips under a scope folder`. Press and release in under 0.4 s → footer `Voice · Hold the Mic while you speak.`, no sidecar call. While a turn is **Working** the Mic is disabled with "Wait for the current turn to finish."
5. **macOS (not done here, by design).** On a mac sidecar `sttStatus().supported` is `false`; the Mic renders disabled with the tooltip "Voice input is NOT BUILT on macOS: whisper.cpp v1.9.2 ships an xcframework, not a whisper-cli binary." No download is attempted.

### Ready for

Stage 10, once the human says GO. Leftover **UNVERIFIED** / **NOT BUILT** from this stage: a real microphone through the Electron window (the permission handlers are code-tested only); Windows `whisper-cli.exe`; macOS CLI (NOT BUILT upstream); `tiny.en` in the UI. Carried from earlier stages, unchanged: signed / notarized installers (NOT BUILT), two laptops / NAS, painted GPU, 3B / 7B hashes, `pagehide` flush, live Ollama, bash sandbox on mac / win (all UNVERIFIED).

---

## Stage 8 — Installers + two-process share (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Update after Stage 8". The invariants this file's Stage 8 tests still check: every installer is **UNSIGNED** — `mac.identity` is `null`, no certificate, nothing notarized, and no handoff line may claim otherwise (`claimsSigned` in `src/lib/desktop-packaging.test.ts`). Stage 9 did not rebuild the AppImage / `.deb`; the Stage 8 checksums in that section stand for the last build made here.
