# LocalBot

Named agents in a **desktop window**. Chat uses a **local GGUF** via llama.cpp on this machine. Work files live on **disk in four folder scopes you pick** — private, employee shared, department shared, company shared.

No API key is required on the default path. Hosted models stay off unless you turn on **Allow hosted demo (breaks policy)** in Settings.

This pass ships an **unsigned unpacked Electron app**. It is not notarized and is not a store build. Opening the packaged app does **not** require Node on PATH.

## First run

```
# Dev (needs Node)
npm install
npm run desktop

# Packaged (this pass)
npm run build:desktop
# then open:
#   dist/desktop/mac/LocalBot.app
#   dist/desktop/win-unpacked/LocalBot.exe
#   dist/desktop/linux-unpacked/LocalBot
```

`npm run desktop` is the developer window (it may start the Vite UI). `npm run build:desktop` is the employee binary: Electron starts a bundled Node sidecar on loopback and loads that UI. It does not run `npm run dev`.

Also keep the browser preview:

```
npm run dev
```

1. Walk the welcome screens.
2. Hardware scan. On a 16 GB-class machine, Recommended (Qwen 2.5 3B) is offered. 0.5B stays Small for 4 GB machines.
3. Download the GGUF from Hugging Face, or import a `.gguf` already on this machine.
4. Connect your folders: pick the required agents folder and any of the three optional shared folders (or let LocalBot create a suggested layout). In the desktop app this opens the OS folder dialog; the browser preview has a typed path field marked **preview only**.
5. Name the first agent (Writer / Researcher / Ops mascots).
6. Chat. Ask Writer to write `hello.md` — it lands in `private/hello.md`.

If no GGUF is loaded, the header says **Local {model}** is not ready (`Local model not ready`). It does not fall back to a hosted model.

## How the packaged app runs

Electron's own Node starts the already-built Nitro server (`resources/localbot-sidecar/sidecar.mjs`, not a file inside the asar) on `127.0.0.1:18790`. The window loads that URL. llama.cpp still binds `127.0.0.1:18789`. No global `node` / `npm` is used in packaged mode.

## Where files go

**Browser preview / `npm run desktop` (dev)**

```
{cwd}/data/LocalBot/models/{filename}     # GGUF weights
{cwd}/data/LocalBot/bin/{platform-arch}/  # llama.cpp
{cwd}/data/localbot-config.json           # version 2: folders { employeeRoot, employeeShared, departmentShared, companyShared }
{cwd}/data/LocalBot/{CompanyName}/        # only if you chose "Create my folders"
```

**Packaged Electron**

```
{appData}/LocalBot/localbot-config.json
{appData}/LocalBot/models/
{appData}/LocalBot/bin/{platform-arch}/
{documents}/LocalBot/{CompanyName}/       # only if you chose "Create my folders"
```

Work folders are wherever you pointed the four scopes; see [FOLDER_CONTRACT.md](FOLDER_CONTRACT.md). Each agent's private folder is `{employeeRoot}/agents/{Name}/private`. Company files are never written into the asar / install folder.

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
