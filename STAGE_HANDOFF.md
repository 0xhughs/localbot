## Stage 21 — Packaged catalog next to the sidecar + channel `@` = Run all once members

Date: 2026-09-06
Branch: `stage-21-packaged-catalog-mentions` (PR #22 → `main`, off `656db77` = merge of PR #21)
Host: Linux 6.12 (cloud VM, x64) · Node v22.14.0 (repo) / v22.22.2 (Harness, nvm) · Linux AppImage + `.deb` rebuilt here (UNSIGNED) · no Mac · no `.dmg` built · no GGUF staged

Status words: WORKS / STUB / NOT BUILT / UNVERIFIED. Two fixes, nothing else. (1) The packaged sidecar runs with `cwd` = `LOCALBOT_SERVER_DIR` = `resources/localbot-server` and opened `catalog/dsh-plugins.json` relative to that; `extraResources` maps `.output → localbot-server` and nothing ever put `catalog/` into `.output`, so the Plugins screen in the Stage 20 `.app` / AppImage hit ENOENT (the repo's `catalog/**` did ride along inside `app.asar`, where the sidecar never looks). Now `npm run build:desktop` copies every `catalog/*.json` into `.output/catalog/` before electron-builder, `assertLayout` refuses a build without `resources/localbot-server/catalog/dsh-plugins.json`, and the resolver is one rule for dev and packaged: `LOCALBOT_SERVER_DIR` when set, else cwd. (2) `@` in a channel used to be a single-word token compared to the exact roster name, so `@Seven of Nine ` (what the pane's own `@` picker inserts) parsed as `@Seven` and produced "not a member" even though her id sat in `memberIds`. Now `@` resolves against the very list "Run all members once" pages — `membersOf(channel)` = `memberIds` ∩ roster — by exact id, roster name (case-insensitive, multi-word, longest match wins) and slugs (`agentSlug`, `seven-of-nine`, `seven_of_nine`). Hit → that id is paged; miss → the existing system line; no `@` → first member, unchanged; `chat.tsx` `handoffTask` untouched. `runAgentTurn`, the Stage 17 token gate, the Stage 18 quit coordinator, the Stage 20 pnpm bundle gates, dsh `0.1.2-alpha.5`, ACP `1.4.0`, pnpm `10.33.3`, `dsh/localbot-fs.mjs` (sha256 `0bb5593a…2b0a6`), `mac.identity: null` — untouched and gated.

### Built

- **Catalog staged into `.output`: WORKS.** `scripts/desktop-stage.mjs`: `listCatalogJson(root)` (every top-level `catalog/*.json`, sorted; throws if the folder is missing, has no `dsh-plugins.json`, or any file is not JSON), `stageCatalog({ root, into })` (rebuilds `<into>/catalog/`, copies each file, re-hashes every copy against the source, throws if anything is missing afterwards), `catalogLayoutChecks(names)` (→ `resources/localbot-server/catalog/<file>` for every staged file, `dsh-plugins.json` always first, even for an empty list). `scripts/build-desktop.mjs` calls `stageCatalog({ root, into: path.join(root, ".output") })` right after `injectSsrCss` and **before** `electron-builder`, and `assertLayout` now requires `...catalogLayoutChecks(catalogStage.names)` next to `resources/localbot-server/server/index.mjs`, then logs `packed catalog (N) at resources/localbot-server/catalog/: …`. No new `extraResources` row: the existing `{ from: ".output", to: "localbot-server" }` carries it. No npm, no network, no marketplace — a file copy.
- **One resolver: WORKS.** `src/lib/harness/plugins.ts` `catalogRoot(env)` = `path.resolve(env.LOCALBOT_SERVER_DIR)` when set and non-empty, else `process.cwd()`; `catalogPath(root = catalogRoot())` = `<root>/catalog/dsh-plugins.json` (`CATALOG_FILE` unchanged). `desktop/main.mjs` already passes `LOCALBOT_SERVER_DIR` (= `resources/localbot-server`) and `cwd: serverDir` to the packaged sidecar; `desktop/sidecar.mjs` already `chdir`s there; `npm run dev` sets neither and runs from the repo root, which holds `catalog/` itself — same relative path both ways. `readPluginCatalog` on ENOENT now throws `<file>: the plugin catalog is missing (ENOENT). This packaged LocalBot was built without catalog/ next to the sidecar — rebuild with npm run build:desktop.` (dev wording: run from the repo root or set `LOCALBOT_SERVER_DIR`). No built-in fallback list (gated). `src/lib/runtime/plugins.ts` (`pluginsCatalog`) unchanged: it already calls `catalogPath()`.
- **Channel `@` resolution: WORKS.** `src/lib/channels-model.ts` (still browser-safe; imports `agentSlug` from `./fs/scope-model.ts`, which has no Node imports): `mentionForms(member)` → lowercased, whitespace-folded `[id, name, name-with-hyphens, name-with-underscores, agentSlug(name) and its hyphen / underscore joins]` (deduplicated). `mentionFormMatch(rest, form)` → how many characters of the text after an `@` the form covers (case-insensitive, `u` flag, any whitespace run between words, regex characters in names escaped, followed by a non-name character so `@Bob` never matches `@Bobby` and `@Seven-x` is not Seven). `resolveMentions(text, members)` → at each `@`, the longest form across all members wins (ties → earlier member in `memberIds`); a hit pushes that id (deduplicated, mention order); no form fits → the single `[\p{L}\p{N}_-]+` token is reported in `unknown` (deduplicated case-insensitively, Unicode letters kept); a bare `@` is skipped. `planSpeakers` now: `nobody` / `all` unchanged, then `resolveMentions`; nothing found → `default-first`; else `mentions`. `parseMentions` / `MENTION_RE` kept (the Stage 16 tokenizer, still tested) — who speaks is decided by `resolveMentions`. `channelTurnRulesText` says "@Name → only that member runs (full name, id or slug, any case)". `src/runtime/channelRunner.ts` unchanged in code (comment only): it still hands `membersOf(channel)` to `planSpeakers` for `@` and for Run all, still writes `@X is not a member of #…` for every `unknown`, never writes a handoff. `src/components/localbot/channel.tsx` untouched: its picker's `@${b.name} ` now resolves.
- **Gates: WORKS.** `scripts/packaged-catalog-gates.mjs` → `packagedCatalogGates(root)` → **79** `{ ok, label }` results, consumed by `src/lib/packaged-catalog.test.ts` (each gate a test + 8 mutation tests on a scratch tree + staging / resolver / mention behaviour incl. a fresh-process read — 103 tests) and `scripts/prove-packaged-catalog.mjs`. Fails if: `catalog/dsh-plugins.json` is gone / not `{ version: 1, profile: "acp", plugins: [...] }` / any `catalog/*.json` is not JSON / an entry's `install.spec` is a registry URL; `extraResources` loses `.output → localbot-server` (or Stage 8 / 20 rows, or gains GGUF / llama / models / runtimes); `desktop-stage.mjs` loses `stageCatalog` / `listCatalogJson` / `catalogLayoutChecks`, the `dsh-plugins.json` requirement, the JSON check, the re-hash, or fetches anything; `build-desktop.mjs` stops staging into `.output`, stages **after** `electron-builder`, or `assertLayout` stops requiring the packed catalog files; `plugins.ts` `catalogRoot` stops reading `LOCALBOT_SERVER_DIR` / falls back to anything but cwd / `catalogPath` stops using it / ENOENT loses the path / a `DEFAULT_CATALOG`-style fallback appears / anything scrapes npm; `sidecar.mjs` stops `chdir`-ing or `main.mjs` stops passing `LOCALBOT_SERVER_DIR` = `resources/localbot-server`; `channels-model.ts` loses `agentSlug` / gains a `node:` import / loses `mentionForms` (or any of its five forms) / `resolveMentions` / the longest-match rule / the case-insensitive whitespace-run regex / `planSpeakers` stops calling `resolveMentions` / the no-`@` → first-member line changes / Run all stops paging `members.map(m => m.id)`; `channelRunner.ts` hands `planSpeakers` anything but `membersOf(channel)`, loses `membersOf` = `memberIds` ∩ roster, the system line, or gains `handoffTask` / `agentFsWrite`, or drops `runAgentTurn`; the pane's picker stops inserting `@${b.name} `; `channels.test.ts` / `prove-channels.mjs` lose the "Seven of Nine" case; `chat.tsx` drops `runAgentTurn`, moves `handoffTask` after the turn, or learns about channels; `start.ts` drops the token gate / CSRF; `sidecar.mjs` stops refusing to boot without the token; `main.mjs` drops the quit coordinator; `packaged.mjs` stops setting `LOCALBOT_PNPM_DIR`; `plugins.ts` stops throwing `NO_PNPM`; dsh / ACP / pnpm pins float in `package.json` or `process.ts`; `dsh/localbot-fs.mjs` sha256 changes; `mac.identity !== null`; the Stage 19 / 20 gate modules vanish. On `main` (`656db77`) **27 of the 79 fail**; the other 52 are carried invariants.
- **Live, this box (dev checkout).** `npm run prove:packaged-catalog`: `stageCatalog` → a temp `.output` → 5 files (`dsh-plugins.json, llama-assets.json, models.json, node-runtime.json, whisper-assets.json`) byte-identical to the repo's; a fake packed tree from that `.output` passes `catalogLayoutChecks`, the same tree without `catalog/` fails it on `resources/localbot-server/catalog/dsh-plugins.json`; a **fresh node process** with `cwd` = an unrelated temp folder and `LOCALBOT_SERVER_DIR` = the fake `resources/localbot-server` reads the 5 entries through `catalogPath()` and reports the file as `<LOCALBOT_SERVER_DIR>/catalog/dsh-plugins.json`; the same with a server dir lacking `catalog/` **and** `cwd` = repo root → ENOENT naming that path (never the repo copy); `LOCALBOT_SERVER_DIR` unset + `cwd` = repo root → `catalog/dsh-plugins.json` (dev). Mentions: `@Seven` → Seven, `@Seven of Nine status?` / `@Seven of Nine ` / `@seven of nine,` / `@seven-of-nine` / `@SEVEN_OF_NINE` / `@bot_son` → Seven of Nine, `@bob then @Seven of Nine then @seven` → that order, every hit ⊂ Run all's ids, `@Zed` → unknown, `@Bobby` ≠ Bob, no `@` → first member, `@Seven of Nine` in a channel of just Bob → unknown.
- **Live, this box (packed Linux app).** `npm run build:desktop` ran end to end on this branch: `[desktop] catalog (5): … → /workspace/.output/catalog` → Harness / Node v22.23.2 / pnpm stages as in Stage 20 → electron-builder AppImage + `.deb` → `packed layout ok` → **`[desktop] packed catalog (5) at resources/localbot-server/catalog/: dsh-plugins.json, llama-assets.json, models.json, node-runtime.json, whisper-assets.json`** → `packed pnpm 10.33.3 runs on the packed Node with an empty PATH`. Outputs (UNSIGNED, not committed): `LocalBot-0.1.0-linux-x86_64.AppImage` sha256 `5bf4d659…5b6fa0`, `LocalBot-0.1.0-linux-amd64.deb` sha256 `0aa8bccb…5c5287`. `sha256sum` of the packed `dsh-plugins.json` equals the repo's (`d241d871…835a9`). Then `prove:packaged-catalog` section 5 (auto-detects `dist/desktop/linux-unpacked`): the **packed** `localbot-sidecar/sidecar.mjs` on the **packed** `localbot-node/node`, `cwd` = `/tmp`, `LOCALBOT_SERVER_DIR` = the packed `resources/localbot-server`, a fresh launch token → the real `pluginsCatalog` server function over loopback → **HTTP 200, ok:true, file = …/resources/localbot-server/catalog/dsh-plugins.json, all 5 entries**; the same packed tree copied without `catalog/` → ok:false, `…/catalog/dsh-plugins.json: the plugin catalog is missing (ENOENT). This packaged LocalBot was built without catalog/ next to the sidecar — rebuild with npm run build:desktop.` (the Stage 20 app's failure, now named).
- **Live, this box (`prove:channels`).** A real roster agent **"Seven of Nine"** (folder `agents/Seven of Nine/`) is added to the on-disk channel; `membersOf` built from `memberIds` ∩ roster; Run all pages her id; `@Seven of Nine status?`, the picker's `@Seven of Nine `, `@seven-of-nine`, `@SEVEN_OF_NINE`, `@<her id>` → her id; `@bob first, then @Seven of Nine` → `[bob, seven]`; `channelGate(ch, seven)` → `ok: true` (the Stage 16 "not a member" line is gone for her); `@Seven` (no member called exactly Seven) → unknown → system line, no run; removed again, channel back to `[alice, bob]`; every Stage 16 gate after it unchanged.
- **Tests + proofs.** `npm test` → **14** (scripts, +2: `listCatalogJson` / `stageCatalog` + layout check on a fake packed tree) + **707** (TS, +103 `packaged-catalog`, +5 in `channels.test.ts` "Stage 21" block) pass; `npm run typecheck` + `npm run lint` clean. `prove:packaged-catalog` (static + live + packed), `prove:channels` (full live, +3 static +10 live gates), `prove:packaged-tools -- --static` (77), `prove:excise -- --static` (103), `prove:quit -- --static` — all pass on this branch.

