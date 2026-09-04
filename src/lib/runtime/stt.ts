/**
 * Stage 9 — hold-to-talk speech-to-text with whisper.cpp, local only.
 *
 *   - `catalog/whisper-assets.json` pins ggml-org/whisper.cpp v1.9.2 CLI
 *     archives (linux-x64, win32-x64; sha256 per row) and the ggml models
 *     (sha256 from a real download). darwin has no CLI asset upstream, so
 *     Stage 10 adds a `kind: "built"` row (darwin-arm64): whisper-cli compiled
 *     from the pinned source tag by `scripts/build-whisper-mac.mjs` into the
 *     same `bin/{target}/whisper/` folder, with `whisper-build.json` beside
 *     it. A built row is never downloaded: the Mic is on only when that
 *     binary exists and matches its manifest (same tag, same sha256).
 *     Targets without a row (darwin-x64) stay NOT BUILT and the UI says so.
 *   - the runtime is unpacked flat into `{binRoot}/{target}/whisper/`, a
 *     sibling of the llama.cpp `bin/{target}/{runtime}/` trees. Both ship a
 *     libggml; they must never share a folder, so `assertWhisperExe` refuses
 *     to spawn anything sitting in a llama runtime dir.
 *   - one-shot `whisper-cli -m <model> -f <wav> -l en -nt -np`, stdout is the
 *     transcript. Never whisper-server, never a second loopback port.
 *   - the clip is a RIFF/WAVE PCM16 mono 16 kHz file under ~60 s / ~2 MB
 *     (`validateSttWav`), written to `{dataDir}/stt/{uuid}.wav` — outside
 *     every scope root — and deleted in `finally`, success or not.
 *   - one job at a time; 60 s → SIGKILL. The transcript is returned to the
 *     caller and never logged. Nothing here talks to the DeepSeek Harness.
 */
