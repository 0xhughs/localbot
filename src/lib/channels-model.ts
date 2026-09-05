/**
 * Stage 16 — Channels: the browser-safe half. Types, name / id rules, the
 * `@` parsing that decides who speaks, the one-page-per-member queue rule,
 * and the prompt a member gets when it is paged.
 *
 * No `node:` imports: `channel.tsx`, `sidebar.tsx`, `store.ts` and
 * `channelRunner.ts` import this. Everything that touches disk lives in
 * `src/lib/fs/channels.ts` (record + transcript) and the gates in
 * `src/lib/harness/channels.ts`, reached from the renderer only through the
 * `channels*` server functions.
 *
 * A channel is a shared thread + a member list. Every member keeps its own
 * Harness session: a turn in a channel is one `runAgentTurn({ botId })` for
 * ONE member, whose reply lands on the shared transcript with `speakerId`.
 *
 * Turn rules (see `planSpeakers`):
 *   - no `@`                → the FIRST member in `memberIds` answers (the default)
 *   - `@Alice` (a member)   → only Alice runs
 *   - several `@`           → those members, in mention order, one at a time
 *   - `@Someone` not member → nobody runs for that name; a system line says so.
 *                             No handoff file is written (that is the 1:1 rule).
 *   - "Run all members once" is a button, never implied by the text.
 */

export type ChannelRole = "user" | "assistant" | "system";

export type Channel = {
  id: string;
  name: string;
  /** Host-index agent ids (`bot.id`), in order. The first one is the default speaker. */
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ChannelChip = { id: string; kind: string; label: string; detail: string; status: string };

export type ChannelMessage = {
  id: string;
  role: ChannelRole;
  /** The member (`bot.id`) that said it; null for the employee and for system lines. */
  speakerId: string | null;
  content: string;
  createdAt: string;
  chips?: ChannelChip[];
};

export type ChannelTranscript = {
  version: 1;
  channelId: string;
  messages: ChannelMessage[];
  updatedAt: string;
};

export type ChannelErrorCode =
  | "BAD_NAME"
  | "BAD_ID"
  | "BAD_MESSAGE"
  | "TOO_FEW_MEMBERS"
  | "UNKNOWN_AGENT"
  | "ARCHIVED"
  | "ALREADY_MEMBER"
  | "NOT_MEMBER"
  | "NOT_FOUND"
  | "OUTSIDE_SCOPE"
  | "BUSY"
  | "DISCONNECTED"
  | "NOT_CONFIGURED";

export class ChannelError extends Error {
  code: ChannelErrorCode;
  constructor(code: ChannelErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ChannelError";
  }
}

export const CHANNEL_NAME_MAX = 60;
/** A channel is a room for at least two agents; below that it is a 1:1 chat, which already exists. */
export const CHANNEL_MIN_MEMBERS = 2;
/** How many recent channel lines a paged member sees as its user text. */
export const CHANNEL_CONTEXT_MESSAGES = 24;
/** A BUSY member gets at most this many queued pages; further pages are dropped with a system line. */
export const CHANNEL_QUEUE_PER_MEMBER = 1;
export const CHANNEL_ID_RE = /^ch_[A-Za-z0-9_-]{4,40}$/;
export const MENTION_RE = /@([A-Za-z0-9_-]+)/g;

/** Shown as the header tooltip so the default is documented where the employee sees it. */
export function channelTurnRulesText(firstMemberName: string | null): string {
  return [
    `No @ → the first member (${firstMemberName ?? "none yet"}) answers.`,
    "@Name → only that member runs. Several @ → those members, in mention order, one at a time.",
    "Run all once → every member, one at a time. Nobody runs unless you send.",
    "Each member keeps its own Harness session and its own permission grants.",
  ].join("\n");
}

export function assertChannelId(id: unknown): string {
  if (typeof id !== "string" || !CHANNEL_ID_RE.test(id)) throw new ChannelError("BAD_ID", `Bad channel id: ${String(id)}`);
  return id;
}

export function cleanChannelName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ").replace(/^#+\s*/, "") : "";
  if (!name) throw new ChannelError("BAD_NAME", "Channel name cannot be empty.");
  if ([...name].some((c) => c.charCodeAt(0) < 0x20)) throw new ChannelError("BAD_NAME", "Channel name cannot contain control characters.");
  if (name.length > CHANNEL_NAME_MAX) throw new ChannelError("BAD_NAME", `Channel name is longer than ${CHANNEL_NAME_MAX} characters.`);
  return name;
}

/** Member ids as given, deduplicated, order kept. Throws when fewer than CHANNEL_MIN_MEMBERS remain. */
export function cleanMemberIds(raw: unknown): string[] {
  const ids: string[] = [];
  for (const v of Array.isArray(raw) ? raw : []) {
    if (typeof v !== "string" || !v.trim()) continue;
    if (!ids.includes(v)) ids.push(v);
  }
  if (ids.length < CHANNEL_MIN_MEMBERS) {
    throw new ChannelError("TOO_FEW_MEMBERS", `A channel needs at least ${CHANNEL_MIN_MEMBERS} members (got ${ids.length}). Use the agent's own chat for one.`);
  }
  return ids;
}