### Not built

- **Mac `.dmg` with the packed catalog — UNVERIFIED.** No Mac here. `stageCatalog` is platform-neutral and `extraResources` is the same row on every OS, but nobody has run `npm run build:desktop` on a Mac since Stage 13. The "Mac commands" below are what proves it.
- **Plugins UI walk in the packaged app — UNVERIFIED here (no display).** The same server function (`pluginsCatalog`) the screen calls was run live against the packed sidecar (above).
- **Other catalog consumers** (`models.json`, `llama-assets.json`, `node-runtime.json`, `whisper-assets.json`) are read at build time or bundled by Vite / the Harness stage; they are now also on disk next to the sidecar, but no runtime code was changed to read them from there. Nothing else opens `catalog/` with `fs` at runtime.
- **Channel debate loop, safety / hosted / web switches, NSIS, NAS, signing** — out of scope, untouched.
- **Mention edge cases left as before:** an email address in a message still yields `@<domain> is not a member` (the Stage 16 behaviour; no left boundary was added); `@Seven of Nines` pages Seven if a member called Seven exists (longest *member form* that fits).

### Files changed

- `package.json` (`prove:packaged-catalog`; `test` + `src/lib/packaged-catalog.test.ts`)
- `scripts/desktop-stage.mjs` (`CATALOG_DIR`, `CATALOG_REQUIRED_FILE`, `CATALOG_RESOURCE_DIR`, `listCatalogJson`, `stageCatalog`, `catalogLayoutChecks`) · `scripts/build-desktop.mjs` · `scripts/desktop-stage.test.mjs`
- `src/lib/harness/plugins.ts` (`catalogRoot`, `catalogPath` default, ENOENT message)
- `src/lib/channels-model.ts` (`mentionForms`, `mentionFormMatch`, `resolveMentions`, `planSpeakers`, rules text) · `src/lib/channels.test.ts` · `src/runtime/channelRunner.ts` (comment only) · `scripts/prove-channels.mjs`
- New: `scripts/packaged-catalog-gates.mjs` · `scripts/prove-packaged-catalog.mjs` · `src/lib/packaged-catalog.test.ts`
- **Not touched:** `catalog/*.json`, `dsh/localbot-fs.mjs`, `src/components/localbot/chat.tsx`, `src/components/localbot/channel.tsx`, `src/lib/runtime/plugins.ts`, `src/lib/harness/channels.ts`, `src/lib/fs/channels.ts`, `desktop/main.mjs`, `desktop/sidecar.mjs`, `desktop/packaged.mjs`, `src/start.ts`, `src/lib/harness/process.ts` (pins), every other `scripts/prove-*.mjs`.

