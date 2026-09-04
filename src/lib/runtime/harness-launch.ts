/**
 * How the app launches the Harness for one agent. The local llama.cpp server
 * on loopback is the model route; with the Ollama switch on, the same
 * `localbot-llama` route points at Ollama's /v1 with the tag the employee
 * picked. Hosted Grok is never offered — with the Safety switch on, the chat
 * path refuses instead of routing a key.
 *
 * Stage 6: `agent.json.modelId` chooses the GGUF. If the selected agent's
 * file differs from what llama-server is serving, `ensureLocalServer` restarts
 * that one process onto the new file and waits for health; the dsh process
 * keeps running (it only knows the URL).
 */
import path from "node:path";
import { dataDir, loadConfig } from "../fs/disk.ts";
import { getCatalogModel } from "../catalog.ts";
import { getHarnessManager, type LaunchSpec } from "../harness/index.ts";
import { ensureLocalServer, loadedServer, localContextTokens, resolveOllamaRoute } from "./local-engine.ts";
import { resolveModelForAgent, type AgentModelResolution } from "./models.ts";

export const HOSTED_DEMO_REFUSAL =
  "Allow hosted demo is on. Stage 4 routes chat only through the local model via DeepSeek Harness; turn it off in Settings → Safety.";

export type LaunchReport = {
  spec: LaunchSpec;
  route: "llama.cpp" | "ollama";
  model: AgentModelResolution | null;
  restarted: boolean;
};

export async function appLaunchReport(agentName: string): Promise<LaunchReport> {
  const cfg = loadConfig();
  if (cfg.allowHostedDemo) throw new Error(HOSTED_DEMO_REFUSAL);

  if (cfg.useExistingOllama) {
    // Discovery failure throws here and the prompt is refused; there is no
    // fallthrough to llama.cpp while the switch is on.
    const route = await resolveOllamaRoute(cfg);
    return {
      route: "ollama",
      model: null,
      restarted: false,
      spec: {
        dataDir: dataDir(),
        llamaBaseUrl: route.baseUrl,
        model: route.model,
        modelName: route.modelName,
        contextTokens: 8192,
        maxTokens: 800,
      },
    };
  }

  const resolved = resolveModelForAgent(agentName);
  if (!resolved.path) {
    throw new Error(resolved.notice ?? "Local model not ready. Download or import a GGUF first.");
  }
  const loaded = loadedServer();
  if (loaded && loaded.modelPath !== resolved.path) {
    // Switching restarts the one llama-server; never under another agent's running turn.
    const busy = getHarnessManager().activeAgents().filter((n) => n !== agentName);
    if (busy.length > 0) {
      throw new Error(
        `${busy.join(", ")} ${busy.length === 1 ? "is" : "are"} still working on ${path.basename(loaded.modelPath)}. Wait or press Stop before switching to ${resolved.name}.`,
      );
    }
  }
  const server = await ensureLocalServer(resolved.path);
  if (!server.ok) throw new Error(server.error);
  const cat = getCatalogModel(resolved.modelId) ?? null;
  return {
    route: "llama.cpp",
    model: resolved,
    restarted: server.restarted,
    spec: {
      dataDir: dataDir(),
      llamaBaseUrl: server.url,
      model: "local",
      modelName: resolved.name,
      contextTokens: localContextTokens(cat),
      maxTokens: 800,
    },
  };
}

export async function appLaunchSpec(agentName: string): Promise<LaunchSpec> {
  return (await appLaunchReport(agentName)).spec;
}
