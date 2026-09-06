import { createServerFn } from "@tanstack/react-start";

export type { TurnInput, TurnMessage, TurnOutput, TurnToolCall } from "./turn-types.ts";

/**
 * Engine status for the header badge. The Safety switch (`allowHostedDemo`)
 * is reported so the UI can show it; LocalBot has no hosted engine — when
 * the switch is on, `harness-launch.ts` refuses to start a turn and the badge
 * says so. Stage 19 removed the template's hosted-demo chain; nothing here
 * reads an API key.
 */
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
  return {
    available: false,
    model: local.model || "local",
    engine: local.engine,
    ggufPath: local.ggufPath,
    loopback: local.loopback,
    ramEstimate: local.ramEstimate,
    badge: "Hosted demo is on — chat refused until Settings → Safety turns it off",
    allowHostedDemo: true,
  };
});
