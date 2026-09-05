/**
 * The one Harness per sidecar: process + ACP sessions (one per LocalBot agent)
 * + turn registry.
 *
 * Stage 7: the agent → sessionId map is persisted in the host index
 * (`localbot-agents.json`, with the `agents/{Name}/private` cwd it was opened
 * for). The in-memory map is only a cache. When it is empty for an agent the
 * manager tries ACP `session/resume` with the persisted id; dsh restores its
 * own log (no history is replayed by LocalBot). If resume is refused (unknown
 * id, cwd moved, session active elsewhere) it falls back to `session/new` and
 * stores the new id.
 */
import fs from "node:fs";
import path from "node:path";
import { hostIndexSessionStore, type SessionStore } from "../fs/host-index.ts";
import { readAgent, readAgentStanding, requireFolders, resolveScopePath, ScopeError } from "../fs/scopes.ts";
import { ROUTINE_BLOCK_INSTRUCTION } from "../routines-model.ts";
import { HarnessProcess, type HarnessLaunchOptions } from "./process.ts";
import { TurnRegistry, type TurnEvent, type TurnRecord } from "./turns.ts";

export type LaunchSpec = Omit<HarnessLaunchOptions, "hooks">;

export type HarnessStatus = {
  running: boolean;
  pid: number | undefined;
  nodeBin: string | undefined;
  dshHome: string | undefined;
  llamaBaseUrl: string | undefined;
  sessions: { agentName: string; sessionId: string; origin: SessionOrigin }[];
  agentInfo: { name: string; version: string } | null;
  lastExit: { code: number | null; stderr: string } | null;
};

export type SessionOrigin = "memory" | "resumed" | "new";

export type EnsuredSession = {
  sessionId: string;
  cwd: string;
  /** True when no session/new happened on this call (memory hit or a real ACP resume). */
  resumed: boolean;
  origin: SessionOrigin;
  /** Why a persisted id could not be resumed (informational; a new session was opened). */
  resumeError: string | null;
};

