/**
 * Stage 15 — the renderer half of Routines. Runs a due routine through the
 * SAME `runAgentTurn` that `send()` in chat.tsx uses (one ACP prompt on the
 * sidecar-owned DeepSeek Harness). There is no second loop: this file never
 * imports the harness server functions or the manager class; it only
 * claims a routine (`routinesClaim`), hands the instructions to
 * `runAgentTurn` as the user text, writes the outcome into the agent's
 * durable chat, and reports `routinesFinish`.
 *
 * Ungranted permission requests during a routine are DENIED with a system
 * note — nothing is allowed unattended. Grants the employee already gave for
 * this chat (`Allow for this chat`) still apply because `runAgentTurn` checks
 * `hasChatGrant` before it asks.
 *
 * `useRoutineTicker` polls `routinesDue` every ROUTINE_TICK_MS and once on
 * open while the app window is up. Nothing runs while LocalBot is closed;
 * a missed beat runs once on the next open (see routines-model.ts).
 */
import { useEffect } from "react";
import { runAgentTurn } from "@/runtime/harnessAdapter";
import { routinesClaim, routinesDue, routinesFinish } from "@/lib/runtime/routines";
import type { DueRoutine, FinishStatus } from "@/lib/harness/routines";
import { ROUTINE_PERMISSION_DECISION, ROUTINE_TICK_MS, describeSchedule } from "@/lib/routines-model";
import { useLocalBot } from "@/lib/store";
import type { ToolChip } from "@/lib/types";

export type RunTurn = typeof runAgentTurn;

export type RunnerDeps = {
  turn: RunTurn;
  claim: (id: string, manual: boolean) => Promise<{ ok: true; due: DueRoutine } | { ok: false; error: string; code: string }>;
  finish: (id: string, status: FinishStatus, error: string | null) => Promise<unknown>;
};

const defaultDeps: RunnerDeps = {
  turn: runAgentTurn,
  claim: (id, manual) => routinesClaim({ data: { id, manual } }),
  finish: (id, status, error) => routinesFinish({ data: { id, status, error } }),
};

export type RunOutcome =
  | { started: true; status: FinishStatus; error: string | null }
  | { started: false; code: string; error: string };

/** True while this agent has a turn in flight in this window (typed message or routine). */
function rendererBusy(agentId: string): boolean {
  return Boolean(useLocalBot.getState().sessions[agentId]?.running);
}

/**
 * Run one routine now. `manual` is the dialog's Run now; the ticker passes
 * false. Claim first (sidecar gates: archived / DISCONNECTED / BUSY /
 * already running), then `runAgentTurn`, then `routinesFinish`.
 */
export async function runRoutine(
  id: string,
  opts: { manual: boolean; agentId?: string },
  deps: RunnerDeps = defaultDeps,
): Promise<RunOutcome> {
  // This window may be mid-send (the sidecar has no ACP turn yet): wait for the next check, claim nothing.
  if (opts.agentId && rendererBusy(opts.agentId)) {
    return { started: false, code: "BUSY", error: "This agent is busy in this window; the routine waits for the next check." };
  }
  const claimed = await deps.claim(id, opts.manual);
  if (!claimed.ok) return { started: false, code: claimed.code, error: claimed.error };
  const due = claimed.due;
  const bot = useLocalBot.getState().bots.find((b) => b.id === due.agentId);
  if (!bot) {
    await deps.finish(id, "error", "Agent is not in this window's roster.");
    return { started: true, status: "error", error: "Agent is not in this window's roster." };
  }
  if (rendererBusy(bot.id)) {
    // Lost the race with a typed message between claim and start: release the claim, nothing ran.
    await deps.finish(id, "stopped", null);
    return { started: false, code: "BUSY", error: `${bot.name} is busy in this window.` };
  }

  const s = useLocalBot.getState();
  s.appendMessage(bot.id, {
    role: "system",
    content: `Routine "${due.name}" ran (${describeSchedule(due.routine.schedule)}${opts.manual ? ", Run now" : ""}): ${due.instructions}`,
  });
  s.setSessionRunning(bot.id, true);
  const ac = new AbortController();
  const live: ToolChip[] = [];
  let result: Awaited<ReturnType<RunTurn>>;
  try {
    result = await deps.turn({
      botId: bot.id,
      userText: due.instructions,
      abort: ac.signal,
      events: {
        onModel: (info) => {
          if (info.restarted) {
            useLocalBot.getState().appendMessage(bot.id, {
              role: "system",
              content: `Switched llama-server to ${info.name}${info.path ? ` (${info.path.split(/[\\/]/).pop()})` : ""}.`,
            });
          }
          if (info.notice) useLocalBot.getState().appendMessage(bot.id, { role: "system", content: info.notice });
        },
        onChip: (chip) => {
          live.push(chip);
        },
        onChipUpdate: (chipId, patch) => {
          const i = live.findIndex((c) => c.id === chipId);
          if (i >= 0) live[i] = { ...live[i]!, ...patch };
        },
        // No unattended Allow: anything the chat has not already granted is refused and noted.
        askPermission: async (req) => {
          useLocalBot.getState().appendMessage(bot.id, {
            role: "system",
            content: `Routine "${due.name}": denied ${req.summary} — routines never grant permissions. Grant it in this chat first (Allow for this chat), then run again.`,
          });
          return ROUTINE_PERMISSION_DECISION;
        },
      },
    });
  } catch (err) {
    result = { stopped: false, error: err instanceof Error ? err.message : String(err) };
  }
  const after = useLocalBot.getState();
  after.setSessionRunning(bot.id, false);
  after.clearStop(bot.id);
  const sess = after.sessions[bot.id];
  const last = [...(sess?.messages ?? [])].reverse().find((m) => m.role === "assistant");
  if (last && live.length > 0) after.patchMessage(bot.id, last.id, { chips: [...live] });

  const status: FinishStatus = result.stopped ? "stopped" : result.error ? "error" : "ok";
  if (status === "stopped") after.appendMessage(bot.id, { role: "system", content: `Routine "${due.name}" stopped.` });
  else if (status === "error") after.appendMessage(bot.id, { role: "assistant", content: result.error ?? "DeepSeek Harness reported an error." });
  after.bumpUnread(bot.id);
  await deps.finish(id, status, result.error ?? null);
  return { started: true, status, error: result.error ?? null };
}

let ticking = false;

/** One check: ask the sidecar what is due and run those routines one after another. */
export async function tickRoutines(deps: RunnerDeps = defaultDeps): Promise<{ ran: string[]; skipped: number } | null> {
  const s = useLocalBot.getState();
  if (!s.diskLoaded || !s.onboarded || !s.folders) return null;
  if (ticking) return null;
  ticking = true;
  try {
    const r = await routinesDue({ data: {} });
    useLocalBot.getState().setUi({ routinesLastTickAt: new Date().toISOString() });
    if (!r.ok) return null;
    const ran: string[] = [];
    for (const d of r.due) {
      const out = await runRoutine(d.id, { manual: false, agentId: d.agentId }, deps);
      if (out.started) ran.push(d.id);
    }
    return { ran, skipped: r.skipped.length };
  } finally {
    ticking = false;
  }
}

/** Mounted once in the shell: a check on open, then every ROUTINE_TICK_MS while the window is up. */
export function useRoutineTicker(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      void tickRoutines();
    };
    tick();
    const id = window.setInterval(tick, ROUTINE_TICK_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [enabled]);
}
