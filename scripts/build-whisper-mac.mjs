#!/usr/bin/env node
/**
 * Stage 10 — build whisper-cli for macOS from whisper.cpp source (run: `npm run build:whisper-mac`).
 *
 * ggml-org/whisper.cpp v1.9.2 ships no darwin CLI (only an xcframework), and
 * this repo never invents a download URL. So on a Mac the CLI is built here,
 * from the pinned tag, with pinned cmake flags, and installed where the
 * sidecar looks for it: `{binRoot}/{darwin-arm64|darwin-x64}/whisper/`
 * (Electron layout: `~/Library/Application Support/LocalBot/bin/`).
 *
 * The catalog row for the target is `kind: "built"`: source tag + commit +
 * cmake flags + the sha256 of the binary this repo's author produced. Another
 * Mac or toolchain produces a different binary; that is fine — the install
 * writes `whisper-build.json` beside `whisper-cli` and the sidecar checks the
 * binary against *that* manifest (same tag, same file) before it spawns it.
 *
 * Static libs (`BUILD_SHARED_LIBS=OFF`) so the CLI carries ggml + whisper +
 * the Metal kernels (`GGML_METAL_EMBED_LIBRARY=ON`) inside one file and needs
 * no dylib beside it. If the build still links non-system dylibs, they are
 * copied next to the binary and listed in the manifest.
 *
 * Fails when: not Darwin; cmake / git missing; the checkout's HEAD is not the
 * pinned commit; the build does not produce `bin/whisper-cli`; the binary does
 * not run `--help`; the install lands anywhere but `…/whisper/`.
 *
 * Usage:
 *   npm run build:whisper-mac                       # → ~/Library/Application Support/LocalBot/bin/{target}/whisper/
 *   npm run build:whisper-mac -- --bin-root <dir>   # e.g. data/LocalBot/bin for `npm run dev`
 *   npm run build:whisper-mac -- --src <dir> --build <dir> --jobs N --clean
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
/** @param {string} n */
const flag = (n) => args.includes(n);
/** @param {string} n */
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
/** @param {...unknown} a */
const log = (...a) => console.log("[whisper-mac]", ...a);
/** @param {string} msg @returns {never} */
const fail = (msg) => {
  console.error("[whisper-mac] FAIL:", msg);
  process.exit(1);
};

export const WHISPER_REPO = "https://github.com/ggml-org/whisper.cpp";

/**
 * The one cmake configure line for a target. Pure so the tests can lock it.
 * @param {string} arch
 */
export function whisperCmakeFlags(arch) {
  const metal = arch === "arm64";
  return [
    "-DCMAKE_BUILD_TYPE=Release",
    "-DBUILD_SHARED_LIBS=OFF",
    `-DGGML_METAL=${metal ? "ON" : "OFF"}`,
    `-DGGML_METAL_EMBED_LIBRARY=${metal ? "ON" : "OFF"}`,
    "-DGGML_NATIVE=OFF",
    "-DWHISPER_BUILD_EXAMPLES=ON",
    "-DWHISPER_BUILD_TESTS=OFF",
    "-DWHISPER_BUILD_SERVER=OFF",
    "-DWHISPER_SDL2=OFF",
  ];
}

/** @param {string} [arch] */
export function macWhisperTarget(arch = process.arch) {
  return arch === "arm64" || arch === "aarch64" ? "darwin-arm64" : "darwin-x64";
}

export function defaultMacBinRoot(home = os.homedir()) {
  return path.join(home, "Library", "Application Support", "LocalBot", "bin");
}

/** @param {string} file */
export function sha256File(file) {
  const h = createHash("sha256");
  h.update(fs.readFileSync(file));
  return h.digest("hex");
}

/**
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @param {{ inherit?: boolean; cwd?: string }} [opts]
 */
function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8", stdio: opts.inherit ? "inherit" : "pipe", cwd: opts.cwd, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) fail(`${cmd} ${cmdArgs.join(" ")}: ${r.error.message}`);
  if (r.status !== 0) fail(`${cmd} ${cmdArgs.join(" ")} exited ${r.status}${r.stderr ? `\n${r.stderr.slice(-2000)}` : ""}`);
  return (r.stdout ?? "").trim();
}

