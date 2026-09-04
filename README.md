# LocalBot

Named agents in a **desktop window**. Chat uses a **local GGUF** via llama.cpp on this machine. Work files live on **disk in four folder scopes you pick** — private, employee shared, department shared, company shared.

No API key is required on the default path. Hosted models stay off unless you turn on **Allow hosted demo (breaks policy)** in Settings.

Stage 8 ships **UNSIGNED installers**: Linux AppImage + `.deb` (built and run here), macOS `.dmg` and Windows NSIS `.exe` (configured, not built on this Linux host). Nothing is signed or notarized — there is no signing identity in this repo (`mac.identity: null`). Running the installed app does **not** require Node, npm or Python on the employee's machine: it carries its own Node for DeepSeek Harness.

## First run

```
# Dev (needs Node)
npm install
npm run desktop

# Installers for this OS (UNSIGNED; build machine needs Node + npm + network)
npm run build:desktop
# Linux:   dist/desktop/LocalBot-<version>-linux-x86_64.AppImage, dist/desktop/LocalBot-<version>-linux-amd64.deb
# macOS:   dist/desktop/LocalBot-<version>-mac-<arch>.dmg      (not built here)
# Windows: dist/desktop/LocalBot-<version>-win-x64.exe         (not built here)
# checksums: dist/desktop/SHA256SUMS.txt
```

`npm run desktop` is the developer window (it may start the Vite UI). `npm run build:desktop` is the employee build: Electron starts a bundled Node sidecar on loopback and loads that UI. It does not run `npm run dev`. Proof scripts: `npm run prove:packaged` (installer targets, bundled Node, dsh starts with node removed from PATH, packaged launch), `npm run prove:two-process` (two processes, one host, one shared folder), `npm run prove:packaged-chat -- --gguf <file>` (a real turn inside the packaged app). See `STAGE_HANDOFF.md`.

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

The agent loop is the real **DeepSeek Harness** (`@deepseek-ai/dsh` `0.1.2-alpha.5`, launched by the sidecar as `dsh --profile acp --patch dsh/localbot-acp.cordis.yml`, driven over the Agent Client Protocol). Its only model route is llama.cpp on loopback; its file tools go through LocalBot's scoped resolver. dsh at this pin needs **Node ≥ 22.15** — run the dev server with one, or set `LOCALBOT_DSH_NODE=/path/to/node`. See [ARCHITECTURE.md](ARCHITECTURE.md).

## How the packaged app runs

Electron's own Node starts the already-built Nitro server (`resources/localbot-sidecar/sidecar.mjs`, not a file inside the asar) on `127.0.0.1:18790`. The window loads that URL. llama.cpp still binds `127.0.0.1:18789`. No global `node` / `npm` is used in packaged mode.

DeepSeek Harness needs Node ≥ 22.15 and Electron 36 embeds 22.14, so the installer carries an official **Node v22.23.2** at `resources/localbot-node/` (pinned with sha256 in `catalog/node-runtime.json`) and the Harness itself at `resources/localbot-harness/` (`dsh/` overlay, the fs-plugin sources, and the `@deepseek-ai/dsh` tree installed at build time with exact pins). Electron main points the sidecar at them (`LOCALBOT_DSH_NODE`, `LOCALBOT_DSH_DIR`, `LOCALBOT_DSH_MODULES`); in packaged mode the sidecar never looks for `node` on PATH or in `~/.nvm` — if the bundled runtime is missing it refuses and says so.

Installing / uninstalling touches only the app and `{appData}/LocalBot`. The folders you picked (agents, shared folders) are never created under the app and never deleted by it.

## Where files go

**Browser preview / `npm run desktop` (dev)**

