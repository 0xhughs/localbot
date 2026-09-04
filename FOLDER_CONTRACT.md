# Folder contract

Work product lives on **disk** in four folder scopes the employee picks. Agent metadata, chats and the ACP session map live in the LocalBot **data dir** (Stage 7, see *Host state* below), never in a scope and never only in the browser. File bodies are never stored in the browser. The **sidecar** (the Node server) is the only thing that knows where a scope lives; the UI and the model only ever say `scope/relative/path`.

## Four scopes

| Scope (what the model sees) | Config key | Required | Resolves to |
|---|---|---|---|
| `private/` | `folders.employeeRoot` | yes | `{employeeRoot}/agents/{AgentName}/private/` |
| `employee-shared/` | `folders.employeeShared` | no (may be `null`) | that folder |
| `department-shared/` | `folders.departmentShared` | no (may be `null`) | that folder |
| `company-shared/` | `folders.companyShared` | no (may be `null`) | that folder |

The four locations do not have to share a parent. Any of them can be a local folder, a mapped drive, or a mounted share. A `null` scope is hidden in the Computer pane and refused by the resolver (`SCOPE_UNSET`).

A bare path like `hello.md` means `private/hello.md`.

## Server config

```
{dataDir}/localbot-config.json
```

```json
{
  "version": 2,
  "folders": {
    "employeeRoot": "/abs/path",
    "employeeShared": "/abs/path or null",
    "departmentShared": "/abs/path or null",
    "companyShared": null
  },
  "legacyCompanyRoot": null,
  "previewWritesToProjectData": true,
  "modelsDir": "...",
  "activeModelId": "...",
  "activeModelPath": "...",
  "allowHostedDemo": false,
  "useExistingOllama": false,
  "ollamaModel": null,
  "llamaRuntime": "auto",
  "verifiedModels": { "/abs/path/to.gguf": { "sha256": "…", "size": 0, "mtimeMs": 0, "catalogId": "qwen25-05b-q4 or null", "verifiedAt": "…" } }
}
```

`dataDir` is `{cwd}/data` in the browser preview / `npm run desktop`, `{appData}/LocalBot` in the packaged Electron app, or `LOCALBOT_DATA_DIR`.

### Host state (Stage 7)

```
{dataDir}/localbot-agents.json        # host index, version 1
{dataDir}/localbot-agents.json.bak    # previous copy (every host JSON write is temp + rename)
{dataDir}/chats/{agentId}.json        # one transcript per agent: messages, chatGrants, lastReadAt
{dataDir}/localbot-state-v3.migrated.json   # the browser copy imported on first launch (recovery only)
{dataDir}/stt/{uuid}.wav              # Stage 9: one voice clip while whisper-cli runs; deleted in finally. Refused if stt/ is under a scope root.
{dataDir}/…/bin/{target}/whisper/     # Stage 9: whisper-cli + libs, flattened; a sibling of bin/{target}/{runtime}/, never inside one
{dataDir}/…/models/whisper/           # Stage 9: ggml-base.en.bin (size + ggml magic + sha256)
```

(`…` is `LocalBot/` in the dev layout and nothing in the packaged layout, exactly as for `models/` and `bin/`.)

```json
{
  "version": 1,
  "onboarded": true,
  "company": { "id": "co_…", "name": "Acme", "createdAt": "…" },
  "department": { "id": "dept_…", "name": "Ops", "createdAt": "…" },
  "employee": { "id": "emp_…", "name": "Sam", "createdAt": "…" },
  "selectedCatalogId": "qwen25-05b-q4",
  "migratedFrom": "localbot-state-v3 or null",
  "agents": [
    { "id": "bot_…", "name": "Writer", "pinned": true, "hidden": false, "unread": 0,
      "sessionId": "ACP session id or null", "sessionCwd": "…/agents/Writer/private or null", "createdAt": "…" }
  ]
}
```

The roster the sidebar shows is `agents/*/agent.json` **joined** to this index by agent name: `agent.json` owns `job`, `modelId`, `color`, `mascotId`, `scopes`, `archived`; the index owns the stable `id` (chats and the session map key on it), `pinned` / `hidden` / `unread`, and the ACP session. A folder under `agents/` with no index row gets a fresh row on the next load (an agent folder copied in by hand appears); a row whose folder is gone leaves the roster but keeps its chat file. Rename keeps the id and clears the session; Delete removes the row and `chats/{id}.json`.

