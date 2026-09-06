#!/usr/bin/env node
/**
 * npm run build:desktop — UNSIGNED installers for this OS (Stage 8).
 *
 * Linux: AppImage + .deb. macOS: .dmg (identity null, not notarized).
 * Windows: NSIS .exe (no certificate). Build-time only: the person who runs
 * this needs Node + npm. The installed app does not: it carries the Nitro
 * sidecar, the DeepSeek Harness tree, and an official Node >= 22.15 for dsh
 * (Electron 36's embedded Node 22.14 cannot load it).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  checksumLines,
  hasInstallerTarget,
  listInstallers,
  nodeBinaryVersion,
  nodeRuntimeTarget,
  pnpmPinOf,
  pnpmShimVersion,
  stageHarness,
  stageNodeRuntime,
  stagePnpm,
  stageWhisperBuilt,
  versionAtLeast,
} from "./desktop-stage.mjs";
import { defaultMacBinRoot, macWhisperTarget } from "./build-whisper-mac.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staged = path.join(root, "dist/desktop-src");
const outDir = path.join(root, "dist/desktop");
const argv = process.argv.slice(2);
/** @param {string} n */
const opt = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};

function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("exit", (code) => {
      if (code) reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
      else resolve();
    });
  });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function injectSsrCss(outputRoot) {
  const ssrAssets = path.join(root, "node_modules/.nitro/vite/services/ssr/assets");
  const pubAssets = path.join(outputRoot, "public/assets");
  const serverIndex = path.join(outputRoot, "server/index.mjs");
  if (!fs.existsSync(ssrAssets) || !fs.existsSync(pubAssets) || !fs.existsSync(serverIndex)) return;
  fs.mkdirSync(pubAssets, { recursive: true });
  let src = fs.readFileSync(serverIndex, "utf8");
  const marker = "var public_assets_data_default = {\n";
  let changed = false;
  for (const name of fs.readdirSync(ssrAssets)) {
    if (!name.endsWith(".css")) continue;
    fs.copyFileSync(path.join(ssrAssets, name), path.join(pubAssets, name));
    const key = `/assets/${name}`;
    if (src.includes(`"${key}"`)) continue;
    if (!src.includes(marker)) {
      console.warn("[desktop] public_assets_data_default marker missing; CSS may 404:", key);
      continue;
    }
    const st = fs.statSync(path.join(pubAssets, name));
    const entry = `\t"${key}": {\n\t\t"type": "text/css; charset=utf-8",\n\t\t"etag": "\\"${st.size}-ssr\\"",\n\t\t"mtime": ${JSON.stringify(st.mtime.toISOString())},\n\t\t"size": ${st.size},\n\t\t"path": "../public/assets/${name}"\n\t},\n`;
    src = src.replace(marker, `${marker}${entry}`);
    changed = true;
    console.log("[desktop] injected SSR CSS", key);
  }
  if (changed) fs.writeFileSync(serverIndex, src);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const osKey = process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "linux";
if (!hasInstallerTarget(pkg, osKey)) {
  console.error(`[desktop] package.json build.${osKey}.target has no installer target (only "dir"). Stage 8 requires one.`);
  process.exit(1);
}
if (pkg.build?.mac?.identity !== null) {
  console.error("[desktop] build.mac.identity must stay null: this repo has no signing identity and never claims one.");
  process.exit(1);
}
const dshPin = pkg.dependencies?.["@deepseek-ai/dsh"];
if (!dshPin || !/^\d/.test(dshPin)) {
  console.error("[desktop] @deepseek-ai/dsh must be an exact pin in package.json, got", dshPin);
  process.exit(1);
}
let pnpmPin;
try {
  pnpmPin = pnpmPinOf(pkg);
} catch (err) {
  console.error("[desktop]", err instanceof Error ? err.message : String(err));
  process.exit(1);
}

console.log("[desktop] building Nitro node-server UI…");
await run(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "build"], {
  LOCALBOT_DESKTOP_BUILD: "1",
});

