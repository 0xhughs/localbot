# LOCALBOT_HANDOFF.md

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
| Persistence | `localStorage` key `localbot-state-v1` (zustand persist in `src/lib/store.ts`) |
| Last run | `sh /workspace/startup.sh` → `npm run dev` (`vite dev --host 0.0.0.0 --port 8080`). Probe `http://127.0.0.1:8080/` returned HTTP 200 at handoff time. Browser smoke (`screenshots/app-builder-preview.json`) recorded title `LocalBot`, first-run copy “Your agents, on this computer.” |

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

On a real desktop this was supposed to be `~/.localbot` and `{documents}/LocalBot/{CompanyName}/`. **That is not what the code writes.**

| Concept | Code constant | Actual store |
|---|---|---|
| App home (`localbotHome`) | `DEFAULT_HOME = "/LocalBot"` in `src/lib/fs/company.ts` | In-memory VFS (`Record<path, FsNode>`) persisted in `localStorage` under `localbot-state-v1` |
| Models | `/LocalBot/models/{filename}` | Same VFS. File content is a tiny synthetic `GGUF\n{json}\n` string from `ggufBlob()` (`src/lib/checksum.ts`), not a real GGUF |
| Sessions / transcripts | `/LocalBot/sessions/{agentId}/transcript.json` | Same VFS, written by `persistTranscript` in `src/runtime/harnessAdapter.ts` |
| Logs dir | `/LocalBot/logs` | Seeded empty by `seedHome` |
| Company root | `DEFAULT_COMPANY_ROOT = "/Documents/LocalBot"` then `/{CompanyName}` | Same VFS. Example after onboarding company `Studio`: `/Documents/LocalBot/Studio/...` |
| Config | zustand snapshot | `localStorage["localbot-state-v1"]` |

Nothing is written to the OS filesystem except Vite/build artifacts. Uninstalling the browser profile deletes the company tree.

UI copy still says `~/.localbot` (`src/components/localbot/settings.tsx` General pane, onboarding download copy). That path is **not created**.

---

## 3. What the user sees

First launch as a new employee (`src/components/localbot/onboarding.tsx`).

### 1. Splash / onboarding

**WORKS (web wizard).** Three welcome screens, then hardware, models, download, first agent.

1. **hello** — “Your agents, on this computer.”
2. **stay** — “Work stays here.” (copy claims no cloud account / no key / model is a file on disk)
3. **grants** — “Agents only touch folders you grant.”

Then: **scan → models → download → agent**. Land in chat (`completeOnboarding` sets `onboarded: true`, selects the bot).

No native splash window. Hydration splash is the wordmark on `#0a0b0d` (`src/components/localbot/app.tsx`).

### 2. Hardware scan

**PARTIAL.** `scanBrowserHardware()` in `src/lib/hardware.ts`.

Measures / shows:

| Field | Source | Honest? |
|---|---|---|
| OS / arch | `navigator.userAgent` + `navigator.platform` | Best-effort UA parse |
| CPU cores | `navigator.hardwareConcurrency` | Real browser value |
| RAM total / free | `navigator.deviceMemory` | Browsers cap this at 8. If reported `8` or missing on desktop, code **assumes 16 GB total, available = total − 3.5**. Source field: `assumed-desktop`. On mobile: reported or 6, minus 1.5 |
| GPU name | WebGL `UNMASKED_RENDERER_WEBGL` | If the extension exists |
| VRAM | Guessed from renderer string (`RTX 4090` → 24, `RTX 4060` → 8, iGPU → 0). Apple Silicon forces `vramGb: null` | Heuristic, not a driver query |
| Apple Silicon | UA / platform heuristics (MacIntel treated as Apple Silicon) | Heuristic |
| Free disk | **Hardcoded** `180` GB desktop / `12` GB mobile | Fake |

UI shows a 6-cell grid: OS, CPU cores, RAM, GPU, Apple Silicon, Free disk. ~1.1 s fake scan delay.

### 3. Model picker

**WORKS as UI.** Three cards: Small / Recommended / Large from `onboardingCards()` (`src/lib/catalog.ts`).

Catalog file on disk: [`catalog/models.json`](catalog/models.json) pin `2026.09-localbot-1`. **The running app does not load that JSON.** It uses the duplicate array `CATALOG` in `src/lib/catalog.ts`.

Exact ids listed:

