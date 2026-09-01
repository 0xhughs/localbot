# LocalBot

Named agents in a **desktop window** (and a browser preview). Chat uses a **local GGUF** via llama.cpp on this machine. Work files live on **disk at the company root**.

No API key is required on the default path. Hosted models stay off unless you turn on **Allow hosted demo (breaks policy)** in Settings.

This pass is an **Electron window**, not a signed store installer. There is no notarized `.dmg` / `.exe`.

## First run

```
npm install
npm run desktop
```

That starts the UI if needed and opens LocalBot with no URL bar. Agents show mascots. Chat stays on the local GGUF.

Also keep the browser preview:

```
npm run dev
```

1. Walk the welcome screens.
2. Hardware scan. On a 16 GB-class machine, Recommended (Qwen 2.5 3B) is offered. 0.5B stays Small for 4 GB machines.
3. Download the GGUF from Hugging Face, or import a `.gguf` already on this machine.
4. Name the company and first agent (Writer / Researcher / Ops mascots).
5. Chat. Ask Writer to write `hello.md` into its workspace.

If no GGUF is loaded, the header says **Local {model}** is not ready (`Local model not ready`). It does not fall back to a hosted model.

## Where files go

**Browser preview**

```
{cwd}/data/LocalBot/models/{filename}     # GGUF weights
{cwd}/data/LocalBot/bin/{platform-arch}/  # llama.cpp
{cwd}/data/LocalBot/{CompanyName}/        # company tree
{cwd}/data/localbot-config.json
```

**Electron**

```
{appData}/LocalBot/models/
{appData}/LocalBot/bin/{platform-arch}/
{documents}/LocalBot/{CompanyName}/
```

llama.cpp binaries are resolved for **macOS arm64, macOS x64, Windows x64, Linux x64**.

Two people share work only if they point at the **same real folder**.

## Keyboard

- `⌘K` / `Ctrl+K` command palette
- `⌘N` / `Ctrl+N` new agent
- `⌘,` / `Ctrl+,` settings
- `Enter` send · `Shift+Enter` newline
- `Esc` close overlays

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md), [FOLDER_CONTRACT.md](FOLDER_CONTRACT.md), and [CATALOG.md](CATALOG.md).
