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
