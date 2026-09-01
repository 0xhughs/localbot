import type { HardwareReport } from "./types.ts";

export type HardwareHints = {
  userAgent?: string;
  platform?: string;
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  webglRenderer?: string | null;
  maxTextureSize?: number | null;
};

function detectOs(ua: string, platform: string): {
  os: string;
  appleSilicon: boolean;
  isMobile: boolean;
} {
  const p = platform.toLowerCase();
  const u = ua.toLowerCase();
  const isMobile =
    /iphone|ipad|ipod|android|mobile|iemobile|opera mini/.test(u) ||
    /iphone|ipad|android/.test(p);

  if (/mac os x|macintosh|macintel|macppc/.test(u) || p.includes("mac")) {
    const appleSilicon =
      /arm|aarch64/.test(u) ||
      p.includes("arm") ||
      // Intel Mac string is MacIntel even on Apple Silicon in Chrome.
      (p === "macintel" && !/intel mac os x/.test(u));
    return { os: "macOS", appleSilicon: appleSilicon || p === "macintel", isMobile };
  }
  if (/win/.test(p) || /windows/.test(u)) {
    return { os: "Windows", appleSilicon: false, isMobile };
  }
  if (/linux/.test(p) || /linux/.test(u)) {
    return { os: "Linux", appleSilicon: false, isMobile };
  }
  if (/android/.test(u)) return { os: "Android", appleSilicon: false, isMobile: true };
  if (/iphone|ipad|ipod/.test(u)) {
    return { os: "iOS", appleSilicon: true, isMobile: true };
  }
  return { os: platform || "Unknown", appleSilicon: false, isMobile };
}

function detectArch(ua: string, appleSilicon: boolean, platform: string): string {
  const u = ua.toLowerCase();
  if (appleSilicon || /arm64|aarch64/.test(u)) return "arm64";
  if (/wow64|win64|x86_64|x64|amd64/.test(u) || /x86_64|win32/.test(platform.toLowerCase())) {
    return "x64";
  }
  if (/arm/.test(u)) return "arm";
  return "x64";
}

function gpuFromRenderer(renderer: string | null): { name: string | null; vramGb: number | null } {
  if (!renderer) return { name: null, vramGb: null };
  const name = renderer.replace(/^ANGLE \((.+)\)/, "$1").trim();
  let vramGb: number | null = null;
  if (/rtx 4090|rtx 5090/i.test(name)) vramGb = 24;
  else if (/rtx 4080|rtx 5080/i.test(name)) vramGb = 16;
  else if (/rtx 4070|rtx 3080|rtx 3090/i.test(name)) vramGb = 12;
  else if (/rtx 4060|rtx 3060|rtx 3070/i.test(name)) vramGb = 8;
  else if (/apple m[1-4]/i.test(name)) vramGb = null;
  else if (/iris|uhd graphics|radeon graphics/i.test(name)) vramGb = 0;
  return { name, vramGb };
}

/**
 * Browser `deviceMemory` is capped at 8. Desktops that report the cap are
 * treated as a 16 GB class machine so Recommended can actually be offered.
 * Phones stay conservative.
 */
export function scanHardware(hints: HardwareHints = {}): HardwareReport {
  const ua = hints.userAgent ?? "";
  const platform = hints.platform ?? "";
  const { os, appleSilicon, isMobile } = detectOs(ua, platform);
  const arch = detectArch(ua, appleSilicon, platform);
  const cores = hints.hardwareConcurrency ?? 4;
  const gpu = gpuFromRenderer(hints.webglRenderer ?? null);

  const reported = hints.deviceMemoryGb;
  let totalRamGb: number;
  let availableRamGb: number;
  let ramSource: HardwareReport["ramSource"];

  if (isMobile) {
    totalRamGb = reported && reported > 0 ? reported : 6;
    availableRamGb = Math.max(3, totalRamGb - 1.5);
    ramSource = reported ? "deviceMemory" : "assumed-mobile";
  } else if (reported && reported < 8) {
    totalRamGb = reported;
    availableRamGb = Math.max(2, reported - 1.5);
    ramSource = "deviceMemory";
  } else {
    // Cap or missing: assume 16 GB class desktop.
    totalRamGb = reported && reported > 8 ? reported : 16;
    availableRamGb = Math.max(8, totalRamGb - 3.5);
    ramSource = reported === 8 || reported === undefined ? "assumed-desktop" : "deviceMemory";
  }

  const freeDiskGb = isMobile ? 12 : 180;

  return {
    os,
    arch,
    platformLabel: `${os} ${arch}`,
    totalRamGb,
    availableRamGb,
    ramSource,
    gpuName: gpu.name,
    vramGb: appleSilicon ? null : gpu.vramGb,
    appleSilicon,
    cores,
    freeDiskGb,
    isMobile,
    scannedAt: new Date().toISOString(),
  };
}

export function scanBrowserHardware(): HardwareReport {
  const nav =
    typeof navigator === "undefined"
      ? ({} as Navigator)
      : navigator;
  let renderer: string | null = null;
  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (gl && "getExtension" in gl) {
        const info = (gl as WebGLRenderingContext).getExtension(
          "WEBGL_debug_renderer_info",
        );
        if (info) {
          renderer = (gl as WebGLRenderingContext).getParameter(
            info.UNMASKED_RENDERER_WEBGL,
          ) as string;
        }
      }
    } catch {
      renderer = null;
    }
  }
  const mem = (nav as Navigator & { deviceMemory?: number }).deviceMemory;
  return scanHardware({
    userAgent: nav.userAgent,
    platform: nav.platform,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemoryGb: mem,
    webglRenderer: renderer,
  });
}
