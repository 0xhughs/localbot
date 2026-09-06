#!/usr/bin/env node
/**
 * Stage 19 prove-it: template excision (run: `npm run prove:excise`).
 *
 * Static gates (always; the list lives in scripts/excise-gates.mjs, the same
 * one src/lib/excision.test.ts runs):
 *   - the template leftovers are gone from the tree
 *   - src/components, src/routes, src/lib/fs, src/lib/runtime, src/lib/harness
 *     import nothing from lib/auth, lib/db, app-data or the hosted chain
 *   - better-auth / kysely / pg / pglite / jose / api.x.ai / XAI_API_KEY are out
 *     of src/, scripts/, desktop/, vite.config.ts and package.json deps
 *   - __root.tsx is a plain <Outlet />; vite.config.ts has no template plugin
 *     and sidecarTokenPlugin() still precedes tanstackStart()
 *   - build is "vite build" (no db:migrate); npm test runs LocalBot suites only
 *   - chat.tsx keeps runAgentTurn; start.ts keeps the token middleware;
 *     main.mjs keeps the quit coordinator; dsh / ACP pins exact;
 *     dsh/localbot-fs.mjs sha256
 *
 * Live gate (skip with --static): `vite build` (LOCALBOT_DESKTOP_BUILD=1, the
 * node-server bundle the packaged app ships), then the real sidecar
 * (desktop/sidecar.mjs) boots on :18790 with a fresh token and:
 *   - GET / serves the LocalBot document with no /__grok manifest tag
 *   - /?install=1 is the app, not the template's install tutorial
 *   - a real server function called without the token → 401 NO_TOKEN
 *     (the server-fn table loaded and the Stage 17 gate is still on)
 *   - the same call with the launch token → 200
 *   - the built server bundle contains no better-auth / pglite / api.x.ai /
 *     grok-pwa strings
 *
 * Usage:
 *   npm run prove:excise
 *   npm run prove:excise -- --static     # source gates only
 *   npm run prove:excise -- --build      # rebuild .output first
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { excisionGates } from "./excise-gates.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const log = (...a) => console.log("[prove-excise]", ...a);
const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error("[prove-excise] FAIL:", msg);
};
const gate = (ok, msg) => (ok ? log("ok:", msg) : fail(msg));
const finish = (tag) => {
  if (failures.length) {
    console.error(`[prove-excise] ${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log(`STAGE19_EXCISE_PASS ${tag}`);
  process.exit(0);
};

/* ---------------- static gates ---------------- */

const results = excisionGates(root);
for (const r of results) gate(r.ok, r.label);
log(`${results.length} static gates, ${results.filter((r) => !r.ok).length} failing`);

if (flag("--static")) finish("static");
if (failures.length) {
  console.error("[prove-excise] static gates failed; skipping the live gate");
  finish("static");
}

/* ---------------- live: build + sidecar boot ---------------- */

const T = await import(pathToFileURL(path.join(root, "desktop/sidecar-token.mjs")).href);
const { SIDECAR_URL, SIDECAR_PORT } = await import(
  pathToFileURL(path.join(root, "desktop/packaged.mjs")).href
);

const serverDir = path.join(root, ".output");
const serverEntry = path.join(serverDir, "server/index.mjs");
const ssrDir = path.join(serverDir, "server/_ssr");
if (flag("--build") || !fs.existsSync(serverEntry)) {
  log(
    fs.existsSync(serverEntry)
      ? "rebuilding .output"
      : "no .output — running vite build (LOCALBOT_DESKTOP_BUILD=1)",
  );
  const r = spawnSync(
    process.execPath,
    [path.join(root, "node_modules/vite/bin/vite.js"), "build"],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, LOCALBOT_DESKTOP_BUILD: "1" },
    },
  );
  if (r.status !== 0) {
    fail(`vite build exited ${r.status}`);
    finish("static");
  }
}
gate(
  fs.existsSync(serverEntry),
  "vite build produced .output/server/index.mjs (no db:migrate step ran)",
);

