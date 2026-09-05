/**
 * Stage 15 — routine records on disk: `{dataDir}/routines/{id}.json`.
 *
 * Same containment idea as `chats/`: LocalBot metadata, never work product.
 * The folder is refused when it would sit under any of the four scope roots
 * (`assertRoutinesOutsideScopes`), so the model's file tools — which end in
 * `resolveScopePath` — can never read or write a routine. Every write is
 * temp + rename (`atomicWriteJson`), previous copy kept as `.bak`.
 *
 * The model has no path here: routines are created by the employee in the
 * Routines dialog or by pressing Confirm on a proposal card in chat. Both go
 * through the `routines*` server functions → this module.
 */
import fs from "node:fs";
import path from "node:path";
import {
  RoutineError,
  assertRoutineId,
  cleanRoutineInstructions,
  cleanRoutineName,
  normalizeRoutine,
  parseSchedule,
  type Routine,
  type RoutineInput,
  type RoutineStatus,
} from "../routines-model.ts";
import type { FoldersConfig } from "../types.ts";
import { atomicWriteJson, dataDir, isUnderDir } from "./disk.ts";
import type { RosterEntry } from "./host-index.ts";

export const ROUTINES_DIR = "routines";

export function routinesDir(): string {
  return path.join(dataDir(), ROUTINES_DIR);
}

export function routinePath(id: string): string {
  return path.join(routinesDir(), `${assertRoutineId(id)}.json`);
}

/** The exclusive claim marker for a run in flight (`fs.openSync(…, "wx")`). */
export function routineLockPath(id: string): string {
  return path.join(routinesDir(), `${assertRoutineId(id)}.running`);
}

/** Routines are LocalBot metadata, never work product: refuse a routines dir inside any scope root. */
export function assertRoutinesOutsideScopes(folders: FoldersConfig | null): string {
  const dir = routinesDir();
  if (!folders) return dir;
  for (const root of [folders.employeeRoot, folders.employeeShared, folders.departmentShared, folders.companyShared]) {
    if (root && isUnderDir(root, dir)) {
      throw new RoutineError(
        "OUTSIDE_SCOPE",
        `Refusing to store routines under a scope folder (${root}). Move LOCALBOT_DATA_DIR out of the work folders. Nothing was written.`,
      );
    }
  }
  return dir;
}

