#!/usr/bin/env node
/**
 * Stage 21 prove-it: packaged catalog + channel @ (run: `npm run prove:packaged-catalog`).
 *
 * Static gates (scripts/packaged-catalog-gates.mjs): exit 1 if build-desktop.mjs
 * stops staging catalog/ into .output before electron-builder, assertLayout stops
 * requiring resources/localbot-server/catalog/dsh-plugins.json, the resolver stops
 * honouring LOCALBOT_SERVER_DIR (else cwd), channels-model.ts stops resolving @
 * against the Run-all member list by id / name / slug, chat.tsx drops runAgentTurn,
 * the token / quit / pnpm gates go, the dsh / ACP pins float, or mac.identity is not null.
 *
 * Live gates (this box, no dsh, no model, no network):
 *   1. LAYOUT: stageCatalog({ into: <tmp>/.output }) → every catalog/*.json is under
 *      <tmp>/.output/catalog/ byte-for-byte; catalogLayoutChecks names
 *      resources/localbot-server/catalog/dsh-plugins.json; a fake packed tree built
 *      from that .output passes the check and the same tree WITHOUT the folder fails it
 *      (what `npm run build:desktop` would refuse).
 *   2. SIDECAR PATH: a FRESH node process with LOCALBOT_SERVER_DIR=<tmp>/.output and
 *      cwd = an unrelated folder (like the packaged sidecar) reads the catalog through
 *      catalogPath() → 5 entries; the same process pointed at a folder with no
 *      catalog/ throws ENOENT naming <dir>/catalog/dsh-plugins.json — never a
 *      built-in list, never the repo's copy via cwd.
 *   3. DEV PATH: with LOCALBOT_SERVER_DIR unset and cwd = repo root the same call
 *      reads catalog/dsh-plugins.json (one resolver, both modes).
 *   4. MENTIONS: with members [Seven of Nine, Seven, Bob] (ids in memberIds), `@Seven`
 *      → Seven, `@Seven of Nine ` (the picker's form) → Seven of Nine, `@seven-of-nine`,
 *      `@seven_of_nine`, the raw id and any case → that id; `@Zed` → unknown (system
 *      line); no @ → first member; Run all → every id — and every @ hit is one of
 *      Run all's ids.
 *   5. PACKED (only when dist/desktop/<platform>-unpacked exists from `npm run
 *      build:desktop`): the PACKED sidecar.mjs on the PACKED Node, cwd elsewhere,
 *      LOCALBOT_SERVER_DIR = resources/localbot-server (what desktop/main.mjs does),
 *      answers the real `pluginsCatalog` server function over loopback with the launch
 *      token: ok:true, file = resources/localbot-server/catalog/dsh-plugins.json, the
 *      repo's entries. The same tree with catalog/ removed → ok:false naming ENOENT.
 *      Skipped with a line when no packed tree is present.
 *
 * Usage:
 *   npm run prove:packaged-catalog
 *   npm run prove:packaged-catalog -- --static     # source gates only
 *   npm run prove:packaged-catalog -- --no-packed  # skip section 5 even if a packed tree exists
 *   npm run prove:packaged-catalog -- --keep       # leave the temp dirs behind
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CATALOG_RESOURCE_PATH, packagedCatalogGates } from "./packaged-catalog-gates.mjs";
import { catalogLayoutChecks, listCatalogJson, sha256File, stageCatalog } from "./desktop-stage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const log = (...a) => console.log("[prove-packaged-catalog]", ...a);
const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error("[prove-packaged-catalog] FAIL:", msg);
};
const gate = (ok, msg) => (ok ? log("ok:", msg) : fail(msg));
const temps = [];

function finish(extra = "") {
  if (!flag("--keep")) for (const d of temps) fs.rmSync(d, { recursive: true, force: true });
  else if (temps.length) log(`kept ${temps.join(", ")}`);
  if (failures.length) {
    console.error(`[prove-packaged-catalog] ${failures.length} failing gate(s)`);
    process.exit(1);
  }
  console.log(`STAGE21_PACKAGED_CATALOG_PASS ${extra}`.trim());
  process.exit(0);
}

/* ---------------- static gates ---------------- */