### Prove it

Command (this box or any Linux / Mac dev checkout):

```
npm ci && npm test && npm run typecheck && npm run lint && npm run prove:packaged-catalog && npm run prove:channels
```

Pass looks like:

```
# tests 14
# pass 14
…
# tests 707
# pass 707
# fail 0
[prove-packaged-catalog] ok: catalog/dsh-plugins.json is checked in
[prove-packaged-catalog] ok: extraResources has { from: ".output", to: "localbot-server" } (the sidecar folder the catalog rides in)
[prove-packaged-catalog] ok: build-desktop.mjs stages catalog/ into .output (stageCatalog({ root, into: path.join(root, ".output") }))
[prove-packaged-catalog] ok: catalog is staged into .output BEFORE electron-builder copies .output → localbot-server
[prove-packaged-catalog] ok: assertLayout requires resources/localbot-server/catalog/<every staged file>
[prove-packaged-catalog] ok: plugins.ts: catalogRoot reads LOCALBOT_SERVER_DIR
[prove-packaged-catalog] ok: resolveMentions picks the LONGEST member form at each @ (Seven of Nine beats Seven)
[prove-packaged-catalog] ok: chat.tsx keeps runAgentTurn
[prove-packaged-catalog] 79 static gates, 0 failing
[prove-packaged-catalog] ok: stageCatalog staged 5 file(s) incl. dsh-plugins.json: dsh-plugins.json, llama-assets.json, models.json, node-runtime.json, whisper-assets.json
[prove-packaged-catalog] ok: the same tree WITHOUT localbot-server/catalog/ fails the layout check on resources/localbot-server/catalog/dsh-plugins.json (…)
[prove-packaged-catalog] ok: fresh process, cwd=lb21-cwd-…, LOCALBOT_SERVER_DIR=…/resources/localbot-server → readPluginCatalog(catalogPath()) ok
[prove-packaged-catalog] ok: LOCALBOT_SERVER_DIR without catalog/ → ENOENT naming that path even with cwd = repo root (never falls back to the repo copy): …
[prove-packaged-catalog] ok: "@Seven of Nine status?" → bot_son (got bot_son)
[prove-packaged-catalog] ok: @Zed (no such member) → nobody runs, 'Zed' reported for the system line
STAGE21_PACKAGED_CATALOG_PASS static+live layout/sidecar-path/dev-path/mentions packed=skipped(no dist/desktop tree; run npm run build:desktop first)
…
[prove-channels] ok: @Seven of Nine → Seven of Nine's id (got bot_…)
[prove-channels] ok: …and the sidecar gate lets that id through (it IS a member) — the Stage 16 'not a member' line is gone for her
STAGE16_CHANNELS_PASS static+live outside/refuse/record-fresh-process/members/transcript/turn-rules/mention-by-name(stage21)/busy-one/archived/disconnected/delete
```

