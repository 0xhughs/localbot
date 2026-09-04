## Stage 5 — Multi-agent polish

Date: 2026-09-04
Branch: `stage-5-multi-agent-polish` (PR #5 → `main`, off `b8e6fce`)

This is AGENTS.md item 5 (rename / duplicate / archive, memory folders, file handoff). It is **not** the complete-plan Stage 5 two-machine gate, not item 6 (GPU / catalog), and not item 7 (chats / roster off `localStorage`).

### Built

- **Rename** — sidebar `…` → **Rename** (or double-click the row). The store calls the sidecar first: `agentRename` → `renameAgent` (`src/lib/fs/scopes.ts`) moves `agents/{Old}/` → `agents/{New}/` with one `fs.renameSync` — `agent.json`, `AGENTS.md`, `private/memory/notes.md`, `private/output/` and everything else come along; nothing is copied or deleted. `agent.json.name` and the `# Name` heading in `AGENTS.md` and the mirrored `private/AGENTS.md` are rewritten. A case-only rename (`Writer` → `writer`) goes through a temporary `.rename-*` name so case-insensitive filesystems do it too. Refused (`BAD_NAME` / `EXISTS` / `NOT_FOUND` / `BUSY`, shown as a red notice in the sidebar) for: empty, `\ / : * ? " < > |`, control chars, dot names, Windows reserved names, > 64 chars; a name another agent already owns on disk, compared case-insensitively; a missing source folder; a running Harness turn. Only after the move does the roster label and `privatePath` change; chats stay keyed by `bot.id`. **WORKS** (tests + app run).
- **Harness after rename** — `HarnessManager.hasActiveTurn` / `forgetSession` (`src/lib/harness/index.ts`). `agentRename` refuses while a turn is running, otherwise drops the agent's in-memory ACP session; the next message runs `session/new` with cwd `agents/{New}/private`. No session is left pointed at the old folder. **WORKS** (Harness suite scenario + a new `…agents-Author-private` session log appeared in `dsh-home/sessions` during the app run).
- **Archive / Unarchive** — sidebar `…` → **Archive**, separate from Hide and Delete. `agentSetArchived` flips only `"archived"` in `agents/{Name}/agent.json` (the durable record; `Bot.archived` in the browser mirrors it and `ensureAgents` re-reads it). No file is moved or removed; `agentRemove` is not called. Archived agents leave the default roster, the palette, the `@` hint and the model's roster blurb; an **Archived (n)** group at the bottom of the sidebar lists them with **Unarchive** and **Delete**. Archiving the selected agent moves the selection. Refused mid-turn. **Hide** stays a local UI filter (this browser's `localStorage`); **Delete** stays the destructive path through `agentRemove`. **WORKS**.
- **Duplicate** — `agentDuplicate` → `copyAgent`: `fs.cpSync` of the source `private/` (memory, output, drafts, …) plus the source `AGENTS.md` (retitled) into a fresh `agents/{Name copy}/` with a fresh `agent.json` (`archived: false`, new `createdAt`, same scopes). The mirrored `private/AGENTS.md` is not copied (the sidecar regenerates it under the new name). Names are `X copy`, `X copy 2`, … free on disk and in the roster. A target that already exists on disk (any casing) is refused. The two agents never share a folder. **WORKS**.
- **Names** — `agentSlug` (`scope-model.ts`) is the one cleaner in the browser; `store.slugName` is gone. `assertAgentName` on the sidecar refuses instead of cleaning, and `ensureAgent` refuses to adopt an existing folder that differs only by case (collision on disk, not only in the store). **WORKS**.
- **Memory** — still `private/memory/notes.md`; create / duplicate / rename all leave it in place (duplicate copies it, rename moves it). The Computer pane lists it under **Private** → `memory/`. Model tools may write it; `private/AGENTS.md` stays read-only for tools and `agents/{Name}/AGENTS.md` is outside every scope root (unchanged from Stage 4). **WORKS**.
- **@Name handoff** — unchanged path: `task-{ts}-{From}-to-{To}.md` into `employee-shared/` if set, else `department-shared/`, else a clear error and nothing written; never `company-shared/` or a private folder; both agents must be granted the scope. Now also refuses an archived or hidden target (nothing written). Same-install only. The file appeared in the Computer pane's **My agents** section without a reload (Stage 3 watcher). **WORKS**.
- **Tests** — `src/lib/fs/agents.test.ts` (16) and one new scenario in `src/lib/harness/harness.test.ts`; both in `npm test`. Verified by mutation: (1) rename that only rewrites `agent.json` without `renameSync` fails 3 tests; (2) archive that `rmSync`s `private/` fails 2; (3) duplicate that skips `cpSync` fails 1; (4) store `renameBot` that skips `agentRename` fails 1; (5) handoff that no longer refuses archived targets fails 1.

