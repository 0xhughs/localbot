# LOCALBOT_HANDOFF.md

## Update after disk pass
2026-09-01
- File bodies: real disk under company root (`{cwd}/data/LocalBot/{CompanyName}`, config in `{cwd}/data/localbot-config.json`)
- Chat: still grok-4.5
- GGUF / llama.cpp / dsh / Electron: still not built

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
| Python | `3.10.21` present; unused by LocalBot |
| React / Vite / Start | `react ^19.2.0`, `vite ^8.2.0`, `@tanstack/react-start ^1.168.0` |
| Persistence | `localStorage` key `localbot-state-v2` (agents, chats, pins, grants). File bodies on disk at the company root. Config: `{cwd}/data/localbot-config.json`. |
| Last run | Dev on `:8080` HTTP 200. First-run seeds `{cwd}/data/LocalBot/Studio`. Writer chat wrote `workspace/hello.md` (6 bytes, contents `hello`) visible to `ls` and the Computer pane. Production smoke on `:8081` matched dev. |

This is a **new web app from scratch**, not an OpenMausBot fork, not a desktop binary.

---

## 2. How to run it on a clean machine

What actually exists is a TanStack Start web app. There is no installer.

### Prerequisites

- Node 22 (tested `v22.23.2`)
- npm 10 (lockfile is `package-lock.json`; there is no `pnpm-lock.yaml`, no `pnpm` requirement)
- A modern browser
- **For a real chat reply:** server env `XAI_API_KEY`. The UI never asks for a key. If the key is missing, `runHarnessTurn` returns `"AI is not available in this environment"` (`src/lib/runtime/turn.ts`).
- **Not required:** Python, GPU drivers, CUDA, Metal, Ollama, Hugging Face token, llama.cpp binary, DeepSeek Harness, Electron.

### Install

```bash
cd /workspace
npm install
```

(`node_modules` is already present in this sandbox.)

### Dev

```bash
sh /workspace/startup.sh
# equivalent when :8080 is down:
npm run dev
```

`package.json` script:

```
dev = node scripts/with-app-env.mjs vite dev --host 0.0.0.0 --port 8080
```

The preview / browser opens at `http://127.0.0.1:8080/` (binds `0.0.0.0:8080`). There is no native window.

### Production / packaged build

```bash
npm run build            # vite build + db:migrate
npm run preview:restart  # built output on 127.0.0.1:8081
```

**NOT BUILT:** macOS `.dmg` / `.app`, Windows installer, Ubuntu `.deb` / AppImage, Electron packager, Tauri, llama.cpp binary shipping.

### Where data is stored

| Concept | Actual store |
|---|---|
| Company root | Real directory, default `{cwd}/data/LocalBot/{CompanyName}` |
| Chosen path | `{cwd}/data/localbot-config.json` via `src/lib/fs/disk.ts` `saveConfig` |
| File bodies (workspace, output, shared, outbox, memory) | OS disk under the company root. `src/lib/fs/disk.ts` |
| Agent list, chats, pins, grants, selected catalog | `localStorage["localbot-state-v2"]` (zustand persist in `src/lib/store.ts`). **No file bodies.** |
| Models / GGUF | **Not stored.** Catalog id only. |

This preview writes under the project `data/` folder. Uninstalling the browser profile does **not** delete the company root on disk.

---

## 3. What the user sees

First launch as a new employee (`src/components/localbot/onboarding.tsx`).

### 1. Splash / onboarding

**WORKS (web wizard).** Three welcome screens, then hardware, catalog placeholder, first agent.

1. **hello** — “Your agents, in this browser.”
2. **stay** — “Chat is hosted grok-4.5.” (honest: no local GGUF)
3. **grants** — “Work files go on disk.”

Then: **scan → models (placeholder, no download) → agent**. Land in chat (`completeOnboarding` seeds the disk tree, sets `onboarded: true`, selects the bot).

