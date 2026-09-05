/**
 * Stage 14 — DeepSeek Harness (Cordis) plugins for LocalBot's isolated
 * `DSH_HOME`, profile `acp`.
 *
 * What dsh 0.1.2-alpha.5 actually offers (read from the pinned package):
 *
 *   - `dsh plugin --profile acp <pnpm args>` — initializes the profile on
 *     first use, runs **pnpm** with cwd = `{DSH_HOME}/profiles/acp`, then
 *     reconciles `package.json` → `dsh.profile.bundles`: a dependency whose
 *     manifest declares `dsh.bundle.patch` joins the layer list; a removed one
 *     leaves it. pnpm must be on PATH (exit 127 otherwise).
 *   - The composed tree is bundles (in `dsh.profile.bundles` order) → the
 *     profile's `cordis.patch.yml` (user layer) → `$DSH_HOME/cordis.patch.yml`
 *     → `--patch` overlays. LocalBot's overlays are `--patch`, so they compose
 *     last: hosted / telemetry / web stay disabled whatever a plugin says.
 *   - `dsh --profile acp --patch … --dump-config` prints the composed tree with
 *     a `# == <layer>` comment above each run of rows.
 *   - The `acp` profile is `patchReload: startup`: a change is seen by the
 *     **next dsh process**, so every mutation here ends with
 *     `HarnessManager.stop()` (refused with BUSY while a turn runs).
 *
 * There is no live inventory over ACP in this pin (`pluginInventory/list` is
 * a web-GUI Remote), so "Installed" is read from disk + a real `--dump-config`
 * run. Nothing in this file reports success it did not observe on disk.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ScopeError } from "../fs/scopes.ts";
import {
  CATALOG_RISKS,
  PLUGIN_PROFILE,
  type BuiltIn,
  type CatalogEntry,
  type CatalogRisk,
  type DumpRow,
  type EnableResult,
  type HarnessAfter,
  type InstalledPlugin,
  type InstalledReport,
  type MutationResult,
  type PluginCatalog,
} from "../plugins-model.ts";
import type { HarnessManager } from "./index.ts";
import { defaultDshDir, dshBinPath, dshHomeFor, findHarnessNode, writePluginOverlay } from "./process.ts";

export { filterCatalog, filterInstalled, packageNameOfSpec, PLUGIN_PROFILE } from "../plugins-model.ts";
export type { BuiltIn, CatalogEntry, CatalogRisk, DumpRow, EnableResult, HarnessAfter, InstalledPlugin, InstalledReport, MutationResult, PluginCatalog };
/** The two template bundles dsh writes for `acp`; never removable from LocalBot. */
export const BUILT_IN_BUNDLES = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-acp-app"] as const;
export const LOCALBOT_OVERLAY_FILES = ["localbot-acp.cordis.yml", "localbot-fs-plugin.patch.yml"] as const;
const MANAGED_BEGIN = "# >>> localbot-plugins (managed by LocalBot; edit above this line) >>>";
const MANAGED_END = "# <<< localbot-plugins <<<";
/** `dsh plugin` forwards to pnpm; a registry install can take a while. */
export const DSH_PLUGIN_TIMEOUT_MS = 180_000;
export const DUMP_TIMEOUT_MS = 60_000;

export type PluginErrorCode = "BAD_SPEC" | "NOT_FOUND" | "BUILT_IN" | "NO_ROWS" | "BUSY" | "NO_NODE" | "DSH_FAILED";

export class PluginError extends Error {
  code: PluginErrorCode;
  constructor(code: PluginErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "PluginError";
  }
}

/* ---------- profile files ---------- */

export function profileDir(dshHome: string): string {
  return path.join(dshHome, "profiles", PLUGIN_PROFILE);
}

export type ProfileManifest = {
  name?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  dsh?: { profile?: { bundles?: string[]; patchReload?: string } };
};

export function readProfileManifest(dshHome: string): ProfileManifest | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(profileDir(dshHome), "package.json"), "utf8")) as ProfileManifest;
  } catch {
    return null;
  }
}

export function manifestBundles(m: ProfileManifest | null): string[] {
  return m?.dsh?.profile?.bundles ?? [];
}

export function manifestDependencies(m: ProfileManifest | null): Record<string, string> {
  return m?.dependencies ?? {};
}

