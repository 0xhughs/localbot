import { AGENT_COLORS, type Bot } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

export function AgentAvatar({
  bot,
  size = "md",
}: {
  bot: Pick<Bot, "name" | "color">;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const hex = AGENT_COLORS[bot.color]?.hex ?? AGENT_COLORS.sage.hex;
  const dim =
    size === "xs"
      ? "size-6 text-[10px]"
      : size === "sm"
        ? "size-8 text-[11px]"
        : size === "lg"
          ? "size-12 text-base"
          : "size-9 text-xs";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm font-medium text-accent-fg",
        dim,
      )}
      style={{ backgroundColor: hex }}
      aria-hidden
    >
      {initials(bot.name)}
    </span>
  );
}

export function ColorSwatch({
  hex,
  selected,
  onClick,
}: {
  hex: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "size-7 rounded-sm transition-transform duration-150",
        selected && "ring-2 ring-fg ring-offset-2 ring-offset-bg",
      )}
      style={{ backgroundColor: hex }}
      aria-label={hex}
    />
  );
}
