import type { ReactNode } from "react";
import {
  Copy,
  EyeOff,
  MoreHorizontal,
  Pin,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { useLocalBot } from "@/lib/store";
import { formatRelative } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "./avatar";
import { Wordmark } from "./logo";

export function Sidebar() {
  const allBots = useLocalBot((s) => s.bots);
  const bots = allBots.filter((b) => !b.hidden).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
  const selected = useLocalBot((s) => s.ui.selectedBotId);
  const sessions = useLocalBot((s) => s.sessions);
  const selectBot = useLocalBot((s) => s.selectBot);
  const pinBot = useLocalBot((s) => s.pinBot);
  const hideBot = useLocalBot((s) => s.hideBot);
  const duplicateBot = useLocalBot((s) => s.duplicateBot);
  const deleteBot = useLocalBot((s) => s.deleteBot);
  const setUi = useLocalBot((s) => s.setUi);
  const company = useLocalBot((s) => s.company);

  return (
    <aside className="flex h-full min-h-0 w-[248px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-12 items-center justify-between px-3">
        <Wordmark className="text-sm" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Settings"
          onClick={() => setUi({ showSettings: true })}
        >
          <Settings className="size-4" />
        </Button>
      </div>
      <div className="px-3 pb-2">
        <p className="truncate font-mono text-[10px] tracking-wider text-subtle uppercase">
          {company?.name ?? "LocalBot"}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 scrollbar-thin">
        {bots.map((bot) => {
          const active = selected === bot.id;
          const last = sessions[bot.id]?.messages.at(-1);
          return (
            <div
              key={bot.id}
              className={`group relative mb-0.5 flex items-center rounded-md ${
                active ? "bg-raised" : "hover:bg-hover"
              }`}
            >
              <button
                type="button"
                onClick={() => selectBot(bot.id)}
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
                    <span className="truncate text-sm font-medium text-fg">
                      {bot.name}
                    </span>
                    {bot.pinned && <Pin className="size-3 text-subtle" />}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {last?.content?.slice(0, 48) || bot.job}
                  </span>
                </span>
                {last && (
                  <span className="font-mono text-[10px] text-subtle tabular-nums">
                    {formatRelative(last.createdAt)}
                  </span>
                )}
              </button>
              <details className="relative mr-1">
                <summary className="flex size-8 list-none items-center justify-center rounded-sm text-subtle opacity-0 hover:bg-hover hover:text-fg group-hover:opacity-100 [&::-webkit-details-marker]:hidden">
                  <MoreHorizontal className="size-4" />
                </summary>
                <div className="absolute top-8 right-0 z-20 w-40 rounded-md bg-raised py-1 shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]">
                  <MenuItem onClick={() => pinBot(bot.id, !bot.pinned)}>
                    <Pin className="size-3.5" /> {bot.pinned ? "Unpin" : "Pin"}
                  </MenuItem>
                  <MenuItem onClick={() => void duplicateBot(bot.id)}>
                    <Copy className="size-3.5" /> Duplicate
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
          <p className="px-3 py-6 text-sm text-muted">No agents yet.</p>
        )}
      </div>
      <div className="border-t border-border p-2">
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setUi({ newAgentOpen: true })}
        >
          <Plus className="size-4" />
          New agent
        </Button>
        <p className="mt-2 px-1 font-mono text-[10px] text-subtle">
          Hosted grok-4.5
        </p>
      </div>
    </aside>
  );
}

function MenuItem({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-hover"
    >
      {children}
    </button>
  );
}