/* ---------- install specs (allowlist) ---------- */

export type PluginSpec =
  | { kind: "npm"; name: string; version: string | null; spec: string }
  | { kind: "path"; abs: string; spec: string };

// npm package name (optionally scoped) with an optional trailing @version/tag.
const NPM_NAME_RE = /^(?:(@[a-z0-9][a-z0-9._-]*)\/)?([a-z0-9][a-z0-9._-]*)$/;
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/**
 * Only `@scope/name[@version]` or an absolute folder path are accepted.
 * Everything pnpm would also take — `git+…`, `github:`, URLs, tarballs,
 * `file:` / `link:` / `npm:` prefixes, relative paths, `..` — is refused
 * before dsh is spawned.
 */
export function parsePluginSpec(input: unknown): PluginSpec {
  if (typeof input !== "string") throw new PluginError("BAD_SPEC", "Plugin spec must be a string.");
  const spec = input.trim();
  if (!spec) throw new PluginError("BAD_SPEC", "Type a package name or an absolute folder path.");
  if (spec.includes("\0") || /\s/.test(spec)) throw new PluginError("BAD_SPEC", "Plugin spec cannot contain spaces or control characters.");
  if (/^(git\+|github:|gitlab:|bitbucket:|https?:|ssh:|file:|link:|npm:|workspace:)/i.test(spec) || /\.git(#|$)/i.test(spec) || /\.(tgz|tar\.gz|tar)$/i.test(spec)) {
    throw new PluginError("BAD_SPEC", `Refused: ${spec}. Only an npm package name (@scope/name[@version]) or an absolute folder path can be added.`);
  }
  if (path.isAbsolute(spec) || /^[A-Za-z]:[\\/]/.test(spec)) {
    const unified = spec.replace(/\\/g, "/");
    if (unified.split("/").some((s) => s === "..")) throw new PluginError("BAD_SPEC", `Refused: ${spec} contains "..".`);
    return { kind: "path", abs: path.resolve(spec), spec };
  }
  if (spec.startsWith(".") || spec.startsWith("~") || spec.includes("/") && !spec.startsWith("@")) {
    throw new PluginError("BAD_SPEC", `Refused: ${spec}. Relative paths are not accepted — use the absolute folder path.`);
  }
  // Split the optional @version off the end (not the scope's leading @).
  const at = spec.lastIndexOf("@");
  const name = at > 0 ? spec.slice(0, at) : spec;
  const version = at > 0 ? spec.slice(at + 1) : null;
  if (!NPM_NAME_RE.test(name)) throw new PluginError("BAD_SPEC", `Refused: ${spec} is not a valid npm package name.`);
  if (version !== null && !VERSION_RE.test(version)) throw new PluginError("BAD_SPEC", `Refused: bad version "${version}".`);
  return { kind: "npm", name, version, spec };
}

/** Package name a path spec installs as (its package.json `name`), or the npm name. */
export function pluginNameOf(spec: PluginSpec): string {
  if (spec.kind === "npm") return spec.name;
  const file = path.join(spec.abs, "package.json");
  let st: fs.Stats;
  try {
    st = fs.statSync(spec.abs);
  } catch {
    throw new PluginError("NOT_FOUND", `${spec.abs} does not exist.`);
  }
  if (!st.isDirectory()) throw new PluginError("NOT_FOUND", `${spec.abs} is not a folder.`);
  let pkg: { name?: unknown };
  try {
    pkg = JSON.parse(fs.readFileSync(file, "utf8")) as { name?: unknown };
  } catch {
    throw new PluginError("NOT_FOUND", `${spec.abs} has no readable package.json.`);
  }
  if (typeof pkg.name !== "string" || !pkg.name) throw new PluginError("NOT_FOUND", `${file} has no "name".`);
  return pkg.name;
}

export function isBuiltIn(name: string): boolean {
  return (BUILT_IN_BUNDLES as readonly string[]).includes(name);
}

/* ---------- bundle patch: which rows does a bundle insert? ---------- */

/**
 * Ids of the rows a bundle's `cordis.patch.yml` *inserts*. Rows it merely
 * patches (`- id: system-prompt` + config) belong to another layer and must
 * not be disabled with it. Line-based on purpose: dsh's dialect is a flat
 * block sequence and `!!js` scalars would need a custom tag in a YAML lib.
 */
export function insertedRowIds(patchText: string): string[] {
  const ids: string[] = [];
  let insertIndent: number | null = null;
  for (const raw of patchText.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();
    if (insertIndent !== null && indent <= insertIndent) insertIndent = null;
    if (/^-?\s*insert:\s*$/.test(body)) {
      insertIndent = indent;
      continue;
    }
    if (insertIndent !== null) {
      const m = /^-?\s*id:\s*['"]?([^'"\s#]+)['"]?\s*$/.exec(body);
      if (m) ids.push(m[1]!);
    }
  }
  return ids;
}

export type BundleInfo = { dir: string; isBundle: boolean; patchFile: string | null; version: string | null; rowIds: string[] };

/** Read an installed package from the profile's node_modules. */
export function readInstalledBundle(dshHome: string, name: string): BundleInfo | null {
  const dir = path.join(profileDir(dshHome), "node_modules", ...name.split("/"));
  let pkg: { version?: unknown; dsh?: { bundle?: { patch?: unknown } } };
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as typeof pkg;
  } catch {
    return null;
  }
  const rel = pkg.dsh?.bundle?.patch;
  if (typeof rel !== "string") return { dir, isBundle: false, patchFile: null, version: typeof pkg.version === "string" ? pkg.version : null, rowIds: [] };
  const patchFile = path.join(dir, rel);
  let rowIds: string[] = [];
  try {
    rowIds = insertedRowIds(fs.readFileSync(patchFile, "utf8"));
  } catch {
    rowIds = [];
  }
  return { dir, isBundle: true, patchFile, version: typeof pkg.version === "string" ? pkg.version : null, rowIds };
}

