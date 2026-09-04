/**
 * Sidecar-side resolution of `{ scope, relPath, agentName }` onto host paths.
 * The browser never sends a root. Config on disk is the source of truth.
 *
 * Rejects: absolute host paths (posix, drive letter, UNC), `..` segments,
 * NUL bytes, `:` in segments, unknown or unset scopes, and symlinks that
 * leave the chosen scope (checked with realpath, dangling links included).
 */
import fs from "node:fs";
import path from "node:path";
import type { FoldersConfig, ScopedEntry, ScopeId } from "../types.ts";
import {
  diskDelete,
  diskList,
  diskMkdir,
  diskPrettyTree,
  diskRead,
  diskReplace,
  diskShell,
  diskStat,
  diskWrite,
  isUnderDir,
  loadConfig,
  patchConfig,
  type DiskShellResult,
} from "./disk.ts";
import {
  agentSlug,
  displayPath,
  folderFor,
  isScopeId,
  SCOPE_IDS,
  SCOPE_META,
} from "./scope-model.ts";

export type ScopeErrorCode =
  | "NOT_CONFIGURED"
  | "BAD_SCOPE"
  | "SCOPE_UNSET"
  | "BAD_PATH"
  | "ESCAPE"
  | "NOT_GRANTED"
  | "DISCONNECTED"
  | "BAD_NAME"
  | "EXISTS"
  | "NOT_FOUND"
  | "BUSY";

export class ScopeError extends Error {
  code: ScopeErrorCode;
  constructor(code: ScopeErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ScopeError";
  }
}

export type ScopedTarget = { scope: ScopeId; relPath: string; agentName: string };

export type AgentRecord = {
  name: string;
  job: string;
  modelId: string;
  color: string;
  mascotId: string;
  scopes: ScopeId[];
  createdAt: string;
  /** Archived agents leave the roster; their folder stays exactly where it is. */
  archived: boolean;
};

/* ---------- agent names ---------- */

export const AGENT_NAME_MAX = 64;
const ILLEGAL_NAME_CHARS = /[\\/:*?"<>|]/;
const hasControlChar = (s: string) => [...s].some((c) => c.charCodeAt(0) < 0x20);
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * A name the agent folder can be called on every supported filesystem. Throws
 * `BAD_NAME` instead of silently cleaning: the store cleans typed input with
 * `agentSlug` before create / duplicate; rename shows the reason instead.
 */
export function assertAgentName(name: unknown): string {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new ScopeError("BAD_NAME", "Agent name cannot be empty.");
  }
  if (hasControlChar(name)) {
    throw new ScopeError("BAD_NAME", "Agent name cannot contain control characters.");
  }
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (ILLEGAL_NAME_CHARS.test(trimmed)) {
    throw new ScopeError("BAD_NAME", `Agent name cannot contain \\ / : * ? " < > | — got "${trimmed}".`);
  }
  if (/^\.+$/.test(trimmed) || trimmed.endsWith(".")) {
    throw new ScopeError("BAD_NAME", "Agent name cannot be dots or end with a dot.");
  }
  if (trimmed.startsWith(".")) {
    throw new ScopeError("BAD_NAME", "Agent name cannot start with a dot.");
  }
  if (RESERVED_NAMES.test(trimmed)) {
    throw new ScopeError("BAD_NAME", `"${trimmed}" is a reserved name on Windows.`);
  }
  if (trimmed.length > AGENT_NAME_MAX) {
    throw new ScopeError("BAD_NAME", `Agent name is longer than ${AGENT_NAME_MAX} characters.`);
  }
  if (agentSlug(trimmed) !== trimmed) {
    throw new ScopeError("BAD_NAME", `Agent name "${trimmed}" is not a valid folder name.`);
  }
  return trimmed;
}

/* ---------- roots ---------- */

export function requireFolders(): FoldersConfig {
  const cfg = loadConfig();
  if (!cfg.folders) {
    throw new ScopeError("NOT_CONFIGURED", "Folders are not set up yet. Open Settings → Folders.");
  }
  return cfg.folders;
}

