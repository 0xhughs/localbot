#!/usr/bin/env node
/**
 * Stage 17 prove-it: the per-launch sidecar token (run: `npm run prove:token`).
 *
 * Static gates (source):
 *   - src/start.ts registers sidecarTokenMiddleware as global functionMiddleware
 *     (every createServerFn, no opt-out) and keeps the CSRF request middleware
 *   - the middleware / server module have no dev, packaged or env branch
 *   - no bypass knob and no hardcoded token anywhere in src/, desktop/, scripts/,
 *     server/, dsh/, vite.config.ts, package.json; no prove-*.mjs sends an empty
 *     token on purpose or empties the middleware
 *   - desktop/main.mjs mints 32 bytes per launch, passes them to the child env and
 *     to the window through preload argv only; a sidecar it did not start is refused
 *   - desktop/sidecar.mjs exits 1 without a token; preload.cjs exposes it
 *   - chat.tsx keeps runAgentTurn; dsh / ACP pins exact; dsh/localbot-fs.mjs sha256
 *
 * Live gates (the real Nitro build on 127.0.0.1:18790, temp LOCALBOT_DATA_DIR):
 *   1. NO-TOKEN BOOT: `node desktop/sidecar.mjs` without LOCALBOT_SIDECAR_TOKEN exits 1,
 *      nothing listens on :18790
 *   2. BOOT: a fresh mintSidecarToken() in the env → the sidecar answers GET /
 *      and the HTML carries neither the token nor the dev meta tag
 *   3. GATE: POST foldersGet with a spoofed Origin + x-tsr-serverFn (the only thing
 *      that used to stand in the way) and
 *        no header      → 401, body code NO_TOKEN
 *        empty header   → 401, NO_TOKEN
 *        wrong 64 hex   → 401, BAD_TOKEN
 *        previous launch's token → 401, BAD_TOKEN (per launch, not per install)
 *        right header   → 200, body has `folders`
 *      POST foldersSet (a write) without the header → 401 and localbot-config.json
 *      did not gain folders
 *   4. DEV (skip with --no-dev): `vite dev` on a free loopback port mints its own token;
 *      GET / with Host 127.0.0.1 carries <meta name="localbot-sidecar-token">, GET /
 *      with a LAN Host does not; POST without the header → 401, with the document's
 *      token → 200
 *
 * The Nitro build is made with `LOCALBOT_DESKTOP_BUILD=1 vite build` when
 * .output/ is missing or predates the token (`--build` forces it).
 *
 * Usage:
 *   npm run prove:token
 *   npm run prove:token -- --static     # source gates only
 *   npm run prove:token -- --no-dev     # skip the vite dev server gate
 *   npm run prove:token -- --build      # rebuild .output first
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const log = (...a) => console.log("[prove-token]", ...a);
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error("[prove-token] FAIL:", msg);
};
const gate = (ok, msg) => (ok ? log("ok:", msg) : fail(msg));
const finish = (tag) => {
  if (failures.length) {
    console.error(`[prove-token] ${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log(`STAGE17_TOKEN_PASS ${tag}`);
  process.exit(0);
};

const LOCALBOT_FS_SHA256 = "0bb5593abecbc116a7b3c614882cfc109831e88c45b735962ce14ef904c2b0a6";
const T = await import(pathToFileURL(path.join(root, "desktop/sidecar-token.mjs")).href);
const { SIDECAR_URL, SIDECAR_PORT } = await import(pathToFileURL(path.join(root, "desktop/packaged.mjs")).href);
const { hygieneProblems, shippedFiles } = await import(pathToFileURL(path.join(root, "scripts/sidecar-token-hygiene.mjs")).href);

/* ---------------- static gates ---------------- */