Chats are LocalBot metadata, not work product: `chats/` is under the data dir, outside every scope root, so the model's file tools cannot read them. The sidecar refuses to write a chat when the data dir itself sits inside a configured scope folder.

The browser's `localStorage["localbot-state-v3"]` keeps only UI chrome (theme / density flags, last hardware scan, runtime badge). Clearing site data loses none of the above.

### Migration from the single company root

A v1 file (`companyRoot`, no `folders`) is migrated once on the next load:

- first `departments/{Dept}/people/{Emp}` → `employeeRoot`
- `departments/{Dept}/shared` → `departmentShared`
- `{companyRoot}/shared` → `companyShared` (if it exists)
- `employeeShared` → `null`
- `legacyCompanyRoot` → the old root

Nothing is moved or deleted. Old `bots/{Name}/workspace` files stay where they were; the new agent folders are `agents/{Name}/private`. Settings → Folders shows this notice.

## Inside the employee root

```
{employeeRoot}/
  agents/
    {AgentName}/
      agent.json      # name, job, model, color, mascot, scopes (grants) — outside private/
      AGENTS.md       # standing instructions, user-managed
      private/        # the "private" scope root
        memory/notes.md
        output/
```

`agent.json` is the sidecar-side record of which scopes the agent may touch (`private` is always granted), whether the agent is `archived`, and — Stage 6 — which GGUF it runs on: `modelId` is a catalog id (`qwen25-15b-q4`) or an imported file's own filename (`team-model.gguf`). It is the durable pick; the browser copy follows it. The file must sit in the models folder and pass verification; the agent's next turn restarts the one llama-server onto it if it differs from what is loaded.

### Agent lifecycle (Stage 5)

| Action | On disk | In the browser |
|---|---|---|
| New agent | `agents/{Name}/` created with `agent.json`, `AGENTS.md`, `private/memory/notes.md`, `private/output/`. Refused if a folder with that name (any casing) exists. | roster row |
| Rename | `agents/{Old}/` **moves** to `agents/{New}/` — the whole tree, memory and output included. `agent.json.name` and the `# Name` heading in `AGENTS.md` / `private/AGENTS.md` are rewritten. A case-only rename goes through a temporary name. Refused for an empty / illegal / reserved name, a name another agent already owns (case-insensitive), a missing source folder, or while the agent is mid-turn. The agent's ACP session is dropped; the next message opens a new one with cwd `agents/{New}/private`. | label + `privatePath`; chats stay keyed by the agent id |
| Duplicate | New `agents/{Name copy}/` (then `… copy 2`, …) with a **copy** of the source `private/` (memory, output, everything) and the source `AGENTS.md`, plus a fresh `agent.json`. The two agents never share a folder. Refused if the target exists. | new roster row |
| Archive | Only `"archived": true` in `agent.json`. No file is moved or removed. | leaves the default roster; listed under **Archived** with Unarchive / Delete |
| Unarchive | `"archived": false` | back in the roster |
| Hide | `hidden: true` on the row in `localbot-agents.json` | roster filter (per data dir, not per browser) |
| Delete | `agents/{Name}/` removed (`rmSync`, only ever inside `agents/`); the index row and `chats/{id}.json` go too | row and chat removed |

Agent names: letters, digits, spaces and ordinary punctuation; not `\ / : * ? " < > |`, not dots-only or trailing-dot, not Windows reserved names, at most 64 characters. `agentSlug` in `scope-model.ts` is the one cleaner; `assertAgentName` on the sidecar refuses anything it would change.

`private/memory/notes.md` is the agent's durable memory. Model tools may write it (it is a normal `private/` path). They may not write `private/AGENTS.md` (mirrored, read-only) and cannot reach `agents/{Name}/AGENTS.md` at all (outside every scope root).

### Harness sessions (Stage 4)