export function agentsDir(folders: FoldersConfig): string {
  return path.join(folders.employeeRoot, "agents");
}

export function agentDir(folders: FoldersConfig, agentName: string): string {
  const slug = agentSlug(agentName);
  const dir = path.join(agentsDir(folders), slug);
  if (!isUnderDir(agentsDir(folders), dir)) {
    throw new ScopeError("BAD_PATH", `Bad agent name: ${agentName}`);
  }
  return dir;
}

export function privateRoot(folders: FoldersConfig, agentName: string): string {
  return path.join(agentDir(folders, agentName), "private");
}

export function scopeRoot(folders: FoldersConfig, scope: ScopeId, agentName: string): string {
  if (!isScopeId(scope)) throw new ScopeError("BAD_SCOPE", `Unknown scope: ${String(scope)}`);
  if (scope === "private") return privateRoot(folders, agentName);
  const root = folderFor(folders, scope);
  if (!root) {
    throw new ScopeError(
      "SCOPE_UNSET",
      `${SCOPE_META[scope].label} is not connected. Pick it in Settings → Folders.`,
    );
  }
  return root;
}

/**
 * The configured folder behind a scope must be reachable right now. A missing
 * or unmounted share is an error for that scope — never an empty listing, and
 * never something a recursive mkdir is allowed to recreate locally.
 */
export function assertScopeConnected(folders: FoldersConfig, scope: ScopeId): string {
  const configured = scope === "private" ? folders.employeeRoot : folderFor(folders, scope);
  if (!configured) {
    throw new ScopeError(
      "SCOPE_UNSET",
      `${SCOPE_META[scope].label} is not connected. Pick it in Settings → Folders.`,
    );
  }
  let st: fs.Stats;
  try {
    st = fs.statSync(configured);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "EIO";
    throw new ScopeError(
      "DISCONNECTED",
      `${SCOPE_META[scope].label} is disconnected (${code}). Reconnect the drive or share, then Refresh. Nothing was written elsewhere.`,
    );
  }
  if (!st.isDirectory()) {
    throw new ScopeError(
      "DISCONNECTED",
      `${SCOPE_META[scope].label} is not a folder any more. Fix it in Settings → Folders.`,
    );
  }
  return configured;
}

/* ---------- relative path hygiene ---------- */

const DRIVE_RE = /^[a-zA-Z]:/;

export function safeSegments(relPath: string): string[] {
  if (typeof relPath !== "string") throw new ScopeError("BAD_PATH", "Path must be a string.");
  if (relPath.includes("\0")) throw new ScopeError("BAD_PATH", "Path contains a NUL byte.");
  const unified = relPath.replace(/\\/g, "/");
  if (unified.startsWith("/")) {
    throw new ScopeError("BAD_PATH", `Absolute paths are not allowed: ${relPath}`);
  }
  if (DRIVE_RE.test(unified)) {
    throw new ScopeError("BAD_PATH", `Drive paths are not allowed: ${relPath}`);
  }
  const segments = unified.split("/").filter((s) => s !== "" && s !== ".");
  for (const seg of segments) {
    if (seg === "..") throw new ScopeError("BAD_PATH", `Path may not contain "..": ${relPath}`);
    if (seg.includes(":")) throw new ScopeError("BAD_PATH", `Path segment may not contain ":": ${seg}`);
  }
  return segments;
}

/* ---------- symlink containment ---------- */

