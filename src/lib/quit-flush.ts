/**
 * Stage 18 — the renderer half of the quit handshake, bound to the real app.
 *
 * Main (desktop/main.mjs) no longer kills the sidecar when a window closes or
 * Cmd+Q is pressed. It sends `localbot:flush` through the preload bridge
 * (`onFlushRequest`), waits up to QUIT_FLUSH_TIMEOUT_MS (2 s) for `flushDone`,
 * and only then runs `stopChildren()` + `app.quit()`. `flushForQuit` is what
 * runs in between; the sequence and the cap live in quit-flush-core.ts.
 *
 * `pagehide` in store.ts stays as the fallback for the bare browser only
 * (`npm run dev` in Chrome, where nothing can wait for us).
 */
import { desktopBridge, type LocalBotDesktopBridge } from "./desktop-bridge";
import { claimedRoutines, pendingWrites } from "./pending-writes";
import { cancelInFlightTurns, flushWith, installQuitFlushWith, RENDERER_FLUSH_CAP_MS, type FlushDeps, type FlushSummary } from "./quit-flush-core";
import { routinesFinish } from "./runtime/routines";
import { flushChatSaves, inFlightChatSaveCount, pendingChatSaveCount } from "./store";

export { RENDERER_FLUSH_CAP_MS, type FlushSummary };

/** The real collaborators: Stop's session/cancel, routinesFinish, the store's chat debounce, the write registry. */
export const appFlushDeps: FlushDeps = {
  cancelTurns: cancelInFlightTurns,
  stopRoutines: () => claimedRoutines().map((r) => routinesFinish({ data: { id: r.id, status: "stopped", error: null } })),
  flushChats: flushChatSaves,
  otherWrites: pendingWrites,
  pendingChats: pendingChatSaveCount,
  inFlightChats: inFlightChatSaveCount,
};

/** Cancel turns, stop claimed routines, flush chats, await tracked writes — bounded. Never throws. */
export function flushForQuit(reason = "quit", capMs = RENDERER_FLUSH_CAP_MS): Promise<FlushSummary> {
  return flushWith(appFlushDeps, reason, capMs);
}

/** Mounted once in the shell. Answers main's `localbot:flush` with `flushDone(summary)`. No-op outside Electron. */
export function installQuitFlush(bridge: LocalBotDesktopBridge | undefined = desktopBridge()): () => void {
  return installQuitFlushWith(bridge, flushForQuit);
}
