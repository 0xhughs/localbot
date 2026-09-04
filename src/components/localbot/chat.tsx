import { useEffect, useRef, useState } from "react";
import {
  Monitor,
  Paperclip,
  Square,
  Terminal,
  FilePenLine,
  Globe,
  FileSearch,
  Ban,
} from "lucide-react";
import { useLocalBot, resolveBot } from "@/lib/store";
import {
  isActiveBot,
  type PermissionDecision,
  type PermissionRequest,
  type ToolChip,
  type ToolKind,
} from "@/lib/types";
import { runAgentTurn } from "@/runtime/harnessAdapter";
import { modelStatusForAgent } from "@/lib/runtime/model-server";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "./avatar";
import { ChatMarkdown } from "./markdown";

type AgentModelStatus = Awaited<ReturnType<typeof modelStatusForAgent>>;

function modelBadgeTitle(s: AgentModelStatus | null): string | undefined {
  if (!s) return undefined;
  const lines: string[] = [];
  if (s.ollama) lines.push(s.ollama.model ? `Ollama ${s.ollama.model} on 127.0.0.1:11434` : "Ollama switch is on; no model picked");
  else if (s.path) lines.push(`${s.name}\n${s.path}`);
  if (s.notice) lines.push(s.notice);
  if (s.loaded) lines.push(`llama-server: ${s.loaded.modelPath.split(/[\\/]/).pop()} · ${s.loaded.runtime} · gpu layers ${s.loaded.gpuLayers}`);
  if (s.willRestart) lines.push("Next message restarts llama-server onto this agent's model.");
  if (s.runtime) lines.push(`Build: ${s.runtime.label} — ${s.runtime.reason}`);
  return lines.join("\n");
}

const SUGGESTIONS = [
  "Write a one-page launch brief into private/output/brief.md",
  "List everything in private/ and summarize it",
  "Create notes.md in private/ with today's priorities",
];

