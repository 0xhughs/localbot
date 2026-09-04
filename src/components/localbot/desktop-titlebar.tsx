import { Minus, Square, X } from "lucide-react";
import { useEffect, type CSSProperties } from "react";
import { desktopBridge } from "@/lib/desktop-bridge";
import { useLocalBot } from "@/lib/store";

export function DesktopTitlebar() {
  const selected = useLocalBot((s) => s.ui.selectedBotId);
  const bots = useLocalBot((s) => s.bots);
  const setUi = useLocalBot((s) => s.setUi);
  const bot = bots.find((b) => b.id === selected);
  const title = bot ? `${bot.name} · LocalBot` : "LocalBot";
  const desktop = desktopBridge();

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

  // Stage 11: this strip is the only title bar. On macOS the native traffic
  // lights sit inside it (hiddenInset, trafficLightPosition x 14 / y 12), so
  // the strip keeps an empty gutter on the left; the Wordmark, Settings and
  // the roster all live in the sidebar below this strip, never in this corner.
  return (
    <div
      data-testid="desktop-titlebar"
      className="flex h-9 shrink-0 items-center border-b border-border bg-bg px-3"
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
    >
      {desktop.platform === "darwin" && (
        <span data-testid="traffic-light-gutter" aria-hidden="true" className="w-[72px] shrink-0" />
      )}
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
