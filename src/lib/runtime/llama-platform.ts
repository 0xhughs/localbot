/**
 * Which official llama.cpp b10749 build runs on this machine.
 *
 * `catalog/llama-assets.json` has one row per (target, runtime). A target is
 * the OS/arch pair; a runtime is the ggml backend the archive was built with
 * (`cpu`, `metal`, `cuda-12.4`, `vulkan`). Runtime selection is a pure
 * function of the sidecar's GPU probe (`src/lib/hardware-server.ts`) and the
 * employee's preference in `localbot-config.json` (`llamaRuntime`, default
 * `auto`), so it is testable without a GPU. Execution on a GPU host is
 * UNVERIFIED in this repo; the selection logic is what the tests cover.
 */
import assetsFile from "../../../catalog/llama-assets.json" with { type: "json" };

export const LLAMA_RELEASE: string = assetsFile.release;

export type LlamaTarget = "darwin-arm64" | "darwin-x64" | "win32-x64" | "linux-x64";
export type LlamaRuntimeId = "cpu" | "metal" | "cuda-12.4" | "vulkan";
export const LLAMA_RUNTIME_IDS: readonly LlamaRuntimeId[] = ["cpu", "metal", "cuda-12.4", "vulkan"];

export type LlamaArchive = {
  url: string;
  filename: string;
  kind: "tar.gz" | "zip";
};

export type LlamaAsset = LlamaArchive & {
  target: LlamaTarget;
  runtime: LlamaRuntimeId;
  label: string;
  /** True when this build offloads layers to a GPU backend. */
  gpu: boolean;
  binary: "llama-server" | "llama-server.exe";
  /** Companion archive unpacked into the same folder (Windows CUDA runtime DLLs). */
  extra: LlamaArchive | null;
};

type RawRuntime = {
  label: string;
  gpu: boolean;
  filename: string;
  kind: string;
  binary: string;
  url: string;
  extra?: { filename: string; kind: string; url: string };
};
type RawTarget = { default: string; runtimes: Record<string, RawRuntime> };

const RAW_TARGETS = assetsFile.targets as Record<LlamaTarget, RawTarget>;
export const LLAMA_TARGETS: readonly LlamaTarget[] = ["darwin-arm64", "darwin-x64", "win32-x64", "linux-x64"];

export function isLlamaRuntimeId(v: unknown): v is LlamaRuntimeId {
  return typeof v === "string" && (LLAMA_RUNTIME_IDS as readonly string[]).includes(v);
}

function row(target: LlamaTarget, runtime: LlamaRuntimeId): LlamaAsset | null {
  const t = RAW_TARGETS[target];
  const r = t?.runtimes[runtime];
  if (!r) return null;
  return {
    target,
    runtime,
    label: r.label,
    gpu: Boolean(r.gpu),
    url: r.url,
    filename: r.filename,
    kind: r.kind as LlamaArchive["kind"],
    binary: r.binary as LlamaAsset["binary"],
    extra: r.extra
      ? { url: r.extra.url, filename: r.extra.filename, kind: r.extra.kind as LlamaArchive["kind"] }
      : null,
  };
}

export function llamaTarget(
  platform: NodeJS.Platform | string = process.platform,
  arch: string = process.arch,
): LlamaTarget | null {
  const p = String(platform);
  const a = String(arch);
  if (p === "linux" && (a === "x64" || a === "x86_64")) return "linux-x64";
  if (p === "darwin" && (a === "arm64" || a === "aarch64")) return "darwin-arm64";
  if (p === "darwin") return "darwin-x64";
  if ((p === "win32" || p === "windows") && (a === "x64" || a === "x86_64")) return "win32-x64";
  return null;
}

/** The runtime an archive-less install would get: the target's CPU (or Metal) row. */
export function defaultRuntimeFor(target: LlamaTarget): LlamaRuntimeId {
  const d = RAW_TARGETS[target]?.default;
  return isLlamaRuntimeId(d) ? d : "cpu";
}

/** Runtimes pinned for a target, default first. */
export function runtimesFor(target: LlamaTarget): LlamaAsset[] {
  const t = RAW_TARGETS[target];
  if (!t) return [];
  const def = defaultRuntimeFor(target);
  const ids = Object.keys(t.runtimes).filter(isLlamaRuntimeId);
  ids.sort((a, b) => Number(b === def) - Number(a === def));
  return ids.map((id) => row(target, id)).filter((a): a is LlamaAsset => a !== null);
}

/** GPU rows for a target. Empty means GPU is NOT BUILT for that platform (darwin-x64). */
export function gpuRuntimesFor(target: LlamaTarget): LlamaAsset[] {
  return runtimesFor(target).filter((a) => a.gpu);
}

export function llamaAssetFor(
  platform?: NodeJS.Platform | string,
  arch?: string,
  runtime?: LlamaRuntimeId,
): LlamaAsset | null {
  const t = llamaTarget(platform, arch);
  if (!t) return null;
  return row(t, runtime ?? defaultRuntimeFor(t));
}

