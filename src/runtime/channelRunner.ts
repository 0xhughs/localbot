/**
 * Stage 16 — the renderer half of Channels. A channel turn is ONE member's
 * `runAgentTurn({ botId })` — the SAME call `send()` in chat.tsx and the
 * routine runner make. There is no second loop and no shared session: this
 * file never imports the harness server functions or the manager class. It
 * decides who speaks (`planSpeakers`), asks the sidecar's gate
 * (`channelsGate`: NOT_MEMBER / ARCHIVED / DISCONNECTED / BUSY), builds the
 * member's user text from the last N channel lines (`renderChannelPrompt`),
 * runs the turn, and appends the reply to the shared transcript with the
 * speaker id (`appendChannelMessage` → `channelsAppend`).
 *
 * Rules:
 *   - no `@` → the first member; `@Alice` → Alice only; several → in order,
 *     one at a time; "Run all members once" only when `all: true` is passed
 *     by the button.
 *   - `@Name` that is not a member → a system line. Nothing runs and no
 *     handoff file is written (that is the 1:1 chat's rule, untouched).
 *   - ARCHIVED / DISCONNECTED → skip + system line.
 *   - BUSY (sidecar turn, a 1:1 turn in this window, or another speaker in
 *     this channel) → queue at most ONE page per member (`enqueuePage`); it
 *     runs when the member is free. A member never waits on itself, so no
 *     deadlock.
 *   - Permission cards stay per-agent: the card is answered for that member's
 *     turn and `runAgentTurn` keeps checking that agent's own chat grants.
 */
import { runAgentTurn } from "@/runtime/harnessAdapter";
import { channelsGate } from "@/lib/runtime/channels";
import type { MemberGate } from "@/lib/harness/channels";
import {
  enqueuePage,
  planSpeakers,
  renderChannelPrompt,
  type Channel,
  type ChannelMember,
  type SpeakerPlan,
} from "@/lib/channels-model";
import { useLocalBot } from "@/lib/store";
import type { PermissionDecision, ToolChip } from "@/lib/types";
import { uid } from "@/lib/utils";

export type RunTurn = typeof runAgentTurn;

export type ChannelRunnerDeps = {
  turn: RunTurn;
  gate: (channelId: string, agentId: string) => Promise<{ ok: true; gate: MemberGate } | { ok: false; error: string; code: string }>;
};

const defaultDeps: ChannelRunnerDeps = {
  turn: runAgentTurn,
  gate: (id, agentId) => channelsGate({ data: { id, agentId } }),
};

export type PageOutcome =
  | { ran: true; agentId: string; stopped: boolean; error: string | null }
  | { ran: false; agentId: string; code: string; reason: string; queued: boolean };

export type SendOutcome = {
  plan: SpeakerPlan;
  outcomes: PageOutcome[];
};

/* ---------- per-channel turn plumbing (module state, like chat.tsx's refs) ---------- */

const permResolvers = new Map<string, (d: PermissionDecision) => void>();
const aborts = new Map<string, AbortController>();
const draining = new Set<string>();
let watcher: (() => void) | null = null;

/** The pane's Allow once / Allow for this chat / Deny for the active speaker's request. */
export function decideChannelPermission(channelId: string, d: PermissionDecision): void {
  permResolvers.get(channelId)?.(d);
  permResolvers.delete(channelId);
  useLocalBot.getState().patchChannelSession(channelId, { pendingPermission: null });
}

/** Stop: aborts the active speaker's turn (ACP session/cancel through the adapter) and drops the queue. */
export function stopChannelTurn(channelId: string): void {
  const s = useLocalBot.getState();
  const sess = s.channelSessions[channelId];
  aborts.get(channelId)?.abort();
  if (sess?.activeSpeakerId) s.requestStop(sess.activeSpeakerId);
  if (sess && sess.queued.length > 0) s.patchChannelSession(channelId, { queued: [] });
}

function employeeName(): string {
  const s = useLocalBot.getState();
  return (s.employees.find((e) => e.id === s.activeEmployeeId) ?? s.employees[0])?.displayName || "You";
}

/** Members that are in this window's roster, in `memberIds` order (gone agents are skipped here and named by id below). */
export function membersOf(channel: Channel): ChannelMember[] {
  const bots = useLocalBot.getState().bots;
  const out: ChannelMember[] = [];
  for (const id of channel.memberIds) {
    const b = bots.find((x) => x.id === id);
    if (b) out.push({ id: b.id, name: b.name });
  }
  return out;
}

function namesOf(channel: Channel): Record<string, string> {
  const bots = useLocalBot.getState().bots;
  const names: Record<string, string> = {};
  for (const id of channel.memberIds) names[id] = bots.find((b) => b.id === id)?.name ?? id;
  return names;
}

