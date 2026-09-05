/**
 * Stage 7 — durable host state next to `localbot-config.json`.
 *
 *   {dataDir}/localbot-agents.json      the host index (this file)
 *   {dataDir}/chats/{agentId}.json      one chat transcript per agent
 *   {employeeRoot}/agents/{Name}/agent.json   stays the source of truth for
 *                                        job / modelId / color / mascot / scopes / archived
 *
 * The roster the sidebar shows is `agents/*\/agent.json` JOINed to the index by
 * agent name: the index adds the stable `id` (chats and the ACP session map
 * key on it), the browser-ish flags (`pinned` / `hidden` / `unread`) and the
 * persisted ACP `sessionId` + `sessionCwd`. A folder with no index row gets a
 * fresh row (hand-copied agents appear); a row whose folder is gone is not in
 * the roster (the row is kept so its chat file stays addressable).
 *
 * Nothing in here is under a scope root: the model's file tools cannot read
 * chat history as work files. Every write is temp + rename (`atomicWriteJson`).
 */
import fs from "node:fs";
import path from "node:path";
import type { FoldersConfig, ScopeId } from "../types.ts";
import { atomicWriteJson, dataDir, isUnderDir } from "./disk.ts";
import { agentSlug } from "./scope-model.ts";
import { listAgentDirs, privateRoot, readAgent, readAgentStanding, standingBodyOf } from "./scopes.ts";

export const HOST_INDEX_VERSION = 1;
export const SECTION_NAME_MAX = 40;
export const HOST_INDEX_FILE = "localbot-agents.json";
export const CHATS_DIR = "chats";
export const LEGACY_BROWSER_KEY = "localbot-state-v3";

export type HostLabel = { id: string; name: string; createdAt: string };

export type HostAgentRow = {
  id: string;
  /** Folder name under `agents/`; the join key to agent.json. */
  name: string;
  pinned: boolean;
  /** Local roster filter (was "this browser only"; now per data dir). Not archive. */
  hidden: boolean;
  unread: number;
  /** ACP session id from the last session/new or session/resume, or null. */
  sessionId: string | null;
  /** The `agents/{Name}/private` cwd that session was opened with; resume requires the same. */
  sessionCwd: string | null;
  /** Stage 12: the roster section this agent is filed under; null = unsorted. Lives here, not in React state. */
  sectionId: string | null;
  createdAt: string;
};

/** Stage 12: a roster section (a heading the sidebar groups agents under). Lives in the host index. */
export type HostSection = { id: string; name: string; order: number };

export type HostIndex = {
  version: 1;
  onboarded: boolean;
  company: HostLabel | null;
  department: HostLabel | null;
  employee: HostLabel | null;
  /** Default model for new agents (catalog id or imported filename). */
  selectedCatalogId: string | null;
  /** Set once by `stateMigrate`; never treats the browser copy as truth afterwards. */
  migratedFrom: string | null;
  updatedAt: string;
  /** Stage 12: roster sections, sorted by `order`. */
  sections: HostSection[];
  agents: HostAgentRow[];
};

export function hostIndexPath(): string {
  return path.join(dataDir(), HOST_INDEX_FILE);
}

export function chatsDir(): string {
  return path.join(dataDir(), CHATS_DIR);
}

export function emptyHostIndex(): HostIndex {
  return {
    version: HOST_INDEX_VERSION,
    onboarded: false,
    company: null,
    department: null,
    employee: null,
    selectedCatalogId: null,
    migratedFrom: null,
    updatedAt: "",
    sections: [],
    agents: [],
  };
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function label(raw: unknown): HostLabel | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) return null;
  return {
    id: typeof r.id === "string" && r.id ? r.id : newId("lbl"),
    name,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
  };
}

function row(raw: unknown): HostAgentRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) return null;
  const sessionId = typeof r.sessionId === "string" && r.sessionId ? r.sessionId : null;
  return {
    id: typeof r.id === "string" && r.id ? r.id : newId("bot"),
    name,
    pinned: r.pinned === true,
    hidden: r.hidden === true,
    unread: typeof r.unread === "number" && r.unread > 0 ? Math.floor(r.unread) : 0,
    sessionId,
    sessionCwd: sessionId && typeof r.sessionCwd === "string" && r.sessionCwd ? r.sessionCwd : null,
    sectionId: typeof r.sectionId === "string" && r.sectionId ? r.sectionId : null,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
  };
}

