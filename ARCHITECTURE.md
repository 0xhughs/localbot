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

Electron is a window around the same UI. Signed `.dmg` / `.exe` are **not** this pass. llama.cpp binaries are mapped per (target, runtime) for macOS arm64 (Metal) / x64 (CPU), Windows x64 (CPU / CUDA 12.4 / Vulkan), and Linux x64 (CPU / Vulkan). Electron main does not start its own llama-server; the sidecar owns the one process.

### The loop is DeepSeek Harness (Stage 4)

The agent loop — model requests, tool ordering, tool results back to the model, retries, compaction, cancellation, permission coordination — is the upstream `@deepseek-ai/dsh` pinned at `0.1.2-alpha.5` (upstream commit `49a606b`), spoken to over the official Agent Client Protocol with `@agentclientprotocol/sdk` `1.4.0`. LocalBot no longer has a `while (rounds < 6)`; `src/runtime/harnessAdapter.ts` only starts a turn, polls committed ACP `session/update`s into chips and assistant text, answers `session/request_permission` through the existing Allow once / Allow for this chat / Deny cards, and turns Stop into `session/cancel`.

- The **sidecar** owns the `dsh` process (`src/lib/harness/process.ts`): isolated `DSH_HOME` at `{dataDir}/dsh-home`, hosted keys stripped from its environment, launched with `node --experimental-strip-types … dsh --profile acp --patch dsh/localbot-acp.cordis.yml --patch {DSH_HOME}/localbot-fs-plugin.patch.yml`. The renderer never talks to Harness or llama.cpp.
- `dsh/localbot-acp.cordis.yml` declares the single provider route `localbot-llama` (`api: openai-completions`, `http://127.0.0.1:18789/v1`, placeholder key-shaped value, no credential), disables the hosted DeepSeek route, telemetry, web search/fetch and subagent tooling, trims goal/todo/plan/skill/job tools so a small GGUF's context fits, and sets the bash sandbox to `read-only` so any shell side effect must escalate through an ACP permission request.
- `dsh/localbot-fs.mjs` is LocalBot's `ctx.fs` provider inside the Harness process. It extends the official `fs-local` mechanics but owns path → target: every path becomes `{ scope, relPath, agentName }` and goes through `resolveForAgent` → `resolveScopePath`. The ACP session `cwd` (`agents/{Name}/private`) only identifies the agent. Tool results show `private/hello.md`, never a host path.
- Session ids are persisted (Stage 7): `HarnessManager` writes `sessionId` + the `agents/{Name}/private` cwd into `{dataDir}/localbot-agents.json` after `session/new`. When its in-memory map is empty (sidecar restart) it calls ACP `session/resume` with that id — dsh restores its own log, LocalBot replays nothing — and falls back to `session/new` (storing the new id) when dsh refuses (unknown id, cwd moved, session active elsewhere). dsh-acp at this pin rejects `session/load`, so chat history is LocalBot's own file, not a Harness replay.
- Rename / archive (Stage 5) call `HarnessManager.forgetSession(agentName)` after the sidecar has moved the folder or flipped `agent.json`; the next prompt runs `session/new` with the agent's current `agents/{Name}/private`. Both are refused with `BUSY` while that agent has a running turn, so no session is ever left pointed at a folder that moved.
- Node: dsh at this pin needs Node ≥ 22.15 (`node:zlib` zstd). The sidecar launches it with `LOCALBOT_DSH_NODE`, its own Node if new enough, or a newer nvm Node, and otherwise refuses with the exact reason. There is no fallback loop. Electron 36 embeds Node 22.14, so packaged mode is a Stage 8 item.

Ollama is not required.

## 1. Shell

Named agents, chats, settings, onboarding. Dark, dense, keyboard-first.

- Sidebar of agent contacts
- Per-agent chat with tool chips
- Permission Allow once / Allow for this chat / Deny
- Computer pane lists **disk** per configured scope: Private / My agents / Department / Company (null scopes hidden), with Refresh, live re-listing on external changes, and a per-section Disconnected banner
- Runtime badge: `Local {model name}` for the **selected agent's** file (`modelStatusForAgent`), `Ollama {tag}` / `Ollama — pick a model` with the switch on, or `Local model not ready`

## 2. Chat

One llama-server per installation (Stage 6). `appLaunchReport(agentName)` (`src/lib/runtime/harness-launch.ts`) reads the agent's `agent.json.modelId`, resolves it to a **verified** GGUF in the models folder (`resolveModelForAgent`; a missing / unverified file falls back to the global active file with a visible notice) and calls `ensureLocalServer(modelPath)`. The engine remembers which file its child serves; a different file stops that child (waits for its exit, then for `/health` to go dark), spawns llama-server on the new file and waits until `/health` is 200, `/props.model_path` names the file and a 1-token completion answers. The dsh process is untouched — its launch key (loopback URL, `local`, 8192 ctx) does not change across a switch. A switch is refused while another agent has a running turn. Bind is `127.0.0.1` only; the Harness reaches the server as the `localbot-llama` route with `localContextTokens()` (floor 8192).