/* ---------- the profile user layer (enable / disable) ---------- */

export type ManagedDisables = Record<string, string[]>;

export type UserPatch = { userText: string; disabled: ManagedDisables };

/**
 * `{profile}/cordis.patch.yml` = whatever the employee wrote, then a
 * LocalBot-managed block of `- id: X\n  disabled: true` rows between two
 * marker comments. dsh's template is a literal `[]`, which cannot be followed
 * by block rows, so a template-only file is treated as empty.
 */
export function parseUserPatch(text: string): UserPatch {
  const begin = text.indexOf(MANAGED_BEGIN);
  const end = text.indexOf(MANAGED_END);
  let userText = text;
  let managed = "";
  if (begin >= 0 && end > begin) {
    userText = text.slice(0, begin) + text.slice(end + MANAGED_END.length);
    managed = text.slice(begin + MANAGED_BEGIN.length, end);
  }
  const disabled: ManagedDisables = {};
  let current: string | null = null;
  for (const raw of managed.split(/\r?\n/)) {
    const line = raw.trim();
    const owner = /^# plugin:\s*(\S+)\s*$/.exec(line);
    if (owner) {
      current = owner[1]!;
      disabled[current] ??= [];
      continue;
    }
    const id = /^- id:\s*(\S+)\s*$/.exec(line);
    if (id && current) disabled[current]!.push(id[1]!);
  }
  const meaningful = userText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (meaningful.length === 1 && meaningful[0] === "[]") userText = userText.replace(/^\s*\[\]\s*$/m, "");
  return { userText: userText.replace(/\s+$/, ""), disabled };
}

export function renderUserPatch(p: UserPatch): string {
  const owners = Object.keys(p.disabled).sort();
  const rows: string[] = [];
  for (const owner of owners) {
    const ids = p.disabled[owner]!;
    if (ids.length === 0) continue;
    rows.push(`# plugin: ${owner}`);
    for (const id of ids) rows.push(`- id: ${id}`, "  disabled: true");
  }
  const head = p.userText.trim() ? `${p.userText.replace(/\s+$/, "")}\n` : "";
  const userHasRows = p.userText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .some((l) => l && !l.startsWith("#"));
  if (rows.length === 0) {
    // A comments-only file is not a patch list for dsh; keep the template's `[]`.
    if (userHasRows) return head;
    return `${head || "# Your patch layer for this dsh profile, applied after every bundle layer.\n# LocalBot writes plugin disables below a marker line when you turn a plugin off.\n"}[]\n`;
  }
  return `${head}${MANAGED_BEGIN}\n${rows.join("\n")}\n${MANAGED_END}\n`;
}