- `gemma4-e2b-q4` (small)
- `qwen35-4b-q4` (small)
- `gemma4-e4b-q4` (recommended)
- `qwen35-9b-q4` (recommended)
- `gemma4-12b-q4` (large)
- `qwen35-27b-q4` (large)

Onboarding cards pin display to E2B / E4B / 12B (not the Qwen alternates) even though all six exist in Settings → Models.

Grey-out uses `fitModel`. Desktop machines that fail Small still get Small forced `fits: true` with a “Tight fit … Small still loads on CPU” reason (`onboardingCards`).

### 4. Download

**STUB. Does not download a GGUF.**

- Progress bar in `DownloadStep` ticks `+0.04 + random` every 80 ms. Pause / Resume only pause that timer.
- On “done”, `completeDownload(catalogId)` (`src/lib/store.ts`) calls `ggufBlob()` which returns a ~200-byte string starting with `GGUF\n` plus JSON metadata. That string is stored in the VFS at `/LocalBot/models/{filename}`.
- SHA-256 is computed of **that synthetic blob**, not of a Hub file. Catalog `sha256` values are placeholders (two of six are 63 hex chars, not 64). They are stored as `catalogSha256` inside the blob and **not compared**.
- **No Hugging Face URL is fetched.** No `huggingface.co` string exists under `src/`. No resume of bytes. No Range headers.
- Copy says “Writing into ~/.localbot/models”. Actual path in VFS: `/LocalBot/models/{filename}`.

### 5. First agent creation

**WORKS in the VFS.** Form fields: Company (default `Studio`), Department (`Operations`), Your name (`You`), checkbox “Company root is a shared drive”, template chips Writer / Researcher / Ops, agent name, job, color.

Finish calls `completeOnboarding`. Seeds company tree + first bot with grants `["workspace","output","outbox","shared"]`.

Path preview shown as:

```
/Documents/LocalBot/{Company}/departments/{Dept}/people/{Employee}/bots/{Bot}/
```

No OS folder picker. Company root is not choosable; it is always `/Documents/LocalBot/{CompanyName}`.

### 6. Main window

**WORKS as a web shell** (`src/components/localbot/shell.tsx`).

- **Sidebar** (`sidebar.tsx`): wordmark, company name, agent list (pin, unread dot, duplicate, hide, delete). **Rename is in the store (`renameBot`) but has no menu item.** New agent button. Footer shows downloaded model name.
- **Chat** (`chat.tsx`): header (name, job, model, **Stop**, computer toggle), timeline, composer, attach-file (reads as text into workspace), `@name` hint.
- **Permission cards**: Allow once / Allow for this chat / Deny, inline.
- **Computer pane** (`computer.tsx`): trees for workspace / output / shared / outbox, file preview, Outbox button copies path to clipboard, “Reveal path” copies workspace path. No OS file manager.
- **Settings** (`settings.tsx`): tabs General / Models / Company / Runtime / Safety.
- **Command palette** (`palette.tsx`): `⌘K` / `Ctrl+K`, `⌘N` new agent, `⌘,` settings, Esc closes overlays.

Dark, dense, IBM Plex. `html lang="en"`. **No Arabic / RTL.**

---

## 4. Architecture as built

### Real runtime path

```
UI (React, src/components/localbot/*)
  → src/runtime/harnessAdapter.ts  runAgentLoop()
    → src/lib/runtime/turn.ts      runHarnessTurn  (TanStack server function)
      → POST https://api.x.ai/v1/chat/completions
         model "grok-4.5"
         Authorization: Bearer process.env.XAI_API_KEY
```

Tool calls come back from grok-4.5, then `executeTool` in the adapter mutates the in-browser VFS via zustand (`writeBotFile`, `readBotFile`, `shellBot`, …).

The UI does not call xAI directly. That is the only part of the four-layer claim that is true.

### What is **not** on that path

| Claim in ARCHITECTURE.md / README | Reality |
|---|---|
| OpenMausBot fork | **NOT BUILT.** No upstream remote, no OpenMausBot files. New app. |
| Embedded llama.cpp / node-llama-cpp | **NOT BUILT.** No package, no binary, no process. Runtime UI *labels* the engine `"embedded-llama.cpp"` (`src/lib/store.ts`). |
| Local OpenAI endpoint `http://127.0.0.1:18789/v1` | **STUB.** Constants in `src/runtime/loopback.ts`. Nothing listens on 18789. `HARNESS_MODEL_ENDPOINT` is exported and unused by `turn.ts`. |
| DeepSeek Harness (`dsh` / `@deepseek-ai/dsh`) | **NOT BUILT.** Not in `package.json`. Adapter comment says it isolates Cordis plugins; there are none. |
| Ollama | **NOT required. Not connected.** Settings checkbox `useExistingOllama` only flips a boolean. |
| Other agent loop | Custom 6-round tool loop in `harnessAdapter.ts` + xAI function-calling. |

