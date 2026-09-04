# Architecture

This build is a TanStack Start app in an **Electron window** (`npm run desktop`) and a browser preview (`npm run dev`). Default chat is a **local GGUF**.

```
Electron window (no URL bar)
  → existing TanStack UI (chat.tsx)
    → src/runtime/harnessAdapter.ts        thin ACP client: prompt / poll / decide / cancel
      → server fns src/lib/runtime/harness.ts
        → sidecar: src/lib/harness/        one dsh process, one ACP session per agent
          → dsh --profile acp --patch dsh/localbot-acp.cordis.yml   (DeepSeek Harness 0.1.2-alpha.5)
              ├─ localbot-llama route → llama-server 127.0.0.1:18789/v1  (the only model route)
              └─ ctx.fs = dsh/localbot-fs.mjs → src/lib/fs/scopes.ts resolveScopePath
```

Electron is a window around the same UI. Signed `.dmg` / `.exe` are **not** this pass. llama.cpp binaries are mapped for macOS arm64/x64, Windows x64, and Linux x64.

### The loop is DeepSeek Harness (Stage 4)

The agent loop — model requests, tool ordering, tool results back to the model, retries, compaction, cancellation, permission coordination — is the upstream `@deepseek-ai/dsh` pinned at `0.1.2-alpha.5` (upstream commit `49a606b`), spoken to over the official Agent Client Protocol with `@agentclientprotocol/sdk` `1.4.0`. LocalBot no longer has a `while (rounds < 6)`; `src/runtime/harnessAdapter.ts` only starts a turn, polls committed ACP `session/update`s into chips and assistant text, answers `session/request_permission` through the existing Allow once / Allow for this chat / Deny cards, and turns Stop into `session/cancel`.

- The **sidecar** owns the `dsh` process (`src/lib/harness/process.ts`): isolated `DSH_HOME` at `{dataDir}/dsh-home`, hosted keys stripped from its environment, launched with `node --experimental-strip-types … dsh --profile acp --patch dsh/localbot-acp.cordis.yml --patch {DSH_HOME}/localbot-fs-plugin.patch.yml`. The renderer never talks to Harness or llama.cpp.
- `dsh/localbot-acp.cordis.yml` declares the single provider route `localbot-llama` (`api: openai-completions`, `http://127.0.0.1:18789/v1`, placeholder key-shaped value, no credential), disables the hosted DeepSeek route, telemetry, web search/fetch and subagent tooling, trims goal/todo/plan/skill/job tools so a small GGUF's context fits, and sets the bash sandbox to `read-only` so any shell side effect must escalate through an ACP permission request.
- `dsh/localbot-fs.mjs` is LocalBot's `ctx.fs` provider inside the Harness process. It extends the official `fs-local` mechanics but owns path → target: every path becomes `{ scope, relPath, agentName }` and goes through `resolveForAgent` → `resolveScopePath`. The ACP session `cwd` (`agents/{Name}/private`) only identifies the agent. Tool results show `private/hello.md`, never a host path.
- Session ids are in memory (one per agent, per sidecar process). Durable roster / chats are AGENTS.md item 7.
- Rename / archive (Stage 5) call `HarnessManager.forgetSession(agentName)` after the sidecar has moved the folder or flipped `agent.json`; the next prompt runs `session/new` with the agent's current `agents/{Name}/private`. Both are refused with `BUSY` while that agent has a running turn, so no session is ever left pointed at a folder that moved.
- Node: dsh at this pin needs Node ≥ 22.15 (`node:zlib` zstd). The sidecar launches it with `LOCALBOT_DSH_NODE`, its own Node if new enough, or a newer nvm Node, and otherwise refuses with the exact reason. There is no fallback loop. Electron 36 embeds Node 22.14, so packaged mode is a Stage 8 item.

Ollama is not required.

## 1. Shell

Named agents, chats, settings, onboarding. Dark, dense, keyboard-first.