export function normalizeChannel(raw: unknown): Channel {
  if (!raw || typeof raw !== "object") throw new ChannelError("NOT_FOUND", "Channel record is not an object.");
  const r = raw as Record<string, unknown>;
  return {
    id: assertChannelId(r.id),
    name: cleanChannelName(r.name),
    memberIds: cleanMemberIds(r.memberIds),
    createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : "",
  };
}

export function normalizeChannelMessage(raw: unknown): ChannelMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const role = r.role === "user" || r.role === "assistant" || r.role === "system" ? r.role : null;
  if (!role || typeof r.content !== "string" || typeof r.id !== "string" || !r.id) return null;
  const chips = Array.isArray(r.chips)
    ? (r.chips.filter((c) => c && typeof c === "object" && typeof (c as ChannelChip).label === "string") as ChannelChip[])
    : undefined;
  return {
    id: r.id,
    role,
    speakerId: typeof r.speakerId === "string" && r.speakerId ? r.speakerId : null,
    content: r.content,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
    ...(chips && chips.length > 0 ? { chips } : {}),
  };
}

/* ---------- who speaks ---------- */

export type ChannelMember = { id: string; name: string };

/** `@Name` tokens in order of appearance, deduplicated case-insensitively. */
export function parseMentions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(MENTION_RE)) {
    const name = m[1]!;
    if (!out.some((n) => n.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

export type SpeakerPlan = {
  /** Member ids to run, in order, one at a time. */
  speakers: string[];
  /** `@` names that are not members — a system line each, no run, no handoff file. */
  unknown: string[];
  /** Why the plan looks the way it does (shown in the transcript's system line). */
  reason: "default-first" | "mentions" | "all" | "nobody";
};

/**
 * The turn rule. `all` is the explicit "Run all members once" button; the
 * text alone never means everyone. With no members the plan runs nobody.
 */
export function planSpeakers(text: string, members: readonly ChannelMember[], opts: { all?: boolean } = {}): SpeakerPlan {
  if (members.length === 0) return { speakers: [], unknown: [], reason: "nobody" };
  if (opts.all) return { speakers: members.map((m) => m.id), unknown: [], reason: "all" };
  const mentions = parseMentions(text);
  if (mentions.length === 0) return { speakers: [members[0]!.id], unknown: [], reason: "default-first" };
  const speakers: string[] = [];
  const unknown: string[] = [];
  for (const name of mentions) {
    const m = members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!m) unknown.push(name);
    else if (!speakers.includes(m.id)) speakers.push(m.id);
  }
  return { speakers, unknown, reason: speakers.length > 0 || unknown.length > 0 ? "mentions" : "default-first" };
}

/* ---------- BUSY queue: at most one page per member ---------- */

/**
 * Pure. `queue` is the list of member ids waiting for their turn in a channel;
 * a member appears at most CHANNEL_QUEUE_PER_MEMBER times. Returns the next
 * queue and whether this page was kept.
 */
export function enqueuePage(queue: readonly string[], botId: string): { queue: string[]; added: boolean } {
  const have = queue.filter((id) => id === botId).length;
  if (have >= CHANNEL_QUEUE_PER_MEMBER) return { queue: [...queue], added: false };
  return { queue: [...queue, botId], added: true };
}

/* ---------- the prompt a paged member sees ---------- */

export type ChannelPromptInput = {
  channel: Pick<Channel, "name" | "memberIds">;
  messages: readonly ChannelMessage[];
  /** The member that is about to speak. */
  speaker: ChannelMember;
  /** Names for every member id (archived / gone members fall back to their id). */
  names: Readonly<Record<string, string>>;
  employeeName: string;
  /** Why this member runs now — rendered so the model knows it was paged, not addressed by default. */
  why: SpeakerPlan["reason"];
  max?: number;
};

export function speakerLabel(m: ChannelMessage, names: Readonly<Record<string, string>>, employeeName: string): string {
  if (m.role === "system") return "system";
  if (m.role === "user" || !m.speakerId) return employeeName;
  return names[m.speakerId] ?? m.speakerId;
}

/**
 * The user text of the member's `runAgentTurn`: the last `max` channel lines
 * with speaker names (oldest first) and an instruction to reply as itself.
 * The member's own earlier lines are included so it can continue them.
 */
export function renderChannelPrompt(input: ChannelPromptInput): string {
  const max = input.max ?? CHANNEL_CONTEXT_MESSAGES;
  const others = input.channel.memberIds.filter((id) => id !== input.speaker.id).map((id) => input.names[id] ?? id);
  const recent = input.messages.slice(-max);
  const lines = recent.map((m) => `[${speakerLabel(m, input.names, input.employeeName)}] ${m.content}`);
  const why =
    input.why === "all"
      ? `${input.employeeName} pressed "Run all members once"; every member answers in turn.`
      : input.why === "mentions"
        ? `You were paged with @${input.speaker.name}.`
        : `You are the first member of this channel, so you answer when nobody is paged.`;
  return [
    `You are ${input.speaker.name}, a member of the channel #${input.channel.name} with ${others.length ? others.join(", ") : "nobody else yet"} and ${input.employeeName} (the employee).`,
    `Everyone in the channel reads every line. Reply as ${input.speaker.name} only — never write lines for the others. Keep it short unless asked otherwise.`,
    why,
    "",
    `Recent channel messages (oldest first, ${lines.length} of ${input.messages.length}):`,
    ...(lines.length ? lines : ["(no messages yet)"]),
    "",
    `Reply now as ${input.speaker.name}.`,
  ].join("\n");
}