function section(raw: unknown, fallbackOrder: number): HostSection | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, SECTION_NAME_MAX) : "";
  if (!name) return null;
  return {
    id: typeof r.id === "string" && r.id ? r.id : newId("sec"),
    name,
    order: typeof r.order === "number" && Number.isFinite(r.order) ? r.order : fallbackOrder,
  };
}

/** True when the index file exists (migration and onboarding branch on this). */
export function hostIndexExists(): boolean {
  return fs.existsSync(hostIndexPath());
}

export function loadHostIndex(): HostIndex {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(hostIndexPath(), "utf8")) as Record<string, unknown>;
  } catch {
    return emptyHostIndex();
  }
  const sections: HostSection[] = [];
  const sectionIds = new Set<string>();
  (Array.isArray(raw.sections) ? raw.sections : []).forEach((s, i) => {
    const sec = section(s, i);
    if (!sec || sectionIds.has(sec.id)) return;
    sectionIds.add(sec.id);
    sections.push(sec);
  });
  sections.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const agents: HostAgentRow[] = [];
  const seen = new Set<string>();
  for (const a of Array.isArray(raw.agents) ? raw.agents : []) {
    const r = row(a);
    if (!r || seen.has(r.name.toLowerCase())) continue;
    seen.add(r.name.toLowerCase());
    // A row filed under a section that no longer exists is unsorted, not lost.
    agents.push(r.sectionId && !sectionIds.has(r.sectionId) ? { ...r, sectionId: null } : r);
  }
  return {
    version: HOST_INDEX_VERSION,
    onboarded: raw.onboarded === true,
    company: label(raw.company),
    department: label(raw.department),
    employee: label(raw.employee),
    selectedCatalogId: typeof raw.selectedCatalogId === "string" && raw.selectedCatalogId ? raw.selectedCatalogId : null,
    migratedFrom: typeof raw.migratedFrom === "string" && raw.migratedFrom ? raw.migratedFrom : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    sections,
    agents,
  };
}

export function saveHostIndex(index: HostIndex): HostIndex {
  const next: HostIndex = { ...index, version: HOST_INDEX_VERSION, updatedAt: new Date().toISOString() };
  atomicWriteJson(hostIndexPath(), next);
  return next;
}

export type HostIndexPatch = Partial<Pick<HostIndex, "onboarded" | "company" | "department" | "employee" | "selectedCatalogId">>;

export function patchHostIndex(patch: HostIndexPatch): HostIndex {
  const cur = loadHostIndex();
  return saveHostIndex({
    ...cur,
    onboarded: patch.onboarded !== undefined ? patch.onboarded : cur.onboarded,
    company: patch.company !== undefined ? label(patch.company) : cur.company,
    department: patch.department !== undefined ? label(patch.department) : cur.department,
    employee: patch.employee !== undefined ? label(patch.employee) : cur.employee,
    selectedCatalogId: patch.selectedCatalogId !== undefined ? patch.selectedCatalogId : cur.selectedCatalogId,
  });
}

/* ---------- rows ---------- */

function sameName(a: string, b: string): boolean {
  return agentSlug(a).toLowerCase() === agentSlug(b).toLowerCase();
}

export function findRow(index: HostIndex, agentName: string): HostAgentRow | undefined {
  return index.agents.find((r) => sameName(r.name, agentName));
}

export function findRowById(index: HostIndex, id: string): HostAgentRow | undefined {
  return index.agents.find((r) => r.id === id);
}

/**
 * The row for a folder name, created when missing. `createdAt` / `id` may be
 * supplied by a migration so old chats keep their key.
 */