export function ChatPane() {
  const selected = useLocalBot((s) => s.ui.selectedBotId);
  const bots = useLocalBot((s) => s.bots);
  const bot = bots.find((b) => b.id === selected) ?? null;
  const session = useLocalBot((s) => (selected ? s.sessions[selected] : undefined));
  const composer = useLocalBot((s) => s.ui.composer);
  const setUi = useLocalBot((s) => s.setUi);
  const appendMessage = useLocalBot((s) => s.appendMessage);
  const setRunning = useLocalBot((s) => s.setSessionRunning);
  const requestStop = useLocalBot((s) => s.requestStop);
  const handoffTask = useLocalBot((s) => s.handoffTask);
  const writeBotFile = useLocalBot((s) => s.writeBotFile);
  const showComputer = useLocalBot((s) => s.ui.showComputer);
  const aiAvailable = useLocalBot((s) => s.runtime.aiAvailable);
  const badge = useLocalBot((s) => s.runtime.badge);
  const setRuntime = useLocalBot((s) => s.setRuntime);
  const settingsOpen = useLocalBot((s) => s.ui.showSettings);
  const snap = useLocalBot.getState();

  const [chips, setChips] = useState<ToolChip[]>([]);
  const [pending, setPending] = useState<PermissionRequest | null>(null);
  const [agentModel, setAgentModel] = useState<AgentModelStatus | null>(null);
  const [switching, setSwitching] = useState(false);
  const permResolver = useRef<((d: PermissionDecision) => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [session?.messages.length, chips.length, pending, session?.running]);

  useEffect(() => {
    setChips([]);
    setPending(null);
  }, [selected]);

  // Stage 6: the header badge names the file *this* agent's next turn loads
  // (agent.json.modelId), refreshed on agent select, after each turn and when
  // Settings closes — not the onboarding card's catalog id.
  const botName = bot?.name ?? null;
  const botModelId = bot?.modelId ?? null;
  const turnRunning = Boolean(session?.running);
  useEffect(() => {
    if (!botName) return;
    let stale = false;
    void modelStatusForAgent({ data: { agentName: botName } }).then((s) => {
      if (stale) return;
      setAgentModel(s);
      setRuntime({ badge: s.badge, aiAvailable: s.ready, model: s.name, ggufPath: s.path });
      // agent.json is the durable record; a browser copy that drifted (edited
      // on disk, another window) follows it so the pickers show the truth.
      const cur = useLocalBot.getState().bots.find((b) => b.name === botName);
      if (cur && s.modelId && cur.modelId !== s.modelId) useLocalBot.getState().updateBot(cur.id, { modelId: s.modelId });
    });
    return () => {
      stale = true;
    };
  }, [botName, botModelId, turnRunning, settingsOpen, setRuntime]);

  if (!bot) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted">
        Select an agent
      </div>
    );
  }

  const running = Boolean(session?.running);
  const ctx = resolveBot(snap, bot.id);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || running) return;
    setUi({ composer: "" });
    appendMessage(bot.id, { role: "user", content: trimmed });

    const mentions = [...trimmed.matchAll(/@([A-Za-z0-9_-]+)/g)].map((m) => m[1]!);
    for (const name of mentions) {
      if (name.toLowerCase() === bot.name.toLowerCase()) continue;
      const result = await handoffTask(bot.id, name, trimmed);
      if (result.ok) {
        appendMessage(bot.id, {
          role: "system",
          content: `Handed work to ${name} via ${result.path}`,
          handoffTo: result.toBotId,
        });
      }
    }

    const ac = new AbortController();
    abortRef.current = ac;
    setChips([]);
    setRunning(bot.id, true);
    setSwitching(Boolean(agentModel?.willRestart));
    const live: ToolChip[] = [];
    const result = await runAgentTurn({
      botId: bot.id,
      userText: trimmed,
      abort: ac.signal,
      events: {
        onModel: (info) => {
          setSwitching(false);
          if (info.restarted) {
            appendMessage(bot.id, {
              role: "system",
              content: `Switched llama-server to ${info.name}${info.path ? ` (${info.path.split(/[\\/]/).pop()})` : ""}.`,
            });
          }
          if (info.notice) appendMessage(bot.id, { role: "system", content: info.notice });
        },
        onSession: (info) => {
          // The sidecar restarted since the last turn and picked the persisted ACP session back up.
          if (info.origin === "resumed") {
            appendMessage(bot.id, { role: "system", content: "Resumed the previous Harness session." });
          }
        },
        onChip: (chip) => {
          live.push(chip);
          setChips([...live]);
        },
        onChipUpdate: (id, patch) => {
          const i = live.findIndex((c) => c.id === id);
          if (i >= 0) live[i] = { ...live[i]!, ...patch };
          setChips([...live]);
        },
        askPermission: (req) =>
          new Promise<PermissionDecision>((resolve) => {
            permResolver.current = resolve;
            setPending(req);
            useLocalBot.getState().setUi({ pendingPermission: req });
          }),
      },
    });
    setPending(null);
    setSwitching(false);
    useLocalBot.getState().setUi({ pendingPermission: null });
    setRunning(bot.id, false);
    const sess = useLocalBot.getState().sessions[bot.id];
    const last = [...(sess?.messages ?? [])].reverse().find((m) => m.role === "assistant");
    if (last && live.length > 0) {
      useLocalBot.getState().patchMessage(bot.id, last.id, { chips: [...live] });
    }
    setChips([]);
    if (result.stopped) {
      appendMessage(bot.id, { role: "system", content: "Stopped." });
    } else if (result.error) {
      appendMessage(bot.id, {
        role: "assistant",
        content: result.error,
      });
    }
  };

  const decide = (d: PermissionDecision) => {
    permResolver.current?.(d);
    permResolver.current = null;
    setPending(null);
    useLocalBot.getState().setUi({ pendingPermission: null });
  };

  const onAttach = async (file: File) => {
    const text = await file.text();
    const path = `private/${file.name}`;
    const r = await writeBotFile(bot.id, path, text);
    appendMessage(bot.id, {
      role: "system",
      content: r.ok
        ? `Attached ${file.name} into private/.`
        : `Could not attach ${file.name}: ${r.error}`,
    });
  };

  const messages = session?.messages ?? [];

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
        <AgentAvatar bot={bot} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-medium">{bot.name}</h1>
            {running && (
              <span className="shimmer-text font-mono text-[10px] tracking-wider uppercase">
                {switching ? "Switching model" : "Working"}
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-muted">
            {bot.job}
          </p>
        </div>
        <span
          data-testid="model-badge"
          title={modelBadgeTitle(agentModel)}
          className={`hidden rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase md:inline ${
            (agentModel ? agentModel.ready : aiAvailable) ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger"
          }`}
        >
          {agentModel?.badge || badge || (aiAvailable ? "Local model" : "Local model not ready")}
        </span>
        <Button
          variant={running ? "danger" : "ghost"}
          size="sm"
          onClick={() => {
            abortRef.current?.abort();
            requestStop(bot.id);
          }}
          disabled={!running}
        >
          <Square className="size-3.5" />
          Stop
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Show computer"
          onClick={() => setUi({ showComputer: !showComputer })}
        >
          <Monitor className="size-4" />
        </Button>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 scrollbar-thin md:px-8">
        {messages.length === 0 && !running && (
          <Empty botName={bot.name} onPick={(t) => void send(t)} />
        )}
        <ol className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.map((m) => (
            <li key={m.id} data-role={m.role} className={m.role === "user" ? "ml-8" : "mr-4"}>
              {m.role === "system" ? (
                <p className="font-mono text-[11px] text-subtle">{m.content}</p>
              ) : m.role === "user" ? (
                <div className="rounded-lg bg-raised px-3.5 py-2.5 shadow-[0_0_0_1px_var(--color-border)]">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                </div>
              ) : (
                <div>
                  {m.chips && m.chips.length > 0 && <ChipRow chips={m.chips} />}
                  <ChatMarkdown text={m.content} />
                </div>
              )}
            </li>
          ))}
          {(running || chips.length > 0) && (
            <li className="mr-4">
              <ChipRow chips={chips} />
              {running && chips.length === 0 && (
                <p className="shimmer-text text-sm">Thinking</p>
              )}
            </li>
          )}
          {pending && (
            <li>
              <PermissionCard
                req={pending}
                allowed={true}
                onDecide={decide}
              />
            </li>
          )}
        </ol>
      </div>

      <div className="border-t border-border px-3 py-3 md:px-6">
        <div className="mx-auto max-w-2xl rounded-xl bg-surface p-2 shadow-[0_0_0_1px_var(--color-border)]">
          <textarea
            value={composer}
            onChange={(e) => setUi({ composer: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(composer);
              }
            }}
            rows={2}
            placeholder={`Message ${bot.name} — @name to hand off`}
            className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-fg placeholder:text-subtle focus-visible:outline-none"
          />
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1">
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onAttach(f);
                  e.target.value = "";
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Attach file"
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip className="size-4" />
              </Button>
              <MentionHint />
            </div>
            <Button
              size="sm"
              disabled={!composer.trim() || running}
              onClick={() => void send(composer)}
            >
              Send
            </Button>
          </div>
        </div>
        <p className="mx-auto mt-2 max-w-2xl font-mono text-[10px] text-subtle">
          {ctx
            ? `private · ${bot.privatePath || "agents/" + bot.name + "/private"}`
            : "private"}
        </p>
      </div>
    </section>
  );
}

