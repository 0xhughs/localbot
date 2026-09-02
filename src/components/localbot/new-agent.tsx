import { useState } from "react";
import { useLocalBot } from "@/lib/store";
import { MASCOT_IDS, MASCOT_META, mascotIdForTemplate, type MascotId } from "@/lib/mascots";
import { AGENT_COLOR_LIST, type AgentColorId } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorSwatch } from "./avatar";
import { MascotMark } from "./mascots";

export function NewAgentDialog() {
  const open = useLocalBot((s) => s.ui.newAgentOpen);
  const setUi = useLocalBot((s) => s.setUi);
  const createBot = useLocalBot((s) => s.createBot);
  const selectedCatalogId = useLocalBot((s) => s.selectedCatalogId);
  const bots = useLocalBot((s) => s.bots);
  const [name, setName] = useState("");
  const [job, setJob] = useState("");
  const [color, setColor] = useState<AgentColorId>("steel");
  const [mascotId, setMascotId] = useState<MascotId>("researcher");
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  const submit = async () => {
    const n = name.trim() || `Agent ${bots.length + 1}`;
    setError(null);
    try {
      await createBot({
        name: n,
        job: job.trim() || "Generalist",
        color,
        mascotId,
        modelId: selectedCatalogId ?? "qwen25-05b-q4",
      });
      setName("");
      setJob("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg/70 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]">
        <h2 className="text-lg font-medium tracking-tight">New agent</h2>
        <p className="mt-1 text-sm text-muted">
          Each agent gets agents/{"{Name}"}/private with memory and output inside.
        </p>
        <label className="mt-4 block text-xs font-medium text-muted">
          Name
          <Input
            className="mt-1.5"
            value={name}
            onChange={(e) => {
              const v = e.target.value;
              setName(v);
              const guessed = mascotIdForTemplate(v);
              setMascotId(guessed);
              setColor(MASCOT_META[guessed].defaultColor);
            }}
            placeholder="Researcher"
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-muted">
          Job
          <Input className="mt-1.5" value={job} onChange={(e) => setJob(e.target.value)} placeholder="Sources into shared/" />
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
              >
                <MascotMark id={id} />
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <p className="text-xs font-medium text-muted">Color</p>
          <div className="mt-2 flex gap-2">
            {AGENT_COLOR_LIST.map((c) => (
              <ColorSwatch
                key={c.id}
                hex={c.hex}
                selected={color === c.id}
                onClick={() => setColor(c.id)}
              />
            ))}
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setUi({ newAgentOpen: false })}>
            Cancel
          </Button>
          <Button onClick={() => void submit()}>Create</Button>
        </div>
      </div>
    </div>
  );
}
