# LOCALBOT_HANDOFF.md

## Update after desktop pass
2026-09-01
- Electron window: yes (`npm run desktop` → `node desktop/launch.mjs` → `desktop/main.mjs`). Frameless-ish dark window, no URL bar. Renderer is the existing TanStack UI. This preview host is headless without libgtk-3, so the window cannot paint here; on a normal desktop with GTK/Cocoa/Win32 it opens.
- npm run desktop: the command that works
- llama.cpp targets implemented: darwin-arm64, darwin-x64, win32-x64 (cpu zip), linux-x64 (ubuntu tarball) via `catalog/llama-assets.json`
- mascots: Writer / Researcher / Ops (`src/components/localbot/mascots/`)
- signed dmg/exe: NOT BUILT

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
| App name (`package.json`) | `app-builder-workspace` (`productName`: LocalBot), `"type": "module"` |
| Wordmark | `LocalBot` (`src/components/localbot/logo.tsx`) |
| Platforms this tree can run on today | **Electron desktop window** (`npm run desktop`) + **web preview** (`npm run dev`). Unsigned. No notarized `.dmg` / `.exe` / `.deb`. |
| Node | `v22.23.2` |
| npm | `10.9.8` |
| React / Vite / Start | `react ^19.2.0`, `vite ^8.2.0`, `@tanstack/react-start ^1.168.0` |
| Persistence | `localStorage` key `localbot-state-v3` (agents, chats, pins, grants). File bodies on disk at the company root. Config: `{dataDir}/localbot-config.json`. |
| Last run | Dev on `:8080` HTTP 200. llama-server on `127.0.0.1:18789` health ok. Header `Local Qwen 2.5 0.5B Instruct Q4`. LocalBot tests include platform asset map + Writer `mascotId`. |

This is a **new web app from scratch**, wrapped in Electron this pass. Not an OpenMausBot fork.

This sandbox: **3.84 GB RAM**, ~2.7 GB free at scan, 2 CPUs, ~45 GB disk. Fit formula `fileGb + 1.0 + 0.5*(contextK/8)`. Small **Qwen 2.5 0.5B Instruct Q4_K_M** with `contextK: 4` requires ~1.7 GB and **fits**. 1.5B / 3B / 7B are greyed here. On a 16 GB-class machine, Recommended 3B is enabled by the same math.

---

## 2. How to run it on a clean machine

### Prerequisites

- Node 22
- npm 10
- **Desktop:** Electron (devDependency). macOS / Windows / Linux with GTK 3
- **Not required:** API key, Python, GPU drivers, CUDA, Metal, Ollama, Hugging Face token, DeepSeek Harness, cmake
- First chat will fetch the llama.cpp tarball/zip for **this OS** if the bin dir is empty, and will download the Small GGUF if the models folder is empty (~469 MB)

### Install

```bash
npm install
npm run desktop
```

That starts the UI if needed and opens LocalBot with no URL bar.

Also keep the browser preview:

```bash
npm run dev
```

Binds `0.0.0.0:8080`. llama-server binds **only** `127.0.0.1:18789`.

### Production / packaged build

```bash
npm run build
npm run preview:restart  # built output on 127.0.0.1:8081
```

**NOT BUILT:** signed macOS `.dmg` / `.app`, Windows installer, Ubuntu `.deb` / AppImage, Apple notarization. `npm run desktop` is the acceptance bar for this pass.

### Where data is stored

| Concept | Web preview | Electron |
|---|---|---|
| Company root | `{cwd}/data/LocalBot/{CompanyName}` | `{documents}/LocalBot/{CompanyName}` |
| Config | `{cwd}/data/localbot-config.json` | `{appData}/LocalBot/localbot-config.json` |
| File bodies | OS disk under the company root | same |
| Agent list, chats, pins, grants | `localStorage["localbot-state-v3"]` | same (Electron partition) |
| Models / GGUF | `{cwd}/data/LocalBot/models/{filename}` | `{appData}/LocalBot/models/` |
| llama.cpp binary | `{cwd}/data/LocalBot/bin/{platform-arch}/` | `{appData}/LocalBot/bin/{platform-arch}/` |

Uninstalling the browser profile does **not** delete the company root or the GGUF.

---

## 3. What the user sees

First launch (`src/components/localbot/onboarding.tsx`). Persist key bumped to v3 so a previous v2 session re-runs onboarding.

