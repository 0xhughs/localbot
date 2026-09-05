/**
 * Stage 12: roster sections. Pure so it is testable without React.
 *
 * `groupRoster` files the (already filtered / sorted) roster under the
 * sections the host index knows about, in `order`; agents whose `sectionId`
 * is null or points at a section that no longer exists land in the trailing
 * "unsorted" group. Empty sections are kept while not searching (so they can
 * be renamed / deleted) and dropped while a search is active — the search
 * crosses every group, an empty heading would only be noise.
 */
import type { AgentSection } from "./types.ts";

export type SectionedBot = { id: string; sectionId: string | null };

export type RosterGroup<T extends SectionedBot> = {
  /** null = the unsorted group (no heading when there are no sections at all). */
  section: AgentSection | null;
  bots: T[];
};

export function sortSections(sections: readonly AgentSection[]): AgentSection[] {
  return [...sections].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function groupRoster<T extends SectionedBot>(
  bots: readonly T[],
  sections: readonly AgentSection[],
  opts: { searching?: boolean } = {},
): RosterGroup<T>[] {
  const ordered = sortSections(sections);
  const known = new Set(ordered.map((s) => s.id));
  const groups: RosterGroup<T>[] = ordered.map((section) => ({ section, bots: [] }));
  const byId = new Map(groups.map((g) => [g.section!.id, g]));
  const unsorted: RosterGroup<T> = { section: null, bots: [] };
  for (const bot of bots) {
    const g = bot.sectionId && known.has(bot.sectionId) ? byId.get(bot.sectionId)! : unsorted;
    g.bots.push(bot);
  }
  const kept = opts.searching ? groups.filter((g) => g.bots.length > 0) : groups;
  // Unsorted agents are listed after the sections; the group is omitted when empty
  // (except when there are no sections at all, so the roster still renders "No agents").
  if (unsorted.bots.length > 0 || kept.length === 0) kept.push(unsorted);
  return kept;
}

/** Sections that still hold at least one agent, for "Move to …" menus etc. */
export function sectionNameById(sections: readonly AgentSection[], id: string | null): string | null {
  if (!id) return null;
  return sections.find((s) => s.id === id)?.name ?? null;
}
