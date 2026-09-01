import { createServerFn } from "@tanstack/react-start";
import type { TurnInput, TurnOutput } from "./turn-types.ts";

export type { TurnInput, TurnMessage, TurnOutput, TurnToolCall } from "./turn-types.ts";

export const getAiStatus = createServerFn({ method: "POST" }).handler(async () => {
  const { loadConfig } = await import("../fs/disk.ts");
  const { engineStatus } = await import("./local-engine.ts");
  const cfg = loadConfig();
  const local = engineStatus();
  if (!cfg.allowHostedDemo) {
    return {
      available: local.ready,
      model: local.model || "local",
      engine: local.engine,
      ggufPath: local.ggufPath,
      loopback: local.loopback,
      ramEstimate: local.ramEstimate,
      badge: local.badge,
      allowHostedDemo: false,
    };
  }
  const hostedOn = Boolean(process.env.XAI_API_KEY);
  return {
    available: hostedOn,
    model: "grok-4.5",
    engine: "hosted-grok-4.5",
    ggufPath: local.ggufPath,
    loopback: local.loopback,
    ramEstimate: local.ramEstimate,
    badge: hostedOn ? "Hosted grok-4.5 (demo)" : "Hosted demo — no key",
    allowHostedDemo: true,
  };
});

export const runHarnessTurn = createServerFn({ method: "POST" })
  .validator((input: TurnInput) => input)
  .handler(async ({ data }): Promise<TurnOutput> => {
    const { executeTurn } = await import("./execute-turn.ts");
    return executeTurn(data);
  });
