import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  ArchiveRestore,
  Copy,
  EyeOff,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { archivedBots, useLocalBot, visibleBots } from "@/lib/store";
import { filterRoster, normalizeRosterQuery } from "@/lib/roster-search";
import type { Bot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "./avatar";
import { Wordmark } from "./logo";

export function Sidebar() {
  const allBots = useLocalBot((s) => s.bots);
  // Stage 11: the find field narrows both groups by name / job as you type.
  // An empty query is the roster exactly as before (everyone + Archived).
  const [query, setQuery] = useState("");
  const searching = normalizeRosterQuery(query).length > 0;
  const bots = filterRoster(visibleBots({ bots: allBots }), query);
  const archived = filterRoster(archivedBots({ bots: allBots }), query);
  const selected = useLocalBot((s) => s.ui.selectedBotId);
  const selectBot = useLocalBot((s) => s.selectBot);
  const pinBot = useLocalBot((s) => s.pinBot);
  const hideBot = useLocalBot((s) => s.hideBot);
  const renameBot = useLocalBot((s) => s.renameBot);
  const duplicateBot = useLocalBot((s) => s.duplicateBot);
  const archiveBot = useLocalBot((s) => s.archiveBot);
  const deleteBot = useLocalBot((s) => s.deleteBot);
  const setUi = useLocalBot((s) => s.setUi);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Stage 7: the roster is read from disk; this is why it could not be (e.g. the employee root is disconnected).
  const diskNotice = useLocalBot((s) => s.diskNotice);

  const report = (r: { ok: boolean; error?: string }) => {
    setNotice(r.ok ? null : (r.error ?? "Something went wrong."));
  };

  return (
    <aside
      data-testid="sidebar"
      className="flex h-full min-h-0 w-[248px] shrink-0 flex-col border-r border-border bg-surface"
    >
      {/* Stage 11: the mark sits below the desktop title strip, so it is never
          under the macOS traffic lights. Nothing else shares this row. */}
      <div data-testid="sidebar-header" className="flex h-12 items-center px-3">
        <Wordmark className="text-sm" />
      </div>
      <div className="flex flex-col gap-2 px-2 pb-2">
        <Button
          variant="secondary"
          className="w-full"
          data-testid="new-agent"
          onClick={() => setUi({ newAgentOpen: true })}
        >
          <Plus className="size-4" />
          New agent
        </Button>
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                setQuery("");
              }
            }}
            aria-label="Find agent"
            placeholder="Find by name or job"
            data-testid="roster-search"
            className="h-8 w-full rounded-md bg-bg pr-7 pl-8 text-sm text-fg placeholder:text-subtle outline-none ring-1 ring-border focus:ring-accent [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-0.5 text-subtle hover:bg-hover hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
      </div>
      <div data-testid="roster" className="min-h-0 flex-1 overflow-y-auto px-1.5 scrollbar-thin">
        {bots.map((bot) => {
          const active = selected === bot.id;
          return (
            <div
              key={bot.id}
              className={`group relative mb-0.5 flex items-center rounded-md ${
                active ? "bg-raised" : "hover:bg-hover"
              }`}
            >
              {renamingId === bot.id ? (
                <RenameField
                  bot={bot}
                  onDone={async (next) => {
                    setRenamingId(null);
                    if (next === null) return;
                    report(await renameBot(bot.id, next));
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => selectBot(bot.id)}
                  onDoubleClick={() => setRenamingId(bot.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left"
                >
                  <span className="relative">
                    <AgentAvatar bot={bot} size="sm" />
                    {bot.unread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-fg">{bot.name}</span>
                      {bot.pinned && <Pin className="size-3 text-subtle" />}
                    </span>
                    <span className="block truncate text-[11px] text-muted">{bot.job}</span>
                  </span>
                </button>
              )}
              <details className="relative mr-1">
                <summary
                  aria-label={`Actions for ${bot.name}`}
                  className="flex size-8 list-none items-center justify-center rounded-sm text-subtle opacity-0 hover:bg-hover hover:text-fg group-hover:opacity-100 [&::-webkit-details-marker]:hidden"
                >
                  <MoreHorizontal className="size-4" />
                </summary>
                <div className="absolute top-8 right-0 z-20 w-44 rounded-md bg-raised py-1 shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]">
                  <MenuItem onClick={() => pinBot(bot.id, !bot.pinned)}>
                    <Pin className="size-3.5" /> {bot.pinned ? "Unpin" : "Pin"}
                  </MenuItem>
                  <MenuItem onClick={() => setRenamingId(bot.id)}>
                    <Pencil className="size-3.5" /> Rename
                  </MenuItem>
                  <MenuItem onClick={() => void duplicateBot(bot.id).then(report)}>
                    <Copy className="size-3.5" /> Duplicate
                  </MenuItem>
                  <MenuItem onClick={() => void archiveBot(bot.id, true).then(report)}>
                    <Archive className="size-3.5" /> Archive
                  </MenuItem>
                  <MenuItem onClick={() => hideBot(bot.id, true)}>
                    <EyeOff className="size-3.5" /> Hide
                  </MenuItem>
                  <MenuItem onClick={() => void deleteBot(bot.id)}>
                    <Trash2 className="size-3.5" /> Delete
                  </MenuItem>
                </div>
              </details>
            </div>
          );
        })}
        {bots.length === 0 && (
          <p className="px-3 py-6 text-sm text-muted" data-testid="roster-empty">
            {searching ? `No agents match “${query.trim()}”.` : "No agents yet."}
          </p>
        )}
        {archived.length > 0 && (
          <details className="mt-3 border-t border-border pt-2" data-testid="archived-agents">
            <summary className="cursor-pointer list-none px-2 py-1 text-[11px] font-medium tracking-wide text-subtle uppercase select-none [&::-webkit-details-marker]:hidden">
              Archived ({archived.length})
            </summary>
            {archived.map((bot) => (
              <div
                key={bot.id}
                className="mb-0.5 flex items-center gap-2 rounded-md px-2 py-1.5 opacity-70 hover:bg-hover hover:opacity-100"
                title={bot.privatePath || undefined}
              >
                <AgentAvatar bot={bot} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{bot.name}</span>
                  <span className="block truncate text-[11px] text-muted">
                    Archived — files kept on disk
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Unarchive ${bot.name}`}
                  title="Unarchive"
                  onClick={() => void archiveBot(bot.id, false).then(report)}
                  className="rounded-sm p-1 text-subtle hover:bg-raised hover:text-fg"
                >
                  <ArchiveRestore className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${bot.name}`}
                  title="Delete (removes the folder)"
                  onClick={() => void deleteBot(bot.id)}
                  className="rounded-sm p-1 text-subtle hover:bg-raised hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </details>
        )}
      </div>
      {diskNotice && (
        <div className="border-t border-border px-3 py-2 text-[11px] text-danger">
          Roster could not be read from disk: {diskNotice}
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 border-t border-border px-3 py-2 text-[11px] text-danger">
          <span className="min-w-0 flex-1">{notice}</span>
          <button
            type="button"
            className="shrink-0 text-subtle hover:text-fg"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      {/* Stage 11: Settings lives at the bottom of the roster, away from the title corner. */}
      <div data-testid="sidebar-footer" className="border-t border-border p-2">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted hover:text-fg"
          aria-label="Settings"
          data-testid="sidebar-settings"
          onClick={() => setUi({ showSettings: true })}
        >
          <Settings className="size-4" />
          Settings
        </Button>
      </div>
    </aside>
  );
}

/** Inline rename: Enter commits, Escape cancels, blur commits if changed. */
function RenameField({ bot, onDone }: { bot: Bot; onDone: (next: string | null) => void }) {
  const [value, setValue] = useState(bot.name);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (commit: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const next = value.trim();
    onDone(commit && next && next !== bot.name ? next : null);
  };

  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        finish(true);
      }}
    >
      <AgentAvatar bot={bot} size="sm" />
      <input
        ref={ref}
        aria-label={`Rename ${bot.name}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
          }
        }}
        maxLength={64}
        className="h-7 min-w-0 flex-1 rounded-sm bg-bg px-1.5 text-sm text-fg outline-none ring-1 ring-border focus:ring-accent"
      />
    </form>
  );
}

function MenuItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.currentTarget.closest("details")?.removeAttribute("open");
        onClick();
      }}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-hover"
    >
      {children}
    </button>
  );
}
