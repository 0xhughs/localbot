/**
 * Stage 12: the stored agent colour, resolved to paint. `Bot.color` is an
 * `AgentColorId` written to agent.json; the roster row and the chat header
 * both paint with the hex this returns (mascot body fill + avatar ring).
 * Unknown ids fall back to the first palette colour so nothing renders unpainted.
 */
import { AGENT_COLORS, AGENT_COLOR_LIST, type AgentColorId } from "./types.ts";

export const FALLBACK_AGENT_COLOR: AgentColorId = AGENT_COLOR_LIST[0]!.id;

export function isAgentColorId(v: unknown): v is AgentColorId {
  return typeof v === "string" && v in AGENT_COLORS;
}

export function agentColorId(raw: unknown): AgentColorId {
  return isAgentColorId(raw) ? raw : FALLBACK_AGENT_COLOR;
}

export function agentColorHex(color: unknown): string {
  return AGENT_COLORS[agentColorId(color)].hex;
}

/** A darker tint of the colour for the mascot disc behind the body. */
export function agentColorBackdrop(color: unknown, alpha = 0.22): string {
  const hex = agentColorHex(color).replace("#", "");
  const n = parseInt(hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