export function userPatchFile(dshHome: string): string {
  return path.join(profileDir(dshHome), "cordis.patch.yml");
}

export function readUserPatch(dshHome: string): UserPatch {
  try {
    return parseUserPatch(fs.readFileSync(userPatchFile(dshHome), "utf8"));
  } catch {
    return { userText: "", disabled: {} };
  }
}

/**
 * Turn a bundle's inserted rows on or off through the profile user layer.
 * Returns the ids written. A plain library (no `dsh.bundle`) or a bundle that
 * only patches other layers has nothing to toggle → NO_ROWS.
 */
export function setBundleEnabled(dshHome: string, name: string, enabled: boolean): { ids: string[]; file: string } {
  if (isBuiltIn(name)) throw new PluginError("BUILT_IN", `${name} is part of LocalBot's Harness profile and cannot be turned off.`);
  const info = readInstalledBundle(dshHome, name);
  if (!info) throw new PluginError("NOT_FOUND", `${name} is not installed in the ${PLUGIN_PROFILE} profile.`);
  if (!info.isBundle) throw new PluginError("NO_ROWS", `${name} declares no dsh.bundle — it is a plain library with no rows to turn off.`);
  if (info.rowIds.length === 0) throw new PluginError("NO_ROWS", `${name} inserts no rows of its own (it only patches other layers); there is nothing to turn off.`);
  const cur = readUserPatch(dshHome);
  const next: UserPatch = { userText: cur.userText, disabled: { ...cur.disabled } };
  if (enabled) delete next.disabled[name];
  else next.disabled[name] = [...info.rowIds];
  const file = userPatchFile(dshHome);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, renderUserPatch(next), "utf8");
  return { ids: info.rowIds, file };
}

/* ---------- spawning the pinned dsh ---------- */

export type RunResult = { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; command: string; timedOut: boolean };

export type Runner = (bin: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }) => Promise<RunResult>;

export const spawnRunner: Runner = (bin, args, opts) =>
  new Promise((resolve) => {
    const child = spawn(bin, args, { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (d: string) => (stdout += d));
    child.stderr?.on("data", (d: string) => (stderr += d));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: null, signal: null, stdout, stderr: `${stderr}${err.message}\n`, command: [bin, ...args].join(" "), timedOut });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, command: [bin, ...args].join(" "), timedOut });
    });
  });

export type PluginEnv = {
  dataDir: string;
  dshHome?: string;
  dshDir?: string;
  nodeBin?: string;
  env?: NodeJS.ProcessEnv;
  run?: Runner;
};

function resolved(o: PluginEnv) {
  const dshHome = o.dshHome ?? dshHomeFor(o.dataDir);
  const dshDir = o.dshDir ?? defaultDshDir();
  let nodeBin = o.nodeBin;
  if (!nodeBin) {
    const found = findHarnessNode({ env: o.env ?? process.env });
    if (!found.ok) throw new PluginError("NO_NODE", found.error);
    nodeBin = found.bin;
  }
  const env: NodeJS.ProcessEnv = { ...(o.env ?? process.env) };
  delete env.ELECTRON_RUN_AS_NODE;
  env.DSH_HOME = dshHome;
  env.DSH_TELEMETRY_MODE = "off";
  return { dshHome, dshDir, nodeBin, env, run: o.run ?? spawnRunner };
}

/** `dsh plugin --profile acp <pnpm args>` argv (after the Node binary). */
export function dshPluginArgs(pnpmArgs: string[]): string[] {
  return [dshBinPath(), "plugin", "--profile", PLUGIN_PROFILE, ...pnpmArgs];
}

/** `dsh --profile acp --patch <overlay> --patch <fs overlay> --dump-config` argv. */
export function dshDumpArgs(dshDir: string, pluginOverlay: string): string[] {
  return [
    "--experimental-strip-types",
    "--disable-warning=ExperimentalWarning",
    dshBinPath(),
    "--profile",
    PLUGIN_PROFILE,
    "--patch",
    path.join(dshDir, "localbot-acp.cordis.yml"),
    "--patch",
    pluginOverlay,
    "--dump-config",
  ];
}

