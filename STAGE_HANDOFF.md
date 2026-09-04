## Stage 7 — Durable AppData state

Date: 2026-09-04
Branch: `stage-7-durable-state` (PR #7 → `main`, off `420cc56`)

This is AGENTS.md item 7 (durable AppData state) — the host-config / session-map slice of complete-plan §9.1 and §11. It is **not** item 8 (signed installers, bundled Node, Electron upgrade, two-machine NAS). Chats are **on disk**, not left in `localStorage`.

### Built

- **Host index** `{dataDir}/localbot-agents.json` (`version: 1`, `src/lib/fs/host-index.ts`): `onboarded`, company / department / employee labels + ids, `selectedCatalogId`, `migratedFrom`, `updatedAt`, and one row per agent `{ id, name, pinned, hidden, unread, sessionId, sessionCwd, createdAt }`. `agent.json` stays the source of truth for `job` / `modelId` / `color` / `mascotId` / `scopes` / `archived`. **WORKS.**
- **Roster from disk** — `loadRoster(folders)` = `agents/*/agent.json` ⋈ index by name. A folder with no row gets a fresh `bot_…` id (hand-copied agents appear); a row whose folder is gone leaves the roster but keeps its chat file addressable. `stateLoad` (`src/lib/fs/server.ts`) returns index + roster + the `localbot-config.json` mirror; the store's `loadFromDisk` replaces its in-memory roster with it before anything renders (`app.tsx` waits for `diskLoaded`). Wiping `localStorage` against the same `LOCALBOT_DATA_DIR` reloads into the same roster, pins, archived group and chats — recorded in the browser preview. **WORKS.**
- **Lifecycle keeps the index in step** — `agentEnsure` / `agentDuplicate` return the row `id`; `agentRename` renames the row (same id, session cleared); `agentSetArchived(true)` clears the persisted session; `agentRemove` drops the row and `chats/{id}.json`; `statePatchAgent` writes `pinned` / `hidden` / `unread`; `statePatchIndex` writes `onboarded` / labels / `selectedCatalogId` (onboarding, company rename, catalog pick). Rename / archive / duplicate all survive a reload from disk. **WORKS.**
- **Chats on disk** — `{dataDir}/chats/{agentId}.json` (`messages`, `chatGrants`, `lastReadAt`). The store debounces `chatSave` 400 ms per agent and flushes on `pagehide`; `chatLoadAll` restores every transcript at boot. Keyed by agent id, so rename does not move them. `chats/` is under the data dir, outside every scope root, and `writeChat` refuses when the data dir itself sits inside a configured scope folder — the model's file tools cannot read chat history as work files. **WORKS.**
- **ACP session map** — `HarnessManager` (`src/lib/harness/index.ts`) takes a `SessionStore` (default: the host index). `ensureSession`: in-memory id → else `session/resume` with the persisted `{ sessionId, cwd }` when `cwd` is still this agent's `private/` → else `session/new` and store the new id. `forgetSession` (rename / archive) clears the persisted id. dsh restores its own log on resume; LocalBot replays nothing (dsh-acp at this pin rejects `session/load`, so no history could come from it). Verified against the real `dsh 0.1.2-alpha.5`: `stop()` + new manager → `origin: "resumed"`, same id, next tool call writes into the same `private/`; unknown id → `session/new` with the new id stored; cwd mismatch → never resumed. In the app: after killing and restarting the dev server, Writer's next prompt shows the grey line **Resumed the previous Harness session.**, the id in `localbot-agents.json` is unchanged and `dsh-home/sessions/` still holds one log. **WORKS.**
- **Atomic host writes** — `atomicWriteJson` (`src/lib/fs/disk.ts`): temp file + `fs.renameSync`, previous copy kept as `{file}.bak`. Used by `patchConfig` (`localbot-config.json`), the index and the chat files. No secrets, no GGUF paths as credentials, no hosted keys are written. **WORKS.**
- **Settings hydration** — `stateLoad` returns `allowHostedDemo` / `useExistingOllama` / `ollamaModel` / `activeModelId` from `localbot-config.json`; `loadFromDisk` overwrites the store's two checkbox mirrors and `hostConfig` from it, so Settings → Safety matches what the sidecar enforces after a wipe; `selectedCatalogId` comes from the index (fallback `activeModelId`). **WORKS.**
- **Migration** — `merge` in `store.ts` no longer spreads a persisted `localbot-state-v3` into the live state; if it carries bots or `onboarded`, it is stashed as `legacySnapshot`. `loadFromDisk` posts it to `stateMigrate` only when the data dir has **no** index; the sidecar writes the index (old bot ids kept so chats stay attached), one chat file per session with messages, `localbot-state-v3.migrated.json` as a recoverable export, sets `migratedFrom: "localbot-state-v3"`, and creates `agents/{Name}/` for each imported bot when folders are configured. A second call sees the index and does nothing. `partialize` now persists only `version`, `hardware`, `settings`, `runtime`, `previewWritesToProjectData`. Recorded in the browser preview: an injected legacy blob became Writer (pinned) + Editor with the old chat line, identical after a second reload. **WORKS.**
- **What stays in `localStorage` (UI chrome, by design):** `settings.darkMode`, `settings.denseUi`, `settings.webSearchEnabled`, `settings.controlThisComputer`, `settings.companyRootIsShared`, the last `hardware` scan, the `runtime` badge cache, `previewWritesToProjectData`. The two Safety mirrors (`allowHostedDemo`, `useExistingOllama`) are also in the blob but are overwritten from `localbot-config.json` on every boot.
- **Tests** — `src/lib/fs/host-index.test.ts` (20) and 5 new real-dsh scenarios in `src/lib/harness/harness.test.ts`, both in `npm test`. Mutation-checked, each fails the suite: (1) restoring `bots: s.bots` / `sessions:` to `partialize`; (2) `loadRoster` returning only index rows (no folder scan) — "a hand-copied agent folder appears" fails; (3) `renameRow` giving a new id; (4) `ensureSession` never calling `store.save` — "sessionId is persisted" fails; (5) `ensureSession` skipping `resumeSession` — "fresh manager resumes" fails (`origin` is `new`); (6) writing the index with a plain `writeFileSync` — the `.bak` / no-`.tmp` assertions fail; (7) `chatsDir()` under `folders.employeeRoot` — the scope-containment test fails.

### Not built

- Item 8: signed / notarized installers, Harness inside the packaged Electron Node 22.14, bundled Node, Electron upgrade, two-machine / NAS run (**UNVERIFIED**). **NOT BUILT.**
- Painted GPU run **UNVERIFIED**; 3B / 7B hashes still Hub-etag only (item 6 carry-over).
- Chats written in the last ~400 ms before the window is closed rely on the `pagehide` flush; a hard kill of the renderer in that window loses them. **UNVERIFIED** on Electron close (browser preview only here).
- A roster read while the employee root is DISCONNECTED shows an empty list plus a red "Roster could not be read from disk: …" notice in the sidebar; no cached copy is shown (the index has no job / colour / model, by design). Reconnect the folder and reload.
- Hidden agents have no dedicated unhide control beyond Settings (pre-existing; Hide is now per data dir rather than per browser).
- Deleting an agent folder by hand keeps its index row (and chat file) until Delete is used; the roster itself is correct.
- `session/list` is not used (resume goes straight by the persisted id). Hosted-demo / auth / PWA template code untouched. Token streaming, agent teams: unchanged.
- The 0.5B GGUF answered "Reply with one short sentence saying hello." with a paragraph of runtime-context text (documented weak model since the local-model pass; not touched).

### Files changed

- `src/lib/fs/host-index.ts` (new) — index load / save / patch, rows (`ensureRow`, `patchRowById`, `renameRow`, `removeRow`), session store (`readAgentSession` / `writeAgentSession` / `clearAgentSession`, `hostIndexSessionStore`), `loadRoster`, chats (`chatPath`, `writeChat`, `readChat`, `readAllChats`, `assertChatsOutsideScopes`), `migrateLegacySnapshot`, `resetHostIndex`.
- `src/lib/fs/disk.ts` — `atomicWriteJson`; `writeConfigFile` uses it.
- `src/lib/fs/server.ts` — `stateLoad`, `statePatchIndex`, `statePatchAgent`, `stateMigrate`, `stateReset`, `chatLoadAll`, `chatSave`; `agentEnsure` / `agentRename` / `agentDuplicate` return `id`; `agentSetArchived` / `agentRemove` update the index.
- `src/lib/harness/index.ts` — `SessionStore` constructor arg, `EnsuredSession` / `SessionOrigin`, resume-then-new in `ensureSession`, `forgetSession` clears disk, `origin` in `status()`.
- `src/lib/runtime/harness.ts` — `sessionOrigin` on the prompt result. `src/runtime/harnessAdapter.ts` — `onSession` event. `src/components/localbot/chat.tsx` — "Resumed the previous Harness session." line.
- `src/lib/store.ts` — `loadFromDisk`, `diskLoaded` / `diskNotice` / `legacySnapshot` / `hostConfig`, `botFromRoster`, debounced `scheduleChatSave` / `flushChatSaves`, lifecycle actions write the index, `merge` stashes the legacy blob, `partialize` is chrome only, `resetAll` → `stateReset`.
- `src/components/localbot/app.tsx` — waits for `diskLoaded`, calls `loadFromDisk`. `src/components/localbot/sidebar.tsx` — `diskNotice`.
- `src/lib/fs/host-index.test.ts` (new), `src/lib/harness/harness.test.ts` (+5 scenarios; the Stage 5 rename scenario now moves the index row like the server fn), `package.json` (`npm test`).
- `LOCALBOT_HANDOFF.md`, `STAGE_HANDOFF.md`, `FOLDER_CONTRACT.md`, `ARCHITECTURE.md`, `README.md`.

### Prove it

Command (Node ≥ 22.15 on `PATH` or `LOCALBOT_DSH_NODE` for the Harness suite, as in Stage 4; `npm install` first; nothing may be listening on `127.0.0.1:18789`):

```
npm run lint && npm run typecheck && npm test && \
  ! grep -q 'bots: s.bots,$' src/lib/store.ts && \
  ! grep -q 'sessions: Object.fromEntries' src/lib/store.ts && \
  grep -q 'roster = loadRoster(requireFolders())' src/lib/fs/server.ts && \
  grep -q 'await proc.resumeSession(persisted.sessionId, cwd)' src/lib/harness/index.ts && \
  grep -q 'fs.renameSync(tmp, file)' src/lib/fs/disk.ts && \
  grep -q 'import { runAgentTurn } from "@/runtime/harnessAdapter"' src/components/localbot/chat.tsx && \
  echo STAGE7_PASS
```

Pass looks like:

```
# tests 195
# pass 195
# fail 0
# tests 165
# pass 165
# fail 0
STAGE7_PASS
```

(165 = 140 Stage 1–6 tests + 20 in `host-index.test.ts` + 5 Harness resume scenarios; the first block is the template `scripts/**` suite.) On `main` (`420cc56`) `npm test` still passes (195 + 140 — main's `package.json` does not list the new suite) and the command then exits 1 at `! grep -q 'bots: s.bots,$'` because main's `partialize` persists the roster in `localStorage`; it would also fail at the `loadRoster`, `resumeSession` and `renameSync(tmp, file)` greps (verified in a `git worktree` of `main` on 2026-09-04). It fails when: `partialize` persists `bots` / `sessions` / `onboarded` / labels again (`store.ts no longer persists …`); `loadRoster` stops scanning `agents/` (`a data dir with agents/ on disk and no browser state at all yields the roster`, `a hand-copied agent folder appears …`); rename changes the id or keeps the session, archive is not read from `agent.json`, duplicate reuses a row (`rename keeps the id …`); a host JSON file is written without temp + rename + `.bak`; `chatsDir()` lands under a scope root or a chat is written there (`… not under private/ or any scope root`, `refuses to write chats when the data dir sits inside a scope folder`); `ensureSession` never persists the id after `session/new` (`the ACP sessionId is persisted …`); a fresh manager does not attempt `session/resume` after `stop()` (`after stop() a fresh manager resumes …` — `origin` must be `resumed` and the id unchanged); a refused resume does not fall back to `session/new` and store the new id; `forgetSession` leaves the persisted id; the migration loses ids / chats or runs twice; `chat.tsx` drops `runAgentTurn`; the dsh / ACP pins float.

Second command (optional) — the Stage 7 suite alone, verbose:

```
node --experimental-strip-types --test src/lib/fs/host-index.test.ts
```

Pass: `# pass 20` / `# fail 0`.

### How I test in the app

Done on this Linux host against the real 0.5B GGUF (sha256 `74a4da8c…` matches the catalog) through official llama.cpp b10749 and the real Harness; three recordings attached to the PR.

1. `rm -rf /tmp/lb && LOCALBOT_DATA_DIR=/tmp/lb npm run dev` (Node ≥ 22.15 on PATH or `LOCALBOT_DSH_NODE` set), open `http://localhost:8080/`, walk onboarding (Small; **Create my folders** with Acme / Ops / Sam; agent **Writer**), send Writer `Reply with one short sentence saying hello.` and wait for the reply. **New agent** → **Editor**; `…` → **Rename** → `Reviewer`; `…` → **Archive**; on Writer `…` → **Pin**. In a terminal: `cat /tmp/lb/localbot-agents.json` shows `"onboarded": true`, a `Writer` row with `"pinned": true` and a `"sessionId"`, a `Reviewer` row; `ls /tmp/lb/chats/` shows `bot_….json`; `grep archived …/agents/Reviewer/agent.json` is `true`; `ls /tmp/lb/*.bak` lists `localbot-agents.json.bak` and `localbot-config.json.bak`.
2. DevTools console: `JSON.stringify(Object.keys(JSON.parse(localStorage.getItem("localbot-state-v3")).state))` prints only `version`, `hardware`, `settings`, `runtime`, `previewWritesToProjectData` — no `bots`, no `sessions`, no `onboarded`. Then `localStorage.clear(); location.reload()`. The app opens straight into the chat (no wizard); the sidebar shows **Writer** with the pin icon and **Archived (1)** → **Reviewer**; Writer's chat still shows the hello exchange.
3. Stop the dev server (Ctrl-C; `pgrep dsh` is empty) and start it again with the same `LOCALBOT_DATA_DIR`. Reload, send Writer `Reply with the single word: ready`. A grey line **Resumed the previous Harness session.** appears before the reply; `grep sessionId /tmp/lb/localbot-agents.json` shows the same id as in step 1 and `ls /tmp/lb/dsh-home/sessions/ | wc -l` is still `1`. Migration check: point the server at a fresh `LOCALBOT_DATA_DIR` whose `localbot-config.json` has folders but no `localbot-agents.json`, inject a pre-Stage-7 blob in the console (`localStorage.setItem("localbot-state-v3", JSON.stringify({ state: { onboarded: true, company: …, bots: [{ id: "bot_old1", name: "Writer", pinned: true, … }], sessions: { bot_old1: { messages: [ … ] } } }, version: 0 }))`), reload: Writer (pinned) and Editor appear with the old chat line, `localbot-agents.json` has `"migratedFrom": "localbot-state-v3"` and the old ids, `chats/bot_old1.json` and `localbot-state-v3.migrated.json` exist; a second reload changes nothing on disk.

### Ready for

Stage 8 only after I say GO.
