/**
 * Stage 17: the per-launch sidecar token.
 *
 * Whoever starts the UI server mints 32 random bytes and hands them down
 * through the child's environment (LOCALBOT_SIDECAR_TOKEN). The serving
 * process takes the value out of the environment once, keeps it in memory,
 * and every server function refuses a request whose `x-localbot-token`
 * header does not match. Nothing here is read from disk or from git.
 *
 *   packaged      desktop/main.mjs → env → desktop/sidecar.mjs → Nitro server
 *   npm run desktop  desktop/main.mjs → env → npm run dev (Vite) → SSR modules
 *   npm run dev      the Vite dev server mints its own (scripts/sidecar-token-plugin.mjs)
 *
 * Pure helpers so tests can lock the contract. Node only (crypto).
 */
import { randomBytes, timingSafeEqual } from "node:crypto";

export const SIDECAR_TOKEN_ENV = "LOCALBOT_SIDECAR_TOKEN";
export const SIDECAR_TOKEN_HEADER = "x-localbot-token";
/** Electron `additionalArguments` entry the preload reads (`--localbot-sidecar-token=<hex>`). */
export const SIDECAR_TOKEN_ARG = "--localbot-sidecar-token=";
/** `<meta name>` the dev server injects for a loopback browser (never packaged). */
export const SIDECAR_TOKEN_META = "localbot-sidecar-token";
export const SIDECAR_TOKEN_BYTES = 32;

const TOKEN_RE = /^[0-9a-f]{64}$/;
const SLOT = Symbol.for("localbot.sidecarToken");

/** 32 random bytes, hex. A new one every time this is called. */
export function mintSidecarToken() {
  return randomBytes(SIDECAR_TOKEN_BYTES).toString("hex");
}

/** @param {unknown} value */
export function isSidecarToken(value) {
  return typeof value === "string" && TOKEN_RE.test(value);
}

/**
 * The serving process's token: the in-memory slot when already taken,
 * otherwise consumed from the environment (and removed from it, so children
 * this process spawns — dsh, llama-server, whisper — do not inherit it).
 * Null when neither has a valid token.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {Record<PropertyKey, unknown>} [slots]
 * @returns {string | null}
 */
export function takeSidecarToken(env = process.env, slots = /** @type {Record<PropertyKey, unknown>} */ (globalThis)) {
  const held = slots[SLOT];
  if (isSidecarToken(held)) return /** @type {string} */ (held);
  const raw = env[SIDECAR_TOKEN_ENV];
  if (!isSidecarToken(raw)) return null;
  slots[SLOT] = raw;
  delete env[SIDECAR_TOKEN_ENV];
  return /** @type {string} */ (raw);
}

/**
 * Put a token in the in-memory slot (the dev server after minting its own).
 * @param {string} token
 * @param {Record<PropertyKey, unknown>} [slots]
 */
export function holdSidecarToken(token, slots = /** @type {Record<PropertyKey, unknown>} */ (globalThis)) {
  if (!isSidecarToken(token)) throw new Error("holdSidecarToken: not a 32-byte hex token");
  slots[SLOT] = token;
}

/**
 * Constant-time check of a presented header against the expected token.
 * Missing / empty → NO_TOKEN. Anything else that is not byte-equal → BAD_TOKEN.
 *
 * @param {string} expected
 * @param {unknown} presented
 * @returns {{ ok: true } | { ok: false, code: "NO_TOKEN" | "BAD_TOKEN" }}
 */
export function verifySidecarToken(expected, presented) {
  if (!isSidecarToken(expected)) return { ok: false, code: "BAD_TOKEN" };
  if (typeof presented !== "string" || presented.trim() === "") return { ok: false, code: "NO_TOKEN" };
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(presented, "utf8");
  // Same-length compare only; a wrong length is rejected after a compare of
  // equal cost so the branch does not leak which byte differed.
  const probe = b.length === a.length ? b : Buffer.alloc(a.length);
  const same = timingSafeEqual(a, probe) && b.length === a.length;
  return same ? { ok: true } : { ok: false, code: "BAD_TOKEN" };
}

/**
 * The token from an Electron renderer's argv (`additionalArguments`), or null.
 * @param {readonly string[]} argv
 */
export function tokenFromArgv(argv) {
  for (const a of argv ?? []) {
    if (typeof a === "string" && a.startsWith(SIDECAR_TOKEN_ARG)) {
      const v = a.slice(SIDECAR_TOKEN_ARG.length);
      return isSidecarToken(v) ? v : null;
    }
  }
  return null;
}

/**
 * Is this `Host` header the machine itself? Only 127.0.0.1, localhost and
 * ::1 (with or without a port). `0.0.0.0`, LAN addresses and hostnames are
 * not loopback even when they resolve here — the dev token is served to the
 * loopback document only.
 *
 * @param {unknown} host
 */
export function isLoopbackHost(host) {
  if (typeof host !== "string") return false;
  let h = host.trim().toLowerCase();
  if (!h) return false;
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    if (end < 0) return false;
    h = h.slice(1, end);
  } else {
    const colon = h.indexOf(":");
    if (colon >= 0 && h.indexOf(":", colon + 1) < 0) h = h.slice(0, colon);
  }
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

/**
 * Dev server only: put the token in the document as
 * `<meta name="localbot-sidecar-token" content="…">` right after `<head>`.
 * Unchanged when there is no `<head>`; never called for the packaged sidecar.
 *
 * @param {string} html
 * @param {string} token
 */
export function injectSidecarTokenMeta(html, token) {
  if (!isSidecarToken(token)) return html;
  const m = /<head(\s[^>]*)?>/i.exec(html);
  if (!m) return html;
  const at = m.index + m[0].length;
  return `${html.slice(0, at)}<meta name="${SIDECAR_TOKEN_META}" content="${token}">${html.slice(at)}`;
}
