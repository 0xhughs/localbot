/**
 * Stage 14 — server functions for the Plugins screen. The renderer talks only
 * to these; they call `src/lib/harness/plugins.ts`, which spawns the pinned
 * `dsh plugin --profile acp …` / `dsh … --dump-config` against LocalBot's
 * isolated `DSH_HOME` (`{dataDir}/dsh-home`). Nothing here is React-only:
 * every mutation is what dsh wrote to `profiles/acp/package.json` or
 * `profiles/acp/cordis.patch.yml`, read back after the fact.
 */
import { createServerFn } from "@tanstack/react-start";
import type { CatalogEntry, EnableResult, InstalledReport, MutationResult } from "../plugins-model.ts";

export type PluginsCatalogResult =
  | { ok: true; file: string; entries: (CatalogEntry & { installSpec: string })[] }
  | { ok: false; error: string };

export type PluginsInstalledResult = { ok: true; report: InstalledReport } | { ok: false; error: string };

export type PluginsMutationResult = { ok: true; result: MutationResult } | { ok: false; error: string; code: string | null };
export type PluginsEnableResult = { ok: true; result: EnableResult } | { ok: false; error: string; code: string | null };

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function codeOf(err: unknown): string | null {
  return err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string" ? (err as { code: string }).code : null;
}

async function pluginEnv() {
  const { dataDir } = await import("../fs/disk.ts");
  return { dataDir: dataDir() };
}

/** The checked-in catalog (`catalog/dsh-plugins.json`). A missing / malformed file is an error, not an empty list. */
export const pluginsCatalog = createServerFn({ method: "POST" }).handler(async (): Promise<PluginsCatalogResult> => {
  const { readPluginCatalog, catalogPath, catalogInstallSpec } = await import("../harness/plugins.ts");
  try {
    const file = catalogPath();
    const cat = readPluginCatalog(file);
    return { ok: true, file, entries: cat.plugins.map((e) => ({ ...e, installSpec: catalogInstallSpec(e) })) };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
});

/** What the acp profile actually has: manifest + user layer + a real `--dump-config`. */
export const pluginsInstalled = createServerFn({ method: "POST" })
  .validator((input: { dump?: boolean } | undefined) => input ?? {})
  .handler(async ({ data }): Promise<PluginsInstalledResult> => {
    const { pluginsInstalled: installed } = await import("../harness/plugins.ts");
    try {
      return { ok: true, report: await installed(await pluginEnv(), { dump: data.dump !== false }) };
    } catch (err) {
      return { ok: false, error: message(err) };
    }
  });

/** `dsh plugin --profile acp add <spec>`; refuses BUSY while a turn runs; stops dsh afterwards. */
export const pluginsAdd = createServerFn({ method: "POST" })
  .validator((input: { spec: string }) => input)
  .handler(async ({ data }): Promise<PluginsMutationResult> => {
    const { pluginsAdd: add } = await import("../harness/plugins.ts");
    const { getHarnessManager } = await import("../harness/index.ts");
    try {
      return { ok: true, result: await add(await pluginEnv(), getHarnessManager(), data.spec) };
    } catch (err) {
      return { ok: false, error: message(err), code: codeOf(err) };
    }
  });

/** `dsh plugin --profile acp remove <name>`; refuses BUSY while a turn runs; stops dsh afterwards. */
export const pluginsRemove = createServerFn({ method: "POST" })
  .validator((input: { name: string }) => input)
  .handler(async ({ data }): Promise<PluginsMutationResult> => {
    const { pluginsRemove: remove } = await import("../harness/plugins.ts");
    const { getHarnessManager } = await import("../harness/index.ts");
    try {
      return { ok: true, result: await remove(await pluginEnv(), getHarnessManager(), data.name) };
    } catch (err) {
      return { ok: false, error: message(err), code: codeOf(err) };
    }
  });

/** Writes `disabled: true` rows for the bundle into the profile user layer and verifies with `--dump-config`. */
export const pluginsSetEnabled = createServerFn({ method: "POST" })
  .validator((input: { name: string; enabled: boolean }) => input)
  .handler(async ({ data }): Promise<PluginsEnableResult> => {
    const { pluginsSetEnabled: setEnabled } = await import("../harness/plugins.ts");
    const { getHarnessManager } = await import("../harness/index.ts");
    try {
      return { ok: true, result: await setEnabled(await pluginEnv(), getHarnessManager(), data.name, Boolean(data.enabled)) };
    } catch (err) {
      return { ok: false, error: message(err), code: codeOf(err) };
    }
  });
