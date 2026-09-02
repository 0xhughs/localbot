# LocalBot — agent standing rules

You are working in **https://github.com/0xhughs/localbot**, not a new app.

Read before you write:

- `README.md`
- `LOCALBOT_HANDOFF.md`
- `ARCHITECTURE.md`
- `FOLDER_CONTRACT.md`
- `CATALOG.md`
- `desktop/`
- `src/lib/fs/`
- `src/lib/runtime/`
- `catalog/models.json`

## Product

Local Grokbot-style desktop app. Each employee runs agents on their own computer with a **free local GGUF**. IT picks folders on the company filesystem. No accounts. No RBAC. No cloud backend. No Slack clone.

Default inference is local llama.cpp on loopback. Hosted Grok stays off unless the Safety switch is on. Do not silently fall back to an API key.

## Plan vs this repo

`LOCALBOT_COMPLETE_CODING_PLAN.md` is the **finish line**. It is not one job.

Work **one stage at a time**. After a stage: stop. Do not start the next stage until the human says so.

Suggested order (skip what already WORKS):

1. Clean foundation (package name, dead template code, tests/lint)
2. Four named folder scopes + native pickers + sidecar path resolution
3. Four-scope file browser + watch/poll + Refresh
4. Real DeepSeek Harness only if you pin a real repo + version
5. Multi-agent polish (rename/duplicate/archive, memory folders, file handoff)
6. Model platform (GPU runtimes, hashes, per-agent model, Ollama discovery)
7. Durable AppData state (leave localStorage for chats only if documented)
8. Signed installers + two-machine NAS test

## Honesty words

Use only: **WORKS** / **STUB** / **NOT BUILT** / **UNVERIFIED**.

Never claim:

- signed / notarized `.dmg` / `.exe` unless you produced one
- DeepSeek Harness unless the real package is imported and a tool call ran
- “employee needs no Node” unless the packaged binary was launched without Node on PATH
- two-laptop sharing unless two processes pointed at the same real folder

## After every stage

Overwrite / append `LOCALBOT_HANDOFF.md` with:

1. Stage name
2. What actually WORKS now
3. Files changed
4. One to three commands the human can run
5. The exact output that counts as pass
6. What is still NOT BUILT

If you cannot name a command that proves the stage, the stage is not done.

## Git

- Work on a branch: `stage-N-short-name`
- Do not force-push `main`
- Open a PR when the stage is done
- Do not commit secrets, GGUF weights, or `node_modules`

## Keep

Existing dark UI, onboarding, hardware scan, GGUF catalog, llama.cpp loopback, Electron window, mascots, disk grants as agent safety (not RBAC).
