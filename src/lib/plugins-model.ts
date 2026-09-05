/**
 * Stage 14 — pure, browser-safe shapes for the Plugins screen. No Node
 * imports: the renderer imports this; `src/lib/harness/plugins.ts` (sidecar,
 * spawns dsh) imports the types from here and does the real work.
 */

export const PLUGIN_PROFILE = "acp";

export type CatalogRisk = "safe" | "needs-permission" | "dangerous";
export const CATALOG_RISKS: readonly CatalogRisk[] = ["safe", "needs-permission", "dangerous"];

export type CatalogEntry = {
  id: string;
  name: string;
  summary: string;
  risk: CatalogRisk;
  install: { kind: "npm" | "path"; spec: string };
  /** Free text saying how the entry was verified to exist (checked-in fixture, pinned dsh install). */
  verified?: string;
};

export type PluginCatalog = { version: number; profile: string; note?: string; plugins: CatalogEntry[] };

export type DumpRow = { id: string | null; name: string | null; disabled: boolean; layer: string };

export type InstalledPlugin = {
  name: string;
  /** The dependency spec pnpm recorded (`^1.2.3`, `link:/abs/path`, …). */
  spec: string;
  source: "npm" | "path";
  version: string | null;
  isBundle: boolean;
  /** In `dsh.profile.bundles` right now (what the next dsh boot composes). */
  inBundles: boolean;
  /** Row ids the bundle inserts; `disabledIds` are the ones LocalBot turned off. */
  rowIds: string[];
  disabledIds: string[];
  enabled: boolean;
  /** Rows attributed to this bundle in the real `--dump-config`, when it ran. */
  dumpRows: DumpRow[];
};

export type BuiltIn = { name: string; kind: "bundle" | "overlay"; detail: string };

export type InstalledReport = {
  profile: string;
  profileDir: string;
  manifestExists: boolean;
  bundles: string[];
  builtIn: BuiltIn[];
  plugins: InstalledPlugin[];
  dump: { ok: boolean; error: string | null; layers: string[]; command: string | null };
  /** Whether hosted / telemetry / web rows are still disabled in the composed tree (null = no dump). */
  guardsHold: boolean | null;
  pnpm: { found: boolean; version: string | null };
  userPatchFile: string;
};

export type HarnessAfter = "stopped" | "not-running";

export type MutationResult = {
  ok: boolean;
  action: "add" | "remove";
  name: string;
  spec: string;
  command: string;
  code: number | null;
  stdout: string;
  stderr: string;
  bundlesBefore: string[];
  bundlesAfter: string[];
  /** Installed as a dependency but declares no dsh.bundle: dsh warned, nothing composes. */
  libraryOnly: boolean;
  /**
   * After a successful add, a fresh `--dump-config` is checked: hosted / telemetry / web /
   * fs-sandbox rows must all still be disabled. Offenders → the add is undone (`rolledBack`).
   */
  guard: { checked: boolean; offenders: string[]; rolledBack: boolean } | null;
  harness: HarnessAfter | null;
  error: string | null;
};

export type EnableResult = {
  ok: boolean;
  name: string;
  enabled: boolean;
  ids: string[];
  file: string;
  /** Verified against a fresh `--dump-config`: every id shows `disabled: true` (off) or not (on). */
  verified: boolean;
  dumpError: string | null;
  /** Set when enabling was refused because a hosted / telemetry / web row came back on. */
  error: string | null;
  harness: HarnessAfter | null;
};

/** The package name an npm install spec resolves to (`@scope/name@1.2.3` → `@scope/name`). */
export function packageNameOfSpec(spec: string): string {
  const at = spec.lastIndexOf("@");
  return at > 0 ? spec.slice(0, at) : spec;
}

/** One query filters both tabs: catalog by id / name / summary / spec / risk … */
export function filterCatalog<T extends CatalogEntry>(entries: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => [e.id, e.name, e.summary, e.install.spec, e.risk].join(" ").toLowerCase().includes(q));
}

/** … and installed by package name / spec / version / row ids. */
export function filterInstalled(entries: InstalledPlugin[], query: string): InstalledPlugin[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => [e.name, e.spec, e.version ?? "", ...e.rowIds].join(" ").toLowerCase().includes(q));
}
