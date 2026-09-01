# LOCALBOT_HANDOFF.md

## Update after local-model pass
2026-09-01
- Default chat: local GGUF via official llama.cpp **b10749** `llama-server` on `127.0.0.1:18789`
- Hosted grok-4.5: off unless explicit Settings switch **Allow hosted demo (breaks policy)**
- Download: real Hub file into `/workspace/data/LocalBot/models/` (Small 0.5B already on disk)
- Still web preview, not an Electron installer
- `node-llama-cpp` **not used** — this sandbox has no cmake. Binary is the official `llama-b10749-bin-ubuntu-x64.tar.gz` tree (needs the whole dir + `LD_LIBRARY_PATH`, not a lone `llama-server` file)

Documented from the tree at `/workspace` on 2026-09-01. No marketing. Status words: **WORKS** / **STUB** / **NOT BUILT** / **UNVERIFIED**.

---

## 1. Snapshot

| Item | Value |
|---|---|
| Repo path | `/workspace` |
| Git | **NOT a git repository.** No `.git`, no branch, no commit hash. |
| App name (window / `<title>`) | `LocalBot` (`src/routes/__root.tsx` `APP_NAME`) |
| App name (`package.json`) | `app-builder-workspace` (private, `"type": "module"`) |
| Wordmark | `LocalBot` (`src/components/localbot/logo.tsx`) |
| Platforms this tree can run on today | **Web only.** Browser + Node 22. **No** Electron, Tauri, `.app`, `.exe`, `.deb`, or packager scripts. |
| Node | `v22.23.2` |
| npm | `10.9.8` |
| React / Vite / Start | `react ^19.2.0`, `vite ^8.2.0`, `@tanstack/react-start ^1.168.0` |
| Persistence | `localStorage` key `localbot-state-v3` (agents, chats, pins, grants). File bodies on disk at the company root. Config: `{cwd}/data/localbot-config.json`. |
| Last run | Dev on `:8080` HTTP 200. llama-server on `127.0.0.1:18789` health ok. First-run walk: Small enabled, Recommended/Large grey, 0.5B already on disk, Writer chat header `Local Qwen 2.5 0.5B Instruct Q4`, `write_file` wrote `hello.md`. LocalBot tests 16/16. Typecheck and production build pass. |

This is a **new web app from scratch**, not an OpenMausBot fork, not a desktop binary.

This sandbox: **3.84 GB RAM**, ~2.7 GB free at scan, 2 CPUs, ~45 GB disk. Fit formula `fileGb + 1.0 + 0.5*(contextK/8)`. Small **Qwen 2.5 0.5B Instruct Q4_K_M** with `contextK: 4` requires ~1.7 GB and **fits**. 1.5B / 3B / 7B are greyed.

---

## 2. How to run it on a clean machine

What actually exists is a TanStack Start web app. There is no installer.

### Prerequisites

- Node 22
- npm 10
- A modern browser
- **Not required:** API key, Python, GPU drivers, CUDA, Metal, Ollama, Hugging Face token, DeepSeek Harness, Electron, cmake
- First chat will fetch the llama.cpp tarball if `{cwd}/data/LocalBot/bin/llama-b10749/llama-server` is missing, and will download the Small GGUF if the models folder is empty (~469 MB)

### Install

```bash
cd /workspace
npm install
```

### Dev

```bash
sh /workspace/startup.sh
# equivalent when :8080 is down:
npm run dev
```

Binds `0.0.0.0:8080`. llama-server binds **only** `127.0.0.1:18789`.

### Production / packaged build

```bash
npm run build
npm run preview:restart  # built output on 127.0.0.1:8081
```

**NOT BUILT:** macOS `.dmg` / `.app`, Windows installer, Ubuntu `.deb` / AppImage, Electron packager, Tauri.

### Where data is stored

| Concept | Actual store |
|---|---|
| Company root | Real directory, default `{cwd}/data/LocalBot/{CompanyName}` |
| Chosen path + active model | `{cwd}/data/localbot-config.json` via `src/lib/fs/disk.ts` `loadConfig` / `patchConfig` |
| File bodies | OS disk under the company root |
| Agent list, chats, pins, grants | `localStorage["localbot-state-v3"]` |
| Models / GGUF | `{cwd}/data/LocalBot/models/{filename}` |
| llama.cpp binary | `{cwd}/data/LocalBot/bin/llama-b10749/` |

