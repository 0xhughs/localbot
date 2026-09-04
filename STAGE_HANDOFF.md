## Stage 8 — Installers + two-process share

Date: 2026-09-04
Branch: `stage-8-installers-nas` (PR → `main`, off `58abaed`)

This is AGENTS.md item 8, the last item — complete-plan §12 "Package the complete desktop product" minus everything that needs a signing identity, a notarization account, release CI, or a second physical machine. Status words: WORKS / STUB / NOT BUILT / UNVERIFIED. Everything produced here is **UNSIGNED**.

### Built

- **Installer artifacts (this host, linux-x64).** `npm run build:desktop` no longer passes `--dir`; `package.json` `build.linux.target` is `["AppImage", "deb"]`, `build.mac.target` is `["dmg"]`, `build.win.target` is `["nsis"]` (`oneClick: false`, `deleteAppDataOnUninstall: false`). Built on this Linux VM, both **UNSIGNED**, checksums also in `dist/desktop/SHA256SUMS.txt` (written by the build): **WORKS**

  ```
  8d02fad2bd81ebc8e8654b1763ffbdd0543285efdd3501991e28b81f19f14e38  LocalBot-0.1.0-linux-x86_64.AppImage   (217,232,082 bytes)
  5dfada7605fdc6bbb0837f115994d0c66db6305fb0987a1e60f62f68cd699b68  LocalBot-0.1.0-linux-amd64.deb         (156,737,780 bytes)
  ```

  `mac.identity` is `null`, `CSC_IDENTITY_AUTO_DISCOVERY=false`, no certificate, no notarize hook. The `.dmg` and NSIS `.exe` targets are in the config but were **not built** here (no macOS / Windows host) — **UNVERIFIED**. Nothing in this repo is signed or notarized and no handoff may say otherwise (`claimsSigned` in `src/lib/desktop-packaging.test.ts` fails the suite on such a line). Installer binaries are not committed; they live in `dist/` (gitignored) and in the PR's Cursor artifacts.