const gates = packagedCatalogGates(root);
for (const g of gates) gate(g.ok, g.label);
log(`${gates.length} static gates, ${gates.filter((g) => !g.ok).length} failing`);
if (failures.length) finish();
if (flag("--static")) finish("static");

/* ---------------- live gates ---------------- */

const tmp = (p) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), p));
  temps.push(d);
  return d;
};

/** Run src/lib/harness/plugins.ts's catalogPath()/readPluginCatalog in a FRESH node, like the sidecar. */
function freshCatalogRead({ serverDir, cwd }) {
  const probe = `
    import { catalogPath, catalogRoot, readPluginCatalog } from ${JSON.stringify(pathToFileURL(path.join(root, "src/lib/harness/plugins.ts")).href)};
    try {
      const file = catalogPath();
      const cat = readPluginCatalog(file);
      console.log(JSON.stringify({ ok: true, root: catalogRoot(), file, ids: cat.plugins.map((p) => p.id) }));
    } catch (err) {
      console.log(JSON.stringify({ ok: false, root: catalogRoot(), file: catalogPath(), error: err instanceof Error ? err.message : String(err) }));
    }
  `;
  const env = { ...process.env, LOCALBOT_PACKAGED: serverDir ? "1" : undefined };
  delete env.LOCALBOT_SERVER_DIR;
  if (serverDir) env.LOCALBOT_SERVER_DIR = serverDir;
  else delete env.LOCALBOT_PACKAGED;
  const res = spawnSync(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "--input-type=module", "-e", probe], { cwd, env, encoding: "utf8" });
  try {
    return JSON.parse(res.stdout.trim().split("\n").pop());
  } catch {
    return { ok: false, error: `probe produced no JSON (exit ${res.status}): ${res.stderr.trim()}` };
  }
}

