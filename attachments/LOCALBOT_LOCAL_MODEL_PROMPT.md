# LOCALBOT — LOCAL MODEL PASS (for Grok Build on 0xhughs/localbot)

Read `LOCALBOT_HANDOFF.md` first. Keep the disk adapter, grants, agents, and UI.

This pass has one job: **chat must run on a free local GGUF. No API key on the default path.**

Company policy forbids hosted models. `src/lib/runtime/turn.ts` currently does:

```
POST https://api.x.ai/v1/chat/completions
model grok-4.5
Authorization: Bearer process.env.XAI_API_KEY
```

That path is forbidden as the default. Remove it from the default route.

Do **not** build Electron, DeepSeek Harness, Arabic, NAS sync, or packagers in this pass.

## Policy lock

- Default chat = local GGUF on this machine (the Node process running `npm run dev`).
- No `XAI_API_KEY`, OpenAI key, Anthropic key, or DeepSeek key required to finish onboarding or send a message.
- If no local model is loaded, the chat header says `Local model not ready` and the turn returns a clear error. It must **not** fall back to grok-4.5.
- You may keep the xAI code behind an explicit Settings switch `Allow hosted demo (breaks policy)` default **OFF**. If that switch is off, `turn.ts` must not call `api.x.ai`.

## What to keep

- `src/lib/fs/disk.ts` + `src/lib/fs/server.ts` (real files)
- Folder contract, grants, permission cards, `@mention` task files
- Agent roster and onboarding flow shape
- Catalog tiers Small / Recommended / Large

## 1. Real machine scan (server, not only the browser)

Add `src/lib/hardware-server.ts` using Node:

- `os.totalmem()`, `os.freemem()`, `os.cpus()`, `os.arch()`, `os.platform()`
- free disk on the company-root volume (`fs.statfs` / `statvfs` equivalent)
- GPU name if readable from existing env (Apple: `os.cpus()[0].model`, Linux: `/proc/cpuinfo` + optional renderer). Do not invent a 16 GB desktop when `os.totalmem()` says otherwise.

Expose `scanServerHardware()` via a server function. Onboarding uses **this** report for fit cards. Browser WebGL scan can still show in the grid as “browser guess,” but recommendations must use server RAM/disk.

Grey out any catalog card whose `requiredMemoryGb` is greater than server available RAM. Do not force-enable Small on a machine that cannot hold it.

## 2. Fix the catalog so download can work

`catalog/models.json` and `src/lib/catalog.ts` currently list Hub repos and **fake SHA-256 strings** (some are 63 hex chars). Those files are not verified.

In this pass:

1. Load catalog from `catalog/models.json` at runtime. Delete the duplicate-as-source-of-truth array, or generate the TS array from the JSON so there is one list.
2. Hit Hugging Face and **resolve real, ungated GGUF filenames** before you keep a row. If `ggml-org/gemma-4-E2B-GGUF` / `Qwen/Qwen3.5-4B-GGUF` 404 or are gated, replace that row with a real Apache-2.0 / MIT / similar-permissive GGUF that exists today.
3. For this pass the **downloadable** set may be only Small. Recommended and Large can stay listed and disabled until a file is confirmed.
4. Pin for each kept model: `repo`, `filename`, `sizeBytes` from HEAD/Content-Length, real `sha256` if published, otherwise compute after download and store it.
5. Preferred Small target: smallest Q4 instruct GGUF that can do tool calls reasonably, Apache-2.0 or equivalent, not gated. If Gemma 4 E2B Q4 resolves, use it. If not, use a real Qwen 2.5 / 3.x 1.5B–4B Q4_K_M that resolves. Write the exact URL you used in `CATALOG.md`.

Download URL form:

```
https://huggingface.co/{repo}/resolve/main/{filename}
```

No Hugging Face token. If the file requires a token, drop it from the catalog.

## 3. Real download into the app data folder

Models live on disk:

```
{cwd}/data/LocalBot/models/{filename}
```

or `{companyRoot}/../models/{filename}` — pick one, persist it in `data/localbot-config.json`, show the absolute path in Settings.

Implement server functions:

- `modelDownloadStart(catalogId)` — streams the GGUF to disk, writes a `.partial` then renames
- `modelDownloadStatus()` — bytes done / total / paused
- `modelDownloadPause()` / `resume()` — Range requests if the Hub allows them
- `modelVerify(catalogId)` — size matches; sha256 if you have a real hash
- `modelList()` — files actually on disk

