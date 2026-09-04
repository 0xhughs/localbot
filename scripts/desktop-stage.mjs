/**
 * Stage 8 build-time helpers for the packaged DeepSeek Harness runtime.
 * Pure where possible so scripts/desktop-stage.test.mjs can lock the contract.
 *
 * The packaged app ships, as explicit extraResources (never Nitro tracing,
 * never the employee's machine):
 *   localbot-node/node[.exe]     official Node pinned in catalog/node-runtime.json
 *   localbot-harness/dsh/        the Cordis overlay + ctx.fs plugin
 *   localbot-harness/src/…       every relative import the plugin needs (traced)
 *   localbot-harness/node_modules  @deepseek-ai/dsh tree, exact pins, npm install at build
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const NODE_RUNTIME_CATALOG = "catalog/node-runtime.json";

/** `linux-x64`, `darwin-arm64`, `win32-x64` — the key in node-runtime.json. */
export function nodeRuntimeTarget(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`;
}

export function readNodeRuntimeCatalog(root) {
  return JSON.parse(fs.readFileSync(path.join(root, NODE_RUNTIME_CATALOG), "utf8"));
}

export function parseNodeVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function versionAtLeast(v, min) {
  const a = parseNodeVersion(v);
  const b = parseNodeVersion(min);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

export function sha256File(file) {
  const h = createHash("sha256");
  h.update(fs.readFileSync(file));
  return h.digest("hex");
}

const IMPORT_RE = /^\s*(?:import|export)\s+(?!type\s)[^'"]*?\sfrom\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;

/**
 * Relative import specifiers of one ES module source (type-only imports are
 * dropped, exactly what `--experimental-strip-types` does at runtime).
 */
export function relativeImportsOf(source) {
  const out = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    if (spec && (spec.startsWith("./") || spec.startsWith("../"))) out.push(spec);
  }
  return out;
}

const RESOLVE_EXT = ["", ".ts", ".mjs", ".js", ".json"];

function resolveRelative(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const ext of RESOLVE_EXT) {
    const p = base + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  throw new Error(`cannot resolve ${spec} from ${fromFile}`);
}

/**
 * Every file the entry module pulls in through relative imports (entry
 * included), as paths relative to `root`. Bare specifiers (`node:*`,
 * `@deepseek-ai/*`) are left to Node's resolution at runtime.
 */
export function traceRelativeImports(entryAbs, root) {
  const seen = new Set();
  const queue = [path.resolve(entryAbs)];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.endsWith(".json")) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const spec of relativeImportsOf(src)) queue.push(resolveRelative(file, spec));
  }
  return [...seen].map((f) => path.relative(root, f).split(path.sep).join("/")).sort();
}

export function harnessPackageJson({ dshPin, fsVersion, fsLocalVersion }) {
  return {
    name: "localbot-harness",
    private: true,
    version: "0.0.0",
    description: "DeepSeek Harness runtime shipped inside LocalBot (exact pins).",
    type: "module",
    dependencies: {
      "@deepseek-ai/dsh": dshPin,
      "@deepseek-ai/dsh-fs": fsVersion,
      "@deepseek-ai/dsh-fs-local": fsLocalVersion,
    },
  };
}

function installedVersion(root, name) {
  return JSON.parse(fs.readFileSync(path.join(root, "node_modules", name, "package.json"), "utf8")).version;
}

/**
 * Build dist/desktop-harness: overlay, traced plugin sources, and a fresh
 * `npm install` of the pinned Harness packages. Throws if the tree does not
 * carry the pinned dsh.
 */
