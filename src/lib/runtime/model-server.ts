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

export const modelEngineStatus = createServerFn({ method: "POST" }).handler(async () => {
  const { engineStatus } = await import("./local-engine.ts");
  return engineStatus();
});

export const modelEnsureEngine = createServerFn({ method: "POST" }).handler(async () => {
  const { ensureLlamaBinary, ensureLocalServer } = await import("./local-engine.ts");
  const bin = await ensureLlamaBinary();
  if (!bin.ok) return bin;
  return ensureLocalServer();
});
