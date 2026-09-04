## Stage 6 — Model platform

Date: 2026-09-04
Branch: `stage-6-model-platform` (PR #6 → `main`, off `47c7da2`)

This is AGENTS.md item 6 (GPU runtimes, hashes, per-agent model, Ollama discovery) — complete-plan “Finish local model selection and execution”. It is **not** complete-plan Stage 6 (packaging), not item 7 (chats / roster off `localStorage`), not item 8 (signed installers, bundled Node, NAS).

### Built

- **GPU runtimes** — `catalog/llama-assets.json` has one row per (target, runtime), every URL HEAD-checked against the official b10749 release on 2026-09-04: `linux-x64` → `cpu` (`ubuntu-x64`) + `vulkan` (`ubuntu-vulkan-x64`); `win32-x64` → `cpu` (`win-cpu-x64`) + `cuda-12.4` (`win-cuda-12.4-x64` + the `cudart-llama-bin-win-cuda-12.4-x64.zip` companion) + `vulkan` (`win-vulkan-x64`); `darwin-arm64` → `metal` (the official `macos-arm64` build *is* the Metal build); `darwin-x64` → `cpu` only — no GPU asset exists for Intel Mac in this release, so GPU there is **NOT BUILT** and the Runtime pane says so. Runtimes unpack to `bin/{target}/{runtime}/`; a pre-Stage-6 CPU tree at `bin/{target}/` is still accepted for the default runtime. `pickLlamaRuntime(target, probe, preference)` (`src/lib/runtime/llama-platform.ts`) chooses from **sidecar host facts** — `probeGpuWith()` in `src/lib/hardware-server.ts` reads `nvidia-smi`, `/proc/driver/nvidia/version`, `/sys/class/drm/*/device/vendor` + `/dev/dri/renderD*`, Vulkan ICD files / `vulkaninfo`, Windows WMI `Win32_VideoController` + `nvcuda.dll` / `vulkan-1.dll`, and `arch`/`system_profiler` on macOS — never the browser's WebGL string. `--n-gpu-layers` is `gpuLayersFor(asset, probe, modelBytes)`: **0 on a CPU build, 99 (all) or a VRAM-proportional share on a GPU build**; the literal `"0"` is gone from `local-engine.ts` and `desktop/llama.mjs`. Settings → Models has a **Build** picker (`auto` / pinned rows) and shows the probe evidence and the chosen `--n-gpu-layers`. Selection **WORKS** (tested with fixture probes for NVIDIA / AMD / Intel Mac / Apple Silicon / bare box); painted GPU execution is **UNVERIFIED** — this host is CPU-only.
- **Hashes** — every downloadable row in `catalog/models.json` (pin `2026.09-localbot-3`) carries a sha256. 0.5B and 1.5B were confirmed by hashing real downloads on this host (`74a4da8c…a9db`, `6a1a2eb6…407e`, matching the Hub LFS etag); 3B and 7B are the Hub `x-linked-etag` values, **UNVERIFIED** against a local download (2.0 GB / 4.4 GB not pulled here). `verifyGgufFile()` (`src/lib/runtime/models.ts`) is the **one verifier**: size when the catalog knows it, GGUF magic, sha256 when the catalog knows it, and a downloadable row *without* a hash is refused outright. `activateModel()` is the only way a file becomes `activeModelPath`; **download completion, “already on disk”, `findReadyModel()` and `importGguf()` all go through it**; a mismatch leaves `activeModelPath` unchanged and the UI shows the reason. Verified files are recorded in `localbot-config.json` → `verifiedModels` (sha256, size, mtime; a later write invalidates the record, so `findReadyModel` re-hashes instead of trusting it). **WORKS**.
- **Per-agent model** — `agent.json.modelId` (catalog id, or an imported file’s own filename) is the durable pick; `ensureAgent` keeps it over a stale browser copy, `setAgentModel` / `agentSetModel` / `store.setBotModel` write it (verified files only). `appLaunchReport(agentName)` (`src/lib/runtime/harness-launch.ts`) resolves that file (`resolveModelForAgent`; missing / unverified → the global active file **with a visible notice**, never silently) and calls `ensureLocalServer(modelPath)`. The engine tracks what its one child serves (`loadedServer()`); a different path **stops the child (waits for its exit, SIGKILL after 5 s), waits for `/health` to go dark, spawns the new file, and waits until `/health` is 200, `/props.model_path` names the new file and one 1-token completion answers 200**. A server on `18789` that the sidecar did not start is recognised through `/props` and reused only if it already serves the wanted file — otherwise a clear error, never a wrong-model reuse. The dsh process is **not** restarted (its launch key — loopback URL, `local`, 8192 ctx — is unchanged across a switch). A switch is refused while *another* agent has a running turn (“Writer is still working on …. Wait or press Stop”). Pickers: Settings → **Agents** (per card) and **New agent** (verified files on disk only, disabled while the Ollama switch is on). The chat header badge comes from `modelStatusForAgent` — **the file this agent’s next turn loads**, refreshed on agent select / after each turn / when Settings closes; its tooltip shows the path, what llama-server currently serves, and “Next message restarts llama-server onto this agent’s model.” A restart posts a grey line in the chat (“Switched llama-server to … (file)”). **WORKS** — recorded in the browser preview with the real 0.5B and 1.5B GGUFs: Writer (0.5B) → Editor (1.5B) → Writer (0.5B), three turns, two restarts, replies from each model; `/props` on 18789 followed the selected agent.
- **Import badge** — `importGguf(path, catalogId?)` adopts the catalog id **only when the filename is that row’s filename**; any other file is registered under its own name (`activeModelId = "my-finetune.gguf"`), the onboarding wizard hands that id to `completeOnboarding` / `selectedCatalogId`, and the badge names the real file. A file *named* like a catalog row but with other bytes fails the hash and is not activated. **WORKS**.
- **Ollama discovery** — `listOllamaModels()` returns `{ ok, models[] }` or a typed error (`UNREACHABLE` / `BAD_RESPONSE` / `NO_MODELS`); `pingOllama` is gone. Settings → Safety, with the switch on, lists the tags from `127.0.0.1:11434/api/tags` and lets the employee pick one (`ollamaModel` in config). `resolveOllamaRoute` points the `localbot-llama` route at `http://127.0.0.1:11434/v1` with that exact tag. Switch on + nothing listening / no models / nothing picked / picked tag gone → **visible error in Settings and the prompt is refused** (“Nothing answered on http://127.0.0.1:11434 …”); **no fallthrough to llama.cpp, no hosted route**. Switch off → llama.cpp GGUF exactly as before. Discovery / refusal **WORKS** (recorded with the port silent); a real Ollama answering **UNVERIFIED** here (none installed).
- **Electron** — `desktop/main.mjs` no longer spawns its own llama-server at launch (that second process could never have been restarted by the sidecar); the sidecar owns the one llama-server and kills its child on exit. `desktop/llama.mjs` is now a resolver for the (target, runtime) asset format.
- **Tests** — `src/lib/runtime/model-platform.test.ts` (21) in `npm test`. Mutation-checked, each fails the suite: (1) blanking the 3B sha256; (2) hardcoding `"--n-gpu-layers", "0"`; (3) `appLaunchReport` calling `ensureLocalServer()` without the agent’s path; (4) “already on disk” patching config without the verifier; (5) `resolveOllamaRoute` falling back to `llama3.2` when discovery fails.

### Not built

- Painted GPU run: **UNVERIFIED** (no GPU on this host). The Vulkan / CUDA / Metal rows are pinned and selected correctly; nobody here watched a layer land on a GPU.
- 3B / 7B hashes **UNVERIFIED** against a local download (Hub etag only). `darwin-x64` GPU **NOT BUILT** (no asset). `linux-arm64` / `win32-arm64` targets **NOT BUILT** (never in the map).
- Item 7 (roster / chats off `localStorage`, durable ACP session ids) and item 8 (signed installers, Harness inside packaged Electron Node 22.14, bundled Node, two-machine NAS) **NOT BUILT**. Because the roster is still in `localStorage`, deleting agent folders from disk by hand leaves ghost rows until the sidebar Delete is used.
- Farm qualification of every catalog row on 4 / 8 / 16 GB machines: not done. Dynamic port hunt: not done (18789 bound fine).
- The Harness persona still shows the model *name* it was launched with (`LOCALBOT_LLAMA_MODEL_NAME` is read once at dsh start); the route, file and replies follow the switch — only that display string lags until dsh is next started. Token streaming, agent teams: unchanged.
- `npm test` needs `127.0.0.1:18789` free (the restart test runs a fake llama-server there); with the app running, that one test fails with an explicit “stop llama-server” message rather than skipping.

### Files changed

- `catalog/llama-assets.json` — (target, runtime) rows, `gpu`, `extra` (cudart), `default` per target.
- `catalog/models.json` — sha256 for `qwen25-15b-q4` / `qwen25-3b-q4` / `qwen25-7b-q4`; pin `2026.09-localbot-3`.
- `src/lib/runtime/llama-platform.ts` — runtime ids, `runtimesFor` / `gpuRuntimesFor` / `allLlamaAssets`, `GpuProbe`, `pickLlamaRuntime`, `gpuLayersFor`.
- `src/lib/hardware-server.ts` — `probeGpuWith` / `probeGpu` with injectable IO, `parseNvidiaSmi`, `parseWmiVideo`; `HardwareReport.gpu`.
- `src/lib/runtime/models.ts` — `verifyGgufFile`, `activateModel`, `ensureVerified`, `verifiedModels` record, `modelIdForFile`, `modelFileForId`, `resolveModelForAgent`, `listModelsOnDisk` (verified / sha256 / modelId), import catalog-id rule, `findReadyModel` through the verifier.
- `src/lib/runtime/local-engine.ts` — runtime resolution, `ensureLlamaBinary(runtime)` into `bin/{target}/{runtime}`, `llamaSpawnPlan`, tracked `ensureLocalServer(modelPath)` with stop / dark / spawn / ready, `servedModelPath`, `loadedServer`, `stopLocalServer`, `listOllamaModels`, `resolveOllamaRoute`, child reaped on exit, `engineStatus` runtime / gpu / sha256 fields.
- `src/lib/runtime/harness-launch.ts` — `appLaunchReport(agentName)` / `appLaunchSpec(agentName)`; Ollama route or refusal; busy-turn refusal.
- `src/lib/runtime/harness.ts` — prompt result carries the resolved model / restart info.
- `src/lib/runtime/model-server.ts` — `modelOllamaList`, `modelSetOllamaModel`, `modelSetRuntime`, `modelRuntimeOptions`, `modelStatusForAgent`.
- `src/lib/harness/index.ts` — `activeAgents()`.
- `src/lib/fs/scopes.ts` — `setAgentModel`, `AgentPaths.modelId`, `ensureAgent` keeps the durable model. `src/lib/fs/server.ts` — `agentSetModel`, `agentInfo.modelId`. `src/lib/fs/disk.ts` — `llamaBinDir(runtime)`, config fields `ollamaModel` / `llamaRuntime` / `verifiedModels`. `src/lib/types.ts` — `VerifiedModel`, `DiskConfig` fields, `HardwareReport.gpu`.
- `src/lib/store.ts` — `setBotModel`; `ensureAgents` mirrors `modelId`. `src/runtime/harnessAdapter.ts` — `onModel` event.
- `src/components/localbot/chat.tsx` (badge from `modelStatusForAgent`, “Switching model”, switch / notice lines), `settings.tsx` (Models: verified / sha256 / imported files / build picker + probe; Agents: model picker; Runtime: build / probe / server rows; Safety: `OllamaPicker`), `new-agent.tsx` (model picker), `onboarding.tsx` (`onActivated` → real model id).
- `desktop/main.mjs` (no llama spawn), `desktop/llama.mjs` (resolver for the new format).
- `src/lib/runtime/model-platform.test.ts` (new), `src/lib/localbot.test.ts` (asset map / bin dir layout), `package.json` (`npm test`).
- `LOCALBOT_HANDOFF.md`, `STAGE_HANDOFF.md`, `ARCHITECTURE.md`, `CATALOG.md`, `FOLDER_CONTRACT.md`, `README.md`.

### Prove it

Command (Node ≥ 22.15 on `PATH` or `LOCALBOT_DSH_NODE` for the Harness suite, as in Stage 4; `npm install` first; nothing may be listening on `127.0.0.1:18789`):

```
npm run lint && npm run typecheck && npm test && \
  node -e 'const c=require("./catalog/models.json");for(const m of c.models.filter(m=>m.downloadable)){if(!/^[0-9a-f]{64}$/.test(m.sha256))process.exit(1)}' && \
  ! grep -Eq '"--n-gpu-layers",\s*"0"' src/lib/runtime/local-engine.ts desktop/llama.mjs && \
  grep -q 'String(gpuLayers)' src/lib/runtime/local-engine.ts && \
  grep -q 'resolveModelForAgent(agentName)' src/lib/runtime/harness-launch.ts && \
  grep -q 'ensureLocalServer(resolved.path)' src/lib/runtime/harness-launch.ts && \
  ! grep -q 'llama3.2' src/lib/runtime/harness-launch.ts && \
  ! grep -q 'export async function pingOllama' src/lib/runtime/local-engine.ts && \
  echo STAGE6_PASS
```

Pass looks like:

```
# tests 195
# pass 195
# fail 0
# tests 140
# pass 140
# fail 0
STAGE6_PASS
```

(140 = 119 Stage 1–5 tests + 21 in `model-platform.test.ts`; the first block is the template `scripts/**` suite.) On `main` this fails at `npm test` with `Could not find 'src/lib/runtime/model-platform.test.ts'`, and independently at the `sha256` node check (three rows are `""` on main), at the `grep -Eq '"--n-gpu-layers",\s*"0"'` check (both files hardcode it on main), and at the `resolveModelForAgent` grep. It fails when: any downloadable catalog row has an empty or malformed sha256 (`every downloadable catalog row has a real sha256`); a hash mismatch, a wrong size, a non-GGUF or a downloadable row without a hash still activates (`a hash mismatch leaves activeModelPath unchanged …`, `startDownload 'already on disk' runs the verifier …`, `findReadyModel activates only files that verify …`); import labels a different file with the wizard card’s catalog id (`import adopts a catalog id only when the filename is that row …`); a GPU row is dropped, an unofficial URL appears, or `pickLlamaRuntime` / `gpuLayersFor` stop branching on the probe and the build (`pins only HEAD-checked official b10749 rows …`, `picks CPU vs GPU from host facts …`, `--n-gpu-layers is 0 on a CPU build and > 0 only on a GPU build`, `no source file hardcodes --n-gpu-layers 0 any more`); the sidecar probe stops reading real sources; two agents with different `modelId`s share one GGUF without a restart attempt, or the switch restarts dsh (`switching the selected agent to another modelId stops the child, waits for dark, spawns the new file (dsh untouched)`); `agent.json.modelId` stops being durable or the fallback becomes silent (`agent.json.modelId is durable and picks the file for that agent`); Ollama is a ping again, `llama3.2` is hardcoded, or a silent 11434 falls through to llama.cpp (`listOllamaModels returns tags or a typed error …`, `the route uses the picked tag and refuses …`, `switch on + 11434 silent → the prompt is refused …`); `chat.tsx` drops `runAgentTurn` or the badge stops following the agent; the dsh / ACP pins float.

Second command (optional) — the Stage 6 suite alone, verbose:

```
node --experimental-strip-types --test src/lib/runtime/model-platform.test.ts
```

Pass: `# pass 21` / `# fail 0`.

### How I test in the app

Done on this Linux CPU-only host (4 cores, no `/dev/dri`) against the real 0.5B **and** 1.5B GGUFs through official llama.cpp b10749 (`bin/linux-x64/cpu/`) and the real Harness; recording attached to the PR.

1. Put both GGUFs in the models folder (or download the 1.5B from Settings → Models — it verifies against the catalog sha256 on arrival), then `LOCALBOT_DATA_DIR=/tmp/lb npm run dev` with Node ≥ 22.15, open `http://localhost:8080/`, walk onboarding with the **Small** card — the Download step reads **Already on disk · … · sha256 74a4da8c9fdb…** — **Create my folders**, agent **Writer**. Send Writer `Reply with one short sentence saying hello.`; the badge reads **LOCAL QWEN 2.5 0.5B INSTRUCT Q4** and `curl -s 127.0.0.1:18789/props | grep -o '"model_path":"[^"]*'` ends in `qwen2.5-0.5b-instruct-q4_k_m.gguf`.
2. **New agent** → `Editor`, **Model (files on this computer)** → **Qwen 2.5 1.5B Instruct Q4** → Create. The badge reads **LOCAL QWEN 2.5 1.5B INSTRUCT Q4**; hovering it shows “llama-server: qwen2.5-0.5b… · cpu · gpu layers 0 / Next message restarts llama-server onto this agent’s model.” `cat …/agents/Editor/agent.json` shows `"modelId": "qwen25-15b-q4"`. Send Editor the same message: the header reads **Switching model**, then a grey line **Switched llama-server to Qwen 2.5 1.5B Instruct Q4 (qwen2.5-1.5b-instruct-q4_k_m.gguf).** and a reply; `/props` now ends in `…1.5b…`; `ps -C llama-server` shows exactly one process. Click **Writer**, send `Reply with the single word: ready` → **Switched llama-server to Qwen 2.5 0.5B Instruct Q4 (…)** and `ready`; `/props` is back on the 0.5B file. In Settings → **Agents** the Writer / Editor cards show their models; changing one prints “X now runs on … from its next message.” Settings → **Models** → **llama.cpp build** reads `Release b10749 · linux-x64 · GPU probe: none detected · cuda=false vulkan=false metal=false`, `Build auto → CPU`, `Selected: CPU · --n-gpu-layers 0 · No GPU detected; CPU.` (on a machine with an NVIDIA card and driver this reads `… → Vulkan` on Linux / `… → NVIDIA CUDA 12.4` on Windows and `--n-gpu-layers 99` — **UNVERIFIED** here).
3. Settings → **Safety** → tick **Use existing Ollama** (nothing on 11434): the red line **Nothing answered on http://127.0.0.1:11434. Start Ollama or turn off “Use existing Ollama”. Chat is refused while this switch is on …** appears; close, the badge reads **OLLAMA — PICK A MODEL**; send `hello` → the reply is that same error, not a model answer, and `ps -C llama-server` did not start anything new. Untick → badge back to **LOCAL QWEN 2.5 0.5B INSTRUCT Q4**. Import check: Settings → Models → Import `/tmp/team-model.gguf` (a renamed copy of the 0.5B file) → “Imported … as team-model.gguf · sha256 74a4da8c9fdb…”, listed under **Imported files** as Verified — not as the 0.5B catalog row.

### Ready for

Stage 7 only after I say GO.