const server = path.join(root, ".output", "server", "index.mjs");
if (!fs.existsSync(server)) {
  console.error("[desktop] missing", server);
  process.exit(1);
}
injectSsrCss(path.join(root, ".output"));

fs.rmSync(staged, { recursive: true, force: true });
fs.mkdirSync(path.join(staged, "desktop"), { recursive: true });
copyDir(path.join(root, "desktop"), path.join(staged, "desktop"));
copyDir(path.join(root, "catalog"), path.join(staged, "catalog"));
fs.writeFileSync(
  path.join(staged, "package.json"),
  JSON.stringify(
    {
      name: "localbot",
      version: pkg.version || "0.1.0",
      productName: "LocalBot",
      description: pkg.description || "LocalBot",
      author: pkg.author || "LocalBot",
      main: "desktop/main.mjs",
      type: "module",
    },
    null,
    2,
  ) + "\n",
);

const sidecarStage = path.join(root, "dist/desktop-sidecar");
fs.rmSync(sidecarStage, { recursive: true, force: true });
fs.mkdirSync(sidecarStage, { recursive: true });
fs.copyFileSync(path.join(root, "desktop/sidecar.mjs"), path.join(sidecarStage, "sidecar.mjs"));
fs.copyFileSync(path.join(root, "desktop/packaged.mjs"), path.join(sidecarStage, "packaged.mjs"));
fs.copyFileSync(path.join(root, "desktop/sidecar-token.mjs"), path.join(sidecarStage, "sidecar-token.mjs"));

// Stage 8: the Harness runtime the installed app carries. Staged one level
// down (dist/desktop-harness/localbot-harness) and copied to the resources
// root: electron-builder's extraResources filter silently drops a
// `node_modules` that sits directly under `from`, but keeps a nested one.
console.log("[desktop] staging DeepSeek Harness", dshPin, "…");
fs.rmSync(path.join(root, "dist/desktop-harness"), { recursive: true, force: true });
stageHarness({ root, stage: path.join(root, "dist/desktop-harness/localbot-harness"), dshPin });

const nodeTarget = nodeRuntimeTarget();
console.log("[desktop] staging Node runtime for", nodeTarget, "…");
const nodeStage = await stageNodeRuntime({
  root,
  stage: path.join(root, "dist/desktop-node"),
  cache: path.join(root, "dist/node-cache"),
  target: nodeTarget,
});
const stagedNodeVersion = nodeBinaryVersion(nodeStage.bin);
if (!stagedNodeVersion || !versionAtLeast(stagedNodeVersion, nodeStage.minimum)) {
  console.error(`[desktop] staged Node reports ${stagedNodeVersion ?? "nothing"}; need >= ${nodeStage.minimum}`);
  process.exit(1);
}
console.log(`[desktop] bundled Node ${stagedNodeVersion} (pin ${nodeStage.pin}, minimum ${nodeStage.minimum})`);

// Stage 20: the pnpm that `dsh plugin` forwards to. Staged one level down
// (dist/desktop-pnpm/localbot-pnpm) like the Harness so its nested
// node_modules survive electron-builder's extraResources filter. Checked here
// the way the installed app runs it: bundled Node, nothing on PATH.
console.log("[desktop] staging pnpm", pnpmPin, "…");
const pnpmStageRoot = path.join(root, "dist/desktop-pnpm");
fs.rmSync(pnpmStageRoot, { recursive: true, force: true });
const pnpmStage = stagePnpm({ root, stage: pnpmStageRoot, pin: pnpmPin });
const stagedPnpmVersion = pnpmShimVersion(process.platform === "win32" ? pnpmStage.cmd : pnpmStage.shim, nodeStage.bin);
if (stagedPnpmVersion !== pnpmPin) {
  console.error(`[desktop] staged pnpm shim reports ${stagedPnpmVersion ?? "nothing"} on the bundled Node with an empty PATH; pin is ${pnpmPin}`);
  process.exit(1);
}
console.log(`[desktop] bundled pnpm ${stagedPnpmVersion} runs on the bundled Node with an empty PATH`);

