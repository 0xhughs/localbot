import childProcess, { type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TurnInput, TurnOutput, TurnToolCall } from "./turn-types.ts";
import { findReadyModel } from "./models.ts";
import { llamaAssetFor } from "./llama-platform.ts";
import { llamaBinDir, llamaServerName, loadConfig } from "../fs/disk.ts";
import { getCatalogModel, requiredMemoryGb } from "../catalog.ts";
import { LOOPBACK_HOST, LOOPBACK_PORT, LOCAL_OPENAI_BASE_URL, assertLoopbackOnly } from "../../runtime/loopback.ts";

let child: ChildProcess | null = null;

export function llamaServerBin(): string {
  return path.join(llamaBinDir(), llamaServerName());
}

function walkForBinary(root: string, name: string, depth = 0): string | null {
  if (depth > 4) return null;
  const direct = path.join(root, name);
  if (fs.existsSync(direct)) return direct;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const found = walkForBinary(path.join(root, e.name), name, depth + 1);
    if (found) return found;
  }
  return null;
}

async function extractArchive(archive: string, dest: string, kind: "tar.gz" | "zip"): Promise<void> {
  fs.mkdirSync(dest, { recursive: true });
  const { execSync } = await import("node:child_process");
  if (kind === "tar.gz") {
    execSync(`tar --no-same-owner -xzf ${JSON.stringify(archive)} -C ${JSON.stringify(dest)}`, {
      stdio: "ignore",
    });
    return;
  }
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Force -Path ${JSON.stringify(archive)} -DestinationPath ${JSON.stringify(dest)}"`,
      { stdio: "ignore" },
    );
    return;
  }
  try {
    execSync(`unzip -o ${JSON.stringify(archive)} -d ${JSON.stringify(dest)}`, { stdio: "ignore" });
  } catch {
    execSync(
      `python3 -c "import zipfile; zipfile.ZipFile(${JSON.stringify(archive)}).extractall(${JSON.stringify(dest)})"`,
      { stdio: "ignore" },
    );
  }
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

/**
 * Context window handed to llama-server and declared to the Harness route.
 * The DeepSeek Harness system prompt + tool catalog is ~4.5k tokens, so the
 * floor is 8192 regardless of RAM class (KV cache for the 0.5B / 3B GGUFs at
 * 8k stays well under 0.5 GB). Larger catalog windows are capped at 16k.
 */
export const HARNESS_MIN_CONTEXT = 8192;

export function localContextTokens(model: { contextK?: number } | null | undefined): number {
  const wanted = (model?.contextK ?? 4) * 1024;
  return Math.max(HARNESS_MIN_CONTEXT, Math.min(16384, wanted));
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
  const asset = llamaAssetFor();
  if (!asset) {
    return {
      ok: false,
      error: `No llama.cpp binary for ${process.platform}-${process.arch}. Place ${llamaServerName()} in ${llamaBinDir()}.`,
    };
  }
  const dir = llamaBinDir();
  fs.mkdirSync(dir, { recursive: true });
  const archivePath = path.join(path.dirname(dir), asset.filename);
  try {
    const res = await fetch(asset.url, { redirect: "follow" });
    if (!res.ok) return { ok: false, error: `Failed to fetch llama.cpp binary (${res.status})` };
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(archivePath, buf);
    await extractArchive(archivePath, dir, asset.kind);
    let found = walkForBinary(dir, asset.binary);
    if (!found) found = walkForBinary(path.dirname(dir), asset.binary);
    if (!found) {
      return { ok: false, error: `Extracted ${asset.filename} but ${asset.binary} is missing` };
    }
    const dest = path.join(dir, asset.binary);
    if (path.resolve(found) !== path.resolve(dest)) {
      fs.copyFileSync(found, dest);
    }
    if (asset.kind !== "zip") {
      try {
        fs.chmodSync(dest, 0o755);
      } catch {
        /* windows */
      }
    }
    return { ok: true, bin: dest };
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
    return { ok: true, url: LOCAL_OPENAI_BASE_URL };
  }
  const bin = await ensureLlamaBinary();
  if (!bin.ok) return bin;
  const model = getCatalogModel(ready.catalogId);
  const ctx = localContextTokens(model);
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
    cwd: path.dirname(bin.bin),
    env: {
      ...process.env,
      LD_LIBRARY_PATH: path.dirname(bin.bin),
      DYLD_LIBRARY_PATH: path.dirname(bin.bin),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr?.on("data", () => undefined);
  child.on("exit", () => {
    child = null;
  });
  const ok = await waitForHealth(90000);
  if (!ok) {
    child?.kill();
    child = null;
    return { ok: false, error: "llama-server failed to start. Local model not ready." };
  }
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