Onboarding download step:

- No fake timer.
- Real progress from bytes written.
- Pause / Resume control the real transfer.
- Failure message if Hub is unreachable. Do not write a toy `GGUF\n{json}` blob. Delete `ggufBlob()` from the default path (`src/lib/checksum.ts`).

If this preview environment cannot finish a 1.5 GB download, still implement the pipeline. Then also allow **Import GGUF** (choose a local `.gguf` path on the server machine) so a file already on disk can be registered. Do not discard the file bytes.

## 4. Local inference engine

Add a local engine module `src/lib/runtime/local-engine.ts`.

Preferred implementation, in order:

1. `node-llama-cpp` loaded against the downloaded GGUF (GPU if available, else CPU).
2. If that package cannot install here, spawn `llama-server` / `llama-cli` if a binary is present.
3. Last resort: start a loopback OpenAI-compatible server you control on `127.0.0.1` only.

Do **not** require the employee to install Ollama. If Ollama is already running on `127.0.0.1:11434`, Settings may offer “Use existing Ollama” as an extra source. It is not the default and not required.

`src/lib/runtime/turn.ts` default path:

- Load the active local model (selected catalog id whose file exists).
- Run chat + the existing tool schema (`read_file`, `write_file`, `str_replace`, `list_dir`, `delete_file`, `run_command`, gated `web_search`).
- Tool execution stays in `src/runtime/harnessAdapter.ts` → disk server functions.
- Bind only `127.0.0.1`. Never `0.0.0.0` for the model server.

Chat header badge: `Local {model name}` when loaded, `Local model not ready` otherwise.

Settings → Runtime shows: engine name, GGUF path, RAM used estimate, loopback address if any.

## 5. Onboarding order (keep, rewire)

1. Welcome — say work files are on disk, chat is a **local model file**, no account.
2. Server hardware scan.
3. Three cards from the real catalog + server fit. Disabled cards stay disabled.
4. Download (or Import) the chosen Small/fitting model. Cannot continue until `modelVerify` passes or an imported GGUF is registered.
5. Create company / employee / first agent (existing disk seed).
6. Land in chat. First message must use the local engine.

If the local engine is not ready, composer stays enabled but the reply is the error string, not grok-4.5.

## 6. Tests

Add/replace tests in `src/lib/localbot.test.ts` (and a new `src/lib/runtime/local-engine.test.ts` if needed):

- Server hardware report uses `os.totalmem()`, not the 16 GB browser assumption.
- `fitModel` disables Large on a 4 GB fixture.
- Download writer: given a tiny fixture URL or a mocked stream, a file appears on disk and is not the old synthetic blob.
- `turn.ts` default path does not contain `api.x.ai` unless the hosted-demo switch is on. Grep test is fine.
- After a registered tiny GGUF (you may ship a 1–2 MB test fixture if you cannot download a real model in CI), `runHarnessTurn` does not require `XAI_API_KEY`.

Keep the disk grant tests from the last pass.

Run:

```
node --experimental-strip-types --test src/lib/localbot.test.ts
```

LocalBot tests must pass.

## 7. Docs

Update `README.md`, `ARCHITECTURE.md`, `CATALOG.md`, and the top of `LOCALBOT_HANDOFF.md`:

```
## Update after local-model pass
{date}
- Default chat: local GGUF via {engine you actually shipped}
- Hosted grok-4.5: off unless explicit demo switch
- Download: real Hub file into {absolute models dir}
- Still web preview, not an Electron installer
```

If a Hub file you wanted did not exist, write the replacement you used and why.

## Out of scope

- Electron / installers
- DeepSeek Harness / Pi / ACP
- Baking several 15 GB models
- Calling grok-4.5 when local load fails
- Fake progress bars
- Ollama as a required install

## Done when

1. `XAI_API_KEY` can be unset and onboarding still reaches chat.
2. A real GGUF (or imported GGUF) exists on disk under the models directory.
3. A chat turn is answered by that local model, and Writer can still write `hello.md` on disk through tools.
4. Chat header does not say `Hosted grok-4.5` on the default path.
5. README does not say the app needs a cloud key.
6. LocalBot tests pass.

If the preview host cannot finish a multi-GB download or cannot compile `node-llama-cpp`, implement the full pipeline, document the exact blocker in `LOCALBOT_HANDOFF.md`, and still refuse to silently use xAI. Fail visible.

Stop there.