Uninstalling the browser profile does **not** delete the company root or the GGUF.

---

## 3. What the user sees

First launch (`src/components/localbot/onboarding.tsx`). Persist key bumped to v3 so a previous v2 session re-runs onboarding.

### 1. Splash / onboarding

**WORKS (web wizard).**

1. **hello** — “Your agents, in this browser.”
2. **stay** — “Chat is a local model file.” No account. No API key.
3. **grants** — Agents only touch folders you grant.

Then: **scan (server RAM) → models (fit cards) → download/import (blocked until verify) → agent**. Land in chat.

### 2. Hardware scan

**WORKS.** `scanServerHardware()` in `src/lib/hardware-server.ts` using `os.totalmem()`, `os.freemem()`, `os.cpus()`, `fs.statfsSync`. `ramSource: "os"`. Browser WebGL scan is a footnote (“browser guess”). Recommendations use server RAM.

### 3. Model picker

**WORKS.** Three cards from `catalog/models.json` (smallest per tier). Grey if `!fits || !downloadable`. Do **not** force-enable Small. Clicking a live card goes to Download.

### 4. Download

**WORKS** for Small. Real Hub stream, `.partial`, Range pause/resume, GGUF magic, size, sha256 when present. Dest `{cwd}/data/LocalBot/models/{filename}`. Import GGUF copies real bytes. Continue disabled until `modelVerify` passes. If the 0.5B file is already on disk, the step says “Already on disk.”

`ggufBlob()` **deleted**.

### 5. First agent

**WORKS.** Same disk seed as the disk pass.

### 6. Chat

**WORKS** on the local GGUF. Header badge: `Local Qwen 2.5 0.5B Instruct Q4` or `Local model not ready`. Tool chips, permission cards, `@mention` writes `shared/task-*.md` on disk. Stop cancels between rounds only (`createServerFn` cannot take AbortSignal).

0.5B tool calling is **weak**. It may answer in text instead of calling `write_file`. The tools still work when the model emits them; Writer can still write `hello.md` through the disk adapter.

### 7. Computer pane

**WORKS from disk.** Unchanged from the disk pass.

### 8. Settings

General / Models / Company / Runtime / Safety.

- General: browser app, local GGUF, hosted off unless demo switch
- Models: catalog + Download + Import GGUF + models folder path
- Company: absolute path, grants, seed
- Runtime: engine `llama.cpp`, GGUF path, RAM estimate, loopback `http://127.0.0.1:18789/v1`
- Safety: web search, **Use existing Ollama** (off), **Allow hosted demo (breaks policy)** (off), Control this computer

---

## 4. Chat / inference

**Default is local.**

| Piece | Status |
|---|---|
| Embedded `node-llama-cpp` | **NOT BUILT.** No cmake in this sandbox. |
| llama.cpp `llama-server` | **WORKS.** Official b10749 ubuntu-x64 tarball. Bind `127.0.0.1:18789`. |
| DeepSeek Harness (`dsh`) | **NOT BUILT.** `harnessAdapter.ts` is a custom 6-round tool loop. |
| Ollama | **Not required.** Settings switch only; default off. |
| Chat default | `src/lib/runtime/execute-turn.ts` → `runLocalTurn` (`src/lib/runtime/local-engine.ts`) |
| Hosted grok-4.5 | `src/lib/runtime/hosted-turn.ts` **only if** `allowHostedDemo` |
| `src/lib/runtime/turn.ts` | Server fns. **Does not contain** `api.x.ai` |
| Tools | `read_file`, `write_file`, `str_replace`, `list_dir`, `delete_file`, `run_command`, `web_search` (gated) |
| File tools | `harnessAdapter` → store → `src/lib/fs/server.ts` → `src/lib/fs/disk.ts` |

`getAiStatus` returns the local badge unless the demo switch is on.

---

## 5. Files / disk adapter

