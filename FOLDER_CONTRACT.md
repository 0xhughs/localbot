# Folder contract

Work product lives on **disk** in four folder scopes the employee picks. Browser state (agents, chats, pins, chat grants) stays in `localStorage` for now (Stage 7 moves it). File bodies are never stored in the browser. The **sidecar** (the Node server) is the only thing that knows where a scope lives; the UI and the model only ever say `scope/relative/path`.

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
  "useExistingOllama": false
}
```

`dataDir` is `{cwd}/data` in the browser preview / `npm run desktop`, `{appData}/LocalBot` in the packaged Electron app, or `LOCALBOT_DATA_DIR`.

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

`agent.json` is the sidecar-side record of which scopes the agent may touch. `private` is always granted.

### Harness sessions (Stage 4)

Each agent's ACP session runs with `cwd = {employeeRoot}/agents/{AgentName}/private`. That cwd only identifies the agent; the Harness filesystem provider (`dsh/localbot-fs.mjs`) still resolves every path through `resolveScopePath`. Before each session/prompt the sidecar mirrors `agents/{AgentName}/AGENTS.md` (plus the granted-scope list) into `private/AGENTS.md`, where the upstream instruction loader picks it up. That copy is **read-only for model tools** — edit the one next to `agent.json`. Harness's own session logs live under `{dataDir}/dsh-home/`, never in a scope.

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

`@Name` in chat writes `task-{timestamp}-{From}-to-{To}.md` into `employee-shared/` if connected, else `department-shared/` if connected. If neither is connected the UI says so and writes nothing.

## Sharing

Two people see the same files only if their LocalBot installs point a scope at the **same real folder** (NAS / mapped drive / shared disk). LocalBot does not sync, copy, or assign permissions; the OS does.
