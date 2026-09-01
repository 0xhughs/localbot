/**
 * llama.cpp binary resolver + spawn for the Electron main process.
 * Asset names come from catalog/llama-assets.json (same source as the UI server).
 */
import childProcess from "node:child_process";
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

export function llamaAssetFor(platform = process.platform, arch = process.arch) {
  const t = llamaTarget(platform, arch);
  if (!t) return null;
  const row = assetsFile.targets[t];
  return row ? { target: t, ...row } : null;
}

export function llamaBinDir(dataDir) {
  const t = llamaTarget() ?? `${process.platform}-${process.arch}`;
  return path.join(dataDir, "bin", t);
}

export function llamaServerName() {
  return process.platform === "win32" ? "llama-server.exe" : "llama-server";
}

function walkForBinary(root, name, depth = 0) {
  if (depth > 4) return null;
  const direct = path.join(root, name);
  if (fs.existsSync(direct)) return direct;
  let entries = [];
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

function extractArchive(archive, dest, kind) {
  fs.mkdirSync(dest, { recursive: true });
  if (kind === "tar.gz") {
    childProcess.execSync(`tar --no-same-owner -xzf ${JSON.stringify(archive)} -C ${JSON.stringify(dest)}`, {
      stdio: "ignore",
    });
    return;
  }
  if (process.platform === "win32") {
    childProcess.execSync(
      `powershell -NoProfile -Command "Expand-Archive -Force -Path ${JSON.stringify(archive)} -DestinationPath ${JSON.stringify(dest)}"`,
      { stdio: "ignore" },
    );
    return;
  }
  try {
    childProcess.execSync(`unzip -o ${JSON.stringify(archive)} -d ${JSON.stringify(dest)}`, { stdio: "ignore" });
  } catch {
    childProcess.execSync(
      `python3 -c "import zipfile; zipfile.ZipFile(${JSON.stringify(archive)}).extractall(${JSON.stringify(dest)})"`,
      { stdio: "ignore" },
    );
  }
}

export async function ensureLlamaBinary(dataDir) {
  const dir = llamaBinDir(dataDir);
  const name = llamaServerName();
  const existing = path.join(dir, name);
  if (fs.existsSync(existing)) return { ok: true, bin: existing };
  const asset = llamaAssetFor();
  if (!asset) {
    return { ok: false, error: `No llama.cpp binary for ${process.platform}-${process.arch}` };
  }
  fs.mkdirSync(dir, { recursive: true });
  const archivePath = path.join(path.dirname(dir), asset.filename);
  try {
    const res = await fetch(asset.url, { redirect: "follow" });
    if (!res.ok) return { ok: false, error: `Failed to fetch llama.cpp binary (${res.status})` };
    fs.writeFileSync(archivePath, Buffer.from(await res.arrayBuffer()));
    extractArchive(archivePath, dir, asset.kind);
    let found = walkForBinary(dir, asset.binary);
    if (!found) found = walkForBinary(path.dirname(dir), asset.binary);
    if (!found) return { ok: false, error: `Extracted ${asset.filename} but ${asset.binary} is missing` };
    const dest = path.join(dir, asset.binary);
    if (path.resolve(found) !== path.resolve(dest)) fs.copyFileSync(found, dest);
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

export async function pingLocal(host = LOOPBACK_HOST, port = LOOPBACK_PORT) {
  try {
    const res = await fetch(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
}

let child = null;

export async function spawnLlamaServer({ dataDir, modelPath }) {
  if (await pingLocal()) return { ok: true, reused: true };
  if (!modelPath || !fs.existsSync(modelPath)) {
    return { ok: false, error: "Local model not ready" };
  }
  const bin = await ensureLlamaBinary(dataDir);
  if (!bin.ok) return bin;
  child = childProcess.spawn(
    bin.bin,
    [
      "-m",
      modelPath,
      "--host",
      LOOPBACK_HOST,
      "--port",
      String(LOOPBACK_PORT),
      "-c",
      "4096",
      "-t",
      "4",
      "--n-gpu-layers",
      "0",
      "--jinja",
    ],
    {
      cwd: path.dirname(bin.bin),
      env: {
        ...process.env,
        LD_LIBRARY_PATH: path.dirname(bin.bin),
        DYLD_LIBRARY_PATH: path.dirname(bin.bin),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.on("exit", () => {
    child = null;
  });
  const start = Date.now();
  while (Date.now() - start < 90000) {
    if (await pingLocal()) return { ok: true, reused: false };
    await new Promise((r) => setTimeout(r, 400));
  }
  child?.kill();
  child = null;
  return { ok: false, error: "llama-server failed to start" };
}

export function stopLlamaServer() {
  if (child) {
    child.kill();
    child = null;
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
