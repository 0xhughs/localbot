/**
 * Isolation layer: the UI talks to this adapter, never to the model HTTP client.
 * This pass: hosted grok-4.5 via src/lib/runtime/turn.ts.
 * File tools write to the company root on the server disk.
 *
 * AbortSignal cannot be forwarded through createServerFn; Stop cancels the
 * client loop between rounds only.
 */
import { classifyToolCall, denyMessage, grantKey, type ToolCall } from "@/lib/permissions";
import { grantPathFor } from "@/lib/fs/company";
import { fsRead, fsTree } from "@/lib/fs/server";
import { runHarnessTurn, type TurnMessage, type TurnToolCall } from "@/lib/runtime/turn";
import { buildSystemPrompt, rosterBlurb } from "@/lib/runtime/prompt";
import { resolveBot, useLocalBot } from "@/lib/store";
import type { PermissionDecision, PermissionRequest, ToolChip } from "@/lib/types";
import { uid } from "@/lib/utils";

export type AdapterEvents = {
  onChip: (chip: ToolChip) => void;
  onChipUpdate: (id: string, patch: Partial<ToolChip>) => void;
  askPermission: (req: PermissionRequest) => Promise<PermissionDecision>;
};

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function executeTool(botId: string, call: ToolCall): Promise<string> {
  const s = useLocalBot.getState();
  switch (call.name) {
    case "read_file": {
      const path = String(call.args.path ?? "");
      const r = await s.readBotFile(botId, path);
      return r.ok ? r.content : r.error;
    }
    case "write_file": {
      const path = String(call.args.path ?? "");
      const content = String(call.args.content ?? "");
      const r = await s.writeBotFile(botId, path, content);
      return r.ok ? `Wrote ${path} (${content.length} chars)` : r.error;
    }
    case "str_replace": {
      const path = String(call.args.path ?? "");
      const r = await s.replaceBotFile(
        botId,
        path,
        String(call.args.old_string ?? ""),
        String(call.args.new_string ?? ""),
      );
      return r.ok ? `Edited ${path}` : r.error;
    }
    case "list_dir": {
      const path = String(call.args.path ?? "");
      const r = await s.listBotDir(botId, path);
      return r.ok ? r.listing : r.error;
    }
    case "delete_file": {
      const path = String(call.args.path ?? "");
      const r = await s.deleteBotFile(botId, path);
      return r.ok ? `Deleted ${path}` : r.error;
    }
    case "run_command": {
      const command = String(call.args.command ?? "");
      const r = await s.shellBot(botId, command);
      if (!r.ok) return r.error;
      return [r.stdout, r.stderr].filter(Boolean).join("\n") || `(exit ${r.code})`;
    }
    case "web_search":
      return "Network is gated. Enable web search in Settings to use this tool.";
    default:
      return `Unknown tool: ${call.name}`;
  }
}