- **Packaged DeepSeek Harness — WORKS (linux-x64), path (a): bundled Node.** Electron stays at 36.3.1 (embedded Node 22.14, cannot load `dsh 0.1.2-alpha.5`). The build downloads the official **Node v22.23.2** archive pinned in `catalog/node-runtime.json` (sha256 per target, verified before extraction), keeps only `node` + Node's LICENSE at `resources/localbot-node/`, and stages the Harness tree at `resources/localbot-harness/`: the `dsh/` overlay (`localbot-acp.cordis.yml`, `localbot-fs.mjs`), every relative import the fs plugin needs (`src/lib/fs/disk.ts`, `scope-model.ts`, `scopes.ts`, `src/lib/runtime/llama-platform.ts`, `catalog/llama-assets.json` — traced by `scripts/desktop-stage.mjs`, not hand-listed), and a fresh `npm install` of `@deepseek-ai/dsh@0.1.2-alpha.5` + `dsh-fs` / `dsh-fs-local@0.1.2-rc.1` into `node_modules/` (195 packages, an explicit `extraResources` entry — Nitro tracing is not relied on). `desktop/main.mjs` hands the sidecar `LOCALBOT_DSH_NODE`, `LOCALBOT_DSH_DIR`, `LOCALBOT_DSH_MODULES` (`packagedHarnessEnv` in `desktop/packaged.mjs`; a missing piece is left unset and logged, never guessed). `findHarnessNode()` with `LOCALBOT_PACKAGED=1` accepts only that binary or Electron's own Node when new enough — the `~/.nvm` scan is dev-only and PATH is never consulted. Proven: with a PATH that resolves no `node` / `npm` / `npx`, the sidecar's real `HarnessProcess.start()` against the extracted AppImage spawned dsh from `resources/localbot-node/node` (`/proc/<pid>/exe` checked) using the bundled `bin.js`, completed ACP `initialize` (`deepseek-harness-acp 0.0.1`); and inside the running packaged app a real chat turn on the 0.5B GGUF got a reply in 25 s with dsh's `exe` = the bundled Node (recorded).
- **Two-process share, one host — WORKS.** `npm run prove:two-process` launches the packaged app (Electron + sidecar on `:18790`, AppData under a temp HOME, employee "Alice") and `npm run dev` on `:8080` with its own `LOCALBOT_DATA_DIR` (employee "Bob"); both configs point `departmentShared` at the **same real folder** and `employeeShared` at `null`. A's Writer sends `@Editor …` → A's sidecar writes `department-shared/task-…md`; B's Computer pane listed it after **3021 ms** with no reload and no Refresh click. Then B → A: **505 ms**. Both files on disk in the shared folder. This is two processes on one host. It is **not** two laptops and **not** a NAS — **UNVERIFIED**.
- **Clean packaged launch — WORKS.** `npm run prove:packaged` extracts the AppImage, launches `LocalBot` with the node-less PATH and a seeded `$XDG_CONFIG_HOME/LocalBot` (config + host index + `agents/Writer`, `agents/Editor`): the sidecar answers on `127.0.0.1:18790` with the LocalBot page, every child process's executable is under the app dir (zygotes, network utility, `sidecar.mjs` run by Electron's own Node — no host `node`/`npm`), `{appData}/models` and `{appData}/bin` are created, the repo's `data/` is untouched, and deleting the whole AppData afterwards leaves every configured work folder in place. The packaged chat run also showed the roster from Stage 7 disk state, `activeModelPath` under AppData, and llama-server b10749 downloaded into `{appData}/bin/linux-x64/cpu/`.
- **Kept:** `@deepseek-ai/dsh` `0.1.2-alpha.5` and `@agentclientprotocol/sdk` `1.4.0` exact; `chat.tsx` → `runAgentTurn`; four scopes; Stage 3 watch; rename / archive / duplicate; per-agent model; durable index. `chat.tsx` gained one `data-role` attribute on message rows (for the proof scripts); no UI change.
- **Tests.** `scripts/desktop-stage.test.mjs` (8) and `src/lib/desktop-packaging.test.ts` (14) are in `npm test`. They fail when: an OS target is `dir`-only; `scripts/build-desktop.mjs` contains `--dir`; `mac.identity` is not `null` or a signing / notarize key appears; `STAGE_HANDOFF.md` or the Stage 8 section of `LOCALBOT_HANDOFF.md` has a line asserting something is signed or notarized; `findHarnessNode` in packaged mode returns a `~/.nvm` Node, accepts a < 22.15 `LOCALBOT_DSH_NODE`, or the source spawns `node` from PATH; `catalog/node-runtime.json` pins < 22.15 or lacks a sha256; the extraResources rows for the Harness tree / Node are missing; the dsh / ACP pins float; `chat.tsx` drops `runAgentTurn`; the two-process script targets `private`. Mutation-checked: setting `linux.target` back to `["dir"]`, re-adding `"--dir"` to the build script, writing "The .dmg is signed and notarized." into this file, and removing the `if (packaged) return …` branch from `findHarnessNode` each fail the suite.

### Not built

- **Signed / notarized installers: NOT BUILT.** No Apple ID, Developer ID, Windows code-signing certificate or notarization credentials exist here; `identity` stays `null`. macOS `.dmg` and Windows NSIS `.exe` are configured but were not produced on this Linux host — **UNVERIFIED** until built there (Node runtime rows for darwin-arm64 / darwin-x64 / win32-x64 are pinned with sha256 but only linux-x64 was downloaded and run).
- **Two laptops / NAS / SMB / NFS: UNVERIFIED.** Only two processes on one host against one local directory were run. The Stage 3 poll fallback on a network mount is still unmeasured. `npm run prove:two-process -- --shared /mnt/<share>` is the command for whoever has the share.
- **Release CI, artifact publishing, auto-update, store listings: NOT BUILT** (out of scope; `publish: null`).
- **Native addon coverage:** dsh's `node-addon-landlock-run-linux-x64` is installed by the build-host `npm install`; the staged tree is for the build host's platform only (cross-building the Harness tree is **NOT BUILT**).
- **Icons:** one 512 px PNG (`build/icon.png`, upscaled from the existing 180 px mark). No `.icns` / `.ico` set; electron-builder derives them — **UNVERIFIED** on mac / win. `desktopName` not set (electron-builder warning only).
- **AppImage first-run sandbox:** the proofs pass `--no-sandbox` because the extracted AppImage's `chrome-sandbox` is not setuid on this VM; a normal double-click launch of the AppImage itself (FUSE mount) is **UNVERIFIED** here.
- GPU farm, 3B / 7B re-hash, Harness loop, watch, UI, hosted-demo removal, token streaming, agent teams: untouched (out of scope).