Unchanged from the disk pass. `saveConfig` now `patchConfig`-merges so it does not wipe `activeModelPath`. `LOCALBOT_DATA_DIR` overrides the data dir for tests.

---

## 6. Folder contract

Same company tree. Plus:

```
{cwd}/data/LocalBot/models/qwen2.5-0.5b-instruct-q4_k_m.gguf
{cwd}/data/LocalBot/bin/llama-b10749/llama-server   # plus sibling .so files
```

---

## 7. Catalog

Single source: `catalog/models.json` pin `2026.09-localbot-2`, imported in `src/lib/catalog.ts`. See `CATALOG.md` for Hub URLs and dropped gated/404 rows.

---

## 8. Tests

```
node --experimental-strip-types --test src/lib/localbot.test.ts
```

16 tests, 0 fail. Disk grant tests kept. Added: server RAM (`ramSource: "os"`), Large disabled on 4 GB, Small not force-enabled on 1 GB, download fixture is a real GGUF (not `GGUF\n{json}`), `ggufBlob` gone, `turn.ts` has no `api.x.ai`, `executeTurn` without `XAI_API_KEY` does not return “AI is not available in this environment”, loopback refuse `0.0.0.0`, catalog JSON ids.

---

## 9. Safety

- Writes outside company root throw.
- Writes outside grants throw.
- `controlThisComputer` skips the shell permission card; still scoped to company root.
- Web search off by default, always asks.
- Model server **loopback only**. `assertLoopbackOnly` throws on `0.0.0.0`.
- Hosted demo off by default. `turn.ts` does not call `api.x.ai`.

---

## 10. What is leftover and unused

- `src/lib/fs/vfs.ts` — old in-memory VFS helpers
- `src/lib/fs/shell.ts` — old VFS shell
- `src/lib/multiplayer/` — template leftover, not imported
- `src/lib/checksum.ts` — `checksumBytes` only; `ggufBlob` removed

---

## 11. Feature scorecard

| Requirement | Status | Evidence |
|---|---|---|
| Desktop app window | **NOT BUILT** | Web document titled LocalBot. No Electron/Tauri. |
| Fork / reuse of OpenMausBot | **NOT BUILT** | No OpenMausBot sources |
| No API key on first run | **WORKS** | Default path is local GGUF. `executeTurn` does not need `XAI_API_KEY` |
| Hardware scan | **WORKS** | Server `os.totalmem` / `freemem` / `statfs`. Browser guess is a footnote |
| Model recommendation | **WORKS** | `fitModel` / `onboardingCards` from `catalog/models.json`. Grey if it does not fit |
| GGUF download into the app | **WORKS** | Small 0.5B Hub file on disk, magic + size + sha256. Pause/resume Range. Import copies bytes |
| Embedded local inference (no Ollama required) | **WORKS** | llama-server b10749, loopback OpenAI `/v1/chat/completions` |
| Hosted grok-4.5 as default | **NOT BUILT** | Opt-in Settings switch only |
| DeepSeek Harness as the loop | **NOT BUILT** | Custom `harnessAdapter.ts` |
| Named multi-agent roster | **WORKS** | Sidebar + `createBot` |
| Permission Allow/Deny | **WORKS** | Cards + grants |
| Company / department / employee / bot folders | **WORKS** | Disk seed |
| Department shared folder | **WORKS** | Real `{dept}/shared/` |
| Per-bot workspace isolation | **WORKS** | `pathAllowed` + server grant check |
| Outbox | **WORKS** | Real `{employee}/outbox/` |
| @bot handoff via shared task files | **WORKS** | `handoffTask` |
| macOS / Windows / Ubuntu installers | **NOT BUILT** | No packager |
| Arabic UI / RTL | **NOT BUILT** | `html lang="en"` |
| Company root picker | **PARTIAL** | Absolute path field, no OS folder dialog |
| NAS / two-machine sharing | **NOT BUILT** | Same real folder on the server machine only |
| Filesystem watcher | **NOT BUILT** | Computer pane refetches on `diskEpoch` |
| Streaming tokens | **NOT BUILT** | Single completion |
| Ollama | **STUB** | Optional “Use existing Ollama”, default off, not required |
| Control this computer | **WORKS** | Switch exists, default off |
| Loopback bind of a local model | **WORKS** | `127.0.0.1:18789` |
| Session transcripts | **PARTIAL** | Chat in `localStorage` (`localbot-state-v3`) |
| Import local GGUF | **WORKS** | Settings + onboarding. Copies real bytes |
| Agent rename in UI | **STUB** | `renameBot` in store, unused in sidebar |
| Browser tool | **NOT BUILT** | `web_search` gated |

