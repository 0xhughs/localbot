# Architecture

This build is a TanStack Start app in an **Electron window** (`npm run desktop`) and a browser preview (`npm run dev`). Default chat is a **local GGUF**.

```
Electron window (no URL bar)
  → existing TanStack UI
    → harnessAdapter.ts
      → llama-server 127.0.0.1:18789   (default)
      → api.x.ai grok-4.5              (only if Allow hosted demo is ON)
```

Electron is a window around the same UI. Signed `.dmg` / `.exe` are **not** this pass. llama.cpp binaries are mapped for macOS arm64/x64, Windows x64, and Linux x64.

There is no DeepSeek Harness, no required Ollama install.

## 1. Shell

Named agents, chats, settings, onboarding. Dark, dense, keyboard-first.

- Sidebar of agent contacts
- Per-agent chat with tool chips
- Permission Allow once / Allow for this chat / Deny
- Computer pane lists **disk** per configured scope: Private / My agents / Department / Company (null scopes hidden), with Refresh, live re-listing on external changes, and a per-section Disconnected banner
- Runtime badge: `Local {model name}` or `Local model not ready`

## 2. Chat

llama-server loads the active GGUF from `{cwd}/data/LocalBot/models/`. Bind is `127.0.0.1` only. Tool calls still write through the disk adapter.

Ollama is an optional Settings extra if something is already on `127.0.0.1:11434`. It is not the default.

## 3. Files

All tool calls send `{ scope, relPath, agentName }` to server functions in `src/lib/fs/server.ts`. `src/lib/fs/scopes.ts` resolves the scope from `localbot-config.json` (`folders.employeeRoot` / `employeeShared` / `departmentShared` / `companyShared`), refuses `..`, absolute / drive / UNC paths, unset scopes and symlink escapes (realpath), checks the agent's `agent.json` scope grant, then calls the disk primitives in `src/lib/fs/disk.ts`. The browser never supplies a root. See `FOLDER_CONTRACT.md`.

Electron adds two native actions through `desktop/preload.mjs`: `pickFolder()` → `localbot:pickFolder` IPC → `dialog.showOpenDialog` (the picked path is validated by the sidecar before it is saved), and `revealPath(hostPath)` → `localbot:revealPath` IPC → `shell.showItemInFolder` (main re-checks the path against the configured folders; the path itself comes from the sidecar's `browseHostPath`, never from the browser).

### Watch / poll / Refresh (Stage 3)

`src/lib/fs/watch.ts` runs one `RootWatcher` per configured folder inside the sidecar. Where the OS delivers events it uses recursive `fs.watch` plus a 15 s safety poll; on network mounts, UNC paths, or when `fs.watch` cannot attach it falls back to a bounded metadata poll (2 s, depth 4, 2000 entries). Each root exposes a monotonic `version` and `ok` / `disconnected`. The Computer pane polls `scopesStatus` every 3 s and re-lists a section when its version moves; **Refresh** calls `browseRefresh`, which rescans every root now. A root that cannot be stat'ed is `DISCONNECTED` for every op on that scope — never an empty listing, never a locally recreated folder.

Models dir: `{cwd}/data/LocalBot/models` (preview) or `{appData}/LocalBot/models` (Electron).

## 4. Not built

- Signed / notarized installers (unsigned unpacked Electron only)
- Real NAS / two-machine verification of the poll fallback (poll mode was forced in tests, not measured on SMB/NFS)
- node-llama-cpp (cmake missing on this host; llama-server binary is used instead)
- DeepSeek Harness
- Two-machine sync (share by pointing at the same real folder)