function sameDir(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

function launchKey(spec: LaunchSpec): string {
  return JSON.stringify([spec.dataDir, spec.dshHome ?? "", spec.llamaBaseUrl, spec.model ?? "", spec.contextTokens ?? 0, spec.maxTokens ?? 0, spec.nodeBin ?? ""]);
}

/** The employee-managed instructions file is mirrored into private/ so the Harness instruction loader sees it. */
export function standingInstructionsText(agentName: string): string {
  const folders = requireFolders();
  const rec = readAgent(folders, agentName);
  const standing = readAgentStanding(folders, agentName) ?? "";
  const scopes = rec?.scopes ?? ["private"];
  const header = [
    `# ${rec?.name ?? agentName}`,
    "",
    rec?.job ? rec.job : "",
    "",
    `Granted folders: ${scopes.map((s) => `\`${s}/\``).join(", ")}. Everything else is off limits.`,
    "Paths are `scope/relative/path`; a bare path means `private/`. Keep durable notes in `private/memory/notes.md`.",
    "",
    ROUTINE_BLOCK_INSTRUCTION,
    "",
    "<!-- Managed by LocalBot from agents/{Name}/AGENTS.md. Edit that file, not this copy. -->",
    "",
  ].join("\n");
  return header + standing.trim() + "\n";
}

export class HarnessManager {
  private proc: HarnessProcess | null = null;
  private key: string | null = null;
  private starting: Promise<HarnessProcess> | null = null;
  private lastExit: HarnessStatus["lastExit"] = null;
  readonly turns = new TurnRegistry();
  /** agentName → ACP sessionId for this process. Cache of the persisted map. */
  readonly sessions = new Map<string, string>();
  /** How the last ensureSession for each agent got its id (status / tests). */
  readonly lastSessionOrigin = new Map<string, SessionOrigin>();
  readonly store: SessionStore;

  constructor(store: SessionStore = hostIndexSessionStore) {
    this.store = store;
  }

  async ensureProcess(spec: LaunchSpec): Promise<HarnessProcess> {
    const key = launchKey(spec);
    if (this.proc?.running && this.key === key) return this.proc;
    if (this.starting && this.key === key) return this.starting;
    if (this.proc) await this.stop();
    this.key = key;
    const proc = new HarnessProcess({
      ...spec,
      hooks: {
        onSessionUpdate: (n) => this.turns.onSessionUpdate(n),
        onRequestPermission: (p) => this.turns.onRequestPermission(p),
        onExit: (code, stderr) => {
          this.lastExit = { code, stderr };
          for (const [, sessionId] of this.sessions) {
            const active = this.turns.activeForSession(sessionId);
            if (active) this.turns.fail(active.turnId, `DeepSeek Harness exited (${code}).`);
          }
          this.sessions.clear();
          if (this.proc === proc) this.proc = null;
        },
      },
    });
    this.starting = proc.start().then(() => proc);
    try {
      await this.starting;
      this.proc = proc;
      return proc;
    } finally {
      this.starting = null;
    }
  }

  /** Private root of the agent; throws ScopeError (DISCONNECTED, NOT_CONFIGURED, …) exactly like every other op. */
  privateRootOf(agentName: string): string {
    const folders = requireFolders();
    return resolveScopePath(folders, { scope: "private", relPath: "", agentName }).abs;
  }

  mirrorInstructions(agentName: string, privateRoot: string): void {
    const file = path.join(privateRoot, "AGENTS.md");
    const next = standingInstructionsText(agentName);
    let cur: string | null = null;
    try {
      cur = fs.readFileSync(file, "utf8");
    } catch {
      cur = null;
    }
    if (cur !== next) fs.writeFileSync(file, next, "utf8");
  }

  /**
   * The ACP session for an agent. Order: the in-memory id for this process;
   * else `session/resume` with the id persisted in the host index when its cwd
   * is still this agent's `private/`; else `session/new`. Whatever id ends up
   * in use is written back to the index.
   */
  async ensureSession(spec: LaunchSpec, agentName: string): Promise<EnsuredSession> {
    const cwd = this.privateRootOf(agentName);
    this.mirrorInstructions(agentName, cwd);
    const proc = await this.ensureProcess(spec);
    const existing = this.sessions.get(agentName);
    if (existing) return { sessionId: existing, cwd, resumed: true, origin: "memory", resumeError: null };

    const persisted = this.store.load(agentName);
    let resumeError: string | null = null;
    if (persisted && sameDir(persisted.cwd, cwd)) {
      try {
        await proc.resumeSession(persisted.sessionId, cwd);
        this.sessions.set(agentName, persisted.sessionId);
        this.lastSessionOrigin.set(agentName, "resumed");
        return { sessionId: persisted.sessionId, cwd, resumed: true, origin: "resumed", resumeError: null };
      } catch (err) {
        resumeError = err instanceof Error ? err.message : String(err);
      }
    } else if (persisted) {
      resumeError = `persisted session cwd ${persisted.cwd} is not ${cwd}`;
    }
    const res = await proc.newSession(cwd);
    this.sessions.set(agentName, res.sessionId);
    this.store.save(agentName, res.sessionId, cwd);
    this.lastSessionOrigin.set(agentName, "new");
    return { sessionId: res.sessionId, cwd, resumed: false, origin: "new", resumeError };
  }

  /** Agents with a running turn right now (a model switch must not kill their generation). */
  activeAgents(): string[] {
    return [...this.sessions].filter(([, sessionId]) => Boolean(this.turns.activeForSession(sessionId))).map(([name]) => name);
  }

  /** True while this agent's ACP session has a running turn. */
  hasActiveTurn(agentName: string): boolean {
    const sessionId = this.sessions.get(agentName);
    return sessionId ? Boolean(this.turns.activeForSession(sessionId)) : false;
  }

  /**
   * Drop the in-memory session for an agent (rename / archive). The next
   * prompt runs session/new with the agent's current `agents/{Name}/private`
   * cwd; nothing is left pointed at the old folder. Refused with `BUSY`
   * while a turn is running.
   */
  forgetSession(agentName: string): boolean {
    if (this.hasActiveTurn(agentName)) {
      throw new ScopeError("BUSY", `${agentName} is still working on a message. Stop it first.`);
    }
    this.store.clear(agentName);
    this.lastSessionOrigin.delete(agentName);
    return this.sessions.delete(agentName);
  }

  /** Start a turn: ACP session/prompt runs in the background; poll for events. */
  async prompt(spec: LaunchSpec, agentName: string, text: string): Promise<TurnRecord> {
    const { sessionId } = await this.ensureSession(spec, agentName);
    const proc = await this.ensureProcess(spec);
    if (this.turns.activeForSession(sessionId)) {
      throw new Error(`${agentName} is still working on the previous message.`);
    }
    const rec = this.turns.start(sessionId, agentName);
    proc
      .prompt(sessionId, text)
      .then((r) => this.turns.finish(rec.turnId, r.stopReason))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        const tail = proc.stderr();
        this.turns.fail(rec.turnId, tail ? `${msg}\n${tail.split("\n").slice(-6).join("\n")}` : msg);
      });
    return rec;
  }

  poll(turnId: string, after: number): { events: TurnEvent[]; status: TurnRecord["status"]; stopReason: TurnRecord["stopReason"]; error: string | null } | null {
    this.turns.prune();
    return this.turns.poll(turnId, after);
  }

  decide(turnId: string, requestId: string, optionId: string | null): boolean {
    return this.turns.decide(turnId, requestId, optionId);
  }

  /** Stop → ACP session/cancel. Parked permission requests are answered "cancelled". */
  async cancel(turnId: string): Promise<boolean> {
    const rec = this.turns.get(turnId);
    if (!rec || rec.status !== "running") return false;
    this.turns.cancelPending(turnId);
    if (this.proc?.running) await this.proc.cancel(rec.sessionId);
    return true;
  }

  status(): HarnessStatus {
    return {
      running: Boolean(this.proc?.running),
      pid: this.proc?.pid,
      nodeBin: this.proc?.nodeBin,
      dshHome: this.proc ? (this.proc.opts.dshHome ?? path.join(this.proc.opts.dataDir, "dsh-home")) : undefined,
      llamaBaseUrl: this.proc?.opts.llamaBaseUrl,
      sessions: [...this.sessions].map(([agentName, sessionId]) => ({
        agentName,
        sessionId,
        origin: this.lastSessionOrigin.get(agentName) ?? "new",
      })),
      agentInfo: this.proc?.initializeResult?.agentInfo
        ? { name: this.proc.initializeResult.agentInfo.name, version: this.proc.initializeResult.agentInfo.version ?? "" }
        : null,
      lastExit: this.lastExit,
    };
  }

  async stop(): Promise<void> {
    const proc = this.proc;
    this.proc = null;
    this.key = null;
    this.sessions.clear();
    if (proc) await proc.stop();
  }
}

type GlobalWithHarness = typeof globalThis & { __localbotHarness?: HarnessManager };

/** One manager per sidecar process (survives Vite module re-evaluation). */
export function getHarnessManager(): HarnessManager {
  const g = globalThis as GlobalWithHarness;
  if (!g.__localbotHarness) g.__localbotHarness = new HarnessManager();
  return g.__localbotHarness;
}