function lexists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/** realpath of the deepest existing ancestor, with the missing tail re-joined. */
export function canonicalize(abs: string): string {
  let cur = abs;
  const tail: string[] = [];
  while (!lexists(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    tail.unshift(path.basename(cur));
    cur = parent;
  }
  let real: string;
  try {
    real = fs.realpathSync.native(cur);
  } catch {
    throw new ScopeError("ESCAPE", `Cannot resolve ${abs}: broken link.`);
  }
  return tail.length ? path.join(real, ...tail) : real;
}

export function assertNoSymlinkEscape(root: string, abs: string): string {
  const realRoot = lexists(root) ? canonicalize(root) : path.resolve(root);
  const realAbs = canonicalize(abs);
  if (realAbs !== realRoot && !isUnderDir(realRoot, realAbs)) {
    throw new ScopeError("ESCAPE", `Denied: ${abs} resolves outside its folder scope.`);
  }
  return realAbs;
}

/* ---------- resolution ---------- */

export type Resolved = { abs: string; root: string; display: string };

export function resolveScopePath(folders: FoldersConfig, target: ScopedTarget): Resolved {
  const segments = safeSegments(target.relPath ?? "");
  const root = scopeRoot(folders, target.scope, target.agentName);
  assertScopeConnected(folders, target.scope);
  const abs = segments.length ? path.join(root, ...segments) : root;
  if (abs !== root && !isUnderDir(root, abs)) {
    throw new ScopeError("ESCAPE", `Denied: ${target.relPath} leaves ${target.scope}.`);
  }
  assertNoSymlinkEscape(root, abs);
  return { abs, root, display: displayPath(target.scope, segments.join("/")) };
}

/* ---------- agent records (grants live next to the agent, outside private/) ---------- */

function agentJsonPath(folders: FoldersConfig, agentName: string): string {
  return path.join(agentDir(folders, agentName), "agent.json");
}

export function readAgent(folders: FoldersConfig, agentName: string): AgentRecord | null {
  try {
    const raw = JSON.parse(fs.readFileSync(agentJsonPath(folders, agentName), "utf8")) as Partial<AgentRecord>;
    const scopes = Array.isArray(raw.scopes) ? raw.scopes.filter(isScopeId) : [];
    return {
      name: typeof raw.name === "string" ? raw.name : agentName,
      job: typeof raw.job === "string" ? raw.job : "",
      modelId: typeof raw.modelId === "string" ? raw.modelId : "",
      color: typeof raw.color === "string" ? raw.color : "",
      mascotId: typeof raw.mascotId === "string" ? raw.mascotId : "",
      scopes: normalizeScopes(scopes),
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
      archived: raw.archived === true,
    };
  } catch {
    return null;
  }
}

function writeAgentRecord(dir: string, record: AgentRecord): void {
  fs.writeFileSync(path.join(dir, "agent.json"), JSON.stringify(record, null, 2) + "\n", "utf8");
}

/** Folder names directly under `agents/` (case preserved). Missing `agents/` is an empty list. */
export function listAgentDirs(folders: FoldersConfig): string[] {
  try {
    return fs
      .readdirSync(agentsDir(folders), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/**
 * The on-disk folder that already owns `name`, compared case-insensitively so
 * "Writer" and "writer" collide on every OS (case-insensitive filesystems
 * would otherwise merge them silently). `null` when the name is free.
 */
export function agentDirOwner(folders: FoldersConfig, name: string): string | null {
  const want = agentSlug(name).toLowerCase();
  return listAgentDirs(folders).find((d) => d.toLowerCase() === want) ?? null;
}

export function normalizeScopes(scopes: readonly string[]): ScopeId[] {
  const set = new Set<ScopeId>(["private"]);
  for (const s of scopes) if (isScopeId(s)) set.add(s);
  return SCOPE_IDS.filter((s) => set.has(s));
}

export function agentScopes(folders: FoldersConfig, agentName: string): ScopeId[] {
  return readAgent(folders, agentName)?.scopes ?? ["private"];
}

/** Resolve for a model tool call: containment + this agent's scope grant. */
export function resolveForAgent(folders: FoldersConfig, target: ScopedTarget): Resolved {
  if (!isScopeId(target.scope)) {
    throw new ScopeError("BAD_SCOPE", `Unknown scope: ${String(target.scope)}`);
  }
  if (!agentScopes(folders, target.agentName).includes(target.scope)) {
    throw new ScopeError(
      "NOT_GRANTED",
      `Denied: ${target.agentName} is not granted ${target.scope}.`,
    );
  }
  return resolveScopePath(folders, target);
}

export type EnsureAgentInput = {
  name: string;
  job: string;
  modelId: string;
  color: string;
  mascotId: string;
  scopes: readonly string[];
  standingInstructions: string;
  createdAt: string;
  /** Omitted = keep whatever agent.json already says (false for a new agent). */
  archived?: boolean;
};

export type AgentPaths = {
  agentDir: string;
  privatePath: string;
  scopes: ScopeId[];
  name: string;
  archived: boolean;
};

/**
 * Create `agents/{Name}/{agent.json, AGENTS.md, private/memory/notes.md, private/output/}`.
 * Idempotent; never overwrites AGENTS.md or memory. An existing folder whose
 * name differs only by case is refused (`EXISTS`) instead of being merged.
 */
export function ensureAgent(folders: FoldersConfig, input: EnsureAgentInput): AgentPaths {
  const name = assertAgentName(input.name);
  const owner = agentDirOwner(folders, name);
  if (owner && owner !== name) {
    throw new ScopeError("EXISTS", `An agent folder named ${owner} already exists.`);
  }
  const dir = agentDir(folders, name);
  const priv = privateRoot(folders, name);
  const existing = readAgent(folders, name);
  fs.mkdirSync(path.join(priv, "memory"), { recursive: true });
  fs.mkdirSync(path.join(priv, "output"), { recursive: true });
  const scopes = normalizeScopes(input.scopes);
  const record: AgentRecord = {
    name,
    job: input.job,
    modelId: input.modelId,
    color: input.color,
    mascotId: input.mascotId,
    scopes,
    createdAt: input.createdAt,
    archived: input.archived ?? existing?.archived ?? false,
  };
  writeAgentRecord(dir, record);
  const agentsMd = path.join(dir, "AGENTS.md");
  if (!fs.existsSync(agentsMd)) {
    fs.writeFileSync(agentsMd, `# ${name}\n\n${input.job}\n\n${input.standingInstructions}\n`, "utf8");
  }
  const notes = path.join(priv, "memory", "notes.md");
  if (!fs.existsSync(notes)) {
    fs.writeFileSync(notes, `# Memory\n\nStanding context for ${name}.\n`, "utf8");
  }
  return { agentDir: dir, privatePath: priv, scopes, name, archived: record.archived };
}

function requireAgentDir(folders: FoldersConfig, agentName: string): string {
  const dir = agentDir(folders, agentName);
  let st: fs.Stats;
  try {
    st = fs.lstatSync(dir);
  } catch {
    throw new ScopeError("NOT_FOUND", `No agent folder for ${agentName} under agents/.`);
  }
  if (!st.isDirectory()) throw new ScopeError("NOT_FOUND", `agents/${agentSlug(agentName)} is not a folder.`);
  assertNoSymlinkEscape(agentsDir(folders), dir);
  return dir;
}

/** Swap the `# Old` heading for `# New` in an instructions file; other content untouched. */
function retitleMarkdown(file: string, oldName: string, newName: string): void {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  const next = text.replace(/^# (.*)$/m, (line, title: string) =>
    title.trim() === oldName ? `# ${newName}` : line,
  );
  if (next !== text) fs.writeFileSync(file, next, "utf8");
}

/**
 * `agents/{Old}/` → `agents/{New}/`: the whole tree moves (agent.json,
 * AGENTS.md, private/memory, private/output). A case-only rename goes through
 * a temporary name so case-insensitive filesystems do it too. Refused when a
 * different agent already owns the name (case-insensitively), when the source
 * is missing, or when the new name is illegal. Nothing is copied or deleted.
 */
export function renameAgent(folders: FoldersConfig, oldName: string, newName: string): AgentPaths {
  const next = assertAgentName(newName);
  const src = requireAgentDir(folders, oldName);
  const oldSlug = path.basename(src);
  const record = readAgent(folders, oldName);
  if (!record) throw new ScopeError("NOT_FOUND", `agents/${oldSlug} has no agent.json.`);
  if (next === oldSlug) {
    return { agentDir: src, privatePath: path.join(src, "private"), scopes: record.scopes, name: oldSlug, archived: record.archived };
  }
  const owner = agentDirOwner(folders, next);
  if (owner && owner !== oldSlug) {
    throw new ScopeError("EXISTS", `An agent named ${owner} already exists.`);
  }
  const dst = agentDir(folders, next);
  assertNoSymlinkEscape(agentsDir(folders), dst);
  const caseOnly = owner === oldSlug;
  if (caseOnly) {
    const tmp = path.join(agentsDir(folders), `.rename-${process.pid}-${Date.now()}`);
    fs.renameSync(src, tmp);
    try {
      fs.renameSync(tmp, dst);
    } catch (err) {
      fs.renameSync(tmp, src);
      throw err;
    }
  } else {
    if (fs.existsSync(dst)) throw new ScopeError("EXISTS", `An agent named ${next} already exists.`);
    fs.renameSync(src, dst);
  }
  writeAgentRecord(dst, { ...record, name: next });
  retitleMarkdown(path.join(dst, "AGENTS.md"), record.name || oldSlug, next);
  retitleMarkdown(path.join(dst, "private", "AGENTS.md"), record.name || oldSlug, next);
  return { agentDir: dst, privatePath: path.join(dst, "private"), scopes: record.scopes, name: next, archived: record.archived };
}

/** `Writer copy`, then `Writer copy 2`, … — free on disk and not in `avoid`. */
export function uniqueCopyName(folders: FoldersConfig, baseName: string, avoid: readonly string[] = []): string {
  const taken = new Set([...listAgentDirs(folders), ...avoid].map((n) => n.toLowerCase()));
  const base = agentSlug(baseName).replace(/ copy( \d+)?$/i, "");
  const room = AGENT_NAME_MAX - " copy 999".length;
  const stem = base.length > room ? base.slice(0, room).trimEnd() : base;
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? `${stem} copy` : `${stem} copy ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  throw new ScopeError("EXISTS", `Too many copies of ${base}.`);
}

/**
 * Duplicate: a new `agents/{New}/` tree with a copy of the source `private/`
 * (memory/notes.md, output/, everything else) and the source AGENTS.md, plus a
 * fresh agent.json. The two agents never share a folder. Refused when the
 * target already exists on disk (case-insensitively).
 */
export function copyAgent(
  folders: FoldersConfig,
  srcName: string,
  dstName: string,
  now: string = new Date().toISOString(),
): AgentPaths {
  const next = assertAgentName(dstName);
  const src = requireAgentDir(folders, srcName);
  const record = readAgent(folders, srcName);
  if (!record) throw new ScopeError("NOT_FOUND", `agents/${path.basename(src)} has no agent.json.`);
  const owner = agentDirOwner(folders, next);
  if (owner) throw new ScopeError("EXISTS", `An agent named ${owner} already exists.`);
  const dst = agentDir(folders, next);
  assertNoSymlinkEscape(agentsDir(folders), dst);
  if (fs.existsSync(dst)) throw new ScopeError("EXISTS", `An agent named ${next} already exists.`);
  fs.mkdirSync(dst);
  const srcPrivate = path.join(src, "private");
  const dstPrivate = path.join(dst, "private");
  if (fs.existsSync(srcPrivate)) {
    fs.cpSync(srcPrivate, dstPrivate, { recursive: true, dereference: false, errorOnExist: true, force: false });
  }
  fs.mkdirSync(path.join(dstPrivate, "memory"), { recursive: true });
  fs.mkdirSync(path.join(dstPrivate, "output"), { recursive: true });
  const srcAgentsMd = path.join(src, "AGENTS.md");
  if (fs.existsSync(srcAgentsMd)) {
    fs.copyFileSync(srcAgentsMd, path.join(dst, "AGENTS.md"));
    retitleMarkdown(path.join(dst, "AGENTS.md"), record.name || path.basename(src), next);
  }
  // The mirrored copy names the source agent; the sidecar regenerates it before the first prompt.
  fs.rmSync(path.join(dstPrivate, "AGENTS.md"), { force: true });
  const notes = path.join(dstPrivate, "memory", "notes.md");
  if (!fs.existsSync(notes)) {
    fs.writeFileSync(notes, `# Memory\n\nStanding context for ${next}.\n`, "utf8");
  }
  const fresh: AgentRecord = { ...record, name: next, createdAt: now, archived: false };
  writeAgentRecord(dst, fresh);
  return { agentDir: dst, privatePath: dstPrivate, scopes: fresh.scopes, name: next, archived: false };
}

/** Flip `archived` in agent.json. Touches nothing else: no file is moved or removed. */
export function setAgentArchived(folders: FoldersConfig, agentName: string, archived: boolean): AgentRecord {
  const dir = requireAgentDir(folders, agentName);
  const cur = readAgent(folders, agentName);
  if (!cur) throw new ScopeError("NOT_FOUND", `agents/${path.basename(dir)} has no agent.json.`);
  const next: AgentRecord = { ...cur, archived: Boolean(archived) };
  writeAgentRecord(dir, next);
  return next;
}

export function setAgentScopes(folders: FoldersConfig, agentName: string, scopes: readonly string[]): ScopeId[] {
  const cur = readAgent(folders, agentName);
  if (!cur) throw new ScopeError("BAD_PATH", `No agent folder for ${agentName}.`);
  const next = normalizeScopes(scopes);
  fs.writeFileSync(
    agentJsonPath(folders, agentName),
    JSON.stringify({ ...cur, scopes: next }, null, 2) + "\n",
    "utf8",
  );
  return next;
}

export function readAgentStanding(folders: FoldersConfig, agentName: string): string | null {
  try {
    return fs.readFileSync(path.join(agentDir(folders, agentName), "AGENTS.md"), "utf8");
  } catch {
    return null;
  }
}

/** Remove `agents/{Name}` entirely. Only ever inside `{employeeRoot}/agents`. */
export function removeAgent(folders: FoldersConfig, agentName: string): void {
  const dir = agentDir(folders, agentName);
  assertNoSymlinkEscape(agentsDir(folders), dir);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------- folder validation / set ---------- */

export type FolderCheck = {
  ok: boolean;
  path: string;
  exists: boolean;
  isDir: boolean;
  writable: boolean;
  error: string | null;
};

export function validateFolder(input: string): FolderCheck {
  const p = input.trim();
  const base: FolderCheck = { ok: false, path: p, exists: false, isDir: false, writable: false, error: null };
  if (!p) return { ...base, error: "Empty path." };
  if (!path.isAbsolute(p)) return { ...base, error: "Path must be absolute." };
  const resolved = path.resolve(p);
  let st: fs.Stats;
  try {
    st = fs.statSync(resolved);
  } catch {
    return { ...base, path: resolved, error: "Folder does not exist or is disconnected." };
  }
  if (!st.isDirectory()) return { ...base, path: resolved, exists: true, error: "Not a folder." };
  let writable = false;
  try {
    fs.accessSync(resolved, fs.constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }
  return { ok: true, path: resolved, exists: true, isDir: true, writable, error: null };
}

export type SetFoldersResult =
  | { ok: true; folders: FoldersConfig; previous: FoldersConfig | null }
  | { ok: false; error: string; field: keyof FoldersConfig | null };

/**
 * Save the four scopes. `create` makes missing folders (the "Create my folders"
 * path); otherwise each chosen folder must already exist. Changing a folder
 * never moves old files — the caller shows the previous locations.
 */
export function setFolders(input: Partial<FoldersConfig>, opts: { create: boolean }): SetFoldersResult {
  const previous = loadConfig().folders;
  const clean = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? path.resolve(v.trim()) : null;
  const employeeRoot = clean(input.employeeRoot);
  if (!employeeRoot) return { ok: false, error: "My agents folder is required.", field: "employeeRoot" };
  if (!path.isAbsolute(String(input.employeeRoot).trim())) {
    return { ok: false, error: "My agents folder must be an absolute path.", field: "employeeRoot" };
  }
  const folders: FoldersConfig = {
    employeeRoot,
    employeeShared: clean(input.employeeShared),
    departmentShared: clean(input.departmentShared),
    companyShared: clean(input.companyShared),
  };
  for (const key of Object.keys(folders) as (keyof FoldersConfig)[]) {
    const v = folders[key];
    if (!v) continue;
    if (opts.create) {
      try {
        fs.mkdirSync(v, { recursive: true });
      } catch (err) {
        return { ok: false, error: `Cannot create ${v}: ${(err as Error).message}`, field: key };
      }
    }
    const check = validateFolder(v);
    if (!check.ok) return { ok: false, error: `${v}: ${check.error}`, field: key };
  }
  fs.mkdirSync(agentsDir(folders), { recursive: true });
  patchConfig({ folders });
  return { ok: true, folders, previous };
}

/* ---------- scoped disk operations (agent tools) ---------- */

function relOf(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join("/");
}

export function scopedList(folders: FoldersConfig, t: ScopedTarget, forAgent: boolean): ScopedEntry[] {
  const r = forAgent ? resolveForAgent(folders, t) : resolveScopePath(folders, t);
  return diskList(r.root, r.abs).map((e) => ({
    name: e.name,
    kind: e.kind,
    size: e.size,
    relPath: relOf(r.root, e.path),
  }));
}

export function scopedRead(folders: FoldersConfig, t: ScopedTarget, forAgent: boolean): string {
  const r = forAgent ? resolveForAgent(folders, t) : resolveScopePath(folders, t);
  return diskRead(r.root, r.abs);
}

export function scopedStat(folders: FoldersConfig, t: ScopedTarget, forAgent: boolean): ScopedEntry | null {
  const r = forAgent ? resolveForAgent(folders, t) : resolveScopePath(folders, t);
  const st = diskStat(r.root, r.abs);
  if (!st) return null;
  return { name: st.name, kind: st.kind, size: st.size, relPath: relOf(r.root, st.path) };
}

export function scopedWrite(folders: FoldersConfig, t: ScopedTarget, content: string): string {
  const r = resolveForAgent(folders, t);
  diskWrite(r.root, r.abs, content);
  return r.display;
}

export function scopedMkdir(folders: FoldersConfig, t: ScopedTarget): string {
  const r = resolveForAgent(folders, t);
  diskMkdir(r.root, r.abs);
  return r.display;
}

export function scopedReplace(folders: FoldersConfig, t: ScopedTarget, oldString: string, newString: string): string {
  const r = resolveForAgent(folders, t);
  diskReplace(r.root, r.abs, oldString, newString);
  return r.display;
}

export function scopedDelete(folders: FoldersConfig, t: ScopedTarget): string {
  const r = resolveForAgent(folders, t);
  if (r.abs === r.root) throw new ScopeError("BAD_PATH", `Refusing to delete the ${t.scope} folder itself.`);
  diskDelete(r.root, r.abs);
  return r.display;
}

export function scopedTree(folders: FoldersConfig, t: ScopedTarget, max: number, forAgent: boolean): string {
  const r = forAgent ? resolveForAgent(folders, t) : resolveScopePath(folders, t);
  const tree = diskPrettyTree(r.root, r.abs, max);
  const first = tree.split("\n")[0] ?? "";
  return tree.replace(first, r.display.replace(/\/$/, "") + (first.endsWith("/") ? "/" : ""));
}

/** Workspace shell runs inside the agent's private folder only. */
export function scopedShell(folders: FoldersConfig, agentName: string, command: string): DiskShellResult {
  const root = resolveForAgent(folders, { scope: "private", relPath: "", agentName }).abs;
  return diskShell(root, root, command, undefined, (abs) => assertNoSymlinkEscape(root, abs));
}
