/**
 * Stage 16 — channel records on disk:
 *
 *   {dataDir}/channels/{id}.json            { id, name, memberIds, createdAt, updatedAt }
 *   {dataDir}/channels/{id}.messages.json   { version, channelId, messages[], updatedAt }
 *
 * Same containment idea as `chats/` and `routines/`: LocalBot metadata, never
 * work product. The folder is refused when it would sit under any of the
 * four scope roots (`assertChannelsOutsideScopes`, checked FIRST on every
 * write), so the model's file tools — which end in `resolveScopePath` — can
 * never read or write a channel. Every write is temp + rename
 * (`atomicWriteJson`), previous copy kept as `.bak`.
 *
 * The model has no path here. Channels are created / renamed / deleted and
 * members added / removed by the employee through the `channels*` server
 * functions → this module. Transcript lines are appended by the renderer
 * (the employee's line, each member's reply with `speakerId`, system notes).
 */
import fs from "node:fs";
import path from "node:path";
import {
  ChannelError,
  assertChannelId,
  cleanChannelName,
  cleanMemberIds,
  normalizeChannel,
  normalizeChannelMessage,
  CHANNEL_MIN_MEMBERS,
  type Channel,
  type ChannelMessage,
  type ChannelTranscript,
} from "../channels-model.ts";
import type { FoldersConfig } from "../types.ts";
import { atomicWriteJson, dataDir, isUnderDir } from "./disk.ts";
import type { RosterEntry } from "./host-index.ts";

export const CHANNELS_DIR = "channels";

export function channelsDir(): string {
  return path.join(dataDir(), CHANNELS_DIR);
}

export function channelPath(id: string): string {
  return path.join(channelsDir(), `${assertChannelId(id)}.json`);
}

export function channelMessagesPath(id: string): string {
  return path.join(channelsDir(), `${assertChannelId(id)}.messages.json`);
}

/** Channels are LocalBot metadata, never work product: refuse a channels dir inside any scope root. */
export function assertChannelsOutsideScopes(folders: FoldersConfig | null): string {
  const dir = channelsDir();
  if (!folders) return dir;
  for (const root of [folders.employeeRoot, folders.employeeShared, folders.departmentShared, folders.companyShared]) {
    if (root && isUnderDir(root, dir)) {
      throw new ChannelError(
        "OUTSIDE_SCOPE",
        `Refusing to store channels under a scope folder (${root}). Move LOCALBOT_DATA_DIR out of the work folders. Nothing was written.`,
      );
    }
  }
  return dir;
}

