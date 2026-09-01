/**
 * Packaged UI sidecar. Started by Electron's own Node (ELECTRON_RUN_AS_NODE).
 * Binds 127.0.0.1 only. Does not spawn npm or use a system Node install.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SIDECAR_HOST, SIDECAR_PORT, sidecarServerEntry } from "./packaged.mjs";

const dir = process.env.LOCALBOT_SERVER_DIR;
const entry = sidecarServerEntry(dir);

if (!dir || !entry || !fs.existsSync(entry)) {
  console.error("LocalBot UI is missing. Run npm run build:desktop.");
  process.exit(1);
}

process.env.NITRO_HOST = SIDECAR_HOST;
process.env.HOST = SIDECAR_HOST;
process.env.NITRO_PORT = String(SIDECAR_PORT);
process.env.PORT = String(SIDECAR_PORT);
process.env.LOCALBOT_ELECTRON = "1";
process.env.LOCALBOT_PACKAGED = "1";

try {
  process.chdir(dir);
} catch {
  /* keep cwd */
}

await import(pathToFileURL(path.resolve(entry)).href);