No native splash window. Hydration splash is the wordmark on `#0a0b0d` (`src/components/localbot/app.tsx`).

### 2. Hardware scan

**PARTIAL.** `scanBrowserHardware()` in `src/lib/hardware.ts`.

Browser estimate of RAM/GPU. Does not change chat in this build. Copy says so.

### 3. Model picker

**STUB / placeholder.** Title: “Choose a catalog size (placeholder)”. Cards are planned local models. Clicking stores `selectedCatalogId` only. No Hub download, no GGUF blob, no progress bar.

Catalog file on disk: [`catalog/models.json`](catalog/models.json) pin `2026.09-localbot-1`. **The running app does not load that JSON.** It uses the duplicate array `CATALOG` in `src/lib/catalog.ts`.

### 4. First agent

**WORKS.** Form: Company, Department, Your name, checkbox “This path is a shared drive” (copy only), company root **absolute path** field (default `{cwd}/data/LocalBot/{Company}`), templates Writer / Researcher / Ops, agent name, job, color. “Open chat” creates real folders.

Onboarding copy notes: “This preview writes to the project data folder.”

### 5. Chat

**WORKS** with `XAI_API_KEY`. Header badge: `Hosted grok-4.5` or `AI unavailable`. Tool chips, permission cards (Allow once / Allow for this chat / Deny), `@mention` writes `shared/task-*.md` on disk. Stop cancels the client loop between rounds; it does not abort the in-flight xAI fetch (`createServerFn` cannot take AbortSignal — comment in `src/lib/runtime/turn.ts` and `src/runtime/harnessAdapter.ts`).

### 6. Computer pane

**WORKS from disk.** Lists workspace / output / shared / outbox via `fsList`. Refreshes on `diskEpoch` after writes. Preview of selected file via `fsRead`. Reveal path copies the absolute workspace path.

### 7. Settings

General / Models / Company / Runtime / Safety.

- General: honest “browser app / hosted grok-4.5 / files on disk”.
- Models: catalog listed as **Not wired**.
- Company: absolute path field, **Use this path**, **Create folders here**, **Reveal path**, shared-drive checkbox (copy only), grants chips, add department/employee/agent.
- Runtime: engine `hosted-grok-4.5`, model `grok-4.5`, AI status, company root.

---

## 4. Chat / inference

**NOT local.**

| Piece | Status |
|---|---|
| Embedded llama.cpp / node-llama-cpp | **NOT BUILT.** No package, no binary, no process. |
| DeepSeek Harness (`dsh`) | **NOT BUILT.** `harnessAdapter.ts` is a custom 6-round tool loop. |
| Ollama | **NOT required. Not connected.** |
| Chat HTTP | `POST https://api.x.ai/v1/chat/completions` model `grok-4.5` in `src/lib/runtime/turn.ts` |
| Tools | `read_file`, `write_file`, `str_replace`, `list_dir`, `delete_file`, `run_command`, `web_search` (gated) |
| File tools | `harnessAdapter` → store `writeBotFile` etc. → `src/lib/fs/server.ts` → `src/lib/fs/disk.ts` |
| Relative names | `resolveAgentFilePath("hello.md")` lands in the bot workspace |

`getAiStatus` checks presence of `XAI_API_KEY` (no xAI spend on load). Called from `src/components/localbot/app.tsx` after hydrate.

---

## 5. Files / disk adapter

`src/lib/fs/disk.ts` — pure `node:fs`. Tests import it directly.

`src/lib/fs/server.ts` — `createServerFn` RPC: `fsList`, `fsRead`, `fsWrite`, `fsMkdir`, `fsDelete`, `fsExists`, `fsStat`, `fsReplace`, `fsMove`, `fsTree`, `fsRunCommand`, `fsSeedCompanyTree`, `fsSeedBot`, `fsSeedDepartment`, `fsSeedEmployee`, `fsGetCompanyRoot`, `fsSetCompanyRoot`.

