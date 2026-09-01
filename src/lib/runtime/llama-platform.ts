import assetsFile from "../../../catalog/llama-assets.json" with { type: "json" };

export const LLAMA_RELEASE: string = assetsFile.release;

export type LlamaTarget = "darwin-arm64" | "darwin-x64" | "win32-x64" | "linux-x64";

export type LlamaAsset = {
  target: LlamaTarget;
  url: string;
  filename: string;
  kind: "tar.gz" | "zip";
  binary: "llama-server" | "llama-server.exe";
};

const ASSETS: Record<LlamaTarget, LlamaAsset> = {
  "linux-x64": row("linux-x64"),
  "darwin-arm64": row("darwin-arm64"),
  "darwin-x64": row("darwin-x64"),
  "win32-x64": row("win32-x64"),
};

function row(target: LlamaTarget): LlamaAsset {
  const t = assetsFile.targets[target];
  return {
    target,
    url: t.url,
    filename: t.filename,
    kind: t.kind as "tar.gz" | "zip",
    binary: t.binary as LlamaAsset["binary"],
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

export function llamaAssetFor(
  platform?: NodeJS.Platform | string,
  arch?: string,
): LlamaAsset | null {
  const t = llamaTarget(platform, arch);
  return t ? ASSETS[t] : null;
}

export function llamaAssetMap(): Record<LlamaTarget, string> {
  return {
    "darwin-arm64": ASSETS["darwin-arm64"].filename,
    "darwin-x64": ASSETS["darwin-x64"].filename,
    "win32-x64": ASSETS["win32-x64"].filename,
    "linux-x64": ASSETS["linux-x64"].filename,
  };
}

export { ASSETS as LLAMA_ASSETS };