export function ensureRow(agentName: string, seed?: Partial<Pick<HostAgentRow, "id" | "pinned" | "hidden" | "unread" | "createdAt">>): HostAgentRow {
  const index = loadHostIndex();
  const existing = findRow(index, agentName);
  if (existing) return existing;
  const fresh: HostAgentRow = {
    id: seed?.id && !findRowById(index, seed.id) ? seed.id : newId("bot"),
    name: agentName,
    pinned: seed?.pinned === true,
    hidden: seed?.hidden === true,
    unread: seed?.unread ?? 0,
    sessionId: null,
    sessionCwd: null,
    sectionId: null,
    createdAt: seed?.createdAt || new Date().toISOString(),
  };
  saveHostIndex({ ...index, agents: [...index.agents, fresh] });
  return fresh;
}

export type HostAgentPatch = Partial<Pick<HostAgentRow, "pinned" | "hidden" | "unread" | "sectionId">>;

export class HostIndexError extends Error {
  code: "BAD_NAME" | "NOT_FOUND" | "EXISTS";
  constructor(code: "BAD_NAME" | "NOT_FOUND" | "EXISTS", message: string) {
    super(message);
    this.code = code;
    this.name = "HostIndexError";
  }
}

export function patchRowById(id: string, patch: HostAgentPatch): HostAgentRow | null {
  const index = loadHostIndex();
  const cur = findRowById(index, id);
  if (!cur) return null;
  let sectionId = cur.sectionId;
  if (patch.sectionId !== undefined) {
    if (patch.sectionId !== null && !index.sections.some((s) => s.id === patch.sectionId)) {
      throw new HostIndexError("NOT_FOUND", `No section with id ${patch.sectionId}.`);
    }
    sectionId = patch.sectionId;
  }
  const next: HostAgentRow = {
    ...cur,
    pinned: patch.pinned !== undefined ? Boolean(patch.pinned) : cur.pinned,
    hidden: patch.hidden !== undefined ? Boolean(patch.hidden) : cur.hidden,
    unread: patch.unread !== undefined ? Math.max(0, Math.floor(patch.unread)) : cur.unread,
    sectionId,
  };
  saveHostIndex({ ...index, agents: index.agents.map((r) => (r.id === id ? next : r)) });
  return next;
}

/* ---------- Stage 12: roster sections (durable, in the index) ---------- */

function cleanSectionName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new HostIndexError("BAD_NAME", "Section name cannot be empty.");
  if (name.length > SECTION_NAME_MAX) throw new HostIndexError("BAD_NAME", `Section name is longer than ${SECTION_NAME_MAX} characters.`);
  return name;
}

export function listSections(): HostSection[] {
  return loadHostIndex().sections;
}

/** New section at the end of the list. Names are unique case-insensitively. */
export function createSection(name: string): HostSection {
  const clean = cleanSectionName(name);
  const index = loadHostIndex();
  if (index.sections.some((s) => s.name.toLowerCase() === clean.toLowerCase())) {
    throw new HostIndexError("EXISTS", `A section named ${clean} already exists.`);
  }
  const order = index.sections.reduce((m, s) => Math.max(m, s.order), -1) + 1;
  const fresh: HostSection = { id: newId("sec"), name: clean, order };
  saveHostIndex({ ...index, sections: [...index.sections, fresh] });
  return fresh;
}

export function renameSection(id: string, name: string): HostSection {
  const clean = cleanSectionName(name);
  const index = loadHostIndex();
  const cur = index.sections.find((s) => s.id === id);
  if (!cur) throw new HostIndexError("NOT_FOUND", `No section with id ${id}.`);
  if (index.sections.some((s) => s.id !== id && s.name.toLowerCase() === clean.toLowerCase())) {
    throw new HostIndexError("EXISTS", `A section named ${clean} already exists.`);
  }
  const next: HostSection = { ...cur, name: clean };
  saveHostIndex({ ...index, sections: index.sections.map((s) => (s.id === id ? next : s)) });
  return next;
}

/** Delete a section; the agents filed under it become unsorted. No agent folder is touched. */
export function deleteSection(id: string): { removed: HostSection; unsorted: number } {
  const index = loadHostIndex();
  const cur = index.sections.find((s) => s.id === id);
  if (!cur) throw new HostIndexError("NOT_FOUND", `No section with id ${id}.`);
  const unsorted = index.agents.filter((r) => r.sectionId === id).length;
  saveHostIndex({
    ...index,
    sections: index.sections.filter((s) => s.id !== id),
    agents: index.agents.map((r) => (r.sectionId === id ? { ...r, sectionId: null } : r)),
  });
  return { removed: cur, unsorted };
}