Rules:

- Resolve under one absolute company root (`path.resolve` + `path.relative` prefix check).
- Refuse `..` / paths outside the root (`assertInsideRoot`).
- Grant check again on the server when `allowedRoots` is passed (`authorize`).
- Default root: `{cwd}/data/LocalBot/{CompanyName}`.
- Config: `{cwd}/data/localbot-config.json`.

`src/lib/fs/vfs.ts` still exists as leftover in-memory helpers (`normalizePath` re-exported from `utils.ts`). **Not the storage backend.**

Toy shell (`diskShell`): `ls`, `cat`, `mkdir`, `touch`, `rm`, `echo`, `mv`, `cp`, `head`, `pwd`. Scoped to company root + grants.

---

## 6. Folder contract

On onboarding finish and on **Create folders here**:

```
{companyRoot}/
  company.json
  shared/
  departments/
    {Dept}/
      department.json
      shared/
      people/
        {Employee}/
          employee.json
          inbox/
          outbox/
          bots/
            {Bot}/
              bot.json
              AGENTS.md
              memory/notes.md
              workspace/
              output/
```

`hello.md` written by the agent lands at:

`{companyRoot}/departments/{Dept}/people/{Employee}/bots/{Bot}/workspace/hello.md`

Grants: workspace, output, shared, outbox default on first agent. `pathAllowed` in the browser; `grantAllowed` on the server.

`@Name` → `shared/task-*.md` on disk + a system notice in the other agent’s chat (`handoffTask`).

Two laptops share work only if they point at the **same real folder** on the machine running `npm run dev`. The checkbox only changes copy.

---

## 7. Catalog

Pinned file `catalog/models.json`. Duplicate array `CATALOG` in `src/lib/catalog.ts`. Settings lists them disabled with “Not wired in this build.” Onboarding does not download.

---

## 8. Tests

```
node --experimental-strip-types --test src/lib/localbot.test.ts
```

Asserts against **real temp directories** (`fs.mkdtempSync`):

- Hardware fit still refuses a 27B on 4 GB.
- `seedCompanyTreeOnDisk` creates the folder contract (`fs.existsSync`).
- Writing `hello.md` (including via `resolveAgentFilePath("hello.md")`) is visible to `fs.existsSync`.
- Grant deny: `pathAllowed` false + `diskWrite` with `allowedRoots` throws.
- Writing outside company root throws.
- Two bots with `shared` grant both write files into the same department `shared/` on disk.

No checksum / synthetic GGUF test.

---

## 9. Safety

- Writes outside company root throw `Denied: … is outside company root`.
- Writes outside grants throw `Denied: … is outside this agent's grants.`
- `controlThisComputer` skips the shell permission card; the shell is still scoped to the company root.
- Web search is off by default and always asks.
- No LAN bind of a local model. `src/runtime/loopback.ts` constants remain unused.

---

## 10. What is leftover and unused

- `src/lib/fs/vfs.ts` — old in-memory VFS helpers
- `src/lib/checksum.ts` — synthetic GGUF blob helper, unused
- `src/lib/fs/shell.ts` — old VFS shell
- `src/runtime/loopback.ts` — 127.0.0.1:18789 constants
- `src/lib/multiplayer/` — template leftover, not imported

---

## 11. Feature scorecard