export async function runDshPlugin(o: PluginEnv, pnpmArgs: string[]): Promise<RunResult> {
  const r = resolved(o);
  fs.mkdirSync(r.dshHome, { recursive: true });
  return r.run(r.nodeBin, dshPluginArgs(pnpmArgs), { cwd: r.dshHome, env: r.env, timeoutMs: DSH_PLUGIN_TIMEOUT_MS });
}

/* ---------- --dump-config ---------- */

/** Parse `dsh --dump-config` output: `# == <layer>` headings above runs of `- id:` rows. */
export function parseConfigDump(text: string): DumpRow[] {
  const rows: DumpRow[] = [];
  let layer = "";
  let cur: DumpRow | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    const heading = /^# == (.+)$/.exec(line);
    if (heading) {
      layer = heading[1]!.trim();
      continue;
    }
    if (line.startsWith("- ")) {
      cur = { id: null, name: null, disabled: false, layer };
      rows.push(cur);
      const m = /^- id:\s*['"]?([^'"\s]+)['"]?$/.exec(line);
      if (m) cur.id = m[1]!;
      continue;
    }
    if (!cur) continue;
    const field = /^ {2}(name|id|disabled):\s*['"]?([^'"\s]+)['"]?$/.exec(line);
    if (!field) continue;
    if (field[1] === "name") cur.name = field[2]!;
    else if (field[1] === "id") cur.id = field[2]!;
    else if (field[2] === "true") cur.disabled = true;
  }
  return rows;
}

export type DumpResult = { ok: boolean; rows: DumpRow[]; text: string; stderr: string; code: number | null; command: string };

export async function dumpComposedConfig(o: PluginEnv): Promise<DumpResult> {
  const r = resolved(o);
  const overlay = writePluginOverlay(r.dshHome, r.dshDir);
  const res = await r.run(r.nodeBin, dshDumpArgs(r.dshDir, overlay), { cwd: r.dshHome, env: r.env, timeoutMs: DUMP_TIMEOUT_MS });
  return { ok: res.code === 0, rows: res.code === 0 ? parseConfigDump(res.stdout) : [], text: res.stdout, stderr: res.stderr, code: res.code, command: res.command };
}

/** Rows a bundle contributed, by the dump's layer attribution. */
export function rowsForLayer(rows: DumpRow[], name: string): DumpRow[] {
  return rows.filter((r) => r.layer === name || r.layer.startsWith(`${name},`) || r.layer.includes(`patched by ${name}`) || r.layer.includes(`, ${name}`));
}

/* ---------- Installed report ---------- */

export const GUARD_ROW_IDS = ["llm-deepseek", "web", "web-search-deepseek", "web-fetch-http", "tool-web", "session-telemetry-otel", "fs-sandbox"] as const;

/**
 * Guard rows that are NOT disabled in the composed tree. Every row with a
 * guard id counts: a bundle that inserts a second `llm-deepseek` makes dsh's
 * id-targeted `disabled: true` land on the last one and leaves dsh-base's
 * hosted row live — seen with @deepseek-ai/dsh-sdk-minimal.
 */
export function guardOffenders(rows: DumpRow[]): string[] {
  return rows.filter((r) => r.id && (GUARD_ROW_IDS as readonly string[]).includes(r.id) && !r.disabled).map((r) => `${r.id} (${r.layer.split(",")[0]})`);
}

export function guardsHold(rows: DumpRow[]): boolean {
  return guardOffenders(rows).length === 0;
}

export async function pnpmStatus(env: NodeJS.ProcessEnv = process.env, run: Runner = spawnRunner): Promise<{ found: boolean; version: string | null }> {
  const res = await run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--version"], { cwd: process.cwd(), env, timeoutMs: 15_000 });
  if (res.code === 0) return { found: true, version: res.stdout.trim().split(/\r?\n/)[0] ?? null };
  return { found: false, version: null };
}