/** Reorder: `ids` in the wanted order; sections not listed keep their relative order after them. */
export function reorderSections(ids: readonly string[]): HostSection[] {
  const index = loadHostIndex();
  const byId = new Map(index.sections.map((s) => [s.id, s]));
  const ordered: HostSection[] = [];
  for (const id of ids) {
    const s = byId.get(id);
    if (s && !ordered.includes(s)) ordered.push(s);
  }
  for (const s of index.sections) if (!ordered.includes(s)) ordered.push(s);
  const sections = ordered.map((s, i) => ({ ...s, order: i }));
  saveHostIndex({ ...index, sections });
  return sections;
}

/** Rename keeps the id (chats stay addressable) and drops the session (its cwd moved). */
export function renameRow(oldName: string, newName: string): HostAgentRow | null {
  const index = loadHostIndex();
  const cur = findRow(index, oldName);
  if (!cur) return null;
  const next: HostAgentRow = { ...cur, name: newName, sessionId: null, sessionCwd: null };
  saveHostIndex({ ...index, agents: index.agents.map((r) => (r.id === cur.id ? next : r)) });
  return next;
}

/** Delete: the row goes and so does the chat file. Only called from `agentRemove`. */
export function removeRow(agentName: string): HostAgentRow | null {
  const index = loadHostIndex();
  const cur = findRow(index, agentName);
  if (!cur) return null;
  saveHostIndex({ ...index, agents: index.agents.filter((r) => r.id !== cur.id) });
  fs.rmSync(chatPath(cur.id), { force: true });
  fs.rmSync(`${chatPath(cur.id)}.bak`, { force: true });
  return cur;
}

/* ---------- ACP session map ---------- */

export type PersistedSession = { sessionId: string; cwd: string };

/** What `HarnessManager` needs; the default lives in the host index, tests can swap a Map. */
export type SessionStore = {
  load(agentName: string): PersistedSession | null;
  save(agentName: string, sessionId: string, cwd: string): void;
  clear(agentName: string): void;
};

export function readAgentSession(agentName: string): PersistedSession | null {
  const r = findRow(loadHostIndex(), agentName);
  return r?.sessionId && r.sessionCwd ? { sessionId: r.sessionId, cwd: r.sessionCwd } : null;
}

export function writeAgentSession(agentName: string, sessionId: string, cwd: string): void {
  ensureRow(agentName);
  const index = loadHostIndex();
  saveHostIndex({
    ...index,
    agents: index.agents.map((r) => (sameName(r.name, agentName) ? { ...r, sessionId, sessionCwd: path.resolve(cwd) } : r)),
  });
}

export function clearAgentSession(agentName: string): void {
  const index = loadHostIndex();
  if (!findRow(index, agentName)) return;
  saveHostIndex({
    ...index,
    agents: index.agents.map((r) => (sameName(r.name, agentName) ? { ...r, sessionId: null, sessionCwd: null } : r)),
  });
}

export const hostIndexSessionStore: SessionStore = {
  load: readAgentSession,
  save: writeAgentSession,
  clear: clearAgentSession,
};

/* ---------- roster: agents/*\/agent.json JOIN index ---------- */

export type RosterEntry = {
  id: string;
  name: string;
  job: string;
  color: string;
  mascotId: string;
  modelId: string;
  scopes: ScopeId[];
  privatePath: string;
  /** The employee-managed agents/{Name}/AGENTS.md, or "" when missing. */
  standingInstructions: string;
  pinned: boolean;
  hidden: boolean;
  archived: boolean;
  unread: number;
  /** Stage 12: from the index row; null = unsorted. */
  sectionId: string | null;
  createdAt: string;
  sessionId: string | null;
};

/**
 * Build the roster from disk. Every `agents/{Name}/` with a readable agent.json
 * is a row; the index supplies id / pinned / hidden / unread / session. Folders
 * without an index row get one now (the index is written once for all of them).
 */
