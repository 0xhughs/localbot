/**
 * Stage 18 — what the renderer still owes the disk.
 *
 * Three registries, no imports, so the store, the Harness adapter, the
 * routine runner and `quit-flush.ts` can all reach them without a cycle:
 *
 *   - writes:   every server-function call that ends in an `atomicWriteJson`
 *               on the sidecar (chatSave, channelsAppend, the host-index
 *               patches). `trackWrite(p)` returns `p` unchanged; the set
 *               forgets it when it settles.
 *   - turns:    every `runAgentTurn` that has a `turnId` on the sidecar, with
 *               its cancel (→ `harnessCancel` → ACP session/cancel).
 *   - routines: every routine this window has claimed (`routinesClaim`) and
 *               not yet finished, so a quit can `routinesFinish(id, "stopped")`
 *               instead of leaving `{id}.running` on disk.
 *
 * Nothing here talks to the sidecar. `flushForQuit` in quit-flush.ts reads
 * these and does the waiting.
 */

const writes = new Set<Promise<unknown>>();

/** Register a sidecar write so a quit can wait for it. Returns the same promise. */
export function trackWrite<T>(p: Promise<T>): Promise<T> {
  writes.add(p);
  const forget = () => {
    writes.delete(p);
  };
  p.then(forget, forget);
  return p;
}

/** Wrap an async server function so every call is tracked. The call sites keep their names. */
export function tracked<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args: A) => trackWrite(fn(...args));
}

export function pendingWrites(): Promise<unknown>[] {
  return [...writes];
}

export function pendingWriteCount(): number {
  return writes.size;
}

export type InFlightTurn = {
  turnId: string;
  botId: string;
  /** Idempotent: aborts the turn through the adapter (harnessCancel → ACP session/cancel). */
  cancel: () => void;
};

const turns = new Map<string, InFlightTurn>();

/** Called by `runAgentTurn` once the sidecar has a turnId; the returned function forgets it. */
export function registerTurn(turn: InFlightTurn): () => void {
  turns.set(turn.turnId, turn);
  return () => {
    turns.delete(turn.turnId);
  };
}

export function inFlightTurns(): InFlightTurn[] {
  return [...turns.values()];
}

export type ClaimedRoutine = { id: string; agentId: string };

const routines = new Map<string, ClaimedRoutine>();

/** Called by `runRoutine` after `routinesClaim` succeeds; the returned function forgets it after `routinesFinish`. */
export function registerRoutineClaim(claim: ClaimedRoutine): () => void {
  routines.set(claim.id, claim);
  return () => {
    routines.delete(claim.id);
  };
}

export function claimedRoutines(): ClaimedRoutine[] {
  return [...routines.values()];
}

/** Tests only: drop everything. */
export function resetPendingWritesForTests(): void {
  writes.clear();
  turns.clear();
  routines.clear();
}
