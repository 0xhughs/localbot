#!/usr/bin/env node
/**
 * Stage 20 prove-it: packaged runtime completeness (run: `npm run prove:packaged-tools`).
 *
 * Static gates (scripts/packaged-tools-gates.mjs): exit 1 if pnpm is not pinned
 * exactly, the extraResources rows for dist/desktop-pnpm / dist/desktop-whisper
 * are gone, plugins.ts no longer prepends LOCALBOT_PNPM_DIR to PATH or refuses
 * NO_PNPM in packaged mode, stt.ts's built branch can only say "compile with
 * cmake" again, plugins.tsx says "does not bundle pnpm", chat.tsx drops
 * runAgentTurn, the token / quit gates go, the dsh / ACP pins float,
 * dsh/localbot-fs.mjs changes, or mac.identity is not null.
 *
 * Live gates (this box, real pinned dsh, real pinned pnpm — the staged copy):
 *   1. stagePnpm → temp dir; the sh shim prints the pin on the Harness Node with an EMPTY PATH.
 *   2. pluginsAdd(<fixture>) with PATH = an empty folder, LOCALBOT_PACKAGED=1,
 *      LOCALBOT_PNPM_DIR = the staged bin → `dsh plugin --profile acp add` exits 0 and
 *      profiles/acp/package.json lists localbot-plugin-hello in dsh.profile.bundles.
 *      The child's PATH started with the bundle; pnpm's store landed under DSH_HOME.
 *   3. The same call without LOCALBOT_PNPM_DIR → PluginError NO_PNPM before dsh is spawned:
 *      a fresh DSH_HOME stays empty. Never dsh's exit 127 from a hoped-for host pnpm.
 *   4. pnpmStatus / pluginsInstalled report source "bundled" with the pin.
 *
 * Whisper: the darwin-arm64 bake is unit-tested with fixtures
 * (src/lib/packaged-tools.test.ts); nothing here compiles or runs whisper-cli.
 * A real .dmg on a Mac stays UNVERIFIED until `npm run build:desktop` runs there.
 *
 * Usage:
 *   npm run prove:packaged-tools
 *   npm run prove:packaged-tools -- --static     # static gates only (no dsh, no pnpm)
 *   npm run prove:packaged-tools -- --keep       # leave the temp dirs behind
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PNPM_PIN, packagedToolsGates } from "./packaged-tools-gates.mjs";
import { pnpmShimVersion, stagePnpm } from "./desktop-stage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const log = (...a) => console.log("[prove-packaged-tools]", ...a);
const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error("[prove-packaged-tools] FAIL:", msg);
};
const gate = (ok, msg) => (ok ? log("ok:", msg) : fail(msg));
const FIXTURE = path.join(root, "dsh/plugins/localbot-plugin-hello");
const temps = [];

function finish(extra = "") {
  if (!flag("--keep")) for (const d of temps) fs.rmSync(d, { recursive: true, force: true });
  if (failures.length) {
    console.error(`[prove-packaged-tools] ${failures.length} failing gate(s)`);
    process.exit(1);
  }
  console.log(`STAGE20_PACKAGED_TOOLS_PASS ${extra}`.trim());
  process.exit(0);
}

/* ---------------- static gates ---------------- */

const gates = packagedToolsGates(root);
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
const P = await import(pathToFileURL(path.join(root, "src/lib/harness/plugins.ts")).href);
const proc = await import(pathToFileURL(path.join(root, "src/lib/harness/process.ts")).href);
const node = proc.findHarnessNode();
if (!node.ok) {
  fail(`no Node for dsh on this box: ${node.error}`);
  finish();
}
log(`Harness Node ${node.version} at ${node.bin}`);

// 1. stage pnpm the way build-desktop.mjs does; run the shim with nothing on PATH
const stage = tmp("lb20-pnpm-stage-");
const pnpm = stagePnpm({ root, stage, pin: PNPM_PIN, log });
const shimVersion = pnpmShimVersion(pnpm.shim, node.bin);
gate(shimVersion === PNPM_PIN, `staged shim on the Harness Node with an EMPTY PATH prints ${PNPM_PIN} (got ${shimVersion ?? "nothing"})`);
if (shimVersion !== PNPM_PIN) finish();

// The employee's machine: no pnpm, no node on PATH.
const emptyPath = tmp("lb20-empty-path-");
const baseEnv = {
  HOME: os.homedir(),
  USERPROFILE: os.homedir(),
  TMPDIR: os.tmpdir(),
  TEMP: os.tmpdir(),
  TMP: os.tmpdir(),
  PATH: emptyPath,
  LOCALBOT_PACKAGED: "1",
  LOCALBOT_DSH_NODE: node.bin,
};
const dshDir = path.join(root, "dsh");