export async function pluginsInstalled(o: PluginEnv, opts: { dump?: boolean } = {}): Promise<InstalledReport> {
  const dshHome = o.dshHome ?? dshHomeFor(o.dataDir);
  const dshDir = o.dshDir ?? defaultDshDir();
  const manifest = readProfileManifest(dshHome);
  const bundles = manifestBundles(manifest);
  const deps = manifestDependencies(manifest);
  const user = readUserPatch(dshHome);
  const builtIn: BuiltIn[] = [
    ...BUILT_IN_BUNDLES.map((name) => ({ name, kind: "bundle" as const, detail: "dsh acp profile template" })),
    { name: "localbot-acp.cordis.yml", kind: "overlay", detail: path.join(dshDir, "localbot-acp.cordis.yml") },
    { name: "localbot-fs-plugin.patch.yml", kind: "overlay", detail: path.join(dshHome, "localbot-fs-plugin.patch.yml") },
  ];
  let dump: DumpResult | null = null;
  if (opts.dump !== false) {
    try {
      dump = await dumpComposedConfig(o);
    } catch (err) {
      dump = { ok: false, rows: [], text: "", stderr: err instanceof Error ? err.message : String(err), code: null, command: "" };
    }
  }
  const names = new Set<string>([...Object.keys(deps), ...bundles.filter((b) => !isBuiltIn(b))]);
  const plugins: InstalledPlugin[] = [...names].sort().map((name) => {
    const spec = deps[name] ?? "";
    const info = readInstalledBundle(dshHome, name);
    const disabledIds = user.disabled[name] ?? [];
    return {
      name,
      spec,
      source: /^(link|file):/.test(spec) ? "path" : "npm",
      version: info?.version ?? null,
      isBundle: info?.isBundle ?? bundles.includes(name),
      inBundles: bundles.includes(name),
      rowIds: info?.rowIds ?? [],
      disabledIds,
      enabled: disabledIds.length === 0,
      dumpRows: dump?.ok ? rowsForLayer(dump.rows, name) : [],
    };
  });
  return {
    profile: PLUGIN_PROFILE,
    profileDir: profileDir(dshHome),
    manifestExists: manifest !== null,
    bundles,
    builtIn,
    plugins,
    dump: {
      ok: dump?.ok ?? false,
      error: dump && !dump.ok ? (dump.stderr.trim() || `dsh --dump-config exited ${dump.code}`) : null,
      layers: dump?.ok ? [...new Set(dump.rows.map((r) => r.layer))] : [],
      command: dump?.command || null,
    },
    guardsHold: dump?.ok ? guardsHold(dump.rows) : null,
    pnpm: await pnpmStatus(o.env ?? process.env, o.run ?? spawnRunner),
    userPatchFile: userPatchFile(dshHome),
  };
}

/* ---------- mutations ---------- */

/**
 * A plugin change is only allowed while no agent has a running turn, and the
 * dsh child is stopped afterwards so the next prompt boots the new
 * composition (`patchReload: startup`). Refused with BUSY before anything is
 * touched.
 */
export function assertNotBusy(mgr: HarnessManager): void {
  const busy = mgr.activeAgents();
  if (busy.length > 0) {
    throw new ScopeError("BUSY", `${busy.join(", ")} ${busy.length === 1 ? "is" : "are"} still working on a message. Wait or press Stop before changing plugins.`);
  }
}

export async function restartHarnessAfterChange(mgr: HarnessManager): Promise<HarnessAfter> {
  const wasRunning = mgr.status().running;
  await mgr.stop();
  return wasRunning ? "stopped" : "not-running";
}

const PNPM_BANNER = /^\s*[╭│╰].*$/gm;