// Stage 20: darwin-arm64 ships the Stage 10 whisper-cli build so the Mic works
// on a fresh AppData without cmake. Source, in order: --whisper-dir, the Stage
// 10 install under ~/Library/Application Support/LocalBot/bin, else build it
// now (cmake on this build Mac only). Other hosts stage an empty folder: their
// whisper rows are first-use downloads (linux/win) or NOT BUILT (darwin-x64).
const whisperStageRoot = path.join(root, "dist/desktop-whisper");
fs.rmSync(whisperStageRoot, { recursive: true, force: true });
fs.mkdirSync(whisperStageRoot, { recursive: true });
const whisperTarget = process.platform === "darwin" ? macWhisperTarget() : null;
let whisperStaged = null;
if (whisperTarget === "darwin-arm64") {
  const appData = path.join(defaultMacBinRoot(), whisperTarget, "whisper");
  const explicit = opt("--whisper-dir");
  let from = explicit ? path.resolve(explicit) : fs.existsSync(path.join(appData, "whisper-cli")) ? appData : null;
  if (!from) {
    const binRoot = path.join(root, "dist/whisper-stage");
    console.log(`[desktop] no whisper-cli under ${appData}; running npm run build:whisper-mac -- --bin-root ${binRoot} (cmake needed on this build Mac only)`);
    await run(process.execPath, [path.join(root, "scripts/build-whisper-mac.mjs"), "--bin-root", binRoot]);
    from = path.join(binRoot, whisperTarget, "whisper");
  }
  console.log(`[desktop] staging whisper-cli for ${whisperTarget} from ${from} …`);
  whisperStaged = stageWhisperBuilt({ root, stage: whisperStageRoot, target: whisperTarget, from });
} else if (whisperTarget === "darwin-x64") {
  console.log("[desktop] darwin-x64: whisper-cli stays NOT BUILT (no catalog row); nothing staged.");
} else {
  console.log(`[desktop] ${nodeTarget}: whisper-cli is a first-use download from catalog/whisper-assets.json; nothing staged.`);
}

const require = createRequire(import.meta.url);
let builderBin;
try {
  const dir = path.dirname(require.resolve("electron-builder/package.json"));
  builderBin = path.join(dir, "cli.js");
  if (!fs.existsSync(builderBin)) builderBin = require.resolve("electron-builder/cli.js");
} catch {
  console.error("[desktop] electron-builder is not installed.");
  process.exit(1);
}

console.log(`[desktop] electron-builder (${osKey}: ${pkg.build[osKey].target.join(", ")}; UNSIGNED)…`);
await run(process.execPath, [builderBin, "--publish", "never", "-c.directories.app=dist/desktop-src"], {
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
});