export function newRoutineId(): string {
  return `rt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function readRoutine(id: string): Routine | null {
  try {
    return normalizeRoutine(JSON.parse(fs.readFileSync(routinePath(id), "utf8")));
  } catch {
    return null;
  }
}

export function listRoutines(): Routine[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(routinesDir()).filter((n) => n.endsWith(".json") && !n.startsWith("."));
  } catch {
    return [];
  }
  const out: Routine[] = [];
  for (const n of names) {
    const id = n.slice(0, -".json".length);
    if (!/^rt_/.test(id)) continue;
    const r = readRoutine(id);
    if (r) out.push(r);
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function writeRoutine(routine: Routine, folders: FoldersConfig | null): Routine {
  assertRoutinesOutsideScopes(folders);
  atomicWriteJson(routinePath(routine.id), routine);
  return routine;
}

/* ---------- validation against the roster ---------- */

/** The agent a routine targets must exist on disk and not be archived. */
export function requireRoutineAgent(roster: readonly RosterEntry[], agentId: unknown): RosterEntry {
  if (typeof agentId !== "string" || !agentId) throw new RoutineError("UNKNOWN_AGENT", "Pick an agent for this routine.");
  const agent = roster.find((r) => r.id === agentId);
  if (!agent) throw new RoutineError("UNKNOWN_AGENT", `No agent with id ${agentId} in agents/. Nothing was written.`);
  if (agent.archived) throw new RoutineError("ARCHIVED", `${agent.name} is archived. Unarchive it before scheduling work for it. Nothing was written.`);
  return agent;
}

export type RoutineContext = { folders: FoldersConfig | null; roster: readonly RosterEntry[] };

export function createRoutine(input: RoutineInput, ctx: RoutineContext, now: Date = new Date()): Routine {
  // Containment first: a routines dir inside a scope root is refused before anything else is looked at.
  assertRoutinesOutsideScopes(ctx.folders);
  const name = cleanRoutineName(input.name);
  const instructions = cleanRoutineInstructions(input.instructions);
  const schedule = parseSchedule(input.schedule);
  const agent = requireRoutineAgent(ctx.roster, input.agentId);
  const routine: Routine = {
    id: newRoutineId(),
    name,
    agentId: agent.id,
    instructions,
    schedule,
    enabled: input.enabled !== false,
    createdAt: now.toISOString(),
    lastRunAt: null,
    lastStatus: "never",
    lastError: null,
  };
  return writeRoutine(routine, ctx.folders);
}

export type RoutinePatch = Partial<Pick<Routine, "name" | "agentId" | "instructions" | "schedule" | "enabled">>;

export function requireRoutine(id: string): Routine {
  const cur = readRoutine(id);
  if (!cur) throw new RoutineError("NOT_FOUND", `No routine with id ${id}.`);
  return cur;
}

export function updateRoutine(id: string, patch: RoutinePatch, ctx: RoutineContext): Routine {
  assertRoutinesOutsideScopes(ctx.folders);
  const cur = requireRoutine(id);
  const next: Routine = {
    ...cur,
    name: patch.name !== undefined ? cleanRoutineName(patch.name) : cur.name,
    instructions: patch.instructions !== undefined ? cleanRoutineInstructions(patch.instructions) : cur.instructions,
    schedule: patch.schedule !== undefined ? parseSchedule(patch.schedule) : cur.schedule,
    enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : cur.enabled,
    agentId: patch.agentId !== undefined ? requireRoutineAgent(ctx.roster, patch.agentId).id : cur.agentId,
  };
  return writeRoutine(next, ctx.folders);
}

export function deleteRoutine(id: string): Routine | null {
  const cur = readRoutine(id);
  fs.rmSync(routinePath(id), { force: true });
  fs.rmSync(`${routinePath(id)}.bak`, { force: true });
  fs.rmSync(routineLockPath(id), { force: true });
  return cur;
}

/* ---------- claim / finish (called by src/lib/harness/routines.ts) ---------- */

/**
 * Exclusive claim: create `{id}.running` with O_EXCL. A second window, or a
 * second LocalBot on the same data dir, gets EEXIST and does not start the
 * turn. A marker older than `staleMs` is a crash leftover and is taken over.
 */
export function acquireRoutineLock(id: string, now: Date, staleMs: number): boolean {
  const lock = routineLockPath(id);
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const tryOpen = (): boolean => {
    try {
      const fd = fs.openSync(lock, "wx");
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, claimedAt: now.toISOString() }));
      fs.closeSync(fd);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      return false;
    }
  };
  if (tryOpen()) return true;
  try {
    const st = fs.statSync(lock);
    if (now.getTime() - st.mtimeMs > staleMs) {
      fs.rmSync(lock, { force: true });
      return tryOpen();
    }
  } catch {
    return tryOpen();
  }
  return false;
}

export function releaseRoutineLock(id: string): void {
  fs.rmSync(routineLockPath(id), { force: true });
}

export function markRoutineClaimed(id: string, now: Date, folders: FoldersConfig | null): Routine {
  const cur = requireRoutine(id);
  return writeRoutine({ ...cur, lastRunAt: now.toISOString(), lastStatus: "running", lastError: null }, folders);
}

export function markRoutineFinished(
  id: string,
  status: Extract<RoutineStatus, "ok" | "error" | "stopped">,
  error: string | null,
  folders: FoldersConfig | null,
): Routine {
  const cur = requireRoutine(id);
  const next = writeRoutine({ ...cur, lastStatus: status, lastError: status === "error" ? (error ?? "Unknown error") : null }, folders);
  releaseRoutineLock(id);
  return next;
}