{
  const bundle = walkFiles(path.join(serverDir, "server"))
    .filter((f) => /\.m?js$/.test(f))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
  const bad = [
    "better-auth",
    "@electric-sql/pglite",
    "api.x.ai",
    "virtual:grok-og-identity",
    "/__grok/manifest.webmanifest",
    "renderInstallPageHtml",
  ].filter((s) => bundle.includes(s));
  gate(
    bad.length === 0,
    `the built server bundle carries no template strings${bad.length ? ` — found ${bad.join(", ")}` : ""}`,
  );
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-prove-excise-"));
const children = [];
process.on("exit", () => {
  for (const c of children) {
    try {
      c.kill("SIGKILL");
    } catch {
      /* gone */
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function up(url, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await sleep(300);
  }
  return false;
}
async function portClosed(port, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const open = await new Promise((resolve) => {
      const s = net.connect({ host: "127.0.0.1", port }, () => {
        s.destroy();
        resolve(true);
      });
      s.on("error", () => resolve(false));
    });
    if (!open) return true;
    await sleep(200);
  }
  return false;
}
function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}
const seroval = await import("seroval");
const payload = async (data) => JSON.stringify(await seroval.toJSONAsync({ data }));
const codeOf = (text) => /"(NO_TOKEN|BAD_TOKEN|SERVER_NO_TOKEN)"/.exec(text)?.[1] ?? null;
async function callFn(base, id, data, token) {
  const headers = {
    Origin: base.replace(/\/$/, ""),
    "x-tsr-serverFn": "true",
    accept: "application/json",
    "content-type": "application/json",
  };
  if (token !== undefined) headers[T.SIDECAR_TOKEN_HEADER] = token;
  const res = await fetch(`${base}_serverFn/${id}?createServerFn`, {
    method: "POST",
    headers,
    body: await payload(data),
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  return { status: res.status, text, code: codeOf(text) };
}

if (await up(SIDECAR_URL, 500)) {
  fail(`${SIDECAR_URL} already answering — quit the other LocalBot first`);
  finish("static");
}

const token = T.mintSidecarToken();
const dataDir = path.join(tmp, "data");
fs.mkdirSync(dataDir, { recursive: true });
let sidecarOut = "";
const sidecar = spawn(process.execPath, [path.join(root, "desktop/sidecar.mjs")], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    LOCALBOT_DATA_DIR: dataDir,
    LOCALBOT_SERVER_DIR: serverDir,
    [T.SIDECAR_TOKEN_ENV]: token,
  },
});
children.push(sidecar);
sidecar.stderr.on("data", (d) => (sidecarOut += String(d)));
sidecar.stdout.on("data", (d) => (sidecarOut += String(d)));
if (!(await up(SIDECAR_URL, 60000))) {
  fail(`sidecar never answered on ${SIDECAR_URL}\n${sidecarOut.slice(-2000)}`);
  finish("static");
}
log("sidecar up on", SIDECAR_URL, "(pid", sidecar.pid + ")");

{
  const html = await (await fetch(SIDECAR_URL, { headers: { accept: "text/html" } })).text();
  gate(html.includes("<title>LocalBot</title>"), "GET / serves the LocalBot document");
  gate(
    !/__grok\/manifest\.webmanifest|apple-touch-icon|__grok\/icon-180/.test(html),
    "the document links no /__grok manifest or icon",
  );
  const install = await fetch(`${SIDECAR_URL}?install=1&platform=ios`, {
    headers: { accept: "text/html" },
  });
  const installHtml = await install.text();
  gate(
    install.status === 200 &&
      installHtml.includes("<title>LocalBot</title>") &&
      !/Add to Home Screen|homescreen|install\/styles\.css/i.test(installHtml),
    "/?install=1 is the app, not the template's install tutorial",
  );
  const manifest = await fetch(`${SIDECAR_URL}__grok/manifest.webmanifest`);
  const manifestType = manifest.headers.get("content-type") ?? "";
  gate(
    !/manifest\+json/.test(manifestType),
    `/__grok/manifest.webmanifest is not served as a web manifest (got ${manifest.status} ${manifestType || "no content-type"})`,
  );
}

{
  const manifest = fs
    .readdirSync(ssrDir)
    .map((n) => fs.readFileSync(path.join(ssrDir, n), "utf8"))
    .join("\n");
  const fnId = (name) =>
    new RegExp(
      `"([0-9a-f]{64})":\\s*\\{\\s*functionName:\\s*"${name}_createServerFn_handler"`,
    ).exec(manifest)?.[1] ?? null;
  const foldersGetId = fnId("foldersGet");
  const getAiStatusId = fnId("getAiStatus");
  gate(Boolean(foldersGetId), "server-fn table loaded: foldersGet is in the build manifest");
  gate(Boolean(getAiStatusId), "server-fn table loaded: getAiStatus is in the build manifest");
  gate(fnId("runSingleCompletion") === null, "runSingleCompletion is not in the build manifest");
  if (foldersGetId) {
    const none = await callFn(SIDECAR_URL, foldersGetId, {}, undefined);
    gate(
      none.status === 401 && none.code === "NO_TOKEN",
      `foldersGet without the token → 401 NO_TOKEN (got ${none.status} ${none.code})`,
    );
    const good = await callFn(SIDECAR_URL, foldersGetId, {}, token);
    gate(
      good.status === 200 && /"folders"/.test(good.text) && !good.code,
      `foldersGet with the launch token → 200 with folders (got ${good.status})`,
    );
  }
  if (getAiStatusId) {
    const none = await callFn(SIDECAR_URL, getAiStatusId, {}, undefined);
    gate(
      none.status === 401 && none.code === "NO_TOKEN",
      `getAiStatus without the token → 401 NO_TOKEN (got ${none.status} ${none.code})`,
    );
    const good = await callFn(SIDECAR_URL, getAiStatusId, {}, token);
    gate(
      good.status === 200 &&
        /"allowHostedDemo"/.test(good.text) &&
        !/grok-4\.5|Hosted grok/.test(good.text),
      `getAiStatus with the token → 200, reports the Safety switch, names no hosted engine (got ${good.status})`,
    );
  }
}

sidecar.kill("SIGTERM");
gate(await portClosed(SIDECAR_PORT, 5000), "sidecar stopped; :18790 closed");

finish("static+live build=vite-build sidecar=401-NO_TOKEN");