function assertLayout(appOutDir) {
  const checks = [
    "resources/localbot-sidecar/sidecar.mjs",
    "resources/localbot-sidecar/packaged.mjs",
    "resources/localbot-sidecar/sidecar-token.mjs",
    "resources/localbot-server/server/index.mjs",
    "resources/app.asar.unpacked/desktop/main.mjs",
    "resources/app.asar.unpacked/desktop/packaged.mjs",
    "resources/app.asar.unpacked/desktop/sidecar-token.mjs",
    "resources/app.asar.unpacked/desktop/quit-flush.mjs",
    "resources/app.asar.unpacked/desktop/preload.cjs",
    "resources/localbot-harness/dsh/localbot-acp.cordis.yml",
    "resources/localbot-harness/dsh/localbot-fs.mjs",
    "resources/localbot-harness/src/lib/fs/scopes.ts",
    "resources/localbot-harness/node_modules/@deepseek-ai/dsh/lib/bin.js",
    "resources/localbot-harness/node_modules/@deepseek-ai/dsh-fs-local/package.json",
    `resources/localbot-node/${process.platform === "win32" ? "node.exe" : "node"}`,
    "resources/localbot-node/LICENSE.node",
    "resources/localbot-pnpm/bin/pnpm",
    "resources/localbot-pnpm/bin/pnpm.cmd",
    "resources/localbot-pnpm/pnpm.cjs",
    "resources/localbot-pnpm/pnpm/bin/pnpm.cjs",
    "resources/localbot-pnpm/pnpm/dist/pnpm.cjs",
    "resources/localbot-pnpm/LICENSE",
    "resources/localbot-pnpm/pnpm-runtime.json",
    ...(whisperStaged ? ["resources/localbot-whisper/darwin-arm64/whisper/whisper-cli", "resources/localbot-whisper/darwin-arm64/whisper/whisper-build.json"] : []),
  ].map((p) => path.join(appOutDir, p));
  const missing = checks.filter((p) => !fs.existsSync(p));
  if (missing.length) {
    console.error("[desktop] missing after pack:", missing);
    process.exit(1);
  }
  const packedNode = checks.find((p) => p.includes("localbot-node"));
  const v = nodeBinaryVersion(packedNode);
  if (!v || !versionAtLeast(v, nodeStage.minimum)) {
    console.error(`[desktop] packed Node at ${packedNode} reports ${v ?? "nothing"}`);
    process.exit(1);
  }
  console.log("[desktop] packed layout ok;", packedNode, "is", v);
  const packedShim = path.join(appOutDir, `resources/localbot-pnpm/bin/${process.platform === "win32" ? "pnpm.cmd" : "pnpm"}`);
  const pv = pnpmShimVersion(packedShim, packedNode);
  if (pv !== pnpmPin) {
    console.error(`[desktop] packed pnpm shim at ${packedShim} reports ${pv ?? "nothing"} on the packed Node with an empty PATH; pin is ${pnpmPin}`);
    process.exit(1);
  }
  console.log("[desktop] packed pnpm", pv, "runs on the packed Node with an empty PATH");
  if (whisperStaged) {
    const packedWhisper = path.join(appOutDir, "resources/localbot-whisper/darwin-arm64/whisper/whisper-cli");
    const help = spawnSync(packedWhisper, ["--help"], { encoding: "utf8", timeout: 20000 });
    if (!/usage:/i.test(`${help.stdout}\n${help.stderr}`)) {
      console.error(`[desktop] packed whisper-cli at ${packedWhisper} did not print usage (exit ${help.status})`);
      process.exit(1);
    }
    console.log("[desktop] packed whisper-cli answers --help (sha256", whisperStaged.sha256.slice(0, 12) + "…)");
  }
}
const layoutRoots = [
  path.join(outDir, "linux-unpacked"),
  path.join(outDir, "win-unpacked"),
  path.join(outDir, "mac/LocalBot.app/Contents"),
  path.join(outDir, "mac-arm64/LocalBot.app/Contents"),
  path.join(outDir, "mac-x64/LocalBot.app/Contents"),
];
const layoutRoot = layoutRoots.find((p) => fs.existsSync(p));
if (!layoutRoot) {
  console.error("[desktop] no unpacked app under", outDir);
  process.exit(1);
}
assertLayout(layoutRoot);

const installers = listInstallers(outDir);
if (installers.length === 0) {
  console.error(`[desktop] electron-builder produced no installer under ${outDir}`);
  process.exit(1);
}
const sums = checksumLines(installers);
fs.writeFileSync(path.join(outDir, "SHA256SUMS.txt"), sums.join("\n") + "\n");
console.log("[desktop] UNSIGNED installers:");
for (const line of sums) console.log("  " + line);
console.log("[desktop] checksums:", path.join(outDir, "SHA256SUMS.txt"));
console.log(
  `[desktop] not signed, not notarized, not a store build. Node/npm/pnpm are not needed to run the installed app (bundled Node ${stagedNodeVersion}, bundled pnpm ${pnpmPin}${whisperStaged ? ", baked whisper-cli for darwin-arm64" : ""}).`,
);
