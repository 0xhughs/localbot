/**
 * Stage 15 — Routines screen. Not React state: every row is a
 * `{dataDir}/routines/{id}.json` read back through `routinesList`, every
 * change goes through `routinesCreate` / `routinesUpdate` / `routinesDelete`
 * and is re-read afterwards. Run now goes through `runRoutine`, which is the
 * same `runAgentTurn` path a typed message takes (claim on the sidecar first).
 *
 * Routines only run while LocalBot is open. A beat missed while the app was
 * closed runs once on the next open; there is no backlog replay and no
 * launchd / Task Scheduler entry.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Pencil, Play, Plus, RefreshCw, Trash2, X } from "lucide-react";
import {
  describeSchedule,
  parseScheduleText,
  routineNextRun,
  scheduleTextOf,
  sortRoutines,
  statusLabel,
  type Routine,
  type RoutineSchedule,
} from "@/lib/routines-model";
import { routinesCreate, routinesDelete, routinesList, routinesUpdate, type RoutinesListResult } from "@/lib/runtime/routines";
import { runRoutine } from "@/runtime/routineRunner";
import { useLocalBot } from "@/lib/store";
import { Button } from "@/components/ui/button";

type Notice = { tone: "ok" | "error"; text: string };

type ScheduleKind = RoutineSchedule["kind"];

type Draft = {
  id: string | null;
  name: string;
  agentId: string;
  instructions: string;
  kind: ScheduleKind;
  every: string;
  dailyAt: string;
  cron: string;
  enabled: boolean;
};

function emptyDraft(agentId: string): Draft {
  return { id: null, name: "", agentId, instructions: "", kind: "daily", every: "30", dailyAt: "09:00", cron: "0 9 * * 1-5", enabled: true };
}

function draftOf(r: Routine): Draft {
  const d = emptyDraft(r.agentId);
  d.id = r.id;
  d.name = r.name;
  d.instructions = r.instructions;
  d.enabled = r.enabled;
  d.kind = r.schedule.kind;
  if (r.schedule.kind === "every") d.every = String(r.schedule.minutes);
  if (r.schedule.kind === "daily") d.dailyAt = `${String(r.schedule.hour).padStart(2, "0")}:${String(r.schedule.minute).padStart(2, "0")}`;
  if (r.schedule.kind === "cron") d.cron = r.schedule.expr;
  return d;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function RoutinesDialog() {
  const open = useLocalBot((s) => s.ui.showRoutines);
  const setUi = useLocalBot((s) => s.setUi);
  const bots = useLocalBot((s) => s.bots);
  const sessions = useLocalBot((s) => s.sessions);
  const lastTick = useLocalBot((s) => s.ui.routinesLastTickAt);
  const [list, setList] = useState<RoutinesListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setList(await routinesList());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const activeAgents = useMemo(() => bots.filter((b) => !b.archived).sort((a, b) => a.name.localeCompare(b.name)), [bots]);
  const agentName = useCallback(
    (id: string) => {
      const fromList = list?.ok ? list.agents.find((a) => a.id === id) : undefined;
      return fromList ? { name: fromList.name, archived: fromList.archived } : (() => {
        const b = bots.find((x) => x.id === id);
        return b ? { name: b.name, archived: b.archived } : { name: "(missing agent)", archived: false };
      })();
    },
    [bots, list],
  );

  if (!open) return null;

  const routines = list?.ok ? sortRoutines(list.routines) : [];

  const save = async () => {
    if (!draft) return;
    setNotice(null);
    setBusyId(draft.id ?? "new");
    const schedule = scheduleTextOf(draft);
    try {
      parseScheduleText(schedule);
    } catch (err) {
      setBusyId(null);
      setNotice({ tone: "error", text: err instanceof Error ? err.message : String(err) });
      return;
    }
    const r = draft.id
      ? await routinesUpdate({ data: { id: draft.id, patch: { name: draft.name, agentId: draft.agentId, instructions: draft.instructions, schedule, enabled: draft.enabled } } })
      : await routinesCreate({ data: { name: draft.name, agentId: draft.agentId, instructions: draft.instructions, schedule, enabled: draft.enabled } });
    setBusyId(null);
    if (!r.ok) {
      setNotice({ tone: "error", text: `${r.error} (${r.code})` });
      return;
    }
    setNotice({ tone: "ok", text: `${draft.id ? "Saved" : "Created"} "${r.routine.name}" → routines/${r.routine.id}.json` });
    setDraft(null);
    await refresh();
  };

  const toggle = async (r: Routine) => {
    setBusyId(r.id);
    setNotice(null);
    const res = await routinesUpdate({ data: { id: r.id, patch: { enabled: !r.enabled } } });
    setBusyId(null);
    if (!res.ok) setNotice({ tone: "error", text: `${res.error} (${res.code})` });
    await refresh();
  };

  const remove = async (r: Routine) => {
    if (!window.confirm(`Delete routine "${r.name}"? This removes routines/${r.id}.json.`)) return;
    setBusyId(r.id);
    setNotice(null);
    const res = await routinesDelete({ data: { id: r.id } });
    setBusyId(null);
    if (!res.ok) setNotice({ tone: "error", text: `${res.error} (${res.code})` });
    else setNotice({ tone: "ok", text: `Deleted "${r.name}".` });
    if (draft?.id === r.id) setDraft(null);
    await refresh();
  };

  // Run now: the same path the ticker takes — sidecar claim (gates), then runAgentTurn, then finish.
  const runNow = async (r: Routine) => {
    setBusyId(r.id);
    setNotice(null);
    const out = await runRoutine(r.id, { manual: true, agentId: r.agentId });
    setBusyId(null);
    if (!out.started) setNotice({ tone: "error", text: `${out.error} (${out.code})` });
    else setNotice({ tone: out.status === "ok" ? "ok" : "error", text: `"${r.name}" finished: ${out.status}${out.error ? ` — ${out.error}` : ""}. Output is in ${agentName(r.agentId).name}'s chat.` });
    await refresh();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-bg/70 p-3 pt-[8vh] backdrop-blur-[2px] md:p-6" data-testid="routines-dialog">
      <div className="flex max-h-[84dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]">
        <div className="flex h-12 items-center justify-between gap-3 border-b border-border px-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted" />
            <h2 className="text-sm font-medium">Routines</h2>
            {routines.length > 0 && <span className="rounded-full bg-raised px-1.5 text-[10px] text-muted">{routines.length}</span>}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              data-testid="routines-new"
              disabled={activeAgents.length === 0}
              onClick={() => setDraft(emptyDraft(activeAgents[0]?.id ?? ""))}
            >
              <Plus className="size-3.5" /> New routine
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Refresh routines" title="Re-read routines/ from disk" disabled={loading} onClick={() => void refresh()}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Close routines" onClick={() => setUi({ showRoutines: false })}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
          <p className="mb-4 text-xs leading-relaxed text-muted" data-testid="routines-note">
            Routines run only while LocalBot is open, on the agent's local model, through the same DeepSeek Harness turn as a typed message.
            A beat missed while the app was closed runs <span className="text-fg">once</span> on the next open — no backlog replay, no login item.
            Ungranted permission requests during a routine are denied. The model can propose a routine in chat; nothing is saved until you press Confirm.
          </p>
          {list && !list.ok && (
            <p className="mb-4 rounded-md bg-danger/10 p-3 text-xs text-danger" data-testid="routines-error">
              {list.error} ({list.code})
            </p>
          )}
          {notice && (
            <p className={`mb-4 rounded-md p-3 text-xs ${notice.tone === "ok" ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"}`} data-testid="routines-notice">
              {notice.text}
            </p>
          )}

          {draft && (
            <form
              className="mb-5 flex flex-col gap-3 rounded-lg bg-raised p-4 shadow-[0_0_0_1px_var(--color-border)]"
              data-testid="routine-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Name
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    maxLength={60}
                    data-testid="routine-name"
                    placeholder="Morning summary"
                    className="h-8 rounded-md bg-bg px-2 text-sm text-fg outline-none ring-1 ring-border focus:ring-accent"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Agent
                  <select
                    value={draft.agentId}
                    onChange={(e) => setDraft({ ...draft, agentId: e.target.value })}
                    data-testid="routine-agent"
                    className="h-8 rounded-md bg-bg px-2 text-sm text-fg outline-none ring-1 ring-border focus:ring-accent"
                  >
                    {activeAgents.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} — {b.job}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Instructions (sent as the message)
                <textarea
                  value={draft.instructions}
                  onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
                  rows={3}
                  data-testid="routine-instructions"
                  placeholder="Read private/inbox/, summarize anything new into private/output/summary.md"
                  className="rounded-md bg-bg px-2 py-1.5 text-sm leading-5 text-fg outline-none ring-1 ring-border focus:ring-accent scrollbar-thin"
                />
              </label>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Schedule
                  <select
                    value={draft.kind}
                    onChange={(e) => setDraft({ ...draft, kind: e.target.value as ScheduleKind })}
                    data-testid="routine-kind"
                    className="h-8 rounded-md bg-bg px-2 text-sm text-fg outline-none ring-1 ring-border focus:ring-accent"
                  >
                    <option value="manual">Manual (Run now only)</option>
                    <option value="every">Every N minutes</option>
                    <option value="daily">Daily at HH:MM (local)</option>
                    <option value="cron">Cron (5 fields)</option>
                  </select>
                </label>
                {draft.kind === "every" && (
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Minutes
                    <input
                      type="number"
                      min={1}
                      max={10080}
                      value={draft.every}
                      onChange={(e) => setDraft({ ...draft, every: e.target.value })}
                      data-testid="routine-every"
                      className="h-8 w-24 rounded-md bg-bg px-2 text-sm text-fg outline-none ring-1 ring-border focus:ring-accent"
                    />
                  </label>
                )}
                {draft.kind === "daily" && (
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Time
                    <input
                      type="time"
                      value={draft.dailyAt}
                      onChange={(e) => setDraft({ ...draft, dailyAt: e.target.value })}
                      data-testid="routine-daily"
                      className="h-8 rounded-md bg-bg px-2 text-sm text-fg outline-none ring-1 ring-border focus:ring-accent"
                    />
                  </label>
                )}
                {draft.kind === "cron" && (
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Expression (min hour dom mon dow)
                    <input
                      value={draft.cron}
                      onChange={(e) => setDraft({ ...draft, cron: e.target.value })}
                      data-testid="routine-cron"
                      className="h-8 w-56 rounded-md bg-bg px-2 font-mono text-sm text-fg outline-none ring-1 ring-border focus:ring-accent"
                    />
                  </label>
                )}
                <label className="flex items-center gap-2 pb-1.5 text-xs text-muted">
                  <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} data-testid="routine-enabled" />
                  Enabled
                </label>
                <span className="pb-1.5 font-mono text-[11px] text-subtle">{safeDescribe(scheduleTextOf(draft))}</span>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" data-testid="routine-save" disabled={busyId !== null || !draft.name.trim() || !draft.instructions.trim() || !draft.agentId}>
                  {draft.id ? "Save" : "Create"}
                </Button>
              </div>
            </form>
          )}

          {list?.ok && routines.length === 0 && !draft && (
            <p className="py-6 text-center text-sm text-muted" data-testid="routines-empty">
              No routines yet. Press <span className="text-fg">New routine</span>, or ask an agent to propose one in chat and press Confirm.
            </p>
          )}

          <ul className="flex flex-col gap-2" data-testid="routines-list">
            {routines.map((r) => {
              const agent = agentName(r.agentId);
              const running = r.lastStatus === "running" || Boolean(sessions[r.agentId]?.running);
              const next = routineNextRun(r);
              return (
                <li key={r.id} data-testid="routine-row" data-routine-id={r.id} data-enabled={r.enabled ? "true" : "false"} className="rounded-lg bg-raised p-3 shadow-[0_0_0_1px_var(--color-border)]">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-medium ${r.enabled ? "text-fg" : "text-muted line-through"}`}>{r.name}</span>
                        <span className="rounded-full bg-chip px-2 py-0.5 font-mono text-[10px] text-muted">{describeSchedule(r.schedule)}</span>
                        <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${agent.archived ? "bg-danger/15 text-danger" : "bg-chip text-muted"}`}>
                          {agent.name}
                          {agent.archived ? " · archived" : ""}
                        </span>
                        <span
                          data-testid="routine-status"
                          className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
                            r.lastStatus === "error" ? "bg-danger/15 text-danger" : r.lastStatus === "ok" ? "bg-accent/15 text-accent" : "bg-chip text-muted"
                          }`}
                        >
                          {statusLabel(r)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted" title={r.instructions}>
                        {r.instructions}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-subtle">
                        Last run {fmtTime(r.lastRunAt)}
                        {r.lastError ? ` · ${r.lastError}` : ""}
                        {r.enabled && next ? ` · next ${fmtTime(next.toISOString())} (if the app is open)` : ""}
                        {!r.enabled ? " · disabled" : ""}
                        {r.schedule.kind === "manual" ? " · Run now only" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="secondary" size="sm" data-testid="routine-run-now" disabled={busyId !== null || running || agent.archived} title="Run this routine now through the agent's Harness turn" onClick={() => void runNow(r)}>
                        <Play className="size-3.5" /> Run now
                      </Button>
                      <label className="flex items-center gap-1.5 px-1 text-[11px] text-muted" title={r.enabled ? "Disable" : "Enable"}>
                        <input type="checkbox" data-testid="routine-toggle" checked={r.enabled} disabled={busyId !== null} onChange={() => void toggle(r)} />
                        On
                      </label>
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.name}`} data-testid="routine-edit" disabled={busyId !== null} onClick={() => setDraft(draftOf(r))}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${r.name}`} data-testid="routine-delete" disabled={busyId !== null} onClick={() => void remove(r)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-t border-border px-4 py-2 font-mono text-[10px] text-subtle" data-testid="routines-footer">
          {list?.ok ? `${list.dir}` : "routines/ (outside every scope folder)"}
          {" · "}
          {lastTick ? `last check ${fmtTime(lastTick)} · every 30 s while open` : "checks every 30 s while this window is open"}
        </div>
      </div>
    </div>
  );
}

function safeDescribe(text: string): string {
  try {
    return describeSchedule(parseScheduleText(text));
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
