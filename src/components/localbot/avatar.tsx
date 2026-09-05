import { type Bot } from "@/lib/types";
import { agentColorBackdrop, agentColorHex, agentColorId } from "@/lib/agent-color";
import { isMascotId, mascotIdForTemplate } from "@/lib/mascots";
import { cn } from "@/lib/utils";
import { MascotMark } from "./mascots";

/**
 * Stage 12: the avatar paints with the agent's stored colour. `bot.color` is
 * the `AgentColorId` from agent.json; `AGENT_COLORS[bot.color].hex` becomes the
 * mascot body fill and a 1.5 px ring. The roster row and the chat header both
 * render this component, so a colour change shows in both places.
 */
export function AgentAvatar({
  bot,
  size = "md",
}: {
  bot: Pick<Bot, "name" | "color"> & { mascotId?: Bot["mascotId"] };
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const mascot = isMascotId(bot.mascotId) ? bot.mascotId : mascotIdForTemplate(bot.name);
  const hex = agentColorHex(bot.color);
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
      data-testid="agent-avatar"
      data-agent-color={agentColorId(bot.color)}
      data-agent-hex={hex}
      style={{ boxShadow: `0 0 0 1.5px ${hex}` }}
    >
      <MascotMark id={mascot} color={hex} backdrop={agentColorBackdrop(bot.color)} />
    </span>
  );
}

export function ColorSwatch({
  hex,
  selected,
  onClick,
  label,
  testId,
}: {
  hex: string;
  selected?: boolean;
  onClick?: () => void;
  label?: string;
  testId?: string;
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
      aria-label={label ?? hex}
      aria-pressed={selected}
      data-testid={testId}
    />
  );
}
