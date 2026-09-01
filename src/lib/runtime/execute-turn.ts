import { loadConfig } from "../fs/disk.ts";
import { runLocalTurn } from "./local-engine.ts";
import { runHostedTurn } from "./hosted-turn.ts";
import type { TurnInput, TurnOutput } from "./turn-types.ts";

/** Default path is local GGUF. Hosted grok-4.5 only if allowHostedDemo is on. */
export async function executeTurn(data: TurnInput): Promise<TurnOutput> {
  const cfg = loadConfig();
  if (cfg.allowHostedDemo) {
    return runHostedTurn(data);
  }
  return runLocalTurn(data);
}