Which llama.cpp build runs is `pickLlamaRuntime(target, gpuProbe, preference)` (`src/lib/runtime/llama-platform.ts`) over `catalog/llama-assets.json`, which pins one official b10749 row per (target, runtime): linux-x64 `cpu` / `vulkan`, win32-x64 `cpu` / `cuda-12.4` (+ cudart) / `vulkan`, darwin-arm64 `metal`, darwin-x64 `cpu` (GPU NOT BUILT — no asset). The probe (`src/lib/hardware-server.ts` `probeGpu`) reads real host sources in the sidecar — `nvidia-smi`, `/proc/driver/nvidia`, `/sys/class/drm` + `/dev/dri`, Vulkan ICDs, WMI, `arch` — never the browser's WebGL string. `--n-gpu-layers` is `gpuLayersFor(asset, probe, modelBytes)`: 0 on a CPU build, all (99) or a VRAM-proportional share on a GPU build. Runtimes unpack to `bin/{target}/{runtime}/`. GPU execution is UNVERIFIED in this repo (CPU-only host); selection is tested.

A GGUF is loadable only after `verifyGgufFile` (size when the catalog knows it, GGUF magic, sha256 when the catalog knows it; a downloadable catalog row without a hash is refused). Download completion, "already on disk", `findReadyModel` and import all activate through `activateModel`; the result lands in `localbot-config.json` → `verifiedModels`. Import adopts a catalog id only when the filename is that row's; any other file is registered under its own filename so the badge and `agent.json` name the real file.

With **Allow hosted demo** on, the Harness path refuses (`HOSTED_DEMO_REFUSAL`) instead of routing a key; the hosted single-completion code is kept but off the chat path.

Ollama: with **Use existing Ollama** on, `listOllamaModels()` lists `127.0.0.1:11434/api/tags` (typed errors, not a ping), Settings → Safety picks a tag (`ollamaModel` in config), and the same `localbot-llama` route points at `http://127.0.0.1:11434/v1` with that tag. A silent port, an empty list or no pick is a visible error and the prompt is refused — no fallthrough to llama.cpp, no hosted route. Still loopback, still not the default, still not required.

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
- Two-machine sync (share by pointing at the same real folder)

## 5. Durable host state (Stage 7)

The browser's `localStorage["localbot-state-v3"]` keeps UI chrome only (`settings.darkMode` / `denseUi` / `webSearchEnabled` / `controlThisComputer` / `companyRootIsShared`, the last `hardware` scan, the `runtime` badge, `previewWritesToProjectData`). Everything the employee would miss after clearing site data is on disk and read by `stateLoad` before the first render (`app.tsx` waits for `diskLoaded`):

| What | Where | Owner |
|---|---|---|
| Folders, active model, `verifiedModels`, `allowHostedDemo`, `useExistingOllama`, `ollamaModel`, `llamaRuntime` | `{dataDir}/localbot-config.json` | `patchConfig` (`src/lib/fs/disk.ts`) |
| `onboarded`, company / department / employee labels + ids, `selectedCatalogId`, `migratedFrom`, per-agent `{ id, name, pinned, hidden, unread, sessionId, sessionCwd, createdAt }` | `{dataDir}/localbot-agents.json` (v1) | `src/lib/fs/host-index.ts` |
| `job`, `modelId`, `color`, `mascotId`, `scopes`, `archived` | `{employeeRoot}/agents/{Name}/agent.json` | `src/lib/fs/scopes.ts` (unchanged) |
| Chat transcript + "Allow for this chat" grants | `{dataDir}/chats/{agentId}.json` | `chatSave` (debounced 400 ms in the store, flushed on `pagehide`) |
| Harness session logs | `{dataDir}/dsh-home/` | dsh |

The roster is `agents/*/agent.json` ⋈ index by name (`loadRoster`): a folder with no row gets a fresh id, a row whose folder vanished is not shown (kept so its chat file stays addressable). Lifecycle server fns keep the index in step — `agentEnsure` / `agentDuplicate` return the row id, `agentRename` renames the row (same id, session cleared), `agentSetArchived(true)` clears the session, `agentRemove` drops the row and the chat file. Every host JSON write is `atomicWriteJson`: temp file + `renameSync`, previous copy kept as `.bak`. `stateMigrate` imports a browser `localbot-state-v3` once (only while no index exists), keeps the old bot ids so chats stay attached, writes `localbot-state-v3.migrated.json` as a recoverable export, and the store's `partialize` no longer persists bots / sessions / onboarded / labels.