/** target → default (CPU / Metal) archive filename. */
export function llamaAssetMap(): Record<LlamaTarget, string> {
  const out = {} as Record<LlamaTarget, string>;
  for (const t of LLAMA_TARGETS) out[t] = row(t, defaultRuntimeFor(t))?.filename ?? "";
  return out;
}

/** Every (target, runtime) row, for tests and the Runtime pane. */
export function allLlamaAssets(): LlamaAsset[] {
  return LLAMA_TARGETS.flatMap((t) => runtimesFor(t));
}

// ── runtime selection from host facts ────────────────────────────────────────

export type GpuVendor = "nvidia" | "amd" | "intel" | "apple" | "unknown";

/** What the sidecar could establish about a GPU. Every field may be null on a CPU-only host. */
export type GpuProbe = {
  vendor: GpuVendor | null;
  name: string | null;
  vramGb: number | null;
  /** Backends the OS exposes: CUDA driver present, Vulkan loader/ICD present, Metal on Apple Silicon. */
  cuda: boolean;
  vulkan: boolean;
  metal: boolean;
  /** Human-readable lines naming the sources that answered (nvidia-smi, /dev/dri, …). */
  evidence: string[];
};

export const NO_GPU: GpuProbe = {
  vendor: null,
  name: null,
  vramGb: null,
  cuda: false,
  vulkan: false,
  metal: false,
  evidence: [],
};

export type LlamaRuntimePreference = "auto" | LlamaRuntimeId;

export type RuntimeChoice = {
  asset: LlamaAsset;
  /** Why this row was chosen; shown in Settings → Runtime. */
  reason: string;
  /** Whether the choice came from host facts (`auto`) or the employee's explicit pick. */
  source: "auto" | "preference";
};

/**
 * Pick the llama.cpp build for a target from what the probe saw. Order per
 * target: CUDA before Vulkan on Windows when an NVIDIA card is present;
 * Vulkan on Linux/Windows when the loader is present and a render node exists;
 * Metal is the only Apple Silicon row; everything else is the CPU row. An
 * explicit preference wins only if that row is pinned for the target.
 */
export function pickLlamaRuntime(
  target: LlamaTarget,
  probe: GpuProbe,
  preference: LlamaRuntimePreference = "auto",
): RuntimeChoice {
  const pinned = runtimesFor(target);
  const byId = (id: LlamaRuntimeId) => pinned.find((a) => a.runtime === id) ?? null;
  const cpu = byId(defaultRuntimeFor(target)) ?? pinned[0];
  if (!cpu) throw new Error(`No llama.cpp asset pinned for ${target}`);

  if (preference !== "auto") {
    const wanted = byId(preference);
    if (wanted) return { asset: wanted, reason: `Settings → Runtime pinned ${wanted.label}.`, source: "preference" };
    return {
      asset: cpu,
      reason: `${preference} is not pinned for ${target} (NOT BUILT); using ${cpu.label}.`,
      source: "preference",
    };
  }

  const metal = byId("metal");
  if (metal) {
    return { asset: metal, reason: "Apple Silicon: the official macos-arm64 build is the Metal build.", source: "auto" };
  }
  const cuda = byId("cuda-12.4");
  if (cuda && probe.cuda && probe.vendor === "nvidia") {
    return { asset: cuda, reason: `NVIDIA driver answered (${probe.name ?? "GPU"}); using ${cuda.label}.`, source: "auto" };
  }
  const vulkan = byId("vulkan");
  if (vulkan && probe.vulkan && probe.vendor) {
    return { asset: vulkan, reason: `Vulkan loader + ${probe.name ?? probe.vendor} GPU present; using ${vulkan.label}.`, source: "auto" };
  }
  const why =
    probe.vendor && gpuRuntimesFor(target).length === 0
      ? `${probe.name ?? probe.vendor} detected but no GPU build is pinned for ${target} (NOT BUILT); CPU.`
      : probe.vendor
        ? `${probe.name ?? probe.vendor} detected without a usable backend (cuda=${probe.cuda}, vulkan=${probe.vulkan}); CPU.`
        : "No GPU detected; CPU.";
  return { asset: cpu, reason: why, source: "auto" };
}

/** Sentinel llama.cpp accepts for "offload every layer". */
export const ALL_GPU_LAYERS = 99;

/**
 * `--n-gpu-layers` for a chosen build. Always 0 on a CPU build. On a GPU build
 * with unknown VRAM (Metal shares system memory; probes without a VRAM figure)
 * offload everything; with a known VRAM figure, offload everything when the
 * file plus ~1 GB of KV/scratch fits, otherwise a proportional share (at least 1).
 */
export function gpuLayersFor(asset: Pick<LlamaAsset, "gpu">, probe: Pick<GpuProbe, "vramGb">, modelBytes: number): number {
  if (!asset.gpu) return 0;
  const vram = probe.vramGb;
  if (vram === null || vram <= 0) return ALL_GPU_LAYERS;
  const fileGb = modelBytes / 1024 ** 3;
  const need = fileGb + 1.0;
  if (need <= vram) return ALL_GPU_LAYERS;
  return Math.max(1, Math.min(ALL_GPU_LAYERS - 1, Math.floor((ALL_GPU_LAYERS * (vram - 0.5)) / Math.max(fileGb, 0.1))));
}
