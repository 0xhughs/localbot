import fs from "node:fs";
import os from "node:os";
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

function gpuNameLinux(): string | null {
  try {
    const dri = fs.readdirSync("/dev/dri");
    if (dri.length === 0) return null;
  } catch {
    /* no drm */
  }
  try {
    const raw = fs.readFileSync("/proc/cpuinfo", "utf8");
    const model = raw.split("\n").find((l) => l.startsWith("model name"));
    if (model) return `CPU: ${model.split(":")[1]?.trim() ?? ""}`;
  } catch {
    /* ignore */
  }
  return null;
}

export function scanServerHardwareFrom(
  sys: ServerMem,
  extra?: { freeDiskGb?: number; gpuName?: string | null },
): HardwareReport {
  const totalRamGb = sys.totalmem() / 1024 ** 3;
  const availableRamGb = sys.freemem() / 1024 ** 3;
  const cpu0 = sys.cpus()[0]?.model ?? "";
  const appleSilicon = sys.arch() === "arm64" && sys.platform() === "darwin";
  const plat = sys.platform();
  const osName =
    plat === "darwin" ? "macOS" : plat === "win32" ? "Windows" : plat === "linux" ? "Linux" : plat;
  return {
    os: osName,
    arch: sys.arch(),
    platformLabel: `${osName} ${sys.arch()}`,
    totalRamGb,
    availableRamGb,
    ramSource: "os",
    gpuName: extra?.gpuName ?? (appleSilicon ? cpu0 || "Apple Silicon" : gpuNameLinux()),
    vramGb: appleSilicon ? null : null,
    appleSilicon,
    cores: sys.cpus().length,
    freeDiskGb: extra?.freeDiskGb ?? 0,
    isMobile: false,
    scannedAt: new Date().toISOString(),
  };
}

export function scanServerHardware(root = process.cwd()): HardwareReport {
  return scanServerHardwareFrom(os, {
    freeDiskGb: freeDiskGbAt(root),
    gpuName:
      os.platform() === "darwin"
        ? os.cpus()[0]?.model ?? "Apple Silicon"
        : gpuNameLinux(),
  });
}
