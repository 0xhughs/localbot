/**
 * Stage 18 — the renderer half of the quit handshake, without the store.
 *
 * Everything here takes its collaborators as arguments so `quit-flush.test.ts`
 * can run it under plain Node (`--experimental-strip-types`, explicit `.ts`
 * imports only). `quit-flush.ts` binds the real ones: the store's chat
 * debounce, `routinesFinish`, the pending-writes registries and the preload
 * bridge.
 *
 * The sequence, once main sends `localbot:flush`:
 *
 *   1. cancel every Harness turn in flight (chat, channel, routine — they all
 *      register from `runAgentTurn`) with the same `harnessCancel`
 *      (ACP session/cancel) the Stop button uses
 *   2. finish every routine this window has claimed as "stopped"
 *      (`routinesFinish`) so `{id}.running` does not outlive the app
 *   3. `flushChatSaves()` — fire every debounced chat save and wait for those
 *      plus every save already on the wire
 *   4. wait for every other tracked sidecar write (channelsAppend, host-index
 *      patches, sections)
 *
 * All of it under `Promise.allSettled` and a RENDERER_FLUSH_CAP_MS cap that sits
 * inside main's 2 s so the ack always beats main's own timeout. `flushDone`
 * is sent in `finally`: a failure inside the flush never leaves main waiting.
 */
import type { LocalBotDesktopBridge } from "./desktop-bridge.ts";
import { inFlightTurns } from "./pending-writes.ts";

/** Main waits 2000 ms (QUIT_FLUSH_TIMEOUT_MS); the renderer stops earlier so the ack beats the timeout. */
export const RENDERER_FLUSH_CAP_MS = 1800;

export type FlushSummary = {
  reason: string;
  /** Harness turns cancelled through session/cancel. */
  turnsCancelled: number;
  /** Routine claims finished as "stopped". */
  routinesStopped: number;
  /** Chat saves that were still debounced when the flush started. */
  chatsPending: number;
  /** Chat saves already on the wire when the flush started. */
  chatsInFlight: number;
  /** Other tracked sidecar writes (channels, host index) waited for. */
  writesAwaited: number;
  /** True when the cap hit before every wait settled. */
  capped: boolean;
  ms: number;
};

export type FlushDeps = {
  cancelTurns: () => number;
  stopRoutines: () => Promise<unknown>[];
  flushChats: () => Promise<void>;
  otherWrites: () => Promise<unknown>[];
  pendingChats?: () => number;
  inFlightChats?: () => number;
  now?: () => number;
};

/** Cancel every registered turn (idempotent per turn); returns how many. */
export function cancelInFlightTurns(): number {
  const turns = inFlightTurns();
  for (const t of turns) {
    try {
      t.cancel();
    } catch {
      /* the sidecar may already be gone; nothing else to do */
    }
  }
  return turns.length;
}

/** Resolve when `p` settles or after `ms`, whichever first; reports which. */
export async function withCap<T>(p: Promise<T>, ms: number): Promise<{ capped: boolean; value?: T }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<{ capped: true }>((r) => {
    timer = setTimeout(() => r({ capped: true }), ms);
  });
  try {
    return await Promise.race([p.then((value) => ({ capped: false as const, value })), cap]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Cancel in-flight turns, finish claimed routines, flush chats and wait for
 * every tracked write — bounded by `capMs`. Never throws.
 */
export async function flushWith(deps: FlushDeps, reason = "quit", capMs = RENDERER_FLUSH_CAP_MS): Promise<FlushSummary> {
  const now = deps.now ?? (() => Date.now());
  const started = now();
  const chatsPending = deps.pendingChats?.() ?? 0;
  const chatsInFlight = deps.inFlightChats?.() ?? 0;

  let turnsCancelled = 0;
  try {
    turnsCancelled = deps.cancelTurns();
  } catch {
    /* counted as zero; the flush goes on */
  }

  let routineWaits: Promise<unknown>[] = [];
  try {
    routineWaits = deps.stopRoutines();
  } catch {
    routineWaits = [];
  }

  let chatWait: Promise<void>;
  try {
    chatWait = deps.flushChats();
  } catch (err) {
    chatWait = Promise.reject(err);
  }
  // Read the other writes AFTER the routine finishes and chat saves were
  // issued, so those are covered even when they are also tracked.
  let otherWaits: Promise<unknown>[] = [];
  try {
    otherWaits = deps.otherWrites();
  } catch {
    otherWaits = [];
  }

  const all = Promise.allSettled([chatWait, ...routineWaits, ...otherWaits]);
  const { capped } = await withCap(all, capMs);

  return {
    reason,
    turnsCancelled,
    routinesStopped: routineWaits.length,
    chatsPending,
    chatsInFlight,
    writesAwaited: otherWaits.length,
    capped,
    ms: now() - started,
  };
}

export type FlushRunner = (reason: string, capMs: number) => Promise<FlushSummary>;

/** The renderer cap for a request: 200 ms inside main's timeout, never above RENDERER_FLUSH_CAP_MS. */
export function capForRequest(timeoutMs: unknown): number {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return RENDERER_FLUSH_CAP_MS;
  return Math.min(RENDERER_FLUSH_CAP_MS, Math.max(0, timeoutMs - 200));
}

/**
 * Wire the bridge: on `localbot:flush` run `run` and answer with
 * `flushDone(summary)` — always, even if the flush threw. Returns the
 * unsubscribe. Outside Electron (no bridge) it is a no-op.
 */
export function installQuitFlushWith(bridge: LocalBotDesktopBridge | undefined, run: FlushRunner): () => void {
  if (!bridge || typeof bridge.onFlushRequest !== "function" || typeof bridge.flushDone !== "function") return () => {};
  const done = bridge.flushDone;
  let running: Promise<void> | null = null;
  return bridge.onFlushRequest((req) => {
    // Two requests (Cmd+Q while the X is already flushing) share one flush and one ack.
    if (running) return;
    const reason = typeof req?.reason === "string" && req.reason ? req.reason : "quit";
    const capMs = capForRequest(req?.timeoutMs);
    running = (async () => {
      let summary: FlushSummary | { reason: string; error: string } | undefined;
      try {
        summary = await run(reason, capMs);
      } catch (err) {
        summary = { reason, error: err instanceof Error ? err.message : String(err) };
      } finally {
        try {
          done(summary ?? { reason, error: "flush produced no summary" });
        } catch {
          /* the bridge is gone with the window */
        }
        running = null;
      }
    })();
  });
}

/** What a flush covers, in order (read by tests / proofs). */
export const FLUSH_COVERS = [
  "session/cancel for in-flight turns",
  "routinesFinish stopped for claimed routines",
  "chats/{id}.json (debounced + in-flight)",
  "channels/*.messages.json + host index (tracked writes)",
] as const;
