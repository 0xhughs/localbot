# LOCALBOT — NEXT PASS (for Grok Build)

You already built this repo. Read `LOCALBOT_HANDOFF.md` first. That file is the source of truth. `README.md` and `ARCHITECTURE.md` over-claim. Do not defend those claims. Fix the product.

This pass is **not** “build LocalBot from scratch again.”
This pass is **not** Electron, not llama.cpp, not DeepSeek Harness, not Arabic, not packagers.

Do only the work below. Ship a running web app on the existing TanStack Start stack.

## What is already true (do not re-implement)

- UI shell, onboarding wizard, agent roster, chat, permission cards, computer pane
- Folder contract shape (company / department / people / bots / shared / workspace / output / outbox)
- Grant checks (`pathAllowed`, Allow / Deny / Allow for this chat)
- `@mention` writes `shared/task-*.md`
- Chat brain is `src/lib/runtime/turn.ts` → `https://api.x.ai/v1/chat/completions` model `grok-4.5` with `XAI_API_KEY`

Keep that brain for this pass. Do not rip it out yet. Do not pretend it is a local GGUF.

## Goal of this pass

Make the files real, and make the UI honest.

When Writer writes `hello.md`, that file must exist on the **server disk**, not only in `localStorage`.
When the user picks a company root, that path is a real directory.
Settings, README, and onboarding must stop saying “no cloud / model file on disk / ~/.localbot GGUF” unless the code does that.

## 1. Tell the truth in the UI

Rewrite copy in:

- `README.md`
- `ARCHITECTURE.md`
- onboarding screens (`src/components/localbot/onboarding.tsx`)
- Settings → General / Models / Runtime

Required facts, in plain language:

- This build is a **browser app**.
- Agents think with **hosted grok-4.5** when `XAI_API_KEY` is set.
- There is **no local GGUF inference** in this pass.
- The model picker and “download” are **catalog placeholders**, not real Hub downloads.
- Work files now live on **disk at the company root**, not only in the browser.
- Two laptops share work only if they point at the **same real folder** (NAS / Drive / shared disk). This web process sees the disk of the machine running `npm run dev`.

Delete or replace any sentence that says the default path needs no key, or that a GGUF is written to `~/.localbot/models`.

Add a small Runtime badge in the chat header: `Hosted grok-4.5` when the key works, `AI unavailable` when it does not.

## 2. Replace the VFS with a real disk adapter

Today `src/lib/fs/vfs.ts` + zustand `files` is an in-memory tree persisted in `localStorage`.

Keep the same path helpers and grant logic. Change the storage backend.

### Server disk API

Add server functions (same style as `runHarnessTurn`) that the UI calls:

- `fsList(rootRelPath)`
- `fsRead(rootRelPath)`
- `fsWrite(rootRelPath, content)`
- `fsMkdir(rootRelPath)`
- `fsDelete(rootRelPath)`
- `fsExists(rootRelPath)`
- `fsSeedCompanyTree(input)` — create the folder contract on disk if missing
- `setCompanyRoot(absolutePath)` / `getCompanyRoot()`

Rules:

- All reads/writes are resolved under one absolute **company root**.
- Default company root on first run: `{cwd}/data/LocalBot/{CompanyName}` or `{homedir}/LocalBot/{CompanyName}` if `os.homedir()` is writable. Prefer a path you can actually write in this environment. Persist the chosen absolute path in a small server-side config file, e.g. `{cwd}/data/localbot-config.json`.
- Refuse any resolved path that escapes the company root (`path.resolve` + prefix check). Same grant rules as now, but enforced again on the server, not only in the browser.
- `write_file`, `read_file`, `list_dir`, `str_replace`, `delete_file`, `run_command` in `harnessAdapter.ts` must call these server functions, not zustand `files`.
- After a successful write, the Computer pane refreshes from disk.

### Company root picker

In Settings → Company and in onboarding:

- Show the **absolute path** currently in use.
- Input field to set a new absolute path (not a fake `/Documents/LocalBot/...` VFS string).
- Button: **Create folders here**.
- Button: **Reveal path** copies the absolute path.
- Keep the “this is a shared drive” checkbox. It only changes copy. Do not invent SMB.

If the environment cannot write to the user’s real home, write under the repo `data/` directory and say that in the UI: “This preview writes to the project data folder.”

## 3. Seed the real tree

On onboarding finish and on “Create folders here”:

Create on disk, for the names the user typed:

```
{companyRoot}/
  company.json
  shared/
  departments/
    {Dept}/
      department.json
      shared/
      people/
        {Employee}/
          employee.json
          inbox/
          outbox/
          bots/
            {Bot}/
              bot.json
              AGENTS.md
              memory/notes.md
              workspace/
              output/
```

`hello.md` written by the agent must land at:

`{companyRoot}/departments/{Dept}/people/{Employee}/bots/{Bot}/workspace/hello.md`

and be visible with a normal file listing of that path.

Do **not** keep a second copy of file bodies in `localStorage`. Browser state may keep agent list, chat transcripts, pins, grants, selected bot. File bodies live on disk.

## 4. Stop the fake GGUF download

Do not fetch multi-GB models in this pass.

Change the download step:

- Title: “Choose a catalog size (placeholder)”
- Progress bar goes away, or completes instantly as “catalog noted.”
- Store `selectedCatalogId` only.
- Do not write a synthetic `GGUF\n{json}` blob and call it a model.
- Settings → Models lists the catalog as **planned local models**, disabled, with “Not wired in this build.”

Leave `catalog/models.json` as documentation.

## 5. Keep chat working

`runHarnessTurn` stays on grok-4.5.

When the model calls `write_file`, execute it on **disk** through the new server fs.

When the key is missing, the existing error string is fine. Do not crash onboarding.

Stop still cancels the client loop. If easy, pass an AbortSignal into `fetch`. If not easy, leave a comment. Do not spend the pass on streaming.

## 6. Tests to add or rewrite

Update `src/lib/localbot.test.ts` so it is honest:

- Grant deny still works.
- `seedCompanyTree` creates real directories under a temp folder (`fs.mkdtempSync`).
- Writing `hello.md` via the disk adapter creates a file `fs.existsSync` can see.
- Writing outside company root throws / returns Denied.
- Two bots with `shared` grant can both write files that appear in the same department `shared/` directory on disk.

Do not test “download checksum of synthetic GGUF.” Delete that test.

Run:

```
node --experimental-strip-types --test src/lib/localbot.test.ts
```

All LocalBot tests must pass. Ignore pre-existing template PWA test failures unless you touch those files.

## 7. Docs

Rewrite README “First run” to:

```
npm install
npm run dev
open http://127.0.0.1:8080
```

Say: hosted grok-4.5 for chat, real folders under the configured company root, no desktop installer, no local model yet.

Keep `LOCALBOT_HANDOFF.md`. Add a short section at the top:

```
## Update after disk pass
{date}
- File bodies: real disk under company root
- Chat: still grok-4.5
- GGUF / llama.cpp / dsh / Electron: still not built
```

## Out of scope (do not do)

- Electron / Tauri / installers
- llama.cpp, node-llama-cpp, Ollama wiring
- Hugging Face GGUF download
- DeepSeek Harness / Pi / ACP
- Arabic / RTL
- WebRTC / P2P
- Replacing grok-4.5 as the chat model
- Rewriting the whole UI

## Done when

1. App still boots with `npm run dev`.
2. Onboarding can finish without a GGUF.
3. After chat “write hello.md to your workspace”, the file exists on disk at the real workspace path.
4. Computer pane shows that file from disk.
5. A path outside the bot grants is denied.
6. README no longer claims local-only inference or `~/.localbot` GGUF downloads.
7. LocalBot unit tests pass against real temp directories.

When finished, update `LOCALBOT_HANDOFF.md` section 11 statuses for: company folders, shared folder, outbox, GGUF download, local inference. Use WORKS / PARTIAL / STUB / NOT BUILT only.

Stop there.