### Which statement is true

- **New app from scratch** (TanStack Start web app in the App Builder workspace).
- Not an OpenMausBot fork.
- Not embedded llama.cpp.
- Ollama not required and not used.
- DeepSeek Harness not integrated, not version-pinned.

### Important directories

```
/workspace
  catalog/models.json          Pinned catalog (not imported at runtime)
  src/components/localbot/     Entire UI
  src/lib/catalog.ts           Runtime catalog + fit rule
  src/lib/hardware.ts          Browser hardware scan
  src/lib/checksum.ts          Synthetic GGUF blob + SHA-256 of that blob
  src/lib/fs/vfs.ts            In-memory posix VFS
  src/lib/fs/company.ts        Folder contract seeders + JSON writers
  src/lib/fs/shell.ts          Toy shell (ls/cat/mkdir/…) scoped to company root
  src/lib/permissions.ts       Grant + always-ask classifier
  src/lib/store.ts             Zustand app state
  src/lib/runtime/prompt.ts    System prompt from VFS memory/AGENTS.md
  src/lib/runtime/turn.ts      xAI chat completions server fn
  src/runtime/harnessAdapter.ts Agent loop + tool execution
  src/runtime/loopback.ts      127.0.0.1:18789 constants + key checks
  src/lib/localbot.test.ts     Product tests (VFS, not OS disk)
  src/lib/multiplayer/         Template WebRTC helper — unused by LocalBot
  src/lib/auth/, src/lib/db.ts Template auth/db — LocalBot does not use accounts
  README.md, ARCHITECTURE.md, FOLDER_CONTRACT.md, CATALOG.md
  startup.sh                   Starts npm run dev on :8080
```

---

## 5. Model system

### Catalog file

- Path: `/workspace/catalog/models.json`
- Pin: `2026.09-localbot-1`, `updated: 2026-09-01`
- Runtime duplicate: `src/lib/catalog.ts` (`CATALOG_PIN` same string)
- `models.json` is **not imported** anywhere under `src/`

### Exact model ids

`gemma4-e2b-q4`, `qwen35-4b-q4`, `gemma4-e4b-q4`, `qwen35-9b-q4`, `gemma4-12b-q4`, `qwen35-27b-q4`

Repos listed (never fetched): `ggml-org/gemma-4-E2B-GGUF`, `Qwen/Qwen3.5-4B-GGUF`, `ggml-org/gemma-4-E4B-GGUF`, `Qwen/Qwen3.5-9B-GGUF`, `ggml-org/gemma-4-12B-GGUF`, `Qwen/Qwen3.5-27B-GGUF`. Whether those Hub filenames currently exist is **UNVERIFIED** — this tree never hits the Hub.

### Hardware fit rule

**WORKS in code.** `requiredMemoryGb = fileGB + 2.5 + 0.5 * (contextK/8)` (`src/lib/catalog.ts`). NVIDIA path uses `vramGb` instead of RAM when set and not Apple Silicon. Apple Silicon uses unified `availableRamGb`.

Desktop Small is force-enabled even when the formula fails. That is a deliberate override, not the formula.

### Download

**STUB.** See §3.4. No Hugging Face URL, no resume of bytes, no catalog checksum check. Pause/resume is UI-only.

Import GGUF in Settings: file input `accept=".gguf"` uses **filename + size only**, then writes another synthetic blob. The file bytes are discarded.

### How the local server is started

**NOT BUILT.** Nothing spawns llama.cpp. Chat goes to xAI. Settings → Runtime displays:

- Engine: `embedded-llama.cpp` (label only)
- Mode: `standard`
- Bind: `127.0.0.1:18789`
- OpenAI base: `http://127.0.0.1:18789/v1`
- Loopback only: Yes
- Provider keys: “None on the default path”

`assertLoopbackOnly()` would throw on `0.0.0.0`. It is only called from unit tests, not at process start. The **web** server binds `0.0.0.0:8080` (preview), which is a different process.

