import childProcess, { type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { llamaBinDir, loadConfig } from "../fs/disk.ts";
import { getCatalogModel, requiredMemoryGb } from "../catalog.ts";
import { LOOPBACK_HOST, LOOPBACK_PORT, LOCAL_OPENAI_BASE_URL, assertLoopbackOnly } from "../../runtime/loopback.ts";
import type { TurnInput, TurnOutput, TurnToolCall } from "./turn-types.ts";
import { findReadyModel } from "./models.ts";

const LLAMA_RELEASE = "b10749";
const TARBALL: Record<string, string> = {
  "linux-x64": `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RELEASE}/llama-${LLAMA_RELEASE}-bin-ubuntu-x64.tar.gz`,
  "darwin-arm64": `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RELEASE}/llama-${LLAMA_RELEASE}-bin-macos-arm64.tar.gz`,
  "darwin-x64": `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RELEASE}/llama-${LLAMA_RELEASE}-bin-macos-x64.tar.gz`,
};

let child: ChildProcess | null = null;
let loadedPath: string | null = null;

function platformKey(): string {
  const p = os.platform();
  const a = os.arch();
  if (p === "linux" && a === "x64") return "linux-x64";
  if (p === "darwin" && a === "arm64") return "darwin-arm64";
  if (p === "darwin") return "darwin-x64";
  return `${p}-${a}`;
}

export function llamaServerBin(): string {
  return path.join(llamaBinDir(), "llama-server");
}

export async function pingLocal(url = `http://${LOOPBACK_HOST}:${LOOPBACK_PORT}/health`): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pingOllama(): Promise<boolean> {
  try {
    const res = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(800),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function engineStatus(): {
  ready: boolean;
  engine: string;
  model: string;
  ggufPath: string | null;
  loopback: string | null;
  ramEstimate: string;
  badge: string;
  error?: string;
} {
  const ready = findReadyModel();
  if (ready) {
    const model = getCatalogModel(ready.catalogId);
    const ram = model ? `~${requiredMemoryGb(model).toFixed(1)} GB` : "—";
    return {
      ready: true,
      engine: "llama.cpp",
      model: ready.name,
      ggufPath: ready.path,
      loopback: LOCAL_OPENAI_BASE_URL,
      ramEstimate: ram,
      badge: `Local ${ready.name}`,
    };
  }
  return {
    ready: false,
    engine: "none",
    model: "",
    ggufPath: null,
    loopback: null,
    ramEstimate: "—",
    badge: "Local model not ready",
    error: "No GGUF registered. Download or import a model.",
  };
}

async function waitForHealth(ms = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await pingLocal()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

export async function ensureLlamaBinary(): Promise<{ ok: true; bin: string } | { ok: false; error: string }> {
  const bin = llamaServerBin();
  if (fs.existsSync(bin)) return { ok: true, bin };
  const key = platformKey();
  const url = TARBALL[key];
  if (!url) {
    return {
      ok: false,
      error: `No llama.cpp binary for ${key}. Place llama-server in ${llamaBinDir()}.`,
    };
  }
  const dir = llamaBinDir();
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const tarPath = path.join(path.dirname(dir), `llama-${LLAMA_RELEASE}.tar.gz`);
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return { ok: false, error: `Failed to fetch llama.cpp binary (${res.status})` };
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tarPath, buf);
    const { execSync } = await import("node:child_process");
    execSync(`mkdir -p ${JSON.stringify(path.dirname(dir))} && tar --no-same-owner -xzf ${JSON.stringify(tarPath)} -C ${JSON.stringify(path.dirname(dir))}`, {
      stdio: "ignore",
    });
    if (!fs.existsSync(bin)) {
      return { ok: false, error: `Extracted tarball but ${bin} is missing` };
    }
    fs.chmodSync(bin, 0o755);
    return { ok: true, bin };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function ensureLocalServer(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  assertLoopbackOnly(LOOPBACK_HOST);
  const ready = findReadyModel();
  if (!ready) {
    return { ok: false, error: "Local model not ready. Download or import a GGUF first." };
  }
  if (await pingLocal()) {
    loadedPath = ready.path;
    return { ok: true, url: LOCAL_OPENAI_BASE_URL };
  }
  const bin = await ensureLlamaBinary();
  if (!bin.ok) return bin;
  const model = getCatalogModel(ready.catalogId);
  const totalGb = os.totalmem() / 1024 ** 3;
  const ctxCap = totalGb < 8 ? 1024 : 4096;
  const ctx = Math.max(512, Math.min(ctxCap, (model?.contextK ?? 4) * 1024));
  const args = [
    "-m",
    ready.path,
    "--host",
    LOOPBACK_HOST,
    "--port",
    String(LOOPBACK_PORT),
    "-c",
    String(ctx),
    "-t",
    String(Math.max(1, Math.min(4, os.cpus().length))),
    "--n-gpu-layers",
    "0",
    "--jinja",
  ];
  child = childProcess.spawn(bin.bin, args, {
    env: { ...process.env, LD_LIBRARY_PATH: llamaBinDir() },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr?.on("data", () => undefined);
  child.on("exit", () => {
    child = null;
    loadedPath = null;
  });
  const ok = await waitForHealth(90000);
  if (!ok) {
    child?.kill();
    child = null;
    return { ok: false, error: "llama-server failed to start. Local model not ready." };
  }
  loadedPath = ready.path;
  return { ok: true, url: LOCAL_OPENAI_BASE_URL };
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a UTF-8 file from the granted folders.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write a UTF-8 file, creating parent folders as needed.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "str_replace",
      description: "Replace the first occurrence of old_string in a file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List a directory tree (granted folders only).",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file or folder. Always requires user permission.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Run a workspace shell command (ls, cat, mkdir, touch, rm, echo, mv, cp, head, pwd). Always requires permission.",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web. Only when the user enabled network.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
] as const;

function openaiMessages(data: TurnInput) {
  return data.messages.map((m) => {
    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
      return {
        role: "assistant" as const,
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    if (m.role === "tool") {
      return { role: "tool" as const, tool_call_id: m.tool_call_id, content: m.content };
    }
    return { role: m.role, content: m.content };
  });
}

async function postChat(url: string, body: unknown): Promise<TurnOutput> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `Local engine HTTP ${res.status}${t ? `: ${t.slice(0, 240)}` : ""}` };
  }
  const json = (await res.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: { id: string; function: { name: string; arguments: string } }[];
      };
    }[];
  };
  const message = json.choices?.[0]?.message;
  const toolCalls: TurnToolCall[] = (message?.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments,
  }));
  return { ok: true, content: message?.content ?? "", toolCalls };
}

export async function runLocalTurn(data: TurnInput): Promise<TurnOutput> {
  const cfg = loadConfig();
  const tools = data.allowNetwork ? TOOLS : TOOLS.filter((t) => t.function.name !== "web_search");
  const messages = openaiMessages(data);

  if (cfg.useExistingOllama && (await pingOllama())) {
    return postChat("http://127.0.0.1:11434/v1/chat/completions", {
      model: "llama3.2",
      max_tokens: 800,
      temperature: 0.4,
      tools,
      tool_choice: "auto",
      messages,
    });
  }

  const server = await ensureLocalServer();
  if (!server.ok) {
    return { ok: false, error: server.error };
  }

  return postChat(`${server.url}/chat/completions`, {
    model: "local",
    max_tokens: 800,
    temperature: 0.4,
    tools,
    tool_choice: "auto",
    messages,
  });
}

