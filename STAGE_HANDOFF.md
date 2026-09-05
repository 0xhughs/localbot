## Stage 14 — DSH / Cordis plugins

Date: 2026-09-05
Branch: `stage-14-plugins` (PR → `main`, off `23a8f0a` = merge of PR #13)
Host: Darwin 25.5.0 (macOS 26.5.2) · arm64 (Mac mini, Apple M4 Pro) · Electron 36.3.1 · Node v24.12.0 on PATH · pnpm 10.31.0 on PATH (dev only)

Status words: WORKS / STUB / NOT BUILT / UNVERIFIED. This stage is **DeepSeek Harness plugin management only**: a Plugins screen (Catalog / Installed) that drives the real `dsh plugin --profile acp add|remove` against LocalBot's isolated `DSH_HOME`, real `disabled: true` rows in the profile's `cordis.patch.yml`, everything verified with `dsh --dump-config`, and a guard that undoes any plugin that turns hosted / telemetry / web / fs-sandbox back on. No live marketplace, no registry scrape, no routines, no channels. `runAgentTurn`, `dsh/localbot-fs.mjs` (sha256 pin), `dsh/localbot-acp.cordis.yml`, `resolveScopePath`, dsh `0.1.2-alpha.5`, ACP `1.4.0`, the four scopes, host index, sections, profile, mic and chrome are unchanged. Still **UNSIGNED**, not notarized, no `.dmg` rebuilt this stage.

### Built

- **Sidebar → Plugins: WORKS.** `src/components/localbot/sidebar.tsx` footer has a **Plugins** button (`data-testid="sidebar-plugins"`, Puzzle icon) **above Settings**; it sets `ui.showPlugins = true`. `PluginsDialog` (`src/components/localbot/plugins.tsx`) is mounted in `shell.tsx` next to `SettingsDialog`, same dark dialog style. Tabs **Catalog** / **Installed** (`plugins-tab-catalog|installed`, `ui.pluginsTab`), one search field filters both (`filterCatalog` / `filterInstalled` in `src/lib/plugins-model.ts`, pure), a Refresh button, and a footer input **Add by package name (`@scope/name@version`) or absolute local path** → `Add`. `UiState` gained `showPlugins` + `pluginsTab` (`types.ts`, `store.ts` defaults). Live (dev, browser): button present above Settings, dialog opens, Installed shows the profile path, `dsh.profile.bundles`, layer count and the guard line (`hosted / telemetry / web / fs-sandbox still disabled`).
- **Catalog: WORKS, checked in.** `catalog/dsh-plugins.json` — 5 entries `{ id, name, summary, risk, install: { kind, spec } }`: `localbot-plugin-hello` (**safe**, `path` → `dsh/plugins/localbot-plugin-hello`, LocalBot's own fixture bundle) and the four optional bundles that ship inside the pinned dsh install — `@deepseek-ai/dsh-headless`, `dsh-web-app`, `dsh-sdk-app`, `dsh-sdk-minimal` at `0.1.2-alpha.5` (**dangerous**: they insert hosted DeepSeek rows the overlay disables; the summary says the guard will refuse them). `pluginsCatalog()` reads the file and marks each entry `verified` (fixture on disk / package present in `node_modules` at the pinned version). No invented names; `plugins.tsx` never fetches a registry (test + prove gate). Dangerous entries need **Add anyway…** → wait `ARM_DELAY_MS` → a separate **Yes, add it** button (a double-click cannot confirm).
- **Installed is not UI-only: WORKS.** `pluginsInstalled()` (`src/lib/harness/plugins.ts`) reads `{DSH_HOME}/profiles/acp/package.json` (`dsh.profile.bundles` + `dependencies`, so `add` shows up as `link:` / version spec), the profile `cordis.patch.yml` (LocalBot-managed `disabled` rows), and runs the **real** `dsh --profile acp --patch localbot-acp.cordis.yml --patch localbot-fs-plugin.patch.yml --dump-config`, parsing the `# == layer` markers into rows (`parseConfigDump`). Each plugin lists its inserted row ids from its bundle `dsh.bundle.patch`, whether the row is present / disabled in the dump, and the layer name. **Built in, not removable:** `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-acp-app` (profile template), `localbot-acp.cordis.yml`, `localbot-fs-plugin.patch.yml` (LocalBot overlay, `--patch`, composes last). Fresh `DSH_HOME` = "no profile manifest, zero plugins" and still a live dump (7 layers).
- **Add / Remove: WORKS through `dsh plugin`.** `pluginsAdd(spec)` / `pluginsRemove(name)` spawn `findHarnessNode()` → `node_modules/@deepseek-ai/dsh/lib/bin.js plugin --profile acp add|remove …` with `DSH_HOME` set, cwd = the profile, 10 min timeout. Allowlist `parsePluginSpec`: `name`, `@scope/name`, optional `@version` (semver / dist-tag), or an **absolute** path with a `package.json`; **refused before any spawn**: `git+…`, `github:`, `http(s)://`, `file:`, `.tgz`, `./`, `../`, `..` segments, spaces, leading `-`. Non-zero exit → `ok: false`, `code`, `stderr`/`stdout` **verbatim** in the UI (`pnpm not found` → dsh exits 127, shown as-is; when `pnpmStatus()` finds no pnpm, Installed shows a red `plugins-pnpm-missing` banner saying Add / Remove will exit 127 and this build does not bundle pnpm). Success is only claimed when the profile manifest actually changed (a `dsh plugin add` that exits 0 without touching `package.json` is reported as a failure), and Installed re-reads disk + dump afterwards. Live UI: Add `localbot-plugin-hello` → `dsh.profile.bundles = [dsh-base, dsh-acp-app, localbot-plugin-hello]`, dump layer `# == localbot-plugin-hello`, row `localbot-hello` enabled; Remove → back to the two built-ins.
- **Enable / Disable: WORKS on disk, verified.** `pluginsSetEnabled(name, on)` rewrites a **managed block** in `{DSH_HOME}/profiles/acp/cordis.patch.yml` (`# >>> localbot-plugins (managed by LocalBot; edit above this line) >>>` … `<<<`) with one `- id: <row>\n  disabled: true` per row the bundle inserts, leaves the employee's own lines alone (comments-only files render as `[]` so dsh still parses a list), then re-runs `--dump-config` and asserts every row flipped (the result carries `verified` from the dump). Live: Disable → `Wrote disabled: true for localbot-hello in …/cordis.patch.yml · Verified with dsh --dump-config: yes`, row badge `disabled`; the prove shows the disabled plugin's `loaded` marker is **absent** from dsh stderr on the next boot and present again after Enable.
- **Restart rule: WORKS.** After any add / remove / enable / disable: if `HarnessManager` has no running turn → `harness.stop()` (child gone, `dsh` is re-spawned with the new composition on the **next prompt** — `patchReload: startup`, so nothing hot-reloads); if a turn is running → refused **BUSY** (`<agent> is still working on a message. Wait or press Stop before changing plugins.`) before anything is spawned or written (prove: three BUSY refusals, disk unchanged). The UI prints which happened (`DeepSeek Harness was not running; the next message boots the new composition.` / `DeepSeek Harness was stopped; the next message boots the new composition (acp profile is patchReload: startup).`).
- **Guard + rollback: WORKS.** `GUARD_ROW_IDS` = `llm-deepseek`, `web`, `web-search-deepseek`, `web-fetch-http`, `tool-web`, `session-telemetry-otel`, `fs-sandbox`. After add / enable, `guardOffenders(dump)` checks **every** row with a guard id (dsh's id-targeted `disabled: true` lands on the *last* duplicate, so a bundle that inserts a second `llm-deepseek` leaves dsh-base's hosted row live — seen live with `@deepseek-ai/dsh-sdk-minimal`). Any offender → LocalBot runs `dsh plugin remove` (or restores the previous `cordis.patch.yml`), returns `ok: false, guard: { checked, offenders, rolledBack }` and the message `Refused: with <name> composed these rows come back on: llm-deepseek (@deepseek-ai/dsh-base). LocalBot keeps hosted / telemetry / web / fs-sandbox off. The bundle was removed again.` Live UI: `dsh-sdk-minimal` refused + removed; prove: an offline "evil" bundle that inserts `llm-deepseek` is refused + removed, manifest back to built-ins, `guardsHold` true.
- **Safety unchanged: WORKS.** `dsh/localbot-fs.mjs` sha256 `0bb5593a…2b0a6` pinned in the test + prove. File tools still end in `resolveScopePath` (`resolveForAgent`); a plugin-shaped caller (private/ scope, no UI) gets `FS_PERMISSION_DENIED` for `../` out of the scope, a host-absolute path, and a symlink that points outside — in-scope paths resolve. The overlay is still passed last on the `dsh` argv (`dshDumpArgs` tail asserted), so with a plugin added the dump still shows hosted / telemetry / web / fs-sandbox disabled.
- **Fixture bundle: WORKS.** `dsh/plugins/localbot-plugin-hello/` — `package.json` (`dsh.bundle.patch`), `cordis.patch.yml` (inserts row `localbot-hello`), `index.mjs` (Cordis plugin, writes `[localbot-plugin-hello] loaded pid=…` to stderr on `apply`). `scripts/desktop-stage.mjs` copies `dsh/plugins` into the packaged harness stage so the catalog's `path` entry resolves in a built app.
- **Server fns.** `src/lib/runtime/plugins.ts`: `pluginsCatalog`, `pluginsInstalled`, `pluginsAdd`, `pluginsRemove`, `pluginsSetEnabled` (`createServerFn`, same `harnessEnv()` / `HarnessManager` as chat). `plugins.tsx` imports only these plus the browser-safe `plugins-model.ts` (the Node module is never bundled into the renderer).
- **Tests.** `npm test` → 203 (scripts) + **290** (TS, was 258) pass; `npm run lint` + `npm run typecheck` clean. New `src/lib/harness/plugins.test.ts` (32): pins (dsh / ACP / `localbot-fs.mjs` sha256); sidebar button present and above Settings, dialog mounted, `chat.tsx` keeps `runAgentTurn`; catalog validates offline (fixture on disk, dsh bundles at the pinned version, no invented names); spec allowlist accept / refuse table; `--dump-config` + patch-file parsers; `renderUserPatch` round-trip (managed block, employee lines kept, `[]` when empty); `guardOffenders` on duplicate rows; add / remove / enable with a fake runner (exit 127 verbatim, manifest-unchanged ≠ success, BUSY gate spawns nothing, guard offender → rollback); `dshDumpArgs` ends with the two LocalBot `--patch` files; plugin-shaped FS escape denied. **Negative check done:** a runner that never spawns `dsh plugin` (manifest unchanged) fails `pluginsAdd`, and `prove:plugins` exits 1.
- **Proof.** New `scripts/prove-plugins.mjs` (`npm run prove:plugins`): static gates, then live on a temp `DSH_HOME` with the real pinned dsh + pnpm: fresh dump → add fixture → manifest + dump + boot (`dsh --profile acp` ACP initialize, stderr has the `loaded` marker) → disable (dump + file + no marker on boot) → enable → BUSY ×3 → evil-bundle guard rollback → remove → escape denied. `--static` runs the source gates only.

### Not built

- **pnpm in the packaged app — NOT BUILT, by rule.** `dsh plugin` shells out to pnpm; the `.dmg` does not bundle it. In a packaged app without pnpm on PATH, Add / Remove show dsh's exit 127 / "pnpm not found on PATH" verbatim and change nothing; Installed, Enable / Disable and the dump still work (they need only Node + dsh). The red `plugins-pnpm-missing` banner on Installed says so up front.
- **Live npm search / marketplace, Grok store, routines, channels — NOT BUILT, by rule.** The catalog is the checked-in file only.
- **Hot reload — NOT BUILT.** dsh runs with `patchReload: startup`; a running turn is never interrupted (BUSY). The new composition boots on the next prompt.
- **Plugin settings / per-plugin config UI — NOT BUILT.** Only add / remove / enable / disable.
- **Packaged-app Plugins screen — UNVERIFIED** (no `.dmg` rebuilt this stage; `desktop-stage.mjs` copies the fixture, not proven in a built app). **Windows / Linux — UNVERIFIED.** **Signing / notarization — NOT BUILT** (`build.mac.identity` still `null`).
- **Catalog `npm` entries actually installing — UNVERIFIED offline.** The four dsh bundles exist in the pinned install (checked), but a registry `pnpm add` was not run by the prove (network); `dsh-sdk-minimal` was added live once from the local pnpm store and was refused by the guard as designed.

### Files changed

- `src/lib/harness/plugins.ts` (new: spec allowlist, `dshPluginArgs`, `dshDumpArgs`, `parseConfigDump`, `parseUserPatch` / `renderUserPatch`, `guardOffenders` / `guardsHold`, `pnpmStatus`, `pluginsCatalog` / `pluginsInstalled` / `pluginsAdd` / `pluginsRemove` / `pluginsSetEnabled`, BUSY gate, restart) · `src/lib/harness/plugins.test.ts` (new, 32)
- `src/lib/plugins-model.ts` (new, browser-safe types + `filterCatalog` / `filterInstalled` / `packageNameOfSpec`) · `src/lib/runtime/plugins.ts` (new server fns)
- `src/components/localbot/plugins.tsx` (new `PluginsDialog`) · `sidebar.tsx` (Plugins button above Settings) · `shell.tsx` (mount) · `src/lib/types.ts`, `src/lib/store.ts` (`showPlugins`, `pluginsTab`)
- `catalog/dsh-plugins.json` (new) · `dsh/plugins/localbot-plugin-hello/{package.json,cordis.patch.yml,index.mjs}` (new fixture bundle)
- `scripts/prove-plugins.mjs` (new) · `scripts/desktop-stage.mjs` (copy `dsh/plugins`) · `package.json` (`test` list, `prove:plugins`)
- `STAGE_HANDOFF.md`, `LOCALBOT_HANDOFF.md`

### Prove it

Command (needs `pnpm` on PATH for the live part; `npm i -g pnpm` or `corepack enable`):

```
npm test && npm run prove:plugins
```

Pass looks like:

```
ℹ pass 290
[prove-plugins] ok: Plugins button is above Settings in the footer
[prove-plugins] ok: dsh/localbot-fs.mjs unchanged (sha256 pin)
[prove-plugins] ok: catalog validates (5 entries)
[prove-plugins] ok: fresh DSH_HOME: no profile manifest, zero plugins (Installed empty state)
[prove-plugins] $ /usr/local/bin/node …/node_modules/@deepseek-ai/dsh/lib/bin.js plugin --profile acp add …/dsh/plugins/localbot-plugin-hello
  exit 0
[prove-plugins] ok: dsh.profile.bundles = [@deepseek-ai/dsh-base, @deepseek-ai/dsh-acp-app, localbot-plugin-hello]
[prove-plugins] ok: --dump-config has layer `# == localbot-plugin-hello`
[prove-plugins] ok: overlay still composes last: hosted / telemetry / web / fs-sandbox still disabled with the plugin added
[prove-plugins] ok: plugin really ran: dsh stderr has "[localbot-plugin-hello] loaded"
[prove-plugins] ok: disable: verified in --dump-config (disabled: true)
[prove-plugins] ok: disabled plugin does not run on the next boot (no marker in stderr)
[prove-plugins] ok: while a turn runs: add / remove / disable refused BUSY (BUSY, BUSY, BUSY)
  exit 0 → Refused: with localbot-evil-fixture composed these rows come back on: llm-deepseek (@deepseek-ai/dsh-base). LocalBot keeps hosted / telemetry / web / fs-sandbox off. The bundle was removed again.
[prove-plugins] ok: evil fixture: dsh plugin remove ran, bundle is out of the manifest again
[prove-plugins] ok: bundles back to built-ins: [@deepseek-ai/dsh-base, @deepseek-ai/dsh-acp-app]
[prove-plugins] ok: plugin-shaped caller: symlink out of private/ → FS_PERMISSION_DENIED
STAGE14_PLUGINS_PASS static+live add/dump/boot/disable/enable/busy/guard-rollback/remove/escape
```

`prove:plugins` exits 1 when: `sidebar-plugins` is missing or below Settings; `PluginsDialog` is not mounted or `plugins.tsx` does not call the five server fns / fetches a registry; `chat.tsx` drops `runAgentTurn`; the dsh / ACP pins float; `localbot-fs.mjs` changes; the catalog is missing, malformed, or names a package that is not in the pinned dsh install / on disk; a refused spec reaches dsh; `dsh plugin add` was never spawned or the manifest did not change (Installed would be UI-only); the plugin is not in `dsh.profile.bundles` / the dump; the overlay no longer composes last (a guard row is live); dsh does not boot / the `loaded` marker is missing; disable is not in the dump / file / still runs; BUSY does not refuse or touches disk; the evil bundle is not refused + removed; remove leaves the plugin; or a plugin-shaped `..` / absolute / symlink path resolves. ~4 s. `--static` = source gates only.

### How I test in the app

1. `npm run desktop` (or `npm run dev` in a browser). Pick an agent. Sidebar footer: **Plugins** sits above **Settings**. Click it.
2. **Installed**: the header shows the profile path, `Profile manifest present · bundles: @deepseek-ai/dsh-base, @deepseek-ai/dsh-acp-app` (or `Profile not initialized yet — dsh writes it on first boot or first plugin add.` on a brand-new `DSH_HOME`), `dsh --dump-config: 7 layers · hosted / telemetry / web / fs-sandbox still disabled`, and the red pnpm banner if pnpm is missing. Four "Built in / not removable" rows, no added plugins.
3. **Catalog** → `localbot-plugin-hello` (safe) → **Add**. The result box shows the exact `dsh plugin --profile acp add …` command and exit 0; Installed now lists it with `Inserts 1 row: localbot-hello · in --dump-config: localbot-hello`, and `bundles` has three entries. Send a message: dsh boots with the plugin (dev console / harness stderr has `[localbot-plugin-hello] loaded`).
4. **Disable** → `Wrote disabled: true … Verified with dsh --dump-config: yes`; badge `disabled`. **Enable** flips it back. **Remove** → the two built-ins only.
5. Catalog → `@deepseek-ai/dsh-sdk-minimal` (dangerous) → **Add anyway…** → wait for **Yes, add it** → the guard refuses: `Refused: … llm-deepseek (@deepseek-ai/dsh-base) … The bundle was removed again.` Installed is unchanged.
6. Footer field: type `git+https://…` or `../x` → **Refused — nothing changed**, no dsh spawned. Type a real `@scope/name@version` → dsh + pnpm run; if pnpm is not on PATH you see dsh's exit 127 text verbatim.
7. Start a long turn, then try Add / Remove / Disable → **Busy — nothing changed** (`<agent> is still working on a message. Wait or press Stop before changing plugins.`).

### Ready for

Stage 15 only after you say GO.

## Stage 13 — Click-to-toggle mic (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 13". Invariants still checked by `src/lib/audio/voice-toggle.test.ts` and `npm run prove:mic`: click-to-toggle Mic with the hold fallback, live timer, Escape cancels, 60 s cap → stop → transcribe, no send path from voice, `runAgentTurn` kept, exact dsh / ACP pins. Stage 14 touched none of it.

## Stage 12 — Agent identity (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 12". Invariants still checked by `src/lib/agent-identity.test.ts` and `npm run prove:identity`: Edit profile through `agentUpdateProfile` (rename → row → forgetSession → agent.json / AGENTS.md), colour painting through `agentColorHex`, sections in `localbot-agents.json`, `+ New agent` → scripted setup chat, Advanced → modal, `runAgentTurn` kept, exact dsh / ACP pins. Stage 14 touched none of it.

## Stage 11 — Desktop chrome + composer (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 11". Invariants still checked by `src/lib/desktop-chrome.test.ts` and `npm run prove:chrome`: `desktop/preload.cjs` (CommonJS under `sandbox: true`), `hiddenInset` + `trafficLightPosition {14, 12}`, the native Edit menu roles, `+ New agent` above the search above the roster with Settings in the footer (Stage 14 adds Plugins **above** Settings in that footer; the Stage 11 gate still passes), the 6-line native `<textarea>` composer, jump-to-latest, `runAgentTurn` kept, exact dsh / ACP pins.

## Stage 10 — Mac unsigned package + whisper-cli + proofs (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 10". Invariants the Stage 10 proof (`npm run prove:mac`) still reads from this file: `build.mac.identity` is `null`, so the Mac build is **UNSIGNED** and not notarized — no line here may claim otherwise; the `.dmg` sha256 must be listed here. Stage 10's artifact: `LocalBot-0.1.0-mac-arm64.dmg` sha256 `4eff4caab6daafabfaf8f49f6137c4d23a7150ac84c5e2fee4e6c3f9cc9b34e6` (whisper-cli v1.9.2 built from source, Metal 3B / 7B, real-mic hold-to-talk `STAGE10_MAC_MIC_PASS`). The Stage 11 rebuild was `6e90420c1fa798cb221428fe9532f36aa8abb188b034b4d89b89fb8ccd61c297`. **Stage 13 rebuild** (latest, `npm run build:desktop`): `LocalBot-0.1.0-mac-arm64.dmg` sha256 `e843f469c7762f4f6a7fe404c053057384185f7dc4b9121f4218c8cb9fdd5061` — UNSIGNED, not notarized, `dist/` not committed. `npm run prove:mac` on that app (node-less PATH, real USB microphone, TCC `granted`): click → `jfk.wav` out of the speakers → click → composer `"Hello. And so my fellow Americans, ask not what your country can do for you. Ask what you can do for your country."` (`Heard 13.6 s · base.en · 282 ms`), then the hold fallback `Heard 11.5 s`, 0 messages sent, clip deleted → `STAGE10_MAC_MIC_PASS tcc=granted gesture=click-click heard_s=13.6 model=base.en ms=282 … hold_fallback=WORKS … dmg_sha256=e843f469c7762f4f6a7fe404c053057384185f7dc4b9121f4218c8cb9fdd5061`. **No `.dmg` was rebuilt in Stage 14**; the Plugins screen in a packaged app is UNVERIFIED.

## Stage 8 — Installers + two-process share (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Update after Stage 8". Invariants still checked by `src/lib/desktop-packaging.test.ts`: every installer is **UNSIGNED** — `mac.identity` is `null`, no certificate, nothing notarized, and no handoff line may claim otherwise. The Linux AppImage / `.deb` were last built in Stage 8 on a Linux host; not rebuilt here.
