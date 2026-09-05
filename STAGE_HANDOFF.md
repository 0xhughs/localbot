## Stage 17 — Sidecar token

Date: 2026-09-05
Branch: `stage-17-sidecar-token` (PR → `main`, off `d906076` = merge of PR #16)
Host: Linux 6.12 (cloud VM, x64) · Node v22.14.0 · Electron 36.3.1 under `xvfb-run` · no GGUF staged · no `.dmg` / NSIS built

Status words: WORKS / STUB / NOT BUILT / UNVERIFIED. This stage is the **per-launch sidecar token only**. Before it, `127.0.0.1:18790` (and `:8080` in dev) answered every `createServerFn` POST to any local process that typed an `Origin` header — verified live at the start of the stage: `curl -X POST …/_serverFn/<foldersGet id> -H 'Origin: http://127.0.0.1:18790' -H 'x-tsr-serverFn: true'` → `200 {"folders":null,…}`. Now the same request is `401 { code: "NO_TOKEN" }`. `runAgentTurn`, `chat.tsx`, `dsh/localbot-fs.mjs` (sha256 `0bb5593a…2b0a6`), dsh `0.1.2-alpha.5`, ACP `1.4.0`, the four scopes, host index, plugins, routines, channels, mic, chrome — untouched. Quit-flush, `src/lib/auth/` / `db.ts` removal, pnpm bundle, NSIS, `.dmg`, UI chrome — not touched, by rule.

### Built

- **Token: WORKS.** `desktop/sidecar-token.mjs` — `mintSidecarToken()` = `randomBytes(32).toString("hex")`, a new one every call; `isSidecarToken` (64 lowercase hex); `takeSidecarToken()` reads `LOCALBOT_SIDECAR_TOKEN` **once** into an in-memory slot (`Symbol.for("localbot.sidecarToken")`) and **deletes it from `process.env`**, so dsh / llama-server / whisper children the sidecar spawns never inherit it; `verifySidecarToken(expected, presented)` → `NO_TOKEN` for missing / empty, `BAD_TOKEN` for anything not byte-equal, compared with `crypto.timingSafeEqual` against a same-length probe. Nothing reads or writes a file. Not in `localbot-config.json`, not in the host index, not a setting.
- **Every server function behind it: WORKS.** New `src/start.ts` = the TanStack Start instance: `functionMiddleware: [sidecarTokenMiddleware]` — global, so all ~97 `createServerFn`s in `src/lib/fs/server.ts`, `src/lib/runtime/{harness,turn,model-server,stt-server,plugins,routines,channels}.ts` are covered without editing them, and a new one cannot opt out. `src/lib/runtime/sidecar-token-middleware.ts`: `.client` attaches `x-localbot-token` from `readBrowserSidecarToken()`; `.server` dynamic-imports `sidecar-token.server.ts` → `assertSidecarRequest()` → `setResponseStatus(401)` + `throw new SidecarAuthError(code)` before `next()`. `src/lib/sidecar-token-model.ts` (browser-safe): `SidecarAuthError { code: "NO_TOKEN" | "BAD_TOKEN" | "SERVER_NO_TOKEN", status: 401 | 503 }`. A `createSerializationAdapter` for it in `start.ts` keeps `code` on the wire, so the 401 body literally contains `"code"… "NO_TOKEN"` and the renderer gets a real `SidecarAuthError`. Defining a start instance drops Start's implicit CSRF middleware, so `createCsrfMiddleware({ filter: serverFn })` is re-added in `requestMiddleware` — a token **without** an Origin / Sec-Fetch-Site still gets 403; the token, not the Origin, is the gate. **No env knob, no `NODE_ENV` / `import.meta.env.DEV` / `LOCALBOT_PACKAGED` branch anywhere near the check** (test + prove grep for it). A server started **without** a token refuses every function with `503 SERVER_NO_TOKEN` instead of serving them open.
- **Packaged / `npm run desktop`: WORKS (dev Electron on this box; packaged `.app` UNVERIFIED — no `.dmg` rebuilt).** `desktop/main.mjs`: `const sidecarToken = mintSidecarToken()` once per launch → `startSidecar()` env `LOCALBOT_SIDECAR_TOKEN` → `desktop/sidecar.mjs` refuses to bind (`exit 1`, says why) unless the env holds 64 hex → the Nitro server takes it into memory. The window gets it through `webPreferences.additionalArguments: ["--localbot-sidecar-token=<hex>"]` → `desktop/preload.cjs` reads `process.argv` (sandboxed preload, CJS) → `window.localbotDesktop.sidecarToken`. **Never in the HTML, never over IPC, never on disk.** A sidecar already answering on `:18790` that main did **not** start is now refused with `LocalBot is already running (… is taken). Quit the other LocalBot first.` (its token is unknown; a dead UI would be worse). In dev, main passes the same token to the `npm run dev` it spawns; when a dev server it did **not** start is already on `:8080`, the preload gets `null` and the renderer falls back to the document's token (below).
- **`npm run dev` in a normal browser: WORKS, with the stated limit.** `scripts/sidecar-token-plugin.mjs` (`apply: "serve"`, before `tanstackStart()` in `vite.config.ts`): the Vite dev server **is** the serving process, so it takes the env token if a launcher handed one down, else mints its own; then for `GET` requests whose **`Host` is loopback** (`127.0.0.1` / `localhost` / `::1`, any port) and that accept HTML, it inserts `<meta name="localbot-sidecar-token" content="…">` right after `<head>`. A LAN `Host` (`10.1.2.3:8080`, `172.30.0.2:8080`, `0.0.0.0:8080`) gets the same document **without** the meta. `readBrowserSidecarToken()` order: preload bridge → meta → `""` (→ `NO_TOKEN`). **Honest limit: anyone who can `GET http://127.0.0.1:8080/` can read the dev token.** The packaged sidecar on `:18790` never runs this plugin and its HTML carries neither the token nor the meta (checked live). `vite preview` (Nitro build on `:8081`) has no injection either: without `LOCALBOT_SIDECAR_TOKEN` in its env it answers `503 SERVER_NO_TOKEN`; it is not a LocalBot flow.
- **Live, this box.** Built sidecar (`LOCALBOT_DESKTOP_BUILD=1 vite build` → `node desktop/sidecar.mjs`) on `127.0.0.1:18790`, temp `LOCALBOT_DATA_DIR`: no header → `401 NO_TOKEN`; empty → `401 NO_TOKEN`; 64 × `a` → `401 BAD_TOKEN`; another launch's token → `401 BAD_TOKEN`; the launch token → `200` with `folders`; `foldersSet` (a write) without the header → `401` and `localbot-config.json` unchanged; token but no Origin → `403`. Without the env: `exit 1`, nothing on `:18790`. Dev server: loopback `GET /` has the meta in `<head>`, LAN / `0.0.0.0` Host does not; no header `401`, the packaged launch's token `401 BAD_TOKEN`, the document's token `200`. **Real Electron window (xvfb, Playwright `_electron`)**, three ways: packaged mode (`LOCALBOT_PACKAGED=1`, main spawns the sidecar) → `localbotDesktop.sidecarToken` = 64 hex, no meta in the document, 5 / 5 server-fn calls `200`, and a `curl` to the same `:18790` with no header **while the window was open** → `401 NO_TOKEN`, with the window's token → `200`; `npm run desktop`-style (main spawns `npm run dev`) → bridge token === document meta token, 5 / 5 `200`; Electron against a dev server it did not start → bridge `null`, meta present, 5 / 5 `200`. `npm run prove:chrome` (Stage 11's Electron proof, untouched) → `STAGE11_CHROME_PASS` with the gate on.
- **Tests + proof.** `npm test` → 203 (scripts) + **369** (TS, was 347) pass; `npm run lint` + `npm run typecheck` clean. New `src/lib/sidecar-token.test.ts` (22): mint / take-once + env delete / verify codes / `timingSafeEqual` / argv / loopback matrix / meta injection; renderer read order; `SidecarAuthError` statuses; the dev plugin (`wantsDevToken`, `devTokenInjector` via `write` and `end`, content-length dropped, non-HTML / LAN / POST untouched); `start.ts` global + CSRF + adapter; middleware shape; **no dev / packaged branch**; `main.mjs` mints per launch, two env hand-offs, argv only, refuses a foreign sidecar, no IPC / disk; `sidecar.mjs` exits 1; `preload.cjs` argv prefix equals `SIDECAR_TOKEN_ARG`; `build-desktop.mjs` ships `sidecar-token.mjs`; **repo hygiene** (`scripts/sidecar-token-hygiene.mjs`: no bypass knob, no `…token… "<64 hex>"`, no `LOCALBOT_SIDECAR_TOKEN = "literal"` in 199 shipped files; no `prove-*.mjs` sends an empty token or empties `functionMiddleware`); `chat.tsx` keeps `runAgentTurn`; pins; `localbot-fs.mjs` sha256. New `scripts/prove-token.mjs` (`npm run prove:token`): the static gates, then the **real Nitro build** on `:18790` (rebuilds `.output` when missing or pre-token) with a fresh `mintSidecarToken()` and the matrix above, then the **real `vite dev`** on a free loopback port. Every existing prove script still runs unchanged: `prove:plugins` / `prove:routines` / `prove:channels` import the sidecar modules in-process (no HTTP, nothing to bypass); the Electron ones drive the real window, which now carries the header.

### Not built

- **Quit-flush handshake — NOT BUILT** (Stage 18, only after GO).
- **Deleting `src/lib/auth/` / `db.ts`, bundling pnpm, Windows NSIS, `.dmg` rebuild, UI chrome — NOT BUILT, by rule.** The packaged `.app` with the token is therefore **UNVERIFIED**; the packaged *mode* (Electron main + `sidecar.mjs` + the Nitro build, `LOCALBOT_PACKAGED=1`) is what ran here.
- **`vite preview` in a browser — NOT a supported path.** No document injection outside `vite dev`; the Nitro build answers `503 SERVER_NO_TOKEN` without the env.
- **The `additionalArguments` entry is visible in the renderer process's command line** (`ps`) to the same OS user, as is any process's environment — accepted by design (the token is per launch, not a long-lived secret).
- **Second LocalBot instance — refused, not shared.** Two packaged launches on one machine used to share `:18790`; the second now shows "already running" and quits. Two-machine / NAS — UNVERIFIED as before.
- **Kill of the dev-spawned `vite` tree when Electron exits — pre-existing** (`npm` → `with-app-env` → `vite`; main kills the `npm` process only). Not Stage 17.

### Files changed

- `desktop/sidecar-token.mjs` (new) · `desktop/main.mjs` (mint, env, `additionalArguments`, refuse foreign sidecar, `ensureDevUi` returns `{ url, tokenForWindow }`) · `desktop/sidecar.mjs` (exit 1 without token) · `desktop/preload.cjs` (`sidecarToken` from argv)
- `src/start.ts` (new: `createStart` with `functionMiddleware`, CSRF, `SidecarAuthError` adapter) · `src/lib/runtime/sidecar-token-middleware.ts` (new) · `src/lib/runtime/sidecar-token.server.ts` (new) · `src/lib/sidecar-token-model.ts` (new, browser-safe) · `src/lib/desktop-bridge.ts` (`sidecarToken?` on the bridge type) · `src/routeTree.gen.ts` (generated: registers `startInstance`)
- `scripts/sidecar-token-plugin.mjs` (new, dev server) · `vite.config.ts` (registers it before `tanstackStart()`) · `scripts/sidecar-token-hygiene.mjs` (new) · `scripts/prove-token.mjs` (new) · `scripts/build-desktop.mjs` (stage + assert `sidecar-token.mjs`) · `src/lib/sidecar-token.test.ts` (new, 22) · `package.json` (`test` list, `prove:token`)
- **Not touched:** `src/components/localbot/chat.tsx`, `src/runtime/harnessAdapter.ts`, `dsh/localbot-fs.mjs`, `dsh/localbot-acp.cordis.yml`, dsh / ACP pins, every existing server function file, `src/lib/auth/`, `src/lib/db.ts`, every `scripts/prove-*.mjs` from earlier stages.

### Prove it

Command:

```
npm test && npm run prove:token
```

Pass looks like:

```
ℹ pass 369
[prove-token] ok: src/start.ts: sidecarTokenMiddleware is global functionMiddleware (every createServerFn)
[prove-token] ok: src/start.ts: CSRF request middleware kept alongside the token
[prove-token] ok: server module: token from memory, constant-time verify, refuses when the server has none
[prove-token] ok: 32 random bytes, timingSafeEqual compare
[prove-token] ok: the serving process removes the token from its env after taking it (children never inherit it)
[prove-token] ok: no dev / packaged branch around the gate
[prove-token] ok: no bypass knob / hardcoded token / pinned env in 199 shipped files, no gate-skip in 11 prove scripts
[prove-token] ok: main.mjs mints one token per launch
[prove-token] ok: main.mjs passes it to the window through preload argv only
[prove-token] ok: sidecar.mjs exits 1 without a token
[prove-token] ok: preload.cjs exposes localbotDesktop.sidecarToken from argv
[prove-token] ok: only the vite dev server can put the token in a document
[prove-token] ok: chat.tsx keeps runAgentTurn
[prove-token] ok: dsh pin is exact 0.1.2-alpha.5
[prove-token] ok: dsh/localbot-fs.mjs unchanged (sha256 pin)
[prove-token] ok: sidecar.mjs without LOCALBOT_SIDECAR_TOKEN exits 1 and says why (exit 1)
[prove-token] ok: nothing listens on :18790 after the refused boot
[prove-token] sidecar up on http://127.0.0.1:18790/ with a fresh token (pid …)
[prove-token] ok: the packaged sidecar's HTML carries neither the token nor the dev meta tag
[prove-token] ok: spoofed Origin + x-tsr-serverFn, no token → 401 NO_TOKEN (got 401 NO_TOKEN)
[prove-token] ok: empty header → 401 NO_TOKEN (got 401 NO_TOKEN)
[prove-token] ok: wrong 64-hex header → 401 BAD_TOKEN (got 401 BAD_TOKEN)
[prove-token] ok: another launch's token → 401 BAD_TOKEN (got 401 BAD_TOKEN)
[prove-token] ok: the launch token → 200 with folders (got 200)
[prove-token] ok: foldersSet (a write) without the header → 401 and nothing on disk changed (got 401)
[prove-token] ok: token but no Origin / Sec-Fetch-Site → 403 (CSRF layer still on; got 403)
[prove-token] ok: dev: loopback GET / carries the meta tag in <head> (the dev server minted its own token)
[prove-token] ok: dev: GET / with a LAN Host serves the document without the meta tag
[prove-token] ok: dev: no header → 401 NO_TOKEN (got 401 NO_TOKEN)
[prove-token] ok: dev: the document's token → 200 (got 200)
STAGE17_TOKEN_PASS static+live no-token-boot/html-clean/401-NO_TOKEN/401-BAD_TOKEN/200-with-token/write-refused/csrf-kept/dev-loopback-meta/dev-401/dev-200
```

`prove:token` exits 1 when: a server function answers anything but `401` to a missing / empty / wrong header (with a spoofed Origin + `x-tsr-serverFn`, the headers that used to be enough); the right header does not get `200`; `sidecar.mjs` binds without a token; the packaged HTML carries the token or the meta tag; the dev server puts the meta in a non-loopback document, or a loopback tab cannot call a function with the document's token; `src/start.ts` stops registering `sidecarTokenMiddleware` as global `functionMiddleware` or drops CSRF; the middleware / server module / `start.ts` / `sidecar-token.mjs` grow a `NODE_ENV` / `import.meta.env` / `LOCALBOT_PACKAGED` branch; any shipped file has a bypass knob, a `…token… "<64 hex>"`, or `LOCALBOT_SIDECAR_TOKEN` pinned to a literal; any `prove-*.mjs` sends an empty token or empties the middleware; `main.mjs` stops minting per launch, stops passing the env, hands the token to the window any way but argv, or reuses a foreign sidecar; `preload.cjs` stops exposing it; `chat.tsx` drops `runAgentTurn`; dsh / ACP pins float; `localbot-fs.mjs` changes. Flags: `--static` (source only), `--no-dev` (skip the `vite dev` gate), `--build` (force the Nitro rebuild). ~5 s with a current `.output`, ~1 min when it rebuilds.

Hand check, packaged mode on this box (`.output` built), run exactly:

```
export LOCALBOT_SIDECAR_TOKEN=$(node -e 'import("./desktop/sidecar-token.mjs").then(m=>console.log(m.mintSidecarToken()))')
LOCALBOT_SERVER_DIR=$PWD/.output LOCALBOT_DATA_DIR=/tmp/lb node desktop/sidecar.mjs &      # → Listening on: http://127.0.0.1:18790/
ID=$(grep -B1 'functionName: "foldersGet_createServerFn_handler"' .output/server/_ssr/ssr.mjs | grep -o '[0-9a-f]\{64\}')
curl -s -o /dev/null -w '%{http_code}\n' -X POST "http://127.0.0.1:18790/_serverFn/$ID?createServerFn" -H 'Origin: http://127.0.0.1:18790' -H 'x-tsr-serverFn: true'
curl -s -o /dev/null -w '%{http_code}\n' -X POST "http://127.0.0.1:18790/_serverFn/$ID?createServerFn" -H 'Origin: http://127.0.0.1:18790' -H 'x-tsr-serverFn: true' -H "x-localbot-token: $LOCALBOT_SIDECAR_TOKEN"
```

Pass: `401` then `200` (the 401 body contains `"NO_TOKEN"`). No body is needed for `foldersGet`; a hand-typed JSON body would be a Seroval 500 before the gate, so leave it off. `LOCALBOT_SIDECAR_TOKEN= LOCALBOT_SERVER_DIR=$PWD/.output node desktop/sidecar.mjs` → `LocalBot sidecar refused to start: LOCALBOT_SIDECAR_TOKEN is missing or not 32 hex bytes. Start it from LocalBot.`, exit 1.

### How I test in the app

1. `npm run desktop` — the window opens as before; roster, chats, folders, plugins, routines, channels all load (every one is a server function behind the gate). DevTools console: `window.localbotDesktop.sidecarToken` is 64 hex. `document.querySelector('meta[name=localbot-sidecar-token]')` — present in dev (same value), **absent** in packaged mode.
2. While it runs, from a terminal: `curl -X POST http://127.0.0.1:8080/_serverFn/<any id>?createServerFn -H 'Origin: http://127.0.0.1:8080' -H 'x-tsr-serverFn: true' -H 'content-type: application/json' -d '{}'` → `401` with `"NO_TOKEN"` in the body. Packaged: same against `:18790`.
3. `npm run dev` alone, open `http://127.0.0.1:8080/` in Chrome → the app works (the token came with the document). Open `http://<your LAN ip>:8080/` → the page renders but every call is `401 NO_TOKEN` (no meta for a non-loopback Host). That is the documented dev limit, not a bug.
4. Start a second packaged LocalBot while one runs → `LocalBot is already running (http://127.0.0.1:18790/ is taken). Quit the other LocalBot first.`

### Ready for

Stage 18 (quit-flush) only after I say GO.

## Stage 16 — Channels (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 16". Invariants still checked by `src/lib/channels.test.ts` and `npm run prove:channels` (both pass on this branch): channels outside every scope, one `runAgentTurn` per member, BUSY queue of one, `chat.tsx` keeps `handoffTask` + `runAgentTurn`, `localbot-fs.mjs` sha256 pin. Stage 17 changed none of it; every `channels*` server function is now behind the token like the rest.

## Stage 15 — Routines (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 15". Invariants still checked by `src/lib/routines.test.ts` and `npm run prove:routines`: `routines/` outside every scope, exclusive claim, ticker + Run now through `runAgentTurn`, deny-only permissions, Confirm-only proposal write, footer order Routines > Plugins > Settings, `localbot-fs.mjs` sha256 pin. Stage 16 touched none of it (`routineRunner.ts` passes no reply sink, so routine output still lands in the agent's own chat).

## Stage 14 — DSH / Cordis plugins (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 14". Invariants still checked by `src/lib/harness/plugins.test.ts` and `npm run prove:plugins`: Plugins above Settings (Stage 15 adds Routines **above** Plugins; the Stage 14 gate still passes), `dsh plugin --profile acp add|remove` against the isolated `DSH_HOME`, managed `disabled: true` block, `--dump-config` verification, guard + rollback, BUSY restart rule, `localbot-fs.mjs` sha256 pin, `runAgentTurn` kept. Stages 15 / 16 touched none of it.

## Stage 13 — Click-to-toggle mic (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 13". Invariants still checked by `src/lib/audio/voice-toggle.test.ts` and `npm run prove:mic`: click-to-toggle Mic with the hold fallback, live timer, Escape cancels, 60 s cap → stop → transcribe, no send path from voice, `runAgentTurn` kept, exact dsh / ACP pins. Stages 15 / 16 touched none of it.

## Stage 12 — Agent identity (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 12". Invariants still checked by `src/lib/agent-identity.test.ts` and `npm run prove:identity`: Edit profile through `agentUpdateProfile` (rename → row → forgetSession → agent.json / AGENTS.md), colour painting through `agentColorHex`, sections in `localbot-agents.json`, `+ New agent` → scripted setup chat, Advanced → modal, `runAgentTurn` kept, exact dsh / ACP pins. Stages 15 / 16 touched none of it.

## Stage 11 — Desktop chrome + composer (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 11". Invariants still checked by `src/lib/desktop-chrome.test.ts` and `npm run prove:chrome`: `desktop/preload.cjs` (CommonJS under `sandbox: true`), `hiddenInset` + `trafficLightPosition {14, 12}`, the native Edit menu roles, `+ New agent` above the search above the roster with Settings in the footer (Stages 14 / 15 add Plugins and Routines **above** Settings in that footer; the Stage 11 gate still passes), the 6-line native `<textarea>` composer, jump-to-latest, `runAgentTurn` kept, exact dsh / ACP pins.

## Stage 10 — Mac unsigned package + whisper-cli + proofs (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 10". Invariants the Stage 10 proof (`npm run prove:mac`) still reads from this file: `build.mac.identity` is `null`, so the Mac build is **UNSIGNED** and not notarized — no line here may claim otherwise; the `.dmg` sha256 must be listed here. Stage 10's artifact: `LocalBot-0.1.0-mac-arm64.dmg` sha256 `4eff4caab6daafabfaf8f49f6137c4d23a7150ac84c5e2fee4e6c3f9cc9b34e6` (whisper-cli v1.9.2 built from source, Metal 3B / 7B, real-mic hold-to-talk `STAGE10_MAC_MIC_PASS`). The Stage 11 rebuild was `6e90420c1fa798cb221428fe9532f36aa8abb188b034b4d89b89fb8ccd61c297`. **Stage 13 rebuild** (latest, `npm run build:desktop`): `LocalBot-0.1.0-mac-arm64.dmg` sha256 `e843f469c7762f4f6a7fe404c053057384185f7dc4b9121f4218c8cb9fdd5061` — UNSIGNED, not notarized, `dist/` not committed. `npm run prove:mac` on that app (node-less PATH, real USB microphone, TCC `granted`): click → `jfk.wav` out of the speakers → click → composer `"Hello. And so my fellow Americans, ask not what your country can do for you. Ask what you can do for your country."` (`Heard 13.6 s · base.en · 282 ms`), then the hold fallback `Heard 11.5 s`, 0 messages sent, clip deleted → `STAGE10_MAC_MIC_PASS tcc=granted gesture=click-click heard_s=13.6 model=base.en ms=282 … hold_fallback=WORKS … dmg_sha256=e843f469c7762f4f6a7fe404c053057384185f7dc4b9121f4218c8cb9fdd5061`. **No `.dmg` was rebuilt in Stages 14 / 15 / 16**; the Plugins, Routines and Channels screens in a packaged app are UNVERIFIED.

## Stage 8 — Installers + two-process share (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Update after Stage 8". Invariants still checked by `src/lib/desktop-packaging.test.ts`: every installer is **UNSIGNED** — `mac.identity` is `null`, no certificate, nothing notarized, and no handoff line may claim otherwise. The Linux AppImage / `.deb` were last built in Stage 8 on a Linux host; not rebuilt here.