### Not built

- Item 6: GPU runtimes, catalog hashes for the 1.5B / 3B / 7B rows, per-agent model route, Ollama discovery, the wizard import badge bug. **NOT BUILT.**
- Item 7: roster / chats off `localStorage["localbot-state-v3"]`; durable ACP session ids (a rename or sidecar restart starts a fresh session by design here). **NOT BUILT.**
- Item 8: signed installers, Harness inside the packaged Electron binary (Node 22.14 < 22.15), bundled Node. **NOT BUILT.** Two-machine / NAS run **UNVERIFIED**.
- Renaming an agent while its Harness turn runs is refused rather than queued. The dsh `bash` sandbox may hold a shell whose cwd was the old folder; on Linux the cwd follows the moved inode, on Windows a rename with an open handle could fail with `EPERM` — **UNVERIFIED** off Linux (the error would surface as the sidebar notice; nothing is half-moved because it is a single `rename`).
- Hidden agents still have no dedicated "unhide" control beyond Settings (pre-existing; Hide is a local filter and out of the Stage 5 brief).
- The 0.5B GGUF answered the warm-up prompt with a raw tool-call string instead of prose (documented weak tool calling since the local-model pass; not touched).
- Undo of a rename / duplicate; moving folders when a *scope* changes (still does not move old files, by contract).

### Files changed

- `src/lib/fs/scopes.ts` — `assertAgentName`, `AGENT_NAME_MAX`, `listAgentDirs`, `agentDirOwner`, `renameAgent`, `copyAgent`, `uniqueCopyName`, `setAgentArchived`, `archived` on `AgentRecord`, `ensureAgent` (case-collision refusal, preserves `archived`, returns `name` / `archived`), new `ScopeErrorCode`s `BAD_NAME` / `EXISTS` / `NOT_FOUND` / `BUSY`.
- `src/lib/fs/server.ts` — `agentRename`, `agentDuplicate`, `agentSetArchived`; `agentInfo` returns `archived`.
- `src/lib/harness/index.ts` — `hasActiveTurn`, `forgetSession`.
- `src/lib/store.ts` — `agentSlug` everywhere (`slugName` removed); `renameBot` async through the sidecar; `duplicateBot` via `agentDuplicate`; `archiveBot`; `hideBot` / `deleteBot` reselect; `handoffTask` refuses archived / hidden; `ensureAgents` hydrates `archived`; `visibleBots` / `archivedBots`.
- `src/lib/types.ts` — `Bot.archived`, `isActiveBot`.
- `src/components/localbot/sidebar.tsx` — Rename (inline `RenameField`), Archive, Archived group with Unarchive / Delete, error notice; menus close on click.
- `src/components/localbot/chat.tsx`, `palette.tsx`, `shell.tsx`, `settings.tsx`, `src/lib/runtime/prompt.ts` — roster filters exclude archived; Settings → Agents shows an `archived` tag.
- `src/lib/fs/scope-model.ts` — comment on `agentSlug`.
- `src/lib/fs/agents.test.ts` (new), `src/lib/harness/harness.test.ts` (+1 scenario), `package.json` (`npm test`).
- `LOCALBOT_HANDOFF.md`, `STAGE_HANDOFF.md`, `FOLDER_CONTRACT.md`, `ARCHITECTURE.md`, `README.md`.

### Prove it

Command (needs Node ≥ 22.15 on `PATH` or `LOCALBOT_DSH_NODE` for the Harness suite, as in Stage 4; `npm install` first):

