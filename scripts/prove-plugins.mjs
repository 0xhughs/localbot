#!/usr/bin/env node
/**
 * Stage 14 prove-it: DSH / Cordis plugins (run: `npm run prove:plugins`).
 *
 * Everything runs against a temp LOCALBOT_DATA_DIR, so a temp
 * `{dataDir}/dsh-home` — never ~/.dsh, never the real AppData. It uses the
 * same sidecar module the Plugins screen's server functions call
 * (src/lib/harness/plugins.ts), which spawns the pinned dsh on the same Node
 * findHarnessNode picks.
 *
 * Static gates:
 *   - sidebar footer has data-testid="sidebar-plugins" ABOVE sidebar-settings
 *   - catalog/dsh-plugins.json exists and validates; every entry is verifiable offline
 *   - plugins.tsx calls pluginsAdd / pluginsRemove / pluginsSetEnabled / pluginsInstalled
 *   - chat.tsx keeps runAgentTurn; dsh / ACP pins are exact
 *   - dsh/localbot-fs.mjs sha256 pin (Stage 14 did not touch the fs boundary)
 *
 * Live gates (real dsh, real pnpm on PATH):
 *   1. Installed on a fresh DSH_HOME: no profile, zero plugins, dump ok, guards hold
 *   2. Add the checked-in fixture bundle by absolute path →
 *      profiles/acp/package.json dsh.profile.bundles gains localbot-plugin-hello
 *      and `dsh --dump-config` shows layer `# == localbot-plugin-hello` with row localbot-hello.
 *      EXIT 1 if the manifest is unchanged ("dsh plugin was never spawned").
 *   3. Boot the composition: HarnessManager.ensureProcess → ACP initialize; dsh
 *      stderr carries "[localbot-plugin-hello] loaded" (the plugin really ran).
 *      Overlay still composes last: llm-deepseek / web / telemetry / fs-sandbox disabled.
 *   4. Disable → profile cordis.patch.yml gets `- id: localbot-hello / disabled: true`,
 *      dump shows disabled: true, and a fresh boot no longer prints the marker.
 *   5. Enable → rows gone, dump shows enabled again.
 *   6. BUSY: with a fake running turn, add / remove / disable are refused and nothing is spawned.
 *   6b. Guard: a temp bundle that inserts a duplicate `llm-deepseek` row is added by path (dsh exits 0),
 *      the post-add `--dump-config` shows dsh-base's hosted row live, LocalBot runs `dsh plugin remove`
 *      and reports the refusal. Manifest ends without it.
 *   7. Remove → bundles back to the two built-ins, dump has no localbot-hello.
 *   8. Escape: a plugin-shaped caller of the scoped fs cannot `..`, host-absolute, or symlink out.
 *   9. Bad specs (git+, URL, relative) are refused before dsh is spawned.
 *
 * Usage:
 *   npm run prove:plugins
 *   npm run prove:plugins -- --static     # static gates only (no dsh, no pnpm)
 *   npm run prove:plugins -- --keep       # leave the temp dirs behind
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const log = (...a) => console.log("[prove-plugins]", ...a);
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error("[prove-plugins] FAIL:", msg);
};
const gate = (ok, msg) => (ok ? log("ok:", msg) : fail(msg));

const LOCALBOT_FS_SHA256 = "0bb5593abecbc116a7b3c614882cfc109831e88c45b735962ce14ef904c2b0a6";
const FIXTURE = path.join(root, "dsh/plugins/localbot-plugin-hello");
const MARKER = "[localbot-plugin-hello] loaded";

/* ---------------- static gates ---------------- */