export function newChannelId(): string {
  return `ch_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function newChannelMessageId(): string {
  return `cmsg_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/* ---------- records ---------- */

export function readChannel(id: string): Channel | null {
  try {
    return normalizeChannel(JSON.parse(fs.readFileSync(channelPath(id), "utf8")));
  } catch {
    return null;
  }
}

export function requireChannel(id: string): Channel {
  const cur = readChannel(id);
  if (!cur) throw new ChannelError("NOT_FOUND", `No channel with id ${id}.`);
  return cur;
}

export function listChannels(): Channel[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(channelsDir()).filter((n) => n.endsWith(".json") && !n.endsWith(".messages.json") && !n.startsWith("."));
  } catch {
    return [];
  }
  const out: Channel[] = [];
  for (const n of names) {
    const id = n.slice(0, -".json".length);
    if (!/^ch_/.test(id)) continue;
    const c = readChannel(id);
    if (c) out.push(c);
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function writeChannel(channel: Channel, folders: FoldersConfig | null, now: Date): Channel {
  assertChannelsOutsideScopes(folders);
  const next: Channel = { ...channel, updatedAt: now.toISOString() };
  atomicWriteJson(channelPath(next.id), next);
  return next;
}

/* ---------- transcript ---------- */

export function readChannelMessages(id: string): ChannelTranscript {
  assertChannelId(id);
  try {
    const raw = JSON.parse(fs.readFileSync(channelMessagesPath(id), "utf8")) as Partial<ChannelTranscript>;
    const messages = (Array.isArray(raw.messages) ? raw.messages : []).map(normalizeChannelMessage).filter((m): m is ChannelMessage => m !== null);
    return { version: 1, channelId: id, messages, updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "" };
  } catch {
    return { version: 1, channelId: id, messages: [], updatedAt: "" };
  }
}

function writeChannelMessages(id: string, messages: ChannelMessage[], folders: FoldersConfig | null, now: Date): ChannelTranscript {
  assertChannelsOutsideScopes(folders);
  const file: ChannelTranscript = { version: 1, channelId: id, messages, updatedAt: now.toISOString() };
  atomicWriteJson(channelMessagesPath(id), file);
  return file;
}

/** Append lines to the shared transcript. The record must exist (NOT_FOUND otherwise). */
export function appendChannelMessages(id: string, incoming: readonly unknown[], folders: FoldersConfig | null, now: Date = new Date()): ChannelTranscript {
  assertChannelsOutsideScopes(folders);
  requireChannel(id);
  const clean: ChannelMessage[] = [];
  for (const raw of incoming) {
    const m = normalizeChannelMessage(raw);
    if (!m) throw new ChannelError("BAD_MESSAGE", "A channel message needs id, role (user | assistant | system) and content.");
    clean.push(m.createdAt ? m : { ...m, createdAt: now.toISOString() });
  }
  const cur = readChannelMessages(id);
  const seen = new Set(cur.messages.map((m) => m.id));
  const merged = [...cur.messages, ...clean.filter((m) => !seen.has(m.id))];
  return writeChannelMessages(id, merged, folders, now);
}

/* ---------- validation against the roster ---------- */

/** A member must exist on disk and not be archived (checked on create and on add). */
export function requireChannelMember(roster: readonly RosterEntry[], agentId: unknown): RosterEntry {
  if (typeof agentId !== "string" || !agentId) throw new ChannelError("UNKNOWN_AGENT", "Pick an agent to add.");
  const agent = roster.find((r) => r.id === agentId);
  if (!agent) throw new ChannelError("UNKNOWN_AGENT", `No agent with id ${agentId} in agents/. Nothing was written.`);
  if (agent.archived) throw new ChannelError("ARCHIVED", `${agent.name} is archived. Unarchive it before adding it to a channel. Nothing was written.`);
  return agent;
}

export type ChannelContext = { folders: FoldersConfig | null; roster: readonly RosterEntry[] };

export type ChannelInput = { name: string; memberIds: string[] };

export function createChannel(input: ChannelInput, ctx: ChannelContext, now: Date = new Date()): Channel {
  // Containment first: a channels dir inside a scope root is refused before anything else is looked at.
  assertChannelsOutsideScopes(ctx.folders);
  const name = cleanChannelName(input.name);
  const memberIds = cleanMemberIds(input.memberIds);
  for (const id of memberIds) requireChannelMember(ctx.roster, id);
  const channel: Channel = { id: newChannelId(), name, memberIds, createdAt: now.toISOString(), updatedAt: now.toISOString() };
  const written = writeChannel(channel, ctx.folders, now);
  writeChannelMessages(channel.id, [], ctx.folders, now);
  return written;
}

export function renameChannel(id: string, name: string, ctx: ChannelContext, now: Date = new Date()): Channel {
  assertChannelsOutsideScopes(ctx.folders);
  const cur = requireChannel(id);
  return writeChannel({ ...cur, name: cleanChannelName(name) }, ctx.folders, now);
}

/** Add one member. Archived → ARCHIVED; not in agents/ → UNKNOWN_AGENT; already there → ALREADY_MEMBER. */
export function addChannelMember(id: string, agentId: string, ctx: ChannelContext, now: Date = new Date()): Channel {
  assertChannelsOutsideScopes(ctx.folders);
  const cur = requireChannel(id);
  const agent = requireChannelMember(ctx.roster, agentId);
  if (cur.memberIds.includes(agent.id)) throw new ChannelError("ALREADY_MEMBER", `${agent.name} is already in #${cur.name}.`);
  return writeChannel({ ...cur, memberIds: [...cur.memberIds, agent.id] }, ctx.folders, now);
}

/** Remove one member; refused when the channel would drop below CHANNEL_MIN_MEMBERS (delete it instead). */
export function removeChannelMember(id: string, agentId: string, ctx: ChannelContext, now: Date = new Date()): Channel {
  assertChannelsOutsideScopes(ctx.folders);
  const cur = requireChannel(id);
  if (!cur.memberIds.includes(agentId)) throw new ChannelError("NOT_MEMBER", `That agent is not a member of #${cur.name}.`);
  if (cur.memberIds.length - 1 < CHANNEL_MIN_MEMBERS) {
    throw new ChannelError(
      "TOO_FEW_MEMBERS",
      `#${cur.name} needs at least ${CHANNEL_MIN_MEMBERS} members. Delete the channel instead of removing its last members.`,
    );
  }
  return writeChannel({ ...cur, memberIds: cur.memberIds.filter((m) => m !== agentId) }, ctx.folders, now);
}

/** Delete removes the record, the transcript and both `.bak` copies. Agent folders are never touched. */
export function deleteChannel(id: string): Channel | null {
  const cur = readChannel(id);
  for (const f of [channelPath(id), channelMessagesPath(id)]) {
    fs.rmSync(f, { force: true });
    fs.rmSync(`${f}.bak`, { force: true });
  }
  return cur;
}
