import { Minus, Square, X } from "lucide-react";
import { useEffect, type CSSProperties } from "react";
import { useLocalBot } from "@/lib/store";

declare global {
  interface Window {
    localbotDesktop?: {
      platform: string;
      setTitle: (title: string) => void;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      onSettings: (fn: () => void) => () => void;
    };
  }
}

export function DesktopTitlebar() {
  const selected = useLocalBot((s) => s.ui.selectedBotId);
  const bots = useLocalBot((s) => s.bots);
  const setUi = useLocalBot((s) => s.setUi);
  const bot = bots.find((b) => b.id === selected);
  const title = bot ? `${bot.name} · LocalBot` : "LocalBot";
  const desktop = typeof window !== "undefined" ? window.localbotDesktop : undefined;

  useEffect(() => {
    document.title = title;
    desktop?.setTitle(title);
  }, [title, desktop]);

  useEffect(() => {
    if (!desktop?.onSettings) return;
    return desktop.onSettings(() => setUi({ showSettings: true }));
  }, [desktop, setUi]);

  if (!desktop) return null;

  const showControls = desktop.platform !== "darwin";

  return (
    <div
      className="flex h-9 shrink-0 items-center border-b border-border bg-bg px-3"
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
    >
      {desktop.platform === "darwin" && <span className="w-16" />}
      <p className="flex-1 truncate font-mono text-[11px] tracking-wide text-subtle">{title}</p>
      {showControls && (
        <div className="flex" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
          <button
            type="button"
            className="flex size-8 items-center justify-center text-muted hover:text-fg"
            aria-label="Minimize"
            onClick={() => desktop.minimize()}
          >
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            className="flex size-8 items-center justify-center text-muted hover:text-fg"
            aria-label="Maximize"
            onClick={() => desktop.maximize()}
          >
            <Square className="size-3" />
          </button>
          <button
            type="button"
            className="flex size-8 items-center justify-center text-muted hover:text-danger"
            aria-label="Close"
            onClick={() => desktop.close()}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
