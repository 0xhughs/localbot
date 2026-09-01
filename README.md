# LocalBot

Personal agents on this computer. You pick a local open-weight model, create named agents, and talk to them like contacts. Each agent has its own memory, its own workspace folder, and permission cards before risky actions.

No cloud account. No API key on the default path. Work stays in the company folder you grant.

## First run

1. Launch LocalBot.
2. Three welcome screens — what it is, that work stays here, that agents only touch granted folders.
3. Hardware scan (OS, RAM, GPU, Apple Silicon, disk).
4. Pick Small / Recommended / Large. Cards that will not load are greyed out with the reason.
5. Download the GGUF. Pause and resume are supported. Checksum is verified. File lands in `~/.localbot/models/`.
6. Name the company, department, employee, and first agent.
7. Land in that agent’s chat.

After onboarding, Settings still lets you download another model, switch the active model per agent, or import a local GGUF.

Ollama is never required. If it is already running on a desktop install, Settings may offer “Use existing Ollama” as an advanced option.

## Company root sharing

Default company root:

```
{documents}/LocalBot/{CompanyName}/
```

Point that path at a shared network drive, NAS, or synced folder (Drive for Desktop, Nextcloud, company file server). LocalBot does not implement its own P2P sync. Shared work happens because two installs point at the same Company root.

If the company root is only local disk, Employee Two on another laptop does not see Employee One. Settings says so: “Shared departments require a shared folder path.”

Uninstalling the app does not delete the company root.

## Keyboard

- `⌘K` / `Ctrl+K` command palette
- `⌘N` / `Ctrl+N` new agent
- `⌘,` / `Ctrl+,` settings
- `Enter` send · `Shift+Enter` newline
- `Esc` close overlays

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md), [FOLDER_CONTRACT.md](FOLDER_CONTRACT.md), and [CATALOG.md](CATALOG.md).
