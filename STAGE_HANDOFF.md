## Stage 11 — Desktop chrome + composer

Date: 2026-09-04
Branch: `stage-11-chrome-composer` (PR → `main`, off `20fbb58` = merge of PR #10)
Host: Darwin 25.5.0 (macOS 26.5.2) · arm64 (Mac mini, Apple M4 Pro) · Electron 36.3.1 · Node v24.12.0 on PATH (repo tooling), bundled Node v22.23.2 in the packaged app

Status words: WORKS / STUB / NOT BUILT / UNVERIFIED. This stage touched the shell and the composer only. DeepSeek Harness (`runAgentTurn`, dsh `0.1.2-alpha.5`, ACP `1.4.0`), the four scopes, the Stage 3 watch, the host index, hold-to-talk (still hold, not click-to-toggle), the New-agent modal and the Settings dialog are unchanged. Still **UNSIGNED**, not notarized, no Windows work.

### Built

- **Title bar / traffic lights: WORKS.** Root cause found and fixed, not papered over: `desktop/main.mjs` already had `frame: false`, `titleBarStyle: "hiddenInset"`, `trafficLightPosition: { x: 14, y: 12 }` and a 36 px drag strip (`desktop-titlebar.tsx`), but the strip only renders when `window.localbotDesktop` exists — and the preload was `preload.mjs` under `sandbox: true`. A sandboxed preload is executed as a plain script; an ESM `import` never loads there. Measured before the change: `typeof window.localbotDesktop === "undefined"` with `preload.mjs`, `"object"` with the same file as CommonJS. So the strip never rendered, the sidebar's first row (Wordmark + Settings) became the top row and sat under the lights. Fix: `desktop/preload.mjs` → **`desktop/preload.cjs`** (`git mv`, one line changed: `const { contextBridge, ipcRenderer } = require("electron")`), `main.mjs` loads `preload.cjs`, `build.files` + `asarUnpack` ship `desktop/**/*.cjs`, `build-desktop.mjs` asserts `app.asar.unpacked/desktop/preload.cjs` after pack. Sandbox and context isolation stay on; the bridge still exposes only `platform`, `setTitle`, window controls, `onSettings`, `pickFolder`, `revealPath`. The strip keeps one title-bar system (no second one added); on darwin its left gutter is now 72 px (`data-testid="traffic-light-gutter"`; the lights span x 14 → 66). Measured live: lights at (14, 12), strip 36 px tall, Wordmark row starts at y = 36 — below the lights.
- **Sidebar: WORKS.** Order is now: Wordmark row (alone, under the strip) → **`+ New agent`** (same `NewAgentDialog`) → **roster search** → roster (+ Archived group as before) → notices → **Settings** in the footer (`ghost`, icon + label). Settings is no longer beside the Wordmark. Measured live at 1280×820: `+ New agent` y = 84, search y = 132, roster y = 172, Settings y = 772 of a sidebar ending at 820. The mobile (`md:hidden`) header in `shell.tsx` is unchanged.
- **Roster search: WORKS.** `src/lib/roster-search.ts` (`filterRoster`, `rosterMatches`, `normalizeRosterQuery`): case-insensitive, every whitespace-separated word must appear in `name + job`; empty / whitespace query returns the input list unchanged (identity), so the roster and the Archived group behave exactly as before. Both groups are filtered; a miss shows "No agents match “q”."; Escape / ✕ clears. Live: `edit` → Editor · `launch brief` (a job) → Writer · `zzqx` → "No agents match" · empty → everyone.
- **Composer: WORKS.** Still a native `<textarea>` (no contenteditable, nothing intercepts keys). `rows={1}`, `useLayoutEffect` measures `scrollHeight` and sets the height through `composerHeight()` (`src/lib/chat-layout.ts`, `COMPOSER_MAX_LINES = 6`): grows per line, caps at `6 × line-height + padding`, then `overflow-y: auto` with `.scrollbar-thin` on the field. `.scrollbar-thin` got a transparent track / corner, a 2 px transparent border on the thumb (`background-clip: padding-box`) so it sits off the field edge, and a hover colour — thin and low-contrast in the dark theme. Live: 1 line 32 px · 3 lines 72 px · 6 lines 132 px · 12 lines **132 px** with inner scroll (`scrollHeight 252 / clientHeight 132`), `overflow-y: hidden` at ≤ 6 lines.
- **Cmd A / X / C / V / Z: WORKS (native).** `buildMenu()` in `main.mjs` gained an **Edit** submenu with the roles `undo`, `redo`, `cut`, `copy`, `paste`, `selectAll`. On macOS those items are native and act through the responder chain (`selectAll:` …) — that is the only way Cmd-shortcuts reach a field in an Electron app, and the app menu had none before. No clipboard code in React. Live, through the same native path the menu items use (`Menu.sendActionToFirstResponder`), with the window key: selectAll selected 0…25 of the composer → copy put `"clipboard round trip 4711"` on the system clipboard → cut emptied the field → paste restored it → undo emptied it again. (Playwright's own `Meta+A` would not have proven anything: it injects macOS editing commands itself.)
- **Jump to latest: WORKS.** `isPinnedToBottom()` (`chat-layout.ts`, 32 px slack) runs on the transcript's `onScroll`. The auto-scroll effect (message count, last message length, chips, pending, running) only fires while pinned; a `↓` button (`data-testid="jump-to-latest"`, `aria-label="Jump to latest"`) is rendered only while unpinned and pins again on click. Switching agents re-pins and starts at the bottom. Live on a 40-message chat: pinned at start (no `↓`) → `scrollTop 0` unpins and shows `↓` → click → `3338 + 593 / 3931` (bottom), `↓` hidden.
- **Dev affordance:** `main.mjs` honours a pre-set `LOCALBOT_DATA_DIR` **only when not packaged**, so `prove:chrome` runs the dev Electron against a temp data dir instead of `~/Library/Application Support/LocalBot`. Packaged behaviour is unchanged (always the real AppData).
- **Tests.** `npm test` → 203 (scripts) + **222** (TS suite, was 207) pass; `npm run lint` and `npx tsc --noEmit` clean. New `src/lib/desktop-chrome.test.ts` (15) fails when: Settings is in the sidebar header or the title strip; `+ New agent` is (also) in the footer or below the search / roster; `main.mjs` lacks the Edit roles, `hiddenInset` or `trafficLightPosition`; the preload is ESM again / not unpacked; `chat.tsx` drops `runAgentTurn`, becomes a contenteditable, brings back `rows={2}`, loses the 6-line cap or the `↓`; the dsh / ACP pins float. Plus pure tests for `composerHeight`, `isPinnedToBottom`, `filterRoster`. `scopes.test.ts` / `watch.test.ts` now read `preload.cjs` and allow exactly one `require("electron")`. Negative check done: putting Settings back next to the Wordmark fails both the test and `prove:chrome` (`FAIL: Settings is still next to the Wordmark in the sidebar header`).

### Not built

- **Click-to-toggle mic** (Stage 13), **Edit profile panel, sections, conversational create, plugins, routines, channels** — NOT BUILT, by rule.
- **Windows / Linux packaging of this stage: UNVERIFIED.** The Edit menu roles and the CJS preload are platform-neutral, and on non-darwin the strip renders its own min / max / close buttons as before, but no Windows or Linux build was made here.
- **Signing / notarization: NOT BUILT** (identity `null`, unchanged).
- **Cmd-shortcuts under a physical keyboard: UNVERIFIED by machine** — the proof drives the menu items' native selectors; a human pressing the keys is step 5 below.
- The jump-to-latest proof scrolls a seeded 40-message chat; it does not run a model turn (no GGUF needed), so "new streamed tokens while unpinned do not yank the reader" is covered by the effect's `if (!pinned) return` and its test, not by a live turn — UNVERIFIED live.

### Files changed

- `desktop/preload.mjs` → `desktop/preload.cjs` (renamed; `require("electron")`, comment) · `desktop/main.mjs` (preload path, Edit menu roles, dev `LOCALBOT_DATA_DIR` override)
- `src/components/localbot/desktop-titlebar.tsx` (72 px gutter, test ids) · `sidebar.tsx` (order, search, footer Settings) · `chat.tsx` (pinned tracking, `↓`, auto-grow textarea) · `src/styles.css` (`.scrollbar-thin` track / thumb)
- `src/lib/roster-search.ts`, `src/lib/chat-layout.ts` (new, pure) · `src/lib/desktop-chrome.test.ts` (new) · `src/lib/fs/scopes.test.ts`, `src/lib/fs/watch.test.ts` (preload path + CJS allowance)
- `scripts/prove-chrome.mjs` (new) · `scripts/build-desktop.mjs` (asar layout check) · `package.json` (`test` list, `prove:chrome`, `build.files`, `asarUnpack`) · `ARCHITECTURE.md` (preload name)
- `STAGE_HANDOFF.md`, `LOCALBOT_HANDOFF.md`

### Prove it

Command:

```
npm test && npm run prove:chrome
```

Pass looks like:

```
ℹ pass 222
[prove-chrome] static gates ok: preload.cjs + sandbox | hiddenInset + trafficLightPosition | Edit roles | no Settings in title strip | sidebar order + / search / roster / Settings | runAgentTurn kept | dsh 0.1.2-alpha.5
[prove-chrome] traffic lights at (14, 12) · gutter to 84px · strip 36px · Wordmark row starts y=36
[prove-chrome] sidebar: + New agent y=84 · search y=132 · roster y=172 · Settings y=772 (sidebar bottom 820)
[prove-chrome] roster search: "edit" → Editor · "launch brief" (job) → Writer · miss → "No agents match" · empty → Editor, Writer
[prove-chrome] composer: 1 line 32px · 3 lines 72px · 6 lines 132px · 12 lines 132px (inner scroll 252/132, …)
[prove-chrome] Edit menu roles reach the composer through the native path: WORKS (selectAll → copy "clipboard round trip 4711" → cut → paste → undo "") · items undo, redo, cut, copy, paste, selectall
[prove-chrome] jump to latest: pinned at start (no ↓) → scrollTop 0 shows ↓ → click → bottom (…), ↓ hidden
STAGE11_CHROME_PASS bridge=object platform=darwin lights=14,12 strip_h=36 wordmark_y=36 settings_y=772 composer_lines=1:32 6:132 12:132 edit_roles=undo,redo,cut,copy,paste,selectall edit_shortcuts=WORKS data_dir=temp
```

`prove:chrome` launches the dev Electron (`node_modules/electron` + `desktop/main.mjs`, which starts vite on :8080 itself) against a temp `LOCALBOT_DATA_DIR` seeded with two agents and a 40-message chat; it steals focus for ~2 s for the Edit-menu gate and restores the clipboard afterwards. It exits 1 when the bridge is missing, the Wordmark row starts above the bottom of the traffic lights, the strip's gutter does not clear them, a Settings button is in the strip or the sidebar header, Settings is not in the bottom 64 px of the sidebar, `+ New agent` is not above the search above the roster, the search does not filter by name and by job, the composer does not grow / does not cap at 6 lines / does not scroll inside, the Edit menu lacks a role or the native path does not reach the field, or the `↓` shows while pinned / fails to pin. `npm run prove:chrome -- --static` runs the source gates only; `-- --screenshot /tmp/stage11.png` also saves a picture; `-- --app dist/desktop/mac-arm64/LocalBot.app` runs against the packaged app (empty AppData → seeded full run, seed removed; existing AppData → chrome-only gates, nothing written → `STAGE11_CHROME_PACKAGED_PASS`).

Packaged app on this Mac: see "Packaged check" below.

### How I test in the app

1. `npm run desktop` (or open the rebuilt `LocalBot.app`). The three traffic lights sit alone in the dark strip; the LocalBot mark is on the first sidebar row *below* that strip; nothing else is in that corner. Drag the strip — the window moves.
2. Sidebar, top to bottom: mark · **+ New agent** (opens the same modal as before) · **Find by name or job** · roster · Archived (if any) · **Settings** at the very bottom. Type part of an agent's name, then part of a job: the list narrows as you type; a nonsense word says "No agents match"; ✕ or Escape brings everyone back.
3. Composer: type Shift+Enter six times and keep going — the field grows to six lines, then a thin dark scrollbar appears inside it and it stops growing. Enter still sends (nothing changed there).
4. In the composer press Cmd+A, Cmd+C, Cmd+X, Cmd+V, Cmd+Z — select all / copy / cut / paste / undo work natively. The **Edit** menu is visible in the macOS menu bar.
5. Open a chat with enough history to scroll. Scroll up: a round **↓** appears at the bottom-centre of the transcript; new messages no longer pull you down. Click it (or scroll to the bottom yourself): it disappears and the transcript follows again.

### Packaged check

The `.dmg` built by Stage 10 predates `preload.cjs` and cannot show the strip. `npm run build:desktop` was rerun on this Mac after these changes (exit 0, UNSIGNED, `codesign` identity `null`):

```
sha256  6e90420c1fa798cb221428fe9532f36aa8abb188b034b4d89b89fb8ccd61c297  LocalBot-0.1.0-mac-arm64.dmg
```

`Contents/Resources/app.asar.unpacked/desktop/preload.cjs` is in the bundle. `npm run prove:chrome -- --app dist/desktop/mac-arm64/LocalBot.app` against this Mac's real AppData (which already has a config, so chrome-only, nothing written):

```
[prove-chrome] packaged app …/LocalBot.app/Contents/MacOS/LocalBot | AppData …/Library/Application Support/LocalBot already has a config — chrome-only gates, nothing is written or seeded
[prove-chrome] traffic lights at (14, 12) · gutter to 84px · strip 36px · Wordmark row starts y=36
[prove-chrome] sidebar: + New agent y=84 · search y=132 · roster y=172 · Settings y=772 (sidebar bottom 820)
STAGE11_CHROME_PACKAGED_PASS bridge=object platform=darwin lights=14,12 strip_h=36 wordmark_y=36 settings_y=772 app=…/dist/desktop/mac-arm64/LocalBot.app
```

So the bridge loads and the strip renders **in the packaged app** — WORKS. Nothing committed under `dist/`; not signed, not notarized.

### Ready for

Stage 12 (profile / sections / create flow) only after you say GO.

## Stage 10 — Mac unsigned package + whisper-cli + proofs (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 10". Invariants the Stage 10 proof (`npm run prove:mac`) still reads from this file: `build.mac.identity` is `null`, so the Mac build is **UNSIGNED** and not notarized — no line here may claim otherwise; the `.dmg` sha256 must be listed here. Stage 10's artifact: `LocalBot-0.1.0-mac-arm64.dmg` sha256 `4eff4caab6daafabfaf8f49f6137c4d23a7150ac84c5e2fee4e6c3f9cc9b34e6` (whisper-cli v1.9.2 built from source, Metal 3B / 7B, real-mic hold-to-talk `STAGE10_MAC_MIC_PASS`). The Stage 11 rebuild is `6e90420c1fa798cb221428fe9532f36aa8abb188b034b4d89b89fb8ccd61c297` (see "Packaged check" above); `dist/` is not committed. Stage 10's live gates (whisper build, TCC, real mic) were not rerun this stage — UNVERIFIED on the rebuilt `.dmg`, unchanged code paths.

## Stage 8 — Installers + two-process share (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Update after Stage 8". Invariants still checked by `src/lib/desktop-packaging.test.ts`: every installer is **UNSIGNED** — `mac.identity` is `null`, no certificate, nothing notarized, and no handoff line may claim otherwise. The Linux AppImage / `.deb` were last built in Stage 8 on a Linux host; not rebuilt here.
