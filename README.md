# LocalBot

Browser app: named agents, folder grants, a file pane. Chat uses a **local GGUF** via llama.cpp on this machine. Work files live on **disk at the company root**.

No API key is required on the default path. Hosted models stay off unless you turn on **Allow hosted demo (breaks policy)** in Settings.

## First run

```
npm install
npm run dev
open http://127.0.0.1:8080
```

1. Walk the welcome screens.
2. Server hardware scan (Node RAM/disk — not a 16 GB browser guess).
3. Pick Small if it fits. Recommended/Large grey out when this machine cannot hold them.
4. Download the GGUF from Hugging Face into `{cwd}/data/LocalBot/models/`, or import a `.gguf` already on this machine. Continue is disabled until the file verifies.
5. Name the company, department, employee, and first agent.
6. Chat. Ask Writer to write `hello.md` into its workspace.

If no GGUF is loaded, the header says **Local model not ready** and the turn returns that error. It does not fall back to a hosted model.

## Where files go

```
{cwd}/data/LocalBot/models/{filename}     # GGUF weights
{cwd}/data/LocalBot/{CompanyName}/        # company tree
{cwd}/data/localbot-config.json           # company root, models dir, active GGUF
```

Two people share work only if they point at the **same real folder** on the machine running `npm run dev`.

## Keyboard

- `⌘K` / `Ctrl+K` command palette
- `⌘N` / `Ctrl+N` new agent
- `⌘,` / `Ctrl+,` settings
- `Enter` send · `Shift+Enter` newline
- `Esc` close overlays

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md), [FOLDER_CONTRACT.md](FOLDER_CONTRACT.md), and [CATALOG.md](CATALOG.md).
