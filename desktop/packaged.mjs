/**
 * Packaged vs dev UI target. Pure helpers so tests can lock the contract:
 * packaged mode never falls back to the Vite dev URL and never spawns npm.
 */
export const DEV_UI_URL = "http://127.0.0.1:8080/";
export const SIDECAR_HOST = "127.0.0.1";
export const SIDECAR_PORT = 18790;
export const SIDECAR_URL = `http://${SIDECAR_HOST}:${SIDECAR_PORT}/`;
export const MISSING_UI_MESSAGE =
  "LocalBot UI is missing. Run npm run build:desktop.";

export function isPackagedMode({ packaged = false, env = process.env } = {}) {
  if (env && env.LOCALBOT_PACKAGED === "1") return true;
  return Boolean(packaged);
}

/**
 * Decide which URL the Electron window loads.
 * Packaged: sidecar only. Never the Vite-dev localhost fallback.
 */
export function resolveUiLoad({
  packaged = false,
  uiUrlEnv = "",
  sidecarReady = false,
  sidecarUrl = SIDECAR_URL,
} = {}) {
  if (packaged) {
    if (sidecarReady) {
      return {
        ok: true,
        url: sidecarUrl,
        kind: "sidecar",
        spawnsNpmDev: false,
      };
    }
    return {
      ok: false,
      url: null,
      kind: "missing",
      spawnsNpmDev: false,
      error: MISSING_UI_MESSAGE,
    };
  }
  const url =
    typeof uiUrlEnv === "string" && uiUrlEnv.trim() ? uiUrlEnv.trim() : DEV_UI_URL;
  return {
    ok: true,
    url,
    kind: "dev",
    spawnsNpmDev: true,
  };
}

/**
 * Stage 9: microphone permission policy for the renderer, pure so the tests
 * lock it. Electron with no handler grants every permission to every origin;
 * this is the one place that decides instead.
 *
 *   - `media` for an allowed origin (the sidecar, or the dev UI) is granted
 *     only when every requested media type is `audio`. Video is never granted.
 *   - `media` for any other origin is denied.
 *   - non-media permissions keep today's behaviour for the app's own origin
 *     (granted) and are denied for every other origin.
 *
 * Request handler details carry `mediaTypes: string[]`; the check handler
 * carries `mediaType: string`. Both shapes are accepted.
 *
 * @param {{
 *   permission: string,
 *   requestingOrigin: string | null | undefined,
 *   allowedOrigins: readonly string[],
 *   details?: { mediaTypes?: readonly string[], mediaType?: string } | null,
 * }} input
 * @returns {boolean}
 */
export function mediaPermissionDecision({ permission, requestingOrigin, allowedOrigins, details }) {
  const origin = normalizeOrigin(requestingOrigin);
  const allowed = Boolean(origin) && allowedOrigins.map(normalizeOrigin).includes(origin);
  if (!allowed) return false;
  if (permission !== "media" && permission !== "audioCapture" && permission !== "videoCapture") return true;
  if (permission === "videoCapture") return false;
  if (permission === "audioCapture") return true;
  const types = details?.mediaTypes ?? (details?.mediaType ? [details.mediaType] : []);
  if (types.length === 0) return false;
  return types.every((t) => t === "audio");
}

/**
 * `http://127.0.0.1:18790/` → `http://127.0.0.1:18790`; unparsable → "".
 * @param {unknown} value
 */
export function normalizeOrigin(value) {
  if (!value || typeof value !== "string") return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

/** @param {string} serverDir */
export function sidecarServerEntry(serverDir) {
  if (!serverDir) return null;
  return `${String(serverDir).replace(/[/\\]+$/, "")}/server/index.mjs`;
}

/**
 * ESM child processes cannot import from asar; use the unpacked twin.
 * @param {string} filePath
 */
export function unpackAsarPath(filePath) {
  return String(filePath).replace(/app\.asar(?=\/|\\)/, "app.asar.unpacked");
}

/**
 * Stage 8: where the packaged app keeps the DeepSeek Harness runtime.
 * Everything is an explicit extraResources entry written by
 * scripts/build-desktop.mjs — nothing here comes from the employee's machine.
 *
 *   resources/localbot-node/node[.exe]          official Node >= 22.15 (catalog/node-runtime.json)
 *   resources/localbot-harness/dsh/             localbot-acp.cordis.yml + localbot-fs.mjs
 *   resources/localbot-harness/src/…            the TS the fs plugin imports (traced at build)
 *   resources/localbot-harness/node_modules/    @deepseek-ai/dsh tree (npm install at build, exact pins)
 *
 * @param {{ resourcesPath: string, platform?: string }} opts
 */
export function harnessResourcePaths({ resourcesPath, platform = process.platform }) {
  const res = String(resourcesPath).replace(/[/\\]+$/, "");
  return {
    nodeBin: `${res}/localbot-node/${platform === "win32" ? "node.exe" : "node"}`,
    dshDir: `${res}/localbot-harness/dsh`,
    modulesDir: `${res}/localbot-harness/node_modules`,
  };
}

/**
 * Env the packaged sidecar (and through it the dsh child) receives so the
 * Harness runs from the app's own resources. Only paths that exist are set:
 * a missing bundled Node leaves LOCALBOT_DSH_NODE unset and the sidecar's
 * findHarnessNode refuses with the exact reason instead of hunting on PATH.
 *
 * @param {{ resourcesPath: string, platform?: string, exists?: (p: string) => boolean }} opts
 */
export function packagedHarnessEnv({ resourcesPath, platform = process.platform, exists }) {
  const p = harnessResourcePaths({ resourcesPath, platform });
  const has = exists ?? (() => true);
  /** @type {Record<string, string>} */
  const env = {};
  if (has(p.nodeBin)) env.LOCALBOT_DSH_NODE = p.nodeBin;
  if (has(p.dshDir)) env.LOCALBOT_DSH_DIR = p.dshDir;
  if (has(p.modulesDir)) env.LOCALBOT_DSH_MODULES = p.modulesDir;
  return env;
}

/**
 * Packaged sidecar lives in extraResources (real files) so Electron's Node
 * can ESM-import it. Dev uses the repo desktop/ folder.
 */
export function sidecarScriptPath({
  packaged = false,
  resourcesPath = "",
  here = "",
} = {}) {
  if (packaged && resourcesPath) {
    return `${String(resourcesPath).replace(/[/\\]+$/, "")}/localbot-sidecar/sidecar.mjs`;
  }
  return unpackAsarPath(`${String(here).replace(/[/\\]+$/, "")}/sidecar.mjs`);
}
