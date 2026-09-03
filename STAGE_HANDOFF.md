## Stage 3 — Four-scope browser + watch/poll + Refresh

Date: 2026-09-02
Branch: `stage-3-watch-refresh` (PR #3 → `main`)

This is AGENTS.md item 3. It is **not** the complete-plan Stage 3 (DeepSeek Harness); that is AGENTS.md item 4 and was not touched.

### Built

- **Sidecar watchers** — `src/lib/fs/watch.ts`. One `RootWatcher` per configured folder (`employeeRoot`, `employeeShared`, `departmentShared`, `companyShared`); `private` reports through the `employeeRoot` watcher. Each root has a monotonic `version`, a `status` (`ok` / `disconnected`), a `mode`, and the last OS error. **WORKS.**
  - `mode: "watch"` — recursive `fs.watch` (`persistent: false`) plus a **15 s safety poll**. Events are debounced 150 ms and always bump `version`.
  - `mode: "poll"` — the **bounded metadata poll** is the only source, every **2 s** (`LOCALBOT_WATCH_POLL_MS`). Used when `fs.watch` cannot attach, when it errors, when the root is disconnected, when the root looks like a network mount (Linux `/proc/self/mounts` fstype in cifs / smb3 / nfs / nfs4 / sshfs / …, Windows UNC `\\server\share`), or when `LOCALBOT_WATCH_MODE=poll` is set. A root that comes back re-attaches `fs.watch` on the next tick.
  - The poll walks at most **4 levels / 2000 entries** per tick (`POLL_MAX_DEPTH`, `POLL_MAX_ENTRIES`) and fingerprints `kind:size:mtimeMs` with `lstat` (symlinks are not followed). Directory mtimes catch adds/removes below the depth cap.
  - A watcher never creates, moves, or writes anything.
- **Server functions** — `src/lib/fs/server.ts`: `scopesStatus()` (per configured scope; `null` scopes are absent), `browseRefresh()` (rescans every root now), `browseHostPath({ scope, relPath, agentName })` (host path for reveal only). Still no `companyRoot` / `allowedRoots` from the browser. **WORKS.**
- **Disconnected share is an error, not an empty tree** — `resolveScopePath` now calls `assertScopeConnected`: if the configured folder behind a scope cannot be `stat`ed or is not a directory, every browse *and* agent-tool op throws `ScopeError("DISCONNECTED", …)`. Because writes resolve first, a recursive `mkdir` can no longer recreate a vanished share as a local folder. Path hygiene (`..`, absolute, drive, UNC) is checked before the disk is touched, so `BAD_PATH` / `BAD_SCOPE` / `SCOPE_UNSET` are unchanged. A missing `agents/{Name}/private` under a healthy root is still the soft "Folder not created yet." **WORKS.**
- **Computer pane** — `src/components/localbot/computer.tsx`. Existing sections kept (Private / My agents / Department / Company; `null` hidden). Added: a **Refresh** button in the header (calls `browseRefresh`, then re-lists every section); a **3 s status poll** of `scopesStatus` that re-lists a section when its watcher `version` moves; a `watch` / `poll` badge per section; a **Disconnected** banner per section with the OS reason and the host path while the other sections keep working; the preview is hidden for a disconnected scope. **WORKS** (browser preview, verified below).
- **Reveal in Finder / Explorer** — one new narrow IPC in the `pickFolder` style: `desktop/main.mjs` `ipcMain.handle("localbot:revealPath")` → `shell.showItemInFolder`, but only after main re-reads `localbot-config.json` and confirms the path sits inside one of the configured folders and exists. `desktop/preload.mjs` exposes `revealPath(hostPath)`; `src/lib/desktop-bridge.ts` types it and adds `canRevealPath()` / `revealLabel()`. The pane shows `reveal` per section, on the preview, and in the footer only when the bridge exists; the web preview keeps **copy path**. The host path comes from `browseHostPath` on the sidecar — the browser never supplies one. **UNVERIFIED as a painted action** on this GTK-less host; verified by source assertion and preload contract only.
- **Tests** — `src/lib/fs/watch.test.ts` (14), added to `npm test`. They fail if: an external write into a `watch`-mode root is not seen with the safety poll 60 s away (proves `fs.watch`); an external write / in-place edit is not seen in forced `poll` mode; the poll ignores its depth or entry cap; an unset scope is listed by `scopeStatuses`; `refreshScopes` does not rescan or the listing after it lacks the new file; the pane lacks a Refresh control wired to `browseRefresh` / `scopesStatus` / watcher version; a removed configured root lists as `[]` instead of `DISCONNECTED`; a write into a disconnected scope recreates the folder; the watcher does not flip `disconnected` → `ok`; `..` / absolute / drive / UNC / symlink escapes pass on the browse path; `main.mjs` or `preload.mjs` lose the reveal IPC or gain Node access. Removing `assertScopeConnected` was checked to fail 2 tests.

### Not built

- DeepSeek Harness / `harnessAdapter.ts` replacement (AGENTS.md item 4). **NOT BUILT.**
- Signed / notarized installers. **NOT BUILT.** Electron window, native dialog, and the reveal action were not painted on this host.
- Two-machine / real NAS run. **UNVERIFIED.** Poll mode was exercised with `LOCALBOT_WATCH_MODE=poll` and by removing a root, not against a real SMB / NFS mount; `looksLikeNetworkMount` on macOS returns `false` (relies on the 15 s safety poll) and cannot classify Windows mapped drive letters.
- Per-launch sidecar token; chats / roster off `localStorage`; agent rename / archive; atomic writes / stale-version checks; search box. Out of scope by the Stage 3 brief.
- Push updates: the pane polls `scopesStatus` every 3 s (server functions are request/response). No SSE.

### Files changed

- `src/lib/fs/watch.ts` (new) — `RootWatcher`, `fingerprintRoot`, `looksLikeNetworkMount`, `syncWatchers`, `scopeStatuses`, `refreshScopes`, `stopAllWatchers`.
- `src/lib/fs/watch.test.ts` (new) — 14 tests.
- `src/lib/fs/scopes.ts` — `DISCONNECTED` code, `assertScopeConnected`, hygiene-before-root ordering in `resolveScopePath`.
- `src/lib/fs/server.ts` — `scopesStatus`, `browseRefresh`, `browseHostPath`.
- `src/components/localbot/computer.tsx` — Refresh, status poll, per-section disconnected banner, reveal buttons, `ComputerBody` split.
- `src/lib/desktop-bridge.ts` — `revealPath`, `canRevealPath`, `revealLabel`.
- `desktop/main.mjs` — `localbot:revealPath` IPC, `configuredFolderRoots`, `isUnderDir`.
- `desktop/preload.mjs` — `revealPath`.
- `package.json` — `npm test` runs `watch.test.ts`.
- `LOCALBOT_HANDOFF.md`, `STAGE_HANDOFF.md`, `ARCHITECTURE.md`, `FOLDER_CONTRACT.md`, `README.md`.

### Prove it

Command:

```
npm run lint && npm run typecheck && npm test && \
  grep -q 'ipcMain.handle("localbot:revealPath"' desktop/main.mjs && \
  grep -q 'ipcRenderer.invoke("localbot:revealPath"' desktop/preload.mjs && \
  grep -q 'export const browseRefresh' src/lib/fs/server.ts && \
  grep -q 'export const scopesStatus' src/lib/fs/server.ts && \
  grep -q '"DISCONNECTED"' src/lib/fs/scopes.ts && \
  echo STAGE3_PASS
```

Pass looks like:

```
# tests 195
# pass 195
# fail 0
# tests 82
# pass 82
# fail 0
STAGE3_PASS
```

(82 = 68 Stage 1/2 tests + 14 Stage 3 tests.) On `main` this fails at `npm test` with `Could not find 'src/lib/fs/watch.test.ts'`. If the disconnect guard is removed, `watch.test.ts` fails `browse listing on a removed configured root throws DISCONNECTED (not [])` and `a write into a disconnected scope is refused and does not recreate the folder locally`; if `fs.watch` stops attaching or the poll stops seeing external writes, the first suite fails; if Refresh stops rescanning, `refreshScopes rescans now …` fails.

Second command (optional) — only the Stage 3 suite, verbose:

```
node --experimental-strip-types --test src/lib/fs/watch.test.ts
```

Pass: `# pass 14` / `# fail 0`, including `fs.watch mode: a file written by someone else bumps the root version`, `poll mode (NAS / SMB fallback): the bounded metadata poll sees a new nested file`, `refreshScopes rescans now …`, and `the watcher flips to disconnected with the OS reason and back to ok when the share returns`.

### How I test in the app

1. `rm -rf /tmp/lb && LOCALBOT_DATA_DIR=/tmp/lb npm run dev`, open `http://localhost:8080/`, walk onboarding (import any `.gguf`, **Create my folders**, **Skip** Company shared, agent Writer), open the Computer pane (`Ctrl+K` → Toggle computer pane). Sections Private / My agents / Department each carry a `watch` badge; no Company section. In a terminal: `echo hi > /tmp/lb/LocalBot/Acme/departments/Ops/shared/from-colleague.md`. Without clicking anything, `from-colleague.md` appears under **Department** within ~3 s; click it and the preview shows `department-shared/from-colleague.md`.
2. `mv /tmp/lb/LocalBot/Acme/departments/Ops/shared{,.off}`. Within ~3 s the **Department** section shows **Disconnected — Folder is missing or the drive is disconnected (ENOENT).** with the host path; the badge flips to `poll`; **Private** and **My agents** still list normally. `mv` it back; the section recovers on its own (or immediately on **Refresh**) and the badge returns to `watch`.
3. Restart with `LOCALBOT_DATA_DIR=/tmp/lb LOCALBOT_WATCH_MODE=poll LOCALBOT_WATCH_POLL_MS=600000 npm run dev`, reload: badges read `poll`. Write a file into the employee shared folder from a terminal; nothing appears for 10+ s; click the circular **Refresh** icon and it appears at once. (In Electron only, `reveal` links and the footer **Reveal in Finder / Explorer** appear; the web preview keeps **copy path**.)

### Ready for

Stage 4 only after I say GO.
