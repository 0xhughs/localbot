/**
 * Stage 19 — template-excision gates shared by src/lib/excision.test.ts and
 * scripts/prove-excise.mjs. Pure: read the tree under `root`, return a list of
 * { ok, label } results. Nothing here touches the network or spawns anything.
 *
 * What counts as a regression (any one → exit 1 in the proof, a failing test):
 *   - a template module (auth / db / app-data / the Grok preview bridge / the
 *     PWA plugin / the hosted-demo chain) is back on disk
 *   - src/components, src/routes, src/lib/fs, src/lib/runtime, src/lib/harness
 *     import lib/auth, lib/db or app-data
 *   - better-auth / kysely / pg / @electric-sql/pglite / jose / api.x.ai show up
 *     under src/, scripts/, desktop/, vite.config.ts, or in package.json deps
 *   - __root.tsx mounts AuthProvider / PreviewHostBridge or links /__grok/*
 *   - vite.config.ts registers the template plugins or serverDir, or moves
 *     sidecarTokenPlugin() after tanstackStart()
 *   - the build script still runs db:migrate; npm test still runs the template suites
 *   - chat.tsx drops runAgentTurn; start.ts drops the token middleware;
 *     main.mjs drops the quit coordinator; dsh / ACP pins float;
 *     dsh/localbot-fs.mjs changes
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DSH_PIN = "0.1.2-alpha.5";
export const ACP_SDK_PIN = "1.4.0";
export const LOCALBOT_FS_SHA256 = "0bb5593abecbc116a7b3c614882cfc109831e88c45b735962ce14ef904c2b0a6";

/** Paths that must not exist any more (repo-relative). */
export const GONE = [
  "src/lib/auth",
  "src/lib/db.ts",
  "src/lib/app-data",
  "src/lib/og",
  "src/lib/preview-host-bridge.ts",
  "src/lib/preview-embedder-origin.ts",
  "src/components/preview-host-bridge.tsx",
  "src/lib/runtime/execute-turn.ts",
  "src/lib/runtime/hosted-turn.ts",
  "migrations",
  "server",
  "public/__grok",
  "public/og.jpg",
  ".grok",
  "startup.sh",
  "scripts/grok-pwa-plugin.mjs",
  "scripts/grok-pwa-shared.mjs",
  "scripts/grok-pwa-shared.d.mts",
  "scripts/app-env-plugin.mjs",
  "scripts/with-app-env.mjs",
  "scripts/migration-plan.mjs",
  "scripts/migrate.mjs",
  "scripts/check-auth-invariant.mjs",
  "scripts/sign-out-plan.mjs",
  "scripts/brand-check.mjs",
  "scripts/browser-smoke.mjs",
  "scripts/browser-smoke-verdict.mjs",
  "scripts/browser-guard.mjs",
  "scripts/preview.mjs",
  "scripts/preview-thumbnail.mjs",
  "scripts/write-atomic.mjs",
  "scripts/install-page.html",
];

/** LocalBot source roots that must not import a template module. */
export const IMPORT_ROOTS = ["src/components", "src/routes", "src/lib/fs", "src/lib/runtime", "src/lib/harness"];
/** Module specifiers (as written in an import / dynamic import) that would pull a template module back in. */
export const TEMPLATE_SPECIFIER = [
  /(?:^|\/)lib\/auth(?:\/|$)/,
  /(?:^|\/)auth\/(?:client|server|provider|gates|middleware|isolation\.server|popup\.server|verify\.server|preview|providers|email-password|use-current-user|pglite-dialect|gate-identity\.server|gate-session\.server)(?:\.tsx?)?$/,
  /(?:^|\/)db(?:\.ts)?$/,
  /(?:^|\/)app-data(?:\/|$)/,
  /(?:^|\/)(?:preview-host-bridge|preview-embedder-origin|execute-turn|hosted-turn|grok-pwa-plugin|grok-pwa-shared|app-env-plugin|with-app-env|migration-plan|sign-out-plan)(?:\.m?[jt]sx?)?$/,
];
/** @param {string} spec */
export function isTemplateSpecifier(spec) {
  return TEMPLATE_SPECIFIER.some((re) => re.test(spec));
}
const SPECIFIER_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'`]([^"'`\n]+)["'`]/g;
/** @param {string} source */
export function templateImportsIn(source) {
  /** @type {string[]} */
  const hits = [];
  for (const m of source.matchAll(SPECIFIER_RE)) if (isTemplateSpecifier(m[1])) hits.push(m[1]);
  return hits;
}

