# Architecture

Four layers, one app.

```
UI (shell)
  → LocalBot runtime
    → DeepSeek Harness adapter
      → local OpenAI-compatible endpoint (llama.cpp on 127.0.0.1:18789)
```

The UI never calls the model directly.

## 1. Shell

Named agents, chats, settings, onboarding. Desktop-dense, dark, keyboard-first.

- Sidebar of agent contacts (pin, unread, rename, duplicate, hide, delete)
- Per-agent chat timeline with streaming tool chips
- Permission Allow once / Allow for this chat / Deny
- Computer pane: workspace, output, shared, outbox
- Company / department / employee / bot settings

## 2. Inference

Embedded llama.cpp (or the preview runtime that exposes the same OpenAI-compatible surface). Loads GGUF from disk. Binds **loopback only**:

```
http://127.0.0.1:18789/v1
```

No LAN bind. Metal on Mac, CPU everywhere, CUDA optional on desktop builds. A CPU-only first run on a weak laptop still chats with Small.

## 3. Harness

DeepSeek Harness as the agent loop, isolated behind `src/runtime/harnessAdapter.ts` so the UI does not import Cordis plugins.

- Model plugin pointed at the local llama.cpp endpoint
- Standard mode for normal agents; Minimal only for tiny machines
- Tools: filesystem scoped to granted folders, shell scoped to workspace, editor/str_replace, optional web search if the user turns it on
- Session transcripts under `{localbotHome}/sessions/{agentId}/`

If Harness plugin APIs shift, only the adapter changes.

## 4. Workspace

A real directory tree on disk. Every agent may only read and write inside folders granted to it. See [FOLDER_CONTRACT.md](FOLDER_CONTRACT.md).

## Data

- `{localbotHome}/` — app config, models, sessions, logs
- `{CompanyRoot}/` — company tree and work product

No required cloud database. Default path has no secrets.

## Permission broker

Always ask: shell, deletes, writes outside workspace/output/shared, network, anything that leaves the company root.

Allowed after first grant: read/write inside `workspace/` and `output/`; list `shared/` if granted.

Kill switch in the chat header: Stop.
