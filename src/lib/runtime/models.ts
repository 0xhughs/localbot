import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { CATALOG, getCatalogModel, hubUrl } from "../catalog.ts";
import { defaultModelsDir, loadConfig, patchConfig } from "../fs/disk.ts";
import type { CatalogModel } from "../types.ts";

export type DownloadStatus = {
  catalogId: string | null;
  status: "idle" | "running" | "paused" | "error" | "done";
  bytesDone: number;
  bytesTotal: number;
  error: string | null;
  dest: string | null;
};

const state: DownloadStatus & { abort: AbortController | null } = {
  catalogId: null,
  status: "idle",
  bytesDone: 0,
  bytesTotal: 0,
  error: null,
  dest: null,
  abort: null,
};

export function modelsDir(): string {
  return loadConfig().modelsDir || defaultModelsDir();
}

export function modelPathFor(model: CatalogModel): string {
  return path.join(modelsDir(), model.filename);
}

export function getDownloadStatus(): DownloadStatus {
  const { abort: _a, ...rest } = state;
  void _a;
  return { ...rest };
}

function isGgufMagic(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).toString("utf8") === "GGUF";
}

export function listModelsOnDisk(): { filename: string; path: string; size: number; catalogId: string | null }[] {
  const dir = modelsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".gguf") && !n.endsWith(".partial"))
    .map((name) => {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      const cat = CATALOG.find((m) => m.filename === name) ?? null;
      return { filename: name, path: p, size: st.size, catalogId: cat?.id ?? null };
    });
}

export function verifyModel(catalogId: string): {
  ok: boolean;
  path?: string;
  error?: string;
  sha256?: string;
} {
  const model = getCatalogModel(catalogId);
  if (!model) return { ok: false, error: `Unknown catalog id ${catalogId}` };
  const dest = modelPathFor(model);
  if (!fs.existsSync(dest)) return { ok: false, error: `No file at ${dest}` };
  const size = fs.statSync(dest).size;
  if (model.sizeBytes > 0 && size !== model.sizeBytes) {
    return {
      ok: false,
      error: `Size mismatch: got ${size}, expected ${model.sizeBytes}`,
    };
  }
  const fd = fs.openSync(dest, "r");
  const head = Buffer.alloc(8);
  fs.readSync(fd, head, 0, 8, 0);
  fs.closeSync(fd);
  if (!isGgufMagic(head)) {
    return { ok: false, error: "File is not a GGUF (missing magic)" };
  }
  let sha256: string | undefined;
  if (model.sha256 && model.sha256.length === 64) {
    sha256 = sha256File(dest);
    if (sha256 !== model.sha256) {
      return { ok: false, error: `sha256 mismatch: ${sha256}`, sha256 };
    }
  }
  patchConfig({ activeModelId: model.id, activeModelPath: dest });
  return { ok: true, path: dest, sha256 };
}

export function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(8 * 1024 * 1024);
  try {
    let n = 0;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

export function importGguf(absolutePath: string, catalogId?: string): {
  ok: boolean;
  path?: string;
  error?: string;
} {
  const src = path.resolve(absolutePath.trim());
  if (!src.endsWith(".gguf")) return { ok: false, error: "Path must be a .gguf file" };
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
    return { ok: false, error: `No file at ${src}` };
  }
  const head = Buffer.alloc(8);
  const fd = fs.openSync(src, "r");
  fs.readSync(fd, head, 0, 8, 0);
  fs.closeSync(fd);
  if (!isGgufMagic(head)) return { ok: false, error: "File is not a GGUF (missing magic)" };

  const dir = modelsDir();
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, path.basename(src));
  if (path.resolve(src) !== path.resolve(dest)) {
    fs.copyFileSync(src, dest);
  }
  const model = catalogId ? getCatalogModel(catalogId) : CATALOG.find((m) => m.filename === path.basename(src));
  patchConfig({
    activeModelId: model?.id ?? catalogId ?? path.basename(src),
    activeModelPath: dest,
  });
  return { ok: true, path: dest };
}