function systemLine(channelId: string, content: string): Promise<unknown> {
  return useLocalBot.getState().appendChannelMessage(channelId, { role: "system", speakerId: null, content });
}

/** True while this agent has a turn in flight in this window (1:1 chat, routine, or another channel). */
function rendererBusy(agentId: string): boolean {
  return Boolean(useLocalBot.getState().sessions[agentId]?.running);
}

/* ---------- the entry point the composer calls ---------- */

/**
 * The employee's line goes on the shared transcript as `role: user`, then the
 * speakers the text (or the Run-all button) selects run one after another.
 */
export async function sendChannelMessage(
  channelId: string,
  text: string,
  opts: { all?: boolean } = {},
  deps: ChannelRunnerDeps = defaultDeps,
): Promise<SendOutcome | null> {
  const trimmed = text.trim();
  const s = useLocalBot.getState();
  const channel = s.channels.find((c) => c.id === channelId);
  if (!channel) return null;
  if (!trimmed && !opts.all) return null;
  if (trimmed) await s.appendChannelMessage(channelId, { role: "user", speakerId: null, content: trimmed });

  const members = membersOf(channel);
  const plan = planSpeakers(trimmed, members, { all: opts.all });
  if (plan.reason === "all") {
    await systemLine(channelId, `${employeeName()} ran all members once: ${members.map((m) => m.name).join(", ")}.`);
  }
  for (const name of plan.unknown) {
    await systemLine(channelId, `@${name} is not a member of #${channel.name} — add them first. Nobody ran and nothing was handed off.`);
  }
  if (plan.reason === "nobody") {
    await systemLine(channelId, `No member of #${channel.name} is in this roster, so nobody ran.`);
  }
  const outcomes: PageOutcome[] = [];
  for (const agentId of plan.speakers) {
    outcomes.push(await pageMember(channelId, agentId, plan.reason, deps));
  }
  return { plan, outcomes };
}

/* ---------- one member, one runAgentTurn ---------- */

function queuePage(channelId: string, botId: string, botName: string, reason: string): PageOutcome {
  const s = useLocalBot.getState();
  const sess = s.channelSessions[channelId];
  const { queue, added } = enqueuePage(sess?.queued ?? [], botId);
  s.patchChannelSession(channelId, { queued: queue });
  void systemLine(
    channelId,
    added
      ? `${botName} is busy — paged once when its current turn ends.`
      : `${botName} is busy and already has one page waiting — this page was dropped.`,
  );
  ensureQueueWatcher();
  return { ran: false, agentId: botId, code: "BUSY", reason, queued: added };
}

/**
 * Page one member: gate on the sidecar, then `runAgentTurn` for THAT member
 * with the recent channel lines as its user text. `why` is rendered into the
 * prompt so the model knows whether it was paged or answers by default.
 */
