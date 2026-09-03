## Stage 4 — Real DeepSeek Harness

Date: 2026-09-03
Branch: `stage-4-deepseek-harness` (PR #4 → `main`)

This is AGENTS.md item 4 = complete-plan §12 "Stage 3". It is **not** the complete-plan Stage 4 (model / GPU platform) and not AGENTS.md item 6.

Pinned:
- @deepseek-ai/dsh: `0.1.2-alpha.5` (exact, `package.json` `dependencies`)
- @agentclientprotocol/sdk: `1.4.0` (exact; the version `@deepseek-ai/dsh-acp@0.1.2-alpha.5` itself depends on)
- upstream commit: `49a606b` (deepseek-ai/deepseek-harness, the tree the plan's §15 links point at; the npm tarball at this pin is what runs)
- `@deepseek-ai/dsh-sdk-client`: not used, not in `package.json` or `package-lock.json`

### Built

- **The loop is upstream.** `src/runtime/harnessAdapter.ts` no longer contains `while (rounds < 6)`, no tool execution, no history replay. It is a thin ACP client: `harnessPrompt` → poll `harnessPoll` → chips / committed assistant text; `harnessDecide` for permission cards; `harnessCancel` on Stop. `chat.tsx` imports `runAgentTurn` from it. **WORKS.**
- **Sidecar-owned Harness process** — `src/lib/harness/process.ts`. Spawns `node --experimental-strip-types … @deepseek-ai/dsh/lib/bin.js --profile acp --patch dsh/localbot-acp.cordis.yml --patch {DSH_HOME}/localbot-fs-plugin.patch.yml` with `DSH_HOME={dataDir}/dsh-home` (isolated; nothing under `~/.dsh`), `DSH_TELEMETRY_MODE=off`, hosted keys (`DEEPSEEK_API_KEY`, `XAI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) stripped from its environment. Speaks ACP over stdio with `@agentclientprotocol/sdk` (`ClientSideConnection` + `ndJsonStream`): `initialize`, `session/new`, `session/prompt`, `session/cancel`, `session/update`, `session/request_permission`. One process for all agents; one ACP session per agent (`HarnessManager.sessions`, in memory). The renderer never touches Harness or llama.cpp. **WORKS.**
- **`dsh/localbot-acp.cordis.yml`** (checked in). Declares the single provider route `localbot-llama` on `@deepseek-ai/dsh-llm-pi-ai` (`api: openai-completions`, `baseURL` = `http://127.0.0.1:18789/v1`, `apiKeyEnv: LOCALBOT_LLAMA_KEY` → fixed non-secret placeholder `localbot-no-key` because pi-ai's OpenAI client insists on a key-shaped value); points `agent-default-model` and `acp` at it. Disables `session-telemetry-otel`, `llm-deepseek` (hosted route), `web` / `web-search-deepseek` / `web-fetch-http` / `tool-web`, all subagent / workflow / ralph rows (no agent teams), `fs-sandbox`, and the goal / todo / plan-mode / skill / job / str_replace_editor tool rows so the prompt fits a small GGUF (~2.4k tokens instead of ~5k). Pins `sandbox-policy.mode: workspace-write` (bash sandboxed to the session cwd = `private/`; escalations ask) and `approval.policy: ask`. **WORKS** (`dsh --dump-config` shows the composed tree).
- **`dsh/localbot-fs.mjs`** — LocalBot's `ctx.fs` provider inside the Harness process. Extends the official `@deepseek-ai/dsh-fs-local` `LocalFileSystem` (atomic writes, literal edits, realpath identity) and owns `resolve` / `lstat` / `listDir` / `processPathFromHostPath`: every path becomes `{ scope, relPath, agentName }` — the agent from the ACP session cwd (`agents/{Name}/private`), the scope from a `private/` … `company-shared/` prefix, a bare path relative to the private root, or a host-absolute path only if it already lies inside a granted, connected root — and goes through `resolveForAgent` → `resolveScopePath` in `src/lib/fs/scopes.ts`. `..`, drive / UNC, ungranted scopes, symlink escapes → `FS_PERMISSION_DENIED`; a vanished configured folder → `FS_IO_ERROR` carrying the `DISCONNECTED` message. Tool results show `private/hello.md`, never a host path. `private/AGENTS.md` is read-only for tools. **WORKS.**
- **Standing instructions** — before every session/prompt the sidecar mirrors `agents/{Name}/AGENTS.md` + the granted-scope list into `private/AGENTS.md`, which the upstream `agent-instructions` loader injects. The employee edits the file next to `agent.json`. **WORKS.**
- **Model route** — `src/lib/runtime/harness-launch.ts`: `ensureLocalServer()` (unchanged spawn of official llama.cpp b10749 on `127.0.0.1:18789`) is still what starts the model; the Harness is only handed its `/v1` URL. `Allow hosted demo` on → the chat path **refuses** (`HOSTED_DEMO_REFUSAL`) rather than routing a key. `Use existing Ollama` on + `11434` answering → route is `http://127.0.0.1:11434/v1`. `localContextTokens()` floors the llama-server context at 8192 so the Harness prompt fits. **WORKS.**
- **Stop → `session/cancel`**; parked permission requests are answered `cancelled`; the session stays usable afterwards. **WORKS** (test + fixture).
- **Permissions** — ACP `session/request_permission` is parked in the sidecar `TurnRegistry` and surfaced to the existing Allow once / Allow for this chat / Deny card; "Allow for this chat" records an `acp:{kind}` chat grant and auto-answers later requests of the same kind. Scoped file writes never prompt; a bash escalation does (Deny → `user rejected escalating`, nothing runs; Allow once → runs). **WORKS** with the fixture; **UNVERIFIED** with a live GGUF (the 1.5B did not attempt a shell escalation in the app run).
- **Node gate** — `findHarnessNode()`: `LOCALBOT_DSH_NODE`, else the sidecar's own Node if ≥ 22.15, else the newest nvm Node ≥ 22.15; otherwise a clear error and no fallback loop. See *Not built* for why.
- **llama-server launch fix** (`src/lib/runtime/local-engine.ts` `runnableLlamaServer`) — the official tarball unpacks into `llama-b10749/`; ggml loads its CPU backends from the executable's own folder, so the previously copied lone `linux-x64/llama-server` exited with "no backends are loaded". The sidecar now runs the binary inside the extracted tree. Needed to prove the in-app path with a real GGUF. **WORKS** on this Linux host.
- **Tests** — `src/lib/harness/harness.test.ts` (20), in `npm test`. They spawn the real pinned `dsh` and drive it over ACP against `src/lib/harness/fixture-openai.ts` (a loopback OpenAI `/v1` that emits scripted tool calls; no GGUF needed).

### Not built

- **Packaged Electron cannot run this Harness yet.** `dsh 0.1.2-alpha.5` imports `createZstdDecompress` from `node:zlib` (`@deepseek-ai/dsh-session-persistence-jsonl`, hard-injected by `dsh-acp`); that API exists from Node 22.15. Electron 36 embeds Node 22.14, and the host Node in this VM was 22.14.0 — the exact error was `SyntaxError: The requested module 'node:zlib' does not provide an export named 'createZstdDecompress'`. The sidecar therefore launches dsh with a Node ≥ 22.15 it can find (here nvm `v22.22.2`); Electron was not upgraded and no second Node is bundled. Packaged-mode Harness = **NOT BUILT** (Stage 8 / AGENTS.md item 8).
- Durable ACP `sessionId` per agent; chats / roster off `localStorage` (item 7). A sidecar restart starts fresh sessions. **NOT BUILT.**
- `session/resume` / `session/list` are supported upstream and by `HarnessProcess.resumeSession`, but nothing persists ids to resume yet. **NOT BUILT.**
- Delete / rename / copy / mkdir tools through the Harness (`ctx.fs` has no delete; a separate tool plugin is the plan's §6.5 follow-up). The Computer pane's own delete is unchanged. **NOT BUILT.**
- Token-level streaming (ACP at this pin emits committed blocks; the pane polls every 250 ms and shows "Thinking" until the first committed block). Not faked.
- Hosted demo through the Harness. Refused instead. The legacy single-completion server fn `runSingleCompletion` (`turn.ts`) and `hosted-turn.ts` remain, off the chat path (deleting them is out of scope).
- Model import labelling: importing a GGUF from the wizard keeps the selected card's catalog id, so the badge can say 0.5B while the 1.5B file is active (`activeModelPath` is right). Item 6 bug, observed during the app run; the demo config id was corrected by hand.
- Bash on macOS / Windows sandboxes (`bash-sandbox` / `pwsh-sandbox`) **UNVERIFIED** (Linux only here). Two-machine / NAS run still **UNVERIFIED**.
- Signed installers. **NOT BUILT.**

### Files changed

- `package.json`, `package-lock.json` — exact pins; `npm test` runs `src/lib/harness/harness.test.ts`.
- `dsh/localbot-acp.cordis.yml` (new) — the Cordis overlay.
- `dsh/localbot-fs.mjs` (new) — scoped `ctx.fs` provider.
- `src/lib/harness/process.ts` (new) — `HarnessProcess`, `findHarnessNode`, `writePluginOverlay`, `harnessEnv`, `harnessArgs`, pins.
- `src/lib/harness/turns.ts` (new) — `TurnRegistry`: session/update → events, parked permission requests, cancel.
- `src/lib/harness/index.ts` (new) — `HarnessManager` (process, sessions, prompt, cancel, status), `standingInstructionsText`, `getHarnessManager`.
- `src/lib/harness/fixture-openai.ts` (new) — test double `/v1`.
- `src/lib/harness/harness.test.ts` (new) — 20 tests.
- `src/lib/runtime/harness.ts` (new) — server fns `harnessPrompt` / `harnessPoll` / `harnessDecide` / `harnessCancel` / `harnessStatus`.
- `src/lib/runtime/harness-launch.ts` (new) — `appLaunchSpec`, `HOSTED_DEMO_REFUSAL`.
- `src/runtime/harnessAdapter.ts` — rewritten as the thin ACP client (`runAgentTurn`); six-round loop deleted.
- `src/components/localbot/chat.tsx` — imports `runAgentTurn`.
- `src/lib/runtime/local-engine.ts` — `localContextTokens` (floor 8192), `runnableLlamaServer`.
- `src/lib/runtime/turn.ts` — `runHarnessTurn` renamed `runSingleCompletion`, marked legacy.
- `.gitignore` — `data/dsh-home/`.
- `LOCALBOT_HANDOFF.md`, `STAGE_HANDOFF.md`, `ARCHITECTURE.md`, `FOLDER_CONTRACT.md`, `README.md`.

### Prove it

Command (needs Node ≥ 22.15 on `PATH`, or `LOCALBOT_DSH_NODE=/path/to/node22.15+` exported; `npm install` first):

```
npm run lint && npm run typecheck && npm test && \
  grep -q '"@deepseek-ai/dsh": "0.1.2-alpha.5"' package.json && \
  grep -q '"@agentclientprotocol/sdk": "1.4.0"' package.json && \
  ! grep -q '@deepseek-ai/dsh-sdk-client' package.json package-lock.json && \
  (test ! -f src/runtime/harnessAdapter.ts || ! grep -q 'while (rounds < 6)' src/runtime/harnessAdapter.ts) && \
  echo STAGE4_PASS
```

Pass looks like:

```
# tests 195
# pass 195
# fail 0
# tests 102
# pass 102
# fail 0
STAGE4_PASS
```

(102 = 82 Stage 1–3 tests + 20 Stage 4 tests; the first block is the template `scripts/**` suite.) The Stage 4 suite fails when: `@deepseek-ai/dsh` or `@agentclientprotocol/sdk` is missing, floated (`^` / `~`), or a different version (checked against `package.json` **and** the installed `node_modules` versions **and** `dsh-acp`'s own dependency); `harnessAdapter.ts` regains `while (rounds`, `runHarnessTurn`, or `executeTool(`; `chat.tsx` stops importing `runAgentTurn`; `process.ts` loses `connection().prompt(` / `connection().cancel(` / `--profile acp --patch`; the real `dsh` does not boot or ACP `initialize` fails; the `write` tool call does not run through ACP and land in `private/hello.md` with a `<path>private/hello.md</path>` result; the Harness stops feeding the tool result back (2 model requests expected); a `..`, absolute, ungranted-scope, or symlink write succeeds; `private/AGENTS.md` becomes writable; a vanished root is recreated or does not raise `DISCONNECTED`; a bash escalation does not raise `session/request_permission`, Deny runs it, or Allow does not; `session/cancel` does not end the turn with `cancelled`. Verified by mutation: floating the dsh pin fails `Stage 4 pins` (2 tests); appending a `while (rounds < 6)` fails `harnessAdapter.ts no longer owns the agent loop`.

Second command (optional) — the Stage 4 suite alone, verbose:

```
node --experimental-strip-types --test src/lib/harness/harness.test.ts
```

Pass: `# pass 20` / `# fail 0`, including `boots the pinned dsh --profile acp on a Node >= 22.15 with an isolated DSH_HOME and initializes ACP`, `a Harness tool call writes hello.md into private/ through resolveScopePath; the loop is upstream`, `a scoped write never asks for permission, but a shell escalation surfaces as ACP session/request_permission`, and `Stop → ACP session/cancel ends the turn with stopReason cancelled`.

Third command (optional) — see the composed Harness tree LocalBot boots:

```
DSH_HOME=/tmp/dsh-dump npx dsh --profile acp --patch dsh/localbot-acp.cordis.yml --dump-config | grep -A3 'id: acp$'
```

Pass: `provider: localbot-llama` under the `acp` row; `llm-deepseek`, `session-telemetry-otel`, `tool-web`, `fs-sandbox` all show `disabled: true`.

### How I test in the app

Done on this Linux host with a real GGUF (Qwen 2.5 **1.5B** Instruct Q4, 1.1 GB) through official llama.cpp b10749 and the real Harness — **WORKS**. The 0.5B GGUF also runs through the same path but chose `edit` with an empty `old_string` and gave up (weak tool calling, as documented since the local-model pass); with only the 0.5B on disk the write is **UNVERIFIED**.

1. `rm -rf /tmp/lb && LOCALBOT_DATA_DIR=/tmp/lb npm run dev` (with Node ≥ 22.15 on PATH, or `LOCALBOT_DSH_NODE` set), open `http://localhost:8080/`, walk onboarding. On the Download step, import a 1.5B or 3B `.gguf` if you have one (**Import GGUF** field) — note the badge keeps the card's id (item 6 bug). **Create my folders**, agent **Writer**.
2. Send: `Create a file named hello.md containing the single line: hello from the local model`. First message starts llama-server (a few seconds) and the Harness (~1 s). Header shows **Working**; a chip **Write** `private/hello.md` appears, then the committed reply (≈10–16 s on 4 CPU cores with the 1.5B). `pgrep -fa dsh/lib/bin.js` shows the sidecar's `dsh --profile acp --patch …/dsh/localbot-acp.cordis.yml`; `/tmp/lb/dsh-home/sessions/…Writer-private…/` holds the Harness session log.
3. Open the Computer pane (monitor icon). **Private** lists `hello.md`; click it → preview `private/hello.md` / `hello from the local model`. Optional: ask `Run the shell command ls` and answer the card; `Stop` while a long reply is generating ends the turn with a "Stopped." line.

### Ready for

Stage 5 only after I say GO.
