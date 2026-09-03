/**
 * Sidecar-owned DeepSeek Harness process.
 *
 * Spawns the pinned `@deepseek-ai/dsh` as `dsh --profile acp --patch
 * dsh/localbot-acp.cordis.yml` with an isolated `DSH_HOME` under the LocalBot
 * data dir, and speaks the official Agent Client Protocol to it over stdio
 * with `@agentclientprotocol/sdk`. One process serves every LocalBot agent
 * (one ACP session per agent).
 *
 * The renderer never sees this class; it goes through the server functions in
 * `src/lib/runtime/harness.ts`. The model server is *not* started here —
 * `ensureLocalServer` (llama.cpp on 127.0.0.1:18789) stays where it was.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import {
  ClientSideConnection,
  ndJsonStream,
  type Client,
  type InitializeResponse,
  type NewSessionResponse,
  type PromptResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type ResumeSessionResponse,
  type SessionNotification,
} from "@agentclientprotocol/sdk";

export const DSH_PIN = "0.1.2-alpha.5";
export const ACP_SDK_PIN = "1.4.0";
export const LOCAL_PROVIDER_NAME = "localbot-llama";
/** pi-ai's OpenAI client requires a key-shaped value. This is not a credential. */
export const LOCAL_PLACEHOLDER_KEY = "localbot-no-key";

export type HarnessLaunchOptions = {
  /** LocalBot data dir (where localbot-config.json lives). */
  dataDir: string;
  /** Isolated Harness home. Default `{dataDir}/dsh-home`. */
  dshHome?: string;
  /** OpenAI-compatible base URL of the local model server. */
  llamaBaseUrl: string;
  /** Model id sent on the wire (llama.cpp ignores it). */
  model?: string;
  modelName?: string;
  contextTokens?: number;
  maxTokens?: number;
  /** Directory holding localbot-acp.cordis.yml + localbot-fs.mjs. Default `{cwd}/dsh`. */
  dshDir?: string;
  /** Node binary used to launch dsh. Default: the sidecar's own Node. */
  nodeBin?: string;
  hooks: HarnessClientHooks;
};

export type HarnessClientHooks = {
  onSessionUpdate: (n: SessionNotification) => void;
  onRequestPermission: (p: RequestPermissionRequest) => Promise<RequestPermissionResponse>;
  onExit?: (code: number | null, stderrTail: string) => void;
};

const req = createRequire(import.meta.url);