function Empty({ botName, onPick }: { botName: string; onPick: (t: string) => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start py-10">
      <p className="text-sm text-muted">
        {botName} is ready. Work stays in its private folder unless you grant a shared scope. Try one of these:
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-md bg-surface px-3 py-2 text-left text-sm text-fg shadow-[0_0_0_1px_var(--color-border)] hover:bg-raised"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChipRow({ chips }: { chips: ToolChip[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span
          key={c.id}
          className={`inline-flex items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-[11px] ${
            c.status === "denied"
              ? "text-danger"
              : c.status === "running"
                ? "text-accent"
                : "text-muted"
          }`}
        >
          <ChipIcon kind={c.kind} />
          {c.label}
          <span className="max-w-[180px] truncate font-mono text-[10px] text-subtle">
            {c.detail}
          </span>
        </span>
      ))}
    </div>
  );
}

function ChipIcon({ kind }: { kind: ToolKind }) {
  const cls = "size-3";
  if (kind === "shell") return <Terminal className={cls} />;
  if (kind === "edit" || kind === "write") return <FilePenLine className={cls} />;
  if (kind === "network" || kind === "browser") return <Globe className={cls} />;
  if (kind === "delete") return <Ban className={cls} />;
  return <FileSearch className={cls} />;
}

function PermissionCard({
  req,
  allowed,
  onDecide,
}: {
  req: PermissionRequest;
  allowed: boolean;
  onDecide: (d: PermissionDecision) => void;
}) {
  return (
    <div className="rounded-xl bg-raised p-4 shadow-[0_0_0_1px_var(--color-border-strong)]">
      <p className="font-mono text-[10px] tracking-wider text-subtle uppercase">
        Permission
      </p>
      <h3 className="mt-1 text-sm font-medium">{req.summary}</h3>
      <p className="mt-1 font-mono text-xs leading-relaxed break-all text-muted">
        {req.detail}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => onDecide("deny")}>
          Deny
        </Button>
        {allowed && (
          <>
            <Button variant="secondary" size="sm" onClick={() => onDecide("allow-once")}>
              Allow once
            </Button>
            <Button size="sm" onClick={() => onDecide("allow-chat")}>
              Allow for this chat
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function MentionHint() {
  const allBots = useLocalBot((s) => s.bots);
  const bots = allBots.filter(isActiveBot);
  const composer = useLocalBot((s) => s.ui.composer);
  const setUi = useLocalBot((s) => s.setUi);
  const at = composer.lastIndexOf("@");
  if (at < 0) return null;
  const q = composer.slice(at + 1).split(/\s/)[0] ?? "";
  if (composer.slice(at).includes(" ") && q.length === 0) return null;
  const matches = bots.filter((b) =>
    b.name.toLowerCase().startsWith(q.toLowerCase()),
  );
  if (matches.length === 0) return null;
  return (
    <div className="flex gap-1">
      {matches.slice(0, 3).map((b) => (
        <button
          key={b.id}
          type="button"
          className="rounded-sm px-1.5 py-0.5 font-mono text-[11px] text-accent hover:bg-hover"
          onClick={() => {
            const next = composer.slice(0, at) + `@${b.name} `;
            setUi({ composer: next });
          }}
        >
          @{b.name}
        </button>
      ))}
    </div>
  );
}
