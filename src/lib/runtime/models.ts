/**
 * GGUF files on disk: download, import, verification and activation.
 *
 * Stage 6 rule: a file becomes loadable only through `activateModel`, which
 * runs the one verifier (`verifyGgufFile`: size when the catalog knows it,
 * GGUF magic, sha256 when the catalog knows it — required for every
 * downloadable row) and records the result in `localbot-config.json`
 * `verifiedModels`. Download completion, "already on disk", `findReadyModel`
 * and import all go through it; a mismatch leaves `activeModelPath` alone.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { CATALOG, getCatalogModel, hubUrl } from "../catalog.ts";
import { defaultModelsDir, loadConfig, patchConfig } from "../fs/disk.ts";
import { readAgent, requireFolders } from "../fs/scopes.ts";
import type { CatalogModel, VerifiedModel } from "../types.ts";

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

export function isGgufMagic(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).toString("utf8") === "GGUF";
}

function readMagic(file: string): Buffer {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(8);
    fs.readSync(fd, head, 0, 8, 0);
    return head;
  } finally {
    fs.closeSync(fd);
  }
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

const SHA256_RE = /^[0-9a-f]{64}$/;

export function catalogModelForFile(filename: string): CatalogModel | undefined {
  return CATALOG.find((m) => m.filename === filename);
}

/** The id agents store in agent.json: the catalog id, or the bare filename for an imported file. */
export function modelIdForFile(filename: string): string {
  return catalogModelForFile(filename)?.id ?? filename;
}

export type VerifyOk = { ok: true; path: string; sha256: string; size: number; catalogId: string | null };
export type VerifyFail = { ok: false; error: string; sha256?: string; path?: string };
export type VerifyResult = VerifyOk | VerifyFail;

/**
 * The one verifier. `expected` comes from the catalog row when there is one:
 * size must match when known; sha256 must match when known; a downloadable
 * catalog row without a sha256 is refused outright (the catalog is wrong, not
 * the file). The hash is always computed so imported files are recorded too.
 */
export function verifyGgufFile(
  absPath: string,
  expected: { sizeBytes?: number; sha256?: string; catalogId?: string | null; downloadable?: boolean } = {},
): VerifyResult {
  const dest = path.resolve(absPath);
  if (!fs.existsSync(dest) || !fs.statSync(dest).isFile()) return { ok: false, error: `No file at ${dest}`, path: dest };
  const size = fs.statSync(dest).size;
  if (expected.sizeBytes && expected.sizeBytes > 0 && size !== expected.sizeBytes) {
    return { ok: false, error: `Size mismatch: got ${size}, expected ${expected.sizeBytes}`, path: dest };
  }
  if (!isGgufMagic(readMagic(dest))) {
    return { ok: false, error: "File is not a GGUF (missing magic)", path: dest };
  }
  const want = (expected.sha256 ?? "").toLowerCase();
  if (expected.downloadable && !SHA256_RE.test(want)) {
    return {
      ok: false,
      error: `Catalog row ${expected.catalogId ?? "?"} has no sha256; refusing to activate an unverifiable download.`,
      path: dest,
    };
  }
  if (want && !SHA256_RE.test(want)) {
    return { ok: false, error: `Catalog row ${expected.catalogId ?? "?"} has a malformed sha256.`, path: dest };
  }
  const sha256 = sha256File(dest);
  if (want && sha256 !== want) {
    return { ok: false, error: `sha256 mismatch: got ${sha256}, expected ${want}`, sha256, path: dest };
  }
  return { ok: true, path: dest, sha256, size, catalogId: expected.catalogId ?? null };
}

function expectedFor(model: CatalogModel | null | undefined) {
  return model
    ? { sizeBytes: model.sizeBytes, sha256: model.sha256, catalogId: model.id, downloadable: model.downloadable }
    : {};
}

let lastActivateError: string | null = null;
export function lastModelError(): string | null {
  return lastActivateError;
}

/**
 * Verify, record in `verifiedModels`, and make the file the global active
 * model. On any failure the config is untouched (activeModelPath stays).
 */
export function activateModel(absPath: string, model?: CatalogModel | null): VerifyResult {
  const cat = model ?? catalogModelForFile(path.basename(absPath)) ?? null;
  const r = verifyGgufFile(absPath, expectedFor(cat));
  if (!r.ok) {
    lastActivateError = r.error;
    return r;
  }
  lastActivateError = null;
  recordVerified(r, cat?.id ?? null);
  patchConfig({ activeModelId: cat?.id ?? path.basename(r.path), activeModelPath: r.path });
  return r;
}