/** @param {string} bin */
function which(bin) {
  const r = spawnSync("which", [bin], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * Non-system dylibs the binary links (anything not under /usr/lib or /System).
 * @param {string} otoolOutput
 */
export function foreignDylibs(otoolOutput) {
  return otoolOutput
    .split("\n")
    .slice(1)
    .map((l) => l.trim().split(" (")[0])
    .filter((p) => p && !p.startsWith("/usr/lib/") && !p.startsWith("/System/"));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.platform !== "darwin") fail(`this builds the macOS whisper-cli; host is ${process.platform}. Linux and Windows use the pinned release archives.`);
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog/whisper-assets.json"), "utf8"));
  const release = catalog.release;
  const target = macWhisperTarget();
  const row = catalog.targets[target];
  const pinnedCommit = row?.source?.commit ?? null;

  const cmake = which("cmake");
  if (!cmake) fail("cmake not found. brew install cmake (and xcode-select --install for clang/git).");
  const git = which("git");
  if (!git) fail("git not found (xcode-select --install).");
  const clangVersion = run("clang", ["--version"]).split("\n")[0];
  const cmakeVersion = run("cmake", ["--version"]).split("\n")[0];
  log(`host ${process.platform}-${process.arch} · ${cmakeVersion} · ${clangVersion}`);

  const src = path.resolve(opt("--src") ?? path.join(root, "dist/whisper-src"));
  const build = path.resolve(opt("--build") ?? path.join(root, "dist/whisper-build"));
  const binRoot = path.resolve(opt("--bin-root") ?? defaultMacBinRoot());
  const jobs = Number(opt("--jobs") ?? os.cpus().length) || 4;

  if (flag("--clean")) {
    fs.rmSync(src, { recursive: true, force: true });
    fs.rmSync(build, { recursive: true, force: true });
  }
  if (!fs.existsSync(path.join(src, "CMakeLists.txt"))) {
    fs.rmSync(src, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(src), { recursive: true });
    log(`git clone --depth 1 --branch ${release} ${WHISPER_REPO} → ${src}`);
    run("git", ["clone", "--depth", "1", "--branch", release, WHISPER_REPO, src], { inherit: true });
  }
  const head = run("git", ["rev-parse", "HEAD"], { cwd: src });
  const tag = run("git", ["describe", "--tags", "--exact-match"], { cwd: src });
  if (tag !== release) fail(`${src} is at ${tag}, not ${release}`);
  if (pinnedCommit && head !== pinnedCommit) fail(`${src} HEAD ${head} ≠ catalog commit ${pinnedCommit} for ${release}`);
  log(`source ${release} @ ${head}`);

  const flags = whisperCmakeFlags(process.arch);
  log(`cmake -S ${src} -B ${build} ${flags.join(" ")}`);
  run("cmake", ["-S", src, "-B", build, ...flags], { inherit: true });
  log(`cmake --build ${build} --config Release --target whisper-cli -j ${jobs}`);
  run("cmake", ["--build", build, "--config", "Release", "--target", "whisper-cli", "-j", String(jobs)], { inherit: true });

  const built = path.join(build, "bin", "whisper-cli");
  if (!fs.existsSync(built)) fail(`build finished but ${built} is missing`);
  const help = spawnSync(built, ["--help"], { encoding: "utf8" });
  if (!/usage:/i.test(`${help.stdout}\n${help.stderr}`)) fail(`${built} --help did not print usage (exit ${help.status})`);

  const otool = run("otool", ["-L", built]);
  const dylibs = foreignDylibs(otool);

  const dir = path.join(binRoot, target, "whisper");
  if (path.basename(dir) !== "whisper") fail(`install dir must end in /whisper: ${dir}`);
  fs.mkdirSync(dir, { recursive: true });
  const exe = path.join(dir, "whisper-cli");
  fs.copyFileSync(built, exe);
  fs.chmodSync(exe, 0o755);
  const copiedDylibs = [];
  for (const lib of dylibs) {
    const name = path.basename(lib);
    const candidates = [lib, path.join(build, "src", name), path.join(build, "ggml", "src", name), path.join(build, "bin", name)];
    const from = candidates.find((p) => fs.existsSync(p));
    if (!from) fail(`whisper-cli links ${lib} but it was not found in the build tree`);
    fs.copyFileSync(from, path.join(dir, name));
    copiedDylibs.push(name);
  }
  for (const n of ["whisper-server", "llama-server"]) fs.rmSync(path.join(dir, n), { force: true });

  const sha256 = sha256File(exe);
  const sizeBytes = fs.statSync(exe).size;
  const manifest = {
    release,
    commit: head,
    target,
    binary: "whisper-cli",
    sha256,
    sizeBytes,
    cmake: flags,
    dylibs: copiedDylibs,
    builtAt: new Date().toISOString(),
    host: { os: `${os.type()} ${os.release()}`, arch: process.arch, cpu: os.cpus()[0]?.model ?? null, cmake: cmakeVersion, clang: clangVersion },
  };
  fs.writeFileSync(path.join(dir, "whisper-build.json"), JSON.stringify(manifest, null, 2) + "\n");

  log(`installed ${exe} (${sizeBytes} B) + ${copiedDylibs.length} dylib(s) ${copiedDylibs.join(", ")}`);
  log(`manifest ${path.join(dir, "whisper-build.json")}`);
  if (row?.sha256 && row.sha256 !== sha256) {
    log(`note: catalog sha256 for ${target} is ${row.sha256.slice(0, 12)}… (the binary the repo's author built); this host produced ${sha256.slice(0, 12)}…. The sidecar trusts whisper-build.json for this install.`);
  } else if (row?.sha256 === sha256) {
    log(`catalog sha256 for ${target} matches this build`);
  }
  console.log(`STAGE10_WHISPER_BUILT target=${target} release=${release} commit=${head} sha256=${sha256} bytes=${sizeBytes} exe=${exe} metal=${flags.includes("-DGGML_METAL=ON")}`);
}