/** Package names and hosts that must not appear in shipped code. */
export const FORBIDDEN_DEPS = ["better-auth", "kysely", "pg", "@types/pg", "@electric-sql/pglite", "jose"];
/**
 * `pg` alone would match every "pg" substring, so the source scan matches the
 * package as an import specifier / require target; the names are matched whole.
 */
export const FORBIDDEN_SOURCE = [
  /["'`]better-auth(?:\/[^"'`]*)?["'`]/,
  /["'`]kysely(?:\/[^"'`]*)?["'`]/,
  /from\s+["'`]pg["'`]|import\(\s*["'`]pg["'`]\s*\)|require\(\s*["'`]pg["'`]\s*\)/,
  /["'`]@electric-sql\/pglite(?:\/[^"'`]*)?["'`]/,
  /from\s+["'`]jose["'`]|import\(\s*["'`]jose["'`]\s*\)/,
  /api\.x\.ai/,
  /XAI_API_KEY/,
];
/** Scanned for FORBIDDEN_SOURCE (repo-relative). */
export const SOURCE_ROOTS = ["src", "scripts", "desktop"];
export const SOURCE_FILES = ["vite.config.ts"];

/**
 * `src/lib/harness/process.ts` scrubs the environment of every AI API key
 * before spawning dsh — the string appears there as a name to delete, not a
 * secret to read. That single line is allowed; nothing else is.
 */
const XAI_SCRUB_ALLOW = { file: "src/lib/harness/process.ts", re: /for \(const k of \[[^\]]*"XAI_API_KEY"[^\]]*\]\) \{\s*delete env\[k\];/ };

/** Tests that must not be in `npm test` any more. */
export const GONE_SUITES = [
  "src/lib/app-data/app-data.test.ts",
  "src/lib/auth/gate-identity.test.ts",
  "scripts/**/*.test.mjs",
  "brand-check.test",
  "browser-smoke-verdict.test",
  "check-auth-invariant.test",
  "grok-pwa-plugin.test",
  "migration-plan.test",
  "preview.test",
  "sign-out-plan.test",
  "with-app-env.test",
  "write-atomic.test",
];
/** LocalBot suites that must stay in `npm test`. */
export const KEPT_SUITES = [
  "scripts/desktop-stage.test.mjs",
  "src/lib/localbot.test.ts",
  "src/lib/fs/scopes.test.ts",
  "src/lib/harness/harness.test.ts",
  "src/lib/desktop-chrome.test.ts",
  "src/lib/agent-identity.test.ts",
  "src/lib/audio/voice-toggle.test.ts",
  "src/lib/harness/plugins.test.ts",
  "src/lib/routines.test.ts",
  "src/lib/channels.test.ts",
  "src/lib/sidecar-token.test.ts",
  "src/lib/quit-flush.test.ts",
  "src/lib/excision.test.ts",
];

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
    } else if (/\.(ts|tsx|mjs|cjs|js|json|html|css)$/.test(e.name)) out.push(rel);
  }
  return out;
}

/**
 * Run every gate. Never throws for a failing gate — a missing file is a
 * failing gate, not a crash.
 * @param {string} root repo root
 * @returns {{ ok: boolean, label: string }[]}
 */
export function excisionGates(root) {
  /** @type {{ ok: boolean, label: string }[]} */
  const results = [];
  /** @param {unknown} ok @param {string} label */
  const gate = (ok, label) => results.push({ ok: Boolean(ok), label });
  /** @param {string} p */
  const exists = (p) => fs.existsSync(path.join(root, p));
  /** @param {string} p */
  const read = (p) => (exists(p) ? fs.readFileSync(path.join(root, p), "utf8") : "");

  // 1. the leftovers are gone
  for (const p of GONE) gate(!exists(p), `gone: ${p}`);

  // 2. no LocalBot root imports a template module
  for (const dir of IMPORT_ROOTS) {
    const offenders = walk(root, dir).filter((f) => templateImportsIn(read(f)).length > 0);
    gate(offenders.length === 0, `${dir}: no import of lib/auth, lib/db, app-data or the hosted chain${offenders.length ? ` — ${offenders.join(", ")}` : ""}`);
  }

  // 3. the packages and the hosted host are out of the shipped source
  {
    const files = [...SOURCE_ROOTS.flatMap((d) => walk(root, d)), ...SOURCE_FILES.filter(exists)].filter((f) => !/\.test\.(ts|mjs)$/.test(f) && f !== "scripts/excise-gates.mjs" && f !== "scripts/prove-excise.mjs");
    const offenders = [];
    for (const f of files) {
      const src = read(f);
      for (const re of FORBIDDEN_SOURCE) {
        if (!re.test(src)) continue;
        if (re.source === /XAI_API_KEY/.source && f === XAI_SCRUB_ALLOW.file && XAI_SCRUB_ALLOW.re.test(src) && src.split("XAI_API_KEY").length === 2) continue;
        offenders.push(`${f} (${re.source.slice(0, 30)})`);
      }
    }
    gate(offenders.length === 0, `src/ scripts/ desktop/ vite.config.ts: no better-auth / kysely / pg / pglite / jose / api.x.ai / XAI_API_KEY${offenders.length ? ` — ${offenders.join(", ")}` : ""}`);
  }

  // 4. package.json: deps, scripts, test list
  let pkg = null;
  try {
    pkg = JSON.parse(read("package.json"));
  } catch {
    pkg = null;
  }
  gate(pkg !== null, "package.json parses");
  if (pkg) {
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}), ...(pkg.optionalDependencies ?? {}), ...(pkg.peerDependencies ?? {}) };
    const present = FORBIDDEN_DEPS.filter((d) => d in deps);
    gate(present.length === 0, `package.json deps: no better-auth / kysely / pg / @types/pg / pglite / jose${present.length ? ` — ${present.join(", ")}` : ""}`);
    const scripts = pkg.scripts ?? {};
    gate(scripts.build === "vite build", `build is "vite build" (got ${JSON.stringify(scripts.build)})`);
    gate(!/db:migrate|migrate\.mjs/.test(JSON.stringify(scripts)), "no script runs db:migrate / migrate.mjs");
    for (const k of ["db:migrate", "check:auth", "preview:restart", "preview:stop"]) gate(!(k in scripts), `script "${k}" removed`);
    gate(!/with-app-env/.test(JSON.stringify(scripts)), "no script routes through with-app-env.mjs");
    const test = String(scripts.test ?? "");
    for (const s of GONE_SUITES) gate(!test.includes(s), `npm test no longer runs ${s}`);
    for (const s of KEPT_SUITES) gate(test.includes(s), `npm test still runs ${s}`);
    gate(deps["@deepseek-ai/dsh"] === DSH_PIN, `dsh pin is exact ${DSH_PIN} (got ${deps["@deepseek-ai/dsh"]})`);
    gate(deps["@agentclientprotocol/sdk"] === ACP_SDK_PIN, `ACP SDK pin is exact ${ACP_SDK_PIN} (got ${deps["@agentclientprotocol/sdk"]})`);
    gate(typeof scripts["prove:excise"] === "string" && /prove-excise\.mjs/.test(scripts["prove:excise"]), "npm run prove:excise exists");
  }

  // 5. __root.tsx is LocalBot-only
  {
    const rootTsx = read("src/routes/__root.tsx");
    gate(rootTsx.length > 0, "src/routes/__root.tsx exists");
    gate(!/AuthProvider|lib\/auth/.test(rootTsx), "__root.tsx: no AuthProvider");
    gate(!/PreviewHostBridge|preview-host-bridge/.test(rootTsx), "__root.tsx: no PreviewHostBridge");
    gate(!/__grok|manifest\.webmanifest|apple-touch-icon/.test(rootTsx), "__root.tsx: no /__grok/* manifest or icon tags");
    gate(/<Outlet \/>\s*<Scripts \/>/.test(rootTsx), "__root.tsx: plain <Outlet /> then <Scripts />");
  }

  // 6. vite.config.ts is LocalBot-only, token plugin still wraps the response
  {
    const vite = read("vite.config.ts");
    gate(vite.length > 0, "vite.config.ts exists");
    gate(!/grokPwaPlugin|grok-pwa|appEnvPlugin|app-env-plugin|pgliteBootstrapPlugin|authPopupPlugin|migration-plan|ssrLoadModule/.test(vite), "vite.config.ts: no grok-pwa / app-env / pglite / authPopup plugins");
    gate(!/serverDir/.test(vite), 'vite.config.ts: no serverDir: "./server"');
    gate(/import \{ sidecarTokenPlugin \} from "\.\/scripts\/sidecar-token-plugin\.mjs"/.test(vite), "vite.config.ts: imports sidecarTokenPlugin");
    const a = vite.indexOf("sidecarTokenPlugin()");
    const b = vite.indexOf("tanstackStart()");
    gate(a >= 0 && b >= 0 && a < b, "vite.config.ts: sidecarTokenPlugin() before tanstackStart()");
  }

  // 7. turn.ts: Safety switch reported, no hosted path
  {
    const turn = read("src/lib/runtime/turn.ts");
    gate(/export const getAiStatus = createServerFn/.test(turn), "turn.ts: getAiStatus stays");
    gate(!/runSingleCompletion/.test(turn), "turn.ts: runSingleCompletion removed");
    gate(!/execute-turn|hosted-turn|api\.x\.ai|XAI_API_KEY/.test(turn), "turn.ts: no hosted chain, no API key");
    gate(/allowHostedDemo/.test(turn), "turn.ts: still reports the Safety switch");
    gate(/if \(cfg\.allowHostedDemo\) throw new Error\(HOSTED_DEMO_REFUSAL\);/.test(read("src/lib/runtime/harness-launch.ts")), "harness-launch.ts: hosted-on still refuses");
  }

  // 8. the LocalBot invariants earlier stages gate
  {
    const chat = read("src/components/localbot/chat.tsx");
    gate(/import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/.test(chat) && /await runAgentTurn\(\{/.test(chat), "chat.tsx keeps runAgentTurn");
    const start = read("src/start.ts");
    gate(/functionMiddleware: \[sidecarTokenMiddleware\]/.test(start) && /requestMiddleware: \[csrfMiddleware\]/.test(start), "src/start.ts keeps the Stage 17 token gate (and CSRF)");
    gate(exists("src/lib/runtime/sidecar-token-middleware.ts") && exists("desktop/sidecar-token.mjs"), "token middleware modules present");
    const main = read("desktop/main.mjs");
    gate(exists("desktop/quit-flush.mjs") && /createQuitCoordinator\(/.test(main) && /quitCoordinator\.requestQuit\(/.test(main), "desktop/main.mjs keeps the Stage 18 quit coordinator");
    gate(exists("src/lib/quit-flush.ts") && exists("src/lib/quit-flush-core.ts") && exists("src/lib/pending-writes.ts"), "renderer quit-flush modules present");
    gate(exists("dsh/localbot-fs.mjs") && createHash("sha256").update(read("dsh/localbot-fs.mjs")).digest("hex") === LOCALBOT_FS_SHA256, "dsh/localbot-fs.mjs unchanged (sha256 pin)");
    gate(exists("scripts/desktop-stage.mjs"), "scripts/desktop-stage.mjs kept");
    for (const f of ["src/lib/fs/server.ts", "src/lib/fs/disk.ts", "src/lib/fs/scopes.ts", "src/lib/harness/index.ts", "src/lib/runtime/harness.ts", "src/runtime/harnessAdapter.ts"]) gate(exists(f), `kept: ${f}`);
  }

  return results;
}
