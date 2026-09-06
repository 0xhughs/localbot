## Stage 18 — Quit flush

Date: 2026-09-06
Branch: `stage-18-quit-flush` (PR → `main`, off `7ec9d87` = merge of PR #18)
Host: Linux 6.12 (cloud VM, x64) · Node v22.14.0 · Electron 36.3.1 under `xvfb-run` · no GGUF staged · no `.dmg` / NSIS built

Status words: WORKS / STUB / NOT BUILT / UNVERIFIED. This stage is the **quit handshake only**. The bug it fixes, confirmed on `7ec9d87` before any edit: `desktop/main.mjs` ran `stopChildren()` synchronously in `before-quit` and `window-all-closed`, while the renderer's only flush was `pagehide → void saveChatNow` (a plain fetch, no `keepalive`, nothing awaited). Cmd+Q killed the sidecar (or the dev `vite` that hosts the server functions) **before any window closed**, so a chat line typed inside the 400 ms debounce was lost every time; the title-bar X raced the same fetch. Routines killed this way left `{id}.running` + `lastStatus: "running"` on disk. `runAgentTurn`, `chat.tsx`, `dsh/localbot-fs.mjs` (sha256 `0bb5593a…2b0a6`), dsh `0.1.2-alpha.5`, ACP `1.4.0`, the Stage 17 token gate, the four scopes, plugins, routines, channels, mic, chrome — untouched.

### Built

- **Coordinator: WORKS.** `desktop/quit-flush.mjs` — `createQuitCoordinator({ requestFlush, stopChildren, quit, timeoutMs = QUIT_FLUSH_TIMEOUT_MS })`, `QUIT_FLUSH_TIMEOUT_MS = 2000`. `requestQuit(reason)` → `requestFlush(reason)` → `await Promise.race([ack, timeout])` → `stopChildren()` → `quit(outcome)`. `stopChildren` is only called from inside that one promise after the race settles; there is no other path to it. Re-entrant calls (Cmd+Q while the X is already flushing, `window-all-closed` after the window we destroyed) return the **same** promise — one `stopChildren`, one `quit`. `requestFlush` returning `false` (no window yet: quit during boot or after an error dialog) skips the wait entirely. A `requestFlush` that throws counts as "not asked". Late acks are counted (`lateAcks`), never acted on. Pure Node, no Electron import, so it is unit-tested directly.
- **main.mjs: WORKS.** `before-quit` → `if (quitReady) return; event.preventDefault(); quitCoordinator.requestQuit("before-quit")`. The coordinator's `quit` sets `quitReady = true` and calls `app.quit()` again; that second pass falls through. `window-all-closed` → `requestQuit("window-all-closed")` (joins). New `win.on("close")` → `if (quitReady) return; event.preventDefault(); requestQuit("window-close").then(() => win.destroy())`, so the title-bar X (`localbot:close` → `win.close()`), the OS close button and Cmd+W all go through the handshake. `requestRendererFlush` sends `localbot:flush { reason, timeoutMs }` to every live `webContents`; `ipcMain.on("localbot:flushDone")` → `quitCoordinator.flushDone(summary)`. **`stopChildren()` is called by nothing but the coordinator** — the test and the proof count the occurrences. Cmd+Q no longer kills the sidecar before windows close (proved live below).
- **Preload: WORKS.** `desktop/preload.cjs` adds `onFlushRequest(fn)` (`ipcRenderer.on("localbot:flush")`, returns the unsubscribe) and `flushDone(summary)` (`ipcRenderer.send("localbot:flushDone")`). The Stage 17 `sidecarToken` argv read is byte-for-byte unchanged; the token never travels over these channels (tested). `src/lib/desktop-bridge.ts` types both as optional so a pre-Stage-18 bridge is a no-op.
- **Renderer flush: WORKS.** `src/lib/quit-flush-core.ts` (pure; `flushWith`, `withCap`, `capForRequest`, `installQuitFlushWith`, `RENDERER_FLUSH_CAP_MS = 1800`) + `src/lib/quit-flush.ts` (binds the app: `appFlushDeps`, `flushForQuit`, `installQuitFlush`), mounted once in `shell.tsx` (`useEffect(() => installQuitFlush(), [])`). On `localbot:flush`: (1) **cancel every Harness turn in flight** — chat, channel and routine turns all register from `runAgentTurn` (`registerTurn({ turnId, botId, cancel: onAbort })`, forgotten in `finally`) and cancel is the same `harnessCancel` → ACP `session/cancel` the Stop button uses; (2) **`routinesFinish(id, "stopped", null)` for every routine this window has claimed** (`runRoutine` registers the claim between `routinesClaim` and `routinesFinish`), so `{id}.running` is released instead of left stale; (3) **`flushChatSaves()`** — now `Promise<void>`: clears every debounce, issues those saves, and awaits them **plus every `chatSave` already on the wire** (`chatSavesInFlight`); (4) **awaits every other tracked sidecar write** — `chatSave`, `channelsAppend`, `statePatchAgent`, `statePatchIndex`, `sectionCreate/Rename/Delete`, `stateMigrate`, `stateReset` are bound through `tracked()` from `src/lib/pending-writes.ts` (same names at every call site; the earlier stages' source gates still match). All under `Promise.allSettled` and a 1800 ms cap (200 ms inside main's 2 s so the ack beats main's own timeout), then `flushDone(summary)` — sent in `finally`, so a throwing flush still answers instead of leaving main on the timeout. Two requests during one flush share one flush and one ack.
- **`pagehide`: fallback for the bare browser only.** `store.ts` keeps a `pagehide` listener that returns immediately when `window.localbotDesktop.onFlushRequest` exists; only `npm run dev` in Chrome (where nothing can wait for the tab) still fires the saves fire-and-forget. No `keepalive` fetch was added anywhere (gated).
- **Live, this box.** `npm run prove:quit`: the real coordinator drives a real Node child that lands its write 300 ms after being asked — `requestFlush → ack → stopChildren(file present) → quit(acked after 301 ms)`; the **counter-example** (ask, then kill at once — the pre-Stage-18 order) leaves the file **missing**; a child that never acks → `stopChildren` after 2003 ms, no hang. Then **real dev Electron under xvfb** (`desktop/main.mjs`, main spawns `npm run dev`, temp `LOCALBOT_DATA_DIR`, Playwright `_electron`), twice: `+ New agent` → type `QuitterX` → Enter → **3 ms later** `window.localbotDesktop.close()` (title-bar X → `win.close()`); and `QuitterQ` → **2 ms later** `app.quit()` (Cmd+Q). In both, the chat file did **not** yet contain the line when quit was requested (debounce pending); main logged `[quit] window-close: renderer flushed in 6 ms` / `[quit] before-quit: renderer flushed in 8 ms`; Electron exited with code 0 within 15 s; `chats/{id}.json` holds the line; `localbot-agents.json` intact. The window's bridge had `onFlushRequest` / `flushDone` and the Stage 17 token was still a 64-hex argv value.
- **Tests + proof.** `npm test` → 203 (scripts) + **408** (TS, was 369) pass; `npm run lint` + `npm run typecheck` clean. New `src/lib/quit-flush.test.ts` (39): coordinator ack / timeout / re-entry / no-renderer / throwing `requestFlush` / stray ack / default 2000; `main.mjs` gates (only the coordinator calls `stopChildren()`, `before-quit` holds with `preventDefault` + `quitReady` and never calls `stopChildren` / `app.quit` itself, `window-all-closed` and `win.on("close")` route through `requestQuit`, timeout is the shared constant, Stage 17 mint / env / argv / sandbox kept, `build-desktop` asserts `quit-flush.mjs` in the unpacked desktop dir); preload names = coordinator constants + token bridge unchanged; pending-writes registries; `flushWith` order / counts / cap / never-throws; `installQuitFlushWith` ack, error-ack, coalescing, no-bridge no-op; `store.ts` `flushChatSaves(): Promise<void>` + awaited in-flight + tracked bindings + `pagehide` guard + no `keepalive`; adapter / runner registration; `chat.tsx` keeps `runAgentTurn`; `start.ts` keeps `functionMiddleware: [sidecarTokenMiddleware]`; dsh / ACP pins; `localbot-fs.mjs` sha256. Mutation-checked on this box: each of (a) `before-quit` calling `stopChildren()` directly, (b) `flushChatSaves` back to `void`, (c) the coordinator killing before the ack, (d) `chat.tsx` dropping `runAgentTurn`, (e) `functionMiddleware: []` fails both `npm test` and `prove:quit`. Every earlier proof still passes: `prove:token` (full, live), `prove:routines`, `prove:channels`, `prove:plugins`, `prove:chrome --static`, `prove:identity --static`, `prove:mic --static`.

### Not built

- **Packaged `.app` / AppImage quit — UNVERIFIED.** No installer was rebuilt (by rule). The packaged *mode* (Electron main + `sidecar.mjs`) was not launched here either; what ran live is `npm run desktop`'s path (main spawns `npm run dev`, kills it through the same `stopChildren`). The handshake code is identical in both modes; `build-desktop.mjs` now asserts `app.asar.unpacked/desktop/quit-flush.mjs` ships.
- **A quit while a real Harness turn streams — UNVERIFIED live.** No GGUF on this box. The cancel path is the Stop button's `harnessCancel` (unchanged, proved in Stage 4) and the registration is unit-tested; a real llama-server was not running during the Electron gate.
- **A crash / SIGKILL of Electron main itself** is not a quit and gets no flush — as before. The `.running` stale-lock takeover (Stage 15) still covers routines in that case.
- **Renderer not yet loaded when quit is requested** → main waits the full 2 s (no one answers), then quits. Accepted; bounded.
- **`vite` outliving the dev-spawned `npm`** — pre-existing (Stage 17 note), not Stage 18. The proof reaps it by pid between scenarios.
- **Template excision, pnpm bundle, NSIS, `.dmg`, UI chrome, `src/lib/auth/` / `db.ts` removal — NOT BUILT, by rule.**

### Files changed

- `desktop/quit-flush.mjs` (new) · `desktop/main.mjs` (coordinator, `quitReady`, `before-quit` / `window-all-closed` / `win.on("close")`, `localbot:flush` / `localbot:flushDone`) · `desktop/preload.cjs` (`onFlushRequest`, `flushDone`)
- `src/lib/pending-writes.ts` (new) · `src/lib/quit-flush-core.ts` (new) · `src/lib/quit-flush.ts` (new) · `src/lib/store.ts` (tracked bindings, `flushChatSaves(): Promise<void>`, `chatSavesInFlight`, `pendingChatSaveCount` / `inFlightChatSaveCount`, `pagehide` guard) · `src/lib/desktop-bridge.ts` (bridge type) · `src/runtime/harnessAdapter.ts` (`registerTurn` / `forgetTurn`) · `src/runtime/routineRunner.ts` (`registerRoutineClaim`, `runClaimedRoutine` split) · `src/components/localbot/shell.tsx` (`installQuitFlush`)
- `src/lib/quit-flush.test.ts` (new, 39) · `scripts/prove-quit.mjs` (new) · `scripts/build-desktop.mjs` (layout assert) · `package.json` (`test` list, `prove:quit`)
- **Not touched:** `src/components/localbot/chat.tsx`, `dsh/localbot-fs.mjs`, `dsh/localbot-acp.cordis.yml`, dsh / ACP pins, `src/start.ts`, every server function file, `src/lib/auth/`, `src/lib/db.ts`, every `scripts/prove-*.mjs` from earlier stages.

### Prove it

Command:

```
npm test && npm run prove:quit
```

Pass looks like:

```
ℹ pass 408
[prove-quit] ok: main.mjs: stopChildren() is called by nothing but the coordinator
[prove-quit] ok: main.mjs: before-quit holds the quit (preventDefault + quitReady) and asks the coordinator; no stopChildren / app.quit of its own
[prove-quit] ok: main.mjs: window-all-closed joins the coordinator
[prove-quit] ok: main.mjs: the first win.close() (title-bar X / Cmd+W) is held for the flush
[prove-quit] ok: main.mjs: coordinator built with stopChildren, a quitReady quit and QUIT_FLUSH_TIMEOUT_MS (2000 ms)
[prove-quit] ok: preload.cjs: onFlushRequest / flushDone on the coordinator's IPC names
[prove-quit] ok: store.ts: flushChatSaves(): Promise<void> (was void)
[prove-quit] ok: store.ts: chatSave is tracked (pending-writes)
…
[prove-quit] ok: chat.tsx keeps runAgentTurn
[prove-quit] ok: src/start.ts keeps the Stage 17 token gate as global functionMiddleware
[prove-quit] ok: dsh pin is exact 0.1.2-alpha.5
[prove-quit] ok: dsh/localbot-fs.mjs unchanged (sha256 pin)
[prove-quit]   order: requestFlush:window-close → ack → stopChildren(file present) → quit(acked after 301 ms)
[prove-quit] ok: live: with the handshake the child's file is on disk when stopChildren() runs
[prove-quit] ok: live: the counter-example (kill right after asking, the pre-Stage-18 order) loses the write — that was the bug
[prove-quit] ok: live: no ack → stopChildren after 2003 ms (bounded by 2000), no hang
[prove-quit] [X] typed → title-bar X (win.close) in 3 ms; chat file did NOT yet have the line (debounce pending)
[prove-quit] ok: [X] main waited for the renderer's flushDone before stopping children ([quit] window-close: renderer flushed in 6 ms)
[prove-quit] ok: [X] chats/bot_….json holds the line typed 3 ms before quit (it was still debounced when quit was requested)
[prove-quit] [Q] typed → app.quit() (Cmd+Q) in 2 ms; chat file did NOT yet have the line (debounce pending)
[prove-quit] ok: [Q] main waited for the renderer's flushDone before stopping children ([quit] before-quit: renderer flushed in 8 ms)
[prove-quit] ok: [Q] chats/bot_….json holds the line typed 2 ms before quit (it was still debounced when quit was requested)
STAGE18_QUIT_PASS static+live coordinator/child-file-before-kill/counter-example/2s-bound electron=dev-window close=debounce-pending/3ms cmdq=debounce-pending/2ms packaged=UNVERIFIED
```

`prove:quit` exits 1 when: `main.mjs` calls `stopChildren()` anywhere but the coordinator, `before-quit` stops holding the quit (`preventDefault` + `quitReady`) or calls `stopChildren` / `app.quit` itself, `window-all-closed` or the first `win.close()` bypass `requestQuit`, the timeout becomes a literal; the coordinator kills the child before the ack (the child's file is missing at `stopChildren`), waits less than 2000 ms for a silent renderer, or hangs; `preload.cjs` drops `onFlushRequest` / `flushDone` or the IPC names drift from `quit-flush.mjs`; `flushChatSaves` is `void` again or stops awaiting the in-flight saves; any of the nine write bindings is no longer `tracked`; `pagehide` becomes the Electron path or a `keepalive` fetch appears; the flush stops cancelling turns / finishing routines as `stopped`; `shell.tsx` stops mounting it; the Electron window quits without a `renderer flushed` line, falls back to the 2 s timeout, does not exit within 15 s, or the chat file lacks the line typed inside the debounce; `chat.tsx` drops `runAgentTurn`; `start.ts` drops `functionMiddleware: [sidecarTokenMiddleware]`; dsh / ACP pins float; `localbot-fs.mjs` changes. Flags: `--static` (source only), `--no-electron` (skip the window). Without an `electron` binary or a display (and no `xvfb-run`) the Electron gate prints `electron=UNVERIFIED` and the rest still has to pass. ~5 s without Electron, ~2 min with (two `vite` starts).

### How I test in the app

1. `npm run desktop` — type a line to any agent, press Enter, and within half a second press **Cmd+Q** (or click the title-bar **X**). Relaunch: the line is in the chat. Before Stage 18 it was gone (Cmd+Q) or usually gone (X).
2. Same, but with `Routines → Run now` in flight: quit. Expected: the routine's `{dataDir}/routines/{id}.running` is gone and `lastStatus` is `stopped`, not `running` (`routinesFinish(id, "stopped")` from the flush). UNVERIFIED live on this box — no GGUF, so no routine turn ran; the registration and the call are unit-tested.
3. Terminal while the app runs: `ps` shows the sidecar (`sidecar.mjs`, or `vite` in dev). Quit → the console (`npm run desktop`) shows `[quit] before-quit: renderer flushed in N ms` **before** the sidecar exits. If the renderer is wedged you get `[quit] …: no flush ack after 2000 ms — quitting anyway` and the app still quits.

### Ready for

Stage 19 (template excision) only after I say GO.

## Stage 17 — Sidecar token (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 17". Invariants still checked by `src/lib/sidecar-token.test.ts` and `npm run prove:token` (both pass on this branch, live): one token per launch, env + preload-argv hand-offs only, `401 NO_TOKEN` / `BAD_TOKEN`, `503 SERVER_NO_TOKEN`, CSRF kept, no dev / packaged branch, hygiene over every shipped file (now including `desktop/quit-flush.mjs`, `src/lib/quit-flush*.ts`, `src/lib/pending-writes.ts`, `scripts/prove-quit.mjs`). Stage 18 added two IPC channels (`localbot:flush`, `localbot:flushDone`) to the preload; the token is not on either (tested).

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
