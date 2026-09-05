/**
 * Stage 15 — Routines: the browser-safe half. Types, schedule parsing and
 * the due-time math, plus the parser for the `localbot-routine` block a model
 * may put in a reply to *propose* a routine.
 *
 * No `node:` imports: `routines.tsx` and `chat.tsx` import this. Everything
 * that touches disk lives in `src/lib/fs/routines.ts` (records) and
 * `src/lib/harness/routines.ts` (due gates / claim / finish), reached from the
 * renderer only through the `routines*` server functions.
 *
 * Time model: a routine is due when `nextRunAt(schedule, lastRunAt ?? createdAt)`
 * is at or before now. After a run `lastRunAt` moves to the claim time, so a
 * beat missed while LocalBot was closed runs **once** when the app next opens
 * (no backlog replay): a daily 09:00 routine opened at 14:00 runs at 14:00 and
 * then waits for tomorrow 09:00.
 */

export type RoutineSchedule =
  | { kind: "manual" }
  | { kind: "every"; minutes: number }
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "cron"; expr: string };

export type RoutineStatus = "never" | "running" | "ok" | "error" | "stopped";

export const ROUTINE_STATUSES: readonly RoutineStatus[] = ["never", "running", "ok", "error", "stopped"];

export type Routine = {
  id: string;
  name: string;
  /** Host-index agent id (the `bot.id` chats are keyed on), not the folder name. */
  agentId: string;
  /** Sent as the user text of the Harness turn. */
  instructions: string;
  schedule: RoutineSchedule;
  enabled: boolean;
  createdAt: string;
  /** ISO time the last run was claimed (start time), or null before the first run. */
  lastRunAt: string | null;
  lastStatus: RoutineStatus;
  /** Error text of the last failed run (UI only); null otherwise. */
  lastError: string | null;
};

export type RoutineInput = {
  name: string;
  agentId: string;
  instructions: string;
  /** Object form or the shorthand text (`every 15 minutes`, `daily 09:00`, …); parsed by `parseSchedule`. */
  schedule: RoutineSchedule | string;
  enabled?: boolean;
};

export type RoutineErrorCode =
  | "BAD_NAME"
  | "BAD_INSTRUCTIONS"
  | "BAD_SCHEDULE"
  | "BAD_ID"
  | "UNKNOWN_AGENT"
  | "ARCHIVED"
  | "NOT_FOUND"
  | "OUTSIDE_SCOPE"
  | "ALREADY_RUNNING"
  | "DISABLED"
  | "BUSY"
  | "DISCONNECTED"
  | "NOT_CONFIGURED";

export class RoutineError extends Error {
  code: RoutineErrorCode;
  constructor(code: RoutineErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "RoutineError";
  }
}

export const ROUTINE_NAME_MAX = 60;
export const ROUTINE_INSTRUCTIONS_MAX = 4000;
export const EVERY_MIN_MINUTES = 1;
export const EVERY_MAX_MINUTES = 7 * 24 * 60;
/** A `running` claim older than this is a crash leftover, not a live run. */
export const CLAIM_STALE_MS = 2 * 60 * 60 * 1000;
/** How often the renderer asks the sidecar for due routines while the app is open. */
export const ROUTINE_TICK_MS = 30_000;
/** Ungranted permission requests during a routine are refused — nothing is allowed unattended. */
export const ROUTINE_PERMISSION_DECISION = "deny" as const;

export const ROUTINE_ID_RE = /^rt_[A-Za-z0-9_-]{4,40}$/;

export function assertRoutineId(id: unknown): string {
  if (typeof id !== "string" || !ROUTINE_ID_RE.test(id)) throw new RoutineError("BAD_ID", `Bad routine id: ${String(id)}`);
  return id;
}

/* ---------- name / instructions ---------- */

export function cleanRoutineName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new RoutineError("BAD_NAME", "Routine name cannot be empty.");
  if ([...name].some((c) => c.charCodeAt(0) < 0x20)) throw new RoutineError("BAD_NAME", "Routine name cannot contain control characters.");
  if (name.length > ROUTINE_NAME_MAX) throw new RoutineError("BAD_NAME", `Routine name is longer than ${ROUTINE_NAME_MAX} characters.`);
  return name;
}

export function cleanRoutineInstructions(raw: unknown): string {
  const text = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (!text) throw new RoutineError("BAD_INSTRUCTIONS", "Routine instructions cannot be empty.");
  if (text.length > ROUTINE_INSTRUCTIONS_MAX) {
    throw new RoutineError("BAD_INSTRUCTIONS", `Routine instructions are longer than ${ROUTINE_INSTRUCTIONS_MAX} characters.`);
  }
  return text;
}