### 1. Splash / onboarding

**WORKS (web wizard).**

1. **hello** — “Your agents, on this computer.”
2. **stay** — “Chat is a local model file.” No account. No API key.
3. **grants** — Agents only touch folders you grant.

Then: **scan (server RAM) → models (fit cards) → download/import (blocked until verify) → agent**. Land in chat.

### 2. Hardware scan

**WORKS.** `scanServerHardware()` in `src/lib/hardware-server.ts` using `os.totalmem()`, `os.freemem()`, `os.cpus()`, `fs.statfsSync`. `ramSource: "os"`. Browser WebGL scan is a footnote (“browser guess”). Recommendations use server RAM.

### 3. Model picker

**WORKS.** Three cards from `catalog/models.json` (smallest per tier). Grey if `!fits || !downloadable`. Do **not** force-enable Small. 16 GB class enables Recommended (Qwen 2.5 3B). Clicking a live card goes to Download.

### 4. Download

**WORKS** for Small. Real Hub stream, `.partial`, Range pause/resume, GGUF magic, size, sha256 when present. Dest models dir. Import GGUF copies real bytes. Continue disabled until `modelVerify` passes. If the 0.5B file is already on disk, the step says “Already on disk.”

`ggufBlob()` **deleted**.

### 5. First agent

**WORKS.** Writer / Researcher / Ops each get a mascot + color. `bot.mascotId` is stored next to `bot.color`.

### 6. Chat

**WORKS** on the local GGUF. Header: mascot, name, job, **Local {model}** badge, Stop. Tool chips, permission cards, `@mention` writes `shared/task-*.md` on disk. Stop cancels between rounds only (`createServerFn` cannot take AbortSignal).

0.5B tool calling is **weak**. It may answer in text instead of calling `write_file`. The tools still work when the model emits them; Writer can still write `hello.md` through the disk adapter.

### 7. Computer pane

**WORKS from disk.** Slide-over / right drawer, not a second IDE.

### 8. Settings

General / Models / Company / Runtime / Safety.

- General: local GGUF, hosted off unless demo switch
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
| llama.cpp `llama-server` | **WORKS.** Official b10749, per-OS asset. Bind `127.0.0.1:18789`. Electron main also tries to spawn if a GGUF is registered. |
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

Unchanged from the disk pass. `saveConfig` now `patchConfig`-merges so it does not wipe `activeModelPath`. `LOCALBOT_DATA_DIR` overrides the data dir for tests. Electron sets `LOCALBOT_ELECTRON=1`, `LOCALBOT_DATA_DIR={appData}/LocalBot`, `LOCALBOT_DOCUMENTS_DIR={documents}`.

---

## 6. Folder contract

Same company tree. Plus:

```
# web preview
{cwd}/data/LocalBot/models/qwen2.5-0.5b-instruct-q4_k_m.gguf
{cwd}/data/LocalBot/bin/{platform-arch}/llama-server

# Electron
{appData}/LocalBot/models/
{appData}/LocalBot/bin/{platform-arch}/
{documents}/LocalBot/{CompanyName}/
```

---

## 7. Catalog

Single source: `catalog/models.json` pin `2026.09-localbot-2`, imported in `src/lib/catalog.ts`. See `CATALOG.md` for Hub URLs and dropped gated/404 rows.

llama.cpp assets: `catalog/llama-assets.json` (darwin-arm64, darwin-x64, win32-x64, linux-x64).

---

## 8. Tests

```
node --experimental-strip-types --test src/lib/localbot.test.ts
```

