## Stage 10 — Mac unsigned package + whisper-cli + proofs

Date: 2026-09-04
Branch: `stage-10-macos-package` (PR → `main`, off `7608856` = merge of PR #9)
Host: Darwin 25.5.0 (macOS 26.5.2, build 25F84) · arch **arm64** (Mac mini, Apple M4 Pro, 12 cores, Metal GPU `MTL0` with 18186 MiB recommended working set) · RAM 24 GiB · disk 263 GiB free on `/` · Xcode CLT `/Library/Developer/CommandLineTools` (Apple clang 21.0.0) · cmake 4.4.3 (Homebrew) · default audio input **MateView GT** (USB, 2 ch), default output ZQE-CAA

Status words: WORKS / STUB / NOT BUILT / UNVERIFIED. Everything below is **UNSIGNED**: `build.mac.identity` is `null`, electron-builder logged `skipped macOS code signing reason=identity explicitly is set to null`, `codesign -dvv` on the produced app shows only Electron's ad-hoc signature with `TeamIdentifier=not set` and no Authority. No Developer ID, not notarized, nothing was paid to Apple. No Windows work. Electron not upgraded. `runAgentTurn`, the four scopes, the Stage 3 watch, the host index and the dsh / ACP pins are untouched.

### Built

- **Gate A — UNSIGNED Mac app: WORKS.** `npm run build:desktop` on this host → `dist/desktop/mac-arm64/LocalBot.app` (696 MB) and `dist/desktop/LocalBot-0.1.0-mac-arm64.dmg` (199,859,680 B):

  ```
  sha256  4eff4caab6daafabfaf8f49f6137c4d23a7150ac84c5e2fee4e6c3f9cc9b34e6  LocalBot-0.1.0-mac-arm64.dmg
  ```

  Node **v22.23.2** for `darwin-arm64` from `catalog/node-runtime.json` is bundled at `Contents/Resources/localbot-node/node` (the build script checks the version after packing). `npm run prove:packaged` (now darwin-aware: mounts the `.dmg` with `hdiutil`, copies the `.app`, checks `codesign` has no Developer ID / TeamIdentifier, walks the process tree with `ps`) launched the packaged binary with `PATH` containing no `node` / `npm` / `npx`: the sidecar answered on `127.0.0.1:18790`, every child executable was under the app bundle, and AppData resolved to **`~/Library/Application Support/LocalBot`** (`app.getPath("appData")` — Electron ignores `$HOME` for this on macOS, so the proof no longer expects a temp AppData on darwin and never deletes a pre-existing one). Output: `STAGE8_PACKAGED_PASS node=v22.23.2 app=…/LocalBot-0.1.0-mac-arm64.dmg platform=darwin-arm64`. The artifact is not committed (`dist/` is ignored). No GGUF / ggml model is inside the `.dmg` (the whisper model and the llama models live in AppData).
- **Gate B — Mac `whisper-cli` from source: WORKS on darwin-arm64.** Upstream v1.9.2 ships no darwin CLI and none is invented. `npm run build:whisper-mac` (`scripts/build-whisper-mac.mjs`, new) clones `ggml-org/whisper.cpp` at tag **v1.9.2** (commit `306c88f4d1286aec1bf96e544632897886af5501`), configures with exactly `-DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DGGML_NATIVE=OFF -DWHISPER_BUILD_EXAMPLES=ON -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF -DWHISPER_SDL2=OFF`, builds `whisper-cli`, refuses any non-system dylib (`otool -L`), installs to **`~/Library/Application Support/LocalBot/bin/darwin-arm64/whisper/whisper-cli`** (3,275,928 B, static: Accelerate + Metal + MetalKit only, so `dylibs: []`) and writes `whisper-build.json` beside it (release, commit, target, sha256, cmake flags, host). `catalog/whisper-assets.json` gained a `darwin-arm64` row of **`kind: "built"`** with `url: null`, the source tag + commit, the cmake flags and this host's binary sha256 `fbd2a54cf4835af4ee45b26515a21fa97add9599601d0f6ca7acddfe2cd21f6e`; `linux-x64` / `win32-x64` rows are unchanged. `src/lib/runtime/stt.ts` now knows `darwin-arm64` / `darwin-x64` targets, verifies a built row against its manifest (`verifyBuiltWhisper`: file present, size, sha256 = manifest, release = catalog) instead of an archive, and reports **NOT BUILT** with the build command when the binary is missing (`sttStatus().reason`, `transcribeWav` code `NOT_BUILT`) — the Mic is enabled on darwin exactly when the binary exists. `npm run prove:stt -- --data-dir ~/Library/Application\ Support/LocalBot` → `runtime ok (built from v1.9.2 @ 306c88f4d1) … = catalog`, transcript `"And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country."` in 354 ms, `STAGE9_STT_PASS … kind=built`. Standalone `whisper-cli` on `jfk.wav` logs `ggml_metal_device_init: GPU name: MTL0 (Apple M4 Pro)`.
- **Gate C — real microphone: WORKS.** The app was rebuilt after Gate B (the `.dmg` sha256 above is that rebuild) and `npm run prove:mac` (`scripts/prove-mac.mjs`, new) launched `dist/desktop/mac-arm64/LocalBot.app` with the node-less `PATH`, seeded one agent because AppData had no config yet (removed again afterwards), opened it, and waited for the Mic button: `Hold to talk (release to transcribe on this computer)` — enabled. `systemPreferences.getMediaAccessStatus("microphone")` was `not-determined`; the app asked, macOS showed the TCC prompt with the `NSMicrophoneUsageDescription` text, **Allow was clicked**, status became `granted`. The proof then held the Mic with a real pointer-down, played `jfk.wav` (352,078 B, catalog sha256) out of the speakers for 11 s while this Mac's real microphone listened, released, and read the composer:

  ```
  voice note: "Voice · Heard 12.0 s · base.en · 379 ms"
  composer:   "Oh my fellow America! Ask not what your country can do for you. Ask what you can do for your country."
  STAGE10_MAC_MIC_PASS tcc=granted heard_s=12.0 model=base.en ms=379 …
  ```

  No message was sent (user-message count unchanged), the clip was deleted from `{AppData}/stt/`, and Enter is still the composer's `send()` → `runAgentTurn` (static gate in the proof). Speaker → mic acoustics account for "Oh my fellow America!" vs. the fixture's "And so my fellow Americans"; the pinned phrase was heard.
- **Gate D — models + Metal GPU: WORKS on darwin-arm64.** Downloaded `qwen2.5-3b-instruct-q4_k_m.gguf` (2,104,932,768 B) and `Qwen2.5-7B-Instruct-Q4_K_M.gguf` (4,683,074,240 B) into `~/Library/Application Support/LocalBot/models/` and hashed them:

  ```
  626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d  qwen2.5-3b-instruct-q4_k_m.gguf   = catalog
  65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423  Qwen2.5-7B-Instruct-Q4_K_M.gguf   = catalog
  ```

  Both equal the catalog's etag-derived values, so `catalog/models.json` notes now read **"sha256 confirmed by download (Stage 10, 2026-09-04)"** — no hash was rewritten. `pickLlamaRuntime("darwin-arm64", …)` selects **`metal`** ("Apple Silicon: the official macos-arm64 build is the Metal build."), `gpuLayersFor` returns **99** (Metal shares system memory, the probe has no VRAM figure → offload everything). `npm run prove:packaged-chat -- --gguf <file>` (now darwin-aware, and on darwin-arm64 it also requires the Metal tree, `--n-gpu-layers > 0`, `/props`, and the Settings line) ran one real turn in the **packaged** app on each model, DeepSeek Harness on the bundled Node, llama-server from **`bin/darwin-arm64/metal/llama-b10749/llama-server`** (b10749-dfc29b64e):

  ```
  3B  llama-server … -m …/qwen2.5-3b-instruct-q4_k_m.gguf --host 127.0.0.1 --port 18789 -c 8192 -t 4 --n-gpu-layers 99 --jinja
      reply "Hello, how can I assist you today?" in 5118 ms (first run incl. Metal runtime download + GGUF hash: 26312 ms)
  7B  llama-server … -m …/Qwen2.5-7B-Instruct-Q4_K_M.gguf --host 127.0.0.1 --port 18789 -c 8192 -t 4 --n-gpu-layers 99 --jinja
      reply "Hello!" in 11442 ms
  Settings › Models: "Selected: Metal (Apple Silicon) · --n-gpu-layers 99 · Apple Silicon: the official macos-arm64 build is the Metal build."
  STAGE10_MAC_GPU_PASS runtime=metal n_gpu_layers=99 llama_server=…/bin/darwin-arm64/metal/llama-b10749/llama-server gguf=…
  ```

  The same binary with `-lv 4` on the same files logs the layer placement: **3B `load_tensors: offloaded 37/37 layers to GPU`** (CPU_Mapped 166.92 MiB), **7B `load_tensors: offloaded 29/29 layers to GPU`**, `MTL0_Mapped model buffer size = 4168.09 MiB`, `MTL0 KV buffer size = 448.00 MiB`, `ggml_metal_init: picking default device: Apple M4 Pro`; `/props` names the served file and `build_info b10749-dfc29b64e`.
- **Tests.** `npm test` → 203 (scripts) + **207** (TS suite, was 205) pass on this Mac; `npm run lint` and `npx tsc --noEmit` clean. New in `stt.test.ts`: a built row has no URL and carries source / cmake / sha256; `whisperTarget()` is `darwin-arm64` on Apple Silicon and null on Intel; `verifyBuiltWhisper` fails on a missing binary, a missing manifest, or a hash mismatch; `build-whisper-mac.mjs` emits exactly the catalog's cmake flags (Metal only on arm64) and installs under `~/Library/Application Support/LocalBot/bin/{target}/whisper`. Two darwin test-helper fixes (no product code): `makeTempRoot` resolves `realpath` because macOS's `$TMPDIR` is a symlink (`/var → /private/var`) that the scope resolver's symlink-escape check correctly rejects; `localbot.test.ts` expects the target's default runtime tree (`metal` on darwin-arm64) rather than a literal `cpu`; `watch.test.ts` waits 500 ms on darwin before the "colleague" writes, because the FSEvents stream behind a recursive `fs.watch` starts asynchronously and does not replay a write made before it is live (the test passed alone and failed 3/3 under the parallel suite without it; the app's safety poll covers that gap in production). `src/lib/fs/watch.ts` is untouched.

### Not built

- **Any signing or notarization: NOT BUILT** — by rule. First launch shows Gatekeeper's unidentified-developer dialog (right-click › Open, or Privacy & Security › Open Anyway).
- **darwin-x64 whisper-cli: NOT BUILT.** No catalog row (this host cannot build or run x86_64 without cross-compiling, which was ruled out); `build-whisper-mac.mjs` would produce a CPU-only binary there but it is UNVERIFIED. The Mic on an Intel Mac says so in its tooltip.
- **darwin-x64 GPU: NOT BUILT** (no upstream asset for b10749) — unchanged. darwin-x64 llama.cpp CPU rows are UNVERIFIED (no Intel Mac here).
- **whisper-cli rebuilt on another Mac: UNVERIFIED.** The catalog sha256 is this host's build; another machine's build records its own hash in `whisper-build.json`, which is what `stt.ts` verifies (the catalog hash is informational for built rows).
- **Windows packaging, NSIS, sidecar auth token, `pagehide` handshake, template deletion, two-laptop NAS, auto-send voice, `whisper-server`, Electron upgrade, model picker for whisper, CUDA / Vulkan hosts:** out of scope, unchanged, UNVERIFIED where applicable.
- Prompting a **fresh** TCC grant is a one-time manual click; `prove:mac` waits up to `--tcc-wait` seconds (default 90) and fails as UNVERIFIED if nobody clicks. It cannot click the system dialog itself.

### Files changed

- `scripts/build-whisper-mac.mjs` (new) — clone v1.9.2, cmake (Metal on arm64, CPU on x64), build `whisper-cli`, refuse foreign dylibs, install to AppData, write `whisper-build.json`.
- `scripts/prove-mac.mjs` (new) — Stage 10 prove-it: static gates + built whisper check + live hold-to-talk in the packaged app with the real mic.
- `scripts/prove-packaged.mjs` — `.dmg` mount/extract, `codesign` no-Developer-ID check, `ps` process tree, real AppData on darwin (never deleted if pre-existing).
- `scripts/prove-packaged-chat.mjs` — `LocalBot.app` path, `ps` tree, real AppData with seed-and-restore, selects the given GGUF as the config default, counts only new replies; on darwin-arm64 adds the Metal / `--n-gpu-layers` / `/props` / Settings gates → `STAGE10_MAC_GPU_PASS`.
- `scripts/prove-stt.mjs` — darwin rows allowed only as `kind: "built"` without a URL; prints `kind=` in the pass line.
- `src/lib/runtime/stt.ts` — darwin targets, `kind: "built"` rows, `WHISPER_BUILD_MANIFEST`, `verifyBuiltWhisper`, NOT BUILT reasons per arch, `NOT_BUILT` error code.
- `src/lib/runtime/stt.test.ts`, `src/lib/localbot.test.ts`, `src/lib/fs/watch.test.ts` (darwin settle), `src/lib/fs/disk.ts` (`makeTempRoot` realpath, test helper only).
- `catalog/whisper-assets.json` (darwin-arm64 built row), `catalog/models.json` (3B / 7B "confirmed by download"), `CATALOG.md`, `README.md`, `ARCHITECTURE.md`, `package.json` (`build:whisper-mac`, `prove:mac`).
- `STAGE_HANDOFF.md`, `LOCALBOT_HANDOFF.md`.

### Prove it

Command (on this Mac, from the repo, with `dist/desktop` built):

```
npm test && npm run prove:mac
```

Pass looks like:

```
ℹ pass 207
[prove-mac] static gates ok: identity null | dmg LocalBot-0.1.0-mac-arm64.dmg sha256 4eff4caab6da… in STAGE_HANDOFF | no signed/notarized claim | runAgentTurn kept | dsh 0.1.2-alpha.5
[prove-mac] whisper-cli built: …/bin/darwin-arm64/whisper/whisper-cli sha256 fbd2a54cf483… = catalog · v1.9.2 @ 306c88f4d1
[prove-mac] TCC microphone status: granted
[prove-mac] composer: "… ask not what your country can do for you …"
STAGE10_MAC_MIC_PASS tcc=granted heard_s=… model=base.en ms=… text="…" whisper=… app=… dmg_sha256=4eff4caab6daafabfaf8f49f6137c4d23a7150ac84c5e2fee4e6c3f9cc9b34e6
```

`prove:mac` fails when `build.mac.identity` is not null, when no `dist/desktop/*.dmg` exists or its sha256 is not in this file, when this file makes a signing or notarization claim that is not negated, when `chat.tsx` drops `runAgentTurn` or the dsh pin floats, when a darwin catalog row is not `kind: "built"` or carries a URL, when the built `whisper-cli` is missing (prints the build command), when the app has a Developer ID / TeamIdentifier, when TCC is not granted within `--tcc-wait`, when the Mic never enters listening, when the transcript does not contain the fixture phrase, when a message was sent, or when the clip survives. `npm run prove:mac -- --no-mic` runs the static half only.

Gate D repro: `npm run prove:packaged-chat -- --gguf ~/Library/Application\ Support/LocalBot/models/qwen2.5-3b-instruct-q4_k_m.gguf` → `STAGE8_PACKAGED_CHAT_PASS …` then `STAGE10_MAC_GPU_PASS runtime=metal n_gpu_layers=99 …`. Gate A repro: `npm run prove:packaged` → `STAGE8_PACKAGED_PASS node=v22.23.2 … platform=darwin-arm64`. Gate B repro: `npm run prove:stt -- --data-dir ~/Library/Application\ Support/LocalBot` → `STAGE9_STT_PASS … kind=built`.

### Ready for

Windows packaging — only after you say GO. Nothing Windows-side was touched in this stage.

## Stage 8 — Installers + two-process share (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Update after Stage 8". The invariants this file's Stage 8 tests still check: every installer is **UNSIGNED** — `mac.identity` is `null`, no certificate, nothing notarized, and no handoff line may claim otherwise (`claimsSigned` in `src/lib/desktop-packaging.test.ts`, and now `scripts/prove-mac.mjs` for this file). Stage 10 built the macOS `.dmg` on a Mac (sha256 above); the Linux AppImage / `.deb` were not rebuilt — the Stage 8 checksums in that section stand for the last Linux build.
