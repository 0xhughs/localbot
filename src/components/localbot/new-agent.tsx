import { useState } from "react";
import { useLocalBot } from "@/lib/store";
import { AGENT_COLOR_LIST, type AgentColorId } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorSwatch } from "./avatar";

export function NewAgentDialog() {
  const open = useLocalBot((s) => s.ui.newAgentOpen);
  const setUi = useLocalBot((s) => s.setUi);
  const createBot = useLocalBot((s) => s.createBot);
  const models = useLocalBot((s) => s.models);
  const bots = useLocalBot((s) => s.bots);
  const [name, setName] = useState("");
  const [job, setJob] = useState("");
  const [color, setColor] = useState<AgentColorId>("steel");
  if (!open) return null;

  const submit = () => {
    const n = name.trim() || `Agent ${bots.length + 1}`;
    createBot({
      name: n,
      job: job.trim() || "Generalist",
      color,
      modelId: models[0]?.catalogId ?? "gemma4-e2b-q4",
      extraGrants: ["shared"],
    });
    setName("");
    setJob("");
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg/70 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]">
        <h2 className="text-lg font-medium tracking-tight">New agent</h2>
        <p className="mt-1 text-sm text-muted">
          Each agent gets a workspace, memory, and output folder.
        </p>
        <label className="mt-4 block text-xs font-medium text-muted">
          Name
          <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Researcher" />
        </label>
        <label className="mt-3 block text-xs font-medium text-muted">
          Job
          <Input className="mt-1.5" value={job} onChange={(e) => setJob(e.target.value)} placeholder="Sources into shared/" />
        </label>
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
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setUi({ newAgentOpen: false })}>
            Cancel
          </Button>
          <Button onClick={submit}>Create</Button>
        </div>
      </div>
    </div>
  );
}