function recordVerified(r: VerifyOk, catalogId: string | null): void {
  const cfg = loadConfig();
  const rec: VerifiedModel = {
    sha256: r.sha256,
    size: r.size,
    mtimeMs: fs.statSync(r.path).mtimeMs,
    catalogId,
    verifiedAt: new Date().toISOString(),
  };
  patchConfig({ verifiedModels: { ...cfg.verifiedModels, [r.path]: rec } });
}

/** A record still describes the file on disk: same size, not written since. */
function recordCurrent(rec: VerifiedModel | undefined, st: fs.Stats, cat: CatalogModel | null): rec is VerifiedModel {
  if (!rec) return false;
  if (rec.size !== st.size || rec.mtimeMs !== st.mtimeMs) return false;
  return !cat?.sha256 || rec.sha256 === cat.sha256.toLowerCase();
}

/**
 * A file counts as verified when `verifiedModels` has it and the size on disk
 * still matches. Files never seen before are hashed once here (existing
 * installs from before Stage 6) and recorded; failures are reported, never
 * activated.
 */
export function ensureVerified(absPath: string, model?: CatalogModel | null): VerifyResult {
  const dest = path.resolve(absPath);
  if (!fs.existsSync(dest)) return { ok: false, error: `No file at ${dest}`, path: dest };
  const cat = model ?? catalogModelForFile(path.basename(dest)) ?? null;
  const rec = loadConfig().verifiedModels[dest];
  const st = fs.statSync(dest);
  if (recordCurrent(rec, st, cat)) {
    return { ok: true, path: dest, sha256: rec.sha256, size: st.size, catalogId: cat?.id ?? rec.catalogId };
  }
  const r = verifyGgufFile(dest, expectedFor(cat));
  if (r.ok) recordVerified(r, cat?.id ?? null);
  else lastActivateError = r.error;
  return r;
}

export function listModelsOnDisk(): {
  filename: string;
  path: string;
  size: number;
  catalogId: string | null;
  /** Catalog id, or the filename for imported files — what agent.json.modelId holds. */
  modelId: string;
  name: string;
  verified: boolean;
  sha256: string | null;
}[] {
  const dir = modelsDir();
  if (!fs.existsSync(dir)) return [];
  const verified = loadConfig().verifiedModels;
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".gguf") && !n.endsWith(".partial"))
    .sort()
    .map((name) => {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      const cat = catalogModelForFile(name) ?? null;
      const rec = verified[p];
      const ok = recordCurrent(rec, st, cat);
      return {
        filename: name,
        path: p,
        size: st.size,
        catalogId: cat?.id ?? null,
        modelId: cat?.id ?? name,
        name: cat?.name ?? name,
        verified: ok,
        sha256: ok && rec ? rec.sha256 : null,
      };
    });
}

/** Verify + activate a catalog row's file (the wizard's Continue gate). */
export function verifyModel(catalogId: string): VerifyResult {
  const model = getCatalogModel(catalogId);
  if (!model) return { ok: false, error: `Unknown catalog id ${catalogId}` };
  return activateModel(modelPathFor(model), model);
}

/**
 * Copy a GGUF into the models folder and activate it. The catalog id is
 * adopted only when the file *is* that catalog row (same filename); any other
 * file is registered under its own filename so the badge and agent.json name
 * the real file, not the wizard card.
 */
