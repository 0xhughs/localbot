/**
 * Stage 16 — the host-side gates for a channel turn. Before the renderer
 * pages a member through `runAgentTurn` it asks `gateChannelSpeaker`; the
 * sidecar decides, the renderer only executes. There is no second Harness
 * loop here: this module never spawns dsh, never opens an ACP session and
 * never prompts. It reads the channel record, the roster, the employee root
 * and `HarnessManager.hasActiveTurn`.
 *
 * A member does NOT run when:
 *   - it is not a member of the channel (NOT_MEMBER — and no handoff file is written)
 *   - it is not in agents/ any more (UNKNOWN_AGENT), or is archived (ARCHIVED)
 *   - the employee root is DISCONNECTED (share unmounted, folder gone)
 *   - a turn is already running for that agent (BUSY → the renderer queues at most one page)
 *
 * Same gates as routines (src/lib/harness/routines.ts); the codes match.
 */
import { assertScopeConnected, ScopeError } from "../fs/scopes.ts";
import type { RosterEntry } from "../fs/host-index.ts";
import { ChannelError, type Channel, type ChannelErrorCode } from "../channels-model.ts";
import { assertChannelsOutsideScopes, requireChannel } from "../fs/channels.ts";
import type { FoldersConfig } from "../types.ts";

export type ChannelGateDeps = {
  folders: FoldersConfig | null;
  roster: readonly RosterEntry[];
  /** `HarnessManager.hasActiveTurn(agentName)`. */
  hasActiveTurn: (agentName: string) => boolean;
};

/**
 * The gates in order. Throws ChannelError with the code the UI shows;
 * returns the roster row when every gate passes. Pure apart from the
 * `statSync` inside `assertScopeConnected` (DISCONNECTED).
 */
export function gateChannelSpeaker(channel: Channel, agentId: string, deps: ChannelGateDeps): RosterEntry {
  if (!deps.folders) throw new ChannelError("NOT_CONFIGURED", "Folders are not set up yet. Open Settings → Folders.");
  assertChannelsOutsideScopes(deps.folders);
  if (!channel.memberIds.includes(agentId)) {
    throw new ChannelError("NOT_MEMBER", `That agent is not a member of #${channel.name}. Add it first — nothing was handed off.`);
  }
  const agent = deps.roster.find((r) => r.id === agentId);
  if (!agent) throw new ChannelError("UNKNOWN_AGENT", `A member of #${channel.name} is not in agents/ any more; it was skipped.`);
  if (agent.archived) throw new ChannelError("ARCHIVED", `${agent.name} is archived and was skipped. Unarchive it to page it here.`);
  try {
    assertScopeConnected(deps.folders, "private");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ChannelError(err instanceof ScopeError && err.code === "DISCONNECTED" ? "DISCONNECTED" : "NOT_CONFIGURED", msg);
  }
  if (deps.hasActiveTurn(agent.name)) {
    throw new ChannelError("BUSY", `${agent.name} is still working on another message.`);
  }
  return agent;
}

export type MemberGate =
  | { agentId: string; ok: true; agentName: string }
  | { agentId: string; ok: false; code: ChannelErrorCode; reason: string };

/** Gate one member by channel id (the server function's shape). */
export function channelGate(channelId: string, agentId: string, deps: ChannelGateDeps): MemberGate {
  const channel = requireChannel(channelId);
  try {
    const agent = gateChannelSpeaker(channel, agentId, deps);
    return { agentId, ok: true, agentName: agent.name };
  } catch (err) {
    const code: ChannelErrorCode = err instanceof ChannelError ? err.code : "NOT_CONFIGURED";
    return { agentId, ok: false, code, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Every member's gate at once (the pane shows why someone would be skipped). */
export function channelGateAll(channelId: string, deps: ChannelGateDeps): MemberGate[] {
  const channel = requireChannel(channelId);
  return channel.memberIds.map((agentId) => {
    try {
      const agent = gateChannelSpeaker(channel, agentId, deps);
      return { agentId, ok: true as const, agentName: agent.name };
    } catch (err) {
      const code: ChannelErrorCode = err instanceof ChannelError ? err.code : "NOT_CONFIGURED";
      return { agentId, ok: false as const, code, reason: err instanceof Error ? err.message : String(err) };
    }
  });
}