```
npm run lint && npm run typecheck && npm test && \
  grep -q 'await agentRename({ data: { agentName: bot.name, newName' src/lib/store.ts && \
  grep -q 'fs.renameSync(src, dst)' src/lib/fs/scopes.ts && \
  ! grep -q 'function slugName' src/lib/store.ts && \
  grep -q 'archiveBot(bot.id, false)' src/components/localbot/sidebar.tsx && \
  echo STAGE5_PASS
```

Pass looks like:

```
# tests 195
# pass 195
# fail 0
# tests 119
# pass 119
# fail 0
STAGE5_PASS
```

(119 = 102 Stage 1–4 tests + 16 in `agents.test.ts` + 1 Harness scenario; the first block is the template `scripts/**` suite.) On `main` this fails at `npm test` with `Could not find 'src/lib/fs/agents.test.ts'`. It fails when: rename changes the label but leaves `agents/{Old}/` in place, or `private/memory/notes.md` does not follow (`the whole tree follows …`); the store renames without calling `agentRename` (`store rename goes through the sidecar …`); two agents share one disk folder or the copy lacks the source memory / `AGENTS.md` after duplicate (`copyAgent: separate folders …`); archive removes or moves any file, or is not written to `agent.json` (`setAgentArchived flips only agent.json …`, plus the source assertion that `setAgentArchived` contains no `rmSync` / `renameSync`); a name collision, empty / illegal name or missing source is accepted; `handoffScope` can return anything but `employee-shared` / `department-shared`, or the store stops refusing archived / hidden targets; `..` / absolute / drive / UNC / symlink escapes pass for a renamed agent; `chat.tsx` drops `runAgentTurn`; the dsh / ACP pins float; after a rename the Harness session cwd is not `agents/{New}/private` or the old session survives (`Stage 5: rename is refused mid-turn; afterwards …`).

Second command (optional) — the Stage 5 suite alone, verbose:

```
node --experimental-strip-types --test src/lib/fs/agents.test.ts
```

Pass: `# pass 16` / `# fail 0`.

### How I test in the app

Done on this Linux host against the real 0.5B GGUF (sha256 matches the catalog) through official llama.cpp b10749 and the real Harness; recording attached to the PR.

1. `rm -rf /tmp/lb && LOCALBOT_DATA_DIR=/tmp/lb npm run dev` (Node ≥ 22.15 on PATH or `LOCALBOT_DSH_NODE` set), open `http://localhost:8080/`, walk onboarding (Small model; **Create my folders**; Skip Company shared; agent **Writer**), then **New agent** → **Editor**. Send Writer one message so llama-server and the Harness are up. In a terminal: `echo "- Remember: the Q3 brief is due Friday." >> /tmp/lb/LocalBot/Acme/departments/Ops/employees/Sam/agents/Writer/private/memory/notes.md`.
2. Hover **Writer** → `…` → **Rename** → type `Author`, Enter. The row and the chat header read **Author**. `ls …/Sam/agents/` shows `Author Editor` and no `Writer`; `head -1 …/agents/Author/AGENTS.md` is `# Author`. Open the Computer pane → **Private** → `memory` → `notes.md` shows the Q3 line. `…` → **Rename** → `editor` → Enter: the name stays and the sidebar shows **An agent named editor already exists.** Send Author a message: it answers, and `ls /tmp/lb/dsh-home/sessions/` gains a `…-agents-Author-private--` entry (new session, new cwd).
3. `…` → **Duplicate** → **Author copy** appears; its **Private** → `memory/notes.md` shows the same Q3 line and `…/agents/Author copy/private/memory/notes.md` exists on disk. `…` → **Archive** on Author copy: it leaves the list, **Archived (1)** appears at the bottom; `cat "…/agents/Author copy/agent.json"` shows `"archived": true` and the folder is still there. Expand Archived → **Unarchive** brings it back; archive it again. In Author's chat send `@Editor please review the Q3 brief`: the chat shows **Handed work to Editor via employee-shared/task-…-Author-to-Editor.md**, Editor gets an unread dot, and the file appears under **My agents** in the Computer pane within ~3 s without a reload.

### Ready for

Stage 6 only after I say GO.
