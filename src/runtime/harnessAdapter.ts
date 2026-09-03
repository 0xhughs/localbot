/**
 * Thin ACP client for the chat pane. The agent loop is DeepSeek Harness's
 * (`dsh --profile acp`, owned by the sidecar); this file only:
 *
 *   - starts a turn (`harnessPrompt` → ACP session/new|resume + session/prompt)
 *   - polls committed ACP updates (`harnessPoll`) and maps them onto the
 *     existing tool chips and assistant text
 *   - answers ACP session/request_permission through the existing
 *     Allow once / Allow for this chat / Deny cards (`harnessDecide`)
 *   - turns Stop into ACP session/cancel (`harnessCancel`)
 *
 * No model call, no tool execution, no round limit lives here. File tools run
 * inside the Harness through LocalBot's scoped filesystem, which resolves
 * every path with `resolveScopePath` on the sidecar.
 */
import { harnessCancel, harnessDecide, harnessPoll, harnessPrompt } from "@/lib/runtime/harness";
import type { TurnEvent } from "@/lib/harness/turns";
import { resolveBot, useLocalBot } from "@/lib/store";
import type { PermissionDecision, PermissionRequest, ToolChip, ToolKind } from "@/lib/types";
import { uid } from "@/lib/utils";

export type AdapterEvents = {
  onChip: (chip: ToolChip) => void;
  onChipUpdate: (id: string, patch: Partial<ToolChip>) => void;
  askPermission: (req: PermissionRequest) => Promise<PermissionDecision>;
};

export const POLL_MS = 250;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** ACP tool kind + Harness title → the chip vocabulary the UI already has. */
export function chipKind(kind: string, title: string): ToolKind {
  const t = title.toLowerCase();
  if (t.startsWith("write")) return "write";
  if (t.startsWith("edit") || t.startsWith("str_replace")) return "edit";
  if (t.startsWith("bash") || kind === "execute") return "shell";
  if (kind === "delete") return "delete";
  if (kind === "fetch") return "network";
  if (kind === "edit") return "edit";
  return "read";
}

export function chipLabel(title: string, path?: string): string {
  const verb = title.split(/\s+/)[0] ?? title;
  const pretty = verb.charAt(0).toUpperCase() + verb.slice(1);
  return path && !title.includes(path) ? `${pretty} ${path}` : title.charAt(0).toUpperCase() + title.slice(1);
}

export function chipStatus(status?: string): ToolChip["status"] {
  if (status === "completed") return "ok";
  if (status === "failed") return "error";
  return "running";
}

/** Pick the ACP option that matches the card's decision. `null` = cancelled. */
export function optionFor(
  decision: PermissionDecision,
  options: { optionId: string; kind: string }[],
): string | null {
  const byKind = (k: string) => options.find((o) => o.kind === k)?.optionId;
  if (decision === "deny") return byKind("reject_once") ?? byKind("reject_always") ?? null;
  if (decision === "allow-chat") return byKind("allow_always") ?? byKind("allow_once") ?? options[0]?.optionId ?? null;
  return byKind("allow_once") ?? byKind("allow_always") ?? options[0]?.optionId ?? null;
}

export function grantKeyFor(kind: ToolKind): string {
  return `acp:${kind}`;
}

export async function runAgentTurn(opts: {
  botId: string;
  userText: string;
  events: AdapterEvents;
  abort: AbortSignal;
}): Promise<{ stopped: boolean; error?: string }> {
  const store = useLocalBot.getState();
  const ctx = resolveBot(store, opts.botId);
  if (!ctx) return { stopped: false, error: "Unknown agent" };
  if (!store.folders) {
    return { stopped: false, error: "Folders are not set up. Open Settings → Folders." };
  }

  const started = await harnessPrompt({ data: { agentName: ctx.bot.name, text: opts.userText } });
  if (!started.ok) return { stopped: false, error: started.error };
  const turnId = started.turnId;

  let cancelled = false;
  const onAbort = () => {
    if (cancelled) return;
    cancelled = true;
    void harnessCancel({ data: { turnId } });
  };
  if (opts.abort.aborted) onAbort();
  else opts.abort.addEventListener("abort", onAbort, { once: true });

  let after = 0;
  let text = "";
  const chips = new Map<string, string>();

  const flush = () => {
    if (text.trim()) {
      useLocalBot.getState().appendMessage(opts.botId, { role: "assistant", content: text.trim() });
    }
    text = "";
  };

  const handle = async (ev: TurnEvent) => {
    switch (ev.type) {
      case "text":
        text += ev.text;
        break;
      case "tool": {
        flush();
        const id = uid("chip");
        chips.set(ev.toolCallId, id);
        opts.events.onChip({
          id,
          kind: chipKind(ev.kind, ev.title),
          label: chipLabel(ev.title),
          detail: ev.path ?? "",
          status: chipStatus(ev.status),
        });
        break;
      }
      case "tool_update": {
        const id = chips.get(ev.toolCallId);
        if (!id) break;
        const patch: Partial<ToolChip> = {};
        if (ev.status) patch.status = chipStatus(ev.status);
        if (ev.title) patch.label = chipLabel(ev.title.split(/\s+/)[0] ?? ev.title);
        opts.events.onChipUpdate(id, patch);
        break;
      }
      case "permission": {
        const kind = chipKind(ev.kind, ev.title);
        const live = useLocalBot.getState();
        const key = grantKeyFor(kind);
        let decision: PermissionDecision;
        if (live.hasChatGrant(opts.botId, key)) {
          decision = "allow-chat";
        } else {
          decision = await opts.events.askPermission({
            id: uid("perm"),
            botId: opts.botId,
            tool: ev.title.split(/\s+/)[0] ?? ev.title,
            kind,
            summary: chipLabel(ev.title, ev.path),
            detail: ev.path ?? (typeof ev.rawInput === "object" ? JSON.stringify(ev.rawInput) : ""),
            path: ev.path,
            alwaysAsk: true,
          });
          if (decision === "allow-chat") useLocalBot.getState().addChatGrant(opts.botId, key);
        }
        const chipId = chips.get(ev.toolCallId);
        if (decision === "deny" && chipId) opts.events.onChipUpdate(chipId, { status: "denied" });
        await harnessDecide({ data: { turnId, requestId: ev.requestId, optionId: optionFor(decision, ev.options) } });
        break;
      }
      default:
        break;
    }
  };

  try {
    for (;;) {
      const p = await harnessPoll({ data: { turnId, after } });
      if (!p.ok) {
        flush();
        return { stopped: cancelled, error: p.error };
      }
      for (const ev of p.events) {
        after = ev.seq;
        await handle(ev);
      }
      if (p.status === "error") {
        flush();
        return { stopped: cancelled, error: p.error ?? "DeepSeek Harness reported an error." };
      }
      if (p.status === "done") {
        flush();
        return { stopped: cancelled || p.stopReason === "cancelled" };
      }
      if (!cancelled && useLocalBot.getState().sessions[opts.botId]?.stopRequested) onAbort();
      await sleep(POLL_MS);
    }
  } finally {
    opts.abort.removeEventListener("abort", onAbort);
  }
}
