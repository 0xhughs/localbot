/**
 * Isolation layer: the UI talks to this adapter, never to model plugins.
 * Desktop builds point the model plugin at http://127.0.0.1:18789/v1.
 * This web workspace uses the same event shape.
 */
import { classifyToolCall, denyMessage, grantKey, type ToolCall } from "@/lib/permissions";
import { runHarnessTurn, type TurnMessage, type TurnToolCall } from "@/lib/runtime/turn";
import { buildSystemPrompt, rosterBlurb } from "@/lib/runtime/prompt";
import { resolveBot, useLocalBot } from "@/lib/store";
import { writeFile } from "@/lib/fs/vfs";
import type { PermissionDecision, PermissionRequest, ToolChip } from "@/lib/types";
import { uid } from "@/lib/utils";
import { LOCAL_OPENAI_BASE_URL } from "./loopback";

export const HARNESS_MODEL_ENDPOINT = LOCAL_OPENAI_BASE_URL;

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

function executeTool(botId: string, call: ToolCall): string {
  const s = useLocalBot.getState();
  switch (call.name) {
    case "read_file": {
      const path = String(call.args.path ?? "");
      const r = s.readBotFile(botId, path);
      return r.ok ? r.content : r.error;
    }
    case "write_file": {
      const path = String(call.args.path ?? "");
      const content = String(call.args.content ?? "");
      const r = s.writeBotFile(botId, path, content);
      return r.ok ? `Wrote ${path} (${content.length} chars)` : r.error;
    }
    case "str_replace": {
      const path = String(call.args.path ?? "");
      const r = s.replaceBotFile(
        botId,
        path,
        String(call.args.old_string ?? ""),
        String(call.args.new_string ?? ""),
      );
      return r.ok ? `Edited ${path}` : r.error;
    }
    case "list_dir": {
      const path = String(call.args.path ?? "");
      const r = s.listBotDir(botId, path);
      return r.ok ? r.listing : r.error;
    }
    case "delete_file": {
      const path = String(call.args.path ?? "");
      const r = s.deleteBotFile(botId, path);
      return r.ok ? `Deleted ${path}` : r.error;
    }
    case "run_command": {
      const command = String(call.args.command ?? "");
      const r = s.shellBot(botId, command);
      if (!r.ok) return r.error;
      return [r.stdout, r.stderr].filter(Boolean).join("\n") || `(exit ${r.code})`;
    }
    case "web_search":
      return "Network is gated. Enable web search in Settings to use this tool on the desktop runtime.";
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

  const messages: TurnMessage[] = [
    {
      role: "system",
      content:
        buildSystemPrompt(useLocalBot.getState(), ctx.bot) +
        `\n\nOther agents:\n${rosterBlurb(useLocalBot.getState())}`,
    },
    ...history,
  ];

  let rounds = 0;
  while (rounds < 6) {
    if (opts.abort.aborted || useLocalBot.getState().sessions[opts.botId]?.stopRequested) {
      return { stopped: true };
    }
    rounds += 1;
    const snap = useLocalBot.getState();
    const turn = await runHarnessTurn({
      data: {
        messages,
        allowNetwork: snap.settings.webSearchEnabled,
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
      persistTranscript(opts.botId);
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
  persistTranscript(opts.botId);
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

  const output = executeTool(botId, call);
  const denied = output.startsWith("Denied");
  events.onChipUpdate(chipId, { status: denied ? "denied" : "ok" });
  return output;
}

function persistTranscript(botId: string) {
  const s = useLocalBot.getState();
  const bot = s.bots.find((b) => b.id === botId);
  if (!bot) return;
  const sess = s.sessions[botId];
  if (!sess) return;
  const path = `${s.localbotHome}/sessions/${botId}/transcript.json`;
  const body = JSON.stringify(
    {
      botId,
      name: bot.name,
      updatedAt: new Date().toISOString(),
      messages: sess.messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    },
    null,
    2,
  );
  s.applyVfs((vfs) => writeFile(vfs, path, body));
}
