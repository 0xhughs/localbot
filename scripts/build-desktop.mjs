#!/usr/bin/env node
/**
 * npm run build:desktop — unsigned unpacked Electron app for this OS.
 * Build-time only: the person who runs this still needs Node. The packaged
 * binary they open afterwards does not.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staged = path.join(root, "dist/desktop-src");

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

console.log("[desktop] building Nitro node-server UI…");
await run("node", ["scripts/with-app-env.mjs", "vite", "build"], {
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
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
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

console.log("[desktop] electron-builder --dir (unsigned)…");
await run(process.execPath, [builderBin, "--dir", "-c.directories.app=dist/desktop-src"], {
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
});

const candidates = [
  path.join(root, "dist/desktop/linux-unpacked/LocalBot"),
  path.join(root, "dist/desktop/linux-unpacked/localbot"),
  path.join(root, "dist/desktop/mac/LocalBot.app"),
  path.join(root, "dist/desktop/mac-arm64/LocalBot.app"),
  path.join(root, "dist/desktop/mac-x64/LocalBot.app"),
  path.join(root, "dist/desktop/win-unpacked/LocalBot.exe"),
];
const hit = candidates.find((p) => fs.existsSync(p));
console.log("[desktop] unsigned unpacked app:", hit ?? path.join(root, "dist/desktop"));

function assertLayout(appOutDir) {
  const checks = [
    path.join(appOutDir, "resources/localbot-sidecar/sidecar.mjs"),
    path.join(appOutDir, "resources/localbot-sidecar/packaged.mjs"),
    path.join(appOutDir, "resources/localbot-server/server/index.mjs"),
    path.join(appOutDir, "resources/app.asar.unpacked/desktop/main.mjs"),
    path.join(appOutDir, "resources/app.asar.unpacked/desktop/packaged.mjs"),
  ];
  const missing = checks.filter((p) => !fs.existsSync(p));
  if (missing.length) {
    console.error("[desktop] missing after pack:", missing);
    process.exit(1);
  }
}
const linuxOut = path.join(root, "dist/desktop/linux-unpacked");
const layoutRoots = [
  linuxOut,
  path.join(root, "dist/desktop/win-unpacked"),
  path.join(root, "dist/desktop/mac/LocalBot.app/Contents/Resources"),
  path.join(root, "dist/desktop/mac-arm64/LocalBot.app/Contents/Resources"),
  path.join(root, "dist/desktop/mac-x64/LocalBot.app/Contents/Resources"),
];
const layoutRoot = layoutRoots.find((p) => fs.existsSync(p));
if (layoutRoot) assertLayout(layoutRoot);

console.log("[desktop] not notarized, not a store build. Employee does not need Node.");