// 2. bundled pnpm → dsh plugin add works
{
  const dataDir = tmp("lb20-data-bundled-");
  const dshHome = path.join(dataDir, "dsh-home");
  const env = { ...baseEnv, LOCALBOT_PNPM_DIR: pnpm.binDir };
  const manifestFile = path.join(dshHome, "profiles", "acp", "package.json");
  let childEnv = null;
  const spy = async (bin, a, opts) => {
    childEnv = opts.env;
    return P.spawnRunner(bin, a, opts);
  };
  const status = await P.pnpmStatus(env, P.spawnRunner);
  gate(status.found && status.source === "bundled" && status.version === PNPM_PIN, `pnpmStatus → bundled ${status.version ?? "?"} at ${status.dir ?? "?"} (found=${status.found}, source=${status.source})`);

  const add = await P.pluginsAdd({ dataDir, dshHome, dshDir, env, run: spy }, null, FIXTURE);
  log(`$ ${add.command}\n  exit ${add.code}${add.stderr ? `\n  ${add.stderr.split("\n").join("\n  ")}` : ""}`);
  gate(add.ok && add.code === 0, "PATH empty + LOCALBOT_PNPM_DIR: dsh plugin --profile acp add <fixture> exited 0");
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  } catch {
    manifest = null;
  }
  const bundles = manifest?.dsh?.profile?.bundles ?? [];
  gate(bundles.includes("localbot-plugin-hello"), `profiles/acp/package.json dsh.profile.bundles = [${bundles.join(", ")}]`);
  gate("localbot-plugin-hello" in (manifest?.dependencies ?? {}), `profiles/acp/package.json dependencies has localbot-plugin-hello (${manifest?.dependencies?.["localbot-plugin-hello"] ?? "missing"})`);
  gate(childEnv && String(childEnv.PATH).startsWith(pnpm.binDir + path.delimiter), `dsh child PATH starts with the bundle: ${childEnv ? String(childEnv.PATH).split(path.delimiter)[0] : "?"}`);
  gate(childEnv && childEnv.PATH.split(path.delimiter).length === 2 && childEnv.PATH.split(path.delimiter)[1] === emptyPath, "…and holds nothing else but the empty folder (no host pnpm anywhere on it)");
  gate(childEnv?.npm_config_store_dir === path.join(dshHome, "pnpm-store"), `npm_config_store_dir = ${childEnv?.npm_config_store_dir}`);
  gate(childEnv?.LOCALBOT_DSH_NODE === node.bin, "the shim was told to use the Harness Node (LOCALBOT_DSH_NODE)");
  const storeUsed = fs.existsSync(path.join(dshHome, "pnpm-store"));
  log(`pnpm store under DSH_HOME: ${storeUsed ? "created" : "not created (a link: add needs no store entries)"}`);
  const installed = await P.pluginsInstalled({ dataDir, dshHome, dshDir, env }, { dump: true });
  const hello = installed.plugins.find((p) => p.name === "localbot-plugin-hello");
  gate(Boolean(hello) && hello.isBundle && hello.enabled, "Installed lists localbot-plugin-hello (bundle, enabled)");
  gate(installed.dump.ok && installed.dump.layers.includes("localbot-plugin-hello"), "dsh --dump-config composes the layer # == localbot-plugin-hello");
  gate(installed.guardsHold === true, "hosted / telemetry / web / fs-sandbox still disabled with the plugin composed");
  gate(installed.pnpm.source === "bundled" && installed.pnpm.version === PNPM_PIN, `Installed report says pnpm ${installed.pnpm.version} (${installed.pnpm.source}) — the UI shows no red banner`);

  const remove = await P.pluginsRemove({ dataDir, dshHome, dshDir, env, run: P.spawnRunner }, null, "localbot-plugin-hello");
  gate(remove.ok && remove.code === 0, "dsh plugin remove through the bundled pnpm exits 0");
}

// 3. no bundle in packaged mode → NO_PNPM, nothing spawned, never 127
{
  const dataDir = tmp("lb20-data-nobundle-");
  const dshHome = path.join(dataDir, "dsh-home");
  const env = { ...baseEnv };
  let spawned = 0;
  const spy = async (bin, a, opts) => {
    spawned++;
    return P.spawnRunner(bin, a, opts);
  };
  let code = null;
  let message = "";
  try {
    await P.pluginsAdd({ dataDir, dshHome, dshDir, env, run: spy }, null, FIXTURE);
  } catch (err) {
    code = err?.code ?? null;
    message = err instanceof Error ? err.message : String(err);
  }
  gate(code === "NO_PNPM", `PATH empty, LOCALBOT_PACKAGED=1, no LOCALBOT_PNPM_DIR → PluginError NO_PNPM (got ${code ?? "no error"})`);
  gate(/never uses pnpm from PATH/.test(message), `refusal says why: ${message.split(". ")[0]}`);
  gate(spawned === 0, "dsh was never spawned (no exit 127, no profile init)");
  gate(!fs.existsSync(path.join(dshHome, "profiles")), "fresh DSH_HOME has no profile after the refusal");
  const status = await P.pnpmStatus(env, P.spawnRunner);
  gate(status.found === false && status.source === null, "pnpmStatus reports not found without probing PATH (the UI shows the NO_PNPM banner)");
  const installed = await P.pluginsInstalled({ dataDir, dshHome, dshDir, env }, { dump: true });
  gate(installed.dump.ok, "Installed (dsh --dump-config) still works without a pnpm — only Add / Remove refuse");
}

finish(`static+live pnpm=bundled/${PNPM_PIN} node=${node.version} whisper=seed-unit-only`);
