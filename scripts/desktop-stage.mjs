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
 *
 * Stage 20 adds, next to them:
 *   localbot-pnpm/bin/pnpm[.cmd]   shims that run the pinned pnpm on the bundled Node
 *   localbot-pnpm/pnpm.cjs         entry → localbot-pnpm/pnpm/ (the exact-pinned npm package)
 *   localbot-whisper/darwin-arm64/whisper/{whisper-cli,whisper-build.json}
 *                                  the Stage 10 build, copied in (darwin-arm64 build hosts only)
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
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
  // Stage 14: the checked-in fixture plugin bundles the catalog's `path` entries point at.
  const pluginsDir = path.join(root, "dsh", "plugins");
  if (fs.existsSync(pluginsDir)) {
    fs.cpSync(pluginsDir, path.join(stage, "dsh", "plugins"), { recursive: true, dereference: false });
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

/* ---------- Stage 20: bundled pnpm ---------- */

export const PNPM_RESOURCE_DIR = "localbot-pnpm";
export const PNPM_RUNTIME_MANIFEST = "pnpm-runtime.json";

/** The exact `pnpm` pin in package.json devDependencies; throws when it floats or is missing. */
export function pnpmPinOf(pkg) {
  const pin = pkg?.devDependencies?.pnpm ?? pkg?.dependencies?.pnpm;
  if (!pin || !/^\d+\.\d+\.\d+$/.test(String(pin))) {
    throw new Error(`package.json must pin pnpm exactly (devDependencies.pnpm = "x.y.z"), got ${JSON.stringify(pin)}`);
  }
  return String(pin);
}

/**
 * POSIX shim dsh's `spawnSync("pnpm")` finds first on PATH. Runs the bundled
 * pnpm on the bundled Node named by `LOCALBOT_DSH_NODE` (Electron main sets
 * it), falling back to the sibling `localbot-node/node` in the same
 * resources folder. Never `node` from PATH.
 */
export function pnpmShimSh() {
  return [
    "#!/bin/sh",
    "# LocalBot bundled pnpm (Stage 20). dsh forwards `dsh plugin` to `pnpm` on PATH; this is that pnpm.",
    "# Runs the pinned pnpm package on the Node LocalBot ships, never on a node from the employee's PATH.",
    "# Shell builtins only: PATH may hold nothing but this folder (no external commands, no node).",
    'case "$0" in */*) here=$(cd "${0%/*}" && pwd) ;; *) here=$(pwd) ;; esac',
    'node_bin="${LOCALBOT_DSH_NODE:-$here/../../localbot-node/node}"',
    'exec "$node_bin" "$here/../pnpm.cjs" "$@"',
    "",
  ].join("\n");
}

/** Windows twin: dsh spawns pnpm with `shell: true` there, so cmd.exe resolves `pnpm.cmd` via PATH + PATHEXT. */
export function pnpmShimCmd() {
  return [
    "@echo off",
    "rem LocalBot bundled pnpm (Stage 20). Runs the pinned pnpm package on the Node LocalBot ships.",
    "setlocal",
    'set "HERE=%~dp0"',
    'if defined LOCALBOT_DSH_NODE (set "NODE_BIN=%LOCALBOT_DSH_NODE%") else (set "NODE_BIN=%HERE%..\\..\\localbot-node\\node.exe")',
    '"%NODE_BIN%" "%HERE%..\\pnpm.cjs" %*',
    "endlocal & exit /b %ERRORLEVEL%",
    "",
  ].join("\r\n");
}

/** CJS entry at the resource root; keeps the shims one directory away from the package tree. */
export function pnpmEntryCjs() {
  return ['#!/usr/bin/env node\n"use strict";', "// LocalBot bundled pnpm (Stage 20): the exact-pinned npm package lives in ./pnpm.", 'require("./pnpm/bin/pnpm.cjs");', ""].join("\n");
}

/**
 * Build `{stage}/localbot-pnpm`: the pinned `pnpm` package copied from the
 * build host's node_modules (version checked against the pin), a CJS entry,
 * the two shims, pnpm's MIT LICENSE, and pnpm-runtime.json. Throws when the
 * installed pnpm is not the pinned version or the package is incomplete.
 */
export function stagePnpm({ root, stage, pin, log = console.log }) {
  const src = path.join(root, "node_modules", "pnpm");
  const pkgFile = path.join(src, "package.json");
  if (!fs.existsSync(pkgFile)) throw new Error(`node_modules/pnpm is not installed; run npm ci (pnpm ${pin} is a pinned devDependency)`);
  const installed = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
  if (installed.version !== pin) throw new Error(`node_modules/pnpm is ${installed.version}, package.json pins ${pin}`);
  for (const rel of ["bin/pnpm.cjs", "dist/pnpm.cjs", "LICENSE"]) {
    if (!fs.existsSync(path.join(src, rel))) throw new Error(`node_modules/pnpm/${rel} is missing; the pnpm package is incomplete`);
  }
  const out = path.join(stage, PNPM_RESOURCE_DIR);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, "bin"), { recursive: true });
  fs.cpSync(src, path.join(out, "pnpm"), { recursive: true, dereference: true, filter: (p) => !/(^|[\\/])README\.md$/.test(p) });
  fs.writeFileSync(path.join(out, "pnpm.cjs"), pnpmEntryCjs());
  const sh = path.join(out, "bin", "pnpm");
  fs.writeFileSync(sh, pnpmShimSh());
  fs.chmodSync(sh, 0o755);
  fs.writeFileSync(path.join(out, "bin", "pnpm.cmd"), pnpmShimCmd());
  fs.copyFileSync(path.join(src, "LICENSE"), path.join(out, "LICENSE"));
  const manifest = {
    pin,
    package: "pnpm",
    license: installed.license ?? "MIT",
    sha256: { "pnpm/dist/pnpm.cjs": sha256File(path.join(src, "dist/pnpm.cjs")), "pnpm/bin/pnpm.cjs": sha256File(path.join(src, "bin/pnpm.cjs")) },
    node: "resources/localbot-node (LOCALBOT_DSH_NODE); never node from PATH",
    why: "dsh plugin forwards to `pnpm` on PATH; LocalBot prepends this bin/ so the employee needs no pnpm.",
  };
  fs.writeFileSync(path.join(out, PNPM_RUNTIME_MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
  log(`[desktop] bundled pnpm ${pin} → ${out}`);
  return { dir: out, binDir: path.join(out, "bin"), shim: sh, cmd: path.join(out, "bin", "pnpm.cmd"), entry: path.join(out, "pnpm.cjs"), manifest };
}

/**
 * Run a staged shim's `--version` on a given Node with an otherwise empty
 * PATH — the exact situation an installed app is in. Returns the printed
 * version or null.
 */
export function pnpmShimVersion(shim, nodeBin, extraEnv = {}) {
  const emptyPath = fs.mkdtempSync(path.join(os.tmpdir(), "lb-empty-path-"));
  try {
    const isCmd = shim.endsWith(".cmd");
    const r = spawnSync(isCmd ? "cmd.exe" : shim, isCmd ? ["/d", "/s", "/c", `"${shim}" --version`] : ["--version"], {
      encoding: "utf8",
      timeout: 60000,
      env: { HOME: os.homedir(), USERPROFILE: os.homedir(), TMPDIR: os.tmpdir(), TEMP: os.tmpdir(), TMP: os.tmpdir(), PATH: emptyPath, Path: emptyPath, LOCALBOT_DSH_NODE: nodeBin, ...extraEnv },
      windowsHide: true,
    });
    if (r.status !== 0) return null;
    return r.stdout.trim().split(/\r?\n/).pop() ?? null;
  } finally {
    fs.rmSync(emptyPath, { recursive: true, force: true });
  }
}

/* ---------- Stage 20: baked darwin-arm64 whisper-cli ---------- */

export const WHISPER_RESOURCE_DIR = "localbot-whisper";
export const WHISPER_ASSETS_CATALOG = "catalog/whisper-assets.json";

export function readWhisperCatalog(root) {
  return JSON.parse(fs.readFileSync(path.join(root, WHISPER_ASSETS_CATALOG), "utf8"));
}

/**
 * Check a Stage 10 build folder (`whisper-cli` + `whisper-build.json`) against
 * the catalog's built row for `target`: same release tag, same source commit,
 * same target, binary hashes to the manifest's sha256. The catalog's own
 * sha256 is the author's build and is reported, not enforced. Pure.
 */
export function checkBuiltWhisper({ catalog, target, dir }) {
  const row = catalog?.targets?.[target];
  if (!row || row.kind !== "built") return { ok: false, error: `catalog/whisper-assets.json has no built row for ${target}` };
  const exe = path.join(dir, row.binary);
  const manifestPath = path.join(dir, "whisper-build.json");
  if (!fs.existsSync(exe)) return { ok: false, error: `${exe} does not exist (run ${row.build} on this Mac first, or pass --whisper-dir)` };
  if (!fs.existsSync(manifestPath)) return { ok: false, error: `${manifestPath} is missing beside ${row.binary}` };
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    return { ok: false, error: `${manifestPath} is not JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (manifest.release !== catalog.release) return { ok: false, error: `${manifestPath} says whisper.cpp ${manifest.release}; the catalog pins ${catalog.release}` };
  if (manifest.target !== target) return { ok: false, error: `${manifestPath} was built for ${manifest.target}, not ${target}` };
  if (row.source?.commit && manifest.commit !== row.source.commit) return { ok: false, error: `${manifestPath} was built from ${manifest.commit}, not the pinned ${row.source.commit}` };
  const sha256 = sha256File(exe);
  if (sha256 !== manifest.sha256) return { ok: false, error: `${exe}: sha256 ${sha256} ≠ whisper-build.json ${manifest.sha256}` };
  const dylibs = Array.isArray(manifest.dylibs) ? manifest.dylibs : [];
  const missingDylib = dylibs.find((n) => !fs.existsSync(path.join(dir, n)));
  if (missingDylib) return { ok: false, error: `${manifestPath} lists ${missingDylib} but it is not beside ${row.binary}` };
  return { ok: true, exe, manifestPath, manifest, sha256, dylibs, matchesCatalog: sha256 === row.sha256 };
}

/**
 * Copy a verified Stage 10 build into `{stage}/localbot-whisper/{target}/whisper/`.
 * Throws on any catalog mismatch — the installer never carries a whisper-cli
 * the sidecar would then refuse.
 */
export function stageWhisperBuilt({ root, stage, target, from, log = console.log }) {
  const catalog = readWhisperCatalog(root);
  const check = checkBuiltWhisper({ catalog, target, dir: from });
  if (!check.ok) throw new Error(`whisper-cli for ${target} not staged: ${check.error}`);
  const out = path.join(stage, WHISPER_RESOURCE_DIR, target, "whisper");
  fs.rmSync(path.join(stage, WHISPER_RESOURCE_DIR, target), { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const exe = path.join(out, path.basename(check.exe));
  fs.copyFileSync(check.exe, exe);
  fs.chmodSync(exe, 0o755);
  fs.copyFileSync(check.manifestPath, path.join(out, "whisper-build.json"));
  for (const n of check.dylibs) fs.copyFileSync(path.join(from, n), path.join(out, n));
  const again = checkBuiltWhisper({ catalog, target, dir: out });
  if (!again.ok) throw new Error(`staged whisper-cli failed its own check: ${again.error}`);
  log(`[desktop] baked whisper-cli ${catalog.release} for ${target} (sha256 ${check.sha256.slice(0, 12)}…${check.matchesCatalog ? ", matches catalog" : ", this host's build"}) → ${out}`);
  return { dir: out, exe, sha256: check.sha256, matchesCatalog: check.matchesCatalog, dylibs: check.dylibs };
}

/* ---------- Stage 21: catalog/ next to the packaged sidecar ---------- */

export const CATALOG_DIR = "catalog";
/** The one catalog file the sidecar opens with fs at runtime; its absence in the packed app is a build failure. */
export const CATALOG_REQUIRED_FILE = "dsh-plugins.json";
/** Where the sidecar's `catalogRoot()` looks in the packed app (`LOCALBOT_SERVER_DIR` = resources/localbot-server). */
export const CATALOG_RESOURCE_DIR = "localbot-server/catalog";

/**
 * Every `catalog/*.json` in the repo (top level only, sorted). Throws when the
 * folder is missing or does not hold dsh-plugins.json — the build must not
 * produce an installer whose Plugins screen opens to ENOENT.
 * @param {string} root
 */
export function listCatalogJson(root) {
  const dir = path.join(root, CATALOG_DIR);
  if (!fs.existsSync(dir)) throw new Error(`${dir} does not exist`);
  const names = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".json") && fs.statSync(path.join(dir, n)).isFile())
    .sort();
  if (!names.includes(CATALOG_REQUIRED_FILE)) throw new Error(`${dir} has no ${CATALOG_REQUIRED_FILE}`);
  for (const n of names) JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));
  return names;
}

