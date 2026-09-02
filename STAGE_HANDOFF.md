## Stage 2 — Folder scopes + native pickers

Date: 2026-09-02
Branch: `stage-2-folder-scopes` (PR #2 → `main`)

### Built

- **Versioned `folders` object in `{dataDir}/localbot-config.json`** (`version: 2`). Keys: `employeeRoot` (required), `employeeShared`, `departmentShared`, `companyShared` (each may be `null`). `legacyCompanyRoot` is kept beside it. `src/lib/fs/disk.ts`.
- **One-time migration of the old `companyRoot`.** On the first `loadConfig()` that sees a v1 file, the first `departments/{Dept}/people/{Emp}` becomes `employeeRoot`, `departments/{Dept}/shared` → `departmentShared`, `{root}/shared` → `companyShared`, `employeeShared` stays `null`; the v2 file is written once. Nothing is moved or deleted. Old `bots/{Name}/workspace` files stay put; Settings → Folders says so.
- **Sidecar is the source of truth.** Every server function in `src/lib/fs/server.ts` takes `{ scope, relPath, agentName }` and resolves the host path from config. `companyRoot` / `allowedRoots` are no longer accepted from the browser (a test greps for this).
- **Scope resolver** `src/lib/fs/scopes.ts`. `private` → `{employeeRoot}/agents/{Name}/private`; the other three scopes → their configured folder. Rejects absolute paths (posix, `C:`, UNC), any `..` segment, NUL, `:` in a segment, unknown scopes, unset (null) scopes, and **symlink escapes** — `realpath` of the deepest existing ancestor must stay under `realpath(root)`; dangling links are refused too.
- **Agent grants on the sidecar.** `agents/{Name}/agent.json` (outside `private/`) holds the agent's `scopes`; `resolveForAgent` denies a scope the agent lacks. Settings → Agents toggles them. Private is always granted.
- **Electron native picker.** `desktop/main.mjs`: `ipcMain.handle("localbot:pickFolder")` → `dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory", …] })`. `desktop/preload.mjs` exposes `pickFolder()`. Picked paths still pass `foldersValidate` / `setFolders` on the sidecar. **UNVERIFIED as a painted dialog** on this host (no GTK); verified by source assertion and the preload contract only.
- **Web preview** keeps a typed path field tagged **preview only**.
- **Onboarding**: new **Folders** step after model download — “Create my folders (suggested layout)”, “Create missing folders”, per-scope **Skip**. Continue is disabled until `employeeRoot` is set.
- **Settings → Folders**: same form; after Save shows “Changing a folder does not move old files” with old → new for each changed scope; shows the migration notice when `legacyCompanyRoot` exists. **Settings → Agents**: scope pills per agent (greyed when that scope has no folder).
- **Computer pane**: one section per configured scope (Private / My agents / Department / Company); a scope with `null` is hidden. Entries carry `relPath`, not host paths. Preview reads by `{scope, relPath}`.
- **`@Name` handoff** writes `task-{ts}-{From}-to-{To}.md` into `employee-shared` if set, else `department-shared` if set. If both are `null` it says so and writes nothing.
- **System prompt / tools** speak in `private/`, `employee-shared/`, `department-shared/`, `company-shared/`. Bare names → `private/`. Shell tool runs inside `private/` only. `src/lib/runtime/prompt.ts`, `src/runtime/harnessAdapter.ts`, `classifyScopedToolCall` in `src/lib/permissions.ts`.
- **Existing grant / local-model tests still pass** (53). The pre-Stage-2 tree helpers (`fs/company.ts`, `fs/company-disk.ts`, legacy `classifyToolCall`) now type against `LegacyBot` and are used only by those tests and by nothing in the live app.

### Not built

- Watch / poll / Refresh button (Stage 3). The pane still refetches only on this app's own writes (`diskEpoch`).
- DeepSeek Harness. `harnessAdapter.ts` is still the custom 6-round loop. **NOT BUILT.**
- Signed installers. **NOT BUILT.** Electron window and the native dialog were not painted on this host.
- Durable agent roster / chats off `localStorage` (Stage 7). `localbot-state-v3` still persists agents, sessions, chat grants. Folder scopes and per-agent scope grants are on disk, not in the browser.
- Reveal in Finder/Explorer; disconnected-share detection beyond “Folder does not exist or is disconnected” at validation time; atomic writes / stale-version checks.
- The legacy tree helpers listed above are dead in the app but kept for the grant tests; remove them when Stage 7 replaces the agent record.
- Rename / archive in the sidebar (Stage 5).

### Files changed

- `src/lib/fs/scope-model.ts` (new) — scope ids, labels, `parseScopedPath`, `handoffScope`.
- `src/lib/fs/scopes.ts` (new) — resolver, symlink containment, agent records, `setFolders`, scoped disk ops.
- `src/lib/fs/scopes.test.ts` (new) — 15 tests; added to `npm test`.
- `src/lib/fs/server.ts` — rewritten around `{ scope, relPath, agentName }`.
- `src/lib/fs/disk.ts` — config v2, `migrateLegacyCompanyRoot`, `suggestedFolders`, `diskShell` guard hook.
- `src/lib/types.ts` — `DiskConfig` v2, `Bot.scopes` / `Bot.privatePath`, `LegacyBot`, `ScopedEntry`, `settingsTab: "folders"`.
- `src/lib/store.ts` — folders state, `applyFolders`, `ensureAgents`, `setBotScopes`, scoped file actions, handoff scope selection; removed `applyCompanyRoot`, `seedFoldersHere`, `setBotGrants`, `createDepartment`, `createEmployee`, `moveBotToEmployee`.
- `src/lib/permissions.ts` — `classifyScopedToolCall`; legacy classifier kept for tests.
- `src/lib/runtime/prompt.ts`, `src/runtime/harnessAdapter.ts` — scope-based prompt and tool context.
- `src/lib/desktop-bridge.ts` (new) — typed preload bridge + `pickFolder()`.
- `desktop/main.mjs`, `desktop/preload.mjs` — `localbot:pickFolder` IPC.
- `src/components/localbot/folder-picker.tsx` (new), `onboarding.tsx`, `settings.tsx`, `computer.tsx`, `new-agent.tsx`, `chat.tsx`, `app.tsx`, `desktop-titlebar.tsx`.
- `src/lib/fs/company.ts`, `company-disk.ts`, `src/lib/localbot.test.ts` — type against `LegacyBot` only.
- `package.json` — `npm test` runs `scopes.test.ts`.
- `FOLDER_CONTRACT.md`, `README.md`, `LOCALBOT_HANDOFF.md`, `STAGE_HANDOFF.md`.

### Prove it

Command:

```
npm run lint && npm run typecheck && npm test && \
  ! grep -Eq 'companyRoot\??:|allowedRoots\??:' src/lib/fs/server.ts && \
  grep -q 'ipcMain.handle("localbot:pickFolder"' desktop/main.mjs && \
  grep -q 'ipcRenderer.invoke("localbot:pickFolder"' desktop/preload.mjs && \
  echo STAGE2_PASS
```

Pass looks like:

```
# tests 195
# pass 195
# fail 0
# tests 68
# pass 68
# fail 0
STAGE2_PASS
```

(68 = 53 pre-existing LocalBot tests + 15 Stage 2 scope tests.) On `main` this fails at `npm test` with `Could not find 'src/lib/fs/scopes.test.ts'`; if `server.ts` ever accepts `companyRoot`/`allowedRoots` again or the picker IPC disappears, `STAGE2_PASS` is not printed.

Second command (optional) — only the Stage 2 suite, verbose:

```
node --experimental-strip-types --test src/lib/fs/scopes.test.ts
```

Pass: `# pass 15` / `# fail 0`, including `rejects symlink escapes, including dangling links`, `migrates a v1 companyRoot once, keeps legacyCompanyRoot, deletes nothing`, and `server functions take no companyRoot / allowedRoots from the browser`.

### How I test in the app

1. `LOCALBOT_DATA_DIR=/tmp/lb npm run dev` (fresh data dir), open `http://localhost:8080/`. Walk welcome → scan → Small → download/verify → **Connect your folders**. Click **Create my folders (suggested layout)**, **Skip** Company shared, **Continue**, **Open chat**. `cat /tmp/lb/localbot-config.json` shows `"version": 2` and a `folders` object with `"companyShared": null`; `agents/Writer/{agent.json,AGENTS.md,private/}` exists under the employee root.
2. Open the **Computer** pane: sections Private / My agents / Department only — no Company. Settings (`Ctrl+,`) → **Folders** shows the three paths tagged **preview only** and Company shared as Not connected; **Agents** shows `company-shared` greyed.
3. Create a second agent (**New agent** → Researcher). From Writer send `@Researcher please review …`. Chat shows `Handed work to Researcher via employee-shared/task-…md`; the file appears under **My agents** in the Computer pane and on disk in the employee-shared folder; Researcher's chat shows the handed task. Then Settings → Folders, change Department shared to a new path with **Create missing folders** ticked, **Save folders**: the notice lists `department-shared: old → new` and the old folder is still on disk.

### Ready for

Stage 3 (four-scope browser polish + watch/poll + Refresh) only after you say GO.
