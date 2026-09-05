# LOCALBOT_HANDOFF.md

## Stage 16 — Channels
Date: 2026-09-05
Branch: `stage-16-channels` (PR → `main`, off `64a5b3e` = merge of PR #15)

Channels only: a channel is a **shared thread + member list on disk** — `{dataDir}/channels/{id}.json` + `{id}.messages.json`, outside every scope root like `chats/` and `routines/`. Each member keeps its **own** Harness session; a channel turn is one **existing** `runAgentTurn({ botId })` for one member whose reply is appended to the shared transcript with its `speakerId`. No shared ACP session, no second Harness loop, no launchd, no plugin change, no NSIS, no streaming tokens, no propose-from-chat card; `src/lib/multiplayer/` was not resurrected. `chat.tsx` `send()` is untouched (`handoffTask` for `@` then `runAgentTurn`); `dsh/localbot-fs.mjs` (sha256 pinned), `resolveScopePath`, dsh `0.1.2-alpha.5`, ACP `1.4.0`, scopes, host index, Plugins, Routines, mic, chrome — unchanged. Still UNSIGNED, not notarized, no `.dmg` rebuilt this stage. Full detail and the exact pass output: `STAGE_HANDOFF.md`.

### Built
- **Record on disk: WORKS.** `src/lib/fs/channels.ts` → `channels/{id}.json` = `{ id, name, memberIds, createdAt, updatedAt }` + `channels/{id}.messages.json` = `{ version: 1, channelId, messages[], updatedAt }`, `atomicWriteJson` (temp + rename, `.bak` kept). `assertChannelsOutsideScopes` runs **first** on every create / rename / add / remove / append / list / read — `channels/` inside the employee root, employee share, department share or company share → `OUTSIDE_SCOPE`, nothing written. Guards: `BAD_NAME`, `TOO_FEW_MEMBERS` (< 2 on create **and** on remove — a channel can never drop below 2, delete it instead), `UNKNOWN_AGENT`, `ARCHIVED` (on create and on add), `ALREADY_MEMBER`, `NOT_MEMBER`, `NOT_FOUND`, `BAD_MESSAGE`. Delete removes record, transcript and both `.bak`s. Append dedupes by message id. The model cannot write `channels/` (outside every scope).
- **Turn rules: WORKS.** `src/lib/channels-model.ts` (browser-safe) `planSpeakers`: **no `@` → the first member in `memberIds`** (documented in the header tooltip + subtitle `no @ → Alice answers`); **`@Alice` (member) → only Alice**; **several `@` → those members in mention order, one at a time**; **non-member `@` → system line, no run, no handoff file**; **Run all members once = the button's explicit `all: true`, never implicit** (`@all` / `everyone` in text are inert). `enqueuePage` keeps **at most one** queued page per member. `renderChannelPrompt` = who it is, who else is in the room, why it runs now, the **last 24 channel lines with speaker names**, `Reply now as Alice.`
- **Gates on the host: WORKS.** `src/lib/harness/channels.ts` `gateChannelSpeaker`: `NOT_CONFIGURED` → `OUTSIDE_SCOPE` → `NOT_MEMBER` → `UNKNOWN_AGENT` → `ARCHIVED` → `DISCONNECTED` (employee root offline) → `BUSY` (`HarnessManager.hasActiveTurn`, the same singleton chat uses). Server fns `channelsGate` / `channelsGateAll`.
- **Runner through `runAgentTurn`: WORKS.** `src/runtime/channelRunner.ts` `sendChannelMessage(channelId, text, { all })`: the employee's line is `role: user` on the shared transcript; per planned speaker → gate on the sidecar → **`runAgentTurn({ botId: bot.id, userText })`, the same call `send()` and the routine runner make** → reply appended `role: assistant, speakerId` through the new optional `AdapterEvents.onAssistantText` sink (absent = agent's own chat, as before; chat and routines pass nothing). **ARCHIVED / DISCONNECTED → skip + system line. BUSY → `Bob is busy — paged once when its current turn ends.`, a second page is dropped with a system line; the queue drains when the member is free (after each channel turn, and when any 1:1 turn ends).** A member never waits on itself → no deadlock. **Permission cards stay per-agent** (`Permission · Alice`, that agent's own chat grants apply, the runner never answers a permission). Stop aborts the active speaker and clears the queue. Live (dev, no GGUF staged): `@Bob @Zed what is the plan?` → transcript on disk `user` → `system @Zed is not a member … nothing was handed off.` → `assistant speakerId=Bob`; no `@` → Alice (first member) ran; **Run all once** → `Sam ran all members once: Alice, Bob.` then Alice, then Bob. Alice's own `chats/` stayed empty.
- **UI: WORKS.** Sidebar **Channels** group (`data-testid="channels-section"`) below the agent sections, never mixed unlabelled into roster rows; rows (`channel-row`) with `#`, name, stacked member mascots, `…` → Rename / Delete; **New channel** (`new-channel`) inline form (name + active agents, Create disabled below 2). Roster `…` → **Open channel with…** = the **only** promotion from 1:1: creates `{ selected agent, target }` named `Alice + Bob`. `ui.selectedChannelId` **xor** `ui.selectedBotId` (`selectChannel` clears the bot, `selectBot` clears the channel; `shell.tsx` renders `ChannelPane` **or** `ChatPane`). `ChannelPane` (`src/components/localbot/channel.tsx`): `#` name (tooltip = the turn rules; rename by pencil / double-click), member avatars (hover × removes, `+` adds active non-members), **Run all once**, **Stop**, Delete; transcript with members' replies **labelled name + mascot**, live chips + `Alice working`, the per-agent permission card; composer `@` picker = **members only**.
- **Store / server fns:** `src/lib/runtime/channels.ts` — `channelsList / Create / Rename / Delete / AddMember / RemoveMember / Read / Append / Gate / GateAll`. `store.ts`: `channels` (from disk on load, **not** persisted), `channelSessions`, `selectChannel / createChannel / openChannelWith / renameChannel / deleteChannel / addChannelMember / removeChannelMember / appendChannelMessage / patchChannelMessage / patchChannelSession`. `types.ts`: `selectedChannelId`, `ChannelSession`. `harnessAdapter.ts`: one optional `onAssistantText` field, nothing else.
- **Tests:** `npm test` → 203 + **347** pass (new `src/lib/channels.test.ts`, 29: pins + `localbot-fs.mjs` hash; `chat.tsx` keeps `runAgentTurn` **and** `handoffTask`, `@` in 1:1 still calls `handoffTask` before the turn, `handoffTask` still writes `task-*.md`; runner uses `runAgentTurn` with `speakerId` append, no Harness import, no `handoffTask` / `agentFsWrite`, gates first, `enqueuePage`, no allow; pane / sidebar / shell / store structure + xor; pure rules; `OUTSIDE_SCOPE` under each root; every refusal; exact fields, `.bak`, cannot drop below 2, dedupe, delete; **fresh Node process** read-back; gates `NOT_MEMBER` / `BUSY` / `ARCHIVED` / `DISCONNECTED` / `NOT_CONFIGURED`); lint + tsc clean. **Proof:** new `npm run prove:channels` (static gates + live on a temp `LOCALBOT_DATA_DIR` + roots with a real roster and a real `HarnessManager` turn for BUSY) → `STAGE16_CHANNELS_PASS static+live outside/refuse/record-fresh-process/members/transcript/turn-rules/busy-one/archived/disconnected/delete`. It reads record + transcript back in a **fresh `node` process**, so a channel that exists only in React state fails it.

### Not built
- Propose-from-chat card for channels — NOT BUILT, by rule. Cross-window live refresh of `channels/` (a second window sees new lines on reopen, no watcher) — NOT BUILT. Channel-level grants (grants stay per-agent) — NOT BUILT. Members talking to each other beyond one reply per page, unread badges — NOT BUILT. launchd, plugins, NSIS, second Harness loop, streaming tokens — by rule. A non-error member reply — UNVERIFIED on this box (no GGUF staged; proven up to the sidecar's model check inside the real `harnessPrompt`). Packaged-app channels, Windows / Linux — UNVERIFIED (no `.dmg` rebuilt).

### Prove it
```
npm test && npm run prove:channels
```
Pass: `ℹ pass 347` … `[prove-channels] ok: channels are a labelled group, not roster rows` … `ok: channelRunner uses runAgentTurn` … `ok: one runAgentTurn per member with the channel lines as user text` … `ok: the reply lands on the shared transcript with speakerId` … `ok: channelRunner never writes a handoff file` … `ok: @ in a 1:1 chat still writes the handoff file before the turn` … `ok: channels/ under emp refused with OUTSIDE_SCOPE` … `ok: one member refused (TOO_FEW_MEMBERS)` … `ok: fresh process read back "launch" and its transcript (1 line)` … `ok: removing down to one member refused` … `ok: no @ → first member (Alice) only` … `ok: several @ → mention order` … `ok: non-member @ → nobody runs, name reported` … `ok: Run all only with the explicit flag` … `ok: BUSY queue keeps exactly one page per member` … `ok: gate: a running turn makes Bob BUSY` … `ok: gate: employee root gone → DISCONNECTED` … `STAGE16_CHANNELS_PASS …`. Exits 1 if a channel file is accepted under a scope root, the record is not readable by a fresh process, the runner does not call `runAgentTurn` / imports the Harness manager / writes a handoff, `chat.tsx` drops `handoffTask` or `runAgentTurn` or `@` in 1:1 skips the handoff file, < 2 members is accepted, a non-member or BUSY / archived / DISCONNECTED member passes the gate, `enqueuePage` keeps a second page, a bot and a channel can be selected together, the dsh / ACP pins float, or `localbot-fs.mjs` changes.

### How I test in the app
1. Two active agents → sidebar **Channels** group. Open Alice's chat, Bob's row `…` → **Open channel with…** → `Alice + Bob` appears under Channels and opens; `ls {dataDir}/channels/`.
2. `@Bob @Zed what is the plan?` → your line, `@Zed is not a member …`, then **Bob**'s reply with mascot + name; no `task-*.md` anywhere. `Who should own the launch note?` (no `@`) → **Alice** answers (header: `no @ → Alice answers`).
3. **Run all once** → system line, then Alice, then Bob. **Stop** aborts the active speaker. `+` adds Cara; hover × removes; removing to one member is refused.
4. Reload → channel + transcript still there (from disk). Click Alice's row → her 1:1 chat has no channel lines; `@Name` there still hands off to a file.
5. Long turn in Bob's 1:1, then `@Bob` twice in the channel → first page queued, second dropped; Bob answers once when free. Archive Bob → `Bob is archived and was skipped.`

### Ready for
Nothing from the GrokBot list remains. Next only after you say GO.


## Stage 15 — Routines
Date: 2026-09-05
Branch: `stage-15-routines` (PR → `main`, off `1f1de14` = merge of PR #14)

Routines only: one disk record per routine in `{dataDir}/routines/{id}.json` (outside every scope root, like `chats/`), host-side gates + exclusive claim / finish, a 30 s renderer ticker that runs due routines through the **existing** `runAgentTurn` (no second Harness loop), a Routines screen in the sidebar footer, and a Confirm / Dismiss card for routines the model proposes in chat. No channels, no launchd / Task Scheduler, no plugin catalog change, no installers. `runAgentTurn`, `dsh/localbot-fs.mjs` (sha256 pinned), the overlay, `resolveScopePath`, dsh `0.1.2-alpha.5`, ACP `1.4.0`, scopes, host index, Plugins, mic, chrome — unchanged. Still UNSIGNED, not notarized, no `.dmg` rebuilt this stage. Full detail and the exact pass output: `STAGE_HANDOFF.md`.

### Built
- **Record on disk: WORKS.** `src/lib/fs/routines.ts` → `{LOCALBOT_DATA_DIR}/routines/{id}.json` = `{ id, name, agentId, instructions, schedule, enabled, createdAt, lastRunAt, lastStatus, lastError }`, `atomicWriteJson` (temp + rename, `.bak` kept). Refuses empty name (`BAD_NAME`), unknown agent (`UNKNOWN_AGENT`), archived target (`ARCHIVED`), bad schedule (`BAD_SCHEDULE`). `assertRoutinesOutsideScopes` runs first on every create / update / list — `routines/` inside the employee / company / any agent scope → `OUTSIDE_SCOPE`, nothing written.
- **Schedules: WORKS.** `src/lib/routines-model.ts` (browser-safe): `manual`, `every N minutes`, `daily HH:MM` local, minimal 5-field cron (`*`, lists, ranges, `*/step`). Next beat is computed from the **last run**, so beats missed while the app was closed collapse into **one** catch-up on open — no backlog replay.
- **Gates on the host: WORKS.** `src/lib/harness/routines.ts`: `routinesDue(now)` skips with `DISABLED` / `ARCHIVED` / `DISCONNECTED` / `NOT_CONFIGURED` / `BUSY` (active turn for that agent) / `ALREADY_RUNNING`. `routinesClaim` re-checks the gates (Run now refused for archived / disconnected / busy too), takes an exclusive `{id}.running` marker (`O_EXCL`) and writes `lastStatus: "running"` to the JSON — a second window cannot double-fire; a `running` older than 2 h is stale and re-claimable. `routinesFinish(id, "ok" | "error" | "stopped", error)` writes status + `lastError`, releases the marker.
- **Runner through `runAgentTurn`: WORKS.** `src/runtime/routineRunner.ts` + `useRoutineTicker(diskLoaded)` in `shell.tsx`: on open and every 30 s → `routinesDue` → per due routine `routinesClaim` → system line `Routine "<name>" ran (<schedule>[, Run now]): <instructions>` → **`runAgentTurn({ botId, userText: instructions })` exactly like `send()`** → assistant output in that agent's durable chat → `routinesFinish`. **Run now** is the same `runRoutine()`. Live (dev, no GGUF staged): Run now → record `lastStatus: "error"`, `lastError: "No verified GGUF on disk."` (that is `runAgentTurn`'s own model check), chat has the system line + `No verified GGUF on disk.`; an `every 1 minute` routine fired unattended at the next tick.
- **Permissions during a routine: Deny, locked.** Every ungranted request is denied with the note `Routine "<name>": denied <summary> — routines never grant permissions. Grant it in this chat first (Allow for this chat), then run again.` No unattended Allow exists (test + prove grep).
- **Chat proposal: WORKS.** One standing-instruction line (`ROUTINE_BLOCK_INSTRUCTION`): the model may reply with a fenced ```` ```localbot-routine ```` JSON block `{ name, instructions, schedule }` and cannot create / edit / run routines itself (`routines/` is outside every scope). `chat.tsx` renders the block as a **Routine proposal** card with **Dismiss** / **Confirm** — `Nothing is saved until you confirm.` Only Confirm calls `routinesCreate` (exactly one write path); Dismiss writes nothing; the decision is stored on the message. Live: Confirm → `routines/rt_….json` + `Saved routine "Weekday check-in" (Cron 0 9 * * 1-5) for Writer → routines/rt_….json. Runs while LocalBot is open.`
- **UI: WORKS.** Footer **Routines** (`data-testid="sidebar-routines"`) above **Plugins** above **Settings**. `RoutinesDialog`: list (agent, schedule, next run, last run + status), Enable / Disable, **Run now**, Edit, Delete, New / Edit form (name, agent, instructions, Manual / Every / Daily / Cron). The dialog states: runs only while LocalBot is open; a missed beat runs once on the next open, no backlog replay, no login item; ungranted permissions are denied; the model can propose, nothing is saved until Confirm.
- **Server fns:** `src/lib/runtime/routines.ts` — `routinesList / Create / Update / Delete / Due / Claim / Finish` (`createServerFn`, same `HarnessManager` singleton for BUSY).
- **Tests:** `npm test` → 203 + **318** pass (new `src/lib/routines.test.ts`, 28: pins + `localbot-fs.mjs` hash, footer order, mounts, `chat.tsx` keeps `runAgentTurn` / one write path / Dismiss inert, runner uses `runAgentTurn` + no Harness import + deny only, schedules + cron, `OUTSIDE_SCOPE` under each root, refusals, atomic + `.bak`, fresh-process read-back, gates, exclusive + stale claim, one catch-up, standing line); lint + tsc clean. **Proof:** new `npm run prove:routines` (temp `LOCALBOT_DATA_DIR` + roots, real roster) → `STAGE15_ROUTINES_PASS static+live outside/record-fresh-process/refuse/busy/disabled/archived/disconnected/claim/finish/once/proposal-inert`. It reads the record back in a **fresh `node` process**, so routines that exist only in React state fail it.

### Not built
- Background routines with the app closed (launchd / login item / Task Scheduler) — NOT BUILT, by rule; missed beats wait for the next open. Channels, plugin catalog changes, installers, signing — by rule. Per-routine permission grants, run history, cron names / seconds / `L W #` — NOT BUILT. Packaged-app Routines screen, Windows / Linux — UNVERIFIED (no `.dmg` rebuilt). A non-error routine turn — UNVERIFIED on this box (no GGUF staged; ok / stopped finishes covered by tests + prove with a fake turn).

### Prove it
```
npm test && npm run prove:routines
```
Pass: `ℹ pass 318` … `[prove-routines] ok: footer order is Routines > Plugins > Settings` … `ok: Run now is runRoutine() — the same path as the ticker` … `ok: routineRunner uses runAgentTurn` … `ok: routineRunner has no second Harness loop` … `ok: ungranted permissions during a routine are denied` … `ok: chat.tsx: exactly one write path, inside Confirm` … `ok: routines/ under emp refused with OUTSIDE_SCOPE` … `ok: fresh process read back "Every minute" from …/routines` … `ok: BUSY: a running turn keeps it out of due (BUSY)` … `ok: archived agent: Run now refused (ARCHIVED)` … `ok: DISCONNECTED: Run now refused` … `ok: second claim refused (ALREADY_RUNNING)` … `ok: three missed daily beats → due once on open` … `ok: parsing the proposal wrote nothing (Confirm is the only write)` … `STAGE15_ROUTINES_PASS …`. Exits 1 if a routine file is accepted under a scope root, the record is not readable by a fresh process, Run now is not `runRoutine` / the runner does not call `runAgentTurn`, a proposal writes before Confirm, archived / BUSY / DISCONNECTED is due or claimable, a second claim succeeds, missed beats replay, the footer order is wrong, `chat.tsx` drops `runAgentTurn`, the dsh / ACP pins float, or `localbot-fs.mjs` changes.

### How I test in the app
1. Sidebar footer → **Routines** (above Plugins). **New routine** → name, agent, instructions, **Daily at 09:00** → Create → `ls {dataDir}/routines/`.
2. **Run now** → chat: `Routine "…" ran (Daily at 09:00, Run now): …` + the reply; row shows last run + status; JSON has `lastRunAt` / `lastStatus`.
3. Leave an **Every 1 minute** routine and the window open → it runs by itself within 30 s of the beat. Archive the agent / disconnect the root / start a long turn → skipped, Run now refused.
4. Model replies with a ```` ```localbot-routine ```` block → card → **Dismiss** (nothing on disk) or **Confirm** (`Saved as routines/rt_….json`).

### Ready for
Stage 16 only after you say GO.


## Stage 14 — DSH / Cordis plugins
Date: 2026-09-05
Branch: `stage-14-plugins` (PR → `main`, off `23a8f0a` = merge of PR #13)

DeepSeek Harness plugin management only: a Plugins screen that drives the real `dsh plugin --profile acp add|remove` against LocalBot's isolated `DSH_HOME`, real `disabled: true` rows in the profile's `cordis.patch.yml`, everything verified with `dsh --dump-config`, and a guard that undoes any plugin that turns hosted / telemetry / web / fs-sandbox back on. No marketplace, no registry scrape, no routines, no channels. `runAgentTurn`, `dsh/localbot-fs.mjs` (sha256 pinned), the overlay, `resolveScopePath`, dsh `0.1.2-alpha.5`, ACP `1.4.0`, scopes, host index, mic, chrome — unchanged. Still UNSIGNED, not notarized, no `.dmg` rebuilt this stage. Full detail and the exact pass output: `STAGE_HANDOFF.md`.

### Built
- **Sidebar → Plugins: WORKS.** Footer button `data-testid="sidebar-plugins"` **above Settings** → `PluginsDialog` (`src/components/localbot/plugins.tsx`, mounted in `shell.tsx`, same dark dialog as Settings). Tabs **Catalog / Installed**, one search filters both, Refresh, footer **Add by package name (`@scope/name@version`) or absolute local path**. `UiState.showPlugins` / `pluginsTab`.
- **Catalog: WORKS, checked in.** `catalog/dsh-plugins.json`, 5 entries `{ id, name, summary, risk, install: { kind, spec } }`: `localbot-plugin-hello` (safe, `path` → `dsh/plugins/localbot-plugin-hello`, our fixture) + the four optional bundles inside the pinned dsh install (`@deepseek-ai/dsh-headless`, `dsh-web-app`, `dsh-sdk-app`, `dsh-sdk-minimal` @ `0.1.2-alpha.5`, all **dangerous** — they insert hosted rows; the guard refuses them). Each entry is checked against disk / `node_modules` (`verified`). No invented names, no registry fetch (test + prove gate). Dangerous → **Add anyway…** → arm delay → separate **Yes, add it**.
- **Installed is not UI-only: WORKS.** `pluginsInstalled()` (`src/lib/harness/plugins.ts`) = `{DSH_HOME}/profiles/acp/package.json` (`dsh.profile.bundles`, `dependencies`) + the profile `cordis.patch.yml` (LocalBot-managed disabled rows) + a real `dsh --profile acp --patch … --dump-config` parsed by `# == layer` markers. Built in, not removable: `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-acp-app`, `localbot-acp.cordis.yml`, `localbot-fs-plugin.patch.yml` (overlay, `--patch`, composes last).
- **Add / Remove: WORKS via `dsh plugin`.** `findHarnessNode()` → `dsh/lib/bin.js plugin --profile acp add|remove …`, `DSH_HOME` set, cwd = profile. Allowlist: `name`, `@scope/name[@version]`, or an absolute path with `package.json`; refused before any spawn: `git+`, `github:`, URLs, `file:`, tarballs, `./`, `../`, `..` segments. Non-zero exit (incl. dsh's "pnpm not found on PATH", exit 127) shown **verbatim**; success only when the manifest actually changed. Live: fixture added → `bundles = [dsh-base, dsh-acp-app, localbot-plugin-hello]`, dump layer `# == localbot-plugin-hello`; removed → back to two.
- **Enable / Disable: WORKS on disk.** Managed block in the profile `cordis.patch.yml` with `- id: <row>` / `disabled: true` per inserted row, employee lines untouched, re-verified with `--dump-config`. Prove: the disabled plugin's `loaded` marker is absent from dsh stderr on the next boot, back after Enable.
- **Restart rule: WORKS.** After add / remove / enable / disable: no running turn → `HarnessManager.stop()`; the **next prompt boots the new composition** (`patchReload: startup`, nothing hot-reloads). Turn running → **BUSY**, nothing spawned or written.
- **Guard + rollback: WORKS.** `GUARD_ROW_IDS` (`llm-deepseek`, `web`, `web-search-deepseek`, `web-fetch-http`, `tool-web`, `session-telemetry-otel`, `fs-sandbox`) checked on **every** row of the post-change dump — dsh's id-targeted disable lands on the last duplicate, so a bundle inserting a second `llm-deepseek` leaves dsh-base's hosted row live (seen live with `dsh-sdk-minimal`). Offender → `dsh plugin remove` / patch restored, `ok: false`, `Refused: with <name> composed these rows come back on: llm-deepseek (@deepseek-ai/dsh-base). … The bundle was removed again.`
- **Safety unchanged: WORKS.** `localbot-fs.mjs` sha256 `0bb5593a…2b0a6` pinned; file tools still end in `resolveScopePath`; a plugin-shaped caller gets `FS_PERMISSION_DENIED` for `../`, host-absolute and symlink-out paths; overlay still last on the dsh argv, so hosted / telemetry / web / fs-sandbox stay disabled with a plugin added.
- **Fixture:** `dsh/plugins/localbot-plugin-hello/` (`dsh.bundle.patch` inserting row `localbot-hello`; `index.mjs` writes `[localbot-plugin-hello] loaded` on `apply`); `scripts/desktop-stage.mjs` copies `dsh/plugins` into the packaged stage.
- **Tests:** `npm test` → 203 + **290** pass (new `src/lib/harness/plugins.test.ts`, 32: pins, sidebar order, catalog offline, spec allowlist, dump / patch parsers, guard offenders, fake-runner add/remove/enable incl. exit 127 verbatim + BUSY + rollback, FS escape); lint + tsc clean. **Proof:** new `npm run prove:plugins` (temp `DSH_HOME`, real pinned dsh + pnpm) → `STAGE14_PLUGINS_PASS static+live add/dump/boot/disable/enable/busy/guard-rollback/remove/escape`. Negative check: a runner that never spawns `dsh plugin` fails the test and the prove.

### Not built
- **pnpm in the packaged app** — NOT BUILT, by rule: `dsh plugin` needs pnpm on PATH; without it Add / Remove show dsh's exit 127 text and change nothing (Installed shows the `plugins-pnpm-missing` banner; Installed / Enable / Disable still work). Live npm search, Grok store, routines, channels — by rule. Hot reload — NOT BUILT (next prompt boots). Per-plugin config UI — NOT BUILT. Packaged-app Plugins screen, Windows / Linux — UNVERIFIED (no `.dmg` rebuilt). Registry installs of the catalog's `npm` entries — UNVERIFIED offline (packages exist in the pinned install; the guard refuses them anyway). Signing / notarization — NOT BUILT.

### Prove it
```
npm test && npm run prove:plugins
```
Pass: `ℹ pass 290` … `[prove-plugins] ok: Plugins button is above Settings in the footer` … `ok: dsh.profile.bundles = [@deepseek-ai/dsh-base, @deepseek-ai/dsh-acp-app, localbot-plugin-hello]` … `ok: --dump-config has layer \`# == localbot-plugin-hello\`` … `ok: plugin really ran: dsh stderr has "[localbot-plugin-hello] loaded"` … `ok: disable: verified in --dump-config (disabled: true)` … `ok: while a turn runs: add / remove / disable refused BUSY` … `exit 0 → Refused: with localbot-evil-fixture composed these rows come back on: llm-deepseek (@deepseek-ai/dsh-base) … The bundle was removed again.` … `ok: bundles back to built-ins` … `ok: plugin-shaped caller: symlink out of private/ → FS_PERMISSION_DENIED` … `STAGE14_PLUGINS_PASS static+live add/dump/boot/disable/enable/busy/guard-rollback/remove/escape`. Exits 1 if `dsh plugin` was never spawned / the manifest did not change (Installed UI-only), `sidebar-plugins` is missing or below Settings, `chat.tsx` drops `runAgentTurn`, the dsh / ACP pins float, `localbot-fs.mjs` changes, a guard row is live, disable is not in the dump, BUSY touches disk, the evil bundle is not undone, or an escape path resolves. Needs pnpm on PATH for the live half.

### How I test in the app
1. Sidebar footer → **Plugins** (above Settings). Installed shows the profile path, `bundles: …`, `dsh --dump-config: 7 layers · hosted / telemetry / web / fs-sandbox still disabled`.
2. Catalog → `localbot-plugin-hello` → **Add** → the exact dsh command + exit 0; Installed lists it (`in --dump-config: localbot-hello`). Send a message: dsh boots with it.
3. **Disable** → `Wrote disabled: true … Verified with dsh --dump-config: yes`; **Enable**; **Remove**.
4. Catalog → `dsh-sdk-minimal` → Add anyway… → Yes, add it → guard refuses and removes it again.
5. Footer field: `git+…` / `../x` → **Refused — nothing changed**. While a turn runs → **Busy — nothing changed**.

### Ready for
Stage 15 only after you say GO.


## Stage 13 — Click-to-toggle mic
Date: 2026-09-05
Branch: `stage-13-mic-toggle` (PR → `main`, off `6b958b3` = merge of PR #12)

Gesture only, engine untouched: `sttTranscribe` → `transcribeWav` → one-shot `whisper-cli` (whisper.cpp v1.9.2), renderer-built PCM16 mono 16 kHz WAV, `desktop/main.mjs` media permission handlers, `runAgentTurn`, dsh `0.1.2-alpha.5`, ACP `1.4.0`, scopes, host index, sections, profile, Stage 11 chrome — all unchanged. No cloud STT, no whisper-server, no auto-send. Still UNSIGNED, not notarized, no Windows work. Full detail and the exact pass output: `STAGE_HANDOFF.md`.

### Built
- **Click to start, click to stop: WORKS.** `src/lib/audio/voice-toggle.ts` (pure): pointer down at idle starts listening at once (`micPress`); on release `micRelease` treats a press < `HOLD_MS` (500 ms) as a click → keep listening, ≥ 500 ms as a hold → stop; a press that began while listening is the second click → stop. Space / Enter → `voice.toggle()` (`micToggleAction`). `aria-label` = **Start voice input** / **Stop listening** / **Transcribing** (never "Hold to talk"); `data-voice-gesture="toggle"`. Pointer capture / Space-keyup (which made every release a stop) removed. Transcript → `appendTranscript(ui.composer, text)`; the employee presses Enter / Send. Live: one click → listening, still listening 2 s later; second click → `"And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country."` in the composer, 0 sent.
- **Live timer: WORKS.** `elapsedSeconds` ticks every 250 ms while listening; header **Listening 0:07** (`formatTimer`), a `voice-timer` counter beside the Mic, `data-elapsed-seconds` on the button.
- **Escape cancels: WORKS.** Chosen: cancel (discard) — clip dropped, whisper-cli not run, composer unchanged, note "Cancelled — nothing transcribed." Window-level listener while listening.
- **60 s cap → auto-stop + transcribe: WORKS.** `mic-capture.ts` fires `onCap` once (`takeForCap`); the hook passes `onCap: () => stop()`. Live: no second click → at 60 s `Heard 60.0 s · base.en · 760 ms`, transcript in the composer.
- **Hold fallback: WORKS** (≥ 500 ms press, release = stop). **Disabled** while a turn runs / no `mediaDevices` / no whisper-cli row or binary for this arch — unchanged rules.
- **Tests:** `npm test` → 203 + **258** pass (new `src/lib/audio/voice-toggle.test.ts`, 12: pure gesture + timer + cap, source gates); `stt.test.ts` Mic gate rewritten from `aria-label="Hold to talk"` to the toggle control; lint + tsc clean. Negative check: main's hold-only `chat.tsx` fails 2 tests and `prove:mic -- --static`.
- **Proofs:** new `npm run prove:mic` (dev Electron, Chromium fake mic fed `jfk.wav`, real whisper-cli; `--cap` adds the 60 s gate) → `STAGE13_MIC_TOGGLE_PASS`. `npm run prove:mac` (rebuilt UNSIGNED `.dmg` sha256 `e843f469c7762f4f6a7fe404c053057384185f7dc4b9121f4218c8cb9fdd5061`, real USB mic via speakers) now drives click → `afplay jfk.wav` → click, then the hold fallback → `STAGE10_MAC_MIC_PASS … gesture=click-click heard_s=13.6 … hold_fallback=WORKS`. `prove:stt` `STAGE9_STT_PASS`, `prove:chrome` `STAGE11_CHROME_PASS` still.

### Not built
- Plugins (Stage 14), routines, channels, Windows NSIS, streaming partials, auto-send, multilingual — by rule. Escape stop-without-send — by choice (Escape cancels; click / Space / Enter stops and keeps the words). Windows / Linux UNVERIFIED; touch / pen hold threshold UNVERIFIED; signing / notarization NOT BUILT.

### Prove it
```
npm test && npm run prove:mic -- --cap
```
Pass: `ℹ pass 258` … `[prove-mic] click 1 → listening · aria "Stop listening" · header "Listening 0:02" · timer 0:02 · still listening after 2 s (not hold-only)` … `click 2 → transcribing → idle · Voice · Heard 11.8 s · base.en · 304 ms · composer "And so my fellow Americans, ask not what your country can do for you, …" · 0 messages sent` … `Escape → idle · Cancelled — nothing transcribed.` … `60 s cap → stopped on its own → Heard 60.0 s` … `STAGE13_MIC_TOGGLE_PASS gesture=toggle click1=listening … escape=cancelled hold_fallback=WORKS … sent=0`. Fails if the mic is idle 2 s after a single click (hold-only), the timer does not count, the JFK phrase is missing, anything was sent, Escape transcribes, or the cap does not stop by itself.

### How I test in the app
1. Click the Mic once: red stop square, header counts **Listening 0:01, 0:02…**. Speak. Click again → "Transcribing" → words in the composer; press Enter to send.
2. Click, speak, press **Escape**: nothing transcribed, composer unchanged.
3. Click and wait: at 1:00 it stops by itself and the minute's transcript lands in the composer.
4. Press-and-hold still works (release = stop). Space / Enter on the focused button toggle. Mic disabled while the agent is working.

### Ready for
Stage 14 (plugins) only after you say GO.


## Stage 12 — Agent identity
Date: 2026-09-05
Branch: `stage-12-agent-identity` (PR → `main`, off `36863cc` = merge of PR #11)

Agent identity only: Edit profile, colour that paints, roster sections on disk, conversational create. Harness (`runAgentTurn`, dsh `0.1.2-alpha.5`), scopes, watch, host-index chats, Stage 11 chrome and hold-to-talk are unchanged; no second roster. Still UNSIGNED, not notarized, no Windows work. Full detail and the exact pass output: `STAGE_HANDOFF.md`.

### Built
- **Edit profile: WORKS.** … menu → **Edit profile** (`edit-profile.tsx`): name, job, description (= AGENTS.md body), mascot, colour. Save = `store.updateBotProfile` → sidecar `agentUpdateProfile`: `renameAgent` (if the name changed) → `renameRow` (same id) → `harness.forgetSession` → `updateAgentProfile` (`writeAgentRecord` → agent.json; `writeAgentStanding` → `# Name / job / body`). Nothing store-only; the row is updated from the sidecar's answer. Live: Writer → Author, colour moss, mascot ops, new job + description on disk, `agents/Writer/` gone, row id and chat kept.
- **Colour paints: WORKS.** `src/lib/agent-color.ts` resolves `Bot.color` → `AGENT_COLORS[id].hex`; `AgentAvatar` paints a ring and hands it to `MascotMark`, whose bodies are `fill={body}` with the old `var(--color-mascot-*)` only as fallback. Roster row and chat header render the same avatar. Live: clay `#c17f59` / pine `#5f8f86` rows, header matches; after Save both repaint moss `#6b8f71`. Negative check: a hard-coded body fill fails the test and `prove:identity`.
- **Sections: WORKS, on disk.** `HostIndex.sections[] { id, name, order }`, `HostAgentRow.sectionId` (null = unsorted) in `localbot-agents.json`; `createSection / renameSection / deleteSection / reorderSections`, `patchRowById({ sectionId })`; server fns + `statePatchAgent`; `store.loadFromDisk` reads them (never persisted in the browser). Sidebar groups through `groupRoster` (pure) after the search, so search crosses groups; empty sections show while browsing, hide while searching; **New section**, heading … → Rename / Delete, agent … → **Section** → move. Live: `localStorage.clear()` + reload on the same `LOCALBOT_DATA_DIR` keeps "Drafting" with Author under it.
- **Conversational create: WORKS (scripted).** `+ New agent` → `startSetupAgent` → `createBot` → `agentEnsure` (`agents/New agent/`) → that chat in setup mode: the agent asks name → job → description (`skip` allowed), validated like the sidecar; the last answer goes through `updateBotProfile` (folder renamed to `agents/{Name}/`, agent.json, AGENTS.md), then the chat is a normal chat on that agent. Questions are scripted in `setup-chat.ts` (no model needed, the model never writes the profile). `NewAgentDialog` is unchanged behind the **Advanced** slider button next to `+` (the only `newAgentOpen: true`). Live: "Scout" / "Finds sources" / "Cite everything." → `agents/Scout/agent.json` + `AGENTS.md`, placeholder gone.
- **Tests:** `npm test` → 203 + **246** pass (new `src/lib/agent-identity.test.ts`, 24: disk + pure + source gates); lint + tsc clean. `npm run prove:identity` → `STAGE12_IDENTITY_PASS`; `npm run prove:chrome` still `STAGE11_CHROME_PASS`.

### Not built
- Click-to-toggle mic (Stage 13), plugins, routines, channels, Windows NSIS — by rule.
- Model-generated setup dialogue (scripted on purpose); setup-mode persistence across a reload (a mid-setup reload leaves a normal "New agent" to finish via Edit profile); section drag-and-drop (only `reorderSections` on disk); no `.dmg` rebuilt (packaged app UNVERIFIED for this stage); signing / notarization NOT BUILT.

### Prove it
```
npm test && npm run prove:identity
```
Pass: `ℹ pass 246` … `STAGE12_IDENTITY_PASS color_row=#c17f59/#5f8f86 header=#6b8f71 profile=agents/Author(agent.json+AGENTS.md,row_id_kept) sections=disk(sec_…) wipe_reload=kept setup_chat=agents/Scout advanced_modal=WORKS data_dir=temp`. Fails if a mascot body ignores the stored colour, sections are not in `localbot-agents.json` / vanish after `localStorage.clear()`, Edit profile skips the sidecar, `+` opens the modal, or `runAgentTurn` / the dsh pin move.

### How I test in the app
1. Avatars in the roster and the chat header are painted in each agent's colour.
2. … → Edit profile → change name / job / description / mascot / colour → Save: row + header repaint; `agents/{New}/agent.json` + `AGENTS.md` updated, old folder gone, chat kept.
3. New section → move an agent under it via … → Section; clear browser storage and relaunch: still filed.
4. `+ New agent` → answer name, job, instructions in the chat → `agents/{Name}/` written, chat becomes normal.
5. The slider button next to `+` opens the old New agent form.


## Stage 11 — Desktop chrome + composer
Date: 2026-09-04
Branch: `stage-11-chrome-composer` (PR → `main`, off `20fbb58` = merge of PR #10)

Shell + composer + roster find only. Harness (`runAgentTurn`, dsh `0.1.2-alpha.5`), scopes, watch, host index, hold-to-talk, the New-agent modal and Settings dialog are unchanged. Still UNSIGNED, not notarized, no Windows work. Full detail, measurements and the exact pass output: `STAGE_HANDOFF.md`.

### Built
- **Traffic lights / title strip: WORKS.** Root cause: the preload was ESM (`preload.mjs`) under `sandbox: true`, and a sandboxed preload never loads ESM — measured `typeof window.localbotDesktop === "undefined"`, so `desktop-titlebar.tsx` never rendered and the sidebar's Wordmark + Settings row sat under the lights. Fix: `desktop/preload.cjs` (CommonJS, `require("electron")` only; sandbox + context isolation stay on), `main.mjs` loads it, `build.files` / `asarUnpack` ship `*.cjs`, `build-desktop.mjs` asserts it is unpacked. `hiddenInset` + `trafficLightPosition {14, 12}` kept; the strip's darwin gutter is 72 px. Live (dev **and** the rebuilt packaged app): bridge `object`, lights at (14, 12), strip 36 px, Wordmark row starts at y = 36.
- **Sidebar: WORKS.** Wordmark row alone under the strip → `+ New agent` (same modal) → **Find by name or job** → roster (+ Archived) → **Settings** in the footer. Settings is not next to the Wordmark; `settings_y=772` in an 820 px window.
- **Roster search: WORKS.** `src/lib/roster-search.ts`: case-insensitive, all words must hit `name + job`, empty query = identity (everyone + Archived as before), miss → "No agents match".
- **Composer: WORKS.** Native `<textarea>`, grows to **6 lines** (`COMPOSER_MAX_LINES`, `composerHeight()` in `src/lib/chat-layout.ts`) then scrolls inside with `.scrollbar-thin` (transparent track, inset low-contrast thumb). Live: 1 → 32 px, 6 → 132 px, 12 lines → still 132 px with inner scroll.
- **Cmd A / X / C / V / Z: WORKS (native).** `main.mjs` gained an Edit menu with roles `undo, redo, cut, copy, paste, selectAll` — on macOS these are the native selectors the shortcuts need; no clipboard code in React. Live through the same native path (`sendActionToFirstResponder`): selectAll → copy → cut → paste → undo on the composer.
- **Jump to latest: WORKS.** `isPinnedToBottom()` on `onScroll`; auto-follow only while pinned; a `↓` (`data-testid="jump-to-latest"`) appears only when unpinned and re-pins on click. Live on a 40-message chat.
- **Tests:** `npm test` 203 + **222** (was 207), `lint` and `tsc` clean. New `src/lib/desktop-chrome.test.ts` fails if Settings returns to the title-bar cluster / sidebar header, `+ New agent` is only in the footer, `main.mjs` loses the Edit roles or `hiddenInset`, the preload is ESM again, `chat.tsx` drops `runAgentTurn` / becomes a contenteditable / loses the cap or the `↓`, or the dsh / ACP pins float. New `scripts/prove-chrome.mjs` (`npm run prove:chrome`) is the live proof; `-- --app` runs it against the packaged app. Rebuilt `.dmg` sha256 `6e90420c1fa798cb221428fe9532f36aa8abb188b034b4d89b89fb8ccd61c297` (not committed).

### Not built
- Click-to-toggle mic (Stage 13); Edit profile, sections, conversational create, plugins, routines, channels — NOT BUILT by rule.
- Windows / Linux builds of this stage — UNVERIFIED (platform-neutral changes, no build here). Signing / notarization — NOT BUILT.
- Cmd-shortcuts pressed on a physical keyboard — UNVERIFIED by machine (the proof drives the menu's native selectors; step 4 of the in-app test is the human check). Jump-to-latest during a live streamed turn — UNVERIFIED live (seeded transcript only).

### Prove it
Command: `npm test && npm run prove:chrome`
Pass looks like: `ℹ pass 222` … `[prove-chrome] traffic lights at (14, 12) · gutter to 84px · strip 36px · Wordmark row starts y=36` … `[prove-chrome] sidebar: + New agent y=84 · search y=132 · roster y=172 · Settings y=772 (sidebar bottom 820)` … `composer: 1 line 32px · 3 lines 72px · 6 lines 132px · 12 lines 132px (inner scroll …)` … `Edit menu roles reach the composer through the native path: WORKS …` … `STAGE11_CHROME_PASS bridge=object platform=darwin lights=14,12 … edit_shortcuts=WORKS`. Exits 1 if Settings is next to the Wordmark / in the strip, `+ New agent` is not above the search above the roster, the bridge is missing, the Wordmark starts under the lights, the composer does not cap at 6 lines, an Edit role is missing, or the `↓` misbehaves. Packaged: `npm run prove:chrome -- --app dist/desktop/mac-arm64/LocalBot.app` → `STAGE11_CHROME_PACKAGED_PASS bridge=object …`.

### How I test in the app
1. `npm run desktop` (or the rebuilt `LocalBot.app`): the traffic lights sit alone in the dark strip; the LocalBot mark is on the first sidebar row below it; drag the strip to move the window.
2. Sidebar: `+ New agent` at the top, the find field under it, Settings at the very bottom. Type part of a name, then part of a job — the roster narrows; ✕ / Escape shows everyone again.
3. Composer: Shift+Enter past six lines — it stops growing and a thin dark scrollbar appears inside the field; Cmd+A / C / X / V / Z work; Enter still sends.
4. Scroll a long chat up: a `↓` appears bottom-centre and the view stops following; click it to pin again.

### Ready for
Stage 12 (profile / sections / create flow) only after you say GO.

---

## Stage 10 — Mac unsigned package + whisper-cli + proofs
Date: 2026-09-04
Branch: `stage-10-macos-package` (PR → `main`, off `7608856`)
Host: Darwin 25.5.0 (macOS 26.5.2) · arch arm64 (Mac mini, Apple M4 Pro, Metal `MTL0`) · RAM 24 GiB · disk 263 GiB free · Xcode CLT, cmake 4.4.3 · real USB microphone (MateView GT)

Everything here is **UNSIGNED** (`build.mac.identity: null`, electron-builder "skipped macOS code signing", `codesign` shows `TeamIdentifier=not set`, no Authority). Not notarized. No Windows work. Electron not upgraded. `runAgentTurn`, four scopes, watch, host index, dsh / ACP pins untouched. Full detail, hashes and log lines: `STAGE_HANDOFF.md`.

### Built
- **Gate A — WORKS.** `npm run build:desktop` on darwin-arm64 → `dist/desktop/mac-arm64/LocalBot.app` + `dist/desktop/LocalBot-0.1.0-mac-arm64.dmg`, sha256 `4eff4caab6daafabfaf8f49f6137c4d23a7150ac84c5e2fee4e6c3f9cc9b34e6` (not committed). Bundled Node v22.23.2 for darwin-arm64. `npm run prove:packaged` (darwin-aware now: `hdiutil` mount, `codesign` no-Developer-ID check, `ps` tree) launched it with no `node`/`npm`/`npx` on `PATH`; AppData is `~/Library/Application Support/LocalBot`. `STAGE8_PACKAGED_PASS node=v22.23.2 … platform=darwin-arm64`.
- **Gate B — WORKS (darwin-arm64).** `npm run build:whisper-mac` (new) clones whisper.cpp **v1.9.2** (`306c88f4`), cmake `BUILD_SHARED_LIBS=OFF GGML_METAL=ON GGML_METAL_EMBED_LIBRARY=ON GGML_NATIVE=OFF` (no SDL2 / server / tests), installs a static `whisper-cli` (3,275,928 B, sha256 `fbd2a54c…21f6e`) + `whisper-build.json` into `{AppData}/bin/darwin-arm64/whisper/`. `catalog/whisper-assets.json` gained the `darwin-arm64` row as `kind: "built"` (source tag + commit, cmake flags, sha256, `url: null`); linux / win rows kept. `stt.ts` verifies built rows against the manifest and reports NOT BUILT with the build command until the binary exists — Mic enabled on darwin exactly then. `npm run prove:stt -- --data-dir ~/Library/Application\ Support/LocalBot` → `STAGE9_STT_PASS … kind=built` (354 ms).
- **Gate C — WORKS.** `npm run prove:mac` (new) launched the packaged app (rebuilt after Gate B) node-less, Mic button enabled, TCC went `not-determined` → prompt shown → **Allow clicked** → `granted`; real pointer hold, `jfk.wav` played through the speakers into this Mac's real microphone, release → composer = `"Oh my fellow America! Ask not what your country can do for you. Ask what you can do for your country."` (`Heard 12.0 s · base.en · 379 ms`), zero messages sent, clip deleted, Enter still `send()` → `runAgentTurn`. `STAGE10_MAC_MIC_PASS tcc=granted …`.
- **Gate D — WORKS (darwin-arm64).** Downloaded and hashed 3B `626b4a66…c62d` and 7B `65b8fcd9…a1423` — both **equal the catalog**; notes now say "confirmed by download", nothing rewritten. `pickLlamaRuntime` → `metal`, `gpuLayersFor` → 99, Settings › Models shows `Selected: Metal (Apple Silicon) · --n-gpu-layers 99`. `npm run prove:packaged-chat -- --gguf …` (darwin-aware, plus Metal gates) ran one real turn in the packaged app on **3B** (5.1 s; 26.3 s on the first run that downloaded the Metal runtime) and on **7B** (11.4 s), llama-server from `bin/darwin-arm64/metal/llama-b10749/`, `--n-gpu-layers 99`, `/props build_info b10749-dfc29b64e`. Log lines from the same binary: 3B `offloaded 37/37 layers to GPU`, 7B `offloaded 29/29 layers to GPU`, `MTL0_Mapped model buffer size = 4168.09 MiB`. `STAGE10_MAC_GPU_PASS runtime=metal n_gpu_layers=99 …` for both.
- `npm test` 203 + 207, `lint`, `tsc --noEmit` clean on this Mac (two darwin test-helper fixes: `makeTempRoot` realpath for the `/var → /private/var` symlink; `localbot.test.ts` expects the target's default runtime tree; `watch.test.ts` lets the FSEvents stream come up for 500 ms on darwin before the external write — `watch.ts` untouched).

### Not built
- Signing / notarization — NOT BUILT by rule (Gatekeeper unidentified-developer dialog on first open).
- darwin-x64 whisper-cli — NOT BUILT (no row; the script would build CPU-only, UNVERIFIED). darwin-x64 GPU — NOT BUILT (no upstream asset). Intel Mac in general — UNVERIFIED.
- whisper-cli built on another Mac — UNVERIFIED (its own hash lands in `whisper-build.json`, which is what is verified).
- Windows packaging / NSIS, sidecar token, `pagehide` handshake, template deletion, two-laptop NAS, auto-send voice, `whisper-server`, Electron upgrade — out of scope, untouched.

### Prove it
Command: `npm test && npm run prove:mac`
Pass looks like: `ℹ pass 207` … `[prove-mac] static gates ok: identity null | dmg LocalBot-0.1.0-mac-arm64.dmg sha256 4eff4caab6da… in STAGE_HANDOFF | no signed/notarized claim | runAgentTurn kept` … `[prove-mac] TCC microphone status: granted` … `STAGE10_MAC_MIC_PASS tcc=granted … dmg_sha256=4eff4caab6daafabfaf8f49f6137c4d23a7150ac84c5e2fee4e6c3f9cc9b34e6`. The proof exits 1 if the handoff claims a signed or notarized build while identity is null, if no `.dmg` exists, or if `chat.tsx` drops `runAgentTurn`. GPU repro: `npm run prove:packaged-chat -- --gguf ~/Library/Application\ Support/LocalBot/models/qwen2.5-3b-instruct-q4_k_m.gguf` → `STAGE10_MAC_GPU_PASS`.

### Ready for
Windows packaging only after you say GO.

## Update after Stage 9 — Voice-to-text with whisper.cpp (hold-to-talk)
2026-09-04 · branch `stage-9-whisper-stt` (PR → `main`, off `3d45a7a`) · beyond AGENTS.md items 1–8, requested after them

**What actually WORKS now**
- **Hold-to-talk local STT.** A Mic button next to Attach in the chat composer. Hold (pointer or Space) → the renderer captures 16 kHz mono PCM16 through Web Audio and builds the WAV itself (no MediaRecorder, no ffmpeg) → release → `sttTranscribe` on the sidecar runs **one-shot** `whisper-cli -m … -f … -l en -nt -np` on this computer → the text is appended to the composer. The employee presses Enter; the existing `send()` → `runAgentTurn` path is the only way a message goes out. Header shows **Listening** / **Transcribing** in the slot **Working** uses. Disabled while a turn runs, when `mediaDevices` is missing, and on hosts without a pinned `whisper-cli`.
- **Catalog.** `catalog/whisper-assets.json` pins `ggml-org/whisper.cpp` **v1.9.2**: `whisper-bin-ubuntu-x64.tar.gz` (9,497,583 B, sha256 `46811a3e…f753b1`), `whisper-bin-x64.zip` (8,194,445 B, `49dcc16d…d674a`), model `ggml-base.en.bin` (147,964,211 B, `a03779c8…d002`, default) and `ggml-tiny.en.bin` (77,704,715 B, `921e4cf8…20b1f`), fixture `jfk.wav` (`59dfb9a4…860e`). Every hash from a real download on this host. No darwin row — upstream ships an xcframework, not a CLI (**NOT BUILT** on macOS; Mic disabled with that tooltip). No GPU / BLAS / `whisper-server` rows.
- **Sidecar contract.** Refuses anything but RIFF/WAVE PCM16 mono 16 kHz ≤ 60 s / 2 MiB before touching disk. Clip at `{dataDir}/stt/{uuid}.wav`, refused if that dir is under any scope root, deleted in `finally` (success, non-zero exit, or the 60 s `SIGKILL`). Runtime unpacked flat into `{dataDir}/bin/{target}/whisper/` — its own folder beside, never inside, the llama.cpp `bin/{target}/{runtime}/` trees (both ship a libggml); `assertWhisperExe` refuses to spawn from a llama dir. Model in `{modelsDir}/whisper/`, gated by size + ggml magic + sha256 (never `verifyGgufFile`). `LD_LIBRARY_PATH` = the whisper dir. One job at a time. Transcript never logged. No dsh.
- **Electron.** `setPermissionRequestHandler` + `setPermissionCheckHandler` grant `media` **audio-only** to the UI origin (`http://127.0.0.1:18790` packaged, `http://127.0.0.1:8080` dev) and deny media to every other origin — tighter than the previous no-handler default. `build.mac.extendInfo.NSMicrophoneUsageDescription` set.
- `npm run lint`, `npm run typecheck`, `npm test` (203 + 205) exit 0. New: `src/lib/runtime/stt.test.ts` (26), script `prove:stt`. `npm run prove:stt` on this host: `STAGE9_STT_PASS text="And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country." ms=832 model=base.en release=v1.9.2`. In the dev app, Chromium's fake capture device playing `jfk.wav` filled the composer with that sentence in 1022 ms with zero messages sent (recorded).

**Still NOT BUILT / UNVERIFIED**
- macOS `whisper-cli`: **NOT BUILT** (no upstream asset). Real microphone on this VM and the Electron window's mic prompt: **UNVERIFIED** (fake device + code-tested permission decision). Windows `whisper-cli.exe`: pinned + hashed, never run — **UNVERIFIED**. `tiny.en` in the UI, model picker, streaming partials, auto-send, multilingual, diarization, `whisper-server`, GPU whisper: **NOT BUILT** (out of scope). Everything carried from Stage 8 below is unchanged.

See `STAGE_HANDOFF.md` for the exact prove-it command, pass output, and in-app test steps.

---

## Update after Stage 8 — Installers + two-process share
2026-09-04 · branch `stage-8-installers-nas` (PR → `main`, off `58abaed`) · AGENTS.md item 8, the last item

**What actually WORKS now**
- **UNSIGNED installers for this host.** `npm run build:desktop` no longer passes `--dir`; `build.linux.target` is `["AppImage","deb"]`, `mac.target` `["dmg"]`, `win.target` `["nsis"]`. Built here (linux-x64): `LocalBot-0.1.0-linux-x86_64.AppImage` sha256 `8d02fad2bd81ebc8e8654b1763ffbdd0543285efdd3501991e28b81f19f14e38` (217 MB) and `LocalBot-0.1.0-linux-amd64.deb` sha256 `5dfada7605fdc6bbb0837f115994d0c66db6305fb0987a1e60f62f68cd699b68` (157 MB); the build writes `dist/desktop/SHA256SUMS.txt`. `mac.identity` is `null` and stays null — there is no signing identity or certificate here, so nothing is signed and nothing is notarized; a test fails the suite if a handoff line says otherwise. `.dmg` / NSIS are configured but not produced on this Linux host (**UNVERIFIED**).
- **Packaged DeepSeek Harness (linux-x64).** Electron stays 36.3.1; the build bundles the official **Node v22.23.2** (`catalog/node-runtime.json`, sha256-verified) at `resources/localbot-node/node` and the Harness tree at `resources/localbot-harness/` — `dsh/` overlay, the traced fs-plugin sources (`src/lib/fs/*.ts`, `llama-platform.ts`, `catalog/llama-assets.json`), and a fresh `npm install` of `@deepseek-ai/dsh@0.1.2-alpha.5` (195 packages) as an explicit `extraResources` entry. `desktop/main.mjs` sets `LOCALBOT_DSH_NODE` / `LOCALBOT_DSH_DIR` / `LOCALBOT_DSH_MODULES` for the sidecar; `findHarnessNode()` with `LOCALBOT_PACKAGED=1` never scans `~/.nvm` or PATH. Proven with node/npm/npx removed from PATH: `HarnessProcess.start()` against the extracted AppImage spawned dsh from the bundled Node (`/proc/<pid>/exe`) and completed ACP initialize; a real chat turn inside the packaged window on the 0.5B GGUF in AppData replied in ~25 s with dsh running on the bundled Node (recorded).
- **Two-process share, one host.** `npm run prove:two-process`: packaged app (`:18790`, its own AppData) + `npm run dev` (`:8080`, its own `LOCALBOT_DATA_DIR`), both with `department-shared` on the same real folder. A's `@Editor` handoff wrote `task-…md` through A's sidecar; B's Computer pane listed it after 3021 ms with no reload / no Refresh; reverse direction 505 ms. Two processes on one computer — **not** two laptops, **not** a NAS (**UNVERIFIED**).
- **Clean packaged launch.** `npm run prove:packaged`: the AppImage's `LocalBot` started with a node-less PATH and a seeded `$XDG_CONFIG_HOME/LocalBot`; sidecar on `127.0.0.1:18790`; every child process's executable under the app dir; `{appData}/models` + `bin` created; repo `data/` untouched; deleting AppData left every work folder in place. Roster came from the Stage 7 disk state; llama.cpp b10749 was downloaded into `{appData}/bin/linux-x64/cpu/` and the GGUF verified under `{appData}/models/`.
- `npm run lint`, `npm run typecheck`, `npm test` (203 + 179) exit 0. New: `scripts/desktop-stage.test.mjs` (8), `src/lib/desktop-packaging.test.ts` (14), scripts `prove:packaged`, `prove:two-process`, `prove:packaged-chat`.

**Still NOT BUILT / UNVERIFIED**
- Signed / notarized `.dmg` / `.exe`: **NOT BUILT** (no identity, no certificate, no notarization account). The mac / win installers themselves and their bundled Node rows: **UNVERIFIED** (no such host). Two physical machines / NAS / SMB / NFS: **UNVERIFIED**. AppImage double-click with FUSE + setuid sandbox: **UNVERIFIED** (proofs used `--appimage-extract` and `--no-sandbox`). Release CI / publishing / auto-update: **NOT BUILT**, out of scope. Carried over: painted GPU, 3B / 7B hashes, `pagehide` flush on Electron close, live Ollama, bash sandbox on mac / win — all **UNVERIFIED**.

See `STAGE_HANDOFF.md` for the exact prove-it commands, pass output, and in-app test steps. Sections below that say "unsigned unpacked Electron app" / "`--dir`" / "Harness in the packaged Electron is Stage 8" describe the pre-Stage-8 state.

---

## Update after Stage 7 — Durable AppData state
2026-09-04 · branch `stage-7-durable-state` (PR #7)

**What actually WORKS now**
- **Roster on disk.** `{dataDir}/localbot-agents.json` (v1, `src/lib/fs/host-index.ts`) holds `onboarded`, company / department / employee labels + ids, `selectedCatalogId`, `migratedFrom`, and per-agent `{ id, name, pinned, hidden, unread, sessionId, sessionCwd, createdAt }`. `agent.json` stays the source of truth for job / modelId / color / mascot / scopes / archived. The sidebar roster is `agents/*/agent.json` ⋈ index (`loadRoster`); a folder with no row gets a fresh id. `stateLoad` feeds the store before the first render; `localStorage.clear()` + reload against the same `LOCALBOT_DATA_DIR` shows the same roster, pins, archived group and chats (recorded).
- **Chats on disk.** `{dataDir}/chats/{agentId}.json` (messages + chatGrants), atomic, debounced 400 ms, flushed on `pagehide`, keyed by id so rename does not move them, outside every scope root (refused if the data dir sits inside one).
- **ACP session map.** `HarnessManager` persists `sessionId` + cwd after `session/new`; with an empty memory map it calls `session/resume` (dsh restores its own log; LocalBot replays nothing) and falls back to `session/new` + store when refused (unknown id, moved cwd). `forgetSession` (rename / archive) clears the persisted id. Verified against the real dsh: after `stop()` a fresh manager resumes the same id and its next tool call lands in the same `private/`; in the app a killed-and-restarted dev server shows **Resumed the previous Harness session.** with the id unchanged in the index.
- **Atomic host writes.** `atomicWriteJson` (temp + `renameSync`, `.bak`) for `localbot-config.json`, the index and chat files.
- **Settings hydration.** `allowHostedDemo` / `useExistingOllama` / `ollamaModel` / `activeModelId` are read back from `localbot-config.json` on boot, so Settings → Safety matches the sidecar after a wipe.
- **Migration.** Empty index + a browser `localbot-state-v3` → `stateMigrate` writes index + chats (old bot ids kept), `localbot-state-v3.migrated.json`, `migratedFrom` marker; idempotent. `partialize` now persists only UI chrome (`settings.darkMode` / `denseUi` / `webSearchEnabled` / `controlThisComputer` / `companyRootIsShared`, `hardware`, `runtime`, `previewWritesToProjectData`).
- `npm run lint`, `npm run typecheck`, `npm test` (195 + 165) exit 0. 20 new tests in `src/lib/fs/host-index.test.ts` + 5 real-dsh resume scenarios in `harness.test.ts`.

**Still NOT BUILT**
- Item 8 (signed installers, Harness in packaged Electron Node 22.14, bundled Node, Electron upgrade, two-machine NAS **UNVERIFIED**). Painted GPU **UNVERIFIED**; 3B / 7B hashes etag-only. Chat writes in the last ~400 ms before a hard renderer kill (`pagehide` flush **UNVERIFIED** on Electron close). Roster while the employee root is DISCONNECTED shows an empty list with a notice (no cached copy). `session/list` unused.

See `STAGE_HANDOFF.md` for the exact prove-it command, pass output, and in-app test steps. Older sections below that say agents / chats / pins live in `localStorage["localbot-state-v3"]` describe the pre-Stage-7 layout.

---

## Update after Stage 6 — Model platform
2026-09-04 · branch `stage-6-model-platform` (PR #6)

**What actually WORKS now**
- **GPU runtimes (selection).** `catalog/llama-assets.json` pins one official b10749 row per (target, runtime), every URL HEAD-checked: linux-x64 `cpu` + `vulkan`; win32-x64 `cpu` + `cuda-12.4` (+ cudart zip) + `vulkan`; darwin-arm64 `metal`; darwin-x64 `cpu` only (GPU **NOT BUILT** — no asset exists). The sidecar probes the host (`nvidia-smi`, `/proc/driver/nvidia`, `/sys/class/drm` + `/dev/dri`, Vulkan ICDs, WMI, arch) and `pickLlamaRuntime()` chooses the build; `--n-gpu-layers` is `gpuLayersFor()` — 0 on a CPU build, > 0 only on a GPU build. Runtimes unpack to `bin/{target}/{runtime}/`. Settings → Models has a **Build** picker and shows the probe evidence. Painted GPU execution is **UNVERIFIED** (CPU-only host); selection is tested with fixture probes.
- **Hashes.** Every downloadable catalog row has a sha256 (pin `2026.09-localbot-3`); 0.5B / 1.5B confirmed by hashing real downloads, 3B / 7B from the Hub LFS etag (**UNVERIFIED** locally). `verifyGgufFile()` is the one gate — size, GGUF magic, sha256, and a downloadable row without a hash is refused. Download, “already on disk”, `findReadyModel()` and import all activate through it; a mismatch leaves `activeModelPath` alone. Verified files are recorded in `localbot-config.json` → `verifiedModels` (invalidated when the file's mtime changes).
- **Per-agent model.** `agent.json.modelId` is the durable pick (Settings → Agents and New agent pickers, verified files only). `appLaunchReport(agentName)` resolves that file and `ensureLocalServer(modelPath)` restarts the **one** llama-server onto it when it differs — stop, wait for exit + port dark, spawn, wait for `/health`, `/props` naming the file and a 1-token completion. dsh is not restarted. A switch under another agent's running turn is refused. The header badge follows the agent's real file (tooltip shows what llama-server serves and “Next message restarts…”); a restart posts “Switched llama-server to … (file)” in the chat. Verified in the browser preview with the real 0.5B and 1.5B GGUFs: Writer → Editor → Writer, two restarts, `/props` on 18789 followed the selected agent.
- **Import badge fix.** `importGguf` adopts a catalog id only when the filename is that row; other files are registered under their own name and the wizard / badge / new-agent default use that id.
- **Ollama discovery.** `listOllamaModels()` returns tags or a typed error (no more `pingOllama`); Settings → Safety lists + picks a tag when the switch is on; the `localbot-llama` route points at `127.0.0.1:11434/v1` with that tag. Switch on + silent port / no models / nothing picked → visible error and the prompt is refused; no fallthrough to llama.cpp, no hosted route. Switch off → GGUF as before. A live Ollama is **UNVERIFIED** here (none installed).
- Electron main no longer spawns a second llama-server; the sidecar owns the one process and reaps it on exit.
- `npm run lint`, `npm run typecheck`, `npm test` (195 + 140) exit 0. 21 new tests in `src/lib/runtime/model-platform.test.ts`. Mutation-checked: an empty 3B sha256, a hardcoded `"--n-gpu-layers", "0"`, a launch that ignores the agent's path, a blind “already on disk” activate, and an Ollama fallback to `llama3.2` each fail the suite.

**Still NOT BUILT**
- Painted GPU run (**UNVERIFIED**, no GPU here). 3B / 7B hashes **UNVERIFIED** against a local download. darwin-x64 GPU, linux-arm64 / win32-arm64 targets **NOT BUILT**. Item 7 (roster / chats off `localStorage`, durable ACP session ids). Item 8 (signed installers, Harness in packaged Electron Node 22.14, bundled Node, two-machine NAS **UNVERIFIED**). Farm qualification, dynamic port hunt. The Harness persona's model *name* string is read once at dsh start (route and file do follow a switch).

See `STAGE_HANDOFF.md` for the exact prove-it command, pass output, and in-app test steps.

---

## Update after Stage 5 — Multi-agent polish
2026-09-04 · branch `stage-5-multi-agent-polish` (PR #5)

**What actually WORKS now**
- **Rename** in the sidebar menu. The sidecar moves `agents/{Old}/` → `agents/{New}/` in one `fs.renameSync` (agent.json, AGENTS.md, `private/memory/notes.md`, `private/output/` follow), rewrites `agent.json.name` and the `# Name` headings, and drops the agent's in-memory ACP session so the next message opens `agents/{New}/private`. Refused for empty / illegal / reserved names, a name another agent owns (case-insensitive, checked on disk), a missing source folder, or while the agent is mid-turn. Case-only renames go through a temp name. The roster label changes only after the move; chats stay keyed by `bot.id`.
- **Archive / Unarchive**, separate from Hide and Delete. Persisted as `"archived"` in `agents/{Name}/agent.json`; files stay, `agentRemove` is not called. Archived agents leave the default roster and the `@` hint; an **Archived (n)** group at the bottom of the sidebar restores or deletes them. Hide stays a local UI filter; Delete stays destructive.
- **Duplicate** copies the source `private/` (memory notes included) and its AGENTS.md into a fresh `agents/{Name copy}/` with a fresh agent.json — never a shared folder, never a store-only clone. Collision refused on disk.
- **Names**: `agentSlug` is the one cleaner (`store.slugName` removed); the sidecar's `assertAgentName` refuses rather than cleans.
- **@Name handoff** unchanged (`employee-shared`, else `department-shared`, else a clear error) and now refuses archived / hidden targets.
- `npm run lint`, `npm run typecheck`, `npm test` (195 + 119) exit 0. 16 new tests in `src/lib/fs/agents.test.ts` + 1 Harness scenario (session cwd after rename). Mutation-checked: store-only rename, deleting archive, non-copying duplicate, sidecar-skipping rename, and handoff to an archived target each fail the suite.
- Verified in the browser preview with the real 0.5B GGUF and the real Harness: rename Writer → Author (folder moved, `# Author`, new dsh session under the new cwd), collision notice, duplicate with copied memory, archive → Archived (1) → unarchive, `@Editor` task file appearing under **My agents** without a reload.

**Still NOT BUILT**
- Item 6 (GPU / hashes / per-agent model / Ollama discovery / import badge). Item 7 (roster + chats off `localStorage`, durable ACP session ids). Item 8 (signed installers, Harness in the packaged Electron Node 22.14, bundled Node). Two-machine / NAS **UNVERIFIED**. Rename with an open Windows handle in the old folder **UNVERIFIED** (Linux only here). Rename is refused mid-turn rather than queued.

See `STAGE_HANDOFF.md` for the exact prove-it command, pass output, and in-app test steps.

---

## Update after Stage 4 — Real DeepSeek Harness
2026-09-03 · branch `stage-4-deepseek-harness` (PR #4)

**What actually WORKS now**
- The agent loop is the real **DeepSeek Harness**: `@deepseek-ai/dsh` pinned exactly at `0.1.2-alpha.5` (upstream `49a606b`), driven over the official Agent Client Protocol with `@agentclientprotocol/sdk` `1.4.0` (exact). The sidecar owns one `dsh --profile acp --patch dsh/localbot-acp.cordis.yml` process with an isolated `DSH_HOME` under the data dir; one ACP session per agent; `session/new` / `session/prompt` / `session/update` / `session/request_permission` / `session/cancel`. The renderer only calls the server functions in `src/lib/runtime/harness.ts`.
- `src/runtime/harnessAdapter.ts` no longer owns a loop: the `while (rounds < 6)`, client-side tool execution and history replay are gone. It maps committed ACP updates onto the existing chips / assistant text, answers permission requests with the existing Allow once / Allow for this chat / Deny cards, and turns Stop into `session/cancel`.
- The only model route the Harness knows is `localbot-llama` → llama.cpp on `127.0.0.1:18789/v1` (`ensureLocalServer` unchanged; fixed placeholder key-shaped value, no credential). Hosted DeepSeek, telemetry, web search/fetch and subagent tooling are disabled in the checked-in Cordis overlay. `Allow hosted demo` on → the chat path refuses instead of routing a key.
- Harness file tools run through LocalBot's own `ctx.fs` provider (`dsh/localbot-fs.mjs`): every path resolves via `resolveScopePath({ scope, relPath, agentName })`; `..`, absolute, ungranted and symlink escapes are denied; a vanished share is `DISCONNECTED`; tool results show `private/hello.md`, never a host path.
- Verified in the browser preview with a real GGUF (Qwen 2.5 1.5B Q4 on official llama.cpp b10749): Writer → "Create a file named hello.md …" → chip **Write** `private/hello.md` → committed reply → `hello.md` listed and previewed in the Computer pane (~16 s on 4 CPU cores). With the 0.5B GGUF the same path runs but the model picks the wrong tool and gives up — write **UNVERIFIED** on 0.5B.
- `npm run lint`, `npm run typecheck`, `npm test` (195 + 102) exit 0. 20 new tests in `src/lib/harness/harness.test.ts` drive the real `dsh` over ACP against a fixture OpenAI `/v1` (no GGUF needed for `npm test`).
- Also fixed on the way: llama-server is launched from the extracted `llama-b10749/` tree (the copied lone binary could not load ggml backends); llama-server context floors at 8192 so the Harness prompt fits.

**Constraint found**
- `dsh 0.1.2-alpha.5` needs **Node ≥ 22.15** (`node:zlib` zstd in `dsh-session-persistence-jsonl`, hard-injected by `dsh-acp`). Electron 36's embedded Node and this VM's default Node are 22.14.0 → `SyntaxError: The requested module 'node:zlib' does not provide an export named 'createZstdDecompress'`. The sidecar launches dsh with `LOCALBOT_DSH_NODE`, its own Node if new enough, or a newer nvm Node (here v22.22.2); otherwise it refuses with that reason. Electron was not upgraded and no second Node is bundled — packaged-mode Harness is Stage 8.

**Still NOT BUILT**
- Harness inside the packaged Electron binary (Node 22.14). Durable session ids / chats / roster off `localStorage` (item 7) — a sidecar restart starts fresh ACP sessions. Delete / rename / mkdir tools through the Harness. Token streaming (ACP emits committed blocks; not faked). Hosted demo through the Harness (refused; legacy `runSingleCompletion` kept off the chat path). Signed installers. Two-machine / NAS run **UNVERIFIED**. Bash sandbox on macOS / Windows **UNVERIFIED**. Wizard GGUF import keeps the card's catalog id (badge label bug, item 6).

See `STAGE_HANDOFF.md` for the exact prove-it command, pass output, and in-app test steps.

---

## Update after Stage 3 — Four-scope browser + watch/poll + Refresh
2026-09-02 · branch `stage-3-watch-refresh`

**What actually WORKS now**
- The sidecar watches every configured folder (`src/lib/fs/watch.ts`): recursive `fs.watch` plus a 15 s safety poll where the OS delivers events; a bounded metadata poll (2 s, depth 4, 2000 entries) as the only source on network mounts / UNC paths / when `fs.watch` cannot attach, or when `LOCALBOT_WATCH_MODE=poll`. Watchers never write. Each root has a monotonic `version` and an `ok` / `disconnected` status with the OS reason.
- External writes into a configured scope appear in the Computer pane without a restart and without this process writing the file: the pane polls `scopesStatus` every 3 s and re-lists a section when its `version` moves. Verified in the browser preview: a file written from a terminal appeared under Department in ~2 s.
- **Refresh** button in the Computer pane header re-lists every visible scope through the sidecar resolver (`browseRefresh` rescans every root now). Verified with a 10-minute forced poll: nothing appeared until Refresh was clicked.
- A missing / unmounted configured folder is `ScopeError("DISCONNECTED")` for that scope on every browse and agent-tool op (`assertScopeConnected` in `resolveScopePath`). The pane shows a **Disconnected** banner with the reason and path on that section only; the other scopes keep working. A recursive `mkdir` can no longer recreate a vanished share as a local folder. Null scopes stay hidden; `..` / absolute / drive / UNC / symlink escapes stay denied (checked before the disk is touched).
- Electron **Reveal in Finder / Explorer**: one new narrow IPC `localbot:revealPath` (`shell.showItemInFolder`) in the `pickFolder` style; main re-checks the path against the configured folders in `localbot-config.json`. The host path comes from the sidecar (`browseHostPath`), never from the browser. Web preview keeps copy-path. The painted action is **UNVERIFIED** on this GTK-less host.
- `npm run lint`, `npm run typecheck`, `npm test` (195 + 82) exit 0. 14 new tests in `src/lib/fs/watch.test.ts`.

**Still NOT BUILT**
- DeepSeek Harness (custom loop unchanged; AGENTS.md item 4). Signed installers. Real two-machine / NAS run (**UNVERIFIED**; poll mode was forced, not measured on SMB/NFS; macOS network detection returns false and relies on the safety poll). Sidecar token. Agents / chats still in `localStorage["localbot-state-v3"]`. Rename / archive. Atomic writes / stale checks. Push (SSE) updates — the pane polls status every 3 s.

See `STAGE_HANDOFF.md` for the exact prove-it command, pass output, and in-app test steps.

---

## Update after Stage 2 — Folder scopes + native pickers
2026-09-02 · branch `stage-2-folder-scopes`

**What actually WORKS now**
- `localbot-config.json` is `version: 2` with a `folders` object: `employeeRoot` (required) + `employeeShared` / `departmentShared` / `companyShared` (nullable). A v1 `companyRoot` file is migrated once on load; `legacyCompanyRoot` is kept; no files are moved or deleted.
- The sidecar resolves every file path from `{ scope, relPath, agentName }` (`src/lib/fs/scopes.ts`). The browser never sends a root. `..`, absolute / drive / UNC paths, NUL, unset scopes, and symlink escapes (realpath, dangling links included) are rejected.
- Agent scope grants live in `{employeeRoot}/agents/{Name}/agent.json`, outside `private/`, and are enforced server-side.
- Electron `localbot:pickFolder` IPC (`dialog.showOpenDialog` with `openDirectory`) exposed via `desktop/preload.mjs`; web preview keeps a typed path field tagged **preview only**. The painted dialog is **UNVERIFIED** on this GTK-less host.
- Onboarding **Folders** step after model download; Settings → **Folders** (with “changing a folder does not move old files” notice) and → **Agents** (per-scope grants); Computer pane shows one section per configured scope and hides `null` scopes.
- `@Name` handoff writes `task-*.md` to `employee-shared`, else `department-shared`, else reports that neither is connected.
- `npm run lint`, `npm run typecheck`, `npm test` (195 + 68) exit 0. The 53 pre-existing grant / local-model tests still pass.

**Still NOT BUILT**
- Watch / poll / Refresh (Stage 3). DeepSeek Harness (custom loop unchanged). Signed installers. Agents / chats still in `localStorage["localbot-state-v3"]` (Stage 7). Reveal in Finder/Explorer. Legacy tree helpers (`fs/company.ts`, `fs/company-disk.ts`) kept only for the grant tests.

See `STAGE_HANDOFF.md` for the exact prove-it command, pass output, and in-app test steps. Sections below that mention a single “company root”, `departments/{Dept}/people/{Emp}/bots/{Bot}` tree, `workspace/` / `outbox/` grants, or `fsSetCompanyRoot` describe the pre-Stage-2 layout and are superseded by `FOLDER_CONTRACT.md`.

---

## Update after Stage 1 — Clean foundation
2026-09-02 · branch `cursor/stage-1-clean-foundation-dad0`

**What actually WORKS now**
- Package is named `localbot` (`package.json` / `package-lock.json`), not `app-builder-workspace`.
- `npm run lint` (0 problems), `npm run typecheck`, and `npm test` (248 pass / 0 fail) all exit 0. Previously: 1 lint error, 2 type errors, 10 failing template tests.
- `.output/` and `.vercel/` are gitignored and no longer tracked (109 files removed from the index). `npm run build` still regenerates them and succeeds.
- Dead template code removed: `src/lib/multiplayer/` (unimported), the unused `isDesktopShell()` export, and a write-only `loadedPath` var.
- Existing dark UI / onboarding / hardware scan / catalog / llama.cpp loopback / Electron window are untouched: dev server serves HTTP 200 and the auth invariant still agrees (sign-in off).

**Still NOT BUILT (deferred to later stages)**
- Hosted-demo code still present (`hosted-turn.ts`, `allowHostedDemo` branch) — off by default behind the Settings safety switch.
- `auth/`, `db.ts` + `migrations/`, and the `grok-pwa` plugin remain: still imported by `__root.tsx` / `auth/server.ts` / `vite.config.ts`, so not dead by import check.
- Per-launch sidecar token + narrow preload/IPC bridge: NOT BUILT (`desktop/preload.mjs` exposes only window controls).
- Durable config off `localStorage`: NOT BUILT (`store.ts` still persists `localbot-state-v3`).

See `STAGE_HANDOFF.md` for the exact prove-it command and file list.

---

## Update after package pass
2026-09-01
- Packaged binary path: `dist/desktop/linux-unpacked/LocalBot` (this OS). macOS `dist/desktop/mac/LocalBot.app`. Windows `dist/desktop/win-unpacked/LocalBot.exe`.
- Packaged mode runs npm run dev? no. Electron's Node starts `resources/localbot-sidecar/sidecar.mjs` (copied out of asar so ESM import works), which loads the Nitro `node-server` build from `resources/localbot-server` on `127.0.0.1:18790`.
- Employee needs Node installed? no
- llama.cpp targets still: darwin-arm64, darwin-x64, win32-x64, linux-x64
- signed dmg/exe: still NOT BUILT
- This preview host has no libgtk-3, so the unpacked Linux binary cannot paint here. `npm run build:desktop` still writes `linux-unpacked`.

## Update after desktop pass
2026-09-01
- Electron window: yes (`npm run desktop` → `node desktop/launch.mjs` → `desktop/main.mjs`). Frameless-ish dark window, no URL bar. Renderer is the existing TanStack UI. This preview host is headless without libgtk-3, so the window cannot paint here; on a normal desktop with GTK/Cocoa/Win32 it opens.
- npm run desktop: the command that works for **dev** (may start Vite)
- npm run build:desktop: unsigned unpacked app
- llama.cpp targets implemented: darwin-arm64, darwin-x64, win32-x64 (cpu zip), linux-x64 (ubuntu tarball) via `catalog/llama-assets.json`
- mascots: Writer / Researcher / Ops (`src/components/localbot/mascots/`)
- signed dmg/exe: NOT BUILT

## Update after local-model pass
2026-09-01
- Default chat: local GGUF via official llama.cpp **b10749** `llama-server` on `127.0.0.1:18789`
- Hosted grok-4.5: off unless explicit Settings switch **Allow hosted demo (breaks policy)**
- Download: real Hub file into `/workspace/data/LocalBot/models/` (Small 0.5B already on disk)
- Still web preview, not an Electron installer
- `node-llama-cpp` **not used** — this sandbox has no cmake. Binary is the official `llama-b10749-bin-ubuntu-x64.tar.gz` tree (needs the whole dir + `LD_LIBRARY_PATH`, not a lone `llama-server` file)

Documented from the tree at `/workspace` on 2026-09-01. No marketing. Status words: **WORKS** / **STUB** / **NOT BUILT** / **UNVERIFIED**.

---

## 1. Snapshot

| Item | Value |
|---|---|
| Repo path | `/workspace` |
| Git | **NOT a git repository.** No `.git`, no branch, no commit hash. |
| App name (window / `<title>`) | `LocalBot` (`src/routes/__root.tsx` `APP_NAME`) |
| App name (`package.json`) | `app-builder-workspace` (`productName`: LocalBot), `"type": "module"` |
| Wordmark | `LocalBot` (`src/components/localbot/logo.tsx`) |
| Platforms this tree can run on today | **Electron desktop window** (`npm run desktop`) + **web preview** (`npm run dev`). Unsigned. No notarized `.dmg` / `.exe` / `.deb`. |
| Node | `v22.23.2` |
| npm | `10.9.8` |
| React / Vite / Start | `react ^19.2.0`, `vite ^8.2.0`, `@tanstack/react-start ^1.168.0` |
| Persistence | `localStorage` key `localbot-state-v3` (agents, chats, pins, grants). File bodies on disk at the company root. Config: `{dataDir}/localbot-config.json`. |
| Last run | Dev on `:8080` HTTP 200. llama-server on `127.0.0.1:18789` health ok. Header `Local Qwen 2.5 0.5B Instruct Q4`. LocalBot tests include platform asset map + Writer `mascotId`. |

This is a **new web app from scratch**, wrapped in Electron this pass. Not an OpenMausBot fork.

This sandbox: **3.84 GB RAM**, ~2.7 GB free at scan, 2 CPUs, ~45 GB disk. Fit formula `fileGb + 1.0 + 0.5*(contextK/8)`. Small **Qwen 2.5 0.5B Instruct Q4_K_M** with `contextK: 4` requires ~1.7 GB and **fits**. 1.5B / 3B / 7B are greyed here. On a 16 GB-class machine, Recommended 3B is enabled by the same math.

---

## 2. How to run it on a clean machine

### Prerequisites

- Node 22
- npm 10
- **Desktop:** Electron (devDependency). macOS / Windows / Linux with GTK 3
- **Not required:** API key, Python, GPU drivers, CUDA, Metal, Ollama, Hugging Face token, DeepSeek Harness, cmake
- First chat will fetch the llama.cpp tarball/zip for **this OS** if the bin dir is empty, and will download the Small GGUF if the models folder is empty (~469 MB)

### Install

```bash
npm install
npm run desktop
```

That starts the UI if needed and opens LocalBot with no URL bar.

Also keep the browser preview:

```bash
npm run dev
```

Binds `0.0.0.0:8080`. llama-server binds **only** `127.0.0.1:18789`.

### Production / packaged build

```bash
npm run build                 # Vercel web build (preview / deploy)
npm run build:desktop         # unsigned unpacked Electron app for this OS
```

Packaged binary (this Linux host): `dist/desktop/linux-unpacked/LocalBot`

That binary starts Electron's Node sidecar (`desktop/sidecar.mjs` → Nitro `node-server` on `127.0.0.1:18790`). It does **not** run `npm run dev`. The employee does **not** need Node on PATH.

**NOT BUILT:** signed macOS `.dmg`, Apple notarization, Windows EV-signed installer, Ubuntu `.deb` / AppImage store listing.


### Where data is stored

| Concept | Web preview | Electron |
|---|---|---|
| Company root | `{cwd}/data/LocalBot/{CompanyName}` | `{documents}/LocalBot/{CompanyName}` |
| Config | `{cwd}/data/localbot-config.json` | `{appData}/LocalBot/localbot-config.json` |
| File bodies | OS disk under the company root | same |
| Agent list, pins, ACP session ids (Stage 7) | `{cwd}/data/localbot-agents.json` + `agents/{Name}/agent.json` | `{appData}/LocalBot/localbot-agents.json` + same |
| Chats, chat grants (Stage 7) | `{cwd}/data/chats/{agentId}.json` | `{appData}/LocalBot/chats/` |
| Models / GGUF | `{cwd}/data/LocalBot/models/{filename}` | `{appData}/LocalBot/models/` |
| llama.cpp binary | `{cwd}/data/LocalBot/bin/{platform-arch}/` | `{appData}/LocalBot/bin/{platform-arch}/` |

Uninstalling the browser profile does **not** delete the company root or the GGUF.

---

## 3. What the user sees

First launch (`src/components/localbot/onboarding.tsx`). Persist key bumped to v3 so a previous v2 session re-runs onboarding.

### 1. Splash / onboarding

**WORKS (web wizard).**

1. **hello** — “Your agents, on this computer.”
2. **stay** — “Chat is a local model file.” No account. No API key.
3. **grants** — Agents only touch folders you grant.

Then: **scan (server RAM) → models (fit cards) → download/import (blocked until verify) → agent**. Land in chat.

### 2. Hardware scan

**WORKS.** `scanServerHardware()` in `src/lib/hardware-server.ts` using `os.totalmem()`, `os.freemem()`, `os.cpus()`, `fs.statfsSync`. `ramSource: "os"`. Browser WebGL scan is a footnote (“browser guess”). Recommendations use server RAM.

### 3. Model picker

**WORKS.** Three cards from `catalog/models.json` (smallest per tier). Grey if `!fits || !downloadable`. Do **not** force-enable Small. 16 GB class enables Recommended (Qwen 2.5 3B). Clicking a live card goes to Download.

### 4. Download

**WORKS** for Small. Real Hub stream, `.partial`, Range pause/resume, GGUF magic, size, sha256 when present. Dest models dir. Import GGUF copies real bytes. Continue disabled until `modelVerify` passes. If the 0.5B file is already on disk, the step says “Already on disk.”

`ggufBlob()` **deleted**.

### 5. First agent

**WORKS.** Writer / Researcher / Ops each get a mascot + color. `bot.mascotId` is stored next to `bot.color`.

### 6. Chat

**WORKS** on the local GGUF. Header: mascot, name, job, **Local {model}** badge, Stop. Tool chips, permission cards, `@mention` writes `shared/task-*.md` on disk. Stop cancels between rounds only (`createServerFn` cannot take AbortSignal).

0.5B tool calling is **weak**. It may answer in text instead of calling `write_file`. The tools still work when the model emits them; Writer can still write `hello.md` through the disk adapter.

### 7. Computer pane

**WORKS from disk.** Slide-over / right drawer, not a second IDE.

### 8. Settings

General / Models / Company / Runtime / Safety.

- General: local GGUF, hosted off unless demo switch
- Models: catalog + Download + Import GGUF + models folder path
- Company: absolute path, grants, seed
- Runtime: engine `llama.cpp`, GGUF path, RAM estimate, loopback `http://127.0.0.1:18789/v1`
- Safety: web search, **Use existing Ollama** (off), **Allow hosted demo (breaks policy)** (off), Control this computer

---

## 4. Chat / inference

**Default is local.**

| Piece | Status |
|---|---|
| Embedded `node-llama-cpp` | **NOT BUILT.** No cmake in this sandbox. |
| llama.cpp `llama-server` | **WORKS.** Official b10749, per-OS asset. Bind `127.0.0.1:18789`. Electron main also tries to spawn if a GGUF is registered. |
| DeepSeek Harness (`dsh`) | **WORKS** (Stage 4). `@deepseek-ai/dsh` 0.1.2-alpha.5 over ACP owns the loop; `harnessAdapter.ts` is a thin ACP client. |
| Ollama | **Not required.** Settings switch only; default off. |
| Chat default | `src/lib/runtime/harness.ts` → `src/lib/harness/` → `dsh --profile acp` → `localbot-llama` route → llama-server (Stage 4). `execute-turn.ts` / `runLocalTurn` are legacy, off the chat path. |
| Hosted grok-4.5 | `src/lib/runtime/hosted-turn.ts` **only if** `allowHostedDemo` |
| `src/lib/runtime/turn.ts` | Legacy single-completion server fn (`runSingleCompletion`). **Does not contain** `api.x.ai` |
| Tools | Harness `read`, `write`, `edit`, `glob`, `grep`, `bash` (sandboxed to `private/`, escalations ask). No web tool. |
| File tools | `dsh/localbot-fs.mjs` (in the Harness process) → `src/lib/fs/scopes.ts` `resolveScopePath` → `src/lib/fs/disk.ts` |

`getAiStatus` returns the local badge unless the demo switch is on.

---

## 5. Files / disk adapter

Unchanged from the disk pass. `saveConfig` now `patchConfig`-merges so it does not wipe `activeModelPath`. `LOCALBOT_DATA_DIR` overrides the data dir for tests. Electron sets `LOCALBOT_ELECTRON=1`, `LOCALBOT_DATA_DIR={appData}/LocalBot`, `LOCALBOT_DOCUMENTS_DIR={documents}`.

---

## 6. Folder contract

Same company tree. Plus:

```
# web preview
{cwd}/data/LocalBot/models/qwen2.5-0.5b-instruct-q4_k_m.gguf
{cwd}/data/LocalBot/bin/{platform-arch}/llama-server

# Electron
{appData}/LocalBot/models/
{appData}/LocalBot/bin/{platform-arch}/
{documents}/LocalBot/{CompanyName}/
```

---

## 7. Catalog

Single source: `catalog/models.json` pin `2026.09-localbot-2`, imported in `src/lib/catalog.ts`. See `CATALOG.md` for Hub URLs and dropped gated/404 rows.

llama.cpp assets: `catalog/llama-assets.json` (darwin-arm64, darwin-x64, win32-x64, linux-x64).

---

## 8. Tests

```
node --experimental-strip-types --test src/lib/localbot.test.ts
```

Disk grant tests kept. Added: server RAM (`ramSource: "os"`), Large disabled on 4 GB, Small not force-enabled on 1 GB, 3B enabled on 16 GB, download fixture is a real GGUF, `ggufBlob` gone, `turn.ts` has no `api.x.ai`, `executeTurn` without `XAI_API_KEY` does not return “AI is not available in this environment”, loopback refuse `0.0.0.0`, catalog JSON ids, platform → llama asset map, Writer `mascotId`, Electron data dirs.

---

## 9. Safety

- Writes outside company root throw.
- Writes outside grants throw.
- `controlThisComputer` skips the shell permission card; still scoped to company root.
- Web search off by default, always asks.
- Model server **loopback only**. `assertLoopbackOnly` throws on `0.0.0.0`.
- Hosted demo off by default. `turn.ts` does not call `api.x.ai`.

---

## 10. What is leftover and unused

- `src/lib/fs/vfs.ts` — old in-memory VFS helpers
- `src/lib/fs/shell.ts` — old VFS shell
- `src/lib/multiplayer/` — template leftover, not imported
- `src/lib/checksum.ts` — `checksumBytes` only; `ggufBlob` removed

---

## 11. Feature scorecard

| Requirement | Status | Evidence |
|---|---|---|
| Desktop app window | **WORKS** | Electron `npm run desktop` (dev) and `npm run build:desktop` (unsigned unpacked). No URL bar. This host cannot paint without GTK 3. |

| Fork / reuse of OpenMausBot | **NOT BUILT** | No OpenMausBot sources |
| No API key on first run | **WORKS** | Default path is local GGUF. `executeTurn` does not need `XAI_API_KEY` |
| Hardware scan | **WORKS** | Server `os.totalmem` / `freemem` / `statfs`. Browser guess is a footnote |
| Model recommendation | **WORKS** | `fitModel` / `onboardingCards` from `catalog/models.json`. 16 GB enables 3B |
| GGUF download into the app | **WORKS** | Small 0.5B Hub file on disk, magic + size + sha256. Pause/resume Range. Import copies bytes |
| Embedded local inference (no Ollama required) | **WORKS** | llama-server b10749, loopback OpenAI `/v1/chat/completions` |
| Hosted grok-4.5 as default | **NOT BUILT** | Opt-in Settings switch only |
| DeepSeek Harness as the loop | **WORKS** (Stage 4) | Real `dsh` over ACP; no `while (rounds < 6)` |
| Named multi-agent roster | **WORKS** | Sidebar mascots + `createBot` |
| Permission Allow/Deny | **WORKS** | Cards + grants |
| Company / department / employee / bot folders | **WORKS** | Disk seed |
| Department shared folder | **WORKS** | Real `{dept}/shared/` |
| Per-bot workspace isolation | **WORKS** | `pathAllowed` + server grant check |
| Outbox | **WORKS** | Real `{employee}/outbox/` |
| @bot handoff via shared task files | **WORKS** | `handoffTask` |
| macOS / Windows / Ubuntu installers | **PARTIAL** | Unsigned `--dir` unpacked app via electron-builder. Signed `.dmg` / `.exe` / `.deb` **NOT BUILT**. |
| Arabic UI / RTL | **NOT BUILT** | `html lang="en"` |
| Company root picker | **PARTIAL** | Absolute path field, no OS folder dialog |
| NAS / two-machine sharing | **NOT BUILT** | Same real folder on the server machine only |
| Filesystem watcher | **WORKS** (Stage 3) | `src/lib/fs/watch.ts` — `fs.watch` + bounded poll; pane polls `scopesStatus` |
| Streaming tokens | **NOT BUILT** | Single completion |
| Ollama | **STUB** | Optional “Use existing Ollama”, default off, not required |
| Control this computer | **WORKS** | Switch exists, default off |
| Loopback bind of a local model | **WORKS** | `127.0.0.1:18789` |
| Session transcripts | **WORKS** (Stage 7) | `{dataDir}/chats/{agentId}.json` + persisted ACP session ids in `localbot-agents.json` |
| Import local GGUF | **WORKS** | Settings + onboarding. Copies real bytes |
| Agent rename in UI | **WORKS** (Stage 5) | sidebar → Rename → sidecar `agentRename` moves `agents/{Old}/` → `agents/{New}/` |
| Agent archive / unarchive | **WORKS** (Stage 5) | `archived` in `agent.json`; files stay |
| Agent duplicate copies `private/` | **WORKS** (Stage 5) | `copyAgent` (`cpSync`) into a new folder |
| Browser tool | **NOT BUILT** | `web_search` gated |
| Agent mascots | **WORKS** | Writer / Researcher / Ops SVG set |

---

## 12. Known bugs and missing pieces

- **`node-llama-cpp` not compiled (documented blocker).** No cmake. Used official llama.cpp CPU tarball instead. Reproduce: there is no `node-llama-cpp` in `package.json`.
- **0.5B tool calling is limited (annoying, expected).** The Small model that fits 4 GB RAM can miss tools on harder asks. First-run “write hello.md” did emit `write_file` and the file landed on disk. Larger catalog rows are real Hub files but greyed on this machine.
- **Gemma 4 E2B / Qwen 3.5 not used.** 404 and gated 401. Replaced with Qwen 2.5 Instruct Q4 files. See `CATALOG.md`.
- **Official Qwen 7B Q4_K_M is split.** Large card uses bartowski single file.
- ~~Stop does not abort the HTTP call~~ — Stage 4: Stop is ACP `session/cancel`.
- **No token streaming (annoying).** Full reply lands at once.
- **`darkMode` / `denseUi` are dead (cosmetic).** Stored, not applied.
- ~~Rename missing from sidebar~~ — Stage 5 added Rename / Archive / disk-copying Duplicate.
- **Inbox grant has no Settings chip (cosmetic).**
- **`npm test` fails template PWA tests (annoying for CI).** LocalBot tests pass in isolation.
- **Company rename does not move folders (annoying).**
- ~~No `fs.watch`~~ — Stage 3 added watch/poll + Refresh.
- **Do not kill llama-server on 18789** unless replacing it. `ensureLocalServer` reuses a healthy process.
- **Signed store installer not this pass.** Linux preview host has no GTK 3, so Electron cannot paint here. `npm run desktop` still launches the process (xvfb).
- **If `npm run dev` is already up, `npm run desktop` attaches to it** and keeps the web data dir. A clean `npm run desktop` starts the UI with Electron appData/documents paths.

---

## 13. Files I should read first

1. `src/lib/runtime/execute-turn.ts` — default local vs hosted branch
2. `src/lib/runtime/local-engine.ts` — spawn / ping llama-server, `runLocalTurn`
3. `src/lib/runtime/llama-platform.ts` + `catalog/llama-assets.json` — per-OS binaries
4. `desktop/main.mjs` + `desktop/launch.mjs` + `desktop/llama.mjs` — Electron window
5. `src/lib/runtime/hosted-turn.ts` — grok-4.5, demo switch only
6. `src/lib/runtime/models.ts` — download, verify, import
7. `src/lib/runtime/turn.ts` — `getAiStatus` / `runHarnessTurn` (no `api.x.ai`)
8. `src/runtime/loopback.ts` — `127.0.0.1:18789`
9. `src/runtime/harnessAdapter.ts` — agent loop, disk tools
10. `src/lib/store.ts` — persist `localbot-state-v3`
11. `src/lib/fs/disk.ts` — Node `fs` adapter + config + Electron paths
12. `src/lib/catalog.ts` + `catalog/models.json`
13. `src/lib/hardware-server.ts` — real machine scan
14. `src/components/localbot/onboarding.tsx` — download step
15. `src/components/localbot/mascots/` — Writer / Researcher / Ops
16. `src/lib/localbot.test.ts`

---

## 14. Demo script

1. `npm install` then `npm run desktop` (or `npm run dev` for the browser preview).
2. Walk onboarding. Hardware should show ~3.8 GB, `ramSource os`. Small enabled; Recommended/Large grey. On 16 GB, Recommended 3B is live.
3. Download step: if the 0.5B file is present, Continue without waiting on Hub.
4. Create Writer. Land in chat. Header **must not** say `Hosted grok-4.5`. Sidebar shows the Writer mascot.
5. Send a message. Reply comes from the local GGUF.
6. Ask Writer to write `hello.md`. If the 0.5B model does not call the tool, the disk adapter still writes when a tool call is emitted; you can also write via the Computer pane. File: `{companyRoot}/departments/{Dept}/people/{Employee}/bots/Writer/workspace/hello.md`.
7. Settings → Safety: **Allow hosted demo (breaks policy)** is off.

---

## 11 (local-model pass recap)

- GGUF download **WORKS** (Small 0.5B, 469 MB, verified sha256)
- Local inference **WORKS** (llama-server loopback; first-run chat wrote `hello.md`)
- Hosted default **NOT BUILT** / opt-in only
- Header on default path: `Local Qwen 2.5 0.5B Instruct Q4` — not `Hosted grok-4.5`