---

## 12. Known bugs and missing pieces

- **`node-llama-cpp` not compiled (documented blocker).** No cmake. Used official llama.cpp CPU tarball instead. Reproduce: there is no `node-llama-cpp` in `package.json`.
- **0.5B tool calling is limited (annoying, expected).** The Small model that fits 4 GB RAM can miss tools on harder asks. First-run “write hello.md” did emit `write_file` and the file landed on disk. Larger catalog rows are real Hub files but greyed on this machine.
- **Gemma 4 E2B / Qwen 3.5 not used.** 404 and gated 401. Replaced with Qwen 2.5 Instruct Q4 files. See `CATALOG.md`.
- **Official Qwen 7B Q4_K_M is split.** Large card uses bartowski single file.
- **Stop does not abort the HTTP call (annoying).** AbortSignal cannot be forwarded through `createServerFn`.
- **No token streaming (annoying).** Full reply lands at once.
- **`darkMode` / `denseUi` are dead (cosmetic).** Stored, not applied.
- **Rename missing from sidebar (cosmetic).**
- **Inbox grant has no Settings chip (cosmetic).**
- **`npm test` fails template PWA tests (annoying for CI).** LocalBot tests pass in isolation.
- **Company rename does not move folders (annoying).**
- **No `fs.watch` (annoying).**
- **Do not kill llama-server on 18789** unless replacing it. `ensureLocalServer` reuses a healthy process.

---

## 13. Files I should read first

1. `src/lib/runtime/execute-turn.ts` — default local vs hosted branch
2. `src/lib/runtime/local-engine.ts` — spawn / ping llama-server, `runLocalTurn`
3. `src/lib/runtime/hosted-turn.ts` — grok-4.5, demo switch only
4. `src/lib/runtime/models.ts` — download, verify, import
5. `src/lib/runtime/turn.ts` — `getAiStatus` / `runHarnessTurn` (no `api.x.ai`)
6. `src/runtime/loopback.ts` — `127.0.0.1:18789`
7. `src/runtime/harnessAdapter.ts` — agent loop, disk tools
8. `src/lib/store.ts` — persist `localbot-state-v3`
9. `src/lib/fs/disk.ts` — Node `fs` adapter + config
10. `src/lib/catalog.ts` + `catalog/models.json`
11. `src/lib/hardware-server.ts` — real machine scan
12. `src/components/localbot/onboarding.tsx` — download step
13. `src/lib/localbot.test.ts`

---

## 14. Demo script

1. Start the app (`sh /workspace/startup.sh`).
2. Walk onboarding. Hardware should show ~3.8 GB, `ramSource os`. Small enabled; Recommended/Large grey.
3. Download step: if the 0.5B file is present, Continue without waiting on Hub.
4. Create Writer. Land in chat. Header **must not** say `Hosted grok-4.5`.
5. Send a message. Reply comes from the local GGUF.
6. Ask Writer to write `hello.md`. If the 0.5B model does not call the tool, the disk adapter still writes when a tool call is emitted; you can also write via the Computer pane. File: `{companyRoot}/departments/{Dept}/people/{Employee}/bots/Writer/workspace/hello.md`.
7. Settings → Safety: **Allow hosted demo (breaks policy)** is off.

---

## 11 (local-model pass recap)

- GGUF download **WORKS** (Small 0.5B, 469 MB, verified sha256)
- Local inference **WORKS** (llama-server loopback; first-run chat wrote `hello.md`)
- Hosted default **NOT BUILT** / opt-in only
- Header on default path: `Local Qwen 2.5 0.5B Instruct Q4` — not `Hosted grok-4.5`