/* ---------- schedules ---------- */

function int(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

/** Accepts the object form or the shorthand strings a model / employee may type. */
export function parseSchedule(raw: unknown): RoutineSchedule {
  if (typeof raw === "string") return parseScheduleText(raw);
  if (!raw || typeof raw !== "object") throw new RoutineError("BAD_SCHEDULE", "Schedule is missing.");
  const r = raw as Record<string, unknown>;
  switch (r.kind) {
    case "manual":
      return { kind: "manual" };
    case "every": {
      const minutes = int(r.minutes);
      if (minutes === null || minutes < EVERY_MIN_MINUTES || minutes > EVERY_MAX_MINUTES) {
        throw new RoutineError("BAD_SCHEDULE", `"every" needs minutes between ${EVERY_MIN_MINUTES} and ${EVERY_MAX_MINUTES}.`);
      }
      return { kind: "every", minutes };
    }
    case "daily": {
      const hour = int(r.hour);
      const minute = int(r.minute);
      if (hour === null || minute === null || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        throw new RoutineError("BAD_SCHEDULE", '"daily" needs hour 0–23 and minute 0–59 (local time).');
      }
      return { kind: "daily", hour, minute };
    }
    case "cron": {
      const expr = typeof r.expr === "string" ? r.expr.trim().replace(/\s+/g, " ") : "";
      parseCron(expr);
      return { kind: "cron", expr };
    }
    default:
      throw new RoutineError("BAD_SCHEDULE", `Unknown schedule kind: ${String(r.kind)}. Use manual, every, daily or cron.`);
  }
}

/** `manual` · `every 15 minutes` / `every 2 hours` · `daily 09:00` / `daily at 9:05` · `cron 0 9 * * 1-5`. */
export function parseScheduleText(raw: string): RoutineSchedule {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) throw new RoutineError("BAD_SCHEDULE", "Schedule is empty.");
  if (s === "manual" || s === "manually" || s === "on demand") return { kind: "manual" };
  let m = /^every (\d+) ?(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)$/.exec(s);
  if (m) {
    const n = Number(m[1]);
    const minutes = m[2]!.startsWith("h") ? n * 60 : n;
    return parseSchedule({ kind: "every", minutes });
  }
  m = /^(?:daily|every day)(?: at)? (\d{1,2}):(\d{2})$/.exec(s);
  if (m) return parseSchedule({ kind: "daily", hour: Number(m[1]), minute: Number(m[2]) });
  m = /^cron (.+)$/.exec(s);
  if (m) return parseSchedule({ kind: "cron", expr: m[1]! });
  if (s.split(" ").length === 5) return parseSchedule({ kind: "cron", expr: s });
  throw new RoutineError(
    "BAD_SCHEDULE",
    `Cannot read schedule "${raw}". Use manual, "every N minutes", "daily HH:MM" or "cron M H DOM MON DOW".`,
  );
}

/** The dialog's form fields → the schedule text `parseScheduleText` reads. */
export function scheduleTextOf(d: { kind: RoutineSchedule["kind"]; every: string; dailyAt: string; cron: string }): string {
  switch (d.kind) {
    case "manual":
      return "manual";
    case "every":
      return `every ${d.every.trim()} minutes`;
    case "daily":
      return `daily ${d.dailyAt.trim()}`;
    case "cron":
      return `cron ${d.cron.trim()}`;
  }
}

export function describeSchedule(s: RoutineSchedule): string {
  switch (s.kind) {
    case "manual":
      return "Manual (Run now only)";
    case "every":
      if (s.minutes % 60 === 0) return s.minutes === 60 ? "Every hour" : `Every ${s.minutes / 60} hours`;
      return s.minutes === 1 ? "Every minute" : `Every ${s.minutes} min`;
    case "daily":
      return `Daily at ${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`;
    case "cron":
      return `Cron ${s.expr}`;
  }
}

/* ---------- minimal 5-field cron ---------- */

export type CronSpec = {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  /** A bare star in the day-of-month / day-of-week field → the other field alone decides. */
  domAny: boolean;
  dowAny: boolean;
};