### If the machine cannot fit any catalog model

On desktop, Small is still offered (tight-fit override). On mobile, Small can remain grey. There is no “no model available” dead-end screen. User can still pick a grey card only if it is not `disabled`; grey cards are `disabled={!fit?.fits}`. If all three are null/disabled, Continue from models is blocked because there is nothing to click. **UNVERIFIED** on a real 4 GB phone; the 4 GB Linux fixture in tests refuses `qwen35-27b-q4`.

---

## 6. Folder contract

### Tree the app actually creates (VFS, one real onboarding)

Home:

```
/LocalBot/
  models/
    {filename}                 # synthetic GGUF string
    {catalogId}.json
  sessions/{agentId}/          # created when a turn persists a transcript
  logs/                        # empty dir
```

Company (example names Studio / Operations / You / Writer):

```
/Documents/LocalBot/Studio/
  company.json
  shared/
  departments/
    Operations/
      department.json
      shared/
        .keep
      people/
        You/
          employee.json
          inbox/
          outbox/
            .keep
          bots/
            Writer/
              bot.json
              AGENTS.md
              memory/notes.md
              workspace/
              output/
```

This tree exists only inside zustand `files` / localStorage. `src/lib/localbot.test.ts` asserts it with the in-memory VFS helper, not `fs.existsSync`.

### WORKS / STUB / NOT BUILT

| Feature | Status | Notes |
|---|---|---|
| Company root picker (local disk) | **STUB** | Name field only. Path hardcoded `/Documents/LocalBot/{CompanyName}`. No `<input type="file" webkitdirectory>` / no OS picker. |
| Company root on a network drive / NAS | **NOT BUILT** | Checkbox `companyRootIsShared` stored in settings. No path, no mount, no SMB/NFS. |
| departments | **WORKS** (VFS) | `createDepartment("Research")` in Settings. Seeds `department.json` + `shared/`. |
| department `shared/` | **WORKS** (VFS) | Default grant on first agent. |
| employee folders | **WORKS** (VFS) | `createEmployee(..., "Teammate")` in Settings. |
| per-bot `workspace/`, `memory/`, `output/` | **WORKS** (VFS) | Seeded in `seedBotFolder`. |
| outbox | **WORKS** (VFS) | `{employee}/outbox/`. UI button copies path. Prompt tells the model to copy deliverables there. |
| grants (bot A can read dept shared, cannot read another employee’s private bots) | **WORKS** (VFS permission check) | `pathAllowed` / `classifyToolCall`. `writeBotFile` returns `Denied: … is outside this agent's grants.` Inbox grant exists in types + `grantPathFor` but is **not** in the Settings chip list. |
| filesystem watcher when another process writes `shared/` | **NOT BUILT** | No `fs.watch`. Computer pane re-renders because VFS is React state. Another OS process cannot write into it. |

### Real JSON schemas (as written by `src/lib/fs/company.ts`)

`company.json`:

```json
{
  "name": "<company.name>",
  "catalogPin": "<company.catalogPin>",
  "defaultDepartment": "<department.name>"
}
```

`employee.json`:

```json
{
  "displayName": "<employee.displayName>",
  "department": "<department.name>",
  "defaultModel": "<employee.defaultModelId>"
}
```

`bot.json`:

```json
{
  "name": "<bot.name>",
  "job": "<bot.job>",
  "modelId": "<bot.modelId>",
  "color": "<bot.color>",
  "grants": ["workspace", "output", "outbox", "shared"],
  "createdAt": "<iso>"
}
```

`department.json`: `{ "name": "<department.name>" }`

---

## 7. Agents and chat

- **How many agents:** no cap in `createBot`. Original prompt said do not cap below 20. Code has no cap at all.
- **How a chat turn is sent:** composer Enter (Shift+Enter newline) → `ChatPane.send` (`src/components/localbot/chat.tsx`) appends a user message, handles `@mentions`, then `runAgentLoop`.
- **Streaming:** **NOT BUILT.** `runHarnessTurn` is one non-streaming `fetch`. UI shows “Thinking” / tool chips, then the full assistant message.
- **Permission cards:**
  - Auto-allow (`alwaysAsk: false`): read/write/edit inside workspace, output, shared (if granted), company-shared (if granted), outbox (if granted).
  - Always ask: shell (`run_command`) unless Settings “Control this computer” is on; deletes; writes outside those quiet roots; network / browser; anything leaving company root.
  - Denied by grant even if the user clicks Allow: `decision === "deny" || !cls.allowedByGrant`.
  - Buttons: Deny / Allow once / Allow for this chat (stores `chatGrants` for the session).
