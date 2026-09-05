import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Ban, FilePenLine, FileSearch, Globe, Hash, Pencil, Plus, Square, Terminal, Trash2, Users, X } from "lucide-react";
import { useLocalBot } from "@/lib/store";
import { isActiveBot, type Bot, type ChannelMessage, type PermissionDecision, type PermissionRequest, type ToolChip, type ToolKind } from "@/lib/types";
import { channelTurnRulesText } from "@/lib/channels-model";
import { decideChannelPermission, sendChannelMessage, stopChannelTurn } from "@/runtime/channelRunner";
import { COMPOSER_MAX_LINES, composerHeight } from "@/lib/chat-layout";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "./avatar";
import { ChatMarkdown } from "./markdown";

/**
 * Stage 16 — the shared thread of one channel. The composer sends as the
 * employee (`sendChannelMessage` → the employee's line on the transcript, then
 * one `runAgentTurn` per selected member). Replies carry the member's name +
 * mascot. The `@` picker lists members only. Nothing here talks to the
 * Harness directly; `channelRunner.ts` does, through the same adapter as chat.
 */
export function ChannelPane() {
  const channelId = useLocalBot((s) => s.ui.selectedChannelId);
  const channel = useLocalBot((s) => s.channels.find((c) => c.id === s.ui.selectedChannelId) ?? null);
  const session = useLocalBot((s) => (s.ui.selectedChannelId ? s.channelSessions[s.ui.selectedChannelId] : undefined));
  const bots = useLocalBot((s) => s.bots);
  const composer = useLocalBot((s) => s.ui.composer);
  const setUi = useLocalBot((s) => s.setUi);
  const renameChannel = useLocalBot((s) => s.renameChannel);
  const deleteChannel = useLocalBot((s) => s.deleteChannel);
  const addChannelMember = useLocalBot((s) => s.addChannelMember);
  const removeChannelMember = useLocalBot((s) => s.removeChannelMember);
  const [renaming, setRenaming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const messages = session?.messages ?? [];
  const active = session?.activeSpeakerId ?? null;
  const activeBot = active ? bots.find((b) => b.id === active) ?? null : null;
  const pending = session?.pendingPermission ?? null;
  const chips = session?.chips ?? [];
  const queued = session?.queued ?? [];

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length, chips.length, pending, active]);

  useEffect(() => {
    setRenaming(false);
    setNotice(null);
  }, [channelId]);

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    const cs = window.getComputedStyle(el);
    el.style.height = "auto";
    const { height, overflow } = composerHeight({
      scrollHeight: el.scrollHeight,
      lineHeight: parseFloat(cs.lineHeight),
      verticalPadding: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom),
      maxLines: COMPOSER_MAX_LINES,
    });
    el.style.height = `${height}px`;
    el.style.overflowY = overflow ? "auto" : "hidden";
  }, [composer, channelId]);

  if (!channel) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted" data-testid="channel-pane">
        Select a channel
      </div>
    );
  }

  const members: Bot[] = channel.memberIds.map((id) => bots.find((b) => b.id === id)).filter((b): b is Bot => Boolean(b));
  const first = members[0] ?? null;
  const nameOf = (id: string | null) => (id ? bots.find((b) => b.id === id)?.name ?? id : null);
  const addable = bots.filter(isActiveBot).filter((b) => !channel.memberIds.includes(b.id));
  const report = (r: { ok: boolean; error?: string }) => setNotice(r.ok ? null : (r.error ?? "Something went wrong."));

  const send = (text: string, all = false) => {
    if (!text.trim() && !all) return;
    setUi({ composer: "" });
    void sendChannelMessage(channel.id, text, { all });
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-bg" data-testid="channel-pane" data-channel-id={channel.id}>
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5" data-testid="channel-header">
        <Hash className="size-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          {renaming ? (
            <InlineName
              initial={channel.name}
              onDone={async (next) => {
                setRenaming(false);
                if (next === null || next === channel.name) return;
                report(await renameChannel(channel.id, next));
              }}
            />
          ) : (
            <div className="flex items-center gap-2">
              <h1
                className="truncate text-sm font-medium"
                data-testid="channel-name"
                title={channelTurnRulesText(first?.name ?? null)}
                onDoubleClick={() => setRenaming(true)}
              >
                {channel.name}
              </h1>
              {activeBot ? (
                <span className="shimmer-text font-mono text-[10px] tracking-wider uppercase" data-testid="channel-state">
                  {activeBot.name} working
                </span>
              ) : queued.length > 0 ? (
                <span className="font-mono text-[10px] tracking-wider text-subtle uppercase">
                  {queued.map(nameOf).join(", ")} queued
                </span>
              ) : null}
            </div>
          )}
          <p className="truncate text-[11px] text-muted" title={channelTurnRulesText(first?.name ?? null)}>
            {members.length} members · no @ → {first?.name ?? "—"} answers · @Name pages that member
          </p>
        </div>
        <div className="flex items-center gap-1" data-testid="channel-members">
          {members.map((m) => (
            <span key={m.id} className="group/member relative inline-flex items-center" data-testid="channel-member" data-agent-id={m.id}>
              <AgentAvatar bot={m} size="sm" />
              <button
                type="button"
                aria-label={`Remove ${m.name} from channel`}
                title={`Remove ${m.name}`}
                onClick={() => void removeChannelMember(channel.id, m.id).then(report)}
                className="absolute -top-1 -right-1 hidden size-4 items-center justify-center rounded-full bg-raised text-subtle shadow-[0_0_0_1px_var(--color-border)] group-hover/member:flex hover:text-danger"
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
          <details className="relative">
            <summary
              aria-label="Add member"
              title="Add member"
              data-testid="channel-add-member"
              className="flex size-8 list-none items-center justify-center rounded-full text-subtle hover:bg-hover hover:text-fg [&::-webkit-details-marker]:hidden"
            >
              <Plus className="size-4" />
            </summary>
            <div className="absolute top-9 right-0 z-20 w-52 rounded-md bg-raised py-1 shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]">
              {addable.length === 0 && <p className="px-3 py-1.5 text-xs text-subtle">Every active agent is already here.</p>}
              {addable.map((b) => (
                <MenuItem key={b.id} onClick={() => void addChannelMember(channel.id, b.id).then(report)}>
                  <AgentAvatar bot={b} size="xs" /> {b.name}
                </MenuItem>
              ))}
            </div>
          </details>
        </div>
        <Button
          variant="ghost"
          size="sm"
          data-testid="channel-run-all"
          title="Every member answers once, one at a time. Never implied by the text."
          disabled={Boolean(active) || members.length === 0}
          onClick={() => send(composer, true)}
        >
          <Users className="size-3.5" />
          Run all once
        </Button>
        <Button variant={active ? "danger" : "ghost"} size="sm" disabled={!active && queued.length === 0} onClick={() => stopChannelTurn(channel.id)}>
          <Square className="size-3.5" />
          Stop
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Rename channel" onClick={() => setRenaming(true)}>
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete channel"
          data-testid="channel-delete"
          onClick={() => void deleteChannel(channel.id).then(report)}
        >
          <Trash2 className="size-4" />
        </Button>
      </header>

      {notice && (
        <div className="flex items-start gap-2 border-b border-border px-3 py-2 text-[11px] text-danger" data-testid="channel-notice">
          <span className="min-w-0 flex-1">{notice}</span>
          <button type="button" className="shrink-0 text-subtle hover:text-fg" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <div ref={scroller} data-testid="channel-transcript" className="min-h-0 flex-1 overflow-y-auto px-4 py-4 scrollbar-thin md:px-8">
        {messages.length === 0 && !active && (
          <div className="mx-auto max-w-lg py-10 text-sm text-muted">
            <p>
              #{channel.name} — {members.map((m) => m.name).join(", ") || "no members in this roster"}. Everyone here reads every line.
            </p>
            <p className="mt-2">
              Send a message: without @ <span className="text-fg">{first?.name ?? "the first member"}</span> answers; @Name pages that member;
              several @ run in order. <span className="text-fg">Run all once</span> asks everyone.
            </p>
          </div>
        )}
        <ol className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.map((m) => (
            <ChannelLine key={m.id} message={m} bots={bots} />
          ))}
          {(active || chips.length > 0) && (
            <li className="mr-4 flex gap-2.5" data-testid="channel-live">
              {activeBot && <AgentAvatar bot={activeBot} size="sm" />}
              <div className="min-w-0 flex-1">
                <ChipRow chips={chips} />
                {active && chips.length === 0 && <p className="shimmer-text text-sm">{activeBot?.name ?? "Member"} is thinking</p>}
              </div>
            </li>
          )}
          {pending && (
            <li>
              <PermissionCard req={pending} speakerName={nameOf(pending.botId) ?? ""} onDecide={(d) => decideChannelPermission(channel.id, d)} />
            </li>
          )}
        </ol>
      </div>

      <div className="border-t border-border px-3 py-3 md:px-6">
        <div className="mx-auto max-w-2xl rounded-xl bg-surface p-2 shadow-[0_0_0_1px_var(--color-border)]">
          <textarea
            ref={textarea}
            value={composer}
            onChange={(e) => setUi({ composer: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(composer);
              }
            }}
            rows={1}
            data-testid="channel-composer"
            placeholder={`Message #${channel.name} — @member to page`}
            className="block w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-5 text-fg placeholder:text-subtle focus-visible:outline-none scrollbar-thin"
          />
          <div className="flex items-center justify-between px-1">
            <MemberMentionHint members={members} />
            <Button size="sm" disabled={!composer.trim()} onClick={() => send(composer)} data-testid="channel-send">
              Send
            </Button>
          </div>
        </div>
        <p className="mx-auto mt-2 max-w-2xl font-mono text-[10px] text-subtle">
          channels/{channel.id}.json · shared thread, outside every scope · each member keeps its own Harness session
        </p>
      </div>
    </section>
  );
}

function ChannelLine({ message: m, bots }: { message: ChannelMessage; bots: Bot[] }) {
  if (m.role === "system") {
    return (
      <li data-role="system" className="mr-4">
        <p className="font-mono text-[11px] text-subtle">{m.content}</p>
      </li>
    );
  }
  if (m.role === "user") {
    return (
      <li data-role="user" className="ml-8">
        <div className="rounded-lg bg-raised px-3.5 py-2.5 shadow-[0_0_0_1px_var(--color-border)]">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
        </div>
      </li>
    );
  }
  const speaker = m.speakerId ? bots.find((b) => b.id === m.speakerId) ?? null : null;
  return (
    <li data-role="assistant" data-speaker-id={m.speakerId ?? ""} className="mr-4 flex gap-2.5">
      {speaker ? (
        <AgentAvatar bot={speaker} size="sm" />
      ) : (
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-raised text-subtle">
          <Hash className="size-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="mb-1 font-mono text-[11px] text-muted" data-testid="channel-speaker">
          {speaker?.name ?? m.speakerId ?? "member"}
        </p>
        {m.chips && m.chips.length > 0 && <ChipRow chips={m.chips as ToolChip[]} />}
        <ChatMarkdown text={m.content} />
      </div>
    </li>
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
            c.status === "denied" ? "text-danger" : c.status === "running" ? "text-accent" : "text-muted"
          }`}
        >
          <ChipIcon kind={c.kind} />
          {c.label}
          <span className="max-w-[180px] truncate font-mono text-[10px] text-subtle">{c.detail}</span>
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

/** Per-agent: the same three answers as the 1:1 card, for the member whose turn asked. */
function PermissionCard({ req, speakerName, onDecide }: { req: PermissionRequest; speakerName: string; onDecide: (d: PermissionDecision) => void }) {
  return (
    <div className="rounded-xl bg-raised p-4 shadow-[0_0_0_1px_var(--color-border-strong)]" data-testid="channel-permission">
      <p className="font-mono text-[10px] tracking-wider text-subtle uppercase">Permission · {speakerName}</p>
      <h3 className="mt-1 text-sm font-medium">{req.summary}</h3>
      <p className="mt-1 font-mono text-xs leading-relaxed break-all text-muted">{req.detail}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => onDecide("deny")}>
          Deny
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onDecide("allow-once")}>
          Allow once
        </Button>
        <Button size="sm" onClick={() => onDecide("allow-chat")}>
          Allow for {speakerName || "this agent"}
        </Button>
      </div>
    </div>
  );
}

/** `@` picker: members of THIS channel only (the 1:1 picker lists everyone; that one hands off). */
function MemberMentionHint({ members }: { members: Bot[] }) {
  const composer = useLocalBot((s) => s.ui.composer);
  const setUi = useLocalBot((s) => s.setUi);
  const at = composer.lastIndexOf("@");
  if (at < 0) return <span />;
  const q = composer.slice(at + 1).split(/\s/)[0] ?? "";
  if (composer.slice(at).includes(" ") && q.length === 0) return <span />;
  const matches = members.filter((b) => b.name.toLowerCase().startsWith(q.toLowerCase()));
  if (matches.length === 0) return <span className="px-1 font-mono text-[11px] text-subtle">not a member</span>;
  return (
    <div className="flex gap-1" data-testid="channel-mention-hint">
      {matches.slice(0, 4).map((b) => (
        <button
          key={b.id}
          type="button"
          className="rounded-sm px-1.5 py-0.5 font-mono text-[11px] text-accent hover:bg-hover"
          onClick={() => setUi({ composer: composer.slice(0, at) + `@${b.name} ` })}
        >
          @{b.name}
        </button>
      ))}
    </div>
  );
}

function InlineName({ initial, onDone }: { initial: string; onDone: (next: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (commit: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const next = value.trim();
    onDone(commit && next ? next : null);
  };
  return (
    <form
      className="flex items-center"
      onSubmit={(e) => {
        e.preventDefault();
        finish(true);
      }}
    >
      <input
        ref={ref}
        aria-label="Rename channel"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
          }
        }}
        maxLength={60}
        className="h-7 min-w-0 flex-1 rounded-sm bg-bg px-1.5 text-sm text-fg outline-none ring-1 ring-border focus:ring-accent"
      />
    </form>
  );
}

function MenuItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.currentTarget.closest("details")?.removeAttribute("open");
        onClick();
      }}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-hover"
    >
      {children}
    </button>
  );
}