{
  const start = read("src/start.ts");
  gate(/export const startInstance = createStart\(/.test(start) && /functionMiddleware: \[sidecarTokenMiddleware\]/.test(start), "src/start.ts: sidecarTokenMiddleware is global functionMiddleware (every createServerFn)");
  gate(/requestMiddleware: \[csrfMiddleware\]/.test(start) && /createCsrfMiddleware\(/.test(start), "src/start.ts: CSRF request middleware kept alongside the token");
  gate(/key: "SidecarAuthError"/.test(start), "src/start.ts: SidecarAuthError adapter → 401 body carries code");

  const mw = read("src/lib/runtime/sidecar-token-middleware.ts");
  gate(/createMiddleware\(\{ type: "function" \}\)/.test(mw) && /\[SIDECAR_TOKEN_HEADER\]: readBrowserSidecarToken\(\)/.test(mw), "middleware .client sends x-localbot-token");
  gate(/const \{ assertSidecarRequest \} = await import\("\.\/sidecar-token\.server\.ts"\);\s*assertSidecarRequest\(\);\s*return next\(\);/.test(mw), "middleware .server asserts before next()");
  const server = read("src/lib/runtime/sidecar-token.server.ts");
  gate(/const expected = takeSidecarToken\(\);/.test(server) && /verifySidecarToken\(expected, presented\)/.test(server) && /fail\(new SidecarAuthError\("SERVER_NO_TOKEN"\)\)/.test(server), "server module: token from memory, constant-time verify, refuses when the server has none");
  const core = read("desktop/sidecar-token.mjs");
  gate(/timingSafeEqual\(a, probe\)/.test(core) && /randomBytes\(SIDECAR_TOKEN_BYTES\)/.test(core) && T.SIDECAR_TOKEN_BYTES === 32, "32 random bytes, timingSafeEqual compare");
  gate(/delete env\[SIDECAR_TOKEN_ENV\];/.test(core), "the serving process removes the token from its env after taking it (children never inherit it)");
  const exceptionRe = /NODE_ENV|import\.meta\.env\.(DEV|MODE|PROD)|LOCALBOT_PACKAGED|isPackagedMode/;
  gate(![mw, server, start, core].some((s) => exceptionRe.test(s)), "no dev / packaged branch around the gate");

  const problems = hygieneProblems(root);
  const proves = fs.readdirSync(path.join(root, "scripts")).filter((n) => /^prove-.*\.mjs$/.test(n)).length;
  gate(
    problems.length === 0,
    `no bypass knob / hardcoded token / pinned env in ${shippedFiles(root).length} shipped files, no gate-skip in ${proves} prove scripts${problems.length ? ` — ${problems.join("; ")}` : ""}`,
  );

  const main = read("desktop/main.mjs");
  gate(/^const sidecarToken = mintSidecarToken\(\);/m.test(main), "main.mjs mints one token per launch");
  gate((main.match(/\[SIDECAR_TOKEN_ENV\]: sidecarToken,/g) ?? []).length === 2, "main.mjs hands the token to the sidecar env and to npm run dev's env");
  gate(/additionalArguments: tokenForWindow \? \[`\$\{SIDECAR_TOKEN_ARG\}\$\{tokenForWindow\}`\] : \[\]/.test(main), "main.mjs passes it to the window through preload argv only");
  gate(/LocalBot is already running \(\$\{SIDECAR_URL\} is taken\)/.test(main), "main.mjs refuses a sidecar it did not start (unknown token)");
  gate(!/ipcMain\.handle\("localbot:(token|sidecarToken)/.test(main), "no IPC hands the token out");
  const sidecar = read("desktop/sidecar.mjs");
  gate(/if \(!isSidecarToken\(process\.env\[SIDECAR_TOKEN_ENV\]\)\) \{[\s\S]*?process\.exit\(1\);/.test(sidecar), "sidecar.mjs exits 1 without a token");
  const preload = read("desktop/preload.cjs");
  gate(/const SIDECAR_TOKEN_ARG = "--localbot-sidecar-token=";/.test(preload) && T.SIDECAR_TOKEN_ARG === "--localbot-sidecar-token=" && /^\s*sidecarToken,$/m.test(preload), "preload.cjs exposes localbotDesktop.sidecarToken from argv");
  gate(!/injectSidecarTokenMeta|SIDECAR_TOKEN_META/.test(sidecar) && /apply: "serve"/.test(read("scripts/sidecar-token-plugin.mjs")), "only the vite dev server can put the token in a document");
  const build = read("scripts/build-desktop.mjs");
  gate(/"resources\/localbot-sidecar\/sidecar-token\.mjs"/.test(build), "build-desktop.mjs ships sidecar-token.mjs beside sidecar.mjs");

  const chat = read("src/components/localbot/chat.tsx");
  gate(/import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/.test(chat) && /await runAgentTurn\(\{/.test(chat), "chat.tsx keeps runAgentTurn");
  const pkg = JSON.parse(read("package.json"));
  gate(pkg.dependencies["@deepseek-ai/dsh"] === "0.1.2-alpha.5", "dsh pin is exact 0.1.2-alpha.5");
  gate(pkg.dependencies["@agentclientprotocol/sdk"] === "1.4.0", "ACP SDK pin is exact 1.4.0");
  gate(createHash("sha256").update(read("dsh/localbot-fs.mjs")).digest("hex") === LOCALBOT_FS_SHA256, "dsh/localbot-fs.mjs unchanged (sha256 pin)");
  gate(/src\/lib\/sidecar-token\.test\.ts/.test(pkg.scripts.test), "npm test runs sidecar-token.test.ts");
}

if (flag("--static")) finish("static");

/* ---------------- live: the real Nitro build on :18790 ---------------- */

const serverDir = path.join(root, ".output");
const serverEntry = path.join(serverDir, "server/index.mjs");
const ssrDir = path.join(serverDir, "server/_ssr");
const buildHasToken = () => fs.existsSync(ssrDir) && fs.readdirSync(ssrDir).some((n) => n.endsWith(".mjs") && fs.readFileSync(path.join(ssrDir, n), "utf8").includes("SidecarAuthError"));
if (flag("--build") || !fs.existsSync(serverEntry) || !buildHasToken()) {
  log(fs.existsSync(serverEntry) ? ".output predates the token gate — rebuilding" : "no .output — building the Nitro node-server bundle");
  const r = spawnSync(process.execPath, [path.join(root, "scripts/with-app-env.mjs"), "vite", "build"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, LOCALBOT_DESKTOP_BUILD: "1", PATH: `${path.join(root, "node_modules/.bin")}${path.delimiter}${process.env.PATH ?? ""}` },
  });
  if (r.status !== 0) fail(`vite build exited ${r.status}`);
}
if (!fs.existsSync(serverEntry) || !buildHasToken()) {
  fail(".output/server has no token gate; cannot run the live gates");
  finish("static");
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-prove-token-"));
const children = [];
process.on("exit", () => {
  for (const c of children) {
    try {
      c.kill("SIGKILL");
    } catch {
      /* gone */
    }
  }
  if (!flag("--keep")) fs.rmSync(tmp, { recursive: true, force: true });
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
function rawGet(port, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/", method: "GET", headers, setHost: false }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.end();
  });
}
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
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
  const res = await fetch(`${base}_serverFn/${id}?createServerFn`, { method: "POST", headers, body: await payload(data), signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  return { status: res.status, text, code: codeOf(text) };
}

if (await up(SIDECAR_URL, 500)) fail(`${SIDECAR_URL} already answering — quit the other LocalBot first`);

// ---- 1. no token → no server -------------------------------------------------
{
  const dataDir = path.join(tmp, "data-no-token");
  fs.mkdirSync(dataDir, { recursive: true });
  const env = { ...process.env, LOCALBOT_DATA_DIR: dataDir, LOCALBOT_SERVER_DIR: serverDir };
  delete env[T.SIDECAR_TOKEN_ENV];
  const r = spawnSync(process.execPath, [path.join(root, "desktop/sidecar.mjs")], { cwd: root, env, encoding: "utf8", timeout: 15000 });
  gate(r.status === 1 && /LOCALBOT_SIDECAR_TOKEN/.test(r.stderr), `sidecar.mjs without ${T.SIDECAR_TOKEN_ENV} exits 1 and says why (exit ${r.status})`);
  gate(await portClosed(SIDECAR_PORT, 1000), "nothing listens on :18790 after the refused boot");
}

// ---- 2. boot with a fresh token ----------------------------------------------
const previousLaunch = T.mintSidecarToken();
const token = T.mintSidecarToken();
const dataDir = path.join(tmp, "data");
fs.mkdirSync(dataDir, { recursive: true });
let sidecarErr = "";
const sidecar = spawn(process.execPath, [path.join(root, "desktop/sidecar.mjs")], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, LOCALBOT_DATA_DIR: dataDir, LOCALBOT_SERVER_DIR: serverDir, [T.SIDECAR_TOKEN_ENV]: token },
});
children.push(sidecar);
sidecar.stderr.on("data", (d) => (sidecarErr += String(d)));
sidecar.stdout.on("data", (d) => (sidecarErr += String(d)));
if (!(await up(SIDECAR_URL, 60000))) {
  fail(`sidecar never answered on ${SIDECAR_URL}\n${sidecarErr.slice(-2000)}`);
  finish("static");
}
log("sidecar up on", SIDECAR_URL, "with a fresh token (pid", sidecar.pid + ")");
{
  const html = await (await fetch(SIDECAR_URL, { headers: { accept: "text/html" } })).text();
  gate(html.includes("<title>LocalBot</title>"), "GET / serves the UI document");
  gate(!html.includes(token) && !html.includes(T.SIDECAR_TOKEN_META), "the packaged sidecar's HTML carries neither the token nor the dev meta tag");
}

// ---- 3. the gate on real server functions ------------------------------------
const manifest = fs.readdirSync(ssrDir).map((n) => fs.readFileSync(path.join(ssrDir, n), "utf8")).join("\n");
const fnId = (name) => new RegExp(`"([0-9a-f]{64})":\\s*\\{\\s*functionName:\\s*"${name}_createServerFn_handler"`).exec(manifest)?.[1] ?? null;
const foldersGetId = fnId("foldersGet");
const foldersSetId = fnId("foldersSet");
gate(Boolean(foldersGetId && foldersSetId), "found foldersGet / foldersSet ids in the build manifest");
if (foldersGetId && foldersSetId) {
  const none = await callFn(SIDECAR_URL, foldersGetId, {}, undefined);
  gate(none.status === 401 && none.code === "NO_TOKEN", `spoofed Origin + x-tsr-serverFn, no token → 401 NO_TOKEN (got ${none.status} ${none.code})`);
  const empty = await callFn(SIDECAR_URL, foldersGetId, {}, "");
  gate(empty.status === 401 && empty.code === "NO_TOKEN", `empty header → 401 NO_TOKEN (got ${empty.status} ${empty.code})`);
  const wrong = await callFn(SIDECAR_URL, foldersGetId, {}, "a".repeat(64));
  gate(wrong.status === 401 && wrong.code === "BAD_TOKEN", `wrong 64-hex header → 401 BAD_TOKEN (got ${wrong.status} ${wrong.code})`);
  const stale = await callFn(SIDECAR_URL, foldersGetId, {}, previousLaunch);
  gate(stale.status === 401 && stale.code === "BAD_TOKEN", `another launch's token → 401 BAD_TOKEN (got ${stale.status} ${stale.code})`);
  const good = await callFn(SIDECAR_URL, foldersGetId, {}, token);
  gate(good.status === 200 && /"folders"/.test(good.text) && !good.code, `the launch token → 200 with folders (got ${good.status})`);

  const cfgFile = path.join(dataDir, "localbot-config.json");
  const before = fs.existsSync(cfgFile) ? fs.readFileSync(cfgFile, "utf8") : null;
  const write = await callFn(SIDECAR_URL, foldersSetId, { folders: { employeeRoot: path.join(tmp, "intruder") }, create: true }, undefined);
  const after = fs.existsSync(cfgFile) ? fs.readFileSync(cfgFile, "utf8") : null;
  gate(write.status === 401 && write.code === "NO_TOKEN" && after === before && !fs.existsSync(path.join(tmp, "intruder")), `foldersSet (a write) without the header → 401 and nothing on disk changed (got ${write.status})`);

  const noOrigin = await fetch(`${SIDECAR_URL}_serverFn/${foldersGetId}?createServerFn`, {
    method: "POST",
    headers: { "content-type": "application/json", [T.SIDECAR_TOKEN_HEADER]: token },
    body: await payload({}),
  });
  gate(noOrigin.status === 403, `token but no Origin / Sec-Fetch-Site → 403 (CSRF layer still on; got ${noOrigin.status})`);
}
sidecar.kill("SIGTERM");
gate(await portClosed(SIDECAR_PORT, 5000), "sidecar stopped; :18790 closed");

// ---- 4. the vite dev server: its own token, loopback document only -----------
if (!flag("--no-dev")) {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}/`;
  const devData = path.join(tmp, "dev-data");
  fs.mkdirSync(devData, { recursive: true });
  let devOut = "";
  const devEnv = { ...process.env, LOCALBOT_DATA_DIR: devData, BROWSER: "none", PATH: `${path.join(root, "node_modules/.bin")}${path.delimiter}${process.env.PATH ?? ""}` };
  delete devEnv[T.SIDECAR_TOKEN_ENV];
  const dev = spawn(process.execPath, [path.join(root, "scripts/with-app-env.mjs"), "vite", "dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: devEnv,
  });
  children.push(dev);
  dev.stdout.on("data", (d) => (devOut += String(d)));
  dev.stderr.on("data", (d) => (devOut += String(d)));
  if (!(await up(base, 90000))) {
    fail(`vite dev never answered on ${base}\n${devOut.slice(-2000)}`);
  } else {
    const loop = await (await fetch(base, { headers: { accept: "text/html" } })).text();
    const devToken = new RegExp(`<meta name="${T.SIDECAR_TOKEN_META}" content="([0-9a-f]{64})">`).exec(loop)?.[1] ?? null;
    gate(Boolean(devToken) && loop.indexOf(`name="${T.SIDECAR_TOKEN_META}"`) < loop.indexOf("<title>"), "dev: loopback GET / carries the meta tag in <head> (the dev server minted its own token)");
    // fetch() will not override Host; a raw http request can.
    const lan = await rawGet(port, { host: `10.1.2.3:${port}`, accept: "text/html" });
    gate(!lan.includes(T.SIDECAR_TOKEN_META) && lan.includes("<title>LocalBot</title>"), "dev: GET / with a LAN Host serves the document without the meta tag");
    const zero = await rawGet(port, { host: `0.0.0.0:${port}`, accept: "text/html" });
    gate(!zero.includes(T.SIDECAR_TOKEN_META) && zero.includes("<title>LocalBot</title>"), "dev: GET / with Host 0.0.0.0 serves the document without the meta tag");
    const mod = await (await fetch(`${base}src/lib/fs/server.ts`)).text();
    const devId = /const foldersGet = createServerFn\([\s\S]*?createClientRpc\("([^"]+)"\)/.exec(mod)?.[1] ?? null;
    gate(Boolean(devId), "dev: found foldersGet's client rpc id");
    if (devId && devToken) {
      const none = await callFn(base, devId, {}, undefined);
      gate(none.status === 401 && none.code === "NO_TOKEN", `dev: no header → 401 NO_TOKEN (got ${none.status} ${none.code})`);
      const wrong = await callFn(base, devId, {}, token);
      gate(wrong.status === 401 && wrong.code === "BAD_TOKEN", `dev: the packaged launch's token → 401 BAD_TOKEN (got ${wrong.status} ${wrong.code})`);
      const good = await callFn(base, devId, {}, devToken);
      gate(good.status === 200 && /"folders"/.test(good.text), `dev: the document's token → 200 (got ${good.status})`);
    }
  }
  dev.kill("SIGTERM");
  await portClosed(port, 5000);
}

finish(`static+live no-token-boot/html-clean/401-NO_TOKEN/401-BAD_TOKEN/200-with-token/write-refused/csrf-kept${flag("--no-dev") ? "" : "/dev-loopback-meta/dev-401/dev-200"}`);