`prove:packaged-catalog` exits 1 on any of the 79 static gates or when: `stageCatalog` does not put every `catalog/*.json` byte-identical under `.output/catalog/`; the layout check does not fail on a tree without `localbot-server/catalog/`; the fresh process with `LOCALBOT_SERVER_DIR` set does not read `<LOCALBOT_SERVER_DIR>/catalog/dsh-plugins.json`, or with a hole falls back to the repo copy; `@Seven` / `@Seven of Nine` / slug / id with that id in the member list does not resolve to that id; `@Zed` runs anybody; no `@` is not the first member.

To rebuild and check the packed Linux app the way the installed app runs (this box did):

```
npm run build:desktop && npm run prove:packaged-catalog
```

→ `[desktop] catalog (5): … → …/.output/catalog` … `[desktop] packed catalog (5) at resources/localbot-server/catalog/: dsh-plugins.json, …` … then the proof's last line ends in **`packed=live(sidecar on the packed Node answered pluginsCatalog from resources/localbot-server/catalog)`** after `ok: PACKED: pluginsCatalog over loopback with the launch token → HTTP 200, ok:true` and `ok: PACKED-WITHOUT-catalog: ok:false — …/catalog/dsh-plugins.json: the plugin catalog is missing (ENOENT) …`.

**Mac commands (the part that stays UNVERIFIED until run):**

