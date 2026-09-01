import { AGENT_COLORS, type Bot } from "@/lib/types";
import { isMascotId, mascotIdForTemplate } from "@/lib/mascots";
import { cn } from "@/lib/utils";
import { MascotMark } from "./mascots";

export function AgentAvatar({
  bot,
  size = "md",
}: {
  bot: Pick<Bot, "name" | "color"> & { mascotId?: Bot["mascotId"] };
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const mascot = isMascotId(bot.mascotId) ? bot.mascotId : mascotIdForTemplate(bot.name);
  const dim =
    size === "xs"
      ? "size-6"
      : size === "sm"
        ? "size-8"
        : size === "lg"
          ? "size-12"
          : "size-9";
  return (
    <span
      className={cn("inline-flex shrink-0 overflow-hidden rounded-full", dim)}
      aria-hidden
      title={bot.name}
    >
      <MascotMark id={mascot} />
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
