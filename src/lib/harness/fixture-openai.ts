/**
 * Test double for the local model server: a tiny OpenAI-compatible `/v1`
 * on loopback that answers `/v1/chat/completions` from a scripted scenario.
 *
 * It exists so `npm test` can drive the real DeepSeek Harness ACP process
 * through a real tool call without a GGUF on disk. It is not used by the app.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export type FixtureToolCall = { name: string; args: Record<string, unknown> };

export type FixtureReply =
  | { kind: "text"; text: string; delayMs?: number }
  | { kind: "tool"; calls: FixtureToolCall[]; text?: string; delayMs?: number };

export type FixtureMessage = {
  role: string;
  content?: unknown;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

/** Decide the next assistant reply from the messages the harness sent. */
export type FixtureScenario = (messages: FixtureMessage[], requestIndex: number) => FixtureReply;

export type FixtureServer = {
  url: string;
  port: number;
  requests: { messages: FixtureMessage[]; tools: string[] }[];
  close: () => Promise<void>;
};

/** Default scenario: one `write` tool call, then a short final answer. */
export function writeThenDone(filePath: string, content: string): FixtureScenario {
  return (messages) => {
    // Per turn, not per session: the Harness replays history, so look at what
    // the model is being asked to continue from right now.
    const last = messages.at(-1);
    const sawToolResult = last?.role === "tool";
    if (!sawToolResult) {
      return { kind: "tool", calls: [{ name: "write", args: { file_path: filePath, content } }] };
    }
    return { kind: "text", text: `Wrote ${filePath}.` };
  };
}

function sse(res: http.ServerResponse, obj: unknown) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export async function startFixtureOpenAI(scenario: FixtureScenario): Promise<FixtureServer> {
  const requests: FixtureServer["requests"] = [];
  const server = http.createServer(async (req, res) => {
    const url = req.url ?? "/";
    if (req.method === "GET" && url.startsWith("/v1/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: "local", object: "model" }] }));
      return;
    }
    if (req.method === "GET" && url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (req.method !== "POST" || !url.startsWith("/v1/chat/completions")) {
      res.writeHead(404);
      res.end();
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}") as {
      messages?: FixtureMessage[];
      tools?: { function?: { name?: string } }[];
      stream?: boolean;
      model?: string;
    };
    const messages = body.messages ?? [];
    const tools = (body.tools ?? []).map((t) => t.function?.name ?? "").filter(Boolean);
    requests.push({ messages, tools });
    const reply = scenario(messages, requests.length - 1);
    if (reply.delayMs) {
      let timer: NodeJS.Timeout | undefined;
      const gone = new Promise<"closed">((r) => req.on("close", () => r("closed")));
      const waited = new Promise<"waited">((r) => {
        timer = setTimeout(() => r("waited"), reply.delayMs);
      });
      const outcome = await Promise.race([gone, waited]);
      clearTimeout(timer);
      if (outcome === "closed") {
        res.destroy();
        return;
      }
    }
    const id = `chatcmpl-fixture-${requests.length}`;
    const created = Math.floor(Date.now() / 1000);
    const model = body.model ?? "local";

    const toolCalls =
      reply.kind === "tool"
        ? reply.calls.map((c, i) => ({
            id: `call_fixture_${requests.length}_${i}`,
            type: "function" as const,
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          }))
        : [];
    const text = reply.kind === "text" ? reply.text : (reply.text ?? "");
    const finish = reply.kind === "tool" ? "tool_calls" : "stop";
    const usage = { prompt_tokens: 32, completion_tokens: 16, total_tokens: 48 };

    if (body.stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const base = { id, object: "chat.completion.chunk", created, model };
      sse(res, { ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] });
      if (text) {
        sse(res, { ...base, choices: [{ index: 0, delta: { content: text }, finish_reason: null }] });
      }
      toolCalls.forEach((tc, i) => {
        sse(res, {
          ...base,
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: i, id: tc.id, type: "function", function: { name: tc.function.name, arguments: "" } }],
              },
              finish_reason: null,
            },
          ],
        });
        sse(res, {
          ...base,
          choices: [
            {
              index: 0,
              delta: { tool_calls: [{ index: i, function: { arguments: tc.function.arguments } }] },
              finish_reason: null,
            },
          ],
        });
      });
      sse(res, { ...base, choices: [{ index: 0, delta: {}, finish_reason: finish }], usage });
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id,
        object: "chat.completion",
        created,
        model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: text || null,
              ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
            },
            finish_reason: finish,
          },
        ],
        usage,
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    port,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