import childProcess, { type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import assetsFile from "../../../catalog/whisper-assets.json" with { type: "json" };
import type { FoldersConfig } from "../fs/scope-model.ts";
import { dataDir, defaultModelsDir, isUnderDir, llamaBinRoot, loadConfig } from "../fs/disk.ts";
import { LLAMA_RUNTIME_IDS } from "./llama-platform.ts";
import { validateSttWav, type WavInfo } from "../audio/wav.ts";

export const WHISPER_RELEASE: string = assetsFile.release;
export const STT_LANGUAGE = "en" as const;
export const STT_TIMEOUT_MS = 60_000;
/** ggml file magic: bytes "lmgg" (0x67676d6c little-endian). Not GGUF; never `verifyGgufFile`. */
export const GGML_MAGIC = Buffer.from([0x6c, 0x6d, 0x67, 0x67]);

export type WhisperTarget = "linux-x64" | "win32-x64" | "darwin-arm64" | "darwin-x64";
const KNOWN_TARGETS: readonly WhisperTarget[] = ["linux-x64", "win32-x64", "darwin-arm64", "darwin-x64"];

export type WhisperRuntimeAsset = {
  target: WhisperTarget;
  /** Archive name for downloaded rows; the binary name for built rows. */
  filename: string;
  /** `tar.gz` / `zip` rows are downloaded and unpacked; `built` rows are compiled on the host by `build`. */
  kind: "tar.gz" | "zip" | "built";
  binary: string;
  sizeBytes: number;
  sha256: string;
  /** Release asset URL; null on built rows (nothing to download, nothing invented). */
  url: string | null;
  /** Built rows only: the pinned source and configure line. */
  source: { repo: string; tag: string; commit: string } | null;
  cmake: string[];
  build: string | null;
};

/** Name of the manifest `scripts/build-whisper-mac.mjs` writes beside a built whisper-cli. */
export const WHISPER_BUILD_MANIFEST = "whisper-build.json";

export type WhisperBuildManifest = {
  release: string;
  commit: string;
  target: string;
  binary: string;
  sha256: string;
  sizeBytes: number;
  cmake: string[];
  dylibs: string[];
};

export type WhisperModelAsset = {
  id: string;
  label: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  ramGb: number;
  url: string;
};

type RawTarget = {
  filename?: string;
  kind: string;
  binary: string;
  sizeBytes: number;
  sha256: string;
  url?: string;
  source?: { repo: string; tag: string; commit: string };
  cmake?: string[];
  build?: string;
};
type RawModel = { label: string; filename: string; sizeBytes: number; sha256: string; ramGb?: number; url: string };

const RAW_TARGETS = assetsFile.targets as Record<string, RawTarget>;
const RAW_MODELS = assetsFile.models as Record<string, RawModel>;
export const WHISPER_DEFAULT_MODEL: string = assetsFile.defaultModel;

/** Targets with a row in the catalog (downloaded or built), in catalog order. */
export const WHISPER_TARGETS: readonly WhisperTarget[] = Object.keys(RAW_TARGETS).filter((k): k is WhisperTarget =>
  (KNOWN_TARGETS as readonly string[]).includes(k),
);

// ── catalog ──────────────────────────────────────────────────────────────────

function targetKey(platform: string, arch: string): string {
  const p = String(platform);
  const a = String(arch);
  const normArch = a === "x86_64" ? "x64" : a === "aarch64" ? "arm64" : a;
  return `${p}-${normArch}`;
}

/** The catalog row key for this host, or null when no row (downloaded or built) is pinned for it. */
export function whisperTarget(platform: string = process.platform, arch: string = process.arch): WhisperTarget | null {
  const key = targetKey(platform, arch);
  return (WHISPER_TARGETS as readonly string[]).includes(key) ? (key as WhisperTarget) : null;
}

/** Why the Mic is off on this host, or null when a whisper-cli row is pinned for it. */
export function whisperUnsupportedReason(platform: string = process.platform, arch: string = process.arch): string | null {
  if (whisperTarget(platform, arch)) return null;
  if (String(platform) === "darwin") {
    return `Voice input is NOT BUILT for macOS ${arch}: whisper.cpp ${WHISPER_RELEASE} ships an xcframework, not a whisper-cli binary, and no ${targetKey(platform, arch)} row is pinned in catalog/whisper-assets.json (npm run build:whisper-mac builds one from source).`;
  }
  return `Voice input is NOT BUILT for ${platform}-${arch}: no whisper-cli asset is pinned in catalog/whisper-assets.json.`;
}

/** Built rows only: the message shown while the compiled binary is not on this machine yet. */
export function whisperNotBuiltReason(target: WhisperTarget, dir: string): string {
  const r = RAW_TARGETS[target];
  return `Voice input is NOT BUILT on this Mac yet: whisper-cli must be compiled from whisper.cpp ${WHISPER_RELEASE} source (${r?.build ?? "npm run build:whisper-mac"}) into ${dir}.`;
}

export function whisperRuntimeAsset(target: WhisperTarget | null = whisperTarget()): WhisperRuntimeAsset | null {
  if (!target) return null;
  const r = RAW_TARGETS[target];
  if (!r) return null;
  const kind = r.kind as WhisperRuntimeAsset["kind"];
  return {
    target,
    filename: r.filename ?? r.binary,
    kind,
    binary: r.binary,
    sizeBytes: r.sizeBytes,
    sha256: String(r.sha256 ?? "").toLowerCase(),
    url: kind === "built" ? null : (r.url ?? null),
    source: r.source ?? null,
    cmake: r.cmake ?? [],
    build: r.build ?? null,
  };
}

export function whisperModelAsset(id: string = WHISPER_DEFAULT_MODEL): WhisperModelAsset | null {
  const m = RAW_MODELS[id];
  if (!m) return null;
  return {
    id,
    label: m.label,
    filename: m.filename,
    sizeBytes: m.sizeBytes,
    sha256: String(m.sha256 ?? "").toLowerCase(),
    ramGb: typeof m.ramGb === "number" ? m.ramGb : 0.5,
    url: m.url,
  };
}

export function whisperModelIds(): string[] {
  return Object.keys(RAW_MODELS);
}

// ── paths ────────────────────────────────────────────────────────────────────

export function whisperCliName(platform: string = process.platform): string {
  return platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
}

/**
 * `{binRoot}/{target}/whisper/` — the same `bin/` root llama.cpp uses, but a
 * folder of its own beside the runtime dirs, never one of them.
 */
export function whisperDir(target: WhisperTarget | string = whisperTarget() ?? `${process.platform}-${process.arch}`): string {
  return path.join(llamaBinRoot(), target, "whisper");
}

export function whisperCliPath(target?: WhisperTarget): string {
  return path.join(whisperDir(target), whisperCliName());
}

/** ggml models live beside the GGUFs in their own subfolder so the GGUF lister never sees them. */
export function whisperModelsDir(): string {
  const base = loadConfig().modelsDir || defaultModelsDir();
  return path.join(base, "whisper");
}

export function whisperModelPath(id: string = WHISPER_DEFAULT_MODEL): string | null {
  const m = whisperModelAsset(id);
  return m ? path.join(whisperModelsDir(), m.filename) : null;
}

/** Scratch folder for the clip: `{dataDir}/stt/`. LocalBot metadata, never work product. */
export function sttDir(): string {
  return path.join(dataDir(), "stt");
}

/** Refuse when `{dataDir}/stt` sits inside any configured scope root. */
export function assertSttOutsideScopes(folders: FoldersConfig | null | undefined, dir: string = sttDir()): void {
  if (!folders) return;
  for (const root of [folders.employeeRoot, folders.employeeShared, folders.departmentShared, folders.companyShared]) {
    if (root && isUnderDir(root, dir)) {
      throw new Error(`Refusing to write voice clips under a scope folder (${root}). Move LOCALBOT_DATA_DIR out of the work folders.`);
    }
  }
}

/**
 * The executable must sit in a `…/whisper/` folder that holds no
 * llama-server. `bin/{target}/{runtime}/` is a llama.cpp tree with its own
 * libggml; loading whisper's libs there (or llama's into whisper) is the
 * collision this layout exists to avoid.
 */
export function assertWhisperExe(exe: string): void {
  const dir = path.resolve(path.dirname(exe));
  const base = path.basename(dir);
  if (base !== "whisper") {
    throw new Error(`whisper-cli must live in a whisper/ folder, not ${dir}`);
  }
  if ((LLAMA_RUNTIME_IDS as readonly string[]).includes(path.basename(path.dirname(dir)))) {
    throw new Error(`whisper-cli must not live inside a llama.cpp runtime dir: ${dir}`);
  }
  for (const name of ["llama-server", "llama-server.exe"]) {
    if (fs.existsSync(path.join(dir, name))) {
      throw new Error(`Refusing to spawn whisper-cli from a folder that also holds ${name}: ${dir}`);
    }
  }
}

// ── verification ─────────────────────────────────────────────────────────────

function sha256File(file: string): string {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(1024 * 1024);
    let n = 0;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function hasGgmlMagic(file: string): boolean {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(4);
    const n = fs.readSync(fd, head, 0, 4, 0);
    return n === 4 && head.equals(GGML_MAGIC);
  } finally {
    fs.closeSync(fd);
  }
}

export type VerifyResult = { ok: true; path: string; sha256: string; size: number } | { ok: false; error: string };

function expectSha(row: { sha256: string; filename: string }): { ok: true } | { ok: false; error: string } {
  if (!/^[0-9a-f]{64}$/.test(row.sha256)) {
    return { ok: false, error: `catalog/whisper-assets.json row ${row.filename} has no sha256; refusing an unverifiable download.` };
  }
  return { ok: true };
}

/** Model gate: size, ggml magic, sha256 — all from the catalog. Never `verifyGgufFile`. */
export function verifyWhisperModel(file: string, asset: WhisperModelAsset): VerifyResult {
  const want = expectSha(asset);
  if (!want.ok) return want;
  if (!fs.existsSync(file)) return { ok: false, error: `Model file is missing: ${file}` };
  const size = fs.statSync(file).size;
  if (asset.sizeBytes > 0 && size !== asset.sizeBytes) {
    return { ok: false, error: `${asset.filename}: size ${size} ≠ catalog ${asset.sizeBytes}` };
  }
  if (!hasGgmlMagic(file)) return { ok: false, error: `${asset.filename}: not a ggml model (missing magic)` };
  const sha256 = sha256File(file);
  if (sha256 !== asset.sha256) return { ok: false, error: `${asset.filename}: sha256 mismatch (got ${sha256}, expected ${asset.sha256})` };
  return { ok: true, path: file, sha256, size };
}

/**
 * Built rows (darwin): the binary must sit beside the `whisper-build.json`
 * its build wrote, that manifest must name this catalog's release tag and
 * this target, and the file on disk must hash to the manifest's sha256. The
 * catalog's own sha256 is the author's build and is reported, not enforced —
 * a different clang produces a different, equally valid binary.
 */
export function verifyBuiltWhisper(exe: string, asset: WhisperRuntimeAsset): VerifyResult & { manifest?: WhisperBuildManifest; matchesCatalog?: boolean } {
  if (asset.kind !== "built") return { ok: false, error: `${asset.target} is not a built row.` };
  if (!fs.existsSync(exe)) return { ok: false, error: whisperNotBuiltReason(asset.target, path.dirname(exe)) };
  const manifestPath = path.join(path.dirname(exe), WHISPER_BUILD_MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, error: `${exe} has no ${WHISPER_BUILD_MANIFEST} beside it; rebuild with ${asset.build ?? "npm run build:whisper-mac"}.` };
  }
  let manifest: WhisperBuildManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as WhisperBuildManifest;
  } catch (err) {
    return { ok: false, error: `${manifestPath} is not JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (manifest.release !== WHISPER_RELEASE) {
    return { ok: false, error: `${manifestPath} says whisper.cpp ${manifest.release}; the catalog pins ${WHISPER_RELEASE}. Rebuild.` };
  }
  if (manifest.target !== asset.target) return { ok: false, error: `${manifestPath} was built for ${manifest.target}, not ${asset.target}.` };
  if (asset.source && manifest.commit !== asset.source.commit) {
    return { ok: false, error: `${manifestPath} was built from ${manifest.commit}, not the pinned ${asset.source.commit}.` };
  }
  if (!/^[0-9a-f]{64}$/.test(String(manifest.sha256 ?? ""))) return { ok: false, error: `${manifestPath} has no sha256.` };
  const size = fs.statSync(exe).size;
  const sha256 = sha256File(exe);
  if (sha256 !== manifest.sha256) return { ok: false, error: `${exe}: sha256 ${sha256} ≠ ${WHISPER_BUILD_MANIFEST} ${manifest.sha256} (binary changed since it was built)` };
  return { ok: true, path: exe, sha256, size, manifest, matchesCatalog: sha256 === asset.sha256 };
}

export function verifyWhisperArchive(file: string, asset: WhisperRuntimeAsset): VerifyResult {
  if (asset.kind === "built") return { ok: false, error: `${asset.target} is a built row; there is no archive to verify.` };
  const want = expectSha(asset);
  if (!want.ok) return want;
  if (!fs.existsSync(file)) return { ok: false, error: `Archive is missing: ${file}` };
  const size = fs.statSync(file).size;
  if (asset.sizeBytes > 0 && size !== asset.sizeBytes) {
    return { ok: false, error: `${asset.filename}: size ${size} ≠ catalog ${asset.sizeBytes}` };
  }
  const sha256 = sha256File(file);
  if (sha256 !== asset.sha256) return { ok: false, error: `${asset.filename}: sha256 mismatch (got ${sha256}, expected ${asset.sha256})` };
  return { ok: true, path: file, sha256, size };
}

// ── download + unpack (same shape as local-engine.ts) ────────────────────────

async function downloadTo(url: string, dest: string): Promise<{ ok: true } | { ok: false; error: string }> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch (err) {
    return { ok: false, error: `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!res.ok || !res.body) return { ok: false, error: `Download failed (${res.status}) ${url}` };
  try {
    await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), fs.createWriteStream(part));
    fs.renameSync(part, dest);
    return { ok: true };
  } catch (err) {
    fs.rmSync(part, { force: true });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function extractArchive(archive: string, dest: string, kind: "tar.gz" | "zip"): void {
  fs.mkdirSync(dest, { recursive: true });
  const { execSync } = childProcess;
  if (kind === "tar.gz") {
    execSync(`tar --no-same-owner -xzf ${JSON.stringify(archive)} -C ${JSON.stringify(dest)}`, { stdio: "ignore" });
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
    execSync(`python3 -c "import zipfile; zipfile.ZipFile(${JSON.stringify(archive)}).extractall(${JSON.stringify(dest)})"`, {
      stdio: "ignore",
    });
  }
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

/**
 * The archives unpack into a subfolder (`whisper-bin-ubuntu-x64/`, `Release/`)
 * with the shared libraries beside the binary. Move that folder's files up so
 * `whisper-cli` and its libs sit directly in `whisperDir` — the one directory
 * LD_LIBRARY_PATH / PATH points at.
 */
function flattenInto(dir: string, found: string): void {
  const from = path.dirname(found);
  if (path.resolve(from) === path.resolve(dir)) return;
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dst = path.join(dir, e.name);
    fs.rmSync(dst, { recursive: true, force: true });
    fs.renameSync(src, dst);
  }
  fs.rmSync(from, { recursive: true, force: true });
}

export type EnsureRuntime =
  | { ok: true; exe: string; dir: string; target: WhisperTarget; built?: boolean }
  | { ok: false; error: string; code?: "NOT_BUILT" };

/**
 * whisper-cli for this host: downloaded and sha256-verified on first use for
 * archive rows; for built rows (darwin) only found — never downloaded — and
 * checked against the manifest its build wrote.
 */
export async function ensureWhisperRuntime(): Promise<EnsureRuntime> {
  const target = whisperTarget();
  const asset = whisperRuntimeAsset(target);
  if (!target || !asset) return { ok: false, error: whisperUnsupportedReason() ?? "No whisper-cli for this host.", code: "NOT_BUILT" };
  const dir = whisperDir(target);
  const exe = path.join(dir, whisperCliName());
  if (asset.kind === "built") {
    const v = verifyBuiltWhisper(exe, asset);
    if (!v.ok) return { ok: false, error: v.error, code: fs.existsSync(exe) ? undefined : "NOT_BUILT" };
    assertWhisperExe(exe);
    return { ok: true, exe, dir, target, built: true };
  }
  if (fs.existsSync(exe)) {
    assertWhisperExe(exe);
    return { ok: true, exe, dir, target };
  }
  const want = expectSha(asset);
  if (!want.ok) return want;
  if (!asset.url) return { ok: false, error: `catalog/whisper-assets.json row ${target} has no url.` };
  fs.mkdirSync(dir, { recursive: true });
  const archivePath = path.join(llamaBinRoot(), asset.filename);
  try {
    if (!fs.existsSync(archivePath) || !verifyWhisperArchive(archivePath, asset).ok) {
      fs.rmSync(archivePath, { force: true });
      const got = await downloadTo(asset.url, archivePath);
      if (!got.ok) return got;
    }
    const verified = verifyWhisperArchive(archivePath, asset);
    if (!verified.ok) {
      fs.rmSync(archivePath, { force: true });
      return verified;
    }
    extractArchive(archivePath, dir, asset.kind);
    const found = walkForBinary(dir, asset.binary);
    if (!found) return { ok: false, error: `Extracted ${asset.filename} but ${asset.binary} is missing` };
    flattenInto(dir, found);
    if (!fs.existsSync(exe)) return { ok: false, error: `${asset.binary} did not land in ${dir}` };
    if (asset.kind !== "zip") {
      try {
        fs.chmodSync(exe, 0o755);
      } catch {
        /* windows */
      }
    }
    // whisper-server is in the archive too; it is never run here. Remove it so nothing can start it by accident.
    for (const n of ["whisper-server", "whisper-server.exe"]) fs.rmSync(path.join(dir, n), { force: true });
    assertWhisperExe(exe);
    return { ok: true, exe, dir, target };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type EnsureModel = { ok: true; path: string; id: string; sha256: string } | { ok: false; error: string };

/** The ggml model, downloaded on first use; size + magic + sha256 gate before it is ever used. */
export async function ensureWhisperModel(id: string = WHISPER_DEFAULT_MODEL): Promise<EnsureModel> {
  const asset = whisperModelAsset(id);
  if (!asset) return { ok: false, error: `${id} is not a pinned whisper model.` };
  const file = path.join(whisperModelsDir(), asset.filename);
  const have = fs.existsSync(file) ? verifyWhisperModel(file, asset) : null;
  if (have?.ok) return { ok: true, path: file, id, sha256: have.sha256 };
  const want = expectSha(asset);
  if (!want.ok) return want;
  fs.rmSync(file, { force: true });
  const got = await downloadTo(asset.url, file);
  if (!got.ok) return got;
  const v = verifyWhisperModel(file, asset);
  if (!v.ok) {
    fs.rmSync(file, { force: true });
    return v;
  }
  return { ok: true, path: file, id, sha256: v.sha256 };
}

// ── status ───────────────────────────────────────────────────────────────────

export type SttStatus = {
  /**
   * False on any host without a pinned whisper-cli row, and on a built-row
   * host (darwin) until the compiled binary + manifest are in place.
   */
  supported: boolean;
  reason: string | null;
  release: string;
  target: WhisperTarget | null;
  /** `built` when this host compiles its CLI (darwin); the archive kind otherwise. */
  kind: WhisperRuntimeAsset["kind"] | null;
  model: string;
  runtimeReady: boolean;
  modelReady: boolean;
  busy: boolean;
  language: typeof STT_LANGUAGE;
};

/** Pure: the (supported, reason) pair for a host. `exeVerified` is the built-row check result. */
export function sttSupport(input: {
  target: WhisperTarget | null;
  asset: WhisperRuntimeAsset | null;
  dir: string;
  builtOk: boolean;
  builtError: string | null;
  platform?: string;
  arch?: string;
}): { supported: boolean; reason: string | null } {
  if (!input.target || !input.asset) return { supported: false, reason: whisperUnsupportedReason(input.platform, input.arch) };
  if (input.asset.kind === "built" && !input.builtOk) {
    return { supported: false, reason: input.builtError ?? whisperNotBuiltReason(input.target, input.dir) };
  }
  return { supported: true, reason: null };
}

export function sttStatus(): SttStatus {
  const target = whisperTarget();
  const asset = whisperRuntimeAsset(target);
  const modelPath = whisperModelPath();
  const dir = whisperDir(target ?? undefined);
  const exe = path.join(dir, whisperCliName());
  const built = asset?.kind === "built" ? verifyBuiltWhisper(exe, asset) : null;
  const { supported, reason } = sttSupport({ target, asset, dir, builtOk: Boolean(built?.ok), builtError: built && !built.ok ? built.error : null });
  return {
    supported,
    reason,
    release: WHISPER_RELEASE,
    target,
    kind: asset?.kind ?? null,
    model: WHISPER_DEFAULT_MODEL,
    runtimeReady: supported && fs.existsSync(exe),
    modelReady: Boolean(modelPath && fs.existsSync(modelPath)),
    busy: g().busy,
    language: STT_LANGUAGE,
  };
}

// ── spawn plan ───────────────────────────────────────────────────────────────

export type WhisperSpawnPlan = { exe: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string };

/** Pure: the one whisper-cli command line. `-nt` no timestamps, `-np` no prints — stdout is just the text. */
export function whisperSpawnPlan(input: {
  exe: string;
  model: string;
  wav: string;
  language?: string;
  platform?: string;
  baseEnv?: NodeJS.ProcessEnv;
}): WhisperSpawnPlan {
  const dir = path.dirname(input.exe);
  const platform = input.platform ?? process.platform;
  const sep = platform === "win32" ? ";" : ":";
  const base = input.baseEnv ?? process.env;
  const env: NodeJS.ProcessEnv = {
    ...base,
    LD_LIBRARY_PATH: [dir, base.LD_LIBRARY_PATH].filter(Boolean).join(sep),
    DYLD_LIBRARY_PATH: [dir, base.DYLD_LIBRARY_PATH].filter(Boolean).join(sep),
    ...(platform === "win32" ? { PATH: [dir, base.PATH].filter(Boolean).join(sep) } : {}),
  };
  return {
    exe: input.exe,
    args: ["-m", input.model, "-f", input.wav, "-l", input.language ?? STT_LANGUAGE, "-nt", "-np"],
    env,
    cwd: dir,
  };
}

/** whisper-cli prints `[BLANK_AUDIO]` / `(silence)`-style markers for empty clips; drop them. */
export function cleanTranscript(stdout: string): string {
  return stdout
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\((?:silence|inaudible|music|applause|laughter|noise)[^)]*\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── one job at a time ────────────────────────────────────────────────────────

type SttGlobal = typeof globalThis & { __localbotStt?: { busy: boolean } };
function g() {
  const gg = globalThis as SttGlobal;
  if (!gg.__localbotStt) gg.__localbotStt = { busy: false };
  return gg.__localbotStt;
}

export type SttFailCode = "BAD_WAV" | "NOT_BUILT" | "BUSY" | "RUNTIME" | "MODEL" | "SCOPE" | "TIMEOUT" | "FAILED";
export type SttResult =
  | { ok: true; text: string; ms: number; model: string; seconds: number }
  | { ok: false; code: SttFailCode; error: string };

export type SttSpawn = (plan: WhisperSpawnPlan) => ChildProcess;
const defaultSpawn: SttSpawn = (plan) =>
  childProcess.spawn(plan.exe, plan.args, { cwd: plan.cwd, env: plan.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

export type SttDeps = {
  spawn?: SttSpawn;
  runtime?: () => Promise<EnsureRuntime>;
  model?: () => Promise<EnsureModel>;
  timeoutMs?: number;
  folders?: FoldersConfig | null;
  /** Test seam only: where the clip is written. Production always uses `sttDir()`. */
  scratchDir?: string;
};

function runOnce(plan: WhisperSpawnPlan, spawn: SttSpawn, timeoutMs: number): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderrTail: string; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(plan);
    } catch (err) {
      reject(err);
      return;
    }
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString("utf8")).slice(-4000);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* gone */
      }
    }, timeoutMs);
    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderrTail: stderr.trim().split("\n").slice(-3).join("\n"), timedOut });
    });
  });
}