export function streamHubDownload(
  url: string,
  destPartial: string,
  startAt: number,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent": "LocalBot/1.0",
          ...(startAt > 0 ? { Range: `bytes=${startAt}-` } : {}),
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          streamHubDownload(res.headers.location, destPartial, startAt, onProgress, signal)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`Hub HTTP ${res.statusCode ?? 0}`));
          res.resume();
          return;
        }
        const totalHeader = Number(res.headers["content-length"] ?? 0);
        const total =
          res.statusCode === 206 ? startAt + totalHeader : totalHeader || startAt + totalHeader;
        const flags = startAt > 0 && res.statusCode === 206 ? "a" : "w";
        const out = fs.createWriteStream(destPartial, { flags });
        let done = flags === "a" ? startAt : 0;
        res.on("data", (chunk: Buffer) => {
          done += chunk.length;
          onProgress(done, total || done);
        });
        res.pipe(out);
        out.on("finish", () => resolve());
        out.on("error", reject);
        res.on("error", reject);
        signal.addEventListener("abort", () => {
          req.destroy();
          res.destroy();
          out.close();
          reject(Object.assign(new Error("paused"), { paused: true }));
        });
      },
    );
    req.on("error", reject);
    signal.addEventListener("abort", () => req.destroy());
  });
}

export async function startDownload(catalogId: string): Promise<DownloadStatus> {
  const model = getCatalogModel(catalogId);
  if (!model) {
    state.status = "error";
    state.error = `Unknown catalog id ${catalogId}`;
    return getDownloadStatus();
  }
  if (!model.downloadable) {
    state.status = "error";
    state.error = `${model.name} is listed but not downloadable in this build.`;
    return getDownloadStatus();
  }
  if (state.status === "running") return getDownloadStatus();

  const dir = modelsDir();
  fs.mkdirSync(dir, { recursive: true });
  const dest = modelPathFor(model);
  const partial = dest + ".partial";
  if (fs.existsSync(dest) && fs.statSync(dest).size === model.sizeBytes) {
    state.catalogId = catalogId;
    state.status = "done";
    state.bytesDone = model.sizeBytes;
    state.bytesTotal = model.sizeBytes;
    state.dest = dest;
    state.error = null;
    patchConfig({ activeModelId: model.id, activeModelPath: dest });
    return getDownloadStatus();
  }

  const startAt = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
  const ac = new AbortController();
  state.abort = ac;
  state.catalogId = catalogId;
  state.status = "running";
  state.bytesDone = startAt;
  state.bytesTotal = model.sizeBytes;
  state.dest = dest;
  state.error = null;

  const url = hubUrl(model);
  void streamHubDownload(
    url,
    partial,
    startAt,
    (done, total) => {
      state.bytesDone = done;
      state.bytesTotal = total || model.sizeBytes;
    },
    ac.signal,
  )
    .then(() => {
      if (!fs.existsSync(partial)) throw new Error("Download produced no file");
      fs.renameSync(partial, dest);
      const verified = verifyModel(catalogId);
      if (!verified.ok) {
        state.status = "error";
        state.error = verified.error ?? "verify failed";
        return;
      }
      state.status = "done";
      state.bytesDone = fs.statSync(dest).size;
      state.dest = dest;
    })
    .catch((err: Error & { paused?: boolean }) => {
      if (err.paused || ac.signal.aborted) {
        state.status = "paused";
        state.error = null;
        return;
      }
      state.status = "error";
      state.error = err.message || "Download failed";
    });

  return getDownloadStatus();
}

export function pauseDownload(): DownloadStatus {
  state.abort?.abort();
  if (state.status === "running") state.status = "paused";
  return getDownloadStatus();
}

export async function resumeDownload(): Promise<DownloadStatus> {
  if (!state.catalogId) return getDownloadStatus();
  return startDownload(state.catalogId);
}

export function findReadyModel(): { catalogId: string; path: string; name: string } | null {
  const cfg = loadConfig();
  if (cfg.activeModelPath && fs.existsSync(cfg.activeModelPath)) {
    const model = cfg.activeModelId ? getCatalogModel(cfg.activeModelId) : undefined;
    return {
      catalogId: cfg.activeModelId ?? path.basename(cfg.activeModelPath),
      path: cfg.activeModelPath,
      name: model?.name ?? path.basename(cfg.activeModelPath),
    };
  }
  for (const m of CATALOG) {
    const p = modelPathFor(m);
    if (fs.existsSync(p) && (m.sizeBytes === 0 || fs.statSync(p).size === m.sizeBytes)) {
      patchConfig({ activeModelId: m.id, activeModelPath: p });
      return { catalogId: m.id, path: p, name: m.name };
    }
  }
  const disk = listModelsOnDisk()[0];
  if (disk) {
    patchConfig({ activeModelId: disk.catalogId, activeModelPath: disk.path });
    return {
      catalogId: disk.catalogId ?? disk.filename,
      path: disk.path,
      name: disk.filename,
    };
  }
  return null;
}
