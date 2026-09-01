# LOCALBOT — ONE-SHOT BUILD PROMPT

Copy everything below the line into a coding agent and tell it to implement the entire application.

---

You are the sole implementer of **LocalBot**, a desktop Grok Bot clone that runs entirely on the employee’s computer. Build the complete application described here in one pass. Do not defer features. Do not invent an MVP cut. Do not add a “phase 2.” If a listed capability is hard, implement a working version anyway.

Product name: **LocalBot**
Working repo name: `localbot`
Do not use the trademarks Slack or Grok in the shipped UI, installer, or package name. You may say “inspired by Grok Bot” only in internal comments.

## What LocalBot is

LocalBot is a personal desktop app. The user installs it, picks a local open-weight model, creates named agents, and talks to them like contacts. Each agent has its own memory, its own workspace folder, and permission cards before risky actions. Agents do real work inside folders: read, write, edit, organize files, run commands in that folder, and use a browser when granted.

There is no cloud account. There is no API key on the default path. There is no per-seat fee. The model is a GGUF file downloaded after install. The agent loop is DeepSeek Harness. The chat shell is a Grok Bot-style roster.

## Start from OpenMausBot, do not start from zero

Fork https://github.com/milind-soni/OpenMausBot (Apache-2.0). Keep:

- Desktop shell (Mac, Windows, Ubuntu)
- Sidebar of agent contacts
- Per-agent chat timeline
- Permission Allow / Deny cards
- Local data under the user’s LocalBot home directory
- Loopback-only harness bind (`127.0.0.1`)
- ACP-shaped driver boundary so the UI talks to one runtime event stream

Replace:

- Default engines that spawn `claude`, `codex`, or `grok` CLIs
- Any requirement for a provider login or API key on first run
- Cloud Box computers as the default computer
- Composio as a required first-run integration

The shipped first-run path must work with zero keys.

## Architecture (lock this)

Four layers, one app:

1. **Shell** — Electron / existing OpenMausBot desktop UI. Named agents, chats, settings, onboarding.
2. **Inference** — embedded llama.cpp (or node-llama-cpp on the main process). Loads GGUF from disk. Exposes an OpenAI-compatible local endpoint on loopback only.
3. **Harness** — DeepSeek Harness (`@deepseek-ai/dsh`, MIT) as the agent loop. Point its model plugin at the local llama.cpp endpoint. Use Standard mode for normal agents. Use Minimal mode only for tiny machines.
4. **Workspace** — a real directory tree on disk. Every agent may only read and write inside the folders granted to it.

Do not make the UI call the model directly. UI → LocalBot runtime → DeepSeek Harness → local model.

If DeepSeek Harness plugin APIs shift, isolate them behind `src/runtime/harnessAdapter.ts` so the UI does not import Cordis plugins.

## First-run onboarding (must exist)

On first launch, in order:

1. Welcome. Three short screens. What LocalBot is. Work stays on this computer. Agents only touch folders you grant.
2. Hardware scan. Detect:
   - OS and arch
   - Total RAM and available RAM
   - GPU name and VRAM if present
   - Apple Silicon yes/no
   - Free disk on the install volume
3. Model recommendation page. Show three cards:
   - **Small** — always offered if ≥ 8 GB RAM
   - **Recommended** — best fit for this machine
   - **Large** — offered only if it will actually load with OS headroom
4. Grey out any card that will not fit. Show why: “Needs about 12 GB free memory. This machine has 7 GB available.”
5. Download the chosen GGUF with a progress bar, pause, resume, checksum verify. Store it under `{localbotHome}/models/`.
6. Create the first agent. Name, job, color, workspace folder.
7. Land in that agent’s chat.

Never block first run on a Hugging Face token for the curated catalog. If a catalog model is gated, do not list it.

After onboarding, Settings still lets the user download another model, switch the active model per agent, or import a local GGUF.

## Model catalog (curated, not the whole Hub)