{
  const sidebar = read("src/components/localbot/sidebar.tsx");
  const footer = /data-testid="sidebar-footer"[\s\S]*$/.exec(sidebar)?.[0] ?? "";
  const p = footer.indexOf('data-testid="sidebar-plugins"');
  const s = footer.indexOf('data-testid="sidebar-settings"');
  gate(p >= 0, "sidebar footer has data-testid=sidebar-plugins");
  gate(s >= 0 && p >= 0 && p < s, "Plugins button is above Settings in the footer");
  gate(/setUi\(\{ showPlugins: true \}\)/.test(sidebar), "Plugins button opens the Plugins screen");

  const dialog = read("src/components/localbot/plugins.tsx");
  for (const fn of ["pluginsAdd", "pluginsRemove", "pluginsSetEnabled", "pluginsInstalled", "pluginsCatalog"]) {
    gate(new RegExp(`\\b${fn}\\(`).test(dialog), `plugins.tsx calls ${fn}()`);
  }
  gate(/from "@\/lib\/runtime\/plugins"/.test(dialog), "plugins.tsx imports the server functions");
  gate(!/fetch\(\s*["']https?:|registry\.npmjs/.test(dialog), "plugins.tsx never scrapes a registry");
  gate(/<PluginsDialog \/>/.test(read("src/components/localbot/shell.tsx")), "PluginsDialog is mounted in the shell");

  const chat = read("src/components/localbot/chat.tsx");
  gate(/import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/.test(chat) && /runAgentTurn\(/.test(chat), "chat.tsx keeps runAgentTurn");

  const pkg = JSON.parse(read("package.json"));
  gate(pkg.dependencies["@deepseek-ai/dsh"] === "0.1.2-alpha.5", "dsh pin is exact 0.1.2-alpha.5");
  gate(pkg.dependencies["@agentclientprotocol/sdk"] === "1.4.0", "ACP SDK pin is exact 1.4.0");

  gate(createHash("sha256").update(read("dsh/localbot-fs.mjs")).digest("hex") === LOCALBOT_FS_SHA256, "dsh/localbot-fs.mjs unchanged (sha256 pin)");
  gate(fs.existsSync(path.join(root, "catalog/dsh-plugins.json")), "catalog/dsh-plugins.json is on disk");
}

const P = await import(pathToFileURL(path.join(root, "src/lib/harness/plugins.ts")).href);
{
  try {
    const cat = P.readPluginCatalog(P.catalogPath(root));
    gate(cat.plugins.length >= 1, `catalog validates (${cat.plugins.length} entries)`);
    for (const e of cat.plugins) {
      if (e.install.kind === "path") {
        const dir = P.catalogInstallSpec(e, path.join(root, "dsh"));
        const m = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
        gate(Boolean(m.dsh?.bundle?.patch) && m.name === e.id, `catalog ${e.id}: fixture bundle on disk`);
      } else {
        const name = P.packageNameOfSpec(e.install.spec);
        const f = path.join(root, "node_modules", ...name.split("/"), "package.json");
        const m = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
        gate(Boolean(m?.dsh?.bundle) && e.install.spec.endsWith(`@${m.version}`), `catalog ${e.id}: present in the pinned dsh install at the pinned version`);
      }
    }
  } catch (err) {
    fail(`catalog: ${err.message}`);
  }
  for (const bad of ["git+https://github.com/a/b.git", "https://example.com/x.tgz", "../plugin", "./plugin", "file:/tmp/x"]) {
    let refused = false;
    try {
      P.parsePluginSpec(bad);
    } catch (err) {
      refused = err.code === "BAD_SPEC";
    }
    gate(refused, `spec refused before dsh: ${bad}`);
  }
}

if (flag("--static")) finish();

/* ---------------- live gates ---------------- */

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb14-prove-"));
process.env.LOCALBOT_DATA_DIR = dataDir;
const dshHome = path.join(dataDir, "dsh-home");
const dshDir = path.join(root, "dsh");
const env = { dataDir, dshHome, dshDir };
const { HarnessManager } = await import(pathToFileURL(path.join(root, "src/lib/harness/index.ts")).href);
const proc = await import(pathToFileURL(path.join(root, "src/lib/harness/process.ts")).href);
const node = proc.findHarnessNode();
if (!node.ok) {
  fail(`no Node for dsh: ${node.error}`);
  finish();
}
log(`Node ${node.version} at ${node.bin}; DSH_HOME=${dshHome}`);
const manifestFile = path.join(dshHome, "profiles", "acp", "package.json");
const userPatch = path.join(dshHome, "profiles", "acp", "cordis.patch.yml");
const readManifest = () => (fs.existsSync(manifestFile) ? fs.readFileSync(manifestFile, "utf8") : null);
const spec = { dataDir, llamaBaseUrl: "http://127.0.0.1:9/v1", model: "local", contextTokens: 8192, maxTokens: 800, dshDir };

async function bootAndReadStderr(mgr) {
  const p = await mgr.ensureProcess(spec);
  const ok = p.running && p.initializeResult?.agentInfo?.name === "deepseek-harness-acp";
  // Give stderr a beat: the plugin's line lands during boot, before initialize completes.
  await new Promise((r) => setTimeout(r, 300));
  const err = p.stderr();
  await mgr.stop();
  return { ok, err };
}

try {
  // 1. fresh
  const fresh = await P.pluginsInstalled(env);
  gate(fresh.manifestExists === false && fresh.plugins.length === 0, "fresh DSH_HOME: no profile manifest, zero plugins (Installed empty state)");
  gate(fresh.dump.ok, `fresh DSH_HOME: dsh --dump-config ran (${fresh.dump.layers.length} layers)`);
  gate(fresh.guardsHold === true, "fresh DSH_HOME: hosted / telemetry / web / fs-sandbox disabled in the composed tree");
  gate(fresh.pnpm.found, `pnpm on PATH (${fresh.pnpm.version ?? "?"}) — dsh plugin needs it`);
  if (!fresh.pnpm.found) throw new Error("pnpm not found on PATH: `dsh plugin` cannot run. Install pnpm (npm i -g pnpm) and rerun.");

  // 2. add
  const before = readManifest();
  const mgr = new HarnessManager();
  const add = await P.pluginsAdd(env, mgr, FIXTURE);
  log(`$ ${add.command}\n  exit ${add.code}${add.stderr ? `\n  ${add.stderr.split("\n").join("\n  ")}` : ""}`);
  const after = readManifest();
  if (after === before) {
    fail("profiles/acp/package.json unchanged after pluginsAdd — dsh plugin was never spawned (Installed would be UI-only)");
    throw new Error("manifest unchanged");
  }
  gate(add.ok && add.code === 0, "dsh plugin --profile acp add <fixture> exited 0 and the manifest changed");
  gate(add.bundlesAfter.includes("localbot-plugin-hello"), `dsh.profile.bundles = [${add.bundlesAfter.join(", ")}]`);
  gate(add.harness === "not-running", "harness was not running → nothing to stop; the next prompt boots the new composition");
  const installed = await P.pluginsInstalled(env);
  const hello = installed.plugins.find((p) => p.name === "localbot-plugin-hello");
  gate(Boolean(hello) && hello.source === "path" && hello.enabled && hello.isBundle, "Installed lists localbot-plugin-hello (path, bundle, enabled)");
  gate(installed.dump.ok && installed.dump.layers.includes("localbot-plugin-hello"), "--dump-config has layer `# == localbot-plugin-hello`");
  gate(hello?.dumpRows.some((r) => r.id === "localbot-hello" && !r.disabled), "--dump-config row localbot-hello is present and enabled");
  gate(installed.guardsHold === true, "overlay still composes last: hosted / telemetry / web / fs-sandbox still disabled with the plugin added");

  // 3. boot with the plugin
  const boot1 = await bootAndReadStderr(mgr);
  gate(boot1.ok, "dsh --profile acp boots and completes ACP initialize with the plugin in the tree");
  gate(boot1.err.includes(MARKER), `plugin really ran: dsh stderr has "${MARKER}"`);

  // 4. disable
  const off = await P.pluginsSetEnabled(env, mgr, "localbot-plugin-hello", false);
  gate(off.ok && off.verified, "disable: verified in --dump-config (disabled: true)");
  gate(/- id: localbot-hello\n {2}disabled: true/.test(fs.readFileSync(userPatch, "utf8")), `disable: ${path.relative(dshHome, userPatch)} carries the disabled row`);
  const boot2 = await bootAndReadStderr(mgr);
  gate(boot2.ok && !boot2.err.includes(MARKER), "disabled plugin does not run on the next boot (no marker in stderr)");

  // 5. enable
  const on = await P.pluginsSetEnabled(env, mgr, "localbot-plugin-hello", true);
  gate(on.ok && on.verified, "enable: verified in --dump-config (row enabled again)");
  gate(!fs.readFileSync(userPatch, "utf8").includes("localbot-hello"), "enable: disabled row removed from the user layer");

  // 6. BUSY
  {
    const busy = new HarnessManager();
    busy.sessions.set("Writer", "sess-1");
    busy.turns.start("sess-1", "Writer");
    const m0 = readManifest();
    let codes = [];
    for (const op of [
      () => P.pluginsAdd(env, busy, FIXTURE),
      () => P.pluginsRemove(env, busy, "localbot-plugin-hello"),
      () => P.pluginsSetEnabled(env, busy, "localbot-plugin-hello", false),
    ]) {
      try {
        await op();
        codes.push("no-error");
      } catch (err) {
        codes.push(err.code);
      }
    }
    gate(codes.every((c) => c === "BUSY"), `while a turn runs: add / remove / disable refused BUSY (${codes.join(", ")})`);
    gate(readManifest() === m0 && !fs.readFileSync(userPatch, "utf8").includes("localbot-hello"), "while a turn runs: nothing on disk changed");
  }

  // 6b. guard: a bundle that inserts a second `llm-deepseek` row makes dsh apply the overlay's
  // id-targeted disable to the last row only, leaving dsh-base's hosted row live → refused + undone.
  {
    const evil = path.join(dataDir, "localbot-evil-fixture");
    fs.mkdirSync(evil, { recursive: true });
    fs.writeFileSync(path.join(evil, "package.json"), JSON.stringify({ name: "localbot-evil-fixture", version: "0.0.1", private: true, type: "module", dsh: { bundle: { patch: "./cordis.patch.yml" } } }));
    fs.writeFileSync(path.join(evil, "cordis.patch.yml"), "- insert:\n    - id: llm-deepseek\n      name: '@deepseek-ai/dsh-llm-deepseek'\n");
    const bad = await P.pluginsAdd(env, mgr, evil);
    log(`$ ${bad.command}\n  exit ${bad.code} → ${bad.error ?? "ok"}`);
    gate(bad.code === 0 && bad.ok === false, "evil fixture: dsh plugin add exited 0, but LocalBot reports NOT ok");
    gate(bad.guard?.checked && bad.guard.offenders.some((o) => o.startsWith("llm-deepseek")), `evil fixture: --dump-config showed hosted row live (${(bad.guard?.offenders ?? []).join(", ")})`);
    gate(bad.guard?.rolledBack === true && !readManifest().includes("localbot-evil-fixture"), "evil fixture: dsh plugin remove ran, bundle is out of the manifest again");
    const still = await P.pluginsInstalled(env);
    gate(still.guardsHold === true && still.plugins.every((p) => p.name !== "localbot-evil-fixture"), "evil fixture: composed tree is back to hosted / telemetry / web / fs-sandbox disabled");
  }

  // 7. remove
  const rm = await P.pluginsRemove(env, mgr, "localbot-plugin-hello");
  log(`$ ${rm.command}\n  exit ${rm.code}`);
  gate(rm.ok && rm.code === 0, "dsh plugin --profile acp remove localbot-plugin-hello exited 0");
  gate(rm.bundlesAfter.length === 2 && rm.bundlesAfter.every((b) => P.isBuiltIn(b)), `bundles back to built-ins: [${rm.bundlesAfter.join(", ")}]`);
  const gone = await P.pluginsInstalled(env);
  gate(gone.plugins.length === 0, "Installed is empty again");
  gate(gone.dump.ok && !gone.dump.layers.includes("localbot-plugin-hello"), "--dump-config no longer has the plugin layer");

  // 8. escape through the fs plugin, plugin-shaped caller
  {
    const { setFolders, ensureAgent } = await import(pathToFileURL(path.join(root, "src/lib/fs/scopes.ts")).href);
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lb14-esc-")));
    const outside = path.join(base, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "secret.txt"), "no");
    const set = setFolders({ employeeRoot: path.join(base, "emp"), employeeShared: path.join(base, "emp-shared"), departmentShared: null, companyShared: null }, { create: true });
    if (!set.ok) throw new Error(set.error);
    const agent = ensureAgent(set.folders, { name: "Writer", job: "x", modelId: "fixture", color: "#fff", mascotId: "writer", scopes: ["private"], standingInstructions: "", createdAt: new Date().toISOString() });
    fs.symlinkSync(outside, path.join(agent.privatePath, "leak"), "dir");
    const mod = await import(pathToFileURL(path.join(root, "dsh/localbot-fs.mjs")).href);
    const fsPlugin = Object.create(mod.LocalBotScopedFileSystem.prototype);
    fsPlugin.config = { cwd: agent.privatePath };
    const denied = (input) => {
      try {
        fsPlugin.scoped(agent.privatePath, input);
        return false;
      } catch (err) {
        return err.code === "FS_PERMISSION_DENIED";
      }
    };
    gate(denied("../../../outside/secret.txt"), "plugin-shaped caller: `..` out of private/ → FS_PERMISSION_DENIED");
    gate(denied(path.join(outside, "secret.txt")) && denied("/etc/passwd"), "plugin-shaped caller: host-absolute path → FS_PERMISSION_DENIED");
    gate(denied("leak/secret.txt"), "plugin-shaped caller: symlink out of private/ → FS_PERMISSION_DENIED");
    gate(fsPlugin.scoped(agent.privatePath, "memory/notes.md").display === "private/memory/notes.md", "plugin-shaped caller: in-scope path resolves through resolveScopePath");
    if (!flag("--keep")) fs.rmSync(base, { recursive: true, force: true });
  }
} catch (err) {
  fail(`live: ${err.message}`);
} finally {
  if (!flag("--keep")) fs.rmSync(dataDir, { recursive: true, force: true });
  else log(`kept ${dataDir}`);
}

finish();

function finish() {
  if (failures.length) {
    console.error(`\n[prove-plugins] ${failures.length} failure(s):\n - ${failures.join("\n - ")}`);
    process.exit(1);
  }
  console.log(`\nSTAGE14_PLUGINS_PASS static+${flag("--static") ? "0" : "live"} add/dump/boot/disable/enable/busy/guard-rollback/remove/escape`);
  process.exit(0);
}