export async function pageMember(
  channelId: string,
  botId: string,
  why: SpeakerPlan["reason"],
  deps: ChannelRunnerDeps = defaultDeps,
): Promise<PageOutcome> {
  const s = useLocalBot.getState();
  const channel = s.channels.find((c) => c.id === channelId);
  if (!channel) return { ran: false, agentId: botId, code: "NOT_FOUND", reason: "Channel is gone.", queued: false };
  const bot = s.bots.find((b) => b.id === botId);
  if (!bot) {
    await systemLine(channelId, `A member (${botId}) is not in this roster any more and was skipped.`);
    return { ran: false, agentId: botId, code: "UNKNOWN_AGENT", reason: "Not in the roster.", queued: false };
  }
  const sess = s.channelSessions[channelId];
  // Another speaker is mid-turn in this channel, or this agent is mid-turn elsewhere in this window: queue, never wait.
  if (sess?.activeSpeakerId || rendererBusy(bot.id)) {
    return queuePage(channelId, bot.id, bot.name, sess?.activeSpeakerId ? "Another member is speaking in this channel." : `${bot.name} is busy in this window.`);
  }
  const gate = await deps.gate(channelId, bot.id);
  if (!gate.ok) {
    await systemLine(channelId, `${bot.name} could not be paged: ${gate.error}`);
    return { ran: false, agentId: bot.id, code: gate.code, reason: gate.error, queued: false };
  }
  if (!gate.gate.ok) {
    if (gate.gate.code === "BUSY") return queuePage(channelId, bot.id, bot.name, gate.gate.reason);
    // NOT_MEMBER / UNKNOWN_AGENT / ARCHIVED / DISCONNECTED / NOT_CONFIGURED: skip + say why. No handoff file.
    await systemLine(channelId, gate.gate.reason);
    return { ran: false, agentId: bot.id, code: gate.gate.code, reason: gate.gate.reason, queued: false };
  }

  const store = useLocalBot.getState();
  store.patchChannelSession(channelId, { activeSpeakerId: bot.id, chips: [], pendingPermission: null });
  store.setSessionRunning(bot.id, true);
  const ac = new AbortController();
  aborts.set(channelId, ac);
  const userText = renderChannelPrompt({
    channel,
    messages: store.channelSessions[channelId]?.messages ?? [],
    speaker: { id: bot.id, name: bot.name },
    names: namesOf(channel),
    employeeName: employeeName(),
    why,
  });
  const live: ToolChip[] = [];
  const replyIds: string[] = [];
  let result: Awaited<ReturnType<RunTurn>>;
  try {
    result = await deps.turn({
      botId: bot.id,
      userText,
      abort: ac.signal,
      events: {
        onModel: (info) => {
          if (info.restarted) {
            void systemLine(channelId, `Switched llama-server to ${info.name}${info.path ? ` (${info.path.split(/[\\/]/).pop()})` : ""} for ${bot.name}.`);
          }
          if (info.notice) void systemLine(channelId, `${bot.name}: ${info.notice}`);
        },
        onSession: (info) => {
          if (info.origin === "resumed") void systemLine(channelId, `${bot.name} resumed its previous Harness session.`);
        },
        onChip: (chip) => {
          live.push(chip);
          useLocalBot.getState().patchChannelSession(channelId, { chips: [...live] });
        },
        onChipUpdate: (id, patch) => {
          const i = live.findIndex((c) => c.id === id);
          if (i >= 0) live[i] = { ...live[i]!, ...patch };
          useLocalBot.getState().patchChannelSession(channelId, { chips: [...live] });
        },
        // Per-agent: the card is for this member's turn; runAgentTurn already applied this agent's own chat grants.
        askPermission: (req) =>
          new Promise<PermissionDecision>((resolve) => {
            permResolvers.set(channelId, resolve);
            useLocalBot.getState().patchChannelSession(channelId, { pendingPermission: req });
          }),
        // The reply lands on the shared transcript with the speaker id, not in the member's 1:1 chat.
        onAssistantText: (text) => {
          const id = uid("cmsg");
          replyIds.push(id);
          void useLocalBot.getState().appendChannelMessage(channelId, { id, role: "assistant", speakerId: bot.id, content: text });
        },
      },
    });
  } catch (err) {
    result = { stopped: false, error: err instanceof Error ? err.message : String(err) };
  }
  aborts.delete(channelId);
  permResolvers.delete(channelId);
  const after = useLocalBot.getState();
  after.setSessionRunning(bot.id, false);
  after.clearStop(bot.id);
  after.patchChannelSession(channelId, { activeSpeakerId: null, pendingPermission: null, chips: [] });
  const lastReply = replyIds[replyIds.length - 1];
  if (lastReply && live.length > 0) after.patchChannelMessage(channelId, lastReply, { chips: [...live] });
  if (result.stopped) await systemLine(channelId, `${bot.name} stopped.`);
  else if (result.error) await after.appendChannelMessage(channelId, { role: "assistant", speakerId: bot.id, content: result.error });
  void drainQueue(channelId, deps);
  return { ran: true, agentId: bot.id, stopped: result.stopped, error: result.error ?? null };
}

/* ---------- the BUSY queue ---------- */

/** Run the first queued member that is free now. One at a time per channel; never re-entered. */
export async function drainQueue(channelId: string, deps: ChannelRunnerDeps = defaultDeps): Promise<void> {
  if (draining.has(channelId)) return;
  const s = useLocalBot.getState();
  const sess = s.channelSessions[channelId];
  if (!sess || sess.activeSpeakerId || sess.queued.length === 0) return;
  const next = sess.queued.find((id) => !rendererBusy(id));
  if (!next) return;
  draining.add(channelId);
  try {
    s.patchChannelSession(channelId, { queued: sess.queued.filter((id) => id !== next) });
    await pageMember(channelId, next, "mentions", deps);
  } finally {
    draining.delete(channelId);
  }
}

/** A queued page waits for a 1:1 turn elsewhere; when any agent stops running, try every channel's queue once. */
function ensureQueueWatcher(): void {
  if (watcher) return;
  watcher = useLocalBot.subscribe((state, prev) => {
    if (state.sessions === prev.sessions && state.channelSessions === prev.channelSessions) return;
    for (const [channelId, sess] of Object.entries(state.channelSessions)) {
      if (sess.queued.length > 0 && !sess.activeSpeakerId && sess.queued.some((id) => !rendererBusy(id))) void drainQueue(channelId);
    }
  });
}
