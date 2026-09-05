/**
 * Stage 15 — the host-side gates for routines. The renderer's ticker asks
 * `routinesDue` every 30 s and on open; the sidecar decides, the renderer
 * only executes through `runAgentTurn` (the same path `send()` in chat.tsx
 * takes). There is no second Harness loop here: this module never spawns
 * dsh, never opens an ACP session and never prompts. It reads records, checks
 * the roster, the employee root and `HarnessManager.hasActiveTurn`, and
 * hands out exclusive claims.
 *
 * A routine does NOT start when:
 *   - it is disabled, or its schedule is manual (Run now only)
 *   - the agent is not in agents/ any more, or is archived
 *   - the employee root is DISCONNECTED (share unmounted, folder gone)
 *   - a turn is already running for that agent (BUSY)
 *   - another window / process holds the `{id}.running` claim
 *
 * Missed beats wait until the app is open and then run once (see
 * routines-model.ts); nothing in here installs launchd / Task Scheduler.
 */
import { assertScopeConnected, ScopeError } from "../fs/scopes.ts";
import { loadRoster, type RosterEntry } from "../fs/host-index.ts";
import { loadConfig } from "../fs/disk.ts";
import {
  CLAIM_STALE_MS,
  RoutineError,
  claimIsStale,
  scheduleDue,
  type Routine,
  type RoutineErrorCode,
  type RoutineStatus,
} from "../routines-model.ts";
import {
  acquireRoutineLock,
  assertRoutinesOutsideScopes,
  listRoutines,
  markRoutineClaimed,
  markRoutineFinished,
  readRoutine,
  releaseRoutineLock,
  requireRoutine,
} from "../fs/routines.ts";
import type { FoldersConfig } from "../types.ts";

export type RoutineGateDeps = {
  folders: FoldersConfig | null;
  roster: readonly RosterEntry[];
  /** `HarnessManager.hasActiveTurn(agentName)`. */
  hasActiveTurn: (agentName: string) => boolean;
};

/** What the renderer needs to run one routine through `runAgentTurn`. */
export type DueRoutine = {
  id: string;
  name: string;
  agentId: string;
  agentName: string;
  instructions: string;
  routine: Routine;
};

export type SkippedRoutine = { id: string; name: string; code: RoutineErrorCode; reason: string };

export type DueReport = {
  checkedAt: string;
  due: DueRoutine[];
  skipped: SkippedRoutine[];
  /** Every routine on disk (the dialog list), gates applied for display. */
  all: Routine[];
};

export function defaultGateDeps(hasActiveTurn: (agentName: string) => boolean): RoutineGateDeps {
  const cfg = loadConfig();
  let roster: RosterEntry[] = [];
  if (cfg.folders) {
    try {
      roster = loadRoster(cfg.folders);
    } catch {
      roster = [];
    }
  }
  return { folders: cfg.folders, roster, hasActiveTurn };
}

/**
 * The gates in order. Throws RoutineError with the code the UI shows;
 * returns the roster row when every gate passes. Pure apart from the
 * `statSync` inside `assertScopeConnected` (DISCONNECTED).
 */
export function gateRoutine(routine: Routine, deps: RoutineGateDeps, opts: { manual: boolean }, now: Date): RosterEntry {
  if (!deps.folders) throw new RoutineError("NOT_CONFIGURED", "Folders are not set up yet. Open Settings → Folders.");
  assertRoutinesOutsideScopes(deps.folders);
  if (!opts.manual && !routine.enabled) throw new RoutineError("DISABLED", `${routine.name} is disabled.`);
  const agent = deps.roster.find((r) => r.id === routine.agentId);
  if (!agent) throw new RoutineError("UNKNOWN_AGENT", `The agent for ${routine.name} is not in agents/ any more.`);
  if (agent.archived) throw new RoutineError("ARCHIVED", `${agent.name} is archived; ${routine.name} did not start.`);
  try {
    assertScopeConnected(deps.folders, "private");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new RoutineError(err instanceof ScopeError && err.code === "DISCONNECTED" ? "DISCONNECTED" : "NOT_CONFIGURED", msg);
  }
  if (routine.lastStatus === "running" && !claimIsStale(routine, now)) {
    throw new RoutineError("ALREADY_RUNNING", `${routine.name} is already running.`);
  }
  if (deps.hasActiveTurn(agent.name)) {
    throw new RoutineError("BUSY", `${agent.name} is still working on a message; ${routine.name} waits for the next check.`);
  }
  return agent;
}

function skipOf(routine: Routine, err: unknown): SkippedRoutine {
  const code: RoutineErrorCode = err instanceof RoutineError ? err.code : "NOT_CONFIGURED";
  return { id: routine.id, name: routine.name, code, reason: err instanceof Error ? err.message : String(err) };
}

/**
 * Everything due right now, with the gates applied. Manual routines are never
 * in `due`. Nothing is claimed here — the renderer claims one at a time just
 * before it starts the turn, so two windows cannot both fire.
 */
export function routinesDue(now: Date, deps: RoutineGateDeps): DueReport {
  const all = listRoutines();
  const due: DueRoutine[] = [];
  const skipped: SkippedRoutine[] = [];
  for (const routine of all) {
    if (!scheduleDue(routine, now)) continue;
    try {
      const agent = gateRoutine(routine, deps, { manual: false }, now);
      due.push({ id: routine.id, name: routine.name, agentId: agent.id, agentName: agent.name, instructions: routine.instructions, routine });
    } catch (err) {
      skipped.push(skipOf(routine, err));
    }
  }
  return { checkedAt: now.toISOString(), due, skipped, all };
}

/**
 * Claim one routine for a run: gates again (the world may have moved since
 * `routinesDue`), then the exclusive `{id}.running` marker, then
 * `lastStatus: "running"` + `lastRunAt: now` on disk. `manual` (Run now)
 * skips only the enabled / schedule check — archived, DISCONNECTED and BUSY
 * still refuse.
 */
export function routinesClaim(id: string, opts: { manual: boolean }, now: Date, deps: RoutineGateDeps): DueRoutine {
  const routine = requireRoutine(id);
  const agent = gateRoutine(routine, deps, opts, now);
  if (!opts.manual && !scheduleDue(routine, now)) {
    throw new RoutineError("DISABLED", `${routine.name} is not due.`);
  }
  if (!acquireRoutineLock(id, now, CLAIM_STALE_MS)) {
    throw new RoutineError("ALREADY_RUNNING", `${routine.name} is already running in another window.`);
  }
  let claimed: Routine;
  try {
    claimed = markRoutineClaimed(id, now, deps.folders);
  } catch (err) {
    releaseRoutineLock(id);
    throw err;
  }
  return { id, name: claimed.name, agentId: agent.id, agentName: agent.name, instructions: claimed.instructions, routine: claimed };
}

export type FinishStatus = Extract<RoutineStatus, "ok" | "error" | "stopped">;

export function isFinishStatus(v: unknown): v is FinishStatus {
  return v === "ok" || v === "error" || v === "stopped";
}

/** The renderer reports how `runAgentTurn` ended; the record and the lock are updated atomically. */
export function routinesFinish(id: string, status: FinishStatus, error: string | null, folders: FoldersConfig | null): Routine {
  if (!readRoutine(id)) {
    releaseRoutineLock(id);
    throw new RoutineError("NOT_FOUND", `No routine with id ${id}.`);
  }
  return markRoutineFinished(id, status, error, folders);
}
