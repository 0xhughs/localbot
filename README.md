# LocalBot

Browser app: named agents, folder grants, a file pane. Chat uses **hosted grok-4.5**. Work files live on **disk at the company root**.

There is no desktop installer and no local GGUF inference in this build. The model picker is a catalog placeholder.

## First run

```
npm install
npm run dev
open http://127.0.0.1:8080
```

1. Walk the welcome screens.
2. Pick a catalog size (stored as an id only — nothing is downloaded).
3. Name the company, department, employee, and first agent. Set the company root (defaults to `{cwd}/data/LocalBot/{CompanyName}`).
4. Chat. Ask Writer to write `hello.md` into its workspace. The file is created on disk.

Chat needs `XAI_API_KEY` on the server. If it is missing, the header shows **AI unavailable** and turns return an error. Onboarding still finishes.

## Where files go

Company root is a real directory, default:

```
{cwd}/data/LocalBot/{CompanyName}/
```

On this preview that is the project `data/` folder. Two people share work only if they point at the **same real folder** (NAS / Drive / shared disk) on the machine running `npm run dev`. This process cannot see another laptop’s disk.

Uninstalling the browser profile does not delete the company root on disk.

## Keyboard

- `⌘K` / `Ctrl+K` command palette
- `⌘N` / `Ctrl+N` new agent
- `⌘,` / `Ctrl+,` settings
- `Enter` send · `Shift+Enter` newline
- `Esc` close overlays

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md), [FOLDER_CONTRACT.md](FOLDER_CONTRACT.md), and [CATALOG.md](CATALOG.md).
