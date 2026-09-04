import { createServerFn } from "@tanstack/react-start";

export const fsScanServerHardware = createServerFn({ method: "POST" }).handler(async () => {
  const { scanServerHardware } = await import("../hardware-server.ts");
  return scanServerHardware();
});

export const modelDownloadStart = createServerFn({ method: "POST" })
  .validator((input: { catalogId: string }) => input)
  .handler(async ({ data }) => {
    const { startDownload } = await import("./models.ts");
    return startDownload(data.catalogId);
  });

export const modelDownloadStatus = createServerFn({ method: "POST" }).handler(async () => {
  const { getDownloadStatus } = await import("./models.ts");
  return getDownloadStatus();
});

export const modelDownloadPause = createServerFn({ method: "POST" }).handler(async () => {
  const { pauseDownload } = await import("./models.ts");
  return pauseDownload();
});

export const modelDownloadResume = createServerFn({ method: "POST" }).handler(async () => {
  const { resumeDownload } = await import("./models.ts");
  return resumeDownload();
});

export const modelVerify = createServerFn({ method: "POST" })
  .validator((input: { catalogId: string }) => input)
  .handler(async ({ data }) => {
    const { verifyModel } = await import("./models.ts");
    return verifyModel(data.catalogId);
  });

export const modelList = createServerFn({ method: "POST" }).handler(async () => {
  const { listModelsOnDisk } = await import("./models.ts");
  const { loadConfig, defaultModelsDir } = await import("../fs/disk.ts");
  return { models: listModelsOnDisk(), modelsDir: loadConfig().modelsDir || defaultModelsDir() };
});

export const modelImport = createServerFn({ method: "POST" })
  .validator((input: { absolutePath: string; catalogId?: string }) => input)
  .handler(async ({ data }) => {
    const { importGguf } = await import("./models.ts");
    return importGguf(data.absolutePath, data.catalogId);
  });

export const modelSetHostedDemo = createServerFn({ method: "POST" })
  .validator((input: { allow: boolean }) => input)
  .handler(async ({ data }) => {
    const { patchConfig } = await import("../fs/disk.ts");
    return patchConfig({ allowHostedDemo: data.allow });
  });

export const modelSetOllama = createServerFn({ method: "POST" })
  .validator((input: { use: boolean }) => input)
  .handler(async ({ data }) => {
    const { patchConfig } = await import("../fs/disk.ts");
    return patchConfig({ useExistingOllama: data.use });
  });

/** Stage 6: tags from the local Ollama, or a typed error. Not a ping. */
export const modelOllamaList = createServerFn({ method: "POST" }).handler(async () => {
  const { listOllamaModels } = await import("./local-engine.ts");
  const { loadConfig } = await import("../fs/disk.ts");
  const found = await listOllamaModels();
  return { ...found, chosen: loadConfig().ollamaModel };
});

export const modelSetOllamaModel = createServerFn({ method: "POST" })
  .validator((input: { name: string | null }) => input)
  .handler(async ({ data }) => {
    const { patchConfig } = await import("../fs/disk.ts");
    const name = data.name && data.name.trim() ? data.name.trim() : null;
    return { ok: true as const, ollamaModel: patchConfig({ ollamaModel: name }).ollamaModel };
  });

export const modelSetRuntime = createServerFn({ method: "POST" })
  .validator((input: { runtime: string }) => input)
  .handler(async ({ data }) => {
    const { patchConfig } = await import("../fs/disk.ts");
    const { isLlamaRuntimeId } = await import("./llama-platform.ts");
    const { engineStatus } = await import("./local-engine.ts");
    const pref = data.runtime === "auto" || isLlamaRuntimeId(data.runtime) ? data.runtime : "auto";
    patchConfig({ llamaRuntime: pref });
    return engineStatus();
  });

export const modelEngineStatus = createServerFn({ method: "POST" }).handler(async () => {
  const { engineStatus } = await import("./local-engine.ts");
  return engineStatus();
});

/** Pinned llama.cpp rows for this host's target, with the one the probe would pick. */
export const modelRuntimeOptions = createServerFn({ method: "POST" }).handler(async () => {
  const { llamaTarget, runtimesFor, LLAMA_RELEASE } = await import("./llama-platform.ts");
  const { resolveLlamaRuntime, hostGpuProbe } = await import("./local-engine.ts");
  const { loadConfig } = await import("../fs/disk.ts");
  const target = llamaTarget();
  const probe = hostGpuProbe();
  const auto = resolveLlamaRuntime("auto", probe);
  return {
    release: LLAMA_RELEASE,
    target,
    preference: loadConfig().llamaRuntime,
    probe,
    auto: auto ? { runtime: auto.asset.runtime, label: auto.asset.label, reason: auto.reason } : null,
    options: target ? runtimesFor(target).map((a) => ({ runtime: a.runtime, label: a.label, gpu: a.gpu, filename: a.filename })) : [],
  };
});

/**
 * The model the selected agent's next turn loads (agent.json.modelId → file),
 * next to what llama-server currently serves. The header badge follows this,
 * not the onboarding card.
 */
export const modelStatusForAgent = createServerFn({ method: "POST" })
  .validator((input: { agentName: string }) => input)
  .handler(async ({ data }) => {
    const { resolveModelForAgent } = await import("./models.ts");
    const { loadedServer, engineStatus } = await import("./local-engine.ts");
    const { loadConfig } = await import("../fs/disk.ts");
    const cfg = loadConfig();
    const resolved = resolveModelForAgent(data.agentName);
    const loaded = loadedServer();
    const engine = engineStatus();
    const badge = cfg.useExistingOllama
      ? cfg.ollamaModel
        ? `Ollama ${cfg.ollamaModel}`
        : "Ollama — pick a model"
      : resolved.path
        ? `Local ${resolved.name}`
        : "Local model not ready";
    return {
      ...resolved,
      badge,
      ollama: cfg.useExistingOllama ? { model: cfg.ollamaModel } : null,
      loaded,
      /** True when this agent's next turn will restart llama-server onto its file. */
      willRestart: Boolean(resolved.path && loaded && loaded.modelPath !== resolved.path),
      runtime: engine.runtime,
      ready: cfg.useExistingOllama ? Boolean(cfg.ollamaModel) : Boolean(resolved.path),
    };
  });

export const modelEnsureEngine = createServerFn({ method: "POST" }).handler(async () => {
  const { ensureLlamaBinary, ensureLocalServer, resolveLlamaRuntime } = await import("./local-engine.ts");
  const rt = resolveLlamaRuntime();
  const bin = await ensureLlamaBinary(rt?.asset.runtime);
  if (!bin.ok) return bin;
  return ensureLocalServer();
});
