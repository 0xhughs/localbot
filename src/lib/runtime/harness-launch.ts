/**
 * How the app launches the Harness: the local llama.cpp server on loopback is
 * the only model route. Hosted Grok is never offered to the Harness — with the
 * Safety switch on, the chat path refuses instead of routing a key.
 */
import { dataDir, loadConfig } from "../fs/disk.ts";
import { getCatalogModel } from "../catalog.ts";
import type { LaunchSpec } from "../harness/index.ts";
import { ensureLocalServer, localContextTokens, pingOllama } from "./local-engine.ts";
import { findReadyModel } from "./models.ts";

export const HOSTED_DEMO_REFUSAL =
  "Allow hosted demo is on. Stage 4 routes chat only through the local model via DeepSeek Harness; turn it off in Settings → Safety.";

export async function appLaunchSpec(): Promise<LaunchSpec> {
  const cfg = loadConfig();
  if (cfg.allowHostedDemo) throw new Error(HOSTED_DEMO_REFUSAL);

  if (cfg.useExistingOllama && (await pingOllama())) {
    return {
      dataDir: dataDir(),
      llamaBaseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3.2",
      modelName: "Ollama llama3.2",
      contextTokens: 8192,
      maxTokens: 800,
    };
  }

  const server = await ensureLocalServer();
  if (!server.ok) throw new Error(server.error);
  const ready = findReadyModel();
  const model = ready ? getCatalogModel(ready.catalogId) : null;
  return {
    dataDir: dataDir(),
    llamaBaseUrl: server.url,
    model: "local",
    modelName: ready?.name ?? "Local GGUF",
    contextTokens: localContextTokens(model),
    maxTokens: 800,
  };
}
