import { useEffect, useState } from "react";
import { useLocalBot } from "@/lib/store";
import { MASCOT_IDS, MASCOT_META, type MascotId } from "@/lib/mascots";
import { agentColorHex } from "@/lib/agent-color";
import { AGENT_COLOR_LIST, type AgentColorId } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgentAvatar, ColorSwatch } from "./avatar";
import { MascotMark } from "./mascots";

/**
 * Stage 12 — Edit profile, from the agent's … menu. Name (rename on disk when
 * changed), job, description (the AGENTS.md standing-instructions body),
 * mascot and colour. Save goes through `updateBotProfile` → the sidecar's
 * `agentUpdateProfile`: agents/{Old}/ → agents/{New}/ when renamed, then
 * agent.json + AGENTS.md. Nothing here is store-only.
 */
export function EditProfileDialog() {
  const botId = useLocalBot((s) => s.ui.editProfileBotId);
  const bot = useLocalBot((s) => (botId ? s.bots.find((b) => b.id === botId) : undefined));
  const setUi = useLocalBot((s) => s.setUi);
  const updateBotProfile = useLocalBot((s) => s.updateBotProfile);
  const [name, setName] = useState("");
  const [job, setJob] = useState("");
  const [description, setDescription] = useState("");
  const [mascotId, setMascotId] = useState<MascotId>("ops");
  const [color, setColor] = useState<AgentColorId>("steel");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the current profile each time the panel opens on an agent.
  useEffect(() => {
    if (!bot) return;
    setName(bot.name);
    setJob(bot.job);
    setDescription(bot.standingInstructions);
    setMascotId(bot.mascotId);
    setColor(bot.color);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot?.id]);

  if (!botId || !bot) return null;

  const close = () => setUi({ editProfileBotId: null });
  const renamed = name.trim().replace(/\s+/g, " ") !== bot.name;

  const save = async () => {
    setSaving(true);
    setError(null);
    const r = await updateBotProfile(bot.id, { name, job, description, mascotId, color });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    close();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-bg/70 p-4 backdrop-blur-[2px]"
      data-testid="edit-profile"
    >
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]">
        <div className="flex items-center gap-3">
          <AgentAvatar bot={{ name: name || bot.name, color, mascotId }} size="lg" />
          <div className="min-w-0">
            <h2 className="text-lg font-medium tracking-tight">Edit profile</h2>
            <p className="truncate text-xs text-muted">
              agents/{bot.name}/ — agent.json + AGENTS.md
              {renamed && name.trim() ? ` → agents/${name.trim().replace(/\s+/g, " ")}/` : ""}
            </p>
          </div>
        </div>
        <label className="mt-4 block text-xs font-medium text-muted">
          Name
          <Input
            className="mt-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            data-testid="profile-name"
          />
          {renamed && (
            <span className="mt-1 block text-[11px] text-subtle">
              Renaming moves the folder on disk; chats stay with the agent.
            </span>
          )}
        </label>
        <label className="mt-3 block text-xs font-medium text-muted">
          Job / label
          <Input
            className="mt-1.5"
            value={job}
            onChange={(e) => setJob(e.target.value)}
            placeholder="Generalist"
            data-testid="profile-job"
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-muted">
          Description / standing instructions
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            data-testid="profile-description"
            placeholder="What this agent should always keep in mind. Written to AGENTS.md."
            className="mt-1.5 block w-full resize-y rounded-md bg-bg px-3 py-2 text-sm leading-5 text-fg placeholder:text-subtle outline-none ring-1 ring-border focus:ring-accent scrollbar-thin"
          />
        </label>
        <div className="mt-3">
          <p className="text-xs font-medium text-muted">Mascot</p>
          <div className="mt-2 flex gap-2">
            {MASCOT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setMascotId(id)}
                className={`flex size-11 items-center justify-center overflow-hidden rounded-full ${
                  mascotId === id ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : ""
                }`}
                aria-label={MASCOT_META[id].label}
                aria-pressed={mascotId === id}
                data-testid={`profile-mascot-${id}`}
              >
                <MascotMark id={id} color={agentColorHex(color)} />
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <p className="text-xs font-medium text-muted">Colour</p>
          <div className="mt-2 flex gap-2" data-testid="profile-colors">
            {AGENT_COLOR_LIST.map((c) => (
              <ColorSwatch
                key={c.id}
                hex={c.hex}
                selected={color === c.id}
                onClick={() => setColor(c.id)}
                label={c.label}
                testId={`profile-color-${c.id}`}
              />
            ))}
          </div>
        </div>
        {error && (
          <p className="mt-3 text-sm text-danger" data-testid="profile-error">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !name.trim()} data-testid="profile-save">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
