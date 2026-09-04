/**
 * The one llama.cpp server per installation (Stage 6).
 *
 *   - which build runs is `pickLlamaRuntime(target, gpuProbe, preference)`
 *     from `llama-platform.ts`; GPU rows unpack to `bin/{target}/{runtime}/`
 *     next to the CPU row, never over it
 *   - `--n-gpu-layers` is `gpuLayersFor(asset, probe, modelBytes)`: 0 on a
 *     CPU build, > 0 only when the loaded binary is a GPU build
 *   - `ensureLocalServer(modelPath)` remembers which GGUF the child serves.
 *     A request for a different file stops the child, waits for /health to
 *     go dark, spawns the new file and waits for health. The DeepSeek Harness
 *     process is not touched — it only knows the loopback URL.
 *   - Ollama is discovery, not a ping: `listOllamaModels()` returns tags or a
 *     typed error; the caller shows it and refuses, it never falls through.
 */
import childProcess, { type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TurnInput, TurnOutput, TurnToolCall } from "./turn-types.ts";
import { catalogModelForFile, findReadyModel, lastModelError } from "./models.ts";
import {
  gpuLayersFor,
  llamaAssetFor,
  llamaTarget,
  pickLlamaRuntime,
  type GpuProbe,
  type LlamaAsset,
  type LlamaRuntimeId,
  type LlamaRuntimePreference,
  type RuntimeChoice,
  NO_GPU,
} from "./llama-platform.ts";
import { llamaBinDir, llamaServerName, loadConfig } from "../fs/disk.ts";
import { probeGpu } from "../hardware-server.ts";
import { getCatalogModel, requiredMemoryGb } from "../catalog.ts";
import { LOOPBACK_HOST, LOOPBACK_PORT, LOCAL_OPENAI_BASE_URL, assertLoopbackOnly } from "../../runtime/loopback.ts";

// ── server state (survives Vite module re-evaluation) ────────────────────────

export type LoadedServer = {
  modelPath: string;
  runtime: LlamaRuntimeId;
  gpuLayers: number;
  pid: number | undefined;
  startedAt: string;
};

type EngineGlobal = typeof globalThis & {
  __localbotLlama?: { child: ChildProcess | null; loaded: LoadedServer | null; queue: Promise<unknown> };
};

function g() {
  const gg = globalThis as EngineGlobal;
  if (!gg.__localbotLlama) {
    gg.__localbotLlama = { child: null, loaded: null, queue: Promise.resolve() };
    // The sidecar owns the only llama-server; do not orphan it when the
    // sidecar (or `npm run dev`) goes away.
    const reap = () => {
      const c = gg.__localbotLlama?.child;
      if (c && c.exitCode === null) {
        try {
          c.kill();
        } catch {
          /* already gone */
        }
      }
    };
    process.once("exit", reap);
    for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
      process.once(sig, () => {
        reap();
        process.exit(0);
      });
    }
  }
  return gg.__localbotLlama;
}

/** What the sidecar-owned llama-server is serving right now (null: none started by us). */
export function loadedServer(): LoadedServer | null {
  return g().loaded;
}

// ── binaries ─────────────────────────────────────────────────────────────────

