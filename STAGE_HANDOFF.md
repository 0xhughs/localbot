## Stage 15 — Routines

Date: 2026-09-05
Branch: `stage-15-routines` (PR → `main`, off `1f1de14` = merge of PR #14)
Host: Darwin 25.5.0 (macOS 26.5.2) · arm64 (Mac mini, Apple M4 Pro) · Electron 36.3.1 · Node v24.12.0 on PATH

Status words: WORKS / STUB / NOT BUILT / UNVERIFIED. This stage is **routines only**: a disk record per routine in `{dataDir}/routines/{id}.json` (outside every scope root, like `chats/`), host-side gates + claim / finish, a 30 s renderer ticker that runs due routines through the **existing** `runAgentTurn` (no second Harness loop), a Routines screen in the sidebar footer, and a Confirm / Dismiss card for routines the model proposes in chat. No channels, no launchd / Task Scheduler, no plugin catalog change, no installers. `runAgentTurn`, `dsh/localbot-fs.mjs` (sha256 pin `0bb5593a…2b0a6`), `dsh/localbot-acp.cordis.yml`, `resolveScopePath`, dsh `0.1.2-alpha.5`, ACP `1.4.0`, the four scopes, host index, Plugins, mic and chrome are unchanged. Still **UNSIGNED**, not notarized, no `.dmg` rebuilt this stage.

### Built

- **Record on disk: WORKS.** `src/lib/fs/routines.ts`: `routinesDir()` = `{LOCALBOT_DATA_DIR}/routines/`, one `{id}.json` per routine (`id, name, agentId, instructions, schedule, enabled, createdAt, lastRunAt, lastStatus, lastError`), written with `atomicWriteJson` (temp + rename, previous copy kept as `.bak`). `createRoutine` / `updateRoutine` refuse an empty name (`BAD_NAME`), an agent id not in the roster (`UNKNOWN_AGENT`), an **archived** target (`ARCHIVED`), a bad schedule (`BAD_SCHEDULE`). `assertRoutinesOutsideScopes(folders)` runs **first** on every create / update / list: if `routines/` sits inside the employee root, company root, or any agent scope it throws `OUTSIDE_SCOPE` and nothing is written. Live (dev, browser, `LOCALBOT_DATA_DIR=/tmp/lb15-ui-data`): create from the dialog → `routines/rt_9e6929b88cd9.json` on disk with the exact fields; delete removes the file and its `.bak`.
- **Schedules: WORKS.** `src/lib/routines-model.ts` (browser-safe, no Node imports): `manual`, `every N minutes` (also accepts `every 2 hours`), `daily HH:MM` local, and a **minimal 5-field cron** (`M H DOM MON DOW`; `*`, lists, ranges, `*/step`, `1-5`; DOM / DOW OR-rule when both are restricted; `nextRunAt` scans minute-by-minute up to 366 days). `parseScheduleText` accepts the same strings the model is told to emit; `describeSchedule` renders `Every 15 minutes` / `Daily at 09:00` / `Cron 0 9 * * 1-5` / `Manual`. `scheduleDue(routine, now)` = enabled ∧ not manual ∧ not currently claimed ∧ `nextRunAt(schedule, lastRunAt ?? createdAt) ≤ now`. Because the next beat is computed from the **last run**, three daily beats missed while the app was closed collapse into **one** catch-up on open — no backlog replay (test + prove).
- **Gates on the host: WORKS.** `src/lib/harness/routines.ts`: `routinesDue(now)` returns due routines and a per-routine skip reason: `DISABLED`, `ARCHIVED` (agent archived or gone), `DISCONNECTED` (employee root offline) / `NOT_CONFIGURED` (no folders yet), `BUSY` (`HarnessManager` has an active turn for that agent), `ALREADY_RUNNING` (claimed by another window). `routinesClaim(id, { manual })` re-checks the same gates (Run now is refused for archived / disconnected / busy too), then takes an **exclusive** `{id}.running` marker (`O_EXCL`) and writes `lastStatus: "running"`, `lastRunAt: now` to the JSON — a second window reads the claim from disk and cannot double-fire (prove: second claim → `ALREADY_RUNNING`; a claimed routine is not due for another window). A `running` older than `CLAIM_STALE_MS` (2 h, e.g. the window died mid-turn) is treated as stale and can be re-claimed. `routinesFinish(id, "ok" | "error" | "stopped", error)` writes the status (+ `lastError`), releases the marker.
- **Runner through `runAgentTurn`: WORKS.** `src/runtime/routineRunner.ts` + `useRoutineTicker(diskLoaded)` in `shell.tsx`: on open and every `ROUTINE_TICK_MS` (30 s) the renderer calls `routinesDue`, then for each due routine `routinesClaim` → appends the system line `Routine "<name>" ran (<schedule>[, Run now]): <instructions>` to that agent's chat → **`runAgentTurn({ botId, userText: instructions })`, the same call `send()` makes** → the assistant output lands in the agent's durable chat (`chats/{botId}.json`) like any typed message → `routinesFinish(id, ok | error | stopped)`. **Run now** in the dialog is `runRoutine(id, { manual: true })` — the identical path. The runner never imports the Harness server functions or the manager class (test + prove gate: no second loop). Live: Run now → `routines/rt_9e6929b88cd9.json` now has `lastRunAt`, `lastStatus: "error"`, `lastError: "No verified GGUF on disk."` (no model staged on this box, so `runAgentTurn`'s own model check is the error), and `chats/bot_d05f116b.json` gained `system | Routine "Morning inbox" ran (Daily at 09:00, Run now): Say hello and stop.` + `assistant | No verified GGUF on disk.`. Ticker: an `every 1 minute` routine written to disk with a 5-minute-old `createdAt` fired unattended at the next tick (`Routine "Tick test" ran (Every minute)` in the chat, status persisted).
- **Permissions during a routine: Deny, locked. WORKS.** `ROUTINE_PERMISSION_DECISION = "deny"`. While a routine's turn is running, every ungranted permission request is answered **deny** and a system note is appended: `Routine "<name>": denied <summary> — routines never grant permissions. Grant it in this chat first (Allow for this chat), then run again.` No unattended Allow path exists (test greps the runner for `"allow"`). Grants the employee already made in that chat still apply, because the turn goes through the same `runAgentTurn`.
- **Chat proposal card: WORKS.** Standing instructions (`standingInstructionsText` in `src/lib/harness/index.ts`) gained one line (`ROUTINE_BLOCK_INSTRUCTION`): the model may reply with a fenced ```` ```localbot-routine ```` JSON block `{ name, instructions, schedule }` and cannot create, edit or run routines itself (`routines/` is outside every scope, so the file tools cannot reach it either). `chat.tsx` `AssistantBody` splits those blocks out of the markdown (`splitRoutineBlocks`) and renders a **Routine proposal** card (name · schedule · agent · instructions) with **Dismiss** / **Confirm** and the note `Nothing is saved until you confirm.` **Only Confirm calls `routinesCreate`** (exactly one write path in `chat.tsx`, inside the confirm handler — test + prove); Dismiss writes nothing. The decision is stored on the message (`routineProposals`) so the card shows `Saved as routines/{id}.json` / `Dismissed — nothing was saved.` after reload; a malformed block renders as an error card with no write. Live: seeded assistant message → card → Confirm → `routines/rt_1be96d182a29.json` (`cron 0 9 * * 1-5`) + system line `Saved routine "Weekday check-in" (Cron 0 9 * * 1-5) for Writer → routines/rt_1be96d182a29.json. Runs while LocalBot is open.`
- **UI: WORKS.** Sidebar footer order **Routines** (`data-testid="sidebar-routines"`, CalendarClock) **above Plugins above Settings** (Stage 11 / 14 footer gates still pass). `RoutinesDialog` (`src/components/localbot/routines.tsx`, mounted in `shell.tsx`, same dark dialog): list with agent, schedule, **next run**, **last run + status** (`never / running / ok / error / stopped`, error text shown), Enable / Disable toggle, **Run now**, Edit, Delete; New / Edit form with name, agent (archived agents excluded), instructions, schedule kind (Manual / Every N minutes / Daily at / Cron) with the parsed description or the `BAD_SCHEDULE` message inline. The dialog states the rules: *Routines only run while LocalBot is open. A beat missed while the app was closed runs once on the next open — no backlog replay, no login item. Ungranted permission requests during a routine are denied. The model can propose a routine in chat; nothing is saved until you press Confirm.* `UiState` gained `showRoutines` + `routinesLastTickAt` (`types.ts`, `store.ts`); `ChatMessage` gained `routineProposals`.
- **Server fns.** `src/lib/runtime/routines.ts`: `routinesList`, `routinesCreate`, `routinesUpdate`, `routinesDelete`, `routinesDue`, `routinesClaim`, `routinesFinish` (`createServerFn`, same `HarnessManager` singleton as chat for the BUSY check). `routines.tsx` / `chat.tsx` / `routineRunner.ts` import only these plus the browser-safe `routines-model.ts`; `routines.tsx` never reads routines from `localStorage` (gate).
- **Tests.** `npm test` → 203 (scripts) + **318** (TS, was 290) pass; `npm run lint` + `npm run typecheck` clean. New `src/lib/routines.test.ts` (28): dsh / ACP pins + `localbot-fs.mjs` sha256; footer order; `RoutinesDialog` + `useRoutineTicker` mounted; `chat.tsx` keeps `runAgentTurn`, one write path inside Confirm, Dismiss writes nothing; `routineRunner.ts` uses `runAgentTurn` with the instructions as `userText`, no Harness imports, `deny` only, claims first / finishes last; schedule parse / describe / `nextRunAt` / cron table; proposal parser inert; `OUTSIDE_SCOPE` under each scope root; empty name / unknown / archived refused; atomic write + `.bak`; a **fresh Node process** reads the record back; `routinesDue` gates (BUSY, disabled, archived, DISCONNECTED, not configured); exclusive claim + stale re-claim; missed beats → one catch-up; standing-instruction line present.
- **Proof.** New `scripts/prove-routines.mjs` (`npm run prove:routines`): static source gates, then live on a temp `LOCALBOT_DATA_DIR` + temp scope roots with a real roster (`Writer`, archived `Old`): refuse `routines/` under each scope root → create → **read back in a fresh `node` process** (React state alone fails here) → refuse empty / unknown / archived → BUSY skip via a fake active turn, then due again → disabled / archived / DISCONNECTED skipped **and** Run now refused → claim (running on disk, marker, second claim `ALREADY_RUNNING`, not due for another window) → finish → interval re-due → three missed daily beats → **one** catch-up → proposal block parsed, nothing written, malformed → no write → delete removes record + `.bak`. `--static` runs the source gates only.

### Not built

- **Background routines when the app is closed — NOT BUILT, by rule.** No launchd / login item / Task Scheduler. The ticker lives in the renderer while a window is open; a beat missed while closed runs once on the next open.
- **Channels / multi-agent rooms, plugin catalog changes, installers, signing — NOT BUILT, by rule.**
- **Per-routine permission grants — NOT BUILT.** Routines deny every ungranted request; the employee grants in the chat first.
- **Routine run history — NOT BUILT.** Only `lastRunAt` / `lastStatus` / `lastError` on the record; the full output is in the agent's chat.
- **Cron extras — NOT BUILT.** No names (`MON`, `@daily`), no seconds, no `L` / `W` / `#`; 5 numeric fields only.
- **Packaged-app Routines screen — UNVERIFIED** (no `.dmg` rebuilt). **Windows / Linux — UNVERIFIED.** **A successful (non-error) routine turn — UNVERIFIED on this box** (no GGUF staged; the path was proven up to `runAgentTurn`'s model check, and the ok / stopped finishes are covered by tests + prove with a fake turn).

### Files changed

- `src/lib/routines-model.ts` (new, browser-safe: types, `parseSchedule` / `parseScheduleText` / `describeSchedule` / `parseCron` / `nextRunAt` / `scheduleDue`, `ROUTINE_BLOCK_LANG` / `ROUTINE_BLOCK_INSTRUCTION` / `splitRoutineBlocks`, `CLAIM_STALE_MS`, `ROUTINE_TICK_MS`, `ROUTINE_PERMISSION_DECISION`)
- `src/lib/fs/routines.ts` (new: `routinesDir`, `assertRoutinesOutsideScopes`, CRUD with `atomicWriteJson`, `acquireRoutineLock` / `releaseRoutineLock`, `markRoutineClaimed` / `markRoutineFinished`) · `src/lib/harness/routines.ts` (new: `gateRoutine`, `routinesDue`, `routinesClaim`, `routinesFinish`) · `src/lib/runtime/routines.ts` (new server fns)
- `src/runtime/routineRunner.ts` (new: `runRoutine`, `tickRoutines`, `useRoutineTicker`) · `src/components/localbot/routines.tsx` (new `RoutinesDialog`)
- `src/components/localbot/chat.tsx` (`AssistantBody` + proposal card) · `sidebar.tsx` (Routines above Plugins) · `shell.tsx` (mount + ticker) · `src/lib/harness/index.ts` (standing-instruction line) · `src/lib/types.ts`, `src/lib/store.ts` (`showRoutines`, `routinesLastTickAt`, `routineProposals`)
- `src/lib/routines.test.ts` (new, 28) · `scripts/prove-routines.mjs` (new) · `package.json` (`test` list, `prove:routines`)
- `STAGE_HANDOFF.md`, `LOCALBOT_HANDOFF.md`

### Prove it

```
npm test && npm run prove:routines
```

Pass looks like:

```
ℹ pass 318
[prove-routines] ok: footer order is Routines > Plugins > Settings
[prove-routines] ok: Run now is runRoutine() — the same path as the ticker
[prove-routines] ok: routineRunner uses runAgentTurn
[prove-routines] ok: routineRunner has no second Harness loop
[prove-routines] ok: ungranted permissions during a routine are denied
[prove-routines] ok: chat.tsx: exactly one write path, inside Confirm
[prove-routines] ok: routines/ under emp refused with OUTSIDE_SCOPE (got OUTSIDE_SCOPE)
[prove-routines] ok: empty name refused (BAD_NAME)
[prove-routines] ok: unknown agent refused (UNKNOWN_AGENT)
[prove-routines] ok: archived target refused (ARCHIVED)
[prove-routines] ok: record on disk at routines/rt_….json
[prove-routines] ok: record has exactly id, name, agentId, instructions, schedule, enabled, createdAt, lastRunAt, lastStatus, lastError
[prove-routines] ok: fresh process read back "Every minute" from …/routines
[prove-routines] ok: BUSY: a running turn keeps it out of due (BUSY)
[prove-routines] ok: BUSY: Run now is refused too
[prove-routines] ok: archived agent: Run now refused (ARCHIVED)
[prove-routines] ok: DISCONNECTED: Run now refused
[prove-routines] ok: second claim refused (ALREADY_RUNNING)
[prove-routines] ok: three missed daily beats → due once on open
[prove-routines] ok: no backlog replay: the other two missed beats are gone
[prove-routines] ok: parsing the proposal wrote nothing (Confirm is the only write)
STAGE15_ROUTINES_PASS static+live outside/record-fresh-process/refuse/busy/disabled/archived/disconnected/claim/finish/once/proposal-inert
```

`prove:routines` exits 1 when: `sidebar-routines` is missing or not above Plugins above Settings; `RoutinesDialog` / `useRoutineTicker` are not mounted; `routines.tsx` does not call the server fns or reads `localStorage`; Run now is not `runRoutine`; `routineRunner.ts` does not call `runAgentTurn` with the instructions as `userText`, imports the Harness directly, or contains an `allow` decision; `chat.tsx` drops `runAgentTurn`, has a second `routinesCreate` call, or Dismiss writes; the dsh / ACP pins float; `localbot-fs.mjs` changes; a routine file is accepted under a scope root; the record is not readable by a fresh process (routines only in React state); empty / unknown / archived is accepted; a BUSY / disabled / archived / DISCONNECTED routine is due or claimable; a second claim succeeds; missed beats replay; a proposal writes before Confirm; or delete leaves the file. ~1 s.

### How I test in the app

1. `npm run desktop` (or `npm run dev` in a browser). Pick an agent. Sidebar footer: **Routines** above **Plugins** above **Settings**. Click it.
2. **New routine** → name `Morning inbox`, agent, instructions, schedule **Daily at 09:00** → **Create**. The row shows `Next …`, `Last run: never`. `ls {dataDir}/routines/` has `rt_….json`.
3. **Run now** → the chat shows `Routine "Morning inbox" ran (Daily at 09:00, Run now): …` then the assistant reply (with no GGUF staged: `No verified GGUF on disk.`); the row flips to `Error` / `Ok` with the time; the JSON has `lastRunAt` + `lastStatus`.
4. Leave the window open with an **Every 1 minute** routine: within 30 s of the beat it runs by itself; the same lines appear in that agent's chat. Archive the agent (or disconnect the employee root, or start a long turn) → the row says why it is skipped and Run now is refused.
5. Ask the agent for a scheduled task; if it replies with a ```` ```localbot-routine ```` block the chat shows the **Routine proposal** card. **Dismiss** → nothing on disk. **Confirm** → `Saved as routines/rt_….json` and the routine appears in the dialog.
6. During a routine, any ungranted permission is denied with `Routine "…": denied … — routines never grant permissions.`; grant it in the chat and Run now again.

### Ready for

Stage 16 only after you say GO.

## Stage 14 — DSH / Cordis plugins (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 14". Invariants still checked by `src/lib/harness/plugins.test.ts` and `npm run prove:plugins`: Plugins above Settings (Stage 15 adds Routines **above** Plugins; the Stage 14 gate still passes), `dsh plugin --profile acp add|remove` against the isolated `DSH_HOME`, managed `disabled: true` block, `--dump-config` verification, guard + rollback, BUSY restart rule, `localbot-fs.mjs` sha256 pin, `runAgentTurn` kept. Stage 15 touched none of it.

## Stage 13 — Click-to-toggle mic (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 13". Invariants still checked by `src/lib/audio/voice-toggle.test.ts` and `npm run prove:mic`: click-to-toggle Mic with the hold fallback, live timer, Escape cancels, 60 s cap → stop → transcribe, no send path from voice, `runAgentTurn` kept, exact dsh / ACP pins. Stage 15 touched none of it.

## Stage 12 — Agent identity (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 12". Invariants still checked by `src/lib/agent-identity.test.ts` and `npm run prove:identity`: Edit profile through `agentUpdateProfile` (rename → row → forgetSession → agent.json / AGENTS.md), colour painting through `agentColorHex`, sections in `localbot-agents.json`, `+ New agent` → scripted setup chat, Advanced → modal, `runAgentTurn` kept, exact dsh / ACP pins. Stage 15 touched none of it.

## Stage 11 — Desktop chrome + composer (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 11". Invariants still checked by `src/lib/desktop-chrome.test.ts` and `npm run prove:chrome`: `desktop/preload.cjs` (CommonJS under `sandbox: true`), `hiddenInset` + `trafficLightPosition {14, 12}`, the native Edit menu roles, `+ New agent` above the search above the roster with Settings in the footer (Stages 14 / 15 add Plugins and Routines **above** Settings in that footer; the Stage 11 gate still passes), the 6-line native `<textarea>` composer, jump-to-latest, `runAgentTurn` kept, exact dsh / ACP pins.

## Stage 10 — Mac unsigned package + whisper-cli + proofs (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Stage 10". Invariants the Stage 10 proof (`npm run prove:mac`) still reads from this file: `build.mac.identity` is `null`, so the Mac build is **UNSIGNED** and not notarized — no line here may claim otherwise; the `.dmg` sha256 must be listed here. Stage 10's artifact: `LocalBot-0.1.0-mac-arm64.dmg` sha256 `4eff4caab6daafabfaf8f49f6137c4d23a7150ac84c5e2fee4e6c3f9cc9b34e6` (whisper-cli v1.9.2 built from source, Metal 3B / 7B, real-mic hold-to-talk `STAGE10_MAC_MIC_PASS`). The Stage 11 rebuild was `6e90420c1fa798cb221428fe9532f36aa8abb188b034b4d89b89fb8ccd61c297`. **Stage 13 rebuild** (latest, `npm run build:desktop`): `LocalBot-0.1.0-mac-arm64.dmg` sha256 `e843f469c7762f4f6a7fe404c053057384185f7dc4b9121f4218c8cb9fdd5061` — UNSIGNED, not notarized, `dist/` not committed. `npm run prove:mac` on that app (node-less PATH, real USB microphone, TCC `granted`): click → `jfk.wav` out of the speakers → click → composer `"Hello. And so my fellow Americans, ask not what your country can do for you. Ask what you can do for your country."` (`Heard 13.6 s · base.en · 282 ms`), then the hold fallback `Heard 11.5 s`, 0 messages sent, clip deleted → `STAGE10_MAC_MIC_PASS tcc=granted gesture=click-click heard_s=13.6 model=base.en ms=282 … hold_fallback=WORKS … dmg_sha256=e843f469c7762f4f6a7fe404c053057384185f7dc4b9121f4218c8cb9fdd5061`. **No `.dmg` was rebuilt in Stages 14 / 15**; the Plugins and Routines screens in a packaged app are UNVERIFIED.

## Stage 8 — Installers + two-process share (previous stage; still true)

Full text in `LOCALBOT_HANDOFF.md` → "Update after Stage 8". Invariants still checked by `src/lib/desktop-packaging.test.ts`: every installer is **UNSIGNED** — `mac.identity` is `null`, no certificate, nothing notarized, and no handoff line may claim otherwise. The Linux AppImage / `.deb` were last built in Stage 8 on a Linux host; not rebuilt here.
