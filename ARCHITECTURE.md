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
- Computer pane lists **disk** per configured scope: Private / My agents / Department / Company (null scopes hidden)
- Runtime badge: `Local {model name}` or `Local model not ready`

## 2. Chat

llama-server loads the active GGUF from `{cwd}/data/LocalBot/models/`. Bind is `127.0.0.1` only. Tool calls still write through the disk adapter.

Ollama is an optional Settings extra if something is already on `127.0.0.1:11434`. It is not the default.

## 3. Files

All tool calls send `{ scope, relPath, agentName }` to server functions in `src/lib/fs/server.ts`. `src/lib/fs/scopes.ts` resolves the scope from `localbot-config.json` (`folders.employeeRoot` / `employeeShared` / `departmentShared` / `companyShared`), refuses `..`, absolute / drive / UNC paths, unset scopes and symlink escapes (realpath), checks the agent's `agent.json` scope grant, then calls the disk primitives in `src/lib/fs/disk.ts`. The browser never supplies a root. See `FOLDER_CONTRACT.md`.

Electron adds one native action through `desktop/preload.mjs`: `pickFolder()` → `localbot:pickFolder` IPC → `dialog.showOpenDialog`. The picked path is validated by the sidecar before it is saved.

Models dir: `{cwd}/data/LocalBot/models` (preview) or `{appData}/LocalBot/models` (Electron).

## 4. Not built

- Signed / notarized installers (unsigned unpacked Electron only)
- Folder watch / poll / Refresh (Stage 3)
- node-llama-cpp (cmake missing on this host; llama-server binary is used instead)
- DeepSeek Harness
- Two-machine sync (share by pointing at the same real folder)