| Requirement | Status | Evidence |
|---|---|---|
| Desktop app window | **NOT BUILT** | Web document titled LocalBot. No Electron/Tauri. `src/routes/__root.tsx` |
| Fork / reuse of OpenMausBot | **NOT BUILT** | No OpenMausBot sources, no git remote. New TanStack app |
| No API key on first run | **PARTIAL** | UI never asks. Chat needs `XAI_API_KEY` on the server (`src/lib/runtime/turn.ts`) |
| Hardware scan | **PARTIAL** | Browser UA / deviceMemory / WebGL; disk hardcoded; RAM assumed 16 GB on desktop (`src/lib/hardware.ts`) |
| Model recommendation | **WORKS** | `fitModel` / `onboardingCards` / `src/lib/catalog.ts`; catalog is a placeholder |
| GGUF download into the app | **NOT BUILT** | Catalog id only. No Hub fetch, no GGUF blob. `src/components/localbot/onboarding.tsx` |
| Embedded local inference (no Ollama required) | **NOT BUILT** | Inference is `https://api.x.ai/v1/chat/completions` model `grok-4.5` |
| DeepSeek Harness as the loop | **NOT BUILT** | `harnessAdapter.ts` is a custom loop. No `dsh` package |
| Named multi-agent roster | **WORKS** | Sidebar + `createBot`; no cap (`src/components/localbot/sidebar.tsx`, `store.ts`) |
| Permission Allow/Deny | **WORKS** | Cards + grants (`src/lib/permissions.ts`, `chat.tsx` `PermissionCard`) |
| Company / department / employee / bot folders | **WORKS** | Seeded on disk under company root (`src/lib/fs/company-disk.ts`, `src/lib/fs/disk.ts`) |
| Department shared folder | **WORKS** | Real directory `{dept}/shared/`; same-process bots can both write |
| Per-bot workspace isolation | **WORKS** | `pathAllowed` + server prefix/grant check. `writeBotFile` returns Denied |
| Outbox | **WORKS** | Real `{employee}/outbox/` on disk. UI copies the absolute path |
| @bot handoff via shared task files | **WORKS** | `handoffTask` writes `shared/task-*.md` (`src/lib/store.ts`, `chat.tsx`) |
| macOS build | **NOT BUILT** | No packager |
| Windows build | **NOT BUILT** | No packager |
| Ubuntu build | **NOT BUILT** | No packager |
| Arabic UI / RTL | **NOT BUILT** | `html lang="en"`; no `dir="rtl"`; no Arabic strings |
| Company root picker | **PARTIAL** | Absolute path field + Create folders here. No OS folder dialog. Remaps bot/dept paths on Use this path |
| NAS / two-machine sharing | **NOT BUILT** | Checkbox + copy. Same real folder on the server machine only |
| Filesystem watcher | **NOT BUILT** | Computer pane refetches on `diskEpoch` after our writes |
| Streaming tokens | **NOT BUILT** | Single completion |
| Ollama advanced attach | **NOT BUILT** | Removed from Settings |
| Control this computer | **WORKS** | Switch exists, default off |
| Loopback bind of a local model | **NOT BUILT** | Constants remain in `src/runtime/loopback.ts`; unused |
| Session transcripts | **PARTIAL** | Chat in `localStorage` (`localbot-state-v2`). No transcript file on disk |
| Import local GGUF | **NOT BUILT** | Removed from Settings |
| Agent rename in UI | **STUB** | `renameBot` in store, unused in sidebar |
| Browser tool | **NOT BUILT** | Classified as always-ask; `web_search` executeTool returns a gated string |

---

## 12. Known bugs and missing pieces

- **No local model (blocker for the original product).** Chat is grok-4.5 via `XAI_API_KEY`. Reproduce: send a message; inspect `src/lib/runtime/turn.ts`. Without the key, every turn errors “AI is not available in this environment.”
- **No GGUF download (blocker for local inference).** Onboarding stores `selectedCatalogId` only. No Hub fetch, no weights on disk.
- **No desktop builds (blocker for “install on a laptop”).** No packager scripts.
- **Catalog SHA-256 placeholders (annoying).** Lengths 63 and 64 mixed; never verified against a real file (`catalog/models.json`).
- **Catalog JSON unused (annoying).** Two sources of truth: `catalog/models.json` vs `src/lib/catalog.ts`.
- **Stop does not abort the HTTP call (annoying).** AbortSignal cannot be forwarded through `createServerFn`. Stop cancels between tool rounds only.
- **No token streaming (annoying).** Full reply lands at once.
- **Hardware RAM/disk are guessed (annoying).** Desktop RAM forced to 16 GB class; disk always 180 GB.
- **`darkMode` / `denseUi` are dead (cosmetic / stub).** Stored, not applied.
- **Rename missing from sidebar (cosmetic).** Store action exists.
- **Inbox grant has no Settings chip (cosmetic).**
- **`npm test` fails 8 template PWA tests (annoying for CI).** LocalBot tests pass in isolation.
- **Unused `src/lib/multiplayer/` (cosmetic).** Template leftover.
- **Company rename does not move folders (annoying).** `renameCompany` changes `company.name` only. Path remap happens on **Use this path**.
- **No `fs.watch` (annoying).** Computer pane refreshes on `diskEpoch` after this process writes; another OS process writing `shared/` is not picked up until a later write.