export function importGguf(
  absolutePath: string,
  catalogId?: string,
): { ok: true; path: string; modelId: string; catalogId: string | null; name: string; sha256: string } | { ok: false; error: string } {
  const src = path.resolve(absolutePath.trim());
  if (!src.endsWith(".gguf")) return { ok: false, error: "Path must be a .gguf file" };
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
    return { ok: false, error: `No file at ${src}` };
  }
  if (!isGgufMagic(readMagic(src))) return { ok: false, error: "File is not a GGUF (missing magic)" };

  const base = path.basename(src);
  const hinted = catalogId ? getCatalogModel(catalogId) : undefined;
  const model = hinted && hinted.filename === base ? hinted : (catalogModelForFile(base) ?? null);

  const dir = modelsDir();
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, base);
  if (path.resolve(src) !== path.resolve(dest)) {
    fs.copyFileSync(src, dest);
  }
  const r = activateModel(dest, model);
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    path: dest,
    modelId: model?.id ?? base,
    catalogId: model?.id ?? null,
    name: model?.name ?? base,
    sha256: r.sha256,
  };
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
    // Already on disk: same verifier as a fresh download; no blind activate.
    const verified = activateModel(dest, model);
    state.catalogId = catalogId;
    state.bytesDone = model.sizeBytes;
    state.bytesTotal = model.sizeBytes;
    state.dest = dest;
    if (verified.ok) {
      state.status = "done";
      state.error = null;
    } else {
      state.status = "error";
      state.error = `${verified.error}. Delete ${path.basename(dest)} to download it again.`;
    }
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
      const verified = activateModel(dest, model);
      if (!verified.ok) {
        state.status = "error";
        state.error = verified.error;
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

export type ReadyModel = { catalogId: string; modelId: string; path: string; name: string; sha256: string };

/**
 * The global active model: the configured file if it verifies, else the
 * first catalog file on disk that verifies, else the first verified GGUF in
 * the models folder. Nothing is activated without passing the verifier.
 */
export function findReadyModel(): ReadyModel | null {
  const cfg = loadConfig();
  if (cfg.activeModelPath && fs.existsSync(cfg.activeModelPath)) {
    const model = cfg.activeModelId ? getCatalogModel(cfg.activeModelId) : undefined;
    const cat = model && model.filename === path.basename(cfg.activeModelPath) ? model : catalogModelForFile(path.basename(cfg.activeModelPath));
    const v = ensureVerified(cfg.activeModelPath, cat ?? null);
    if (v.ok) {
      const base = path.basename(v.path);
      return {
        catalogId: cat?.id ?? base,
        modelId: cat?.id ?? base,
        path: v.path,
        name: cat?.name ?? base,
        sha256: v.sha256,
      };
    }
  }
  for (const m of CATALOG) {
    const p = modelPathFor(m);
    if (!fs.existsSync(p)) continue;
    const v = activateModel(p, m);
    if (v.ok) return { catalogId: m.id, modelId: m.id, path: p, name: m.name, sha256: v.sha256 };
  }
  for (const disk of listModelsOnDisk()) {
    if (disk.catalogId) continue;
    const v = activateModel(disk.path, null);
    if (v.ok) return { catalogId: disk.filename, modelId: disk.filename, path: disk.path, name: disk.filename, sha256: v.sha256 };
  }
  return null;
}

/** Resolve a stored model id (catalog id or imported filename) to a file in the models folder. */
export function modelFileForId(modelId: string): { path: string; model: CatalogModel | null; name: string } | null {
  if (!modelId) return null;
  const cat = getCatalogModel(modelId);
  if (cat) return { path: modelPathFor(cat), model: cat, name: cat.name };
  if (!modelId.endsWith(".gguf") || modelId.includes("/") || modelId.includes("\\") || modelId.includes("..")) return null;
  return { path: path.join(modelsDir(), modelId), model: catalogModelForFile(modelId) ?? null, name: modelId };
}

export type AgentModelResolution = {
  agentName: string;
  /** What agent.json says. */
  modelId: string;
  /** The file that this agent's next turn will load, or null when nothing on disk verifies. */
  path: string | null;
  name: string;
  source: "agent" | "fallback" | "none";
  /** Why the agent is not on its own model (missing / unverified) — shown in the header. */
  notice: string | null;
};

/**
 * Per-agent model (Stage 6): `agent.json.modelId` names the file this agent
 * loads. If that file is not on disk or does not verify, the global active
 * model is used and the reason is reported — never silently.
 */
export function resolveModelForAgent(agentName: string): AgentModelResolution {
  let modelId = "";
  try {
    modelId = readAgent(requireFolders(), agentName)?.modelId ?? "";
  } catch {
    modelId = "";
  }
  const wanted = modelFileForId(modelId);
  if (wanted && fs.existsSync(wanted.path)) {
    const v = ensureVerified(wanted.path, wanted.model);
    if (v.ok) return { agentName, modelId, path: v.path, name: wanted.name, source: "agent", notice: null };
    const fb = findReadyModel();
    return {
      agentName,
      modelId,
      path: fb?.path ?? null,
      name: fb?.name ?? wanted.name,
      source: fb ? "fallback" : "none",
      notice: `${agentName}'s model ${wanted.name} failed verification (${v.error})${fb ? `; using ${fb.name}` : ""}.`,
    };
  }
  const fb = findReadyModel();
  if (!modelId) {
    return {
      agentName,
      modelId,
      path: fb?.path ?? null,
      name: fb?.name ?? "Local GGUF",
      source: fb ? "fallback" : "none",
      notice: fb ? `${agentName} has no model set; using ${fb.name}.` : "No verified GGUF on disk.",
    };
  }
  return {
    agentName,
    modelId,
    path: fb?.path ?? null,
    name: fb?.name ?? (wanted?.name ?? modelId),
    source: fb ? "fallback" : "none",
    notice: `${agentName}'s model ${wanted?.name ?? modelId} is not on disk${fb ? `; using ${fb.name}` : ""}.`,
  };
}
