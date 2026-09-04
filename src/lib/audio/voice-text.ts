/** Stage 9 — pure helpers shared by the voice hook and its tests (no React, no path aliases). */

/** Clips shorter than this are a click, not speech. */
export const MIN_CLIP_SECONDS = 0.4;

/** How a transcript joins what is already typed: a space, never a newline, never a send. */
export function appendTranscript(composer: string, text: string): string {
  const t = text.trim();
  if (!t) return composer;
  if (!composer.trim()) return t;
  return composer.replace(/\s+$/, "") + " " + t;
}