---

## 13. Files I should read first

1. `src/lib/runtime/turn.ts` — actual model call (xAI grok-4.5), not llama.cpp.
2. `src/runtime/harnessAdapter.ts` — agent loop, tools. File tools go through disk server functions.
3. `src/lib/store.ts` — app state (not file bodies), onboarding, handoff.
4. `src/lib/fs/disk.ts` — Node `fs` adapter, root escape check, grant check.
5. `src/lib/fs/server.ts` — `createServerFn` RPC for the UI.
6. `src/lib/fs/company.ts` — folder contract helpers + `resolveAgentFilePath`.
7. `src/lib/fs/company-disk.ts` — seed the tree on disk.
8. `src/lib/permissions.ts` — Allow/Deny rules (browser); server re-checks.
9. `src/lib/catalog.ts` — catalog + fit rule (placeholders).
10. `catalog/models.json` — pinned catalog file (not loaded).
11. `src/lib/hardware.ts` — browser scan + assumed RAM/disk.
12. `src/components/localbot/onboarding.tsx` — first-run UX.
13. `src/components/localbot/chat.tsx` — send, permissions, @mention, Stop, runtime badge.
14. `src/lib/localbot.test.ts` — temp-dir disk assertions.
15. `package.json` — no llama, no dsh, no electron; `name: app-builder-workspace`.

---

## 14. Demo script

Desired:

1. start the app
2. create agent Writer
3. ask it to write `hello.md` into its workspace
4. show the file on disk
5. show that it cannot write outside the grant

What this build can and cannot do:

1. **Start — WORKS (web).** `sh /workspace/startup.sh` or `npm run dev`. Open the preview. First-run wizard.
2. **Create Writer — WORKS.** Walk hello → stay → grants → scan → pick a catalog placeholder → name company/dept/you/Writer, set company root → Open chat. Seeds real folders under `{cwd}/data/LocalBot/{Company}`.
3. **Ask it to write `hello.md` — WORKS if the key is set.** Composer: `Write hello.md into your workspace with the text hello`. grok-4.5 calls `write_file`; the disk adapter creates the file. If the key is missing, the assistant message is `AI is not available in this environment`. This is **not** a local GGUF doing the write.
4. **Show the file on disk — WORKS.** Path: `{companyRoot}/departments/{Dept}/people/{You}/bots/Writer/workspace/hello.md`. `ls` on the server machine sees it. Computer pane lists it from disk.
5. **Cannot write outside the grant — WORKS.** Unit test `agent is denied from writing outside grants` uses `fs.existsSync` / `diskWrite` with `allowedRoots`. A tool call to another employee’s tree returns `Denied: … is outside this agent's grants.` even if the user clicks Allow. Paths that escape the company root throw.

The original success picture — install a desktop app, download Recommended GGUF, two OS users sharing Finance files on a NAS — **still cannot be demoed.** It breaks at: no installer, no GGUF, no llama.cpp. Same-machine folder sharing works if both point at the same real directory.

---

End of handoff. This file is the state of `/workspace` on 2026-09-01, not a roadmap.
