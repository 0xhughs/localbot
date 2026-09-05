/**
 * Packaged UI sidecar. Started by Electron's own Node (ELECTRON_RUN_AS_NODE).
 * Binds 127.0.0.1 only. Does not spawn npm or use a system Node install.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SIDECAR_HOST, SIDECAR_PORT, sidecarServerEntry } from "./packaged.mjs";
import { isSidecarToken, SIDECAR_TOKEN_ENV } from "./sidecar-token.mjs";

const dir = process.env.LOCALBOT_SERVER_DIR;
const entry = sidecarServerEntry(dir);

if (!dir || !entry || !fs.existsSync(entry)) {
  console.error("LocalBot UI is missing. Run npm run build:desktop.");
  process.exit(1);
}

// Stage 17: no per-launch token, no server. The launcher (desktop/main.mjs)
// mints one; a sidecar started by hand without it would serve every function
// to any local process, so it refuses to bind at all.
if (!isSidecarToken(process.env[SIDECAR_TOKEN_ENV])) {
  console.error(`LocalBot sidecar refused to start: ${SIDECAR_TOKEN_ENV} is missing or not 32 hex bytes. Start it from LocalBot.`);
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