- Sidebar of agent contacts
- Per-agent chat with tool chips
- Permission Allow once / Allow for this chat / Deny
- Computer pane lists **disk** per configured scope: Private / My agents / Department / Company (null scopes hidden), with Refresh, live re-listing on external changes, and a per-section Disconnected banner
- Runtime badge: `Local {model name}` or `Local model not ready`

## 2. Chat

llama-server loads the active GGUF from `{cwd}/data/LocalBot/models/` (`ensureLocalServer`, unchanged). Bind is `127.0.0.1` only. The Harness reaches it as the `localbot-llama` route; the context window handed to llama-server and declared to the route is `localContextTokens()` (floor 8192, so the Harness prompt fits).

With **Allow hosted demo** on, the Harness path refuses (`HOSTED_DEMO_REFUSAL`) instead of routing a key; the hosted single-completion code is kept but off the chat path.

Ollama: with **Use existing Ollama** on and `127.0.0.1:11434` answering, the route points there (`llama3.2`). Still loopback, still not the default.

## 3. Files

Agent lifecycle (Stage 5) is sidecar-first: `agentRename` → `renameAgent` moves `agents/{Old}/` → `agents/{New}/`; `agentDuplicate` → `copyAgent` copies `private/` + `AGENTS.md` into a new folder; `agentSetArchived` flips `archived` in `agent.json`; `agentRemove` (Delete) is the only destructive path. The store updates its roster only after the sidecar succeeds. Names are cleaned with `agentSlug` in the browser and refused by `assertAgentName` on the sidecar; collisions are checked on disk, case-insensitively. See `FOLDER_CONTRACT.md` → *Agent lifecycle*.

The Computer pane and agent tools send `{ scope, relPath, agentName }` to server functions in `src/lib/fs/server.ts`; inside the Harness process the `ctx.fs` provider (`dsh/localbot-fs.mjs`) builds the same triple from the session cwd and the model's path. Both end in `src/lib/fs/scopes.ts`, which resolves the scope from `localbot-config.json` (`folders.employeeRoot` / `employeeShared` / `departmentShared` / `companyShared`), refuses `..`, absolute / drive / UNC paths, unset scopes and symlink escapes (realpath), checks the agent's `agent.json` scope grant, then calls the disk primitives in `src/lib/fs/disk.ts`. The browser never supplies a root. See `FOLDER_CONTRACT.md`.

Electron adds two native actions through `desktop/preload.mjs`: `pickFolder()` → `localbot:pickFolder` IPC → `dialog.showOpenDialog` (the picked path is validated by the sidecar before it is saved), and `revealPath(hostPath)` → `localbot:revealPath` IPC → `shell.showItemInFolder` (main re-checks the path against the configured folders; the path itself comes from the sidecar's `browseHostPath`, never from the browser).

### Watch / poll / Refresh (Stage 3)

`src/lib/fs/watch.ts` runs one `RootWatcher` per configured folder inside the sidecar. Where the OS delivers events it uses recursive `fs.watch` plus a 15 s safety poll; on network mounts, UNC paths, or when `fs.watch` cannot attach it falls back to a bounded metadata poll (2 s, depth 4, 2000 entries). Each root exposes a monotonic `version` and `ok` / `disconnected`. The Computer pane polls `scopesStatus` every 3 s and re-lists a section when its version moves; **Refresh** calls `browseRefresh`, which rescans every root now. A root that cannot be stat'ed is `DISCONNECTED` for every op on that scope — never an empty listing, never a locally recreated folder.

Models dir: `{cwd}/data/LocalBot/models` (preview) or `{appData}/LocalBot/models` (Electron).

## 4. Not built

- Signed / notarized installers (unsigned unpacked Electron only)
- Real NAS / two-machine verification of the poll fallback (poll mode was forced in tests, not measured on SMB/NFS)
- node-llama-cpp (cmake missing on this host; llama-server binary is used instead)
- Harness in the packaged Electron binary (Electron 36's Node 22.14 cannot load dsh; Stage 8)
- Durable Harness session ids / chats off `localStorage` (item 7)
- Two-machine sync (share by pointing at the same real folder)