### Files changed

- `package.json` — `build.linux.target` `["AppImage","deb"]`, `mac.target` `["dmg"]` + `identity: null` + `hardenedRuntime: false`, `dmg.sign: false`, `win.target` `["nsis"]` + `signAndEditExecutable: false`, `nsis` (assisted, per-user, `deleteAppDataOnUninstall: false`), `linux.maintainer` / `icon: build/icon.png`, `artifactName`, extraResources `dist/desktop-harness → .` and `dist/desktop-node → localbot-node`; scripts `prove:packaged`, `prove:two-process`, `prove:packaged-chat`; `npm test` adds `src/lib/desktop-packaging.test.ts`.
- `scripts/build-desktop.mjs` — refuses `dir`-only / non-null identity / floating dsh pin; stages the Harness tree and the Node runtime; runs electron-builder without `--dir` (`--publish never`); asserts the packed layout and runs the packed Node; writes `dist/desktop/SHA256SUMS.txt`.
- `scripts/desktop-stage.mjs` (new) — `traceRelativeImports`, `stageHarness`, `stageNodeRuntime` (download + sha256 + extract), `listInstallers`, `checksumLines`, `hasInstallerTarget`, `versionAtLeast`. `scripts/desktop-stage.test.mjs` (new).
- `catalog/node-runtime.json` (new) — Node `v22.23.2` pin, minimum `22.15.0`, official archive + sha256 per target.
- `desktop/packaged.mjs` — `harnessResourcePaths`, `packagedHarnessEnv`. `desktop/main.mjs` — passes that env to the sidecar in packaged mode.
- `src/lib/harness/process.ts` — `dshBinPath(env)` honours `LOCALBOT_DSH_MODULES`; `defaultDshDir(env)`; `findHarnessNode(lookup)` is injectable, returns `source`, and in packaged mode never scans `~/.nvm`.
- `scripts/prove-packaged.mjs` (new), `scripts/two-process-share.mjs` (new), `scripts/prove-packaged-chat.mjs` (new), `scripts/seed-localbot-data.mjs` (new).
- `src/lib/desktop-packaging.test.ts` (new). `src/components/localbot/chat.tsx` — `data-role` on message `<li>`.
- `build/icon.png` (new, 512 px). `STAGE_HANDOFF.md`, `LOCALBOT_HANDOFF.md`, `README.md`, `ARCHITECTURE.md`, `FOLDER_CONTRACT.md`.

### Prove it

