# Architecture

This build is a TanStack Start **browser app**.

```
UI (React shell)
  → harnessAdapter.ts (tool loop + permission cards)
    → runHarnessTurn (server function)
      → https://api.x.ai/v1/chat/completions   model grok-4.5
    → fs/* server functions
      → real directories under the company root
```

There is no embedded llama.cpp, no DeepSeek Harness package, no Ollama, no Electron.

## 1. Shell

Named agents, chats, settings, onboarding. Dark, dense, keyboard-first.

- Sidebar of agent contacts
- Per-agent chat with tool chips
- Permission Allow once / Allow for this chat / Deny
- Computer pane lists **disk** under workspace / output / shared / outbox
- Company / department / employee / bot settings
- Runtime badge: `Hosted grok-4.5` or `AI unavailable`

## 2. Chat

Hosted grok-4.5 when `XAI_API_KEY` is set on the server. The UI never asks for a key. Catalog cards are placeholders; they do not download weights.

## 3. Files

All tool writes go through server functions in `src/lib/fs/server.ts`, which call `src/lib/fs/disk.ts`. Paths are resolved with `path.resolve` and refused if they escape the company root. Grant checks run in the browser and again on the server.

Default company root: `{cwd}/data/LocalBot/{CompanyName}`. Chosen path is stored in `{cwd}/data/localbot-config.json`.

## 4. Not built

- Desktop window / packagers
- llama.cpp / node-llama-cpp / Ollama
- Hugging Face GGUF download
- DeepSeek Harness
- Two-machine sync (share by pointing at the same real folder)