Each agent's ACP session runs with `cwd = {employeeRoot}/agents/{AgentName}/private`. That cwd only identifies the agent; the Harness filesystem provider (`dsh/localbot-fs.mjs`) still resolves every path through `resolveScopePath`. The session id and that cwd are persisted in `localbot-agents.json` (Stage 7); after a sidecar restart the next prompt resumes the same session when the cwd still matches, otherwise a new one is opened and stored. Before each session/prompt the sidecar mirrors `agents/{AgentName}/AGENTS.md` (plus the granted-scope list) into `private/AGENTS.md`, where the upstream instruction loader picks it up. That copy is **read-only for model tools** — edit the one next to `agent.json`. Harness's own session logs live under `{dataDir}/dsh-home/`, never in a scope.

## Suggested layout ("Create my folders")

A suggestion for the pickers, not a required company layout:

```
{documents}/LocalBot/{Company}/            # {cwd}/data/LocalBot/{Company} in the preview
  company-shared/                          # companyShared
  departments/
    {Department}/
      shared/                              # departmentShared
      employees/
        {Employee}/                        # employeeRoot
          shared/                          # employeeShared
          agents/{AgentName}/private/
```

## Path rules (enforced in `src/lib/fs/scopes.ts`)

- Refused: absolute host paths (`/x`, `C:\x`, `\\server\share`), any `..` segment, NUL bytes, `:` in a segment, unknown scope names, scopes whose folder is `null`.
- Symlinks: the `realpath` of the deepest existing ancestor must stay under `realpath(scope root)`. Dangling links are refused.
- Agent tool calls also require the scope to be in that agent's `agent.json` `scopes`.
- The Harness file tools (`read`, `write`, `edit`, `glob`, `grep`) accept `scope/relative/path`, a bare path (= `private/`), or an absolute path only when it already lies inside one of the agent's granted, connected scope roots; everything else is denied before the disk is touched. Results show logical paths only.
- The shell tool runs only inside `private/` (the session cwd is its sandbox) and must ask through an ACP permission request before any side effect.
- Changing a folder in Settings does **not** move old files. LocalBot shows the old and new locations.
- The configured folder behind a scope must be reachable at the moment of the call. If it cannot be stat'ed (unmounted share, unplugged drive, deleted folder) every read, list, and write on that scope fails with `DISCONNECTED`. LocalBot never lists it as empty, never recreates it locally, and never redirects the work to another scope.

## Watching (enforced in `src/lib/fs/watch.ts`)

- The sidecar watches each configured folder: recursive `fs.watch` + a 15 s safety poll where the OS delivers events; a bounded metadata poll (2 s, depth 4, 2000 entries) as the only source on network mounts, UNC paths, or when `fs.watch` cannot attach. `LOCALBOT_WATCH_MODE=poll` forces poll mode; `LOCALBOT_WATCH_POLL_MS` sets its interval.
- Watchers only read metadata. They never create, move, or write files.
- The Computer pane re-lists a section when its root's `version` moves and shows a **Disconnected** banner for a root that vanished; **Refresh** rescans every root now.

## Handoff

`@Name` in chat writes `task-{timestamp}-{From}-to-{To}.md` into `employee-shared/` if connected, else `department-shared/` if connected. If neither is connected the UI says so and writes nothing. Never `company-shared/`, never a private folder. Both agents must be granted that scope. An archived or hidden target is refused (nothing written). Same LocalBot install only; the file shows up in the Computer pane through the Stage 3 watcher.

## Sharing

Two people see the same files only if their LocalBot installs point a scope at the **same real folder** (NAS / mapped drive / shared disk). LocalBot does not sync, copy, or assign permissions; the OS does.

Verified in Stage 8 as **two processes on one host** (`npm run prove:two-process`): a packaged LocalBot and a dev LocalBot with different data dirs and the same `departmentShared` folder; a file written by one appears in the other's Computer pane through the Stage 3 watcher in ~0.5–3 s. Two computers or a real NAS share remain UNVERIFIED.

## Install footprint

The installed app lives under the OS app location (`/opt/LocalBot` for the `.deb`, the AppImage file, `Applications`, `Program Files` / `%LOCALAPPDATA%\Programs`), its bundled Node and Harness under `resources/`. Everything it writes goes to `{appData}/LocalBot` (config, index, chats, `models/`, `bin/`, `dsh-home/`). Uninstalling or deleting either location never touches the four scope folders; they are the employee's or the company's files, chosen with the picker, and LocalBot never creates them under the app or deletes them.