Command (Linux x64; Node ≥ 22.15 on PATH for the dev-side Harness suite, as in Stages 4–7; `npm install` first; network for the Node archive, the Harness `npm install` and electron-builder's tool downloads; nothing on `127.0.0.1:18789` / `18790`):

```
npm run lint && npm run typecheck && npm test && \
  npm run build:desktop && \
  npm run prove:packaged && \
  echo STAGE8_PASS
```

Pass looks like:

```
# tests 203
# pass 203
# fail 0
# tests 179
# pass 179
# fail 0
[desktop] bundled Node v22.23.2 (pin v22.23.2, minimum 22.15.0)
[desktop] electron-builder (linux: AppImage, deb; UNSIGNED)…
[desktop] packed layout ok; …/dist/desktop/linux-unpacked/resources/localbot-node/node is v22.23.2
[desktop] UNSIGNED installers:
  <sha256>  LocalBot-0.1.0-linux-amd64.deb
  <sha256>  LocalBot-0.1.0-linux-x86_64.AppImage
[prove] static gates ok: targets ["AppImage","deb"] | identity null | no --dir
[prove] PATH without node/npm/npx: /tmp/lb-prove-…/bin
[prove] findHarnessNode → …/squashfs-root/resources/localbot-node/node v22.23.2 (explicit)
[prove] dsh started: pid … exe …/squashfs-root/resources/localbot-node/node agent deepseek-harness-acp 0.0.1
[prove] sidecar up on http://127.0.0.1:18790/ — HTML … bytes
[prove] process tree: every executable is under the app dir; no host node/npm/npx
[prove] app exited cleanly; deleting AppData left every work folder in place
STAGE8_PACKAGED_PASS node=v22.23.2 app=…/dist/desktop/LocalBot-0.1.0-linux-x86_64.AppImage
STAGE8_PASS
```

(203 = the template `scripts/**` suite + 8 in `desktop-stage.test.mjs`; 179 = 165 Stage 1–7 tests + 14 in `desktop-packaging.test.ts`.) On `main` (`58abaed`) the chain passes `npm test` (main lists neither Stage 8 suite), `npm run build:desktop` writes only `linux-unpacked`, and `npm run prove:packaged` fails as a missing script. Copying the two Stage 8 test files into a `git worktree` of `main` (verified 2026-09-04): `desktop-stage.test.mjs` fails at "this repo's package.json has an installer target for every OS" (`linux still dir-only`) and at the missing `catalog/node-runtime.json`; `desktop-packaging.test.ts` fails to load because `desktop/packaged.mjs` on main exports no `harnessResourcePaths` / `packagedHarnessEnv`. The command fails when: any OS target is `dir`-only (`npm test` and the build's `hasInstallerTarget` gate); the build script passes `--dir`; `mac.identity` is not `null`; a handoff line claims a signature; `dsh` cannot start from the extracted app with node removed from PATH, starts under any Node other than `resources/localbot-node/node`, or `findHarnessNode` returns a `~/.nvm` binary in packaged mode; the packaged Electron binary does not answer on `:18790`, spawns a process whose executable is outside the app dir, writes into the repo's `data/`, or leaves the port bound after exit; deleting AppData removes a configured work folder; the dsh / ACP pins float; `chat.tsx` drops `runAgentTurn`. Headless Linux is handled: without a usable `$DISPLAY` the proof re-executes itself under `xvfb-run -a`; pass `-- --no-launch` to skip the window step on a host with no X at all.

Second command — two processes, one host (needs `npx playwright install chromium` once; Node ≥ 22.15 is not needed for this one):

```
npm run prove:two-process
```

Pass: `STAGE8_TWO_PROCESS_PASS mode="two-process, one host" shared=… A_to_B=task-…-Writer-to-Editor.md (… ms) B_to_A=task-…-Writer-to-Editor.md (… ms)` — both under 30 s (here 3021 ms and 505 ms). Fails when either Computer pane does not list the other process's file without a reload, when the file is not on disk in the shared folder, or when the handoff lands anywhere but `department-shared/`. Add `-- --shared /path/to/a/mounted/share` to run it against a real NAS folder (that result is what would turn "NAS" from UNVERIFIED into WORKS; nobody has run it).

Third command — a real chat turn inside the packaged app (needs a verified GGUF file; the 0.5B row `qwen2.5-0.5b-instruct-q4_k_m.gguf`, sha256 `74a4da8c…`, is what was used; first run downloads llama.cpp b10749 into AppData):

```
npm run prove:packaged-chat -- --gguf /path/to/qwen2.5-0.5b-instruct-q4_k_m.gguf
```

Pass: `[packaged-chat] dsh spawned by the packaged sidecar: pid … exe …/squashfs-root/resources/localbot-node/node`, an assistant reply, and `STAGE8_PACKAGED_CHAT_PASS dsh_node=…/resources/localbot-node/node reply_ms=… gguf=…` (here 24,892 ms). Fails when dsh runs on any other Node, from any other `@deepseek-ai/dsh` tree, when a process under the app lives outside the app dir or AppData (llama-server is expected in `{appData}/bin/`), or when no reply arrives in 10 minutes.

### How I test in the app

Done on this Linux VM (X display `:1`, no GTK theme) against the extracted `LocalBot-0.1.0-linux-x86_64.AppImage` built above; recording and screenshots attached to the PR.

1. **Install + launch without Node.** `sudo dpkg -i dist/desktop/LocalBot-0.1.0-linux-amd64.deb` (or `chmod +x` the AppImage and run it; on a VM without a setuid `chrome-sandbox` add `--no-sandbox`). In a terminal with `PATH` stripped of node (`env PATH=/usr/bin:/bin /opt/LocalBot/LocalBot`), LocalBot opens; `curl -s http://127.0.0.1:18790/ | grep -c LocalBot` is `1`; `ps -o pid,cmd --ppid $(pgrep -x LocalBot | head -1)` shows only `LocalBot` executables (the sidecar is `LocalBot …/resources/localbot-sidecar/sidecar.mjs`). First launch shows onboarding; `~/.config/LocalBot/` now has `models/` and `bin/`, the repo's `data/` is not involved.
2. **Roster from disk + chat on the bundled Harness.** Quit. Seed `~/.config/LocalBot/` (or let onboarding create folders + Writer) and copy `qwen2.5-0.5b-instruct-q4_k_m.gguf` into `~/.config/LocalBot/models/`. Relaunch (still without node on PATH): the sidebar shows **Writer** straight from disk; send `Reply with one short sentence saying hello.` The header badge reads **Local Qwen 2.5 0.5B Instruct Q4**, a grey line says "Writer has no model set; using Qwen 2.5 0.5B Instruct Q4.", and the reply arrives (~25 s on 4 CPU cores after the one-time llama.cpp download). In a terminal: `pgrep -af 'dsh/lib/bin.js'` shows `/opt/LocalBot/resources/localbot-node/node --experimental-strip-types … /opt/LocalBot/resources/localbot-harness/node_modules/@deepseek-ai/dsh/lib/bin.js --profile acp --patch /opt/LocalBot/resources/localbot-harness/dsh/localbot-acp.cordis.yml …`; `readlink /proc/$(pgrep -f 'dsh/lib/bin.js' | head -1)/exe` is `/opt/LocalBot/resources/localbot-node/node`; `~/.config/LocalBot/dsh-home/` exists. Settings → Runtime still says loopback `http://127.0.0.1:18789/v1`.
3. **Two processes, one folder.** Keep the packaged app open with its `department-shared` set to a folder `S` (Settings → Folders, native picker). In the repo: `LOCALBOT_DATA_DIR=/tmp/lb-b npm run dev`, open `http://localhost:8080/`, walk onboarding with a *different* employee root and the same `S` as Department shared, create **Writer** and **Editor**. In the packaged window, in Writer's chat type `@Editor Please review the Q3 notes` → Enter → grey line "Handed work to Editor via department-shared/task-…md". Open the Computer pane in the browser tab (monitor icon, top right): the **Department** section lists `task-…-Writer-to-Editor.md` within ~3 s, without reload or Refresh. Do the reverse from the browser; the packaged window's Department section lists the second file. `ls S` shows both files. This is two processes on one computer; a second computer or a NAS share was not available.
4. **Uninstall leaves work alone.** `sudo dpkg -r localbot` (or delete the AppImage) then `rm -rf ~/.config/LocalBot`: the employee root, the `agents/*/private/` trees and `S` are untouched — nothing in LocalBot removes them (`desktop/main.mjs` has no `rmSync`; NSIS `deleteAppDataOnUninstall` is `false`; the `.deb` has no postrm touching user files).

### Ready for

Nothing else in AGENTS.md — item 8 was the last item. Leftover **UNVERIFIED** / **NOT BUILT**:

- Signed / notarized macOS `.dmg` and Windows `.exe` (**NOT BUILT** — no identity, no certificate). `.dmg` / NSIS builds themselves **UNVERIFIED** (no mac / win host); bundled Node for darwin-arm64 / darwin-x64 / win32-x64 pinned but never run.
- Two physical computers / NAS / SMB / NFS share (**UNVERIFIED**; command: `npm run prove:two-process -- --shared <mounted folder>` on two machines, or one machine per instance).
- Double-click AppImage launch with FUSE and the setuid sandbox (**UNVERIFIED**; proofs used `--appimage-extract` + `--no-sandbox`).
- Release CI, checksummed publishing, auto-update (**NOT BUILT**, out of scope).
- Carried from earlier stages: painted GPU run (**UNVERIFIED**), 3B / 7B hashes etag-only (**UNVERIFIED**), `pagehide` chat flush on Electron close (**UNVERIFIED**), live Ollama (**UNVERIFIED**), bash sandbox on macOS / Windows (**UNVERIFIED**).