- **`@mention` another bot:** regex `@([A-Za-z0-9_-]+)` in the user text. `handoffTask` writes `task-{ts}-{from}-to-{to}.md` into department `shared/` and appends a system message on the target bot + unread bump. Requires **both** bots to have the `shared` grant. Does not start a turn on the other bot. No multi-user server.
- **Stop / kill switch:** header Stop button aborts the `AbortController` and `requestStop(botId)` (`running: false`, `stopRequested: true`). Loop checks abort + `stopRequested` between rounds. **Cannot cancel the in-flight xAI HTTP request** (no AbortSignal passed into `runHarnessTurn`).
- **Memory files:** `{bot}/memory/notes.md` seeded. System prompt reads it each turn (`src/lib/runtime/prompt.ts`). Standing instructions from `{bot}/AGENTS.md`.
- **Computer / file pane:** see §3.6. Not an OS computer. Attach file: browser File object → UTF-8 text → `writeBotFile` into workspace.

Max tool rounds per user message: **6**. Then assistant says “Stopped after too many tool rounds.”

---

## 8. Sharing across two computers

If Employee One and Employee Two each “install” this build, they **do not** see the same Finance files. Each browser origin has its own `localStorage`. There is no shared disk, no NAS path, no sync, no P2P for files (`src/lib/multiplayer/p2p.ts` is leftover template code and is not imported by LocalBot). The Settings checkbox “This path is a shared drive” only stores `settings.companyRootIsShared` and shows the sentence “Shared departments require a shared folder path.” Two bots **in the same browser profile** can both write department `shared/` in the VFS; that is the only sharing that works.

---

## 9. Security

- **Loopback-only bind:** asserted in unit tests for host `127.0.0.1` port `18789`. **No llama.cpp process is bound.** Quote from `src/runtime/loopback.ts`:

  ```
  LOOPBACK_HOST = "127.0.0.1"
  LOOPBACK_PORT = 18789
  LOCAL_OPENAI_BASE_URL = "http://127.0.0.1:18789/v1"
  ```

  The **UI** server binds `0.0.0.0:8080` (not the model).
- **Default workspace scope:** that bot’s `workspace/` (plus output, outbox, department shared on first agent). Not the OS home directory.
- **Can an agent touch the home directory?** In this VFS, only granted subtrees of `/Documents/LocalBot/{Company}` and the bot folder. `pathAllowed` is prefix-based. There is no OS `$HOME`. `controlThisComputer` only skips the shell permission card; the toy shell still refuses paths outside `company.root` (`src/lib/fs/shell.ts` `Refusing path outside sandbox`).
- **Secrets / API keys required?** UI default path: none. Chat replies require **server** `XAI_API_KEY` (app-owner quota). Tests check `DEFAULT_RUNTIME_KEYS = {}` and `hasProviderKeys` for Anthropic/OpenAI/DeepSeek/Groq/Together — they do **not** look at `XAI_API_KEY`.
- **“Control this computer” switch:** **exists**, Settings → Safety, default **off**, red warning. Turns off `alwaysAsk` for shell.

---

## 10. Tests

Product tests: [`src/lib/localbot.test.ts`](src/lib/localbot.test.ts)

| Suite | What it covers |
|---|---|
| hardware scanner | 4 GB Linux fixture; `qwen35-27b-q4` does not fit; reason matches `/Needs about/` |
| download checksum | Writes **synthetic** `GGUF…` blob into VFS; SHA-256 of that blob round-trips. Does not download from the Hub |
| company folder contract | `seedCompanyTree` creates expected VFS paths for two bots |
| workspace grants | write `hello.md` in workspace; deny path under another employee; two bots write department `shared/` |
| runtime safety | `DEFAULT_RUNTIME_KEYS` empty; `describeBind()` is 127.0.0.1:18789 loopback-only; `assertLoopbackOnly("0.0.0.0")` throws |

Last product-test command (this handoff):

```bash
node --experimental-strip-types --test src/lib/localbot.test.ts
```

Result: **8 tests, 5 suites, pass 8, fail 0.**

