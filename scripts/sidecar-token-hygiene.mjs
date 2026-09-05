/**
 * Stage 17 — repo hygiene rules shared by src/lib/sidecar-token.test.ts and
 * scripts/prove-token.mjs: which strings would mean "the sidecar gate can be
 * switched off" or "a token is committed". Patterns are assembled from
 * pieces so this file never matches itself.
 */
import fs from "node:fs";
import path from "node:path";

/** @param {string[]} parts */
const join = (...parts) => parts.join("");

/** Any of these in shipped code = a knob that disables the gate. */
export const BYPASS_PATTERNS = [
  new RegExp(join("LOCALBOT_", "(SKIP|DISABLE|NO)_", "(SIDECAR_)?TOKEN"), "i"),
  new RegExp(join("SIDECAR_TOKEN_", "(DISABLED?|SKIP|OFF|BYPASS)"), "i"),
  new RegExp(join("LOCALBOT_", "INSECURE"), "i"),
  new RegExp(join("allowRequests", "WithoutToken"), "i"),
  new RegExp(join("(skip|bypass|disable)", "SidecarToken"), "i"),
];

/** `…token… "…64 hex…"` on one line: a committed token. (sha256 pins have no "token" nearby.) */
export const TOKEN_LITERAL = new RegExp(join("(token|TOKEN)", "[^\\n]{0,60}", "[\"'`][0-9a-f]{64}[\"'`]"));
/** `LOCALBOT_SIDECAR_TOKEN = "abc…"`: the env pinned to a constant. */
export const ENV_LITERAL = new RegExp(join("LOCALBOT_SIDECAR_TOKEN", "\\s*[:=]\\s*", "[\"'`][0-9a-f]+[\"'`]"));
/** A prove script that sends an empty token on purpose, or empties the global middleware. */
export const PROVE_SKIP_PATTERNS = [
  new RegExp(join("x-localbot-token", "[\"']?\\s*:\\s*[\"']{2}")),
  new RegExp(join("functionMiddleware", ":\\s*\\[\\s*\\]")),
];

/** Shipped source roots to scan (relative to the repo root). */
export const SHIPPED_ROOTS = ["src", "desktop", "scripts", "server", "dsh"];
export const SHIPPED_FILES = ["vite.config.ts", "package.json", "eslint.config.mjs"];

/** @param {string} root repo root */
export function shippedFiles(root) {
  return [...SHIPPED_ROOTS.flatMap((d) => walk(root, d)), ...SHIPPED_FILES.filter((f) => fs.existsSync(path.join(root, f)))];
}

/**
 * @param {string} root
 * @param {string} dir
 * @returns {string[]} repo-relative paths
 */
export function walk(root, dir) {
  /** @type {string[]} */
  const out = [];
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      out.push(...walk(root, rel));
    } else if (/\.(ts|tsx|mjs|cjs|js|json|yml|yaml|html|css)$/.test(e.name)) out.push(rel);
  }
  return out;
}

/**
 * Scan shipped files. Returns human-readable problems (empty = clean).
 * @param {string} root
 */
export function hygieneProblems(root) {
  /** @type {string[]} */
  const problems = [];
  for (const f of shippedFiles(root)) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    if (BYPASS_PATTERNS.some((re) => re.test(src))) problems.push(`${f}: bypass knob`);
    if (TOKEN_LITERAL.test(src)) problems.push(`${f}: hardcoded token`);
    if (ENV_LITERAL.test(src)) problems.push(`${f}: LOCALBOT_SIDECAR_TOKEN pinned to a literal`);
  }
  for (const n of fs.readdirSync(path.join(root, "scripts")).filter((n) => /^prove-.*\.mjs$/.test(n))) {
    const src = fs.readFileSync(path.join(root, "scripts", n), "utf8");
    if (PROVE_SKIP_PATTERNS.some((re) => re.test(src))) problems.push(`scripts/${n}: skips the gate`);
  }
  return problems;
}