export function loadRoster(folders: FoldersConfig): RosterEntry[] {
  const dirs = listAgentDirs(folders);
  let index = loadHostIndex();
  const missing: HostAgentRow[] = [];
  for (const name of dirs) {
    if (!readAgent(folders, name)) continue;
    if (findRow(index, name) || missing.some((m) => sameName(m.name, name))) continue;
    missing.push({
      id: newId("bot"),
      name,
      pinned: false,
      hidden: false,
      unread: 0,
      sessionId: null,
      sessionCwd: null,
      sectionId: null,
      createdAt: readAgent(folders, name)?.createdAt || new Date().toISOString(),
    });
  }
  if (missing.length > 0) index = saveHostIndex({ ...index, agents: [...index.agents, ...missing] });
  const out: RosterEntry[] = [];
  for (const name of dirs) {
    const rec = readAgent(folders, name);
    const r = findRow(index, name);
    if (!rec || !r) continue;
    out.push({
      id: r.id,
      name: rec.name || name,
      job: rec.job,
      color: rec.color,
      mascotId: rec.mascotId,
      modelId: rec.modelId,
      scopes: rec.scopes,
      privatePath: privateRoot(folders, name),
      standingInstructions: standingBodyOf(readAgentStanding(folders, name)),
      pinned: r.pinned,
      hidden: r.hidden,
      archived: rec.archived,
      unread: r.unread,
      sectionId: r.sectionId,
      createdAt: rec.createdAt || r.createdAt,
      sessionId: r.sessionId,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------- chats ---------- */

export type ChatFile = {
  version: 1;
  agentId: string;
  messages: unknown[];
  chatGrants: Record<string, true>;
  lastReadAt: string;
  updatedAt: string;
};

export function chatPath(agentId: string): string {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(agentId)) throw new Error(`Bad agent id: ${agentId}`);
  return path.join(chatsDir(), `${agentId}.json`);
}

/** Chats are LocalBot metadata, never work product: refuse a chats dir inside any scope root. */
export function assertChatsOutsideScopes(folders: FoldersConfig | null): void {
  if (!folders) return;
  const dir = chatsDir();
  for (const root of [folders.employeeRoot, folders.employeeShared, folders.departmentShared, folders.companyShared]) {
    if (root && isUnderDir(root, dir)) {
      throw new Error(`Refusing to store chats under a scope folder (${root}). Move LOCALBOT_DATA_DIR out of the work folders.`);
    }
  }
}

export function readChat(agentId: string): ChatFile | null {
  try {
    const raw = JSON.parse(fs.readFileSync(chatPath(agentId), "utf8")) as Partial<ChatFile>;
    return {
      version: 1,
      agentId,
      messages: Array.isArray(raw.messages) ? raw.messages : [],
      chatGrants: raw.chatGrants && typeof raw.chatGrants === "object" ? (raw.chatGrants as Record<string, true>) : {},
      lastReadAt: typeof raw.lastReadAt === "string" ? raw.lastReadAt : "",
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    };
  } catch {
    return null;
  }
}

export function writeChat(agentId: string, body: Pick<ChatFile, "messages" | "chatGrants" | "lastReadAt">, folders: FoldersConfig | null): ChatFile {
  assertChatsOutsideScopes(folders);
  const file: ChatFile = {
    version: 1,
    agentId,
    messages: body.messages,
    chatGrants: body.chatGrants,
    lastReadAt: body.lastReadAt,
    updatedAt: new Date().toISOString(),
  };
  atomicWriteJson(chatPath(agentId), file);
  return file;
}

export function readAllChats(): Record<string, ChatFile> {
  const out: Record<string, ChatFile> = {};
  let names: string[] = [];
  try {
    names = fs.readdirSync(chatsDir()).filter((n) => n.endsWith(".json"));
  } catch {
    return out;
  }
  for (const n of names) {
    const id = n.slice(0, -".json".length);
    const c = readChat(id);
    if (c) out[id] = c;
  }
  return out;
}

/* ---------- migration from the browser copy ---------- */

/** The slice of the old `localStorage["localbot-state-v3"]` the sidecar needs. */
export type LegacySnapshot = {
  onboarded?: boolean;
  company?: { id?: string; name?: string; createdAt?: string } | null;
  departments?: { id?: string; name?: string; createdAt?: string }[];
  employees?: { id?: string; displayName?: string; createdAt?: string; departmentId?: string }[];
  activeEmployeeId?: string | null;
  selectedCatalogId?: string | null;
  bots?: {
    id?: string;
    name?: string;
    job?: string;
    color?: string;
    mascotId?: string;
    modelId?: string;
    scopes?: string[];
    standingInstructions?: string;
    pinned?: boolean;
    hidden?: boolean;
    unread?: number;
    createdAt?: string;
    archived?: boolean;
  }[];
  sessions?: Record<string, { messages?: unknown[]; chatGrants?: Record<string, true>; lastReadAt?: string }>;
};

export type MigrationResult =
  | { ok: true; migrated: true; agents: number; chats: number; index: HostIndex }
  | { ok: true; migrated: false; reason: string; index: HostIndex };

/**
 * First launch after Stage 7: the browser posts its `localbot-state-v3` once.
 * Runs only while no index exists (so it is safe to call twice); writes the
 * index + one chat file per session that had messages, keeps the old bot ids,
 * and drops a recoverable copy of the snapshot next to the index. Folders on
 * disk are created by the caller (`ensureAgent`) when folders are configured.
 */
export function migrateLegacySnapshot(snapshot: LegacySnapshot, folders: FoldersConfig | null): MigrationResult {
  if (hostIndexExists()) return { ok: true, migrated: false, reason: "index exists", index: loadHostIndex() };
  const bots = Array.isArray(snapshot.bots) ? snapshot.bots : [];
  const hasAnything = bots.length > 0 || snapshot.onboarded === true;
  if (!hasAnything) return { ok: true, migrated: false, reason: "nothing to migrate", index: loadHostIndex() };

  const employee =
    (snapshot.employees ?? []).find((e) => e.id && e.id === snapshot.activeEmployeeId) ?? (snapshot.employees ?? [])[0] ?? null;
  const department =
    (snapshot.departments ?? []).find((d) => d.id && d.id === employee?.departmentId) ?? (snapshot.departments ?? [])[0] ?? null;
  const rows: HostAgentRow[] = [];
  for (const b of bots) {
    const name = typeof b.name === "string" ? agentSlug(b.name) : "";
    if (!name || rows.some((r) => sameName(r.name, name))) continue;
    rows.push({
      id: typeof b.id === "string" && b.id && !rows.some((r) => r.id === b.id) ? b.id : newId("bot"),
      name,
      pinned: b.pinned === true,
      hidden: b.hidden === true,
      unread: typeof b.unread === "number" ? Math.max(0, Math.floor(b.unread)) : 0,
      sessionId: null,
      sessionCwd: null,
      sectionId: null,
      createdAt: typeof b.createdAt === "string" ? b.createdAt : new Date().toISOString(),
    });
  }
  let chats = 0;
  for (const r of rows) {
    const sess = snapshot.sessions?.[r.id];
    if (!sess || !Array.isArray(sess.messages) || sess.messages.length === 0) continue;
    writeChat(r.id, { messages: sess.messages, chatGrants: sess.chatGrants ?? {}, lastReadAt: sess.lastReadAt ?? "" }, folders);
    chats++;
  }
  try {
    atomicWriteJson(path.join(dataDir(), `${LEGACY_BROWSER_KEY}.migrated.json`), snapshot);
  } catch {
    /* the export is a courtesy; the index below is what counts */
  }
  const index = saveHostIndex({
    version: HOST_INDEX_VERSION,
    onboarded: snapshot.onboarded === true,
    company: label(snapshot.company),
    department: label(department),
    employee: label(employee ? { id: employee.id, name: employee.displayName, createdAt: employee.createdAt } : null),
    selectedCatalogId: typeof snapshot.selectedCatalogId === "string" ? snapshot.selectedCatalogId : null,
    migratedFrom: LEGACY_BROWSER_KEY,
    updatedAt: "",
    sections: [],
    agents: rows,
  });
  return { ok: true, migrated: true, agents: rows.length, chats, index };
}

/** "Reset this workspace": a fresh index (previous copy in `.bak`). Agent folders and chat files are not touched. */
export function resetHostIndex(): HostIndex {
  return saveHostIndex(emptyHostIndex());
}