/**
 * One clip → one transcript. Refuses before touching disk unless the bytes
 * are the exact WAV shape; writes the clip outside every scope root; spawns
 * whisper-cli once; deletes the clip in `finally`. Nothing is logged.
 */
export async function transcribeWav(wav: Uint8Array, deps: SttDeps = {}): Promise<SttResult> {
  const checked = validateSttWav(wav);
  if (!checked.ok) return { ok: false, code: "BAD_WAV", error: checked.error };
  const info: WavInfo = checked.info;

  if (!whisperTarget()) return { ok: false, code: "NOT_BUILT", error: whisperUnsupportedReason() ?? "Voice input is NOT BUILT on this host." };

  const st = g();
  if (st.busy) return { ok: false, code: "BUSY", error: "Still transcribing the previous clip. Try again in a moment." };
  st.busy = true;

  const folders = deps.folders === undefined ? loadConfig().folders : deps.folders;
  const dir = deps.scratchDir ?? sttDir();
  let wavPath: string | null = null;
  const started = Date.now();
  try {
    try {
      assertSttOutsideScopes(folders, dir);
    } catch (err) {
      return { ok: false, code: "SCOPE", error: err instanceof Error ? err.message : String(err) };
    }

    const runtime = await (deps.runtime ?? ensureWhisperRuntime)();
    if (!runtime.ok) return { ok: false, code: runtime.code === "NOT_BUILT" ? "NOT_BUILT" : "RUNTIME", error: runtime.error };
    const model = await (deps.model ?? (() => ensureWhisperModel()))();
    if (!model.ok) return { ok: false, code: "MODEL", error: model.error };

    try {
      assertWhisperExe(runtime.exe);
    } catch (err) {
      return { ok: false, code: "RUNTIME", error: err instanceof Error ? err.message : String(err) };
    }

    fs.mkdirSync(dir, { recursive: true });
    wavPath = path.join(dir, `${crypto.randomUUID()}.wav`);
    fs.writeFileSync(wavPath, wav, { mode: 0o600 });

    const plan = whisperSpawnPlan({ exe: runtime.exe, model: model.path, wav: wavPath, language: STT_LANGUAGE });
    const run = await runOnce(plan, deps.spawn ?? defaultSpawn, deps.timeoutMs ?? STT_TIMEOUT_MS);
    if (run.timedOut) {
      return { ok: false, code: "TIMEOUT", error: `whisper-cli did not finish within ${Math.round((deps.timeoutMs ?? STT_TIMEOUT_MS) / 1000)} s and was killed.` };
    }
    if (run.code !== 0) {
      return {
        ok: false,
        code: "FAILED",
        error: `whisper-cli exited with ${run.code ?? run.signal}.${run.stderrTail ? `\n${run.stderrTail}` : ""}`,
      };
    }
    return { ok: true, text: cleanTranscript(run.stdout), ms: Date.now() - started, model: model.id, seconds: info.seconds };
  } catch (err) {
    return { ok: false, code: "FAILED", error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (wavPath) fs.rmSync(wavPath, { force: true });
    st.busy = false;
  }
}

/** Test seam: reset the one-job flag between cases. */
export function __resetSttForTests(): void {
  g().busy = false;
}