function cronField(field: string, min: number, max: number, label: string): { values: Set<number>; any: boolean } {
  const values = new Set<number>();
  let any = false;
  if (!field) throw new RoutineError("BAD_SCHEDULE", `cron: empty ${label} field.`);
  for (const part of field.split(",")) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new RoutineError("BAD_SCHEDULE", `cron: cannot read "${part}" in the ${label} field.`);
    const step = m[2] ? Number(m[2]) : 1;
    if (step < 1) throw new RoutineError("BAD_SCHEDULE", `cron: step must be ≥ 1 in "${part}".`);
    let lo: number;
    let hi: number;
    if (m[1] === "*") {
      lo = min;
      hi = max;
      if (step === 1) any = true;
    } else if (m[1]!.includes("-")) {
      const [a, b] = m[1]!.split("-").map(Number) as [number, number];
      lo = a;
      hi = b;
      if (lo > hi) throw new RoutineError("BAD_SCHEDULE", `cron: range "${part}" is backwards in the ${label} field.`);
    } else {
      lo = hi = Number(m[1]);
      if (m[2]) hi = max;
    }
    if (lo < min || hi > max) {
      throw new RoutineError("BAD_SCHEDULE", `cron: "${part}" is outside ${min}–${max} in the ${label} field.`);
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return { values, any };
}

export function parseCron(expr: string): CronSpec {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new RoutineError("BAD_SCHEDULE", `cron needs 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}.`);
  }
  const [mi, ho, dm, mo, dw] = fields as [string, string, string, string, string];
  const minute = cronField(mi, 0, 59, "minute");
  const hour = cronField(ho, 0, 23, "hour");
  const dom = cronField(dm, 1, 31, "day-of-month");
  const month = cronField(mo, 1, 12, "month");
  const dow = cronField(dw, 0, 7, "day-of-week");
  if (dow.values.has(7)) {
    dow.values.delete(7);
    dow.values.add(0);
  }
  return { minute: minute.values, hour: hour.values, dom: dom.values, month: month.values, dow: dow.values, domAny: dom.any, dowAny: dow.any };
}

function cronDayMatches(spec: CronSpec, d: Date): boolean {
  if (!spec.month.has(d.getMonth() + 1)) return false;
  const domOk = spec.dom.has(d.getDate());
  const dowOk = spec.dow.has(d.getDay());
  // Vixie semantics: both restricted → either matches; one is `*` → the other decides.
  if (spec.domAny && spec.dowAny) return true;
  if (spec.domAny) return dowOk;
  if (spec.dowAny) return domOk;
  return domOk || dowOk;
}

const CRON_SEARCH_LIMIT_DAYS = 366 * 5;

