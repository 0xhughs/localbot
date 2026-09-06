/**
 * Stage 18 — the quit handshake, as a pure state machine so it can be unit
 * tested without Electron.
 *
 * Before this stage `before-quit` and `window-all-closed` called
 * `stopChildren()` at once: the sidecar (or the dev `vite` that hosts the
 * server functions) got SIGTERM while the renderer's last `chatSave` fetch was
 * still in flight — or before its 400 ms debounce had even fired. Cmd+Q killed
 * the sidecar before any window closed, so the pending chat was lost every
 * time; the title-bar X raced it.
 *
 * Now every quit path funnels through one coordinator:
 *
 *   requestQuit(reason)
 *     → requestFlush(reason)             ask every live renderer to flush
 *     → await race([ack, timeoutMs])     the renderer's flushDone, or 2 s
 *     → stopChildren()                   only now may the sidecar die
 *     → quit(outcome)                    app.quit() with quitReady set
 *
 * `stopChildren` is unreachable before ack-or-timeout: it is only called from
 * inside the one promise that `requestQuit` builds, after the race settles.
 * A second `requestQuit` (Cmd+Q while the X is already flushing, or
 * `window-all-closed` after the window we destroyed) joins the same promise.
 *
 * If there is no renderer to ask (`requestFlush` returns false — quit during
 * boot, or after an error dialog) nothing is waited for.
 */

export const QUIT_FLUSH_TIMEOUT_MS = 2000;

/** IPC names shared by main.mjs and preload.cjs (CJS cannot import this file; preload repeats the strings). */
export const FLUSH_REQUEST_CHANNEL = "localbot:flush";
export const FLUSH_DONE_CHANNEL = "localbot:flushDone";

/**
 * @typedef {{ acked: boolean; timedOut: boolean; asked: boolean; reason: string; waitedMs: number; summary: unknown }} QuitOutcome
 */

/**
 * @param {{
 *   requestFlush: (reason: string) => boolean | Promise<boolean>;
 *   stopChildren: () => void;
 *   quit: (outcome: QuitOutcome) => void;
 *   timeoutMs?: number;
 *   log?: (line: string) => void;
 *   now?: () => number;
 *   setTimer?: (fn: () => void, ms: number) => unknown;
 *   clearTimer?: (t: unknown) => void;
 * }} deps
 */
export function createQuitCoordinator(deps) {
  if (!deps || typeof deps.requestFlush !== "function") throw new TypeError("createQuitCoordinator: requestFlush is required");
  if (typeof deps.stopChildren !== "function") throw new TypeError("createQuitCoordinator: stopChildren is required");
  if (typeof deps.quit !== "function") throw new TypeError("createQuitCoordinator: quit is required");
  const timeoutMs = typeof deps.timeoutMs === "number" && Number.isFinite(deps.timeoutMs) && deps.timeoutMs >= 0 ? deps.timeoutMs : QUIT_FLUSH_TIMEOUT_MS;
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => Date.now());
  /** @type {(fn: () => void, ms: number) => unknown} */
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  /** @type {(t: unknown) => void} */
  const clearTimer = deps.clearTimer ?? ((t) => clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (t)));

  /** @type {"idle" | "flushing" | "stopping" | "done"} */
  let phase = "idle";
  /** @type {Promise<QuitOutcome> | null} */
  let inFlight = null;
  /** @type {((v: { acked: true; summary: unknown }) => void) | null} */
  let resolveAck = null;
  /** Late acks (after the timeout) are counted so a proof can see them. */
  let lateAcks = 0;

  /** The renderer's ack. True when it was the one the pending quit was waiting for. @param {unknown} summary */
  function flushDone(summary) {
    if (resolveAck) {
      const r = resolveAck;
      resolveAck = null;
      r({ acked: true, summary });
      return true;
    }
    if (phase !== "idle") lateAcks++;
    return false;
  }

  function requestQuit(reason = "quit") {
    if (inFlight) return inFlight;
    phase = "flushing";
    inFlight = (async () => {
      const started = now();
      /** @type {Promise<{ acked: true; summary: unknown }>} */
      const ack = new Promise((r) => {
        resolveAck = r;
      });
      let asked = false;
      try {
        asked = (await deps.requestFlush(reason)) !== false;
      } catch (err) {
        log(`[quit] requestFlush failed: ${err instanceof Error ? err.message : String(err)}`);
        asked = false;
      }
      let acked = false;
      let timedOut = false;
      let summary;
      if (asked) {
        let timer;
        const timeout = new Promise((r) => {
          timer = setTimer(() => r({ acked: false }), timeoutMs);
        });
        const won = await Promise.race([ack, timeout]);
        clearTimer(timer);
        resolveAck = null;
        acked = won.acked === true;
        timedOut = !acked;
        summary = won.summary;
      } else {
        resolveAck = null;
      }
      const waitedMs = now() - started;
      log(
        asked
          ? acked
            ? `[quit] ${reason}: renderer flushed in ${waitedMs} ms`
            : `[quit] ${reason}: no flush ack after ${timeoutMs} ms — quitting anyway`
          : `[quit] ${reason}: no renderer to flush`,
      );
      phase = "stopping";
      deps.stopChildren();
      phase = "done";
      /** @type {QuitOutcome} */
      const outcome = { acked, timedOut, asked, reason, waitedMs, summary };
      deps.quit(outcome);
      return outcome;
    })();
    return inFlight;
  }

  return {
    requestQuit,
    flushDone,
    get phase() {
      return phase;
    },
    /** True once requestQuit has been called (windows may close without asking again). */
    get quitting() {
      return inFlight !== null;
    },
    /** True after stopChildren + quit ran. */
    get settled() {
      return phase === "done";
    },
    get lateAcks() {
      return lateAcks;
    },
    get timeoutMs() {
      return timeoutMs;
    },
  };
}