Ship a pinned catalog file `catalog/models.json` with exact Hugging Face GGUF repos, filenames, sizes, licenses, and minimum RAM/VRAM.

Default catalog (adjust filenames to real current GGUF builds at implement time, but keep this tiering):

- Small: Gemma 4 E2B Q4 or Qwen 3.5 4B Q4. Target 8 GB RAM machines.
- Recommended: Gemma 4 E4B Q4 or Qwen 3.5 9B Q4. Target 16 GB machines.
- Large: Gemma 4 12B Q4 or Qwen 3.5 9B/27B Q4 only when RAM/VRAM allows.

Prefer Apache-2.0 or similarly permissive weights. Reject gated models from the default catalog.

Hardware fit rule:

```
requiredMemory ≈ modelFileGB + 2.5GB osHeadroom + 0.5GB per 8k context
```

If `requiredMemory > availableRAM`, do not recommend it. On Apple Silicon use unified memory. On NVIDIA use VRAM first, then system RAM for overflow only if the engine supports it; otherwise require the model to fit VRAM + headroom.

The user must never install Ollama to use LocalBot. If Ollama is already running, Settings may offer “Use existing Ollama” as an advanced option. It is not the default.

## DeepSeek Harness integration

Bake DeepSeek Harness into the runtime:

- Vendor or npm-depend `@deepseek-ai/dsh` / `deepseek-harness-sdk`
- Configure the model provider plugin to `http://127.0.1:local-llama/v1` (exact loopback port you choose, document it)
- No DeepSeek API key on the default path
- Enable tools: filesystem scoped to granted folders, shell scoped to workspace, editor/str_replace, optional web search only if the user turns it on
- Permission broker: before shell, before writes outside the current file being edited, before network, before deleting files — the UI shows Allow once / Allow for this chat / Deny
- Session transcripts persist under `{localbotHome}/sessions/{agentId}/`
- If Harness is in developer-preview flux, pin an exact version in package.json and freeze it. Do not float to latest.

Each LocalBot agent is one Harness session profile plus one workspace root.

## Workspace directory model (this is the product)

On first run, choose a **Company root**. Default:

```
{documents}/LocalBot/{CompanyName}/
```

The user can point Company root at a shared network drive, NAS, or synced folder (Google Drive for Desktop, Nextcloud, company file server). LocalBot does not implement its own P2P sync. Shared work happens because two installs point at the same Company root.

Tree:

```
{CompanyRoot}/
  company.json
  departments/
    {DepartmentName}/
      department.json
      shared/                  # any agent in this department may use this
      people/
        {EmployeeName}/
          employee.json
          inbox/
          outbox/
          bots/
            {BotName}/
              bot.json
              memory/
              workspace/       # this bot’s private working directory
              output/
```

Rules:

- Installing LocalBot as Employee One creates `{CompanyRoot}/departments/{Dept}/people/{EmployeeOne}/` and at least one bot folder.
- Each bot’s default computer is its `workspace/` folder. It may write files there freely after the first grant.
- A bot may also be granted `shared/` for its department. Then agents of Employee One and Employee Two can both read and write department shared files if both installs use the same Company root.
- A bot may never see another employee’s private `bots/` tree unless an admin grant says so.
- `outbox/` is where finished deliverables land. The UI has “Open outbox” and “Reveal in Finder/Explorer”.
- If Company root is only local disk, Employee Two on another laptop does not see Employee One. Show this clearly in Settings: “Shared departments require a shared folder path.”
- Watch the filesystem. When another agent writes into `shared/`, refresh the file pane. No chat sync required for v1 of sharing — the folder is the bus.

`bot.json` holds name, job, model id, color, grants, createdAt.

`employee.json` holds display name, department, default model.

`company.json` holds company name, catalog pin, default department.

Provide UI to:

- Create company, department, employee, bot
- Move a bot between employees (files move on disk)
- Grant or revoke folder access per bot
- Open any workspace folder in the OS file manager
- Show a simple file tree per chat: workspace, shared, outbox

