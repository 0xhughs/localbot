#!/usr/bin/env node
/**
 * npm run desktop — open the Electron window.
 * Main process starts the UI (if needed) with desktop data paths, then loads it.
 * This is not a signed installer.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const require = createRequire(import.meta.url);
let electronBin;
try {
  electronBin = require("electron");
} catch {
  console.error("Electron is not installed. Run npm install.");
  process.exit(1);
}

const args = [path.join(here, "main.mjs")];
const env = { ...process.env, ELECTRON_RUN_AS_NODE: undefined };
delete env.ELECTRON_RUN_AS_NODE;

const useXvfb = process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
const child = useXvfb
  ? spawn("xvfb-run", ["-a", electronBin, ...args], { cwd: root, stdio: "inherit", env })
  : spawn(electronBin, args, { cwd: root, stdio: "inherit", env });

child.on("exit", (code) => {
  if (code) {
    console.error(
      "Electron exited with code",
      code,
      "— LocalBot is a desktop window (no URL bar). Linux needs GTK 3 to paint. This pass is not a signed installer.",
    );
  }
  process.exit(code ?? 0);
});