```
npm ci && npm run build:desktop
#    expect: "[desktop] packed catalog (5) at resources/localbot-server/catalog/: dsh-plugins.json, llama-assets.json, models.json, node-runtime.json, whisper-assets.json"
ls "dist/desktop/mac-arm64/LocalBot.app/Contents/Resources/localbot-server/catalog"   # → the five files
npm run prove:packaged-catalog   # last line ends in packed=live(…)
open dist/desktop/LocalBot-0.1.0-arm64.dmg   # drag to /Applications, launch
#    Plugins → the catalog list loads (5 rows) with no red "catalog" error; Add "LocalBot hello (fixture)" still works as in Stage 20
#    Channels → a channel with "Seven of Nine" as a member: type @, pick her → "@Seven of Nine " → send → she is paged (no "not a member" line)
```

### How I test in the app

1. `npm run dev` → Plugins: catalog loads from `catalog/dsh-plugins.json` (cwd = repo root). Channels: a channel with a two-word member; type `@`, pick the name (inserts `@Seven of Nine `), send → that member is paged; `@seven-of-nine` and her id do the same; `@Zed` → system line, nobody runs; no `@` → first member.
2. Packaged (Linux AppImage from this branch): Plugins list loads — the sidecar read `resources/localbot-server/catalog/dsh-plugins.json`. Delete that folder → the Plugins screen shows `…the plugin catalog is missing (ENOENT). This packaged LocalBot was built without catalog/ next to the sidecar — rebuild with npm run build:desktop.` UI walk UNVERIFIED here (no display); the server function was run live against the packed sidecar (above).
3. Mac: see "Mac commands".

