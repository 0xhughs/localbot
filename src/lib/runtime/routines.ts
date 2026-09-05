/**
 * Stage 15 — server functions for Routines. The renderer talks only to these.
 * Records live in `{dataDir}/routines/{id}.json` (src/lib/fs/routines.ts);
 * the gates and the exclusive claim live in src/lib/harness/routines.ts. No
 * turn is started here: after `routinesClaim` the renderer runs the routine
 * through `runAgentTurn` exactly like a typed message, then `routinesFinish`.
 */
import { createServerFn } from "@tanstack/react-start";
import type { Routine, RoutineErrorCode, RoutineSchedule } from "../routines-model.ts";
import type { DueReport, DueRoutine, FinishStatus } from "../harness/routines.ts";

export type RoutinesFail = { ok: false; error: string; code: RoutineErrorCode | string };
export type RoutinesListResult = { ok: true; routines: Routine[]; dir: string; agents: { id: string; name: string; archived: boolean }[] } | RoutinesFail;
export type RoutinesOneResult = { ok: true; routine: Routine } | RoutinesFail;
export type RoutinesDueResult = ({ ok: true } & DueReport) | RoutinesFail;
export type RoutinesClaimResult = { ok: true; due: DueRoutine } | RoutinesFail;

export type RoutineCreateInput = { name: string; agentId: string; instructions: string; schedule: RoutineSchedule | string; enabled?: boolean };
export type RoutineUpdateInput = { id: string; patch: Partial<RoutineCreateInput> };

function fail(err: unknown): RoutinesFail {
  const code = err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string" ? (err as { code: string }).code : "ERROR";
  return { ok: false, error: err instanceof Error ? err.message : String(err), code };
}

async function ctx() {
  const { loadConfig } = await import("../fs/disk.ts");
  const { loadRoster } = await import("../fs/host-index.ts");
  const cfg = loadConfig();
  let roster: Awaited<ReturnType<typeof loadRoster>> = [];
  if (cfg.folders) {
    try {
      roster = loadRoster(cfg.folders);
    } catch {
      roster = [];
    }
  }
  return { folders: cfg.folders, roster };
}

export const routinesList = createServerFn({ method: "POST" }).handler(async (): Promise<RoutinesListResult> => {
  const { listRoutines, routinesDir, assertRoutinesOutsideScopes } = await import("../fs/routines.ts");
  try {
    const c = await ctx();
    assertRoutinesOutsideScopes(c.folders);
    return {
      ok: true,
      routines: listRoutines(),
      dir: routinesDir(),
      agents: c.roster.map((r) => ({ id: r.id, name: r.name, archived: r.archived })),
    };
  } catch (err) {
    return fail(err);
  }
});

/** Employee-confirmed only: the dialog's Save or the chat card's Confirm. The model never reaches this. */
export const routinesCreate = createServerFn({ method: "POST" })
  .validator((input: RoutineCreateInput) => input)
  .handler(async ({ data }): Promise<RoutinesOneResult> => {
    const { createRoutine } = await import("../fs/routines.ts");
    const { parseSchedule } = await import("../routines-model.ts");
    try {
      const c = await ctx();
      const routine = createRoutine(
        { name: data.name, agentId: data.agentId, instructions: data.instructions, schedule: parseSchedule(data.schedule), enabled: data.enabled },
        c,
      );
      return { ok: true, routine };
    } catch (err) {
      return fail(err);
    }
  });

export const routinesUpdate = createServerFn({ method: "POST" })
  .validator((input: RoutineUpdateInput) => input)
  .handler(async ({ data }): Promise<RoutinesOneResult> => {
    const { updateRoutine } = await import("../fs/routines.ts");
    const { parseSchedule } = await import("../routines-model.ts");
    try {
      const c = await ctx();
      const p = data.patch;
      const routine = updateRoutine(
        data.id,
        {
          name: p.name,
          agentId: p.agentId,
          instructions: p.instructions,
          schedule: p.schedule !== undefined ? parseSchedule(p.schedule) : undefined,
          enabled: p.enabled,
        },
        c,
      );
      return { ok: true, routine };
    } catch (err) {
      return fail(err);
    }
  });

export const routinesDelete = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; removed: boolean } | RoutinesFail> => {
    const { deleteRoutine, assertRoutinesOutsideScopes } = await import("../fs/routines.ts");
    try {
      const c = await ctx();
      assertRoutinesOutsideScopes(c.folders);
      return { ok: true, removed: deleteRoutine(data.id) !== null };
    } catch (err) {
      return fail(err);
    }
  });

/** What is due right now, gates applied (disabled / archived / DISCONNECTED / BUSY are listed under `skipped`). */
export const routinesDue = createServerFn({ method: "POST" })
  .validator((input: { now?: string } | undefined) => input ?? {})
  .handler(async ({ data }): Promise<RoutinesDueResult> => {
    const { routinesDue: due } = await import("../harness/routines.ts");
    const { getHarnessManager } = await import("../harness/index.ts");
    try {
      const c = await ctx();
      const mgr = getHarnessManager();
      const now = data.now ? new Date(data.now) : new Date();
      return { ok: true, ...due(now, { ...c, hasActiveTurn: (n) => mgr.hasActiveTurn(n) }) };
    } catch (err) {
      return fail(err);
    }
  });

/** Exclusive claim just before the renderer starts the turn. `manual` = Run now. */
export const routinesClaim = createServerFn({ method: "POST" })
  .validator((input: { id: string; manual?: boolean }) => input)
  .handler(async ({ data }): Promise<RoutinesClaimResult> => {
    const { routinesClaim: claim } = await import("../harness/routines.ts");
    const { getHarnessManager } = await import("../harness/index.ts");
    try {
      const c = await ctx();
      const mgr = getHarnessManager();
      return { ok: true, due: claim(data.id, { manual: data.manual === true }, new Date(), { ...c, hasActiveTurn: (n) => mgr.hasActiveTurn(n) }) };
    } catch (err) {
      return fail(err);
    }
  });

export const routinesFinish = createServerFn({ method: "POST" })
  .validator((input: { id: string; status: FinishStatus; error?: string | null }) => input)
  .handler(async ({ data }): Promise<RoutinesOneResult> => {
    const { routinesFinish: finish, isFinishStatus } = await import("../harness/routines.ts");
    try {
      if (!isFinishStatus(data.status)) throw new Error(`Bad finish status: ${String(data.status)}`);
      const c = await ctx();
      return { ok: true, routine: finish(data.id, data.status, data.error ?? null, c.folders) };
    } catch (err) {
      return fail(err);
    }
  });