## Agent roster and chat (Grok Bot feel)

- Left sidebar: agents as contacts. Unread badge. Pin. Rename. Duplicate. Hide. Delete.
- Main pane: that agent’s chat.
- Composer: text, attach file into the bot workspace, mention another bot with `@name` to hand work into the shared department folder (write a task file + notify; do not require a multi-user message server).
- Agent replies stream. Tool runs show as chips: Reading, Editing, Terminal, Browser.
- Permission cards inline.
- “Show computer” panel: file tree of the bot workspace + recent outputs.
- User can create many agents. Five is normal. Ten is allowed. Do not cap below 20.

Each agent has:

- Name and one-line job
- Model (from downloaded local models)
- Workspace folder
- Optional extra grants (department shared, company shared)
- Memory files in `memory/` that the harness may read each session
- Standing instructions in `bot.json` / `AGENTS.md` inside the bot folder

## Computer and safety

Default computer = the bot workspace folder, not the whole home directory.

Allowed without asking again after first grant:

- Read/write inside `workspace/` and `output/`
- List `shared/` if granted

Always ask:

- Shell commands
- Deletes
- Writes outside workspace/output/shared
- Network
- Anything that leaves the Company root

Kill switch in the chat header: Stop. Interrupt the harness run.

Do not enable full host desktop control in the default profile. Optional “Control this computer” exists in Settings, off, with a red warning.

No LAN bind. Harness and llama.cpp listen on 127.0.0.1 only.

## What to implement in the UI

- Onboarding wizard
- Hardware scan page
- Model download manager
- Agent list + chat
- Permission cards
- Workspace file pane
- Company / department / employee / bot settings
- Company root picker (local or shared path)
- Dark mode default, dense, keyboard-first
- Menu: New agent, Switch model, Open workspace, Open outbox, Settings

## Persistence

All state on disk. No required cloud database.

- `{localbotHome}/` for app config, models, sessions, logs
- `{CompanyRoot}/` for company tree and work product

If the user uninstalls the app, Company root files stay. Say so in Settings.

Encrypt secrets at rest if any exist. Default path should have none.

## Platforms

Ship desktop builds for macOS (Apple Silicon + Intel), Windows x64, Ubuntu x64. Reuse OpenMausBot’s packagers.

Embedded llama.cpp must ship platform backends: Metal on Mac, CPU everywhere, CUDA optional if the build system already supports it. A CPU-only first run on a weak laptop must still chat with the Small model.

## Tests you must include

- Hardware scanner returns RAM and refuses a model that cannot fit
- Download writes a GGUF and verifies checksum
- Creating Employee One + two bots creates the exact folder tree
- Agent can create a file in its workspace and it appears on disk
- Agent denied from writing outside grants
- Two bot processes granted `shared/` can both write files there
- App starts with no API keys in the environment
- Loopback-only bind check

## Documentation to generate in-repo

- README: install, first run, how Company root sharing works
- ARCHITECTURE.md: the four layers
- FOLDER_CONTRACT.md: the directory tree and grant rules
- CATALOG.md: how to add a model to models.json

## Implementation order inside this one pass

Still build everything, but in this sequence so the tree always runs:

1. Fork OpenMausBot, rename to LocalBot, strip cloud CLI engines
2. Embedded llama.cpp + loopback OpenAI-compatible server
3. Hardware scan + catalog + downloader
4. Onboarding wizard
5. DeepSeek Harness adapter pointed at local server
6. Company/department/employee/bot folder contract
7. Permission broker wired to harness tool calls
8. File pane + outbox
9. @bot handoff via shared task files
10. Packagers + tests + docs

When finished, the user can: install, download Recommended model, create “Writer” and “Researcher”, watch Writer put a draft in `output/`, watch Researcher drop sources into department `shared/`, and open those files in the OS. No account. No key. No extra runtime.

If a dependency fights this design, change the dependency, not the design.