try {
  const names = listCatalogJson(root);
  const expectedIds = JSON.parse(fs.readFileSync(path.join(root, "catalog/dsh-plugins.json"), "utf8")).plugins.map((p) => p.id);

  // 1. LAYOUT
  const build = tmp("lb21-build-");
  const output = path.join(build, ".output");
  fs.mkdirSync(path.join(output, "server"), { recursive: true });
  fs.writeFileSync(path.join(output, "server/index.mjs"), "// stand-in for the Nitro server entry\n");
  const staged = stageCatalog({ root, into: output, log });
  gate(staged.names.length === names.length && staged.names.includes("dsh-plugins.json"), `stageCatalog staged ${staged.names.length} file(s) incl. dsh-plugins.json: ${staged.names.join(", ")}`);
  const mismatched = names.filter((n) => sha256File(path.join(root, "catalog", n)) !== sha256File(path.join(output, "catalog", n)));
  gate(mismatched.length === 0, `every .output/catalog/*.json is byte-identical to the repo copy${mismatched.length ? ` — differs: ${mismatched.join(", ")}` : ""}`);
  const checks = catalogLayoutChecks(staged.names);
  gate(checks[0] === CATALOG_RESOURCE_PATH, `catalogLayoutChecks[0] is ${CATALOG_RESOURCE_PATH} (got ${checks[0]})`);
  // The packed tree electron-builder would produce from this .output: resources/localbot-server = .output.
  const packed = path.join(build, "linux-unpacked");
  fs.cpSync(output, path.join(packed, "resources/localbot-server"), { recursive: true });
  const missing = checks.filter((rel) => !fs.existsSync(path.join(packed, rel)));
  gate(missing.length === 0, `packed tree from this .output has every catalog file where the sidecar reads it${missing.length ? ` — missing: ${missing.join(", ")}` : ""}`);
  const packedNoCatalog = path.join(build, "linux-unpacked-without-catalog");
  fs.cpSync(output, path.join(packedNoCatalog, "resources/localbot-server"), { recursive: true });
  fs.rmSync(path.join(packedNoCatalog, "resources/localbot-server/catalog"), { recursive: true, force: true });
  const missing2 = checks.filter((rel) => !fs.existsSync(path.join(packedNoCatalog, rel)));
  gate(missing2.includes(CATALOG_RESOURCE_PATH), `the same tree WITHOUT localbot-server/catalog/ fails the layout check on ${CATALOG_RESOURCE_PATH} (what build:desktop refuses; the Stage 20 .app had exactly this hole)`);

  // 2. SIDECAR PATH (fresh process, cwd elsewhere, LOCALBOT_SERVER_DIR set)
  const elsewhere = tmp("lb21-cwd-");
  const viaServerDir = freshCatalogRead({ serverDir: path.join(packed, "resources/localbot-server"), cwd: elsewhere });
  gate(viaServerDir.ok === true, `fresh process, cwd=${path.basename(elsewhere)}, LOCALBOT_SERVER_DIR=…/resources/localbot-server → readPluginCatalog(catalogPath()) ok${viaServerDir.ok ? "" : `: ${viaServerDir.error}`}`);
  gate(viaServerDir.file === path.join(packed, "resources/localbot-server/catalog/dsh-plugins.json"), `…and the path it opened is <LOCALBOT_SERVER_DIR>/catalog/dsh-plugins.json (got ${viaServerDir.file})`);
  gate(JSON.stringify(viaServerDir.ids) === JSON.stringify(expectedIds), `…with the repo's ${expectedIds.length} entries: ${(viaServerDir.ids ?? []).join(", ")}`);
  const viaHole = freshCatalogRead({ serverDir: path.join(packedNoCatalog, "resources/localbot-server"), cwd: root });
  gate(viaHole.ok === false && /ENOENT/.test(viaHole.error ?? "") && (viaHole.error ?? "").includes(path.join(packedNoCatalog, "resources/localbot-server/catalog/dsh-plugins.json")), `LOCALBOT_SERVER_DIR without catalog/ → ENOENT naming that path even with cwd = repo root (never falls back to the repo copy): ${viaHole.error}`);
  gate(/rebuild with npm run build:desktop/.test(viaHole.error ?? ""), "…and the packaged-mode message says to rebuild");

  // 3. DEV PATH
  const dev = freshCatalogRead({ serverDir: null, cwd: root });
  gate(dev.ok === true && dev.file === path.join(root, "catalog/dsh-plugins.json") && JSON.stringify(dev.ids) === JSON.stringify(expectedIds), `LOCALBOT_SERVER_DIR unset, cwd = repo root → catalog/dsh-plugins.json (dev, same resolver): ${dev.file}`);

  // 4. MENTIONS
  const M = await import(pathToFileURL(path.join(root, "src/lib/channels-model.ts")).href);
  const seven = { id: "bot_seven", name: "Seven" };
  const son = { id: "bot_son", name: "Seven of Nine" };
  const bob = { id: "bot_b", name: "Bob" };
  const members = [son, seven, bob];
  const all = M.planSpeakers("", members, { all: true });
  gate(JSON.stringify(all.speakers) === JSON.stringify(["bot_son", "bot_seven", "bot_b"]) && all.reason === "all", "Run all once → every member id, in memberIds order");
  const cases = [
    ["@Seven status?", ["bot_seven"]],
    ["@Seven of Nine status?", ["bot_son"]],
    ["@Seven of Nine ", ["bot_son"]],
    ["@seven of nine, report", ["bot_son"]],
    ["@seven-of-nine go", ["bot_son"]],
    ["@SEVEN_OF_NINE go", ["bot_son"]],
    ["@bot_son go", ["bot_son"]],
    ["@bob then @Seven of Nine then @seven", ["bot_b", "bot_son", "bot_seven"]],
  ];
  for (const [text, want] of cases) {
    const p = M.planSpeakers(text, members);
    gate(JSON.stringify(p.speakers) === JSON.stringify(want) && p.unknown.length === 0 && p.reason === "mentions", `${JSON.stringify(text)} → ${want.join(", ")} (got ${p.speakers.join(", ") || "nobody"}${p.unknown.length ? `; unknown ${p.unknown.join(", ")}` : ""})`);
    gate(p.speakers.every((id) => all.speakers.includes(id)), `…every @ hit for ${JSON.stringify(text)} is one of Run all's ids`);
  }
  const zed = M.planSpeakers("@Zed do it", members);
  gate(zed.speakers.length === 0 && JSON.stringify(zed.unknown) === JSON.stringify(["Zed"]), "@Zed (no such member) → nobody runs, 'Zed' reported for the system line");
  const bobby = M.planSpeakers("@Bobby?", members);
  gate(bobby.speakers.length === 0 && JSON.stringify(bobby.unknown) === JSON.stringify(["Bobby"]), "@Bobby is not Bob (whole-name boundary)");
  const none = M.planSpeakers("status?", members);
  gate(JSON.stringify(none.speakers) === JSON.stringify(["bot_son"]) && none.reason === "default-first", "no @ → the first member only (unchanged)");
  const nonMember = M.planSpeakers("@Seven of Nine hi", [bob]);
  gate(nonMember.speakers.length === 0 && nonMember.unknown.length === 1, "a name whose id is NOT in memberIds stays unknown (system line, no run) — @Seven of Nine in a channel of just Bob");
} catch (err) {
  fail(`live: ${err?.stack ?? err}`);
}