export function dshBinPath(): string {
  try {
    return req.resolve("@deepseek-ai/dsh/lib/bin.js");
  } catch {
    return path.join(process.cwd(), "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  }
}

export function defaultDshDir(): string {
  if (process.env.LOCALBOT_DSH_DIR) return path.resolve(process.env.LOCALBOT_DSH_DIR);
  return path.join(process.cwd(), "dsh");
}

export function dshHomeFor(dataDir: string): string {
  return path.join(dataDir, "dsh-home");
}

/**
 * dsh 0.1.2-alpha.5 needs Node >= 22.15: `dsh-session-persistence-jsonl`
 * imports the zstd API from `node:zlib`, which older 22.x does not have
 * (upstream declares `^22.19.0 || >=24`). Electron 36 embeds Node 22.14.
 */
export const HARNESS_MIN_NODE = [22, 15, 0] as const;

export function nodeVersionOk(version: string): boolean {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!m) return false;
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [a, b, c] = HARNESS_MIN_NODE;
  if (maj !== a) return maj > a;
  if (min !== b) return min > b;
  return pat >= c;
}

function nodeVersionOf(bin: string): string | null {
  try {
    const { execFileSync } = req("node:child_process") as typeof import("node:child_process");
    return execFileSync(bin, ["--version"], { encoding: "utf8", timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

/**
 * The Node that launches dsh. Order: `LOCALBOT_DSH_NODE`, the sidecar's own
 * Node if new enough, then a newer Node from nvm in the home directory (dev
 * convenience). Never `node` from PATH blindly. Returns an error instead of
 * a binary when nothing qualifies — the caller must not fall back to a fake
 * loop.
 */
export function findHarnessNode(): { ok: true; bin: string; version: string } | { ok: false; error: string } {
  const explicit = process.env.LOCALBOT_DSH_NODE;
  if (explicit) {
    const v = nodeVersionOf(explicit);
    if (v && nodeVersionOk(v)) return { ok: true, bin: explicit, version: v };
    return {
      ok: false,
      error: `LOCALBOT_DSH_NODE=${explicit} is ${v ?? "not runnable"}; DeepSeek Harness ${DSH_PIN} needs Node >= ${HARNESS_MIN_NODE.join(".")}.`,
    };
  }
  const own = `v${process.versions.node}`;
  if (nodeVersionOk(own)) return { ok: true, bin: process.execPath, version: own };
  const candidates: string[] = [];
  try {
    const os = req("node:os") as typeof import("node:os");
    const nvm = path.join(os.homedir(), ".nvm", "versions", "node");
    for (const d of fs.readdirSync(nvm)) {
      const bin = path.join(nvm, d, "bin", process.platform === "win32" ? "node.exe" : "node");
      if (nodeVersionOk(d) && fs.existsSync(bin)) candidates.push(bin);
    }
  } catch {
    /* no nvm */
  }
  candidates.sort().reverse();
  for (const bin of candidates) {
    const v = nodeVersionOf(bin);
    if (v && nodeVersionOk(v)) return { ok: true, bin, version: v };
  }
  return {
    ok: false,
    error:
      `This Node is ${own}; DeepSeek Harness ${DSH_PIN} needs Node >= ${HARNESS_MIN_NODE.join(".")} ` +
      `(node:zlib zstd used by @deepseek-ai/dsh-session-persistence-jsonl). ` +
      `Run LocalBot with a newer Node or set LOCALBOT_DSH_NODE to one. No fallback loop is used.`,
  };
}

/** Second overlay: the fs plugin row with a literal file URL (the loader does not interpolate `name`). */
export function writePluginOverlay(dshHome: string, dshDir: string): string {
  const pluginUrl = pathToFileURL(path.join(dshDir, "localbot-fs.mjs")).href;
  const file = path.join(dshHome, "localbot-fs-plugin.patch.yml");
  fs.mkdirSync(dshHome, { recursive: true });
  fs.writeFileSync(
    file,
    [
      "# Generated by LocalBot at launch. Inserts the scoped ctx.fs provider.",
      "- insert:",
      "    - id: fs-localbot",
      `      name: ${JSON.stringify(pluginUrl)}`,
      "",
    ].join("\n"),
    "utf8",
  );
  return file;
}

/** Environment for the Harness child. Hosted keys are stripped on purpose. */
export function harnessEnv(opts: HarnessLaunchOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of ["DEEPSEEK_API_KEY", "XAI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ELECTRON_RUN_AS_NODE"]) {
    delete env[k];
  }
  env.DSH_HOME = opts.dshHome ?? dshHomeFor(opts.dataDir);
  env.DSH_TELEMETRY_MODE = "off";
  env.LOCALBOT_DATA_DIR = opts.dataDir;
  env.LOCALBOT_LLAMA_BASE_URL = opts.llamaBaseUrl;
  env.LOCALBOT_LLAMA_MODEL = opts.model ?? "local";
  env.LOCALBOT_LLAMA_MODEL_NAME = opts.modelName ?? "Local GGUF (llama.cpp)";
  env.LOCALBOT_LLAMA_CONTEXT = String(opts.contextTokens ?? 4096);
  env.LOCALBOT_LLAMA_MAX_TOKENS = String(opts.maxTokens ?? 800);
  env.LOCALBOT_LLAMA_KEY = LOCAL_PLACEHOLDER_KEY;
  return env;
}

export function harnessArgs(opts: HarnessLaunchOptions, pluginOverlay: string): string[] {
  const dshDir = opts.dshDir ?? defaultDshDir();
  return [
    "--experimental-strip-types",
    "--disable-warning=ExperimentalWarning",
    dshBinPath(),
    "--profile",
    "acp",
    "--patch",
    path.join(dshDir, "localbot-acp.cordis.yml"),
    "--patch",
    pluginOverlay,
  ];
}

export class HarnessProcess {
  private child: ChildProcess | null = null;
  private conn: ClientSideConnection | null = null;
  private stderrTail: string[] = [];
  private exited: Promise<number | null> | null = null;
  readonly opts: HarnessLaunchOptions;
  initializeResult: InitializeResponse | null = null;
  nodeBin: string | undefined;

  constructor(opts: HarnessLaunchOptions) {
    this.opts = opts;
  }

  get running(): boolean {
    return this.child !== null && this.conn !== null;
  }

  get pid(): number | undefined {
    return this.child?.pid;
  }

  stderr(): string {
    return this.stderrTail.join("\n");
  }

  async start(): Promise<InitializeResponse> {
    if (this.conn && this.initializeResult) return this.initializeResult;
    const env = harnessEnv(this.opts);
    fs.mkdirSync(env.DSH_HOME!, { recursive: true });
    let nodeBin = this.opts.nodeBin;
    if (!nodeBin) {
      const found = findHarnessNode();
      if (!found.ok) throw new Error(found.error);
      nodeBin = found.bin;
    }
    this.nodeBin = nodeBin;
    const overlay = writePluginOverlay(env.DSH_HOME!, this.opts.dshDir ?? defaultDshDir());
    const child = spawn(nodeBin, harnessArgs(this.opts, overlay), {
      cwd: env.DSH_HOME,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    child.stdin?.on("error", () => undefined);
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.trim()) continue;
        this.stderrTail.push(line);
        if (this.stderrTail.length > 60) this.stderrTail.shift();
      }
    });
    this.exited = new Promise((resolve) => {
      child.on("exit", (code) => {
        this.child = null;
        this.conn = null;
        this.initializeResult = null;
        this.opts.hooks.onExit?.(code, this.stderr());
        resolve(code);
      });
    });

    const client: Client = {
      requestPermission: (p) => this.opts.hooks.onRequestPermission(p),
      sessionUpdate: (n) => this.opts.hooks.onSessionUpdate(n),
    };
    const stream = ndJsonStream(
      Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
    );
    this.conn = new ClientSideConnection(() => client, stream);
    void this.conn.closed.catch(() => undefined);

    const init = this.conn.initialize({
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: "localbot", version: "0.1.0" },
    });
    const died = this.exited.then((code) => {
      throw new Error(`dsh exited (${code}) before ACP initialize completed.\n${this.stderr()}`);
    });
    this.initializeResult = await Promise.race([init, died]);
    return this.initializeResult;
  }

  connection(): ClientSideConnection {
    if (!this.conn) throw new Error("Harness is not running.");
    return this.conn;
  }

  async newSession(cwd: string): Promise<NewSessionResponse> {
    return this.connection().newSession({ cwd, mcpServers: [] });
  }

  async resumeSession(sessionId: string, cwd: string): Promise<ResumeSessionResponse> {
    return this.connection().resumeSession({ sessionId, cwd, mcpServers: [] });
  }

  async prompt(sessionId: string, text: string): Promise<PromptResponse> {
    return this.connection().prompt({ sessionId, prompt: [{ type: "text", text }] });
  }

  async cancel(sessionId: string): Promise<void> {
    await this.connection().cancel({ sessionId });
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.connection().closeSession({ sessionId });
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    try {
      child.stdin?.end();
    } catch {
      /* already closed */
    }
    const exited = this.exited ?? Promise.resolve(null);
    const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
    try {
      child.kill();
    } catch {
      /* gone */
    }
    await exited;
    clearTimeout(timer);
    this.child = null;
    this.conn = null;
    this.initializeResult = null;
  }
}
