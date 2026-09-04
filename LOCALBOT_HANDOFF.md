# LOCALBOT_HANDOFF.md

## Update after Stage 7 — Durable AppData state
2026-09-04 · branch `stage-7-durable-state` (PR #7)

**What actually WORKS now**
- **Roster on disk.** `{dataDir}/localbot-agents.json` (v1, `src/lib/fs/host-index.ts`) holds `onboarded`, company / department / employee labels + ids, `selectedCatalogId`, `migratedFrom`, and per-agent `{ id, name, pinned, hidden, unread, sessionId, sessionCwd, createdAt }`. `agent.json` stays the source of truth for job / modelId / color / mascot / scopes / archived. The sidebar roster is `agents/*/agent.json` ⋈ index (`loadRoster`); a folder with no row gets a fresh id. `stateLoad` feeds the store before the first render; `localStorage.clear()` + reload against the same `LOCALBOT_DATA_DIR` shows the same roster, pins, archived group and chats (recorded).
- **Chats on disk.** `{dataDir}/chats/{agentId}.json` (messages + chatGrants), atomic, debounced 400 ms, flushed on `pagehide`, keyed by id so rename does not move them, outside every scope root (refused if the data dir sits inside one).
- **ACP session map.** `HarnessManager` persists `sessionId` + cwd after `session/new`; with an empty memory map it calls `session/resume` (dsh restores its own log; LocalBot replays nothing) and falls back to `session/new` + store when refused (unknown id, moved cwd). `forgetSession` (rename / archive) clears the persisted id. Verified against the real dsh: after `stop()` a fresh manager resumes the same id and its next tool call lands in the same `private/`; in the app a killed-and-restarted dev server shows **Resumed the previous Harness session.** with the id unchanged in the index.
- **Atomic host writes.** `atomicWriteJson` (temp + `renameSync`, `.bak`) for `localbot-config.json`, the index and chat files.
- **Settings hydration.** `allowHostedDemo` / `useExistingOllama` / `ollamaModel` / `activeModelId` are read back from `localbot-config.json` on boot, so Settings → Safety matches the sidecar after a wipe.
- **Migration.** Empty index + a browser `localbot-state-v3` → `stateMigrate` writes index + chats (old bot ids kept), `localbot-state-v3.migrated.json`, `migratedFrom` marker; idempotent. `partialize` now persists only UI chrome (`settings.darkMode` / `denseUi` / `webSearchEnabled` / `controlThisComputer` / `companyRootIsShared`, `hardware`, `runtime`, `previewWritesToProjectData`).
- `npm run lint`, `npm run typecheck`, `npm test` (195 + 165) exit 0. 20 new tests in `src/lib/fs/host-index.test.ts` + 5 real-dsh resume scenarios in `harness.test.ts`.

**Still NOT BUILT**
- Item 8 (signed installers, Harness in packaged Electron Node 22.14, bundled Node, Electron upgrade, two-machine NAS **UNVERIFIED**). Painted GPU **UNVERIFIED**; 3B / 7B hashes etag-only. Chat writes in the last ~400 ms before a hard renderer kill (`pagehide` flush **UNVERIFIED** on Electron close). Roster while the employee root is DISCONNECTED shows an empty list with a notice (no cached copy). `session/list` unused.

See `STAGE_HANDOFF.md` for the exact prove-it command, pass output, and in-app test steps. Older sections below that say agents / chats / pins live in `localStorage["localbot-state-v3"]` describe the pre-Stage-7 layout.

---

## Update after Stage 6 — Model platform
2026-09-04 · branch `stage-6-model-platform` (PR #6)

**What actually WORKS now**
- **GPU runtimes (selection).** `catalog/llama-assets.json` pins one official b10749 row per (target, runtime), every URL HEAD-checked: linux-x64 `cpu` + `vulkan`; win32-x64 `cpu` + `cuda-12.4` (+ cudart zip) + `vulkan`; darwin-arm64 `metal`; darwin-x64 `cpu` only (GPU **NOT BUILT** — no asset exists). The sidecar probes the host (`nvidia-smi`, `/proc/driver/nvidia`, `/sys/class/drm` + `/dev/dri`, Vulkan ICDs, WMI, arch) and `pickLlamaRuntime()` chooses the build; `--n-gpu-layers` is `gpuLayersFor()` — 0 on a CPU build, > 0 only on a GPU build. Runtimes unpack to `bin/{target}/{runtime}/`. Settings → Models has a **Build** picker and shows the probe evidence. Painted GPU execution is **UNVERIFIED** (CPU-only host); selection is tested with fixture probes.
- **Hashes.** Every downloadable catalog row has a sha256 (pin `2026.09-localbot-3`); 0.5B / 1.5B confirmed by hashing real downloads, 3B / 7B from the Hub LFS etag (**UNVERIFIED** locally). `verifyGgufFile()` is the one gate — size, GGUF magic, sha256, and a downloadable row without a hash is refused. Download, “already on disk”, `findReadyModel()` and import all activate through it; a mismatch leaves `activeModelPath` alone. Verified files are recorded in `localbot-config.json` → `verifiedModels` (invalidated when the file's mtime changes).
- **Per-agent model.** `agent.json.modelId` is the durable pick (Settings → Agents and New agent pickers, verified files only). `appLaunchReport(agentName)` resolves that file and `ensureLocalServer(modelPath)` restarts the **one** llama-server onto it when it differs — stop, wait for exit + port dark, spawn, wait for `/health`, `/props` naming the file and a 1-token completion. dsh is not restarted. A switch under another agent's running turn is refused. The header badge follows the agent's real file (tooltip shows what llama-server serves and “Next message restarts…”); a restart posts “Switched llama-server to … (file)” in the chat. Verified in the browser preview with the real 0.5B and 1.5B GGUFs: Writer → Editor → Writer, two restarts, `/props` on 18789 followed the selected agent.
- **Import badge fix.** `importGguf` adopts a catalog id only when the filename is that row; other files are registered under their own name and the wizard / badge / new-agent default use that id.
- **Ollama discovery.** `listOllamaModels()` returns tags or a typed error (no more `pingOllama`); Settings → Safety lists + picks a tag when the switch is on; the `localbot-llama` route points at `127.0.0.1:11434/v1` with that tag. Switch on + silent port / no models / nothing picked → visible error and the prompt is refused; no fallthrough to llama.cpp, no hosted route. Switch off → GGUF as before. A live Ollama is **UNVERIFIED** here (none installed).
- Electron main no longer spawns a second llama-server; the sidecar owns the one process and reaps it on exit.
- `npm run lint`, `npm run typecheck`, `npm test` (195 + 140) exit 0. 21 new tests in `src/lib/runtime/model-platform.test.ts`. Mutation-checked: an empty 3B sha256, a hardcoded `"--n-gpu-layers", "0"`, a launch that ignores the agent's path, a blind “already on disk” activate, and an Ollama fallback to `llama3.2` each fail the suite.

**Still NOT BUILT**
- Painted GPU run (**UNVERIFIED**, no GPU here). 3B / 7B hashes **UNVERIFIED** against a local download. darwin-x64 GPU, linux-arm64 / win32-arm64 targets **NOT BUILT**. Item 7 (roster / chats off `localStorage`, durable ACP session ids). Item 8 (signed installers, Harness in packaged Electron Node 22.14, bundled Node, two-machine NAS **UNVERIFIED**). Farm qualification, dynamic port hunt. The Harness persona's model *name* string is read once at dsh start (route and file do follow a switch).

See `STAGE_HANDOFF.md` for the exact prove-it command, pass output, and in-app test steps.

---

## Update after Stage 5 — Multi-agent polish
2026-09-04 · branch `stage-5-multi-agent-polish` (PR #5)

**What actually WORKS now**
- **Rename** in the sidebar menu. The sidecar moves `agents/{Old}/` → `agents/{New}/` in one `fs.renameSync` (agent.json, AGENTS.md, `private/memory/notes.md`, `private/output/` follow), rewrites `agent.json.name` and the `# Name` headings, and drops the agent's in-memory ACP session so the next message opens `agents/{New}/private`. Refused for empty / illegal / reserved names, a name another agent owns (case-insensitive, checked on disk), a missing source folder, or while the agent is mid-turn. Case-only renames go through a temp name. The roster label changes only after the move; chats stay keyed by `bot.id`.
- **Archive / Unarchive**, separate from Hide and Delete. Persisted as `"archived"` in `agents/{Name}/agent.json`; files stay, `agentRemove` is not called. Archived agents leave the default roster and the `@` hint; an **Archived (n)** group at the bottom of the sidebar restores or deletes them. Hide stays a local UI filter; Delete stays destructive.
- **Duplicate** copies the source `private/` (memory notes included) and its AGENTS.md into a fresh `agents/{Name copy}/` with a fresh agent.json — never a shared folder, never a store-only clone. Collision refused on disk.
- **Names**: `agentSlug` is the one cleaner (`store.slugName` removed); the sidecar's `assertAgentName` refuses rather than cleans.
- **@Name handoff** unchanged (`employee-shared`, else `department-shared`, else a clear error) and now refuses archived / hidden targets.
- `npm run lint`, `npm run typecheck`, `npm test` (195 + 119) exit 0. 16 new tests in `src/lib/fs/agents.test.ts` + 1 Harness scenario (session cwd after rename). Mutation-checked: store-only rename, deleting archive, non-copying duplicate, sidecar-skipping rename, and handoff to an archived target each fail the suite.
- Verified in the browser preview with the real 0.5B GGUF and the real Harness: rename Writer → Author (folder moved, `# Author`, new dsh session under the new cwd), collision notice, duplicate with copied memory, archive → Archived (1) → unarchive, `@Editor` task file appearing under **My agents** without a reload.

**Still NOT BUILT**
- Item 6 (GPU / hashes / per-agent model / Ollama discovery / import badge). Item 7 (roster + chats off `localStorage`, durable ACP session ids). Item 8 (signed installers, Harness in the packaged Electron Node 22.14, bundled Node). Two-machine / NAS **UNVERIFIED**. Rename with an open Windows handle in the old folder **UNVERIFIED** (Linux only here). Rename is refused mid-turn rather than queued.

See `STAGE_HANDOFF.md` for the exact prove-it command, pass output, and in-app test steps.

---

## Update after Stage 4 — Real DeepSeek Harness
2026-09-03 · branch `stage-4-deepseek-harness` (PR #4)

**What actually WORKS now**
- The agent loop is the real **DeepSeek Harness**: `@deepseek-ai/dsh` pinned exactly at `0.1.2-alpha.5` (upstream `49a606b`), driven over the official Agent Client Protocol with `@agentclientprotocol/sdk` `1.4.0` (exact). The sidecar owns one `dsh --profile acp --patch dsh/localbot-acp.cordis.yml` process with an isolated `DSH_HOME` under the data dir; one ACP session per agent; `session/new` / `session/prompt` / `session/update` / `session/request_permission` / `session/cancel`. The renderer only calls the server functions in `src/lib/runtime/harness.ts`.
- `src/runtime/harnessAdapter.ts` no longer owns a loop: the `while (rounds < 6)`, client-side tool execution and history replay are gone. It maps committed ACP updates onto the existing chips / assistant text, answers permission requests with the existing Allow once / Allow for this chat / Deny cards, and turns Stop into `session/cancel`.
- The only model route the Harness knows is `localbot-llama` → llama.cpp on `127.0.0.1:18789/v1` (`ensureLocalServer` unchanged; fixed placeholder key-shaped value, no credential). Hosted DeepSeek, telemetry, web search/fetch and subagent tooling are disabled in the checked-in Cordis overlay. `Allow hosted demo` on → the chat path refuses instead of routing a key.
- Harness file tools run through LocalBot's own `ctx.fs` provider (`dsh/localbot-fs.mjs`): every path resolves via `resolveScopePath({ scope, relPath, agentName })`; `..`, absolute, ungranted and symlink escapes are denied; a vanished share is `DISCONNECTED`; tool results show `private/hello.md`, never a host path.
- Verified in the browser preview with a real GGUF (Qwen 2.5 1.5B Q4 on official llama.cpp b10749): Writer → "Create a file named hello.md …" → chip **Write** `private/hello.md` → committed reply → `hello.md` listed and previewed in the Computer pane (~16 s on 4 CPU cores). With the 0.5B GGUF the same path runs but the model picks the wrong tool and gives up — write **UNVERIFIED** on 0.5B.
- `npm run lint`, `npm run typecheck`, `npm test` (195 + 102) exit 0. 20 new tests in `src/lib/harness/harness.test.ts` drive the real `dsh` over ACP against a fixture OpenAI `/v1` (no GGUF needed for `npm test`).
- Also fixed on the way: llama-server is launched from the extracted `llama-b10749/` tree (the copied lone binary could not load ggml backends); llama-server context floors at 8192 so the Harness prompt fits.

**Constraint found**
- `dsh 0.1.2-alpha.5` needs **Node ≥ 22.15** (`node:zlib` zstd in `dsh-session-persistence-jsonl`, hard-injected by `dsh-acp`). Electron 36's embedded Node and this VM's default Node are 22.14.0 → `SyntaxError: The requested module 'node:zlib' does not provide an export named 'createZstdDecompress'`. The sidecar launches dsh with `LOCALBOT_DSH_NODE`, its own Node if new enough, or a newer nvm Node (here v22.22.2); otherwise it refuses with that reason. Electron was not upgraded and no second Node is bundled — packaged-mode Harness is Stage 8.

**Still NOT BUILT**
- Harness inside the packaged Electron binary (Node 22.14). Durable session ids / chats / roster off `localStorage` (item 7) — a sidecar restart starts fresh ACP sessions. Delete / rename / mkdir tools through the Harness. Token streaming (ACP emits committed blocks; not faked). Hosted demo through the Harness (refused; legacy `runSingleCompletion` kept off the chat path). Signed installers. Two-machine / NAS run **UNVERIFIED**. Bash sandbox on macOS / Windows **UNVERIFIED**. Wizard GGUF import keeps the card's catalog id (badge label bug, item 6).

See `STAGE_HANDOFF.md` for the exact prove-it command, pass output, and in-app test steps.

---

## Update after Stage 3 — Four-scope browser + watch/poll + Refresh
2026-09-02 · branch `stage-3-watch-refresh`

**What actually WORKS now**
- The sidecar watches every configured folder (`src/lib/fs/watch.ts`): recursive `fs.watch` plus a 15 s safety poll where the OS delivers events; a bounded metadata poll (2 s, depth 4, 2000 entries) as the only source on network mounts / UNC paths / when `fs.watch` cannot attach, or when `LOCALBOT_WATCH_MODE=poll`. Watchers never write. Each root has a monotonic `version` and an `ok` / `disconnected` status with the OS reason.
- External writes into a configured scope appear in the Computer pane without a restart and without this process writing the file: the pane polls `scopesStatus` every 3 s and re-lists a section when its `version` moves. Verified in the browser preview: a file written from a terminal appeared under Department in ~2 s.
- **Refresh** button in the Computer pane header re-lists every visible scope through the sidecar resolver (`browseRefresh` rescans every root now). Verified with a 10-minute forced poll: nothing appeared until Refresh was clicked.
- A missing / unmounted configured folder is `ScopeError("DISCONNECTED")` for that scope on every browse and agent-tool op (`assertScopeConnected` in `resolveScopePath`). The pane shows a **Disconnected** banner with the reason and path on that section only; the other scopes keep working. A recursive `mkdir` can no longer recreate a vanished share as a local folder. Null scopes stay hidden; `..` / absolute / drive / UNC / symlink escapes stay denied (checked before the disk is touched).
- Electron **Reveal in Finder / Explorer**: one new narrow IPC `localbot:revealPath` (`shell.showItemInFolder`) in the `pickFolder` style; main re-checks the path against the configured folders in `localbot-config.json`. The host path comes from the sidecar (`browseHostPath`), never from the browser. Web preview keeps copy-path. The painted action is **UNVERIFIED** on this GTK-less host.
- `npm run lint`, `npm run typecheck`, `npm test` (195 + 82) exit 0. 14 new tests in `src/lib/fs/watch.test.ts`.

**Still NOT BUILT**
- DeepSeek Harness (custom loop unchanged; AGENTS.md item 4). Signed installers. Real two-machine / NAS run (**UNVERIFIED**; poll mode was forced, not measured on SMB/NFS; macOS network detection returns false and relies on the safety poll). Sidecar token. Agents / chats still in `localStorage["localbot-state-v3"]`. Rename / archive. Atomic writes / stale checks. Push (SSE) updates — the pane polls status every 3 s.

See `STAGE_HANDOFF.md` for the exact prove-it command, pass output, and in-app test steps.

---

## Update after Stage 2 — Folder scopes + native pickers
2026-09-02 · branch `stage-2-folder-scopes`

**What actually WORKS now**
- `localbot-config.json` is `version: 2` with a `folders` object: `employeeRoot` (required) + `employeeShared` / `departmentShared` / `companyShared` (nullable). A v1 `companyRoot` file is migrated once on load; `legacyCompanyRoot` is kept; no files are moved or deleted.
- The sidecar resolves every file path from `{ scope, relPath, agentName }` (`src/lib/fs/scopes.ts`). The browser never sends a root. `..`, absolute / drive / UNC paths, NUL, unset scopes, and symlink escapes (realpath, dangling links included) are rejected.
- Agent scope grants live in `{employeeRoot}/agents/{Name}/agent.json`, outside `private/`, and are enforced server-side.
- Electron `localbot:pickFolder` IPC (`dialog.showOpenDialog` with `openDirectory`) exposed via `desktop/preload.mjs`; web preview keeps a typed path field tagged **preview only**. The painted dialog is **UNVERIFIED** on this GTK-less host.
- Onboarding **Folders** step after model download; Settings → **Folders** (with “changing a folder does not move old files” notice) and → **Agents** (per-scope grants); Computer pane shows one section per configured scope and hides `null` scopes.
- `@Name` handoff writes `task-*.md` to `employee-shared`, else `department-shared`, else reports that neither is connected.
- `npm run lint`, `npm run typecheck`, `npm test` (195 + 68) exit 0. The 53 pre-existing grant / local-model tests still pass.

**Still NOT BUILT**
- Watch / poll / Refresh (Stage 3). DeepSeek Harness (custom loop unchanged). Signed installers. Agents / chats still in `localStorage["localbot-state-v3"]` (Stage 7). Reveal in Finder/Explorer. Legacy tree helpers (`fs/company.ts`, `fs/company-disk.ts`) kept only for the grant tests.

See `STAGE_HANDOFF.md` for the exact prove-it command, pass output, and in-app test steps. Sections below that mention a single “company root”, `departments/{Dept}/people/{Emp}/bots/{Bot}` tree, `workspace/` / `outbox/` grants, or `fsSetCompanyRoot` describe the pre-Stage-2 layout and are superseded by `FOLDER_CONTRACT.md`.

---

## Update after Stage 1 — Clean foundation
2026-09-02 · branch `cursor/stage-1-clean-foundation-dad0`

**What actually WORKS now**
- Package is named `localbot` (`package.json` / `package-lock.json`), not `app-builder-workspace`.
- `npm run lint` (0 problems), `npm run typecheck`, and `npm test` (248 pass / 0 fail) all exit 0. Previously: 1 lint error, 2 type errors, 10 failing template tests.
- `.output/` and `.vercel/` are gitignored and no longer tracked (109 files removed from the index). `npm run build` still regenerates them and succeeds.
- Dead template code removed: `src/lib/multiplayer/` (unimported), the unused `isDesktopShell()` export, and a write-only `loadedPath` var.
- Existing dark UI / onboarding / hardware scan / catalog / llama.cpp loopback / Electron window are untouched: dev server serves HTTP 200 and the auth invariant still agrees (sign-in off).

**Still NOT BUILT (deferred to later stages)**
- Hosted-demo code still present (`hosted-turn.ts`, `allowHostedDemo` branch) — off by default behind the Settings safety switch.
- `auth/`, `db.ts` + `migrations/`, and the `grok-pwa` plugin remain: still imported by `__root.tsx` / `auth/server.ts` / `vite.config.ts`, so not dead by import check.
- Per-launch sidecar token + narrow preload/IPC bridge: NOT BUILT (`desktop/preload.mjs` exposes only window controls).
- Durable config off `localStorage`: NOT BUILT (`store.ts` still persists `localbot-state-v3`).

See `STAGE_HANDOFF.md` for the exact prove-it command and file list.

---

## Update after package pass
2026-09-01
- Packaged binary path: `dist/desktop/linux-unpacked/LocalBot` (this OS). macOS `dist/desktop/mac/LocalBot.app`. Windows `dist/desktop/win-unpacked/LocalBot.exe`.
- Packaged mode runs npm run dev? no. Electron's Node starts `resources/localbot-sidecar/sidecar.mjs` (copied out of asar so ESM import works), which loads the Nitro `node-server` build from `resources/localbot-server` on `127.0.0.1:18790`.
- Employee needs Node installed? no
- llama.cpp targets still: darwin-arm64, darwin-x64, win32-x64, linux-x64
- signed dmg/exe: still NOT BUILT
- This preview host has no libgtk-3, so the unpacked Linux binary cannot paint here. `npm run build:desktop` still writes `linux-unpacked`.

## Update after desktop pass
2026-09-01
- Electron window: yes (`npm run desktop` → `node desktop/launch.mjs` → `desktop/main.mjs`). Frameless-ish dark window, no URL bar. Renderer is the existing TanStack UI. This preview host is headless without libgtk-3, so the window cannot paint here; on a normal desktop with GTK/Cocoa/Win32 it opens.
- npm run desktop: the command that works for **dev** (may start Vite)
- npm run build:desktop: unsigned unpacked app
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
npm run build                 # Vercel web build (preview / deploy)
npm run build:desktop         # unsigned unpacked Electron app for this OS
```

Packaged binary (this Linux host): `dist/desktop/linux-unpacked/LocalBot`

That binary starts Electron's Node sidecar (`desktop/sidecar.mjs` → Nitro `node-server` on `127.0.0.1:18790`). It does **not** run `npm run dev`. The employee does **not** need Node on PATH.

**NOT BUILT:** signed macOS `.dmg`, Apple notarization, Windows EV-signed installer, Ubuntu `.deb` / AppImage store listing.


### Where data is stored

| Concept | Web preview | Electron |
|---|---|---|
| Company root | `{cwd}/data/LocalBot/{CompanyName}` | `{documents}/LocalBot/{CompanyName}` |
| Config | `{cwd}/data/localbot-config.json` | `{appData}/LocalBot/localbot-config.json` |
| File bodies | OS disk under the company root | same |
| Agent list, pins, ACP session ids (Stage 7) | `{cwd}/data/localbot-agents.json` + `agents/{Name}/agent.json` | `{appData}/LocalBot/localbot-agents.json` + same |
| Chats, chat grants (Stage 7) | `{cwd}/data/chats/{agentId}.json` | `{appData}/LocalBot/chats/` |
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
| DeepSeek Harness (`dsh`) | **WORKS** (Stage 4). `@deepseek-ai/dsh` 0.1.2-alpha.5 over ACP owns the loop; `harnessAdapter.ts` is a thin ACP client. |
| Ollama | **Not required.** Settings switch only; default off. |
| Chat default | `src/lib/runtime/harness.ts` → `src/lib/harness/` → `dsh --profile acp` → `localbot-llama` route → llama-server (Stage 4). `execute-turn.ts` / `runLocalTurn` are legacy, off the chat path. |
| Hosted grok-4.5 | `src/lib/runtime/hosted-turn.ts` **only if** `allowHostedDemo` |
| `src/lib/runtime/turn.ts` | Legacy single-completion server fn (`runSingleCompletion`). **Does not contain** `api.x.ai` |
| Tools | Harness `read`, `write`, `edit`, `glob`, `grep`, `bash` (sandboxed to `private/`, escalations ask). No web tool. |
| File tools | `dsh/localbot-fs.mjs` (in the Harness process) → `src/lib/fs/scopes.ts` `resolveScopePath` → `src/lib/fs/disk.ts` |

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
| Desktop app window | **WORKS** | Electron `npm run desktop` (dev) and `npm run build:desktop` (unsigned unpacked). No URL bar. This host cannot paint without GTK 3. |

| Fork / reuse of OpenMausBot | **NOT BUILT** | No OpenMausBot sources |
| No API key on first run | **WORKS** | Default path is local GGUF. `executeTurn` does not need `XAI_API_KEY` |
| Hardware scan | **WORKS** | Server `os.totalmem` / `freemem` / `statfs`. Browser guess is a footnote |
| Model recommendation | **WORKS** | `fitModel` / `onboardingCards` from `catalog/models.json`. 16 GB enables 3B |
| GGUF download into the app | **WORKS** | Small 0.5B Hub file on disk, magic + size + sha256. Pause/resume Range. Import copies bytes |
| Embedded local inference (no Ollama required) | **WORKS** | llama-server b10749, loopback OpenAI `/v1/chat/completions` |
| Hosted grok-4.5 as default | **NOT BUILT** | Opt-in Settings switch only |
| DeepSeek Harness as the loop | **WORKS** (Stage 4) | Real `dsh` over ACP; no `while (rounds < 6)` |
| Named multi-agent roster | **WORKS** | Sidebar mascots + `createBot` |
| Permission Allow/Deny | **WORKS** | Cards + grants |
| Company / department / employee / bot folders | **WORKS** | Disk seed |
| Department shared folder | **WORKS** | Real `{dept}/shared/` |
| Per-bot workspace isolation | **WORKS** | `pathAllowed` + server grant check |
| Outbox | **WORKS** | Real `{employee}/outbox/` |
| @bot handoff via shared task files | **WORKS** | `handoffTask` |
| macOS / Windows / Ubuntu installers | **PARTIAL** | Unsigned `--dir` unpacked app via electron-builder. Signed `.dmg` / `.exe` / `.deb` **NOT BUILT**. |
| Arabic UI / RTL | **NOT BUILT** | `html lang="en"` |
| Company root picker | **PARTIAL** | Absolute path field, no OS folder dialog |
| NAS / two-machine sharing | **NOT BUILT** | Same real folder on the server machine only |
| Filesystem watcher | **WORKS** (Stage 3) | `src/lib/fs/watch.ts` — `fs.watch` + bounded poll; pane polls `scopesStatus` |
| Streaming tokens | **NOT BUILT** | Single completion |
| Ollama | **STUB** | Optional “Use existing Ollama”, default off, not required |
| Control this computer | **WORKS** | Switch exists, default off |
| Loopback bind of a local model | **WORKS** | `127.0.0.1:18789` |
| Session transcripts | **WORKS** (Stage 7) | `{dataDir}/chats/{agentId}.json` + persisted ACP session ids in `localbot-agents.json` |
| Import local GGUF | **WORKS** | Settings + onboarding. Copies real bytes |
| Agent rename in UI | **WORKS** (Stage 5) | sidebar → Rename → sidecar `agentRename` moves `agents/{Old}/` → `agents/{New}/` |
| Agent archive / unarchive | **WORKS** (Stage 5) | `archived` in `agent.json`; files stay |
| Agent duplicate copies `private/` | **WORKS** (Stage 5) | `copyAgent` (`cpSync`) into a new folder |
| Browser tool | **NOT BUILT** | `web_search` gated |
| Agent mascots | **WORKS** | Writer / Researcher / Ops SVG set |

---

## 12. Known bugs and missing pieces

- **`node-llama-cpp` not compiled (documented blocker).** No cmake. Used official llama.cpp CPU tarball instead. Reproduce: there is no `node-llama-cpp` in `package.json`.
- **0.5B tool calling is limited (annoying, expected).** The Small model that fits 4 GB RAM can miss tools on harder asks. First-run “write hello.md” did emit `write_file` and the file landed on disk. Larger catalog rows are real Hub files but greyed on this machine.
- **Gemma 4 E2B / Qwen 3.5 not used.** 404 and gated 401. Replaced with Qwen 2.5 Instruct Q4 files. See `CATALOG.md`.
- **Official Qwen 7B Q4_K_M is split.** Large card uses bartowski single file.
- ~~Stop does not abort the HTTP call~~ — Stage 4: Stop is ACP `session/cancel`.
- **No token streaming (annoying).** Full reply lands at once.
- **`darkMode` / `denseUi` are dead (cosmetic).** Stored, not applied.
- ~~Rename missing from sidebar~~ — Stage 5 added Rename / Archive / disk-copying Duplicate.
- **Inbox grant has no Settings chip (cosmetic).**
- **`npm test` fails template PWA tests (annoying for CI).** LocalBot tests pass in isolation.
- **Company rename does not move folders (annoying).**
- ~~No `fs.watch`~~ — Stage 3 added watch/poll + Refresh.
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
