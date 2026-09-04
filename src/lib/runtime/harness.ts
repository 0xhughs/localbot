/**
 * Server functions for the DeepSeek Harness path. The renderer talks only to
 * these; they talk to the sidecar-owned ACP process (src/lib/harness). The
 * model server is still llama.cpp on loopback, started by ensureLocalServer.
 *
 * Request/response only (createServerFn cannot stream), so a turn is started,
 * then polled for committed ACP updates. ACP at this pin emits committed
 * blocks, not token deltas — nothing here fakes streaming.
 */
import { createServerFn } from "@tanstack/react-start";
import type { TurnEvent } from "../harness/turns.ts";

export type HarnessPromptInput = { agentName: string; text: string };
export type HarnessPromptResult =
  | {
      ok: true;
      turnId: string;
      sessionId: string;
      resumed: boolean;
      /** Stage 6: which file / route this turn runs on, and whether llama-server was restarted for it. */
      model: { route: "llama.cpp" | "ollama"; name: string; path: string | null; source: "agent" | "fallback" | "none" | "ollama"; notice: string | null; restarted: boolean };
    }
  | { ok: false; error: string };

export type HarnessPollInput = { turnId: string; after: number };
export type HarnessPollResult =
  | { ok: true; events: TurnEvent[]; status: "running" | "done" | "error"; stopReason: string | null; error: string | null }
  | { ok: false; error: string };

export type HarnessDecideInput = { turnId: string; requestId: string; optionId: string | null };
export type HarnessCancelInput = { turnId: string };

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const harnessPrompt = createServerFn({ method: "POST" })
  .validator((input: HarnessPromptInput) => input)
  .handler(async ({ data }): Promise<HarnessPromptResult> => {
    const { appLaunchReport } = await import("./harness-launch.ts");
    const { getHarnessManager } = await import("../harness/index.ts");
    try {
      const report = await appLaunchReport(data.agentName);
      const spec = report.spec;
      const mgr = getHarnessManager();
      const session = await mgr.ensureSession(spec, data.agentName);
      const rec = await mgr.prompt(spec, data.agentName, data.text);
      return {
        ok: true,
        turnId: rec.turnId,
        sessionId: rec.sessionId,
        resumed: session.resumed,
        model: {
          route: report.route,
          name: spec.modelName ?? "Local GGUF",
          path: report.model?.path ?? null,
          source: report.route === "ollama" ? "ollama" : (report.model?.source ?? "none"),
          notice: report.model?.notice ?? null,
          restarted: report.restarted,
        },
      };
    } catch (err) {
      return { ok: false, error: message(err) };
    }
  });

export const harnessPoll = createServerFn({ method: "POST" })
  .validator((input: HarnessPollInput) => input)
  .handler(async ({ data }): Promise<HarnessPollResult> => {
    const { getHarnessManager } = await import("../harness/index.ts");
    const r = getHarnessManager().poll(data.turnId, data.after);
    if (!r) return { ok: false, error: "Unknown turn." };
    return { ok: true, ...r };
  });

export const harnessDecide = createServerFn({ method: "POST" })
  .validator((input: HarnessDecideInput) => input)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { getHarnessManager } = await import("../harness/index.ts");
    return { ok: getHarnessManager().decide(data.turnId, data.requestId, data.optionId) };
  });

/** Stop → ACP session/cancel. */
export const harnessCancel = createServerFn({ method: "POST" })
  .validator((input: HarnessCancelInput) => input)
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { getHarnessManager } = await import("../harness/index.ts");
    try {
      return { ok: await getHarnessManager().cancel(data.turnId) };
    } catch (err) {
      return { ok: false, error: message(err) };
    }
  });

export const harnessStatus = createServerFn({ method: "POST" }).handler(async () => {
  const { getHarnessManager } = await import("../harness/index.ts");
  const { DSH_PIN, ACP_SDK_PIN, findHarnessNode } = await import("../harness/process.ts");
  const node = findHarnessNode();
  return {
    ...getHarnessManager().status(),
    dshPin: DSH_PIN,
    acpSdkPin: ACP_SDK_PIN,
    node: node.ok ? { ok: true as const, bin: node.bin, version: node.version } : { ok: false as const, error: node.error },
  };
});