/* ---------------- 5. PACKED (only when npm run build:desktop has run on this box) ---------------- */

const packedRoots = ["linux-unpacked", "win-unpacked", "mac/LocalBot.app/Contents", "mac-arm64/LocalBot.app/Contents", "mac-x64/LocalBot.app/Contents"].map((p) => path.join(root, "dist/desktop", p, "resources"));
const packed = packedRoots.find((p) => fs.existsSync(path.join(p, "localbot-server/server/index.mjs")) && fs.existsSync(path.join(p, "localbot-sidecar/sidecar.mjs")));
let packedTag = flag("--no-packed") ? "packed=skipped(--no-packed)" : "packed=skipped(no dist/desktop tree; run npm run build:desktop first)";
if (packed && !flag("--no-packed")) {
  packedTag = "packed=live";
  try {
    packedTag = await provePackedTree(packed);
  } catch (err) {
    fail(`packed: ${err?.stack ?? err}`);
  }
} else {
  log(packedTag);
}

/**
 * Start the PACKED sidecar (packed sidecar.mjs on the packed Node, cwd elsewhere,
 * LOCALBOT_SERVER_DIR = resources/localbot-server — exactly what desktop/main.mjs does)
 * and call the real `pluginsCatalog` server function over loopback with the launch
 * token. Then the same tree with `catalog/` removed → ok:false naming ENOENT.
 */