```
{cwd}/data/LocalBot/models/{filename}     # GGUF weights
{cwd}/data/LocalBot/bin/{target}/{runtime}/  # llama.cpp (cpu / vulkan / cuda-12.4 / metal)
{cwd}/data/localbot-config.json           # version 2: folders { employeeRoot, employeeShared, departmentShared, companyShared }, model + Safety switches
{cwd}/data/localbot-agents.json           # Stage 7 host index: onboarded, labels, per-agent id / pinned / hidden / unread / ACP sessionId
{cwd}/data/chats/{agentId}.json           # Stage 7 chat transcripts (never under a work folder)
{cwd}/data/dsh-home/                      # DeepSeek Harness's own session logs
{cwd}/data/LocalBot/{CompanyName}/        # only if you chose "Create my folders"
```

**Packaged Electron**

```
{appData}/LocalBot/localbot-config.json
{appData}/LocalBot/localbot-agents.json
{appData}/LocalBot/chats/
{appData}/LocalBot/models/
{appData}/LocalBot/bin/{target}/{runtime}/
{documents}/LocalBot/{CompanyName}/       # only if you chose "Create my folders"
```

Work folders are wherever you pointed the four scopes; see [FOLDER_CONTRACT.md](FOLDER_CONTRACT.md). Each agent's private folder is `{employeeRoot}/agents/{Name}/private`. Company files are never written into the asar / install folder.

Since Stage 7 the browser's `localStorage` holds UI chrome only (theme / density flags, the last hardware scan, the runtime badge). The roster is `agents/*/agent.json` joined to `localbot-agents.json`, chats are files under `chats/`, and the Safety switches are read back from `localbot-config.json` on every start — clearing site data does not lose agents, chats or archived state. A pre-Stage-7 `localbot-state-v3` is imported to disk once on first launch and then ignored.

Agent menu (sidebar `…`): **Pin**, **Rename** (moves `agents/{Old}/` → `agents/{New}/`, memory and output included; refused while the agent is working), **Duplicate** (copies the agent's `private/` and standing instructions into `agents/{Name copy}/`), **Archive** (leaves the roster, files stay; restore from **Archived** at the bottom of the sidebar), **Hide** (roster filter stored in the host index), **Delete** (removes the folder and the chat file). Changing a folder in Settings still does not move old files; renaming an agent does move that agent's own folder.

llama.cpp b10749 builds are pinned per (target, runtime): **macOS arm64** (Metal), **macOS x64** (CPU only — no GPU asset), **Windows x64** (CPU / CUDA 12.4 / Vulkan), **Linux x64** (CPU / Vulkan). The sidecar probes the GPU (`nvidia-smi`, `/dev/dri`, Vulkan ICDs, WMI, arch) and picks the build; `--n-gpu-layers` is 0 on a CPU build and > 0 only on a GPU build. Settings → Models shows the probe and lets you pin a build. GPU execution is UNVERIFIED in this repo (CPU-only host).

Every GGUF is verified (size, GGUF magic, sha256 from the catalog) before it can be loaded; a mismatch is refused. Each agent picks its own file (Settings → Agents, New agent); one llama-server restarts onto the selected agent's file after a health check. **Use existing Ollama** (Settings → Safety) lists the tags on `127.0.0.1:11434` and routes the Harness at the one you pick; if nothing answers, chat is refused with that error — it never falls back to a hosted model.

Two people share work only if they point at the **same real folder**. Files another person or program drops into a connected folder show up in the Computer pane on their own (the sidecar watches each folder; on network shares it polls metadata). **Refresh** re-lists everything now. A share that goes away shows **Disconnected** on that section; LocalBot does not switch to a local copy. In the desktop app, **reveal** opens the folder in Finder / Explorer.

## Keyboard

- `⌘K` / `Ctrl+K` command palette
- `⌘N` / `Ctrl+N` new agent
- `⌘,` / `Ctrl+,` settings
- `Enter` send · `Shift+Enter` newline
- `Esc` close overlays

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md), [FOLDER_CONTRACT.md](FOLDER_CONTRACT.md), and [CATALOG.md](CATALOG.md).
