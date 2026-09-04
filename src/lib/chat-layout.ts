/**
 * Stage 11: pure layout math for the chat pane — the composer's grow-then-scroll
 * cap and the transcript's "pinned to the bottom" test. No DOM here so both
 * run under node --test.
 */

/** The composer grows with its content up to this many lines, then scrolls inside the field. */
export const COMPOSER_MAX_LINES = 6;

export type ComposerMetrics = {
  /** textarea.scrollHeight after height was reset to `auto` (content height incl. padding). */
  scrollHeight: number;
  /** Computed line-height in px. */
  lineHeight: number;
  /** padding-top + padding-bottom in px. */
  verticalPadding: number;
  maxLines?: number;
};

export function composerHeight(m: ComposerMetrics): { height: number; overflow: boolean } {
  const lines = m.maxLines ?? COMPOSER_MAX_LINES;
  const lineHeight = Number.isFinite(m.lineHeight) && m.lineHeight > 0 ? m.lineHeight : 20;
  const cap = Math.round(lineHeight * lines + m.verticalPadding);
  const wanted = Math.max(Math.round(lineHeight + m.verticalPadding), Math.ceil(m.scrollHeight));
  if (wanted > cap) return { height: cap, overflow: true };
  return { height: wanted, overflow: false };
}

export type ScrollMetrics = { scrollTop: number; clientHeight: number; scrollHeight: number };

/** Slack (px) within which the transcript still counts as pinned to the bottom. */
export const PINNED_SLACK_PX = 32;

/** True when the transcript is at (or within `slack` of) the bottom. */
export function isPinnedToBottom(m: ScrollMetrics, slack: number = PINNED_SLACK_PX): boolean {
  if (m.scrollHeight <= m.clientHeight) return true; // nothing to scroll
  return m.scrollHeight - (m.scrollTop + m.clientHeight) <= slack;
}