export function llamaServerBin(runtime?: LlamaRuntimeId): string {
  return path.join(llamaBinDir(runtime), llamaServerName());
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

function hasSharedLibs(dir: string): boolean {
  try {
    return fs.readdirSync(dir).some((n) => /\.(so(\.\d+)*|dylib|dll)$/i.test(n));
  } catch {
    return false;
  }
}

/**
 * The official archives unpack into a versioned subfolder (`llama-b10749/`)
 * holding the shared libraries and ggml backends next to the binary; ggml
 * loads its backends from the executable's own directory, so the top-level
 * copy cannot run alone. Prefer the binary that still sits with its libraries.
 */
export function runnableLlamaServer(binDir: string, name = llamaServerName()): string {
  const top = path.join(binDir, name);
  if (hasSharedLibs(binDir) && fs.existsSync(top)) return top;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(binDir, { withFileTypes: true });
  } catch {
    return top;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const nested = path.join(binDir, e.name, name);
    if (fs.existsSync(nested) && hasSharedLibs(path.dirname(nested))) return nested;
  }
  return top;
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

async function fetchArchive(url: string, dest: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return { ok: false, error: `Failed to fetch llama.cpp binary (${res.status}) ${url}` };
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return { ok: true };
}

/**
 * Make sure the chosen runtime's `llama-server` is unpacked under
 * `bin/{target}/{runtime}/`. The CPU row from before Stage 6 (unpacked into
 * `bin/{target}/`) is found by `llamaBinDir` and reused as-is.
 */
export async function ensureLlamaBinary(
  runtime?: LlamaRuntimeId,
): Promise<{ ok: true; bin: string; runtime: LlamaRuntimeId } | { ok: false; error: string }> {
  const target = llamaTarget();
  if (!target) {
    return {
      ok: false,
      error: `No llama.cpp binary for ${process.platform}-${process.arch}. Place ${llamaServerName()} in ${llamaBinDir()}.`,
    };
  }
  const asset = llamaAssetFor(process.platform, process.arch, runtime);
  if (!asset) {
    return { ok: false, error: `${runtime ?? "default"} is not a pinned llama.cpp runtime for ${target} (NOT BUILT).` };
  }
  const bin = llamaServerBin(asset.runtime);
  if (fs.existsSync(bin)) return { ok: true, bin, runtime: asset.runtime };
  const dir = llamaBinDir(asset.runtime);
  fs.mkdirSync(dir, { recursive: true });
  const archiveDir = path.dirname(path.dirname(dir));
  try {
    const archivePath = path.join(archiveDir, asset.filename);
    const got = await fetchArchive(asset.url, archivePath);
    if (!got.ok) return got;
    await extractArchive(archivePath, dir, asset.kind);
    if (asset.extra) {
      const extraPath = path.join(archiveDir, asset.extra.filename);
      const gotExtra = await fetchArchive(asset.extra.url, extraPath);
      if (!gotExtra.ok) return gotExtra;
      // cudart DLLs must sit next to llama-server.exe.
      const found = walkForBinary(dir, asset.binary);
      await extractArchive(extraPath, found ? path.dirname(found) : dir, asset.extra.kind);
    }
    const found = walkForBinary(dir, asset.binary);
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
    return { ok: true, bin: dest, runtime: asset.runtime };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── runtime choice ───────────────────────────────────────────────────────────

export type ResolvedRuntime = RuntimeChoice & { probe: GpuProbe; target: string };

let probeCache: { at: number; probe: GpuProbe } | null = null;

/** The host's GPU facts, from the sidecar probe (cached 60 s; never the browser). */
export function hostGpuProbe(force = false): GpuProbe {
  if (!force && probeCache && Date.now() - probeCache.at < 60_000) return probeCache.probe;
  let probe: GpuProbe;
  try {
    probe = probeGpu();
  } catch {
    probe = NO_GPU;
  }
  probeCache = { at: Date.now(), probe };
  return probe;
}

export function resolveLlamaRuntime(
  preference: LlamaRuntimePreference = loadConfig().llamaRuntime,
  probe: GpuProbe = hostGpuProbe(),
): ResolvedRuntime | null {
  const target = llamaTarget();
  if (!target) return null;
  return { ...pickLlamaRuntime(target, probe, preference), probe, target };
}

// ── health ───────────────────────────────────────────────────────────────────

export async function pingLocal(url = `http://${LOOPBACK_HOST}:${LOOPBACK_PORT}/health`): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
}

/** llama-server's `/props` names the GGUF it loaded; used to recognise a server we did not start. */
export async function servedModelPath(): Promise<string | null> {
  try {
    const res = await fetch(`http://${LOOPBACK_HOST}:${LOOPBACK_PORT}/props`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const j = (await res.json()) as { model_path?: string; default_generation_settings?: { model?: string } };
    const p = j.model_path ?? j.default_generation_settings?.model;
    return typeof p === "string" && p ? path.resolve(p) : null;
  } catch {
    return null;
  }
}

async function waitForHealth(ms = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await pingLocal()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function waitForDark(ms = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (!(await pingLocal())) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

// ── Ollama discovery ─────────────────────────────────────────────────────────

export const OLLAMA_BASE_URL = "http://127.0.0.1:11434";

export type OllamaTag = { name: string; size: number; family: string | null; parameterSize: string | null; quantization: string | null };
export type OllamaDiscovery =
  | { ok: true; models: OllamaTag[] }
  | { ok: false; code: "UNREACHABLE" | "BAD_RESPONSE" | "NO_MODELS"; error: string };

/** Tags from a running Ollama on loopback, or a typed error. Never a boolean. */
export async function listOllamaModels(baseUrl = OLLAMA_BASE_URL, fetchImpl: typeof fetch = fetch): Promise<OllamaDiscovery> {
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(1500) });
  } catch {
    return { ok: false, code: "UNREACHABLE", error: `Nothing answered on ${baseUrl}. Start Ollama or turn off "Use existing Ollama".` };
  }
  if (!res.ok) return { ok: false, code: "BAD_RESPONSE", error: `Ollama answered HTTP ${res.status} on ${baseUrl}/api/tags.` };
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, code: "BAD_RESPONSE", error: `Ollama on ${baseUrl} did not return JSON tags.` };
  }
  const raw = (json as { models?: unknown }).models;
  if (!Array.isArray(raw)) return { ok: false, code: "BAD_RESPONSE", error: `Ollama on ${baseUrl} returned no "models" list.` };
  const models: OllamaTag[] = raw
    .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === "object" && typeof (m as { name?: unknown }).name === "string")
    .map((m) => {
      const d = (m.details ?? {}) as Record<string, unknown>;
      return {
        name: String(m.name),
        size: typeof m.size === "number" ? m.size : 0,
        family: typeof d.family === "string" ? d.family : null,
        parameterSize: typeof d.parameter_size === "string" ? d.parameter_size : null,
        quantization: typeof d.quantization_level === "string" ? d.quantization_level : null,
      };
    });
  if (models.length === 0) {
    return { ok: false, code: "NO_MODELS", error: `Ollama is running on ${baseUrl} but has no models. Pull one (ollama pull …) or turn the switch off.` };
  }
  return { ok: true, models };
}