export async function runAgentLoop(opts: {
  botId: string;
  userText: string;
  events: AdapterEvents;
  abort: AbortSignal;
}): Promise<{ stopped: boolean; error?: string }> {
  const store = useLocalBot.getState();
  const ctx = resolveBot(store, opts.botId);
  if (!ctx) return { stopped: false, error: "Unknown agent" };

  const history = (store.sessions[opts.botId]?.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-16)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const snap = useLocalBot.getState();
  const shared = ctx.bot.grants.includes("shared")
    ? grantPathFor(ctx.bot, ctx.employee, ctx.department, ctx.company, "shared")
    : null;
  const [memoryRes, standingRes, treeRes, sharedRes] = await Promise.all([
    fsRead({ data: { path: `${ctx.bot.memoryPath}/notes.md`, companyRoot: ctx.company.root } }),
    fsRead({ data: { path: `${ctx.bot.path}/AGENTS.md`, companyRoot: ctx.company.root } }),
    fsTree({ data: { path: ctx.bot.path, companyRoot: ctx.company.root, max: 60 } }),
    shared
      ? fsTree({ data: { path: shared, companyRoot: ctx.company.root, max: 40 } })
      : Promise.resolve({ ok: true as const, listing: "(not granted)" }),
  ]);

  const messages: TurnMessage[] = [
    {
      role: "system",
      content:
        buildSystemPrompt(snap, ctx.bot, {
          memory: memoryRes.ok ? memoryRes.content : "",
          standing: standingRes.ok ? standingRes.content : ctx.bot.standingInstructions,
          tree: treeRes.ok ? treeRes.listing : "(unavailable)",
          sharedTree: sharedRes.ok ? sharedRes.listing : "(unavailable)",
        }) + `\n\nOther agents:\n${rosterBlurb(snap)}`,
    },
    ...history,
  ];

  let rounds = 0;
  while (rounds < 6) {
    if (opts.abort.aborted || useLocalBot.getState().sessions[opts.botId]?.stopRequested) {
      return { stopped: true };
    }
    rounds += 1;
    const live = useLocalBot.getState();
    const turn = await runHarnessTurn({
      data: {
        messages,
        allowNetwork: live.settings.webSearchEnabled,
      },
    });
    if (!turn.ok) return { stopped: false, error: turn.error };

    if (turn.toolCalls.length === 0) {
      if (turn.content.trim()) {
        store.appendMessage(opts.botId, {
          role: "assistant",
          content: turn.content.trim(),
        });
      }
      return { stopped: false };
    }

    messages.push({
      role: "assistant",
      content: turn.content ?? "",
      tool_calls: turn.toolCalls,
    });

    for (const tc of turn.toolCalls) {
      if (opts.abort.aborted) return { stopped: true };
      const result = await handleOneTool(opts.botId, tc, opts.events);
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      });
    }
  }

  store.appendMessage(opts.botId, {
    role: "assistant",
    content: "Stopped after too many tool rounds. Ask me to continue.",
  });
  return { stopped: false };
}

async function handleOneTool(
  botId: string,
  tc: TurnToolCall,
  events: AdapterEvents,
): Promise<string> {
  const snap = useLocalBot.getState();
  const ctx = resolveBot(snap, botId);
  if (!ctx) return "Unknown agent";
  const args = parseArgs(tc.arguments);
  const call: ToolCall = { name: tc.name, args };
  const cls = classifyToolCall(call, {
    bot: ctx.bot,
    employee: ctx.employee,
    department: ctx.department,
    company: ctx.company,
    webSearchEnabled: snap.settings.webSearchEnabled,
    controlThisComputer: snap.settings.controlThisComputer,
  });

  const chipId = uid("chip");
  events.onChip({
    id: chipId,
    kind: cls.kind,
    label: cls.summary,
    detail: cls.detail,
    status: "running",
  });

  let decision: PermissionDecision = "allow-once";
  if (cls.alwaysAsk) {
    const key = grantKey(cls);
    if (snap.hasChatGrant(botId, key) || snap.hasChatGrant(botId, cls.kind)) {
      decision = "allow-chat";
    } else {
      const req: PermissionRequest = {
        id: uid("perm"),
        botId,
        tool: tc.name,
        kind: cls.kind,
        summary: cls.summary,
        detail: cls.detail,
        path: cls.path,
        alwaysAsk: true,
      };
      decision = await events.askPermission(req);
      if (decision === "allow-chat") {
        useLocalBot.getState().addChatGrant(botId, key);
        useLocalBot.getState().addChatGrant(botId, cls.kind);
      }
    }
  }

  if (decision === "deny" || !cls.allowedByGrant) {
    events.onChipUpdate(chipId, { status: "denied" });
    return denyMessage(cls);
  }

  const output = await executeTool(botId, call);
  const denied = output.startsWith("Denied");
  events.onChipUpdate(chipId, { status: denied ? "denied" : "ok" });
  return output;
}