Full `npm test` (includes App Builder template tests):

```
node --test 'scripts/**/*.test.mjs' && node --experimental-strip-types --test src/lib/app-data/app-data.test.ts src/lib/auth/gate-identity.test.ts src/lib/localbot.test.ts
```

Result at handoff: **195 tests, 187 pass, 8 fail.** All 8 failures are in `scripts/grok-pwa-plugin.test.mjs` (og:title / share-card chrome), not LocalBot.

No e2e test starts llama.cpp, no e2e test hits Hugging Face, no e2e test writes the OS disk.

---

## 11. Feature scorecard

| Requirement | Status | Evidence |
|---|---|---|
| Desktop app window | **NOT BUILT** | Web document titled LocalBot. No Electron/Tauri. `src/routes/__root.tsx` |
| Fork / reuse of OpenMausBot | **NOT BUILT** | No OpenMausBot sources, no git remote. New TanStack app |
| No API key on first run | **PARTIAL** | UI never asks. Chat needs `XAI_API_KEY` on the server (`src/lib/runtime/turn.ts`) |
| Hardware scan | **PARTIAL** | Browser UA / deviceMemory / WebGL; disk hardcoded; RAM assumed 16 GB on desktop (`src/lib/hardware.ts`) |
| Model recommendation | **WORKS** | `fitModel` / `onboardingCards` / `src/lib/catalog.ts`; cards greyed with reason |
| GGUF download into the app | **STUB** | Fake progress + `ggufBlob()` into VFS (`src/lib/checksum.ts`, `completeDownload`) |
| Embedded local inference (no Ollama required) | **NOT BUILT** | Inference is `https://api.x.ai/v1/chat/completions` model `grok-4.5` |
| DeepSeek Harness as the loop | **NOT BUILT** | `harnessAdapter.ts` is a custom loop. No `dsh` package |
| Named multi-agent roster | **WORKS** | Sidebar + `createBot`; no cap (`src/components/localbot/sidebar.tsx`, `store.ts`) |
| Permission Allow/Deny | **WORKS** | Cards + grants (`src/lib/permissions.ts`, `chat.tsx` `PermissionCard`) |
| Company / department / employee / bot folders | **PARTIAL** | Exact tree in VFS, not OS disk (`src/lib/fs/company.ts`) |
| Department shared folder | **PARTIAL** | VFS only; same-browser bots can share |
| Per-bot workspace isolation | **WORKS** | `pathAllowed` + `writeBotFile` deny outside grants |
| Outbox | **PARTIAL** | VFS folder + clipboard “Outbox” / “Reveal path”. No Finder/Explorer |
| @bot handoff via shared task files | **WORKS** | `handoffTask` writes `shared/task-*.md` (`src/lib/store.ts`, `chat.tsx`) |
| macOS build | **NOT BUILT** | No packager |
| Windows build | **NOT BUILT** | No packager |
| Ubuntu build | **NOT BUILT** | No packager |
| Arabic UI / RTL | **NOT BUILT** | `html lang="en"`; no `dir="rtl"`; no Arabic strings |
| Company root picker | **STUB** | Name only; path constant |
| NAS / two-machine sharing | **NOT BUILT** | Checkbox + copy |
| Filesystem watcher | **NOT BUILT** | React state only |
| Streaming tokens | **NOT BUILT** | Single completion |
| Ollama advanced attach | **STUB** | Boolean in Safety tab |
| Control this computer | **WORKS** | Switch exists, default off |
| Loopback bind of a local model | **STUB** | Constants + tests; no listener |
| Session transcripts | **PARTIAL** | Written into VFS `transcript.json` |
| Import local GGUF | **STUB** | Filename/size only; bytes discarded |
| Agent rename in UI | **STUB** | `renameBot` in store, unused in sidebar |
| Browser tool | **NOT BUILT** | Classified as always-ask; `web_search` executeTool returns a gated string |

---

## 12. Known bugs and missing pieces