/** First minute strictly after `after` that matches. Local time. `null` if nothing matches within five years. */
export function nextCron(spec: CronSpec, after: Date): Date | null {
  const t = new Date(after.getTime());
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  const limit = after.getTime() + CRON_SEARCH_LIMIT_DAYS * 86_400_000;
  while (t.getTime() <= limit) {
    if (!cronDayMatches(spec, t)) {
      t.setDate(t.getDate() + 1);
      t.setHours(0, 0, 0, 0);
      continue;
    }
    if (!spec.hour.has(t.getHours())) {
      t.setHours(t.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!spec.minute.has(t.getMinutes())) {
      t.setMinutes(t.getMinutes() + 1, 0, 0);
      continue;
    }
    return t;
  }
  return null;
}

/* ---------- due math ---------- */

/** The next time this schedule fires strictly after `after`. `null` for manual. */
export function nextRunAt(schedule: RoutineSchedule, after: Date): Date | null {
  switch (schedule.kind) {
    case "manual":
      return null;
    case "every":
      return new Date(after.getTime() + schedule.minutes * 60_000);
    case "daily": {
      const t = new Date(after.getTime());
      t.setHours(schedule.hour, schedule.minute, 0, 0);
      if (t.getTime() <= after.getTime()) t.setDate(t.getDate() + 1);
      return t;
    }
    case "cron":
      return nextCron(parseCron(schedule.expr), after);
  }
}

/** The moment the schedule counts from: the last claim, else creation. */
export function routineAnchor(r: Pick<Routine, "lastRunAt" | "createdAt">): Date {
  const iso = r.lastRunAt ?? r.createdAt;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

export function routineNextRun(r: Pick<Routine, "schedule" | "lastRunAt" | "createdAt">): Date | null {
  return nextRunAt(r.schedule, routineAnchor(r));
}

/** A `running` claim that is older than CLAIM_STALE_MS is a crash leftover. */
export function claimIsStale(r: Pick<Routine, "lastStatus" | "lastRunAt">, now: Date): boolean {
  if (r.lastStatus !== "running") return false;
  if (!r.lastRunAt) return true;
  return now.getTime() - new Date(r.lastRunAt).getTime() > CLAIM_STALE_MS;
}

/**
 * Schedule-only check (no roster / harness knowledge — those gates are the
 * sidecar's). True when the routine is enabled, not manual, not currently
 * claimed, and its next beat is at or before `now`.
 */
export function scheduleDue(r: Pick<Routine, "enabled" | "schedule" | "lastRunAt" | "createdAt" | "lastStatus">, now: Date): boolean {
  if (!r.enabled) return false;
  if (r.lastStatus === "running" && !claimIsStale(r, now)) return false;
  const next = routineNextRun(r);
  return next !== null && next.getTime() <= now.getTime();
}

/* ---------- the model's proposal block ---------- */

export const ROUTINE_BLOCK_LANG = "localbot-routine";

/**
 * The one line LocalBot adds to every agent's mirrored instructions. A model
 * cannot create a routine: it can only propose one in this block, and the
 * employee confirms it in the chat card. `routines/` is outside every scope.
 */
export const ROUTINE_BLOCK_INSTRUCTION =
  "To propose a scheduled routine, reply with a fenced ```localbot-routine block containing JSON " +
  '{"name": "...", "instructions": "...", "schedule": "manual" | "every N minutes" | "daily HH:MM" | "cron M H DOM MON DOW"}; ' +
  "the employee confirms it in LocalBot — you cannot create, edit or run routines yourself.";

export type RoutineProposal = {
  name: string;
  instructions: string;
  schedule: RoutineSchedule;
};

export type ParsedProposal =
  | { ok: true; proposal: RoutineProposal; raw: string }
  | { ok: false; error: string; raw: string };

const BLOCK_RE = /```localbot-routine[^\n]*\n([\s\S]*?)```/g;

export function parseRoutineProposal(raw: string): ParsedProposal {
  let body: unknown;
  try {
    body = JSON.parse(raw.trim());
  } catch {
    return { ok: false, error: "The localbot-routine block is not valid JSON.", raw };
  }
  if (!body || typeof body !== "object") return { ok: false, error: "The localbot-routine block must be a JSON object.", raw };
  const r = body as Record<string, unknown>;
  try {
    return {
      ok: true,
      raw,
      proposal: {
        name: cleanRoutineName(r.name),
        instructions: cleanRoutineInstructions(r.instructions),
        schedule: parseSchedule(r.schedule ?? "manual"),
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), raw };
  }
}

/**
 * Pull every ```localbot-routine block out of a reply. `text` is the reply
 * with the blocks removed (the card takes their place); nothing here touches
 * disk — a proposal is inert until the employee presses Confirm.
 */
export function splitRoutineBlocks(content: string): { text: string; proposals: ParsedProposal[] } {
  const proposals: ParsedProposal[] = [];
  const text = content
    .replace(BLOCK_RE, (_all, inner: string) => {
      proposals.push(parseRoutineProposal(inner));
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, proposals };
}

/* ---------- record shape (shared by the disk reader and the UI) ---------- */

export function normalizeRoutine(raw: unknown): Routine | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !ROUTINE_ID_RE.test(r.id)) return null;
  let schedule: RoutineSchedule;
  try {
    schedule = parseSchedule(r.schedule);
  } catch {
    return null;
  }
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const instructions = typeof r.instructions === "string" ? r.instructions : "";
  if (!name || !instructions.trim() || typeof r.agentId !== "string" || !r.agentId) return null;
  const status = ROUTINE_STATUSES.includes(r.lastStatus as RoutineStatus) ? (r.lastStatus as RoutineStatus) : "never";
  return {
    id: r.id,
    name,
    agentId: r.agentId,
    instructions,
    schedule,
    enabled: r.enabled !== false,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
    lastRunAt: typeof r.lastRunAt === "string" && r.lastRunAt ? r.lastRunAt : null,
    lastStatus: status,
    lastError: typeof r.lastError === "string" && r.lastError ? r.lastError : null,
  };
}

export function statusLabel(r: Pick<Routine, "lastStatus" | "lastRunAt">): string {
  switch (r.lastStatus) {
    case "never":
      return "Never ran";
    case "running":
      return "Running";
    case "ok":
      return "OK";
    case "error":
      return "Error";
    case "stopped":
      return "Stopped";
  }
}

/** Routines sorted for the list: enabled first, then by name. */
export function sortRoutines(list: readonly Routine[]): Routine[] {
  return [...list].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
}