function cleanPnpm(s: string): string {
  return s.replace(PNPM_BANNER, "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * `dsh plugin --profile acp add <spec>`. Success is what the profile manifest
 * says afterwards: the resolved package name appears in `dependencies`, and
 * — for a bundle — in `dsh.profile.bundles`. A non-zero exit (including
 * dsh's own "pnpm not found on PATH", 127) is returned verbatim.
 */
export async function pluginsAdd(o: PluginEnv, mgr: HarnessManager | null, rawSpec: string): Promise<MutationResult> {
  const spec = parsePluginSpec(rawSpec);
  const expected = spec.kind === "path" ? pluginNameOf(spec) : spec.name;
  if (isBuiltIn(expected)) throw new PluginError("BUILT_IN", `${expected} is already part of LocalBot's Harness profile.`);
  if (mgr) assertNotBusy(mgr);
  const dshHome = o.dshHome ?? dshHomeFor(o.dataDir);
  const before = manifestBundles(readProfileManifest(dshHome));
  const res = await runDshPlugin(o, ["add", spec.kind === "path" ? spec.abs : spec.spec]);
  const after = readProfileManifest(dshHome);
  const bundlesAfter = manifestBundles(after);
  const deps = manifestDependencies(after);
  const inDeps = expected in deps;
  let inBundles = bundlesAfter.includes(expected);
  let ok = res.code === 0 && inDeps;
  let error: string | null = null;
  let guard: MutationResult["guard"] = null;
  if (!ok) {
    error = res.timedOut
      ? `dsh plugin add timed out after ${DSH_PLUGIN_TIMEOUT_MS / 1000}s.`
      : res.code !== 0
        ? `dsh plugin add exited ${res.code ?? res.signal}.`
        : `dsh plugin add exited 0 but ${expected} is not in ${path.join(profileDir(dshHome), "package.json")}.`;
  } else if (inBundles) {
    // Hosted / telemetry / web / fs-sandbox must stay off with the bundle composed. If it
    // re-enables one (duplicate ids defeat the overlay's id-targeted disable), undo the add.
    const dump = await dumpComposedConfig(o);
    const offenders = dump.ok ? guardOffenders(dump.rows) : [];
    guard = { checked: dump.ok, offenders, rolledBack: false };
    if (dump.ok && offenders.length > 0) {
      const undo = await runDshPlugin(o, ["remove", expected]);
      const bundlesNow = manifestBundles(readProfileManifest(dshHome));
      guard.rolledBack = undo.code === 0 && !bundlesNow.includes(expected);
      ok = false;
      inBundles = bundlesNow.includes(expected);
      error = `Refused: with ${expected} composed these rows come back on: ${offenders.join(", ")}. LocalBot keeps hosted / telemetry / web / fs-sandbox off. ${
        guard.rolledBack ? "The bundle was removed again." : `Rollback failed (dsh plugin remove exited ${undo.code ?? undo.signal}); remove it from Installed.`
      }`;
    }
  }
  const harness = mgr && (ok || guard?.rolledBack) ? await restartHarnessAfterChange(mgr) : null;
  return {
    ok,
    action: "add",
    name: expected,
    spec: spec.spec,
    command: res.command,
    code: res.code,
    stdout: cleanPnpm(res.stdout),
    stderr: cleanPnpm(res.stderr),
    bundlesBefore: before,
    bundlesAfter: ok || !guard?.rolledBack ? bundlesAfter : manifestBundles(readProfileManifest(dshHome)),
    libraryOnly: ok && !inBundles,
    guard,
    harness,
    error,
  };
}

/** `dsh plugin --profile acp remove <name>`; also drops LocalBot's disables for it. */
export async function pluginsRemove(o: PluginEnv, mgr: HarnessManager | null, rawName: string): Promise<MutationResult> {
  const spec = parsePluginSpec(rawName);
  if (spec.kind !== "npm" || spec.version !== null) throw new PluginError("BAD_SPEC", "Remove takes the installed package name.");
  const name = spec.name;
  if (isBuiltIn(name)) throw new PluginError("BUILT_IN", `${name} is part of LocalBot's Harness profile and cannot be removed.`);
  if (mgr) assertNotBusy(mgr);
  const dshHome = o.dshHome ?? dshHomeFor(o.dataDir);
  const manifestBefore = readProfileManifest(dshHome);
  const before = manifestBundles(manifestBefore);
  if (!(name in manifestDependencies(manifestBefore)) && !before.includes(name)) {
    throw new PluginError("NOT_FOUND", `${name} is not installed in the ${PLUGIN_PROFILE} profile.`);
  }
  const res = await runDshPlugin(o, ["remove", name]);
  const after = readProfileManifest(dshHome);
  const bundlesAfter = manifestBundles(after);
  const gone = !(name in manifestDependencies(after)) && !bundlesAfter.includes(name);
  const ok = res.code === 0 && gone;
  if (ok) {
    const user = readUserPatch(dshHome);
    if (user.disabled[name]) {
      delete user.disabled[name];
      fs.writeFileSync(userPatchFile(dshHome), renderUserPatch(user), "utf8");
    }
  }
  const harness = ok && mgr ? await restartHarnessAfterChange(mgr) : null;
  return {
    ok,
    action: "remove",
    name,
    spec: name,
    command: res.command,
    code: res.code,
    stdout: cleanPnpm(res.stdout),
    stderr: cleanPnpm(res.stderr),
    bundlesBefore: before,
    bundlesAfter,
    libraryOnly: false,
    guard: null,
    harness,
    error: ok ? null : res.timedOut ? "dsh plugin remove timed out." : res.code !== 0 ? `dsh plugin remove exited ${res.code ?? res.signal}.` : `${name} is still listed in the profile manifest.`,
  };
}

export async function pluginsSetEnabled(o: PluginEnv, mgr: HarnessManager | null, rawName: string, enabled: boolean): Promise<EnableResult> {
  const spec = parsePluginSpec(rawName);
  if (spec.kind !== "npm" || spec.version !== null) throw new PluginError("BAD_SPEC", "Enable / disable takes the installed package name.");
  if (mgr) assertNotBusy(mgr);
  const dshHome = o.dshHome ?? dshHomeFor(o.dataDir);
  const { ids, file } = setBundleEnabled(dshHome, spec.name, enabled);
  const dump = await dumpComposedConfig(o);
  const verified = dump.ok && ids.every((id) => {
    const row = dump.rows.find((r) => r.id === id);
    return row ? row.disabled === !enabled : false;
  });
  // Turning a bundle back on must not bring a hosted / telemetry / web row back with it.
  const offenders = enabled && dump.ok ? guardOffenders(dump.rows) : [];
  let error: string | null = null;
  if (offenders.length > 0) {
    setBundleEnabled(dshHome, spec.name, false);
    error = `Refused: enabling ${spec.name} brings these rows back on: ${offenders.join(", ")}. LocalBot keeps hosted / telemetry / web / fs-sandbox off; it stays disabled.`;
  }
  const harness = mgr ? await restartHarnessAfterChange(mgr) : null;
  return {
    ok: verified && offenders.length === 0,
    name: spec.name,
    enabled: offenders.length > 0 ? false : enabled,
    ids,
    file,
    verified,
    dumpError: dump.ok ? null : dump.stderr.trim() || `dsh --dump-config exited ${dump.code}`,
    error,
    harness,
  };
}

/* ---------- catalog (checked in) ---------- */

export const CATALOG_FILE = "catalog/dsh-plugins.json";

export function catalogPath(root: string = process.cwd()): string {
  return path.join(root, CATALOG_FILE);
}

const RISKS: readonly CatalogRisk[] = CATALOG_RISKS;

/** Read + validate the checked-in catalog. Throws on a missing or malformed file — never substitutes a built-in list. */
export function readPluginCatalog(file: string = catalogPath()): PluginCatalog {
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<PluginCatalog>;
  if (raw.version !== 1 || raw.profile !== PLUGIN_PROFILE || !Array.isArray(raw.plugins)) {
    throw new Error(`${file}: expected { version: 1, profile: "acp", plugins: [] }`);
  }
  const seen = new Set<string>();
  for (const e of raw.plugins as CatalogEntry[]) {
    for (const k of ["id", "name", "summary"] as const) {
      if (typeof e[k] !== "string" || !e[k]) throw new Error(`${file}: entry missing ${k}`);
    }
    if (seen.has(e.id)) throw new Error(`${file}: duplicate id ${e.id}`);
    seen.add(e.id);
    if (!RISKS.includes(e.risk)) throw new Error(`${file}: ${e.id} has bad risk ${String(e.risk)}`);
    if (!e.install || (e.install.kind !== "npm" && e.install.kind !== "path") || typeof e.install.spec !== "string") {
      throw new Error(`${file}: ${e.id} has a bad install spec`);
    }
    if (e.install.kind === "npm") parsePluginSpec(e.install.spec);
    if (e.install.kind === "path" && (path.isAbsolute(e.install.spec) || e.install.spec.split("/").includes(".."))) {
      throw new Error(`${file}: ${e.id} path specs are relative to the dsh/ folder`);
    }
  }
  return raw as PluginCatalog;
}

/** The spec handed to `dsh plugin add`: catalog `path` entries live under the app's dsh/ folder. */
export function catalogInstallSpec(entry: CatalogEntry, dshDir: string = defaultDshDir()): string {
  return entry.install.kind === "path" ? path.join(dshDir, entry.install.spec) : entry.install.spec;
}