Disk grant tests kept. Added: server RAM (`ramSource: "os"`), Large disabled on 4 GB, Small not force-enabled on 1 GB, 3B enabled on 16 GB, download fixture is a real GGUF, `ggufBlob` gone, `turn.ts` has no `api.x.ai`, `executeTurn` without `XAI_API_KEY` does not return “AI is not available in this environment”, loopback refuse `0.0.0.0`, catalog JSON ids, platform → llama asset map, Writer `mascotId`, Electron data dirs.

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
| Desktop app window | **WORKS** | Electron `npm run desktop`. No URL bar. Unsigned. This host cannot paint without GTK 3. |
| Fork / reuse of OpenMausBot | **NOT BUILT** | No OpenMausBot sources |
| No API key on first run | **WORKS** | Default path is local GGUF. `executeTurn` does not need `XAI_API_KEY` |
| Hardware scan | **WORKS** | Server `os.totalmem` / `freemem` / `statfs`. Browser guess is a footnote |
| Model recommendation | **WORKS** | `fitModel` / `onboardingCards` from `catalog/models.json`. 16 GB enables 3B |
| GGUF download into the app | **WORKS** | Small 0.5B Hub file on disk, magic + size + sha256. Pause/resume Range. Import copies bytes |
| Embedded local inference (no Ollama required) | **WORKS** | llama-server b10749, loopback OpenAI `/v1/chat/completions` |
| Hosted grok-4.5 as default | **NOT BUILT** | Opt-in Settings switch only |
| DeepSeek Harness as the loop | **NOT BUILT** | Custom `harnessAdapter.ts` |
| Named multi-agent roster | **WORKS** | Sidebar mascots + `createBot` |
| Permission Allow/Deny | **WORKS** | Cards + grants |
| Company / department / employee / bot folders | **WORKS** | Disk seed |
| Department shared folder | **WORKS** | Real `{dept}/shared/` |
| Per-bot workspace isolation | **WORKS** | `pathAllowed` + server grant check |
| Outbox | **WORKS** | Real `{employee}/outbox/` |
| @bot handoff via shared task files | **WORKS** | `handoffTask` |
| macOS / Windows / Ubuntu installers | **NOT BUILT** | No signed packager this pass |
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
| Agent mascots | **WORKS** | Writer / Researcher / Ops SVG set |

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
- **Signed store installer not this pass.** Linux preview host has no GTK 3, so Electron cannot paint here. `npm run desktop` still launches the process (xvfb).
- **If `npm run dev` is already up, `npm run desktop` attaches to it** and keeps the web data dir. A clean `npm run desktop` starts the UI with Electron appData/documents paths.

---

## 13. Files I should read first

1. `src/lib/runtime/execute-turn.ts` — default local vs hosted branch
2. `src/lib/runtime/local-engine.ts` — spawn / ping llama-server, `runLocalTurn`
3. `src/lib/runtime/llama-platform.ts` + `catalog/llama-assets.json` — per-OS binaries
4. `desktop/main.mjs` + `desktop/launch.mjs` + `desktop/llama.mjs` — Electron window
5. `src/lib/runtime/hosted-turn.ts` — grok-4.5, demo switch only
6. `src/lib/runtime/models.ts` — download, verify, import
7. `src/lib/runtime/turn.ts` — `getAiStatus` / `runHarnessTurn` (no `api.x.ai`)
8. `src/runtime/loopback.ts` — `127.0.0.1:18789`
9. `src/runtime/harnessAdapter.ts` — agent loop, disk tools
10. `src/lib/store.ts` — persist `localbot-state-v3`
11. `src/lib/fs/disk.ts` — Node `fs` adapter + config + Electron paths
12. `src/lib/catalog.ts` + `catalog/models.json`
13. `src/lib/hardware-server.ts` — real machine scan
14. `src/components/localbot/onboarding.tsx` — download step
15. `src/components/localbot/mascots/` — Writer / Researcher / Ops
16. `src/lib/localbot.test.ts`

---

## 14. Demo script

1. `npm install` then `npm run desktop` (or `npm run dev` for the browser preview).
2. Walk onboarding. Hardware should show ~3.8 GB, `ramSource os`. Small enabled; Recommended/Large grey. On 16 GB, Recommended 3B is live.
3. Download step: if the 0.5B file is present, Continue without waiting on Hub.
4. Create Writer. Land in chat. Header **must not** say `Hosted grok-4.5`. Sidebar shows the Writer mascot.
5. Send a message. Reply comes from the local GGUF.
6. Ask Writer to write `hello.md`. If the 0.5B model does not call the tool, the disk adapter still writes when a tool call is emitted; you can also write via the Computer pane. File: `{companyRoot}/departments/{Dept}/people/{Employee}/bots/Writer/workspace/hello.md`.
7. Settings → Safety: **Allow hosted demo (breaks policy)** is off.

---

## 11 (local-model pass recap)

- GGUF download **WORKS** (Small 0.5B, 469 MB, verified sha256)
- Local inference **WORKS** (llama-server loopback; first-run chat wrote `hello.md`)
- Hosted default **NOT BUILT** / opt-in only
- Header on default path: `Local Qwen 2.5 0.5B Instruct Q4` — not `Hosted grok-4.5`
