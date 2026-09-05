/**
 * Stage 13 — click-to-toggle mic gesture, pure (no React, no DOM, no path
 * aliases) so the control's rules are tested as plain functions.
 *
 * The default gesture is GrokBot-style: one click starts listening, a second
 * click stops and transcribes. Press-and-hold still works as a fallback: a
 * press that lasts at least HOLD_MS is a hold, and releasing it stops. A
 * shorter press is a click and leaves the mic listening. Escape cancels —
 * the clip is thrown away, nothing is transcribed, nothing is sent.
 *
 * Nothing in here sends a message; the transcript only ever lands in the
 * composer through the hook's onText.
 */

export type VoiceState = "idle" | "listening" | "transcribing";

/** A press at least this long is a hold (release stops); shorter is a click (toggle). */
export const HOLD_MS = 500;

/** What one activation (a click, Space or Enter) does in each state. */
export type ToggleAction = "start" | "stop" | "none";

export function micToggleAction(state: VoiceState): ToggleAction {
  if (state === "idle") return "start";
  if (state === "listening") return "stop";
  return "none";
}

/** The button's accessible name follows the state: it is a start/stop control, not a hold. */
export function micAriaLabel(state: VoiceState): string {
  if (state === "listening") return "Stop listening";
  if (state === "transcribing") return "Transcribing";
  return "Start voice input";
}

export function micTitle(state: VoiceState, disabledReason: string | null): string {
  if (disabledReason) return disabledReason;
  if (state === "listening") return "Click to stop and transcribe (Escape cancels)";
  if (state === "transcribing") return "Transcribing on this computer…";
  return "Click to talk, click again to stop (or press and hold)";
}

/** One pointer press in flight. `startedListening` is true when this press was the one that started the mic. */
export type MicPress = { pressedAt: number; startedListening: boolean };

/** Pointer down: idle → start listening; listening → this press will stop on release. */
export function micPress(state: VoiceState, now: number): { press: MicPress | null; action: "start" | "none" } {
  if (state === "idle") return { press: { pressedAt: now, startedListening: true }, action: "start" };
  if (state === "listening") return { press: { pressedAt: now, startedListening: false }, action: "none" };
  return { press: null, action: "none" };
}

/**
 * Pointer up. A press that started the mic and lasted < holdMs is a click:
 * keep listening (the toggle is now on). A longer press was a hold: stop.
 * A press that began while already listening is the second click: stop.
 */
export function micRelease(press: MicPress | null, now: number, holdMs: number = HOLD_MS): "stop" | "none" {
  if (!press) return "none";
  if (!press.startedListening) return "stop";
  return now - press.pressedAt >= holdMs ? "stop" : "none";
}

/** Whole seconds listened so far, never negative. */
export function elapsedSeconds(startedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

/** `0:07`, `0:59`, `1:00` — the live timer next to "Listening". */
export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Append one block of samples to a capped clip. Pure so the cap is testable:
 * returns how many samples to keep and whether this block reached the cap.
 * `reachedCap` is true exactly once — on the block that fills the clip.
 */
export function takeForCap(input: { captured: number; incoming: number; cap: number }): { take: number; captured: number; reachedCap: boolean } {
  const room = Math.max(0, input.cap - input.captured);
  if (room === 0) return { take: 0, captured: input.captured, reachedCap: false };
  const take = Math.min(room, input.incoming);
  const captured = input.captured + take;
  return { take, captured, reachedCap: captured >= input.cap };
}
