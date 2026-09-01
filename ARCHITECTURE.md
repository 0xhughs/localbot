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
- Computer pane lists **disk** under workspace / output / shared / outbox
- Runtime badge: `Local {model name}` or `Local model not ready`

## 2. Chat

llama-server loads the active GGUF from `{cwd}/data/LocalBot/models/`. Bind is `127.0.0.1` only. Tool calls still write through the disk adapter.

Ollama is an optional Settings extra if something is already on `127.0.0.1:11434`. It is not the default.

## 3. Files

All tool writes go through server functions in `src/lib/fs/server.ts`, which call `src/lib/fs/disk.ts`. Paths are resolved with `path.resolve` and refused if they escape the company root.

Default company root: `{cwd}/data/LocalBot/{CompanyName}`. Models dir: `{cwd}/data/LocalBot/models`.

## 4. Not built

- Desktop window / packagers
- node-llama-cpp (cmake missing on this host; llama-server binary is used instead)
- DeepSeek Harness
- Two-machine sync (share by pointing at the same real folder)
