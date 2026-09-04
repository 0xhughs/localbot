import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NO_GPU, type GpuProbe, type GpuVendor } from "./runtime/llama-platform.ts";
import type { HardwareReport } from "./types.ts";

export type ServerMem = {
  totalmem: () => number;
  freemem: () => number;
  cpus: () => { model: string }[];
  arch: () => string;
  platform: () => string;
};

function freeDiskGbAt(dir: string): number {
  try {
    const st = fs.statfsSync(dir);
    return (Number(st.bavail) * Number(st.bsize)) / 1024 ** 3;
  } catch {
    return 0;
  }
}

// ── GPU probe ────────────────────────────────────────────────────────────────
//
// Real host facts only, gathered in the sidecar (never the browser's WebGL
// string). Each source is optional and failure-tolerant; a CPU-only machine
// yields NO_GPU. The IO is injectable so the selection logic is tested with
// fixture outputs rather than a real GPU.

export type ProbeIo = {
  platform: string;
  arch: string;
  exists: (p: string) => boolean;
  readDir: (p: string) => string[];
  readFile: (p: string) => string | null;
  /** Run a program with a short timeout; null when missing / failing. */
  run: (file: string, args: string[]) => string | null;
  env: Record<string, string | undefined>;
};

export function realProbeIo(): ProbeIo {
  return {
    platform: process.platform,
    arch: process.arch,
    exists: (p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    },
    readDir: (p) => {
      try {
        return fs.readdirSync(p);
      } catch {
        return [];
      }
    },
    readFile: (p) => {
      try {
        return fs.readFileSync(p, "utf8");
      } catch {
        return null;
      }
    },
    run: (file, args) => {
      try {
        return execFileSync(file, args, { encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        return null;
      }
    },
    env: process.env,
  };
}

const PCI_VENDORS: Record<string, GpuVendor> = { "0x10de": "nvidia", "0x1002": "amd", "0x8086": "intel" };

/** `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits` → first GPU. */
export function parseNvidiaSmi(out: string | null): { name: string; vramGb: number | null } | null {
  if (!out) return null;
  const line = out
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  const [name, mem] = line.split(",").map((s) => s.trim());
  if (!name) return null;
  const mib = Number(mem);
  return { name, vramGb: Number.isFinite(mib) && mib > 0 ? Math.round((mib / 1024) * 10) / 10 : null };
}

/** Windows `Get-CimInstance Win32_VideoController | ConvertTo-Json` (single object or array). */
export function parseWmiVideo(out: string | null): { name: string; vramGb: number | null; vendor: GpuVendor }[] {
  if (!out) return [];
  try {
    const parsed = JSON.parse(out) as unknown;
    const rows = (Array.isArray(parsed) ? parsed : [parsed]) as { Name?: string; AdapterRAM?: number }[];
    return rows
      .filter((r) => typeof r?.Name === "string")
      .map((r) => {
        const name = String(r.Name);
        const bytes = Number(r.AdapterRAM);
        return {
          name,
          vramGb: Number.isFinite(bytes) && bytes > 0 ? Math.round((bytes / 1024 ** 3) * 10) / 10 : null,
          vendor: vendorFromName(name),
        };
      });
  } catch {
    return [];
  }
}

export function vendorFromName(name: string): GpuVendor {
  const n = name.toLowerCase();
  if (/nvidia|geforce|quadro|rtx|gtx|tesla/.test(n)) return "nvidia";
  if (/amd|radeon|ati /.test(n)) return "amd";
  if (/intel|iris|uhd|arc/.test(n)) return "intel";
  if (/apple/.test(n)) return "apple";
  return "unknown";
}

function linuxVulkanPresent(io: ProbeIo): boolean {
  const icdDirs = ["/usr/share/vulkan/icd.d", "/etc/vulkan/icd.d", "/usr/local/share/vulkan/icd.d"];
  if (icdDirs.some((d) => io.readDir(d).some((f) => f.endsWith(".json")))) return true;
  return io.run("vulkaninfo", ["--summary"]) !== null;
}

function linuxDrmVendors(io: ProbeIo): { vendor: GpuVendor; card: string }[] {
  const out: { vendor: GpuVendor; card: string }[] = [];
  for (const card of io.readDir("/sys/class/drm").filter((n) => /^card\d+$/.test(n))) {
    const v = io.readFile(`/sys/class/drm/${card}/device/vendor`)?.trim().toLowerCase();
    if (v) out.push({ vendor: PCI_VENDORS[v] ?? "unknown", card });
  }
  return out;
}

export function probeGpuWith(io: ProbeIo): GpuProbe {
  const probe: GpuProbe = { ...NO_GPU, evidence: [] };
  if (io.platform === "darwin") {
    if (io.arch === "arm64" || io.arch === "aarch64") {
      const brand = io.run("sysctl", ["-n", "machdep.cpu.brand_string"])?.trim() || "Apple Silicon";
      probe.vendor = "apple";
      probe.name = brand;
      probe.metal = true;
      probe.evidence.push(`arch arm64 on macOS → Metal (${brand})`);
      return probe;
    }
    const sp = io.run("system_profiler", ["SPDisplaysDataType", "-json"]);
    if (sp) {
      try {
        const j = JSON.parse(sp) as { SPDisplaysDataType?: { sppci_model?: string; spdisplays_vram?: string }[] };
        const first = j.SPDisplaysDataType?.[0];
        if (first?.sppci_model) {
          probe.name = first.sppci_model;
          probe.vendor = vendorFromName(first.sppci_model);
          const m = /(\d+(?:\.\d+)?)\s*(GB|MB)/i.exec(first.spdisplays_vram ?? "");
          if (m) probe.vramGb = m[2]!.toUpperCase() === "GB" ? Number(m[1]) : Math.round((Number(m[1]) / 1024) * 10) / 10;
          probe.evidence.push(`system_profiler: ${first.sppci_model}`);
        }
      } catch {
        /* unparsable */
      }
    }
    return probe;
  }

  if (io.platform === "win32") {
    const sysRoot = io.env.SystemRoot || io.env.windir || "C:\\Windows";
    const smiCandidates = ["nvidia-smi", path.win32.join(sysRoot, "System32", "nvidia-smi.exe")];
    for (const bin of smiCandidates) {
      const nv = parseNvidiaSmi(io.run(bin, ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]));
      if (nv) {
        probe.vendor = "nvidia";
        probe.name = nv.name;
        probe.vramGb = nv.vramGb;
        probe.cuda = true;
        probe.evidence.push(`nvidia-smi: ${nv.name}${nv.vramGb ? `, ${nv.vramGb} GB` : ""}`);
        break;
      }
    }
    if (!probe.vendor) {
      const wmi = parseWmiVideo(
        io.run("powershell", [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress",
        ]),
      );
      const best = wmi.find((r) => r.vendor !== "unknown") ?? wmi[0];
      if (best) {
        probe.vendor = best.vendor;
        probe.name = best.name;
        probe.vramGb = best.vramGb;
        probe.evidence.push(`WMI Win32_VideoController: ${best.name}`);
        if (best.vendor === "nvidia" && io.exists(path.win32.join(sysRoot, "System32", "nvcuda.dll"))) {
          probe.cuda = true;
          probe.evidence.push("nvcuda.dll present");
        }
      }
    }
    if (io.exists(path.win32.join(sysRoot, "System32", "vulkan-1.dll"))) {
      probe.vulkan = true;
      probe.evidence.push("vulkan-1.dll present");
    }
    return probe;
  }

  // linux (and anything else with /sys, /proc)
  const nv = parseNvidiaSmi(io.run("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]));
  const nvDriver = io.readFile("/proc/driver/nvidia/version");
  if (nv) {
    probe.vendor = "nvidia";
    probe.name = nv.name;
    probe.vramGb = nv.vramGb;
    probe.cuda = true;
    probe.evidence.push(`nvidia-smi: ${nv.name}${nv.vramGb ? `, ${nv.vramGb} GB` : ""}`);
  } else if (nvDriver) {
    probe.vendor = "nvidia";
    probe.name = "NVIDIA GPU";
    probe.cuda = true;
    probe.evidence.push(`/proc/driver/nvidia/version: ${nvDriver.split("\n")[0]?.trim() ?? "present"}`);
  }
  const drm = linuxDrmVendors(io);
  const renderNodes = io.readDir("/dev/dri").filter((n) => n.startsWith("renderD"));
  if (drm.length > 0 && renderNodes.length > 0) {
    const pick = drm.find((d) => d.vendor !== "unknown") ?? drm[0]!;
    if (!probe.vendor) {
      probe.vendor = pick.vendor;
      probe.name = pick.vendor === "unknown" ? "GPU (DRM)" : `${pick.vendor.toUpperCase()} GPU (DRM ${pick.card})`;
    }
    probe.evidence.push(`/dev/dri: ${renderNodes.join(", ")}; /sys/class/drm vendors: ${drm.map((d) => d.vendor).join(", ")}`);
  }
  if (probe.vendor && linuxVulkanPresent(io)) {
    probe.vulkan = true;
    probe.evidence.push("Vulkan ICD / vulkaninfo present");
  }
  return probe;
}

export function probeGpu(): GpuProbe {
  return probeGpuWith(realProbeIo());
}

export function scanServerHardwareFrom(
  sys: ServerMem,
  extra?: { freeDiskGb?: number; gpuName?: string | null; gpu?: GpuProbe | null },
): HardwareReport {
  const totalRamGb = sys.totalmem() / 1024 ** 3;
  const availableRamGb = sys.freemem() / 1024 ** 3;
  const cpu0 = sys.cpus()[0]?.model ?? "";
  const appleSilicon = sys.arch() === "arm64" && sys.platform() === "darwin";
  const plat = sys.platform();
  const osName =
    plat === "darwin" ? "macOS" : plat === "win32" ? "Windows" : plat === "linux" ? "Linux" : plat;
  const gpu = extra?.gpu ?? null;
  return {
    os: osName,
    arch: sys.arch(),
    platformLabel: `${osName} ${sys.arch()}`,
    totalRamGb,
    availableRamGb,
    ramSource: "os",
    gpuName: gpu?.name ?? extra?.gpuName ?? (appleSilicon ? cpu0 || "Apple Silicon" : null),
    vramGb: appleSilicon ? null : (gpu?.vramGb ?? null),
    appleSilicon,
    cores: sys.cpus().length,
    freeDiskGb: extra?.freeDiskGb ?? 0,
    isMobile: false,
    scannedAt: new Date().toISOString(),
    gpu,
  };
}

export function scanServerHardware(root = process.cwd()): HardwareReport {
  return scanServerHardwareFrom(os, {
    freeDiskGb: freeDiskGbAt(root),
    gpu: probeGpu(),
  });
}
