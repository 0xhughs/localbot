/**
 * Turn registry: the sidecar-side bridge between ACP (push: session/update,
 * session/request_permission) and the renderer (request/response server
 * functions that poll). Nothing here calls the model or runs tools — the
 * Harness owns the loop; this only buffers what it says.
 */
import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  StopReason,
} from "@agentclientprotocol/sdk";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type TurnEvent =
  | { seq: number; type: "text"; text: string; messageId?: string | null }
  | { seq: number; type: "thought"; text: string }
  | {
      seq: number;
      type: "tool";
      toolCallId: string;
      title: string;
      kind: string;
      status: string;
      path?: string;
      rawInput?: JsonValue;
    }
  | {
      seq: number;
      type: "tool_update";
      toolCallId: string;
      status?: string;
      title?: string;
      resultText?: string;
    }
  | {
      seq: number;
      type: "permission";
      requestId: string;
      toolCallId: string;
      title: string;
      kind: string;
      path?: string;
      rawInput?: JsonValue;
      options: { optionId: string; name: string; kind: string }[];
    }
  | { seq: number; type: "permission_resolved"; requestId: string; optionId: string | null }
  | { seq: number; type: "usage"; used: number; size: number };

export type TurnStatus = "running" | "done" | "error";

export type TurnRecord = {
  turnId: string;
  sessionId: string;
  agentName: string;
  status: TurnStatus;
  stopReason: StopReason | null;
  error: string | null;
  events: TurnEvent[];
  startedAt: number;
  endedAt: number | null;
};

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

