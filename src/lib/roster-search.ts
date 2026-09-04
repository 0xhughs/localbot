/**
 * Stage 11: the sidebar's "find" field. Pure so it can be tested without React.
 *
 * Matches on name and job, case-insensitive, every whitespace-separated word
 * of the query must appear somewhere in `name + job`. An empty (or
 * whitespace-only) query returns the input list unchanged — the roster shows
 * everyone, and the Archived group behaves exactly as before.
 */
export type RosterSearchable = { name: string; job?: string | null };

export function normalizeRosterQuery(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function rosterMatches(bot: RosterSearchable, query: string): boolean {
  const words = normalizeRosterQuery(query);
  if (words.length === 0) return true;
  const hay = `${bot.name} ${bot.job ?? ""}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function filterRoster<T extends RosterSearchable>(bots: T[], query: string): T[] {
  if (normalizeRosterQuery(query).length === 0) return bots;
  return bots.filter((b) => rosterMatches(b, query));
}
