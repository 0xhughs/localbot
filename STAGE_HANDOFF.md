## Stage 16 — Channels

Date: 2026-09-05
Branch: `stage-16-channels` (PR → `main`, off `64a5b3e` = merge of PR #15)
Host: Darwin 25.5.0 (macOS 26.5.2) · arm64 (Mac mini, Apple M4 Pro) · Electron 36.3.1 · Node v24.12.0 on PATH

Status words: WORKS / STUB / NOT BUILT / UNVERIFIED. This stage is **channels only**: a channel is a **shared thread + member list on disk** — `{dataDir}/channels/{id}.json` + `{id}.messages.json`, outside every scope root like `chats/` and `routines/`. Every member keeps its **own** Harness session: a turn in a channel is one **existing** `runAgentTurn({ botId })` for one member, whose reply is appended to the shared transcript with its `speakerId`. No shared ACP session, no second Harness loop, no launchd, no plugin change, no NSIS, no streaming tokens. `chat.tsx` `send()` is untouched (`handoffTask` for `@` **then** `runAgentTurn`); `src/lib/multiplayer/` was not resurrected. `dsh/localbot-fs.mjs` (sha256 pin `0bb5593a…2b0a6`), `dsh/localbot-acp.cordis.yml`, `resolveScopePath`, dsh `0.1.2-alpha.5`, ACP `1.4.0`, the four scopes, host index, Plugins, Routines, mic and chrome are unchanged. Still **UNSIGNED**, not notarized, no `.dmg` rebuilt this stage.

### Built

- **Record on disk: WORKS.** `src/lib/fs/channels.ts`: `channelsDir()` = `{LOCALBOT_DATA_DIR}/channels/`; per channel `{id}.json` = `{ id, name, memberIds, createdAt, updatedAt }` (exactly those five) and `{id}.messages.json` = `{ version: 1, channelId, messages[], updatedAt }`, both written with `atomicWriteJson` (temp + rename, previous copy kept as `.bak`). `assertChannelsOutsideScopes(folders)` runs **first** on every create / rename / add / remove / append / list / read: `channels/` inside the employee root, employee share, department share or company share → `OUTSIDE_SCOPE`, nothing written. Guards: `BAD_NAME` (empty / control chars / > 60), `TOO_FEW_MEMBERS` (< 2 after dedupe — also on remove: a channel can never drop below 2, delete it instead), `UNKNOWN_AGENT` (id not in `agents/`), `ARCHIVED` (on create **and** on add), `ALREADY_MEMBER`, `NOT_MEMBER`, `NOT_FOUND`, `BAD_MESSAGE`. `createChannel / renameChannel / addChannelMember / removeChannelMember / deleteChannel / appendChannelMessages / readChannelMessages / listChannels`. Delete removes record, transcript and both `.bak`s; agent folders are never touched. Append dedupes by message id (a retried append cannot double a line). The model has **no** path here: `channels/` is outside every scope, so `resolveScopePath` file tools cannot reach it, and there is no propose-from-chat card this stage.
- **Turn rules: WORKS.** `src/lib/channels-model.ts` (browser-safe, no Node imports) — `planSpeakers(text, members, { all })`: **no `@` → the first member in `memberIds`** (the documented default; the header tooltip and the header subtitle say so: *"no @ → Alice answers"*); **`@Alice` (a member) → only Alice**; **several `@` → those members in mention order, one at a time**; **`@Zed` not a member → a system line** (`@Zed is not a member of #… — add them first. Nobody ran and nothing was handed off.`), no run, **no handoff file**; **"Run all members once" only when the button passes `all: true`** — `everyone` / `@all` in the text never means all. `enqueuePage(queue, botId)` keeps **at most one** queued page per member (`CHANNEL_QUEUE_PER_MEMBER = 1`). `renderChannelPrompt` builds the member's user text: who it is, who else is in the room, why it runs now (paged / default / run-all), the **last 24 channel lines with speaker names** (`[Sam] …`, `[Bob] …`), then `Reply now as Alice.`
- **Gates on the host: WORKS.** `src/lib/harness/channels.ts` `gateChannelSpeaker(channel, agentId, deps)` in order: `NOT_CONFIGURED` → `OUTSIDE_SCOPE` → `NOT_MEMBER` → `UNKNOWN_AGENT` → `ARCHIVED` (a member archived after the fact is skipped) → `DISCONNECTED` (employee root offline, via `assertScopeConnected`) → `BUSY` (`HarnessManager.hasActiveTurn(agentName)`, the same singleton chat uses). `channelGate` / `channelGateAll` wrap it for the server fns. Same codes as routines.
- **Runner through `runAgentTurn`: WORKS.** `src/runtime/channelRunner.ts` `sendChannelMessage(channelId, text, { all })`: the employee's line goes on the shared transcript as `role: user` (`channelsAppend`), then for each planned speaker `pageMember` → `channelsGate` on the sidecar → **`runAgentTurn({ botId: bot.id, userText })`, the same call `send()` and the routine runner make** → the assistant text lands on the shared transcript as `role: assistant, speakerId: bot.id` through the new optional `events.onAssistantText` sink (absent = the agent's own chat, as before; `chat.tsx` and routines pass nothing and are unchanged) → tool chips attach to that reply. **ARCHIVED / DISCONNECTED / UNKNOWN_AGENT → skip + the gate's reason as a system line.** **BUSY** (sidecar turn, a 1:1 turn in this window, or another speaker mid-turn in this channel) → `enqueuePage`: first page → `Bob is busy — paged once when its current turn ends.`, second → `…already has one page waiting — this page was dropped.`; the queue drains when the member is free (after each channel turn, and a store subscription wakes it when any 1:1 turn ends). A member never waits on itself → no deadlock. **Permission cards stay per-agent**: the card is for the active speaker's turn (`Permission · Alice`), `runAgentTurn` keeps applying that agent's own chat grants, and the runner never answers a permission itself (grep gate: no `"allow-once"` / `"allow-chat"` in the runner). Stop aborts the active speaker (ACP `session/cancel` through the adapter) and clears the queue. Errors from the turn are attributed to the speaker like in chat. Live (dev, `LOCALBOT_DATA_DIR=/tmp/lb16-ui-data`, no GGUF staged): `@Bob @Zed what is the plan?` → transcript on disk = `user | @Bob @Zed what is the plan?` → `system | @Zed is not a member of #Alice + Bob — …nothing was handed off.` → `assistant bot_94c40f02 (Bob) | …`; `Who should own the launch note?` (no `@`) → Alice, the first member, ran → `assistant bot_0f6f8ead (Alice) | Alice's model fixture is not on disk.` (that is the sidecar's own model check inside the real `harnessPrompt` path — the turn reached dsh's front door); **Run all once** → system line `Sam ran all members once: Alice, Bob.` then Alice's reply, then Bob's reply, one after the other. Alice's own `chats/` stayed empty — channel lines never leak into the 1:1 chat.
- **UI: WORKS.** Sidebar: a labelled **Channels** group (`data-testid="channels-section"`, heading `CHANNELS n`) below the agent sections and above Archived — never mixed unlabelled into the agent rows; each row (`data-testid="channel-row"`) shows `#`, name, member names and up to three stacked mascots, `…` → Rename channel / Delete channel; **New channel** (`data-testid="new-channel"`) opens an inline form (name + checkbox list of active agents, first picked = default speaker, Create disabled below 2). Roster `…` gained **Open channel with…** — the **only** promotion from 1:1: it creates `{ selected agent, target }` named `Alice + Bob` and opens it (refused with a notice when no agent is selected, target = current, or target archived). `ui.selectedChannelId` **xor** `ui.selectedBotId`: `selectChannel` clears the bot, `selectBot` clears the channel, `shell.tsx` renders `ChannelPane` **or** `ChatPane`, never both. `ChannelPane` (`src/components/localbot/channel.tsx`): header with `#` name (tooltip = the turn rules incl. the default speaker; double-click or pencil to rename), subtitle `n members · no @ → Alice answers · @Name pages that member`, member avatars (hover ×  = remove; `+` = add from active non-members), **Run all once**, **Stop**, Rename, Delete; transcript with the employee's lines, system lines, and members' replies **labelled with name + mascot** (`AgentAvatar` + `data-testid="channel-speaker"`), live chips + `Alice working` while a member runs, the per-agent permission card; composer placeholder `Message #name — @member to page` whose **`@` picker lists members only** (`MemberMentionHint`, `not a member` otherwise); footer `channels/{id}.json · shared thread, outside every scope · each member keeps its own Harness session`.
- **Store / server fns.** `src/lib/runtime/channels.ts`: `channelsList / Create / Rename / Delete / AddMember / RemoveMember / Read / Append / Gate / GateAll` (`createServerFn`). `store.ts`: `channels` (from disk in `loadFromDisk` → `channelsList`; **not** in `partialize`, so a wiped browser changes nothing), `channelSessions` (loaded transcript, active speaker, queue, pending permission, chips), `selectChannel / createChannel / openChannelWith / renameChannel / deleteChannel / addChannelMember / removeChannelMember / appendChannelMessage (local, then `channelsAppend`; a failed write is shown as a system line, never hidden) / patchChannelMessage / patchChannelSession`. `types.ts`: `UiState.selectedChannelId`, `ChannelSession`, re-exported `Channel` / `ChannelMessage`. `harnessAdapter.ts`: one optional field `onAssistantText?: (text) => void` on `AdapterEvents` — no loop, no replay, nothing else changed.
- **Tests.** `npm test` → 203 (scripts) + **347** (TS, was 318) pass; `npm run lint` + `npm run typecheck` clean. New `src/lib/channels.test.ts` (29): dsh / ACP pins + `localbot-fs.mjs` sha256; `chat.tsx` keeps `runAgentTurn` **and** `handoffTask`, `@` mentions still call `handoffTask` before the turn, `handoffTask` still writes `task-*.md`, `chat.tsx` knows nothing about channels; adapter still no loop, sink optional; runner imports `runAgentTurn`, `turn: runAgentTurn`, calls `deps.turn({ botId: bot.id, userText })`, reply appended with `speakerId`, no Harness / manager import, no `handoffTask` / `agentFsWrite`, gates first, BUSY → `enqueuePage`, no allow; pane sends through `sendChannelMessage`, Run all = explicit `all: true`, tooltip = `channelTurnRulesText`, `@` picker = members only; sidebar `channels-section` / `channel-row` / `new-channel` / Open channel with…, not roster rows, no `localStorage`; shell xor, store xor, every mutation a `channels*` server fn, `channels` not persisted; pure rules (mentions, default-first, only-Alice, mention order, non-member unknown, `@all` inert, `all` flag, queue max one, prompt window of 24 with names); disk: `OUTSIDE_SCOPE` under each root, `BAD_NAME` / `TOO_FEW_MEMBERS` / `UNKNOWN_AGENT` / `ARCHIVED` / `ALREADY_MEMBER` / `NOT_MEMBER` / `NOT_FOUND` / `BAD_MESSAGE`, exact fields, `.bak`, cannot drop below 2, append + dedupe, delete cleans all four files, **fresh Node process** reads record + transcript back; gates `NOT_MEMBER` / `BUSY` / `ARCHIVED` / `DISCONNECTED` / `NOT_CONFIGURED`.
- **Proof.** New `scripts/prove-channels.mjs` (`npm run prove:channels`): the static gates above, then live on a temp `LOCALBOT_DATA_DIR` + temp scope roots with a real roster (`Alice`, `Bob`, `Cara`, archived `Retired`): refuse `channels/` under each scope root → refuse empty / one member / unknown / archived → create → **read record + transcript back in a fresh `node` process** (React state alone fails here) → add archived refused, duplicate refused, remove below 2 refused, add / remove / rename on disk with `.bak` → employee line `role: user`, member reply with `speakerId`, dedupe, append to missing → `NOT_FOUND` → turn rules (default-first, `@Bob`, mention order, non-member, `@all` inert, `all` flag, queue keeps one) → gates with a **real `HarnessManager` running turn** (BUSY for Bob, Alice still free), `NOT_MEMBER`, archived-after-the-fact, DISCONNECTED → delete removes all four files. `--static` runs the source gates only.

