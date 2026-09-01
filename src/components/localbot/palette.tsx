import { useEffect, useMemo, useState } from "react";
import { useLocalBot } from "@/lib/store";

export function CommandPalette() {
  const open = useLocalBot((s) => s.ui.commandOpen);
  const setUi = useLocalBot((s) => s.setUi);
  const allBots = useLocalBot((s) => s.bots);
  const bots = allBots.filter((b) => !b.hidden);
  const selectBot = useLocalBot((s) => s.selectBot);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setUi({ commandOpen: !useLocalBot.getState().ui.commandOpen });
      }
      if (meta && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setUi({ newAgentOpen: true, commandOpen: false });
      }
      if (meta && e.key === ",") {
        e.preventDefault();
        setUi({ showSettings: true, commandOpen: false });
      }
      if (e.key === "Escape") {
        setUi({
          commandOpen: false,
          showSettings: false,
          newAgentOpen: false,
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setUi]);

  const actions = useMemo(() => {
    const list: { id: string; label: string; hint: string; run: () => void }[] = [
      {
        id: "new",
        label: "New agent",
        hint: "⌘N",
        run: () => setUi({ newAgentOpen: true, commandOpen: false }),
      },
      {
        id: "settings",
        label: "Settings",
        hint: "⌘,",
        run: () => setUi({ showSettings: true, commandOpen: false }),
      },
      {
        id: "computer",
        label: "Toggle computer pane",
        hint: "",
        run: () =>
          setUi({
            showComputer: !useLocalBot.getState().ui.showComputer,
            commandOpen: false,
          }),
      },
    ];
    for (const b of bots) {
      list.push({
        id: b.id,
        label: `Open ${b.name}`,
        hint: b.job,
        run: () => {
          selectBot(b.id);
          setUi({ commandOpen: false });
        },
      });
    }
    const n = q.trim().toLowerCase();
    return n ? list.filter((a) => a.label.toLowerCase().includes(n)) : list;
  }, [bots, q, selectBot, setUi]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-bg/60 pt-[18vh] backdrop-blur-[2px]"
      onClick={() => setUi({ commandOpen: false })}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Jump to an agent or action"
          className="h-12 w-full bg-transparent px-4 text-sm text-fg placeholder:text-subtle focus-visible:outline-none"
        />
        <ul className="max-h-72 overflow-y-auto border-t border-border py-1 scrollbar-thin">
          {actions.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={a.run}
                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-hover"
              >
                <span>{a.label}</span>
                <span className="font-mono text-[10px] text-subtle">{a.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
