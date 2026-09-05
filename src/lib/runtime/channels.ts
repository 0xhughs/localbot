/**
 * Stage 16 — server functions for Channels. The renderer talks only to these.
 * Records and transcripts live in `{dataDir}/channels/` (src/lib/fs/channels.ts);
 * the per-member gates live in src/lib/harness/channels.ts. No turn is started
 * here: the renderer pages a member through `runAgentTurn` exactly like a typed
 * 1:1 message, then appends the reply with `channelsAppend`.
 */
import { createServerFn } from "@tanstack/react-start";
import type { Channel, ChannelErrorCode, ChannelTranscript } from "../channels-model.ts";
import type { MemberGate } from "../harness/channels.ts";

export type ChannelsFail = { ok: false; error: string; code: ChannelErrorCode | string };
export type ChannelsListResult = { ok: true; channels: Channel[]; dir: string } | ChannelsFail;
export type ChannelsOneResult = { ok: true; channel: Channel } | ChannelsFail;
export type ChannelsReadResult = { ok: true; channel: Channel; transcript: ChannelTranscript } | ChannelsFail;
export type ChannelsAppendResult = { ok: true; transcript: ChannelTranscript } | ChannelsFail;
export type ChannelsGateResult = { ok: true; gate: MemberGate } | ChannelsFail;
export type ChannelsGateAllResult = { ok: true; gates: MemberGate[] } | ChannelsFail;

function fail(err: unknown): ChannelsFail {
  const code = err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string" ? (err as { code: string }).code : "ERROR";
  return { ok: false, error: err instanceof Error ? err.message : String(err), code };
}

async function ctx() {
  const { loadConfig } = await import("../fs/disk.ts");
  const { loadRoster } = await import("../fs/host-index.ts");
  const cfg = loadConfig();
  let roster: Awaited<ReturnType<typeof loadRoster>> = [];
  if (cfg.folders) {
    try {
      roster = loadRoster(cfg.folders);
    } catch {
      roster = [];
    }
  }
  return { folders: cfg.folders, roster };
}

export const channelsList = createServerFn({ method: "POST" }).handler(async (): Promise<ChannelsListResult> => {
  const { listChannels, channelsDir, assertChannelsOutsideScopes } = await import("../fs/channels.ts");
  try {
    const c = await ctx();
    assertChannelsOutsideScopes(c.folders);
    return { ok: true, channels: listChannels(), dir: channelsDir() };
  } catch (err) {
    return fail(err);
  }
});

/** Employee only (sidebar "New channel" / roster "Open channel with…"). The model never reaches this. */
export const channelsCreate = createServerFn({ method: "POST" })
  .validator((input: { name: string; memberIds: string[] }) => input)
  .handler(async ({ data }): Promise<ChannelsOneResult> => {
    const { createChannel } = await import("../fs/channels.ts");
    try {
      return { ok: true, channel: createChannel({ name: data.name, memberIds: data.memberIds }, await ctx()) };
    } catch (err) {
      return fail(err);
    }
  });

export const channelsRename = createServerFn({ method: "POST" })
  .validator((input: { id: string; name: string }) => input)
  .handler(async ({ data }): Promise<ChannelsOneResult> => {
    const { renameChannel } = await import("../fs/channels.ts");
    try {
      return { ok: true, channel: renameChannel(data.id, data.name, await ctx()) };
    } catch (err) {
      return fail(err);
    }
  });

export const channelsDelete = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; removed: boolean } | ChannelsFail> => {
    const { deleteChannel, assertChannelsOutsideScopes } = await import("../fs/channels.ts");
    try {
      const c = await ctx();
      assertChannelsOutsideScopes(c.folders);
      return { ok: true, removed: deleteChannel(data.id) !== null };
    } catch (err) {
      return fail(err);
    }
  });

export const channelsAddMember = createServerFn({ method: "POST" })
  .validator((input: { id: string; agentId: string }) => input)
  .handler(async ({ data }): Promise<ChannelsOneResult> => {
    const { addChannelMember } = await import("../fs/channels.ts");
    try {
      return { ok: true, channel: addChannelMember(data.id, data.agentId, await ctx()) };
    } catch (err) {
      return fail(err);
    }
  });

export const channelsRemoveMember = createServerFn({ method: "POST" })
  .validator((input: { id: string; agentId: string }) => input)
  .handler(async ({ data }): Promise<ChannelsOneResult> => {
    const { removeChannelMember } = await import("../fs/channels.ts");
    try {
      return { ok: true, channel: removeChannelMember(data.id, data.agentId, await ctx()) };
    } catch (err) {
      return fail(err);
    }
  });

/** The record + the whole shared transcript (opening a channel). */
export const channelsRead = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<ChannelsReadResult> => {
    const { requireChannel, readChannelMessages, assertChannelsOutsideScopes } = await import("../fs/channels.ts");
    try {
      const c = await ctx();
      assertChannelsOutsideScopes(c.folders);
      return { ok: true, channel: requireChannel(data.id), transcript: readChannelMessages(data.id) };
    } catch (err) {
      return fail(err);
    }
  });

/** Append transcript lines (the employee's line, a member's reply with speakerId, system notes). */
export const channelsAppend = createServerFn({ method: "POST" })
  .validator((input: { id: string; messages: unknown[] }) => input)
  .handler(async ({ data }): Promise<ChannelsAppendResult> => {
    const { appendChannelMessages } = await import("../fs/channels.ts");
    try {
      const c = await ctx();
      return { ok: true, transcript: appendChannelMessages(data.id, data.messages, c.folders) };
    } catch (err) {
      return fail(err);
    }
  });

/** May this member run now? NOT_MEMBER / UNKNOWN_AGENT / ARCHIVED / DISCONNECTED / BUSY otherwise. */
export const channelsGate = createServerFn({ method: "POST" })
  .validator((input: { id: string; agentId: string }) => input)
  .handler(async ({ data }): Promise<ChannelsGateResult> => {
    const { channelGate } = await import("../harness/channels.ts");
    const { getHarnessManager } = await import("../harness/index.ts");
    try {
      const c = await ctx();
      const mgr = getHarnessManager();
      return { ok: true, gate: channelGate(data.id, data.agentId, { ...c, hasActiveTurn: (n) => mgr.hasActiveTurn(n) }) };
    } catch (err) {
      return fail(err);
    }
  });

export const channelsGateAll = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<ChannelsGateAllResult> => {
    const { channelGateAll } = await import("../harness/channels.ts");
    const { getHarnessManager } = await import("../harness/index.ts");
    try {
      const c = await ctx();
      const mgr = getHarnessManager();
      return { ok: true, gates: channelGateAll(data.id, { ...c, hasActiveTurn: (n) => mgr.hasActiveTurn(n) }) };
    } catch (err) {
      return fail(err);
    }
  });