type PendingPermission = {
  turnId: string;
  resolve: (r: RequestPermissionResponse) => void;
};

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export class TurnRegistry {
  private turns = new Map<string, TurnRecord>();
  private activeBySession = new Map<string, string>();
  private pending = new Map<string, PendingPermission>();

  start(sessionId: string, agentName: string): TurnRecord {
    const turnId = nextId("turn");
    const rec: TurnRecord = {
      turnId,
      sessionId,
      agentName,
      status: "running",
      stopReason: null,
      error: null,
      events: [],
      startedAt: Date.now(),
      endedAt: null,
    };
    this.turns.set(turnId, rec);
    this.activeBySession.set(sessionId, turnId);
    return rec;
  }

  get(turnId: string): TurnRecord | undefined {
    return this.turns.get(turnId);
  }

  activeForSession(sessionId: string): TurnRecord | undefined {
    const id = this.activeBySession.get(sessionId);
    return id ? this.turns.get(id) : undefined;
  }

  private push(rec: TurnRecord, ev: DistributiveOmit<TurnEvent, "seq">): void {
    rec.events.push({ ...ev, seq: rec.events.length + 1 } as TurnEvent);
  }

  /** Map one ACP session/update onto the active turn of that session. */
  onSessionUpdate(n: SessionNotification): void {
    const rec = this.activeForSession(n.sessionId);
    if (!rec) return;
    const u = n.update;
    switch (u.sessionUpdate) {
      case "agent_message_chunk":
        if (u.content.type === "text") this.push(rec, { type: "text", text: u.content.text, messageId: u.messageId });
        break;
      case "agent_thought_chunk":
        if (u.content.type === "text") this.push(rec, { type: "thought", text: u.content.text });
        break;
      case "tool_call":
        this.push(rec, {
          type: "tool",
          toolCallId: u.toolCallId,
          title: u.title,
          kind: u.kind ?? "other",
          status: u.status ?? "pending",
          path: u.locations?.[0]?.path ?? pathFromInput(u.rawInput),
          rawInput: asJson(u.rawInput),
        });
        break;
      case "tool_call_update": {
        const text = (u.content ?? [])
          .map((c: { type: string; content?: { type: string; text?: string } }) => (c.type === "content" && c.content && c.content.type === "text" ? c.content.text : ""))
          .filter(Boolean)
          .join("\n");
        this.push(rec, {
          type: "tool_update",
          toolCallId: u.toolCallId,
          status: u.status ?? undefined,
          title: u.title ?? undefined,
          resultText: text || undefined,
        });
        break;
      }
      case "usage_update":
        this.push(rec, { type: "usage", used: u.used, size: u.size });
        break;
      default:
        break;
    }
  }

  /** Park an ACP permission request until the renderer answers (or the turn is cancelled). */
  onRequestPermission(p: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const rec = this.activeForSession(p.sessionId);
    if (!rec) return Promise.resolve({ outcome: { outcome: "cancelled" } });
    const requestId = nextId("perm");
    this.push(rec, {
      type: "permission",
      requestId,
      toolCallId: p.toolCall.toolCallId,
      title: p.toolCall.title ?? "Tool",
      kind: p.toolCall.kind ?? "other",
      path: p.toolCall.locations?.[0]?.path ?? pathFromInput(p.toolCall.rawInput),
      rawInput: asJson(p.toolCall.rawInput),
      options: p.options.map((o: { optionId: string; name: string; kind: string }) => ({ optionId: o.optionId, name: o.name, kind: o.kind })),
    });
    return new Promise((resolve) => {
      this.pending.set(requestId, { turnId: rec.turnId, resolve });
    });
  }

  decide(turnId: string, requestId: string, optionId: string | null): boolean {
    const p = this.pending.get(requestId);
    if (!p || p.turnId !== turnId) return false;
    this.pending.delete(requestId);
    const rec = this.turns.get(turnId);
    if (rec) this.push(rec, { type: "permission_resolved", requestId, optionId });
    p.resolve(optionId ? { outcome: { outcome: "selected", optionId } } : { outcome: { outcome: "cancelled" } });
    return true;
  }

  /** Cancel answers every parked permission request of the turn as cancelled. */
  cancelPending(turnId: string): void {
    for (const [requestId, p] of [...this.pending]) {
      if (p.turnId === turnId) this.decide(turnId, requestId, null);
    }
  }

  finish(turnId: string, stopReason: StopReason): void {
    const rec = this.turns.get(turnId);
    if (!rec) return;
    rec.status = "done";
    rec.stopReason = stopReason;
    rec.endedAt = Date.now();
    this.cancelPending(turnId);
    if (this.activeBySession.get(rec.sessionId) === turnId) this.activeBySession.delete(rec.sessionId);
  }

  fail(turnId: string, error: string): void {
    const rec = this.turns.get(turnId);
    if (!rec) return;
    rec.status = "error";
    rec.error = error;
    rec.endedAt = Date.now();
    this.cancelPending(turnId);
    if (this.activeBySession.get(rec.sessionId) === turnId) this.activeBySession.delete(rec.sessionId);
  }

  /** Events after `after` (a seq), for polling. */
  poll(turnId: string, after: number): { events: TurnEvent[]; status: TurnStatus; stopReason: StopReason | null; error: string | null } | null {
    const rec = this.turns.get(turnId);
    if (!rec) return null;
    return {
      events: rec.events.filter((e) => e.seq > after),
      status: rec.status,
      stopReason: rec.stopReason,
      error: rec.error,
    };
  }

  /** Drop finished turns older than `maxAgeMs`. */
  prune(maxAgeMs = 30 * 60 * 1000): void {
    const now = Date.now();
    for (const [id, rec] of this.turns) {
      if (rec.status !== "running" && rec.endedAt && now - rec.endedAt > maxAgeMs) this.turns.delete(id);
    }
  }
}

function asJson(v: unknown): JsonValue | undefined {
  if (v === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(v)) as JsonValue;
  } catch {
    return undefined;
  }
}

function pathFromInput(raw: unknown): string | undefined {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    for (const k of ["file_path", "path", "pattern", "command"]) {
      if (typeof r[k] === "string") return r[k] as string;
    }
  }
  return undefined;
}