/**
 * Copy every repo `catalog/*.json` into `{into}/catalog/` — `into` is the
 * Nitro output (`.output`), which extraResources maps to
 * `resources/localbot-server`, so the packed sidecar finds
 * `resources/localbot-server/catalog/dsh-plugins.json` at the same relative
 * path the dev checkout has. Byte-for-byte copies, re-read after writing.
 * @param {{ root: string, into: string, log?: (s: string) => void }} o
 */
export function stageCatalog({ root, into, log = console.log }) {
  const names = listCatalogJson(root);
  const out = path.join(into, CATALOG_DIR);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const n of names) {
    const from = path.join(root, CATALOG_DIR, n);
    const to = path.join(out, n);
    fs.copyFileSync(from, to);
    if (sha256File(from) !== sha256File(to)) throw new Error(`${to} does not match ${from} after copy`);
  }
  const missing = catalogLayoutChecks(names)
    .map((rel) => path.basename(rel))
    .filter((n) => !fs.existsSync(path.join(out, n)));
  if (missing.length) throw new Error(`staged catalog is missing ${missing.join(", ")}`);
  log(`[desktop] catalog (${names.length}): ${names.join(", ")} → ${out}`);
  return { dir: out, files: names.map((n) => path.join(out, n)), names };
}

/**
 * The packed-app paths (relative to `Contents/` or `*-unpacked/`) that must
 * exist for the catalog: `resources/localbot-server/catalog/<file>` for every
 * staged file, dsh-plugins.json always first.
 * @param {string[]} names
 */
export function catalogLayoutChecks(names) {
  const set = new Set([CATALOG_REQUIRED_FILE, ...names]);
  return [...set].map((n) => `resources/${CATALOG_RESOURCE_DIR}/${n}`);
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

/**
 * `sha256  filename` lines, the sha256sum -c format.
 * @param {string[]} files
 */
export function checksumLines(files) {
  return files.map((f) => `${sha256File(f)}  ${path.basename(f)}`);
}

/**
 * The electron-builder targets in package.json. Stage 8 refuses a config that
 * only produces `dir` for the OS being built.
 * @param {{ build?: Record<string, { target?: unknown }> } | null | undefined} pkg
 * @param {string} os
 */
export function buildTargetsOf(pkg, os) {
  const t = pkg?.build?.[os]?.target;
  if (!t) return [];
  const list = Array.isArray(t) ? t : [t];
  return list.map((x) => (typeof x === "string" ? x : x?.target)).filter(Boolean);
}

/**
 * @param {{ build?: Record<string, { target?: unknown }> } | null | undefined} pkg
 * @param {string} os
 */
export function hasInstallerTarget(pkg, os) {
  return buildTargetsOf(pkg, os).some((t) => t !== "dir");
}