export type OllamaRoute = { baseUrl: string; model: string; modelName: string };

/**
 * With the switch on, the route the Harness uses — or a thrown error the UI
 * shows. The chosen tag must exist in the live list; nothing is guessed.
 */
export async function resolveOllamaRoute(cfg = loadConfig(), baseUrl = OLLAMA_BASE_URL): Promise<OllamaRoute> {
  const found = await listOllamaModels(baseUrl);
  if (!found.ok) throw new Error(found.error);
  const chosen = cfg.ollamaModel;
  if (!chosen) {
    throw new Error(`"Use existing Ollama" is on but no model is picked. Choose one in Settings → Safety (${found.models.length} available).`);
  }
  if (!found.models.some((m) => m.name === chosen)) {
    throw new Error(`Ollama no longer lists ${chosen}. Pick another model in Settings → Safety.`);
  }
  return { baseUrl: `${baseUrl}/v1`, model: chosen, modelName: `Ollama ${chosen}` };
}

// ── status ───────────────────────────────────────────────────────────────────

export function engineStatus(): {
  ready: boolean;
  engine: string;
  model: string;
  modelId: string | null;
  ggufPath: string | null;
  sha256: string | null;
  loopback: string | null;
  ramEstimate: string;
  badge: string;
  runtime: { id: LlamaRuntimeId; label: string; gpu: boolean; reason: string; gpuLayers: number } | null;
  gpu: GpuProbe;
  loaded: LoadedServer | null;
  error?: string;
} {
  const ready = findReadyModel();
  const rt = resolveLlamaRuntime();
  const probe = rt?.probe ?? NO_GPU;
  const runtime = rt
    ? {
        id: rt.asset.runtime,
        label: rt.asset.label,
        gpu: rt.asset.gpu,
        reason: rt.reason,
        gpuLayers: gpuLayersFor(rt.asset, probe, ready ? fs.statSync(ready.path).size : 0),
      }
    : null;
  if (ready) {
    const model = getCatalogModel(ready.catalogId);
    const ram = model ? `~${requiredMemoryGb(model).toFixed(1)} GB` : "—";
    return {
      ready: true,
      engine: "llama.cpp",
      model: ready.name,
      modelId: ready.modelId,
      ggufPath: ready.path,
      sha256: ready.sha256,
      loopback: LOCAL_OPENAI_BASE_URL,
      ramEstimate: ram,
      badge: `Local ${ready.name}`,
      runtime,
      gpu: probe,
      loaded: loadedServer(),
    };
  }
  const why = lastModelError();
  return {
    ready: false,
    engine: "none",
    model: "",
    modelId: null,
    ggufPath: null,
    sha256: null,
    loopback: null,
    ramEstimate: "—",
    badge: "Local model not ready",
    runtime,
    gpu: probe,
    loaded: loadedServer(),
    error: why ? `No verified GGUF. ${why}` : "No GGUF registered. Download or import a model.",
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

// ── spawn ────────────────────────────────────────────────────────────────────

export type LlamaSpawnPlan = {
  modelPath: string;
  runtime: LlamaRuntimeId;
  gpuLayers: number;
  contextTokens: number;
  threads: number;
  args: string[];
};

/**
 * Pure: the llama-server command line for a model on a chosen build. The
 * only place `--n-gpu-layers` is written; its value is the layers function,
 * never a literal.
 */
export function llamaSpawnPlan(input: {
  modelPath: string;
  asset: Pick<LlamaAsset, "runtime" | "gpu">;
  probe: Pick<GpuProbe, "vramGb">;
  modelBytes: number;
  contextTokens: number;
  cpuCount?: number;
}): LlamaSpawnPlan {
  const gpuLayers = gpuLayersFor(input.asset, input.probe, input.modelBytes);
  const threads = Math.max(1, Math.min(4, input.cpuCount ?? os.cpus().length));
  const args = [
    "-m",
    input.modelPath,
    "--host",
    LOOPBACK_HOST,
    "--port",
    String(LOOPBACK_PORT),
    "-c",
    String(input.contextTokens),
    "-t",
    String(threads),
    "--n-gpu-layers",
    String(gpuLayers),
    "--jinja",
  ];
  return { modelPath: input.modelPath, runtime: input.asset.runtime, gpuLayers, contextTokens: input.contextTokens, threads, args };
}

export type EnsureServerResult =
  | { ok: true; url: string; modelPath: string; restarted: boolean; runtime: LlamaRuntimeId; gpuLayers: number }
  | { ok: false; error: string };

/** Test seam: how a plan becomes a process. */
export type SpawnFn = (exe: string, plan: LlamaSpawnPlan, env: NodeJS.ProcessEnv, cwd: string) => ChildProcess;

const defaultSpawn: SpawnFn = (exe, plan, env, cwd) =>
  childProcess.spawn(exe, plan.args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });

let spawnOverride: SpawnFn | null = null;
/** Tests replace the real spawn with a fake llama-server; production never calls this. */
export function __setSpawnForTests(fn: SpawnFn | null): void {
  spawnOverride = fn;
}

async function stopChild(): Promise<boolean> {
  const st = g();
  const child = st.child;
  st.child = null;
  st.loaded = null;
  if (child && child.exitCode === null) {
    child.kill();
    const dark = await waitForDark();
    if (!dark) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* gone */
      }
      return waitForDark(5000);
    }
    return true;
  }
  return waitForDark(3000);
}

