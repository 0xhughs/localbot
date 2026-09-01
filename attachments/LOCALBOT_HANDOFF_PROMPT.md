# LOCALBOT HANDOFF — paste this to the builder agent

You just finished implementing LocalBot. Do not write more product features. Do not invent a roadmap. Document what is actually in the repo right now.

Create one markdown file at the repo root:

`LOCALBOT_HANDOFF.md`

Write that file from the real code, real folders, real commands, and real tests. If something was asked for in the original prompt and you did not ship it, say **NOT BUILT**. If something is a stub, say **STUB**. If something works, say **WORKS** and how you know.

## File rules

- English.
- Be specific: file paths, command lines, port numbers, folder paths, package names, versions.
- No marketing. No “in the future.”
- If you are unsure, write **UNVERIFIED** and why.
- After writing the file, print its full path.

## Required sections

### 1. Snapshot
- Repo path
- Git status (branch, dirty or not, last commit hash if any)
- App name as it appears in the window / package.json
- Platforms the current tree can actually run on today (macOS / Windows / Linux)
- How you ran it last (exact commands)

### 2. How to run it on a clean machine
Step-by-step from clone to first chat.
Include:
- prerequisites (Node version, pnpm, Python, GPU drivers, anything else)
- install command
- dev command
- production / packaged build command if it exists
- where the window opens, or the localhost URL if it is web
- where data is stored on disk (`localbotHome`, config, models, sessions)

### 3. What the user sees
Walk through first launch as a new employee:
1. splash / onboarding screens that exist
2. hardware scan — what it measures, what it shows
3. model picker — which models are listed, where `models.json` lives
4. download — does it really download a GGUF, from where, to which folder
5. first agent creation
6. main window: sidebar, chat, permission cards, file pane, settings

If a screen is missing, write **NOT BUILT**.

### 4. Architecture as built
Draw the real runtime path:

`UI → ? → harness → ? → model`

Name the actual modules and files.
State which of these is true:

- OpenMausBot fork (say the upstream commit / date if known)
- New app from scratch
- Embedded llama.cpp / node-llama-cpp / other
- Ollama required or not
- DeepSeek Harness (`dsh`) integrated, version pinned, or not
- Some other agent loop

List the important directories in the repo and what each one does.

### 5. Model system
- Catalog file path
- Exact model ids in the catalog
- Hardware fit rule implemented or not
- Download implementation (Hugging Face URL, resume, checksum)
- How the local server is started
- Bind address and port
- What happens if the machine cannot fit any catalog model

### 6. Folder contract
Show the directory tree the app actually creates.
Example paths from a real run if you have one.

For each of these, mark WORKS / STUB / NOT BUILT:

- Company root picker (local disk)
- Company root on a network drive / NAS
- departments
- department `shared/`
- employee folders
- per-bot `workspace/`, `memory/`, `output/`
- outbox
- grants (bot A can read department shared, cannot read another employee’s private bots)
- filesystem watcher when another process writes into `shared/`

Paste the real `company.json` / `employee.json` / `bot.json` schemas if they exist.

### 7. Agents and chat
- How many agents a user can create
- How a chat turn is sent
- Streaming or not
- Permission cards: which actions ask, which auto-allow
- `@mention` another bot — what it actually does
- Stop / kill switch
- Memory files
- Computer / file pane

### 8. Sharing across two computers
Write one honest paragraph:

If Employee One and Employee Two each install this build, what must be true for them to see the same Finance files? What is implemented for that? What is not?

### 9. Security
- Loopback-only bind or not (quote the host/port)
- Default workspace scope
- Can an agent touch the home directory
- Secrets / API keys required or not
- “Control this computer” switch exists or not

### 10. Tests
List test files and what they cover.
Paste the last test command and result if you ran tests.
If tests were not run, say so.

### 11. Feature scorecard
A table with every original requirement. Columns: Requirement | Status | Evidence path

Must include at least:

| Requirement | Status | Evidence |
|---|---|---|
| Desktop app window | | |
| Fork / reuse of OpenMausBot | | |
| No API key on first run | | |
| Hardware scan | | |
| Model recommendation | | |
| GGUF download into the app | | |
| Embedded local inference (no Ollama required) | | |
| DeepSeek Harness as the loop | | |
| Named multi-agent roster | | |
| Permission Allow/Deny | | |
| Company / department / employee / bot folders | | |
| Department shared folder | | |
| Per-bot workspace isolation | | |
| Outbox | | |
| @bot handoff via shared task files | | |
| macOS build | | |
| Windows build | | |
| Ubuntu build | | |
| Arabic UI / RTL | | |

Status must be one of: WORKS, PARTIAL, STUB, NOT BUILT, UNVERIFIED.

### 12. Known bugs and missing pieces
Bullet list. Each bullet: what is wrong, how to reproduce, how bad (blocker / annoying / cosmetic).

### 13. Files I should read first
The 15 most important files for a reviewer, with one line each.

### 14. Demo script
Five commands or clicks that prove the app does something real. Prefer:

1. start the app
2. create agent Writer
3. ask it to write `hello.md` into its workspace
4. show the file on disk
5. show that it cannot write outside the grant

If you cannot do that demo with this build, say exactly where it breaks.

When `LOCALBOT_HANDOFF.md` is written, stop.
