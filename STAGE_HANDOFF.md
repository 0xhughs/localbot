## Stage 19 — Template excision

Date: 2026-09-06
Branch: `stage-19-template-excision` (PR #20 → `main`, off `58acd81` = merge of PR #19)
Host: Linux 6.12 (cloud VM, x64) · Node v22.14.0 · no GGUF staged · no Electron launched · no `.dmg` / NSIS built (by rule)

Status words: WORKS / STUB / NOT BUILT / UNVERIFIED. This stage is **deletion only**: the app-builder template's auth / database / PWA / live-preview / hosted-demo leftovers are out of the tree, `npm test` runs LocalBot suites only, and a gate set fails the build if any of it comes back. No new architecture. `runAgentTurn`, `chat.tsx`, `desktop/`, `dsh/localbot-fs.mjs` (sha256 `0bb5593a…2b0a6`), dsh `0.1.2-alpha.5`, ACP `1.4.0`, the Stage 17 token gate, the Stage 18 quit coordinator, the four scopes, plugins, routines, channels, mic, chrome — untouched.

### Built

- **Leftovers deleted: WORKS.** 159 files, 24 551 lines removed. `src/lib/auth/` (15 files: Better Auth client/server, gates, isolation, popup, PGLite dialect, identity JWT), `src/lib/db.ts` (Neon / PGLite `getSql`), `src/lib/app-data/` (per-user app data over auth), `migrations/auth/0001_auth.sql`, `server/` (Nitro PWA middleware + `virtual:grok-og-identity`), `src/components/preview-host-bridge.tsx` + `src/lib/preview-host-bridge.ts` + `src/lib/preview-embedder-origin.ts` (Grok preview iframe bridge), `src/lib/og/site.json`, `public/__grok/**` + `public/og.jpg`, `.grok/` (90 files: skills, references, `app-env.json`, `preview.log`, `status`), `startup.sh` (Grok sandbox revive), `src/lib/runtime/execute-turn.ts` + `hosted-turn.ts` (the `api.x.ai` / `XAI_API_KEY` hosted-demo chain — its only caller was `runSingleCompletion`, which nothing called), and 24 template scripts: `grok-pwa-plugin`, `grok-pwa-shared(.d)`, `app-env-plugin`, `with-app-env`, `migration-plan`, `migrate`, `check-auth-invariant`, `sign-out-plan`, `brand-check`, `browser-smoke`, `browser-smoke-verdict`, `browser-guard`, `preview`, `preview-thumbnail`, `write-atomic`, `install-page.html` and their 10 `*.test.mjs` suites. `scripts/desktop-stage.mjs` (+ its test) kept — it is LocalBot's.
- **`src/routes/__root.tsx`: WORKS.** Plain `<Outlet />` then `<Scripts />`. No `AuthProvider`, no `PreviewHostBridge`, no `/__grok/manifest.webmanifest` or `apple-touch-icon` links. Head keeps the LocalBot title / description / theme-color / favicon / stylesheet / fonts.
- **`vite.config.ts`: WORKS.** Plugins are now exactly `sidecarTokenPlugin(), tailwindcss(), tanstackStart(), nitro({ preset })` (build / preview only) `, viteReact()`. `pgliteBootstrapPlugin`, `authPopupPlugin`, `appEnvPlugin`, `grokPwaPlugin` and `serverDir: "./server"` are gone. `sidecarTokenPlugin()` still precedes `tanstackStart()` so it wraps the response (the Stage 17 test asserts this; the new gates assert it too). Host / port contract (`0.0.0.0:8080`) unchanged.
- **`src/lib/runtime/turn.ts`: WORKS.** `runSingleCompletion` removed. `getAiStatus` still returns `allowHostedDemo` for the Safety switch, and when the switch is on it reports `available: false` with the badge `Hosted demo is on — chat refused until Settings → Safety turns it off`; it reads no `XAI_API_KEY` and names no hosted engine. `harness-launch.ts` still throws `HOSTED_DEMO_REFUSAL` when the switch is on (gated). `runLocalTurn` (`local-engine.ts`) is the only raw completion path left; `turn-types.ts` stays for it.
- **`package.json`: WORKS.** Dropped `better-auth`, `kysely`, `pg`, `@types/pg`, `@electric-sql/pglite`, `jose` (no importer left). Dropped `db:migrate`, `check:auth`, `preview:restart`, `preview:stop`. `build` = `vite build`, `dev` = `vite dev --host 0.0.0.0 --port 8080`, `preview` = `vite preview` (no `with-app-env.mjs`). `test` = `scripts/desktop-stage.test.mjs` + the LocalBot TS suites (`localbot`, `scopes`, `watch`, `agents`, `host-index`, `model-platform`, `desktop-packaging`, `desktop-chrome`, `agent-identity`, `harness`, `stt`, `voice-toggle`, `plugins`, `routines`, `channels`, `sidecar-token`, `quit-flush`, **`excision`**). New `prove:excise`. `overrides.nf3` kept — Nitro needs it. `package-lock.json` refreshed with `npm install` (−486 lines). Two of the removed names remain in the lockfile **transitively**, not as our deps: `jose` (via `@modelcontextprotocol/sdk` under dsh) and `@electric-sql/pglite` (an optional peer of Nitro's `db0`, `dev: true, optional: true, peer: true`). Neither is imported by LocalBot code; the gates scan source imports and direct deps, not the lockfile.
- **`scripts/build-desktop.mjs`, `scripts/prove-token.mjs`: WORKS.** Both spawned `vite` through `with-app-env.mjs`; they now call `node_modules/vite/bin/vite.js` directly. `scripts/sidecar-token-hygiene.mjs` drops `server` from `SHIPPED_ROOTS`. `src/lib/sidecar-token.test.ts` drops `server/middleware/grok-pwa.ts` from its "must not serve the token" list. `tsconfig.json` drops `server` from `include`.
- **`src/lib/localbot.test.ts` inverted, not deleted: WORKS.** "turn.ts default path does not call api.x.ai" (which *asserted* `hosted-turn.ts` contains `api.x.ai`) is now "Stage 19: the hosted-demo chain is gone and turn.ts has no hosted path": `hosted-turn.ts` / `execute-turn.ts` must not exist, `turn.ts` has no `api.x.ai` / `XAI_API_KEY` / `execute-turn` / `runSingleCompletion`, keeps `getAiStatus` + `allowHostedDemo`, and `harness-launch.ts` keeps the refusal. "executeTurn default does not require XAI_API_KEY" now runs `runLocalTurn` with the same assertion.
- **Gates: WORKS.** `scripts/excise-gates.mjs` is one pure function `excisionGates(root)` → 103 `{ ok, label }` results, consumed by both `src/lib/excision.test.ts` (each gate is a test, plus 14 mutation tests on a scratch copy of the tree and 2 on the matcher constants — 121 tests) and `scripts/prove-excise.mjs`. It fails if: any of the 33 deleted paths is back; `src/components` / `src/routes` / `src/lib/fs` / `src/lib/runtime` / `src/lib/harness` import `lib/auth`, `auth/*`, `db`, `app-data`, the preview bridge, the hosted chain or a template script (static `from`, dynamic `import()`, `require()`); `better-auth` / `kysely` / `pg` / `@electric-sql/pglite` / `jose` appear as import specifiers, or `api.x.ai` / `XAI_API_KEY` as text, anywhere under `src/`, `scripts/`, `desktop/`, `vite.config.ts` (one allowed occurrence: `harness/process.ts` **deleting** `XAI_API_KEY` from the dsh env, matched by its exact shape); any of the six packages is in `package.json` deps; `build` is not `vite build` or any script mentions `db:migrate` / `migrate.mjs` / `with-app-env`; `db:migrate` / `check:auth` / `preview:*` scripts exist; `npm test` runs `scripts/**/*.test.mjs`, `app-data.test.ts`, `gate-identity.test.ts` or any of the 10 template suites, or drops any LocalBot suite; `__root.tsx` mounts `AuthProvider` / `PreviewHostBridge`, links `/__grok/*`, or is not `<Outlet /><Scripts />`; `vite.config.ts` names any template plugin / `ssrLoadModule` / `serverDir`, drops the `sidecarTokenPlugin` import, or places it after `tanstackStart()`; `turn.ts` drops `getAiStatus` / `allowHostedDemo` or regains `runSingleCompletion` / the hosted chain; `harness-launch.ts` drops the refusal; `chat.tsx` drops `runAgentTurn`; `start.ts` drops `functionMiddleware: [sidecarTokenMiddleware]` or CSRF; `main.mjs` drops `createQuitCoordinator(` / `requestQuit(` or `quit-flush.mjs` is missing; the renderer quit-flush modules or the token middleware modules are missing; dsh / ACP pins float; `dsh/localbot-fs.mjs` sha256 changes; `scripts/desktop-stage.mjs` or the core fs / harness modules are missing. Mutation-checked in the suite: auth dir back, component importing `@/lib/auth`, runtime importing `../db` + `@/lib/app-data`, `better-auth` back in deps, `api.x.ai` + `from "pg"` in shipped source, `build` running `db:migrate`, `scripts/**/*.test.mjs` back in `test`, `chat.tsx` losing `runAgentTurn`, `functionMiddleware: [ ]`, `main.mjs` losing the coordinator, floating pins + edited `localbot-fs.mjs` + `serverDir` back, `AuthProvider` + manifest back in `__root.tsx`, `sidecarTokenPlugin()` after `tanstackStart()`, `turn.ts` reading `XAI_API_KEY` — each flips the named gate.
- **Live, this box.** `npm run prove:excise -- --build`: `rm -rf .output`, `vite build` with `LOCALBOT_DESKTOP_BUILD=1` (Nitro `node-server`, the bundle the packaged app ships) — no `db:migrate` step exists to run; the built server bundle contains none of `better-auth`, `@electric-sql/pglite`, `api.x.ai`, `virtual:grok-og-identity`, `/__grok/manifest.webmanifest`, `renderInstallPageHtml`; the real `desktop/sidecar.mjs` boots on `:18790` with a fresh token: `GET /` is `<title>LocalBot</title>` with no `/__grok` link, `/?install=1&platform=ios` is the app (not the install tutorial), `/__grok/manifest.webmanifest` → `404 text/html`; the build manifest lists `foldersGet` and `getAiStatus` and not `runSingleCompletion`; `foldersGet` and `getAiStatus` without the header → **`401 NO_TOKEN`** (table loaded, Stage 17 gate on), with the launch token → `200` (`folders` / `allowHostedDemo`, no `grok-4.5`); SIGTERM → port closed. `npm run build` (default `vercel` preset) also exits 0 with no migrate step. `npm run dev` serves `<title>LocalBot</title>` on `:8080` within 1 s.
- **Tests + proofs.** `npm test` → **8** (scripts, was 203 — the 195 template tests are gone with their suites) + **497** (TS, was 408: −32 `app-data` / `gate-identity`, +121 `excision`) pass; `npm run typecheck` + `npm run lint` clean. Re-run on this branch: `prove:token` **full live** (`STAGE17_TOKEN_PASS static+live … dev-401/dev-200` — its dev gate now spawns `vite` directly), `prove:quit --static`, `prove:routines`, `prove:channels`, `prove:plugins` (live), `prove:chrome --static`, `prove:identity --static`, `prove:mic --static` — all pass.

### Not built

- **Nothing new was built** — this stage only removes. NSIS, `.dmg`, pnpm plugin bundle, UI chrome, `desktop/` behaviour, `dsh/` — untouched, by rule.
- **Packaged `.app` / AppImage on this tree — UNVERIFIED.** No installer was rebuilt. `build-desktop.mjs` was edited (direct `vite` call) but not run; the same `vite build` it performs was run by `prove:excise` / `prove:token` and the resulting `.output` booted as the sidecar. Electron was not launched here (no `prove:quit` live gate, `--static` only).
- **`jose` / `@electric-sql/pglite` in `package-lock.json`** stay as transitive / optional-peer entries of dsh's MCP SDK and Nitro's `db0`. Removing them is not in LocalBot's hands; they are not direct deps and nothing imports them (gated).
- **`src/lib/error-component.tsx`** (router `defaultErrorComponent`) and `src/components/ui/{button,input}.tsx` came from the template but are imported by LocalBot (`router.tsx`, the localbot components). Kept — they are in use, not leftovers.
- **Docs** (`README.md`, `ARCHITECTURE.md`, `FOLDER_CONTRACT.md`, `CATALOG.md`) mention none of the removed pieces; nothing to edit there.

### Files changed

- Deleted (159): see "Leftovers deleted" above; full list in `git diff --diff-filter=D --name-only 58acd81..HEAD`.
- `src/routes/__root.tsx` · `vite.config.ts` · `src/lib/runtime/turn.ts` · `tsconfig.json` · `package.json` · `package-lock.json`
- `scripts/build-desktop.mjs` · `scripts/prove-token.mjs` · `scripts/prove-quit.mjs` (comment) · `scripts/sidecar-token-hygiene.mjs` · `src/lib/sidecar-token.test.ts` · `src/lib/localbot.test.ts`
- New: `scripts/excise-gates.mjs` · `scripts/prove-excise.mjs` · `src/lib/excision.test.ts`
- **Not touched:** `src/components/localbot/chat.tsx`, `src/runtime/*`, `src/start.ts`, `src/lib/runtime/sidecar-token*`, `src/lib/quit-flush*`, `src/lib/pending-writes.ts`, `desktop/*`, `dsh/*`, every `src/lib/fs/*`, `src/lib/harness/*`, every other `scripts/prove-*.mjs`.

### Prove it

Command:

```
npm ci && npm test && npm run typecheck && npm run lint && npm run prove:excise
```

Pass looks like:

```
# tests 8
# pass 8
…
# tests 497
# pass 497
# fail 0
[prove-excise] ok: gone: src/lib/auth
[prove-excise] ok: gone: src/lib/db.ts
[prove-excise] ok: gone: src/lib/app-data
…
[prove-excise] ok: src/components: no import of lib/auth, lib/db, app-data or the hosted chain
[prove-excise] ok: src/ scripts/ desktop/ vite.config.ts: no better-auth / kysely / pg / pglite / jose / api.x.ai / XAI_API_KEY
[prove-excise] ok: package.json deps: no better-auth / kysely / pg / @types/pg / pglite / jose
[prove-excise] ok: build is "vite build" (got "vite build")
[prove-excise] ok: npm test no longer runs scripts/**/*.test.mjs
…
[prove-excise] ok: __root.tsx: plain <Outlet /> then <Scripts />
[prove-excise] ok: vite.config.ts: sidecarTokenPlugin() before tanstackStart()
[prove-excise] ok: turn.ts: no hosted chain, no API key
[prove-excise] ok: chat.tsx keeps runAgentTurn
[prove-excise] ok: src/start.ts keeps the Stage 17 token gate (and CSRF)
[prove-excise] ok: desktop/main.mjs keeps the Stage 18 quit coordinator
[prove-excise] ok: dsh pin is exact 0.1.2-alpha.5 (got 0.1.2-alpha.5)
[prove-excise] ok: dsh/localbot-fs.mjs unchanged (sha256 pin)
[prove-excise] 103 static gates, 0 failing
[prove-excise] ok: vite build produced .output/server/index.mjs (no db:migrate step ran)
[prove-excise] ok: the built server bundle carries no template strings
[prove-excise] sidecar up on http://127.0.0.1:18790/ (pid …)
[prove-excise] ok: GET / serves the LocalBot document
[prove-excise] ok: /?install=1 is the app, not the template's install tutorial
[prove-excise] ok: server-fn table loaded: foldersGet is in the build manifest
[prove-excise] ok: runSingleCompletion is not in the build manifest
[prove-excise] ok: foldersGet without the token → 401 NO_TOKEN (got 401 NO_TOKEN)
[prove-excise] ok: foldersGet with the launch token → 200 with folders (got 200)
[prove-excise] ok: getAiStatus with the token → 200, reports the Safety switch, names no hosted engine (got 200)
[prove-excise] ok: sidecar stopped; :18790 closed
STAGE19_EXCISE_PASS static+live build=vite-build sidecar=401-NO_TOKEN
```

Then, to show Stages 17 / 18 are still green on this tree:

```
npm run prove:quit -- --static && npm run prove:token
```

→ `STAGE18_QUIT_PASS static` and `STAGE17_TOKEN_PASS static+live …/401-NO_TOKEN/…/dev-401/dev-200`.

`prove:excise` exits 1 on any of the 103 static gates (listed under "Gates" above) or when: `vite build` fails; the built bundle contains a template string; the sidecar does not answer within 60 s; `GET /` is not the LocalBot document or links `/__grok`; `/?install=1` renders the install tutorial; `/__grok/manifest.webmanifest` is served as `application/manifest+json`; `foldersGet` / `getAiStatus` are missing from the manifest or `runSingleCompletion` is present; a call without the token is not `401 NO_TOKEN`; a call with it is not `200`; the port does not close. Flags: `--static` (source gates only, ~1 s), `--build` (rebuild `.output` first). ~5 s with an existing `.output`, ~10 s with the build.

### How I test in the app

1. `npm run dev` → `http://127.0.0.1:8080/` renders LocalBot; the page has no PWA manifest link and no sign-in anywhere (there never was one wired up — the template's auth was never mounted; it just sat in the tree).
2. `npm run desktop` — unchanged behaviour: main mints the token, spawns `npm run dev` (which no longer routes through `with-app-env.mjs`), the window loads, chat goes through `runAgentTurn`. UNVERIFIED on this box (no Electron launch this stage); `prove:token`'s dev gate exercised the new `dev` invocation.
3. Settings → Safety → turn "Allow hosted demo" on: the header badge now reads `Hosted demo is on — chat refused until Settings → Safety turns it off` and a turn is refused by `harness-launch.ts` exactly as in Stage 4. Nothing ever calls `api.x.ai` — the code is gone, not switched off.

### Ready for

Nothing scheduled. Next only after I say GO.

## Stage 18 — Quit flush (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 18". Invariants still checked by `src/lib/quit-flush.test.ts` and `npm run prove:quit` (`--static` passes on this branch): only the coordinator calls `stopChildren()`, `before-quit` holds the quit, `flushChatSaves(): Promise<void>`, tracked writes, `chat.tsx` keeps `runAgentTurn`, token gate, dsh / ACP pins, `localbot-fs.mjs` sha256. Stage 19 touched none of `desktop/`; the `prove-quit.mjs` edit is a comment.

## Stage 17 — Sidecar token (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 17". Invariants still checked by `src/lib/sidecar-token.test.ts` and `npm run prove:token` (full live pass on this branch): one token per launch, env + preload-argv hand-offs only, `401 NO_TOKEN` / `BAD_TOKEN`, `503 SERVER_NO_TOKEN`, CSRF kept, no dev / packaged branch, hygiene over every shipped file (now `src`, `desktop`, `scripts`, `dsh` — `server/` no longer exists). Stage 19 removed `server/middleware/grok-pwa.ts` from the "must not serve the token" list because the file is gone; `__root.tsx` and `index.tsx` are still checked.

## Stage 16 — Channels · Stage 15 — Routines · Stage 14 — Plugins · Stage 13 — Mic · Stage 12 — Identity · Stage 11 — Chrome (previous stages; still true)

Full text in `LOCALBOT_HANDOFF.md`. `prove:channels`, `prove:routines`, `prove:plugins` (live) and `prove:chrome` / `prove:identity` / `prove:mic` (`--static`) all pass on this branch; none of their files changed in Stage 19.

## Stage 10 — Mac unsigned package (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 10". `build.mac.identity` is `null`: every installer is **UNSIGNED**, nothing notarized. Latest `.dmg` remains the **Stage 13 rebuild**, sha256 `e843f469c7762f4f6a7fe404c053057384185f7dc4b9121f4218c8cb9fdd5061` — built *before* Stages 14–19; a packaged app on this tree is UNVERIFIED. **No `.dmg` was rebuilt in Stage 19**, by rule.

## Stage 8 — Installers + two-process share (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Update after Stage 8". Invariants still checked by `src/lib/desktop-packaging.test.ts`: every installer is **UNSIGNED** — `mac.identity` is `null`, no certificate, nothing notarized, and no handoff line may claim otherwise. The Linux AppImage / `.deb` were last built in Stage 8 on a Linux host; not rebuilt here. Stage 19 changed `scripts/build-desktop.mjs` in one line (it calls `vite` directly instead of through the deleted `with-app-env.mjs`); it was not run.