- **No local model (blocker for the original product).** Chat is grok-4.5 via `XAI_API_KEY`. Reproduce: send a message; inspect `src/lib/runtime/turn.ts`. Without the key, every turn errors “AI is not available in this environment.”
- **No real GGUF (blocker).** Download always writes a tiny synthetic file. Reproduce: finish onboarding download, inspect VFS `/LocalBot/models/*` content (`ggufBlob`).
- **No real disk (blocker for sharing / OS reveal).** Computer pane files live in `localStorage`. Reproduce: create `hello.md` in chat; `ls` on the host will not show `/Documents/LocalBot/...`.
- **No desktop builds (blocker for “install on a laptop”).** No packager scripts.
- **ARCHITECTURE.md / README over-claim (annoying).** They describe llama.cpp on 18789, DeepSeek Harness, `~/.localbot`, OS uninstall leaving files. Code does not do those things.
- **Catalog SHA-256 placeholders (annoying).** Lengths 63 and 64 mixed; never verified against a real file (`catalog/models.json`).
- **Catalog JSON unused (annoying).** Two sources of truth: `catalog/models.json` vs `src/lib/catalog.ts`.
- **Stop does not abort the HTTP call (annoying).** Reproduce: send a long prompt, click Stop immediately; the xAI request still runs.
- **No token streaming (annoying).** Full reply lands at once.
- **Hardware RAM/disk are guessed (annoying).** Desktop RAM forced to 16 GB class; disk always 180 GB.
- **`useExistingOllama` / `darkMode` / `denseUi` are dead (cosmetic / stub).** Stored, not applied (`darkMode`/`denseUi` never read outside types+defaults).
- **Rename missing from sidebar (cosmetic).** Store action exists.
- **Inbox grant has no Settings chip (cosmetic).**
- **Fake download progress (cosmetic).** Pause/Resume only affect the timer.
- **`npm test` fails 8 template PWA tests (annoying for CI).** LocalBot’s 8 tests pass in isolation.
- **Unused `src/lib/multiplayer/` (cosmetic).** Template leftover.
- **Onboarding copy vs reality (annoying).** “No cloud account”, “model is a file on disk”, “Writing into ~/.localbot/models” are false for this build.
- **Company rename does not move the VFS root (annoying).** `renameCompany` changes `company.name` only.

---

## 13. Files I should read first

1. `src/lib/runtime/turn.ts` — actual model call (xAI grok-4.5), not llama.cpp.
2. `src/runtime/harnessAdapter.ts` — agent loop, tools, transcripts.
3. `src/lib/store.ts` — all app state, VFS mutations, onboarding, handoff.
4. `src/lib/fs/vfs.ts` — the “disk”.
5. `src/lib/fs/company.ts` — folder contract + JSON schemas.
6. `src/lib/permissions.ts` — Allow/Deny rules.
7. `src/lib/catalog.ts` — catalog + fit rule (runtime).
8. `catalog/models.json` — pinned catalog file (not loaded).
9. `src/lib/checksum.ts` — synthetic GGUF.
10. `src/lib/hardware.ts` — browser scan + assumed RAM/disk.
11. `src/runtime/loopback.ts` — 127.0.0.1:18789 constants.
12. `src/components/localbot/onboarding.tsx` — first-run UX.
13. `src/components/localbot/chat.tsx` — send, permissions, @mention, Stop.
14. `src/lib/localbot.test.ts` — what is actually asserted.
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
2. **Create Writer — WORKS.** Walk hello → stay → grants → scan → pick Small → wait out fake download → name company/dept/you/Writer → Open chat. Or later: New agent.
3. **Ask it to write `hello.md` — PARTIAL.** Composer: `Write hello.md into your workspace with the text hello`. If `XAI_API_KEY` is set, grok-4.5 usually calls `write_file` and the Computer pane shows `hello.md`. If the key is missing, the assistant message is `AI is not available in this environment`. This is **not** a local GGUF doing the write.
4. **Show the file on disk — BREAKS HERE.** The file is a VFS node at `/Documents/LocalBot/{Company}/departments/{Dept}/people/{You}/bots/Writer/workspace/hello.md` inside `localStorage`. It will not appear in Finder, Explorer, or `ls` on the machine. The Computer pane is the only viewer.
5. **Cannot write outside the grant — WORKS in the VFS layer.** Unit test `agent is denied from writing outside grants` passes. A tool call to another employee’s tree returns `Denied: … is outside this agent's grants.` even if the user clicks Allow.

The original success picture — install a desktop app, download Recommended GGUF, two OS users sharing Finance files on a NAS, open them in the OS — **cannot be demoed with this build.** It breaks at: no installer, no GGUF, no llama.cpp, no OS disk, no two-machine share.

---

End of handoff. This file is the state of `/workspace` on 2026-09-01, not a roadmap.