/**
 * One llama-server for the installation. Without a `modelPath` the global
 * active file is used. If a healthy server already serves the requested file
 * it is reused. If it serves another file and we own it, it is stopped
 * (health dark) and restarted onto the new file; if we do not own it, that is
 * an error the user sees, not a silent reuse of the wrong model.
 */
export async function ensureLocalServer(modelPath?: string, deps: { spawn?: SpawnFn } = {}): Promise<EnsureServerResult> {
  const st = g();
  const run = st.queue.then(() => ensureLocalServerUnlocked(modelPath, deps));
  st.queue = run.catch(() => undefined);
  return run;
}

async function ensureLocalServerUnlocked(modelPath: string | undefined, deps: { spawn?: SpawnFn }): Promise<EnsureServerResult> {
  assertLoopbackOnly(LOOPBACK_HOST);
  const st = g();
  const ready = findReadyModel();
  const wanted = modelPath ? path.resolve(modelPath) : ready?.path;
  if (!wanted) {
    return { ok: false, error: `Local model not ready. ${engineStatus().error ?? "Download or import a GGUF first."}` };
  }
  if (!fs.existsSync(wanted)) return { ok: false, error: `Model file is missing: ${wanted}` };

  let restarted = false;
  if (await pingLocal()) {
    const ours = st.child && st.child.exitCode === null ? st.loaded : null;
    const serving = ours?.modelPath ?? (await servedModelPath());
    if (serving && path.resolve(serving) === wanted) {
      return { ok: true, url: LOCAL_OPENAI_BASE_URL, modelPath: wanted, restarted: false, runtime: ours?.runtime ?? "cpu", gpuLayers: ours?.gpuLayers ?? 0 };
    }
    if (!ours) {
      if (!serving) {
        // A server we did not start and cannot identify: keep the old behaviour of reusing it.
        return { ok: true, url: LOCAL_OPENAI_BASE_URL, modelPath: wanted, restarted: false, runtime: "cpu", gpuLayers: 0 };
      }
      return {
        ok: false,
        error: `Another llama-server on ${LOOPBACK_HOST}:${LOOPBACK_PORT} is serving ${path.basename(serving)}, not ${path.basename(wanted)}. Stop it, then send again.`,
      };
    }
    const dark = await stopChild();
    if (!dark) return { ok: false, error: "Could not stop the running llama-server to switch models." };
    restarted = true;
  } else if (st.child) {
    await stopChild();
  }

  const rt = resolveLlamaRuntime();
  if (!rt) return { ok: false, error: `No llama.cpp binary for ${process.platform}-${process.arch}.` };
  const bin = await ensureLlamaBinary(rt.asset.runtime);
  if (!bin.ok) return bin;
  const cat = catalogModelForFile(path.basename(wanted)) ?? null;
  const plan = llamaSpawnPlan({
    modelPath: wanted,
    asset: rt.asset,
    probe: rt.probe,
    modelBytes: fs.statSync(wanted).size,
    contextTokens: localContextTokens(cat),
  });
  const exe = runnableLlamaServer(path.dirname(bin.bin));
  const exeDir = path.dirname(exe);
  const sep = process.platform === "win32" ? ";" : ":";
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LD_LIBRARY_PATH: [exeDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(sep),
    DYLD_LIBRARY_PATH: [exeDir, process.env.DYLD_LIBRARY_PATH].filter(Boolean).join(sep),
    ...(process.platform === "win32" ? { PATH: [exeDir, process.env.PATH].filter(Boolean).join(sep) } : {}),
  };
  const child = (deps.spawn ?? spawnOverride ?? defaultSpawn)(exe, plan, env, exeDir);
  st.child = child;
  st.loaded = { modelPath: wanted, runtime: plan.runtime, gpuLayers: plan.gpuLayers, pid: child.pid, startedAt: new Date().toISOString() };
  child.stderr?.on("data", () => undefined);
  child.stdout?.on("data", () => undefined);
  child.on("exit", () => {
    if (st.child === child) {
      st.child = null;
      st.loaded = null;
    }
  });
  const ok = await waitForHealth(90000);
  if (!ok) {
    child.kill();
    if (st.child === child) {
      st.child = null;
      st.loaded = null;
    }
    return { ok: false, error: `llama-server (${rt.asset.label}) failed to start on ${path.basename(wanted)}. Local model not ready.` };
  }
  return { ok: true, url: LOCAL_OPENAI_BASE_URL, modelPath: wanted, restarted, runtime: plan.runtime, gpuLayers: plan.gpuLayers };
}

/** Stop the sidecar-owned llama-server (tests / shutdown). No-op for servers we did not start. */
export async function stopLocalServer(): Promise<void> {
  await stopChild();
}

// ── legacy single-completion path (off the chat path since Stage 4) ──────────

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

  if (cfg.useExistingOllama) {
    let route: OllamaRoute;
    try {
      route = await resolveOllamaRoute(cfg);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    return postChat(`${route.baseUrl}/chat/completions`, {
      model: route.model,
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