### Ready for

Nothing scheduled. Next only after I say GO. (Stage 22 = channel debate loop, per the plan; not started.)

## Stage 20 — Packaged tools: bundled pnpm + baked darwin-arm64 whisper-cli (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 20". `npm run prove:packaged-tools -- --static` (77 gates) passes on this branch; `stagePnpm`, the shims, `packagedHarnessEnv`, `NO_PNPM` and the whisper bake are untouched. Stage 21 adds `stageCatalog` beside them in `scripts/desktop-stage.mjs` and one more block of `assertLayout` checks in `scripts/build-desktop.mjs`; the Linux AppImage / `.deb` rebuilt here still pass `packed pnpm 10.33.3 runs on the packed Node with an empty PATH`. The Stage 20 `.app` / AppImage is the build whose Plugins screen hit ENOENT on `catalog/dsh-plugins.json` — that is what Stage 21 fixes.

## Stage 19 — Template excision (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 19". `npm run prove:excise -- --static` (103 gates) passes on this branch. Stage 21 adds files under `scripts/` and `src/lib/` only; `chat.tsx`, `start.ts`, `__root.tsx`, `vite.config.ts`, `turn.ts` untouched.

## Stage 18 — Quit flush (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 18". Invariants still checked by `src/lib/quit-flush.test.ts` and `npm run prove:quit` (`--static` passes on this branch). `desktop/main.mjs` was not edited in Stage 21 (gated three times now).

## Stage 17 — Sidecar token (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 17". `src/start.ts` and the token modules are untouched (gated three times now). Stage 21's packed proof used the launch token to call `pluginsCatalog` on the packed sidecar.

## Stage 16 — Channels · Stage 15 — Routines · Stage 14 — Plugins · Stage 13 — Mic · Stage 12 — Identity · Stage 11 — Chrome (previous stages; still true)

Full text in `LOCALBOT_HANDOFF.md`. `prove:channels` (full live) passes on this branch with the Stage 21 "Seven of Nine" gates added in section 6; every Stage 16 rule (outside scopes, ≥ 2 members, archived refused, BUSY one page, non-member system line, `runAgentTurn` only, 1:1 `handoffTask` first) holds. Stage 14's Plugins flow is unchanged; only where the packaged sidecar finds `dsh-plugins.json` moved onto disk next to it.

## Stage 10 — Mac unsigned package (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 10". `build.mac.identity` is `null`: every installer is **UNSIGNED**, nothing notarized. Latest `.dmg` remains the **Stage 13 rebuild**, sha256 `e843f469c7762f4f6a7fe404c053057384185f7dc4b9121f4218c8cb9fdd5061` — built *before* Stages 14–21 and **without** the bundled pnpm, the baked whisper-cli, or the packed catalog. **No `.dmg` was built in Stage 21** (no Mac here); the "Mac commands" above are how the next `.dmg` gets checked.

## Stage 8 — Installers + two-process share (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Update after Stage 8". Invariants still checked by `src/lib/desktop-packaging.test.ts`. The Linux AppImage / `.deb` **were rebuilt in Stage 21 on this Linux host** (UNSIGNED, not committed): `scripts/build-desktop.mjs` ran end to end with the catalog staged into `.output` and `assertLayout` found all five files under `resources/localbot-server/catalog/`.
