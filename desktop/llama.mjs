/**
 * llama.cpp asset resolver for the Electron main process.
 *
 * Asset rows come from catalog/llama-assets.json (same source as the sidecar's
 * src/lib/runtime/llama-platform.ts): one row per (target, runtime), unpacked
 * to bin/{target}/{runtime}/. Since Stage 6 the **sidecar** owns the one
 * llama-server process (it picks the runtime from its GPU probe, sets
 * --n-gpu-layers, and restarts onto the selected agent's GGUF). Electron main
 * no longer spawns a second server that the sidecar could not restart; this
 * module only answers "which archive / which folder" for packaging and
 * diagnostics.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const assetsFile = JSON.parse(
  fs.readFileSync(path.join(here, "..", "catalog", "llama-assets.json"), "utf8"),
);

export const LLAMA_RELEASE = assetsFile.release;
export const LOOPBACK_HOST = "127.0.0.1";
export const LOOPBACK_PORT = 18789;

export function llamaTarget(platform = process.platform, arch = process.arch) {
  const p = String(platform);
  const a = String(arch);
  if (p === "linux" && (a === "x64" || a === "x86_64")) return "linux-x64";
  if (p === "darwin" && (a === "arm64" || a === "aarch64")) return "darwin-arm64";
  if (p === "darwin") return "darwin-x64";
  if ((p === "win32" || p === "windows") && (a === "x64" || a === "x86_64")) return "win32-x64";
  return null;
}

export function defaultRuntimeFor(target) {
  return assetsFile.targets[target]?.default ?? "cpu";
}

/** Pinned runtimes for a target (default first). */
export function runtimesFor(target) {
  const t = assetsFile.targets[target];
  if (!t) return [];
  const def = defaultRuntimeFor(target);
  return Object.keys(t.runtimes)
    .sort((a, b) => Number(b === def) - Number(a === def))
    .map((runtime) => ({ target, runtime, ...t.runtimes[runtime] }));
}

export function llamaAssetFor(platform = process.platform, arch = process.arch, runtime) {
  const t = llamaTarget(platform, arch);
  if (!t) return null;
  const id = runtime ?? defaultRuntimeFor(t);
  const row = assetsFile.targets[t]?.runtimes[id];
  return row ? { target: t, runtime: id, ...row } : null;
}

/** `bin/{target}/{runtime}/` — CPU and GPU trees coexist. */
export function llamaBinDir(dataDir, runtime) {
  const t = llamaTarget() ?? `${process.platform}-${process.arch}`;
  return path.join(dataDir, "bin", t, runtime ?? defaultRuntimeFor(t));
}

export function llamaServerName() {
  return process.platform === "win32" ? "llama-server.exe" : "llama-server";
}

export async function pingLocal(host = LOOPBACK_HOST, port = LOOPBACK_PORT) {
  try {
    const res = await fetch(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
}

export function readActiveModelPath(dataDir) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(dataDir, "localbot-config.json"), "utf8"));
    if (typeof cfg.activeModelPath === "string" && cfg.activeModelPath) return cfg.activeModelPath;
  } catch {
    /* none */
  }
  return null;
}