export function stageHarness({ root, stage, dshPin, npm = "npm", log = console.log }) {
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(path.join(stage, "dsh"), { recursive: true });
  for (const name of ["localbot-acp.cordis.yml", "localbot-fs.mjs"]) {
    fs.copyFileSync(path.join(root, "dsh", name), path.join(stage, "dsh", name));
  }
  const traced = traceRelativeImports(path.join(root, "dsh/localbot-fs.mjs"), root);
  for (const rel of traced) {
    if (rel === "dsh/localbot-fs.mjs") continue;
    const to = path.join(stage, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(root, rel), to);
  }
  log(`[desktop] harness plugin sources (${traced.length}): ${traced.join(", ")}`);

  const pkg = harnessPackageJson({
    dshPin,
    fsVersion: installedVersion(root, "@deepseek-ai/dsh-fs"),
    fsLocalVersion: installedVersion(root, "@deepseek-ai/dsh-fs-local"),
  });
  fs.writeFileSync(path.join(stage, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  log(`[desktop] npm install ${Object.entries(pkg.dependencies).map(([k, v]) => `${k}@${v}`).join(" ")} → ${stage}`);
  const r = spawnSync(npm, ["install", "--omit=dev", "--no-audit", "--no-fund", "--no-package-lock", "--loglevel=error"], {
    cwd: stage,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) throw new Error(`npm install for the Harness stage exited ${r.status}`);
  const got = installedVersion(stage, "@deepseek-ai/dsh");
  if (got !== dshPin) throw new Error(`staged @deepseek-ai/dsh is ${got}, pin is ${dshPin}`);
  const bin = path.join(stage, "node_modules/@deepseek-ai/dsh/lib/bin.js");
  if (!fs.existsSync(bin)) throw new Error(`missing ${bin}`);
  return { traced, pkg, bin };
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

function extractArchive(archive, into) {
  fs.mkdirSync(into, { recursive: true });
  if (archive.endsWith(".zip")) {
    const r =
      process.platform === "win32"
        ? spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${into}' -Force`], { stdio: "inherit" })
        : spawnSync("unzip", ["-q", "-o", archive, "-d", into], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`extracting ${archive} failed (${r.status})`);
    return;
  }
  const r = spawnSync("tar", ["-xf", archive, "-C", into], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`tar -xf ${archive} exited ${r.status}`);
}

/**
 * Build dist/desktop-node for one target: download the pinned official Node
 * archive (cached under dist/node-cache), verify sha256 against the catalog,
 * and keep only the `node` binary + Node's LICENSE.
 */
export async function stageNodeRuntime({ root, stage, cache, target = nodeRuntimeTarget(), log = console.log }) {
  const cat = readNodeRuntimeCatalog(root);
  const row = cat.targets[target];
  if (!row) throw new Error(`catalog/node-runtime.json has no row for ${target}`);
  const archive = path.join(cache, row.file);
  if (!fs.existsSync(archive) || sha256File(archive) !== row.sha256) {
    const url = `${cat.base}/${cat.pin}/${row.file}`;
    log(`[desktop] downloading ${url}`);
    await download(url, archive);
  }
  const got = sha256File(archive);
  if (got !== row.sha256) throw new Error(`${row.file} sha256 ${got} != catalog ${row.sha256}`);
  log(`[desktop] ${row.file} sha256 ok`);

  const tmp = path.join(cache, `extract-${target}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  extractArchive(archive, tmp);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  const binName = target.startsWith("win32") ? "node.exe" : "node";
  const bin = path.join(stage, binName);
  fs.copyFileSync(path.join(tmp, row.bin), bin);
  fs.chmodSync(bin, 0o755);
  fs.copyFileSync(path.join(tmp, row.license), path.join(stage, "LICENSE.node"));
  fs.writeFileSync(
    path.join(stage, "node-runtime.json"),
    JSON.stringify({ pin: cat.pin, target, file: row.file, sha256: row.sha256 }, null, 2) + "\n",
  );
  fs.rmSync(tmp, { recursive: true, force: true });
  return { bin, pin: cat.pin, minimum: cat.minimum, target };
}

/** Run a Node binary's `--version` (build-time check of the staged runtime). */
export function nodeBinaryVersion(bin) {
  const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 10000 });
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

/** electron-builder outputs we count as installers (never `*-unpacked/`). */
export const INSTALLER_EXT = [".AppImage", ".deb", ".dmg", ".exe", ".rpm", ".snap", ".zip"];

export function listInstallers(outDir) {
  if (!fs.existsSync(outDir)) return [];
  return fs
    .readdirSync(outDir)
    .filter((n) => INSTALLER_EXT.some((e) => n.endsWith(e)) && !n.endsWith(".blockmap"))
    .map((n) => path.join(outDir, n))
    .filter((p) => fs.statSync(p).isFile())
    .sort();
}

/** `sha256  filename` lines, the sha256sum -c format. */
export function checksumLines(files) {
  return files.map((f) => `${sha256File(f)}  ${path.basename(f)}`);
}

/**
 * The electron-builder targets in package.json. Stage 8 refuses a config that
 * only produces `dir` for the OS being built.
 */
export function buildTargetsOf(pkg, os) {
  const t = pkg?.build?.[os]?.target;
  if (!t) return [];
  const list = Array.isArray(t) ? t : [t];
  return list.map((x) => (typeof x === "string" ? x : x?.target)).filter(Boolean);
}

export function hasInstallerTarget(pkg, os) {
  return buildTargetsOf(pkg, os).some((t) => t !== "dir");
}