### Not built

- **Propose-from-chat card for channels — NOT BUILT, by rule this stage.** The model cannot create a channel or write to one; only the employee's sidebar / roster actions can.
- **Cross-window channel refresh — NOT BUILT.** A second LocalBot window on the same data dir sees new lines after reopening the channel (the transcript is read from disk on open), not live. No watcher / poll on `channels/`.
- **Channel-level permission grants — NOT BUILT.** Grants stay per-agent (each member's own chat grants), as required.
- **Ordered multi-member "conversation" beyond one round — NOT BUILT.** Members reply once per page; they do not talk to each other unprompted. `@` between members in a reply is text, not a page.
- **Unread badges / notifications for channels — NOT BUILT.**
- **Background scheduler, plugin catalog, NSIS / signing, streaming tokens — NOT BUILT, by rule.**
- **A successful (non-error) member reply — UNVERIFIED on this box** (no GGUF staged; the turn was proven up to the sidecar's model check inside the real `harnessPrompt`, and the reply-append path is covered by the `onAssistantText` sink test + the static gates). **Packaged-app channels — UNVERIFIED** (no `.dmg` rebuilt). **Windows / Linux — UNVERIFIED.**

### Files changed

- `src/lib/channels-model.ts` (new, browser-safe: types, `ChannelError`, `cleanChannelName` / `cleanMemberIds` / `normalizeChannel` / `normalizeChannelMessage`, `parseMentions` / `planSpeakers` / `enqueuePage` / `renderChannelPrompt` / `channelTurnRulesText`, `CHANNEL_MIN_MEMBERS`, `CHANNEL_CONTEXT_MESSAGES`, `CHANNEL_QUEUE_PER_MEMBER`)
- `src/lib/fs/channels.ts` (new: `channelsDir`, `assertChannelsOutsideScopes`, record + transcript CRUD with `atomicWriteJson`) · `src/lib/harness/channels.ts` (new: `gateChannelSpeaker`, `channelGate`, `channelGateAll`) · `src/lib/runtime/channels.ts` (new server fns)
- `src/runtime/channelRunner.ts` (new: `sendChannelMessage`, `pageMember`, `drainQueue`, `decideChannelPermission`, `stopChannelTurn`) · `src/components/localbot/channel.tsx` (new `ChannelPane`)
- `src/components/localbot/sidebar.tsx` (Channels group, New channel form, Open channel with…) · `shell.tsx` (`ChannelPane` xor `ChatPane`) · `src/runtime/harnessAdapter.ts` (optional `onAssistantText` sink) · `src/lib/types.ts`, `src/lib/store.ts` (`selectedChannelId`, `channels`, `channelSessions`, actions)
- `src/lib/channels.test.ts` (new, 29) · `scripts/prove-channels.mjs` (new) · `package.json` (`test` list, `prove:channels`)
- `STAGE_HANDOFF.md`, `LOCALBOT_HANDOFF.md`
- **Not touched:** `src/components/localbot/chat.tsx`, `dsh/localbot-fs.mjs`, `dsh/localbot-acp.cordis.yml`, dsh / ACP pins, `src/lib/fs/host-index.ts`, `src/lib/fs/scopes.ts`, `src/lib/harness/index.ts`, `src/lib/harness/process.ts`.

### Prove it

Command:

```
npm test && npm run prove:channels
```

Pass looks like:

```
ℹ pass 347
[prove-channels] ok: channels are a labelled group, not roster rows
[prove-channels] ok: selectBot clears selectedChannelId
[prove-channels] ok: selectChannel clears selectedBotId
[prove-channels] ok: channelRunner uses runAgentTurn
[prove-channels] ok: one runAgentTurn per member with the channel lines as user text
[prove-channels] ok: the reply lands on the shared transcript with speakerId
[prove-channels] ok: channelRunner has no second Harness loop / shared session
[prove-channels] ok: channelRunner never writes a handoff file
[prove-channels] ok: @ in a 1:1 chat still writes the handoff file before the turn
[prove-channels] ok: chat.tsx knows nothing about channels (1:1 unchanged)
[prove-channels] ok: channels/ under emp refused with OUTSIDE_SCOPE (got OUTSIDE_SCOPE)
[prove-channels] ok: one member refused (TOO_FEW_MEMBERS)
[prove-channels] ok: archived member refused (ARCHIVED)
[prove-channels] ok: record has exactly id, name, memberIds, createdAt, updatedAt
[prove-channels] ok: fresh process read back "launch" and its transcript (1 line)
[prove-channels] ok: removing down to one member refused (TOO_FEW_MEMBERS)
[prove-channels] ok: member reply carries speakerId
[prove-channels] ok: no @ → first member (Alice) only
[prove-channels] ok: several @ → mention order
[prove-channels] ok: non-member @ → nobody runs, name reported
[prove-channels] ok: Run all only with the explicit flag
[prove-channels] ok: BUSY queue keeps exactly one page per member
[prove-channels] ok: gate: non-member refused (NOT_MEMBER) — no run, no handoff
[prove-channels] ok: gate: a running turn makes Bob BUSY
[prove-channels] ok: gate: member archived after the fact → ARCHIVED (skip + system line)
[prove-channels] ok: gate: employee root gone → DISCONNECTED
[prove-channels] ok: delete removes record, transcript and both .bak files
STAGE16_CHANNELS_PASS static+live outside/refuse/record-fresh-process/members/transcript/turn-rules/busy-one/archived/disconnected/delete
```

`prove:channels` exits 1 when: a channel file is accepted under a scope root; the record or transcript is not readable by a **fresh `node` process** (a channel that exists only in React state); `channelRunner.ts` does not call `runAgentTurn` with the channel lines as `userText`, imports the Harness server functions / manager (second loop), contains `handoffTask` / `agentFsWrite` (non-member `@` handing off), does not route BUSY through `enqueuePage`, or contains an allow decision; `chat.tsx` drops `handoffTask` or `runAgentTurn`, `@` in a 1:1 no longer calls `handoffTask` before the turn, or `chat.tsx` learns about channels; `handoffTask` stops writing `task-*.md`; the sidebar loses `channels-section` / mixes channel rows into roster rows / reads `localStorage`; the shell or store can show / set both a bot and a channel; a store mutation bypasses the `channels*` server fns or `channels` is persisted; < 2 members is accepted (create or remove); an archived agent can be added; a non-member passes the gate; a BUSY / archived / DISCONNECTED member passes; `enqueuePage` keeps a second page; the dsh / ACP pins float; `localbot-fs.mjs` changes; or delete leaves a file. ~1 s.

### How I test in the app

1. `npm run dev` (or `npm run desktop`) with at least two active agents. Sidebar shows the **Channels** group (`CHANNELS 0`, **New channel**) under the agent sections. Open Alice's chat, then on Bob's row `…` → **Open channel with…** → a channel `Alice + Bob` appears under Channels with two mascots and opens; no agent row is highlighted (`selectedChannelId` xor `selectedBotId`). `ls {dataDir}/channels/` → `ch_….json` + `ch_….messages.json`.
2. Type `@Bob @Zed what is the plan?` → Enter. Transcript: your line, the system line `@Zed is not a member of #Alice + Bob — add them first. Nobody ran and nothing was handed off.`, then **Bob**'s reply with his mascot and name (with no GGUF staged: `Bob's model fixture is not on disk.` — the sidecar's model check). No `task-*.md` was written anywhere.
3. Type `Who should own the launch note?` (no `@`) → **Alice** (first member; the header says `no @ → Alice answers`) replies. Hover the channel name for the full rule tooltip.
4. Press **Run all once** → system line `<you> ran all members once: Alice, Bob.` then Alice, then Bob, one at a time. Press **Stop** during a turn to abort the active speaker.
5. `+` next to the member avatars → add **Cara** (3 members). Hover Cara's avatar → **×** removes her; removing down to one member is refused with the `TOO_FEW_MEMBERS` notice. Pencil / double-click renames; the trash deletes (record, transcript and `.bak`s gone).
6. Reload the page: the channel and its transcript are still there (read from `channels/`, not from the browser). Click Alice's row: her 1:1 chat is unchanged — no channel lines in it, `@Name` there still hands off to a file.
7. Start a long turn in Bob's 1:1 chat, then page `@Bob` in the channel twice: the first page queues (`Bob is busy — paged once when its current turn ends.`), the second is dropped (`…already has one page waiting — this page was dropped.`); when the 1:1 turn ends Bob answers in the channel once. Archive Bob → paging him yields `Bob is archived and was skipped.`

### Ready for

Nothing from the GrokBot list remains. Next only after I say GO.

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
