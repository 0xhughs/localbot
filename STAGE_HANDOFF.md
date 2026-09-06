## Stage 20 — Packaged tools: bundled pnpm + baked darwin-arm64 whisper-cli

Date: 2026-09-06
Branch: `stage-20-packaged-tools` (PR → `main`, off `36e9e1d` = merge of PR #20)
Host: Linux 6.12 (cloud VM, x64) · Node v22.14.0 (repo) / v22.22.2 (Harness, nvm) · Linux AppImage + `.deb` rebuilt here (UNSIGNED) · no Mac · no `.dmg` built · no GGUF staged

Status words: WORKS / STUB / NOT BUILT / UNVERIFIED. This stage closes two "the employee still needs something on PATH" holes in the packaged app. (1) `dsh plugin add / remove` forwards to a bare `pnpm`; the installer now carries its own exact-pinned pnpm and the sidecar puts it first on the dsh child's PATH — packaged mode never uses a pnpm from the employee's machine, and refuses (`NO_PNPM`) when the bundle is missing instead of exiting 127. (2) On Apple Silicon the Mic's `whisper-cli` was NOT BUILT until someone ran cmake on that Mac; the `.dmg` build now bakes the Stage 10 build into `resources/localbot-whisper/darwin-arm64/whisper/` and the sidecar copies it into AppData on first use after re-verifying it against the catalog. No GGUF, no llama.cpp runtime in `extraResources` (gated). `runAgentTurn`, the Stage 17 token gate, the Stage 18 quit coordinator, dsh `0.1.2-alpha.5`, ACP `1.4.0`, `dsh/localbot-fs.mjs` (sha256 `0bb5593a…2b0a6`), `mac.identity: null` — untouched and gated.

### Built

- **pnpm pinned + staged: WORKS.** `package.json` `devDependencies.pnpm = "10.33.3"` (exact; `pnpmPinOf` refuses `^`/`~`). `stagePnpm()` (`scripts/desktop-stage.mjs`) copies `node_modules/pnpm` (version checked against the pin) to `dist/desktop-pnpm/localbot-pnpm/pnpm/`, writes `pnpm.cjs` (entry → `./pnpm/bin/pnpm.cjs`), `bin/pnpm` (POSIX shim: shell builtins only, `exec "${LOCALBOT_DSH_NODE:-$here/../../localbot-node/node}" "$here/../pnpm.cjs" "$@"`), `bin/pnpm.cmd` (same for cmd.exe, `LOCALBOT_DSH_NODE` else `..\..\localbot-node\node.exe`), pnpm's MIT `LICENSE`, and `pnpm-runtime.json` (pin, sha256 of `pnpm/dist/pnpm.cjs` + `pnpm/bin/pnpm.cjs`). 22 MB. `extraResources` row `{ from: "dist/desktop-pnpm", to: ".", filter: ["**/*"] }` — one level down like the Harness so pnpm's nested `dist/node_modules` survives electron-builder's filter. `build-desktop.mjs` stages it, then runs the shim on the **bundled** Node with an **empty PATH** (`pnpmShimVersion`) and exits 1 unless it prints the pin; `assertLayout` requires `resources/localbot-pnpm/{bin/pnpm,bin/pnpm.cmd,pnpm.cjs,pnpm/bin/pnpm.cjs,pnpm/dist/pnpm.cjs,LICENSE,pnpm-runtime.json}` and re-runs the **packed** shim on the **packed** Node with an empty PATH.
- **Electron main → sidecar: WORKS.** `desktop/packaged.mjs` `harnessResourcePaths` adds `pnpmDir = resources/localbot-pnpm/bin` and `whisperDir = resources/localbot-whisper/{platform}-{arch}/whisper`; `packagedHarnessEnv` sets `LOCALBOT_PNPM_DIR` only when the platform's shim exists, and `LOCALBOT_WHISPER_DIR` only when `whisper-cli` **and** `whisper-build.json` exist. `main.mjs` logs `packaged resource missing: LOCALBOT_PNPM_DIR` (every OS) / `LOCALBOT_WHISPER_DIR` (darwin-arm64 only — linux / win download theirs, darwin-x64 is NOT BUILT).
- **`src/lib/harness/plugins.ts`: WORKS.** `pnpmLookup(env, platform)` (pure): `LOCALBOT_PNPM_DIR` with its shim → `bundled`; set but no shim → `missing`; unset + `LOCALBOT_PACKAGED=1` → `missing` ("packaged mode never uses pnpm from PATH … rebuild with npm run build:desktop"); unset in dev → `path` (dsh finds whatever PATH has, as in Stage 14). `pnpmChildEnv` prepends the bundle dir to the child's `PATH` (or `Path` — whichever key the env has, no duplicate key), sets `npm_config_store_dir = {DSH_HOME}/pnpm-store` (pnpm's store lives in LocalBot's AppData, never `~/.local/share/pnpm`), and hands the shim `LOCALBOT_DSH_NODE` = the Harness Node. `resolved(o, { needsPnpm })`: `runDshPlugin` (add / remove) passes `needsPnpm: true` and throws `PluginError("NO_PNPM")` **before dsh is spawned**; `--dump-config` (Installed list) never needs pnpm and keeps working without the bundle. `pnpmStatus` probes the bundled shim by absolute path first; in dev without a bundle it probes PATH as before; packaged without a bundle reports `found: false, source: null` **without probing PATH**. `InstalledReport.pnpm` now carries `source: "bundled" | "path" | null`, `dir`, `error` (`src/lib/plugins-model.ts`). `PluginErrorCode` gains `NO_PNPM`; the server functions already forward `code` to the UI.
- **Plugins screen: WORKS.** Red banner (`data-testid="plugins-pnpm-missing"`) only when `!report.pnpm.found`; text distinguishes dev ("pnpm was not found on PATH (dev mode)…") from packaged ("This LocalBot has no usable pnpm… refused (NO_PNPM). Rebuild with npm run build:desktop."). The sentence "does not bundle pnpm" is gone (gated). When found, a one-line note (`data-testid="plugins-pnpm-source"`) says `pnpm 10.33.3 · bundled with LocalBot (<dir>)` or `from PATH (dev mode)`.
- **darwin-arm64 whisper-cli bake (build side): WORKS on this box with fixtures; UNVERIFIED on a Mac.** `checkBuiltWhisper({ catalog, target, dir })` (pure) accepts a Stage 10 folder only if `whisper-build.json` says `release === catalog.release` (`v1.9.2`), `target === darwin-arm64`, `commit === catalog…source.commit`, the binary hashes to `manifest.sha256`, and every listed dylib is beside it (the catalog's own sha256 is reported as `matchesCatalog`, not enforced — a rebuild on another Mac is valid). `stageWhisperBuilt` copies `whisper-cli` + `whisper-build.json` (+ dylibs) to `dist/desktop-whisper/localbot-whisper/darwin-arm64/whisper/`, chmod 755, re-checks the copy, **throws** on any mismatch (nothing staged). `build-desktop.mjs` on a darwin-arm64 host picks the source in order: `--whisper-dir <dir>` → `~/Library/Application Support/LocalBot/bin/darwin-arm64/whisper/` (Stage 10 output) → `node scripts/build-whisper-mac.mjs --bin-root dist/whisper-stage` (cmake on the **build Mac only**). Other hosts stage an empty `dist/desktop-whisper/` (linux / win rows unchanged: first-use download; darwin-x64: NOT BUILT, no row). `extraResources` row `{ from: "dist/desktop-whisper", to: ".", filter: ["**/*"] }`. `assertLayout` on a mac-arm64 build requires the packed `whisper-cli` + manifest and runs `whisper-cli --help`.
- **darwin-arm64 whisper-cli seed (runtime side): WORKS on fixtures.** `src/lib/runtime/stt.ts` `whisperResourceDir()` reads `LOCALBOT_WHISPER_DIR`; `seedWhisperFromResources({ target, asset, from, to })`: not a built row → `not-built-row`; AppData copy passes `verifyBuiltWhisper` → `already-valid` (**never overwritten**, even by a different valid resource); no resource → `no-resource`; resource fails `verifyBuiltWhisper` → `resource-invalid` (nothing copied); else copy `whisper-cli` + `whisper-build.json` + dylibs via temp-file + rename, chmod 755, re-verify → `seeded`. A tampered AppData copy **is** replaced. `ensureWhisperRuntime` calls the seed before the verify that decides `NOT_BUILT`, and its error names the reason (`…This LocalBot carries no baked whisper-cli for this host (LOCALBOT_WHISPER_DIR unset).`). `sttStatus` seeds too, so a fresh AppData on a packaged Apple-Silicon build reports `supported: true` before the first Mic press; `SttStatus.resourceDir` shows where it came from. No cmake / git / network on the employee's Mac: it is a file copy inside `resources/` → AppData (gated: `stt.ts` spawns no cmake / git / clang / make and still has no darwin download URL).
- **Gates: WORKS.** `scripts/packaged-tools-gates.mjs` → `packagedToolsGates(root)` → **77** `{ ok, label }` results, consumed by `src/lib/packaged-tools.test.ts` (each gate a test + 10 mutation tests on a scratch tree + behaviour tests — 102 tests) and `scripts/prove-packaged-tools.mjs`. Fails if: pnpm pin floats / `node_modules/pnpm` is not the pin; either new `extraResources` row is gone, or a row / staged file names GGUF / llama / models / runtimes / `.gguf` / `llama-server` / `ggml-*.bin`; `mac.identity !== null` or notarize / afterSign appear; `stagePnpm` / shims / `pnpmShimVersion` / `stageWhisperBuilt` / `checkBuiltWhisper` gone, a shim calls a bare `node`, the tag / commit check gone; `build-desktop.mjs` stops staging pnpm, checking the shim with an empty PATH, staging whisper on darwin-arm64, or asserting the packed files; `packaged.mjs` stops setting the two env vars conditionally; `plugins.ts` loses the PATH prepend, the `Path` key handling, `npm_config_store_dir`, `NO_PNPM` in `resolved`, `needsPnpm` on add / remove, bundled-first `pnpmStatus`, or spawns a bare pnpm again; `stt.ts` loses `whisperResourceDir` / `seedWhisperFromResources` / the `already-valid` guard / the resource verify / the seed-before-verify in `ensureWhisperRuntime` and `sttStatus`, or spawns cmake; the catalog's darwin-arm64 row stops being `built`-with-no-URL, darwin-x64 gains a row, linux / win rows change kind; `plugins.tsx` says "does not bundle pnpm" or shows the banner unconditionally; `chat.tsx` drops `runAgentTurn`; `start.ts` drops the token gate; `main.mjs` drops the quit coordinator; dsh / ACP pins float in `package.json` or `process.ts`; `dsh/localbot-fs.mjs` sha256 changes; `findHarnessNode` stops refusing PATH / nvm in packaged mode. On `main` (`36e9e1d`) 44 of the 77 fail; the other 33 are the carried invariants.
- **Live, this box (dev checkout).** `npm run prove:packaged-tools`: `stagePnpm` → temp; shim on the Harness Node (v22.22.2) with **`PATH=<empty dir>`** prints `10.33.3`; `pluginsAdd(<fixture>)` with `PATH=<empty dir>`, `LOCALBOT_PACKAGED=1`, `LOCALBOT_PNPM_DIR=<staged bin>` → real `dsh plugin --profile acp add …` **exit 0**, `profiles/acp/package.json` `dsh.profile.bundles = [@deepseek-ai/dsh-base, @deepseek-ai/dsh-acp-app, localbot-plugin-hello]`, the dsh child's PATH was `<bundle>:<empty dir>` and nothing else, `npm_config_store_dir` under `DSH_HOME` (store created), `--dump-config` composes `# == localbot-plugin-hello`, guards hold, `pnpmStatus` = `bundled 10.33.3`, `dsh plugin remove` exit 0. Same call **without** `LOCALBOT_PNPM_DIR` → `PluginError NO_PNPM` ("…packaged mode never uses pnpm from PATH…"), **dsh never spawned**, fresh `DSH_HOME` has no profile — not exit 127. `pluginsInstalled` (dump) still works without a pnpm.
- **Live, this box (packed Linux app).** `npm run build:desktop` ran end to end on this branch: `vite build` → Harness stage → Node v22.23.2 stage → `bundled pnpm 10.33.3 runs on the bundled Node with an empty PATH` → `linux-x64: whisper-cli is a first-use download … nothing staged` → electron-builder AppImage + `.deb` → `packed layout ok` → **`packed pnpm 10.33.3 runs on the packed Node with an empty PATH`**. Outputs (UNSIGNED, not committed): `LocalBot-0.1.0-linux-x86_64.AppImage` sha256 `8ef2d331…1cc814`, `LocalBot-0.1.0-linux-amd64.deb` sha256 `4c970f96…930717`. `resources/localbot-pnpm/` is 22 MB with the layout above; `env -i PATH=<empty> resources/localbot-pnpm/bin/pnpm --version` → `10.33.3` both with `LOCALBOT_DSH_NODE` and via the sibling `localbot-node/node` fallback. Then, everything from the packed resources — packed Node, packed `@deepseek-ai/dsh`, packed pnpm, `PATH=<empty dir>`, `LOCALBOT_PACKAGED=1`, env exactly `packagedHarnessEnv(resources)` → `dsh plugin --profile acp add <fixture>` **exit 0**, bundles gain `localbot-plugin-hello`, `pnpm: { found: true, version: "10.33.3", source: "bundled" }`, dump ok, guards hold; drop `LOCALBOT_PNPM_DIR` → `NO_PNPM`.
- **Tests + proofs.** `npm test` → **12** (scripts, +4: pnpm pin / shims / `stagePnpm` with empty PATH / whisper bake check) + **599** (TS, +102 `packaged-tools`; `desktop-packaging` and `stt` updated for the new env keys and the seed step) pass; `npm run typecheck` + `npm run lint` clean. `prove:excise -- --static` (103 gates), `prove:plugins` (full live, dev mode — pnpm from PATH, as in Stage 14), `prove:quit -- --static`, `prove:token` (full live) — all pass on this branch.

### Not built

- **Real `.dmg` with the baked whisper-cli — UNVERIFIED.** No Mac here. `build-desktop.mjs`'s darwin-arm64 branch, `stageWhisperBuilt` on a real Stage 10 build, electron-builder copying `resources/localbot-whisper/…`, the packed `whisper-cli --help` check, `packagedHarnessEnv` setting `LOCALBOT_WHISPER_DIR` in the real app, and the seed into a fresh `~/Library/Application Support/LocalBot/bin/darwin-arm64/whisper/` were exercised only with fixtures (unit tests) and by static gates. The "Mac commands" below are what proves it.
- **`pnpm.cmd` on Windows — UNVERIFIED.** The cmd shim is written and gated, never executed (no Windows host). NSIS proof out of scope.
- **darwin-x64 — NOT BUILT**, unchanged: no catalog row, nothing staged, Mic reports NOT BUILT with the Stage 10 reason.
- **linux / win whisper-cli** — unchanged first-use downloads (`catalog/whisper-assets.json` rows gated to stay `tar.gz` / `zip`). Not baked, by design.
- **Signing / notarization** — none; `mac.identity: null` gated. GGUF / llama.cpp runtimes — not in `extraResources`, gated.
- **Store cache / state dirs of pnpm** — only `npm_config_store_dir` is redirected under `DSH_HOME`; pnpm's small cache / state folders still default to the user's XDG dirs.

### Files changed

- `package.json` (pnpm `10.33.3` devDependency; two `extraResources` rows; `prove:packaged-tools`; `test` + `src/lib/packaged-tools.test.ts`) · `package-lock.json`
- `scripts/desktop-stage.mjs` (`pnpmPinOf`, `pnpmShimSh`, `pnpmShimCmd`, `pnpmEntryCjs`, `stagePnpm`, `pnpmShimVersion`, `readWhisperCatalog`, `checkBuiltWhisper`, `stageWhisperBuilt`; JSDoc on older helpers tsc now sees) · `scripts/build-desktop.mjs` · `scripts/desktop-stage.test.mjs`
- `desktop/packaged.mjs` · `desktop/main.mjs`
- `src/lib/harness/plugins.ts` · `src/lib/plugins-model.ts` · `src/components/localbot/plugins.tsx`
- `src/lib/runtime/stt.ts` · `src/lib/runtime/stt.test.ts` · `src/lib/desktop-packaging.test.ts`
- New: `scripts/packaged-tools-gates.mjs` · `scripts/prove-packaged-tools.mjs` · `src/lib/packaged-tools.test.ts`
- **Not touched:** `dsh/localbot-fs.mjs`, `src/components/localbot/chat.tsx`, `src/start.ts`, `src/lib/runtime/sidecar-token*`, `desktop/quit-flush.mjs`, `src/lib/harness/process.ts` (pins), `catalog/whisper-assets.json`, `catalog/node-runtime.json`, `scripts/build-whisper-mac.mjs`, every other `scripts/prove-*.mjs`.

### Prove it

Command (this box or any Linux / Mac dev checkout):

```
npm ci && npm test && npm run typecheck && npm run lint && npm run prove:packaged-tools
```

Pass looks like:

```
# tests 12
# pass 12
…
# tests 599
# pass 599
# fail 0
[prove-packaged-tools] ok: pnpm pin is exact 10.33.3 (got "10.33.3")
[prove-packaged-tools] ok: extraResources has { from: "dist/desktop-pnpm", to: ".", filter: ["**/*"] }
[prove-packaged-tools] ok: extraResources has { from: "dist/desktop-whisper", to: ".", filter: ["**/*"] }
[prove-packaged-tools] ok: extraResources carries no GGUF / llama.cpp / models / runtimes row
[prove-packaged-tools] ok: build.mac.identity is null (got null)
…
[prove-packaged-tools] ok: plugins.ts: the bundled bin dir is prepended to the child's PATH
[prove-packaged-tools] ok: plugins.ts: packaged mode with no bundle refuses NO_PNPM (never pnpm from PATH)
[prove-packaged-tools] ok: ensureWhisperRuntime seeds before it can say NOT_BUILT
[prove-packaged-tools] ok: plugins.tsx no longer says "does not bundle pnpm"
[prove-packaged-tools] ok: chat.tsx keeps runAgentTurn
[prove-packaged-tools] 77 static gates, 0 failing
[prove-packaged-tools] ok: staged shim on the Harness Node with an EMPTY PATH prints 10.33.3 (got 10.33.3)
[prove-packaged-tools] $ …/node …/@deepseek-ai/dsh/lib/bin.js plugin --profile acp add …/dsh/plugins/localbot-plugin-hello
  exit 0
[prove-packaged-tools] ok: PATH empty + LOCALBOT_PNPM_DIR: dsh plugin --profile acp add <fixture> exited 0
[prove-packaged-tools] ok: profiles/acp/package.json dsh.profile.bundles = [@deepseek-ai/dsh-base, @deepseek-ai/dsh-acp-app, localbot-plugin-hello]
[prove-packaged-tools] ok: …and holds nothing else but the empty folder (no host pnpm anywhere on it)
[prove-packaged-tools] ok: PATH empty, LOCALBOT_PACKAGED=1, no LOCALBOT_PNPM_DIR → PluginError NO_PNPM (got NO_PNPM)
[prove-packaged-tools] ok: dsh was never spawned (no exit 127, no profile init)
STAGE20_PACKAGED_TOOLS_PASS static+live pnpm=bundled/10.33.3 node=v22.22.2 whisper=seed-unit-only
```

`prove:packaged-tools` exits 1 on any of the 77 static gates or when: the staged shim does not print the pin on the Harness Node with an empty PATH; `dsh plugin add` through the bundle exits non-zero or leaves the manifest without `localbot-plugin-hello`; the dsh child's PATH does not start with the bundle or holds anything besides it and the empty folder; the store dir is not under `DSH_HOME`; the packaged-without-bundle call does not throw `NO_PNPM`, or spawns dsh, or `pnpmStatus` probes PATH.

To rebuild and check the packed Linux app the way the installed app runs (this box did):

```
npm run build:desktop
```

→ `[desktop] bundled pnpm 10.33.3 runs on the bundled Node with an empty PATH` … `[desktop] packed pnpm 10.33.3 runs on the packed Node with an empty PATH` … `[desktop] UNSIGNED installers:` + two sha256 lines.

**Mac commands (Apple Silicon; the part that stays UNVERIFIED until run):**

```
# 1. build (cmake only here, on the build Mac; picks ~/Library/Application Support/LocalBot/bin/darwin-arm64/whisper if Stage 10 already built it)
npm ci && npm run build:desktop
#    expect: "[desktop] baked whisper-cli v1.9.2 for darwin-arm64 (sha256 …) → …/dist/desktop-whisper/localbot-whisper/darwin-arm64/whisper"
#            "[desktop] packed pnpm 10.33.3 runs on the packed Node with an empty PATH"
#            "[desktop] packed whisper-cli answers --help (sha256 …)"
#    then: ls "dist/desktop/mac-arm64/LocalBot.app/Contents/Resources/localbot-whisper/darwin-arm64/whisper"  → whisper-cli  whisper-build.json

# 2. the employee's machine: nothing on PATH but the system, fresh AppData
mv ~/Library/Application\ Support/LocalBot ~/Library/Application\ Support/LocalBot.bak
open dist/desktop/LocalBot-0.1.0-arm64.dmg   # drag to /Applications
env -i HOME="$HOME" PATH=/usr/bin:/bin /Applications/LocalBot.app/Contents/MacOS/LocalBot
#    Plugins → Add "LocalBot hello (fixture)" → exit 0, Installed lists localbot-plugin-hello, footer says "pnpm 10.33.3 · bundled with LocalBot (…/Resources/localbot-pnpm/bin)", no red banner
#    Settings → Mic: "supported: true" on the fresh AppData; ls ~/Library/Application\ Support/LocalBot/bin/darwin-arm64/whisper → whisper-cli whisper-build.json (seeded, no cmake ran)
#    which cmake pnpm node → nothing needed; the app's stderr shows no "packaged resource missing" line
```

### How I test in the app

1. `npm run dev` → Plugins: footer reads `pnpm 10.33.3 · from PATH (dev mode)` (this box has pnpm on PATH); Add / Remove of the fixture work as in Stage 14. Remove pnpm from PATH → red banner "pnpm was not found on PATH (dev mode)…", Add exits 127 with dsh's message (unchanged dev behaviour).
2. Packaged (Linux AppImage from this branch): Plugins footer reads `pnpm 10.33.3 · bundled with LocalBot (…/resources/localbot-pnpm/bin)`; Add works with no pnpm / node on the machine. Delete `resources/localbot-pnpm/` → `main.mjs` logs `packaged resource missing: LOCALBOT_PNPM_DIR`, the banner says "no usable pnpm … refused (NO_PNPM)", Add → "Refused — nothing changed", Installed list still loads. UI walk UNVERIFIED here (no display); the same server functions were run live against the packed resources (see above).
3. Mac: see "Mac commands".

### Ready for

Nothing scheduled. Next only after I say GO.

## Stage 19 — Template excision (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 19". `npm run prove:excise -- --static` (103 gates) passes on this branch. Stage 20 adds files under `scripts/` and `src/lib/` and one devDependency (`pnpm`); none of the excision gates moved — `chat.tsx`, `start.ts`, `__root.tsx`, `vite.config.ts`, `turn.ts` untouched.

## Stage 18 — Quit flush (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 18". Invariants still checked by `src/lib/quit-flush.test.ts` and `npm run prove:quit` (`--static` passes on this branch). Stage 20's `desktop/main.mjs` edit is two log lines after `packagedHarnessEnv`; the coordinator is untouched (gated twice now).

## Stage 17 — Sidecar token (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 17". `npm run prove:token` (full live) passes on this branch; `src/start.ts` and the token modules are untouched (gated twice now).

## Stage 16 — Channels · Stage 15 — Routines · Stage 14 — Plugins · Stage 13 — Mic · Stage 12 — Identity · Stage 11 — Chrome (previous stages; still true)

Full text in `LOCALBOT_HANDOFF.md`. `prove:plugins` (live, dev mode — pnpm from PATH) passes on this branch; Stage 20 changes what pnpm the **packaged** app uses, not the Stage 14 flow. `prove:mic --static` still passes: the Mic's linux / win download rows and the Stage 13 UI are unchanged; only the darwin-arm64 built row gained the resource seed.

## Stage 10 — Mac unsigned package (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 10". `build.mac.identity` is `null`: every installer is **UNSIGNED**, nothing notarized. Latest `.dmg` remains the **Stage 13 rebuild**, sha256 `e843f469c7762f4f6a7fe404c053057384185f7dc4b9121f4218c8cb9fdd5061` — built *before* Stages 14–20 and **without** the bundled pnpm or the baked whisper-cli. **No `.dmg` was built in Stage 20** (no Mac here); the "Mac commands" above are how the next `.dmg` gets checked.

## Stage 8 — Installers + two-process share (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Update after Stage 8". Invariants still checked by `src/lib/desktop-packaging.test.ts`. The Linux AppImage / `.deb` **were rebuilt in Stage 20 on this Linux host** (UNSIGNED, not committed): `scripts/build-desktop.mjs` ran end to end with the two new `extraResources` rows and the packed pnpm shim ran on the packed Node with an empty PATH.