async function provePackedTree(resources) {
  const { spawn } = await import("node:child_process");
  const { createRequire } = await import("node:module");
  const T = await import(pathToFileURL(path.join(resources, "localbot-sidecar/sidecar-token.mjs")).href);
  const seroval = createRequire(path.join(root, "package.json"))("seroval");
  const nodeBin = path.join(resources, "localbot-node", process.platform === "win32" ? "node.exe" : "node");
  const SIDECAR_URL = "http://127.0.0.1:18790/";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const answering = async (ms) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      try {
        if ((await fetch(SIDECAR_URL, { signal: AbortSignal.timeout(1000) })).ok) return true;
      } catch {
        /* retry */
      }
      await sleep(300);
    }
    return false;
  };
  const closed = async (ms) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      try {
        await fetch(SIDECAR_URL, { signal: AbortSignal.timeout(500) });
      } catch {
        return true;
      }
      await sleep(200);
    }
    return false;
  };
  if (await answering(500)) throw new Error(`${SIDECAR_URL} already answering — quit the other LocalBot first`);
  gate(fs.existsSync(path.join(resources, CATALOG_RESOURCE_PATH.replace(/^resources\//, ""))), `packed tree has ${CATALOG_RESOURCE_PATH}`);
  gate(sha256File(path.join(resources, "localbot-server/catalog/dsh-plugins.json")) === sha256File(path.join(root, "catalog/dsh-plugins.json")), "packed dsh-plugins.json is byte-identical to the repo's");

  const callOnce = async (serverDir, label) => {
    const ssrDir = path.join(serverDir, "server/_ssr");
    const manifest = fs.readdirSync(ssrDir).map((n) => fs.readFileSync(path.join(ssrDir, n), "utf8")).join("\n");
    const id = /"([0-9a-f]{64})":\s*\{\s*functionName:\s*"pluginsCatalog_createServerFn_handler"/.exec(manifest)?.[1];
    if (!id) throw new Error(`${label}: pluginsCatalog id not found in the packed manifest`);
    const token = T.mintSidecarToken();
    const dataDir = tmp("lb21-packed-data-");
    const env = { ...process.env, LOCALBOT_DATA_DIR: dataDir, LOCALBOT_SERVER_DIR: serverDir, [T.SIDECAR_TOKEN_ENV]: token, LOCALBOT_PACKAGED: "1" };
    delete env.ELECTRON_RUN_AS_NODE;
    let err = "";
    const child = spawn(nodeBin, [path.join(resources, "localbot-sidecar/sidecar.mjs")], { cwd: os.tmpdir(), env, stdio: ["ignore", "pipe", "pipe"] });
    child.stderr.on("data", (d) => (err += String(d)));
    child.stdout.on("data", (d) => (err += String(d)));
    try {
      if (!(await answering(60000))) throw new Error(`${label}: packed sidecar never answered: ${err.slice(-1500)}`);
      log(`${label}: packed sidecar up (pid ${child.pid}) on ${nodeBin}, cwd elsewhere, LOCALBOT_SERVER_DIR=${serverDir}`);
      const res = await fetch(`${SIDECAR_URL}_serverFn/${id}?createServerFn`, {
        method: "POST",
        headers: { Origin: SIDECAR_URL.replace(/\/$/, ""), "x-tsr-serverFn": "true", accept: "application/json", "content-type": "application/json", [T.SIDECAR_TOKEN_HEADER]: token },
        body: JSON.stringify(await seroval.toJSONAsync({ data: undefined })),
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      // The wire format is seroval JSON ({"k":[keys],"v":[values]} objects, booleans as {"t":2,"s":2|3}); read it as text.
      const strings = [...text.matchAll(/"s":"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`));
      const okShape = /"k":\["ok","file","entries"\]/.test(text) ? true : /"k":\["ok","error"\]/.test(text) ? false : null;
      return { status: res.status, ok: okShape, strings, text };
    } finally {
      child.kill("SIGTERM");
      await closed(10000);
    }
  };

  const withCatalog = await callOnce(path.join(resources, "localbot-server"), "PACKED");
  gate(withCatalog.status === 200 && withCatalog.ok === true, `PACKED: pluginsCatalog over loopback with the launch token → HTTP ${withCatalog.status}, ok:${String(withCatalog.ok)}`);
  const packedFile = path.join(resources, "localbot-server/catalog/dsh-plugins.json");
  gate(withCatalog.strings.includes(packedFile), `PACKED: the file it opened is resources/localbot-server/catalog/dsh-plugins.json (${packedFile})`);
  const wantIds = JSON.parse(fs.readFileSync(path.join(root, "catalog/dsh-plugins.json"), "utf8")).plugins.map((p) => p.id);
  const gotIds = wantIds.filter((id) => withCatalog.strings.includes(id));
  gate(gotIds.length === wantIds.length, `PACKED: every catalog entry came back: ${gotIds.join(", ")}`);

  const hole = tmp("lb21-packed-hole-");
  fs.cpSync(path.join(resources, "localbot-server"), path.join(hole, "localbot-server"), { recursive: true });
  fs.rmSync(path.join(hole, "localbot-server/catalog"), { recursive: true });
  const without = await callOnce(path.join(hole, "localbot-server"), "PACKED-WITHOUT-catalog");
  const holeError = without.strings.find((s) => /ENOENT/.test(s)) ?? "";
  gate(without.ok === false && holeError.includes(path.join(hole, "localbot-server/catalog/dsh-plugins.json")) && /rebuild with npm run build:desktop/.test(holeError), `PACKED-WITHOUT-catalog: ok:false — ${holeError || without.text.slice(0, 300)}`);
  return "packed=live(sidecar on the packed Node answered pluginsCatalog from resources/localbot-server/catalog)";
}

finish(`static+live layout/sidecar-path/dev-path/mentions ${packedTag}`);
