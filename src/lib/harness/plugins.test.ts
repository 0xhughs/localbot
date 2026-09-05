/**
 * Stage 14 — DSH / Cordis plugins for LocalBot's isolated DSH_HOME (profile acp).
 *
 * These fail when:
 *   - the Plugins panel is UI-only: plugins.tsx stops calling the pluginsAdd /
 *     pluginsRemove / pluginsSetEnabled / pluginsInstalled server functions, or
 *     those stop reaching src/lib/harness/plugins.ts, or that module stops
 *     spawning `dsh plugin --profile acp …`
 *   - `catalog/dsh-plugins.json` is missing, malformed, or names a package
 *     that cannot be verified offline (fixture on disk / pinned dsh install)
 *   - the sidebar footer has no `sidebar-plugins` button, or it sits below Settings
 *   - the spec allowlist lets git+ / URLs / tarballs / relative paths through
 *   - a plugin-shaped caller of the scoped fs can `..`, use a host-absolute
 *     path, or follow a symlink out of a scope
 *   - dsh/localbot-fs.mjs changed (sha256 pin) or the overlay stops
 *     disabling hosted / telemetry / web / fs-sandbox
 *   - a plugin change is not refused with BUSY while a turn runs, or does
 *     not stop the dsh child afterwards
 *   - chat.tsx drops runAgentTurn, or the dsh / ACP pins float
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, describe, it } from "node:test";
import { makeTempRoot } from "../fs/disk.ts";
import { ensureAgent, setFolders } from "../fs/scopes.ts";
import type { FoldersConfig } from "../fs/scope-model.ts";
import { HarnessManager } from "./index.ts";
import {
  BUILT_IN_BUNDLES,
  CATALOG_FILE,
  assertNotBusy,
  catalogInstallSpec,
  dshDumpArgs,
  dshPluginArgs,
  filterCatalog,
  filterInstalled,
  guardsHold,
  insertedRowIds,
  isBuiltIn,
  packageNameOfSpec,
  parseConfigDump,
  parsePluginSpec,
  parseUserPatch,
  pluginNameOf,
  pluginsAdd,
  pluginsInstalled,
  pluginsRemove,
  pluginsSetEnabled,
  readInstalledBundle,
  readPluginCatalog,
  renderUserPatch,
  rowsForLayer,
  setBundleEnabled,
  type RunResult,
  type Runner,
} from "./plugins.ts";
import { ACP_SDK_PIN, DSH_PIN } from "./process.ts";

const repo = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(repo, p), "utf8");
const FIXTURE = path.join(repo, "dsh/plugins/localbot-plugin-hello");

/** sha256 of dsh/localbot-fs.mjs on main at 23a8f0a. Stage 14 must not touch it. */
const LOCALBOT_FS_SHA256 = "0bb5593abecbc116a7b3c614882cfc109831e88c45b735962ce14ef904c2b0a6";

describe("Stage 14: pins and the fs boundary are untouched", () => {
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };

  it("dsh / ACP pins are exact and unchanged", () => {
    assert.equal(pkg.dependencies["@deepseek-ai/dsh"], DSH_PIN);
    assert.equal(DSH_PIN, "0.1.2-alpha.5");
    assert.equal(pkg.dependencies["@agentclientprotocol/sdk"], ACP_SDK_PIN);
    assert.equal(ACP_SDK_PIN, "1.4.0");
    for (const k of ["@deepseek-ai/dsh", "@agentclientprotocol/sdk"]) assert.doesNotMatch(pkg.dependencies[k]!, /^[\^~]/);
  });

  it("dsh/localbot-fs.mjs is byte-identical to main (sha256 pin) and still ends every path in resolveForAgent", () => {
    const text = read("dsh/localbot-fs.mjs");
    assert.equal(createHash("sha256").update(text).digest("hex"), LOCALBOT_FS_SHA256, "dsh/localbot-fs.mjs changed — Stage 14 must not weaken the scoped fs");
    assert.match(text, /resolveForAgent\(folders, target\)/);
    assert.match(text, /import \{[^}]*resolveForAgent[^}]*\} from "\.\.\/src\/lib\/fs\/scopes\.ts"/);
  });

  it("the overlay still disables hosted / telemetry / web / fs-sandbox — and composes after plugin bundles (--patch)", () => {
    const yml = read("dsh/localbot-acp.cordis.yml");
    for (const id of ["session-telemetry-otel", "llm-deepseek", "web", "web-search-deepseek", "web-fetch-http", "tool-web", "fs-sandbox"]) {
      assert.match(yml, new RegExp(`- id: ${id}\\n  disabled: true`), `${id} must stay disabled`);
    }
    // harnessArgs passes both overlays as --patch, which dsh applies after every bundle and the profile user layer.
    const proc = read("src/lib/harness/process.ts");
    assert.match(proc, /"--patch",\s*path\.join\(dshDir, "localbot-acp\.cordis\.yml"\),\s*"--patch",\s*pluginOverlay/);
  });

  it("chat.tsx still sends through runAgentTurn", () => {
    const chat = read("src/components/localbot/chat.tsx");
    assert.match(chat, /import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/);
    assert.match(chat, /runAgentTurn\(/);
  });
});

describe("Stage 14: sidebar footer and the Plugins screen are wired to dsh, not React state", () => {
  const sidebar = read("src/components/localbot/sidebar.tsx");
  const dialog = read("src/components/localbot/plugins.tsx");
  const serverFns = read("src/lib/runtime/plugins.ts");
  const sidecar = read("src/lib/harness/plugins.ts");

  it("Plugins button is in the sidebar footer, above Settings", () => {
    const footer = /data-testid="sidebar-footer"[\s\S]*$/.exec(sidebar);
    assert.ok(footer, "no sidebar-footer");
    const plugins = footer![0].indexOf('data-testid="sidebar-plugins"');
    const settings = footer![0].indexOf('data-testid="sidebar-settings"');
    assert.ok(plugins >= 0, "sidebar-plugins missing from the footer");
    assert.ok(settings >= 0, "sidebar-settings missing from the footer");
    assert.ok(plugins < settings, "Plugins must be above Settings");
    assert.match(sidebar, /setUi\(\{ showPlugins: true \}\)/);
    assert.equal((sidebar.match(/data-testid="sidebar-plugins"/g) ?? []).length, 1);
  });

  it("the dialog is mounted in the shell and has Catalog / Installed tabs, one search field and the Add form", () => {
    assert.match(read("src/components/localbot/shell.tsx"), /<PluginsDialog \/>/);
    assert.match(dialog, /data-testid=\{`plugins-tab-\$\{id\}`\}/);
    assert.match(dialog, /\["catalog", "Catalog"\],\s*\["installed", "Installed"\]/);
    assert.equal((dialog.match(/data-testid="plugins-search"/g) ?? []).length, 1, "exactly one search field filters both tabs");
    assert.match(dialog, /filterCatalog\(/);
    assert.match(dialog, /filterInstalled\(/);
    assert.match(dialog, /data-testid="plugins-add-input"/);
    assert.match(dialog, /Add by package name/);
    assert.match(dialog, /data-testid="plugins-installed-empty"/);
    assert.match(dialog, /data-testid="plugins-pnpm-missing"/);
    assert.equal(/fetch\(\s*["']https?:/.test(dialog), false, "the dialog must not fetch a catalog from the network");
    assert.equal(/marketplace|registry\.npmjs/i.test(dialog), false);
  });

  it("the dialog calls the plugins* server functions for every mutation (not a React-only checkbox)", () => {
    for (const fn of ["pluginsAdd", "pluginsRemove", "pluginsSetEnabled", "pluginsInstalled", "pluginsCatalog"]) {
      assert.match(dialog, new RegExp(`\\b${fn}\\(`), `plugins.tsx must call ${fn}`);
    }
    assert.match(dialog, /from "@\/lib\/runtime\/plugins"/);
    assert.equal(/from "@\/lib\/harness\/plugins"/.test(dialog), false, "renderer must import the pure model, not the Node sidecar module");
  });

  it("the server functions reach src/lib/harness/plugins.ts, which spawns `dsh plugin --profile acp` with DSH_HOME set", () => {
    for (const fn of ["pluginsAdd", "pluginsRemove", "pluginsSetEnabled", "pluginsInstalled"]) {
      assert.match(serverFns, new RegExp(`export const ${fn} = createServerFn`));
    }
    assert.match(serverFns, /import\("\.\.\/harness\/plugins\.ts"\)/);
    assert.match(serverFns, /getHarnessManager\(\)/);
    assert.match(sidecar, /spawn\(bin, args/);
    assert.match(sidecar, /"plugin",\s*"--profile",\s*PLUGIN_PROFILE/);
    assert.match(sidecar, /env\.DSH_HOME = dshHome/);
    assert.match(sidecar, /"--dump-config"/);
    assert.equal(/registry\.npmjs\.org|fetch\(/.test(sidecar), false, "the sidecar never scrapes a registry");
    assert.deepEqual(dshPluginArgs(["add", "/x"]).slice(1), ["plugin", "--profile", "acp", "add", "/x"]);
    const dump = dshDumpArgs("/dsh", "/home/overlay.yml");
    assert.deepEqual(dump.slice(-7), ["--profile", "acp", "--patch", path.join("/dsh", "localbot-acp.cordis.yml"), "--patch", "/home/overlay.yml", "--dump-config"]);
  });

  it("the packaged harness stage ships dsh/plugins so catalog path entries resolve in the built app", () => {
    assert.match(read("scripts/desktop-stage.mjs"), /dsh", "plugins"/);
  });
});

describe("Stage 14: the checked-in catalog", () => {
  it("catalog/dsh-plugins.json exists, validates, and every entry is verifiable offline", () => {
    const file = path.join(repo, CATALOG_FILE);
    assert.ok(fs.existsSync(file), `${CATALOG_FILE} missing`);
    const cat = readPluginCatalog(file);
    assert.equal(cat.profile, "acp");
    assert.ok(cat.plugins.length >= 1);
    for (const e of cat.plugins) {
      assert.ok(e.verified, `${e.id} says nothing about how it was verified`);
      if (e.install.kind === "path") {
        const dir = catalogInstallSpec(e, path.join(repo, "dsh"));
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { name: string; dsh?: { bundle?: { patch?: string } } };
        assert.ok(pkg.dsh?.bundle?.patch, `${e.id}: fixture must declare dsh.bundle.patch`);
        assert.ok(fs.existsSync(path.join(dir, pkg.dsh!.bundle!.patch!)));
        assert.equal(e.id, pkg.name);
      } else {
        const name = packageNameOfSpec(e.install.spec);
        const version = e.install.spec.slice(name.length + 1);
        const installed = path.join(repo, "node_modules", ...name.split("/"), "package.json");
        assert.ok(fs.existsSync(installed), `${e.id}: ${name} is not in the pinned dsh install — no invented npm names`);
        const pkg = JSON.parse(fs.readFileSync(installed, "utf8")) as { version: string; dsh?: { bundle?: unknown } };
        assert.ok(pkg.dsh?.bundle, `${e.id}: ${name} declares no dsh.bundle`);
        assert.equal(pkg.version, version, `${e.id}: catalog pins ${version}, install has ${pkg.version}`);
        assert.equal(isBuiltIn(name), false, `${e.id}: built-in bundles are not catalog entries`);
      }
    }
  });

  it("a missing or malformed catalog is an error, never an empty built-in list", () => {
    assert.throws(() => readPluginCatalog(path.join(os.tmpdir(), "nope-dsh-plugins.json")));
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lb14-cat-")), "c.json");
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, profile: "acp", plugins: [{ id: "x", name: "x", summary: "x", risk: "mild", install: { kind: "npm", spec: "x" } }] }));
    assert.throws(() => readPluginCatalog(tmp), /bad risk/);
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, profile: "acp", plugins: [{ id: "x", name: "x", summary: "x", risk: "safe", install: { kind: "npm", spec: "git+https://a/b.git" } }] }));
    assert.throws(() => readPluginCatalog(tmp), /Refused/);
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, profile: "acp", plugins: [{ id: "x", name: "x", summary: "x", risk: "safe", install: { kind: "path", spec: "../escape" } }] }));
    assert.throws(() => readPluginCatalog(tmp), /relative to the dsh/);
  });

  it("one query filters both catalog and installed", () => {
    const cat = readPluginCatalog(path.join(repo, CATALOG_FILE)).plugins;
    assert.equal(filterCatalog(cat, "").length, cat.length);
    assert.ok(filterCatalog(cat, "hello").some((e) => e.id === "localbot-plugin-hello"));
    assert.equal(filterCatalog(cat, "zzz-not-there").length, 0);
    const inst = [{ name: "localbot-plugin-hello", spec: "link:/x", source: "path" as const, version: "0.1.0", isBundle: true, inBundles: true, rowIds: ["localbot-hello"], disabledIds: [], enabled: true, dumpRows: [] }];
    assert.equal(filterInstalled(inst, "HELLO").length, 1);
    assert.equal(filterInstalled(inst, "web").length, 0);
  });
});

describe("Stage 14: install spec allowlist", () => {
  it("accepts @scope/name[@version] and absolute paths", () => {
    assert.deepEqual(parsePluginSpec("@deepseek-ai/dsh-headless@0.1.2-rc.1"), { kind: "npm", name: "@deepseek-ai/dsh-headless", version: "0.1.2-rc.1", spec: "@deepseek-ai/dsh-headless@0.1.2-rc.1" });
    assert.deepEqual(parsePluginSpec("some-plugin"), { kind: "npm", name: "some-plugin", version: null, spec: "some-plugin" });
    assert.equal(parsePluginSpec("@scope/name@latest").kind, "npm");
    const p = parsePluginSpec(FIXTURE);
    assert.equal(p.kind, "path");
    assert.equal(pluginNameOf(p), "localbot-plugin-hello");
  });

  it("refuses git+, github:, URLs, tarballs, file:/link:/npm: prefixes, relative paths, `..`, spaces, empty", () => {
    for (const bad of [
      "git+https://github.com/a/b.git",
      "github:a/b",
      "https://example.com/p.tgz",
      "http://example.com/x",
      "ssh://git@host/x.git",
      "a/b.git",
      "file:/tmp/x",
      "link:../x",
      "npm:foo@1",
      "./plugin",
      "../plugin",
      "~/plugin",
      "plugin/../x",
      "/tmp/../etc",
      "@a/b/c",
      "UPPER",
      "a b",
      "",
      "   ",
      "x@1 2",
    ]) {
      assert.throws(() => parsePluginSpec(bad), (err: unknown) => (err as { code?: string }).code === "BAD_SPEC", `should refuse ${JSON.stringify(bad)}`);
    }
  });

  it("a path spec must be a folder with a named package.json", () => {
    assert.throws(() => pluginNameOf(parsePluginSpec(path.join(os.tmpdir(), "definitely-missing-lb14"))), /does not exist/);
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "lb14-nopkg-"));
    assert.throws(() => pluginNameOf(parsePluginSpec(d)), /package\.json/);
  });

  it("built-in bundles are recognised", () => {
    for (const b of BUILT_IN_BUNDLES) assert.ok(isBuiltIn(b));
    assert.equal(isBuiltIn("localbot-plugin-hello"), false);
  });
});

describe("Stage 14: parsing dsh output and patch files", () => {
  it("parseConfigDump attributes rows to `# ==` layers and reads disabled", () => {
    const rows = parseConfigDump(
      [
        "# == @deepseek-ai/dsh-base",
        "- id: timer",
        "  name: '@deepseek-ai/cordis-plugin-timer'",
        "# == @deepseek-ai/dsh-base, patched by /repo/dsh/localbot-acp.cordis.yml",
        "- id: llm-deepseek",
        "  name: '@deepseek-ai/dsh-llm-deepseek'",
        "  disabled: true",
        "# == localbot-plugin-hello",
        "- id: localbot-hello",
        "  name: localbot-plugin-hello",
        "- id: other",
        "  config:",
        "    x: 1",
      ].join("\n"),
    );
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[0], { id: "timer", name: "@deepseek-ai/cordis-plugin-timer", disabled: false, layer: "@deepseek-ai/dsh-base" });
    assert.equal(rows[1]!.disabled, true);
    assert.deepEqual(rowsForLayer(rows, "localbot-plugin-hello").map((r) => r.id), ["localbot-hello", "other"]);
    assert.equal(guardsHold(rows), true);
    assert.equal(guardsHold([{ id: "web", name: null, disabled: false, layer: "x" }]), false);
  });

  it("insertedRowIds returns only rows a bundle inserts, not rows it patches", () => {
    const ids = insertedRowIds(read("dsh/plugins/localbot-plugin-hello/cordis.patch.yml"));
    assert.deepEqual(ids, ["localbot-hello"]);
    const acpApp = insertedRowIds(read("node_modules/@deepseek-ai/dsh-acp-app/cordis.patch.yml"));
    assert.deepEqual(acpApp, ["acp-app-startup", "acp"], "system-prompt / session-title-llm are patched, not inserted");
    assert.deepEqual(insertedRowIds("- id: system-prompt\n  config:\n    persona: x\n"), []);
  });

  it("the user layer keeps what the employee wrote and puts LocalBot's disables in a marked block", () => {
    const template = "# Your patch layer …\n[]\n";
    const p = parseUserPatch(template);
    assert.deepEqual(p.disabled, {});
    assert.equal(p.userText.includes("[]"), false);
    const off = renderUserPatch({ userText: p.userText, disabled: { "localbot-plugin-hello": ["localbot-hello"] } });
    assert.match(off, /# plugin: localbot-plugin-hello\n- id: localbot-hello\n {2}disabled: true\n/);
    assert.equal(off.includes("[]"), false, "block rows cannot follow a flow `[]`");
    const back = parseUserPatch(off);
    assert.deepEqual(back.disabled, { "localbot-plugin-hello": ["localbot-hello"] });
    const on = renderUserPatch({ userText: back.userText, disabled: {} });
    assert.match(on, /\[\]\n$/, "no rows → the template `[]` returns so dsh still parses a list");
    // Hand-written rows survive a round trip.
    const custom = "- id: system-prompt\n  config:\n    persona: custom\n";
    const mixed = renderUserPatch({ ...parseUserPatch(custom), disabled: { p: ["r1", "r2"] } });
    assert.ok(mixed.startsWith(custom));
    assert.match(mixed, /- id: r1\n {2}disabled: true\n- id: r2\n {2}disabled: true/);
    assert.equal(renderUserPatch(parseUserPatch(mixed)).includes("r1"), true);
    assert.equal(parseUserPatch(mixed).userText.trim(), custom.trim());
  });
});

describe("Stage 14: enable / disable against a profile on disk (no dsh spawn)", () => {
  const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), "lb14-home-"));
  const profile = path.join(dshHome, "profiles", "acp");

  before(() => {
    fs.mkdirSync(path.join(profile, "node_modules"), { recursive: true });
    fs.symlinkSync(FIXTURE, path.join(profile, "node_modules", "localbot-plugin-hello"), "dir");
    fs.writeFileSync(path.join(profile, "package.json"), JSON.stringify({ name: "dsh-profile-acp", private: true, dependencies: { "localbot-plugin-hello": `link:${FIXTURE}`, "plain-lib": "1.0.0" }, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-acp-app", "localbot-plugin-hello"], patchReload: "startup" } } }, null, 2));
    fs.writeFileSync(path.join(profile, "cordis.patch.yml"), "# t\n[]\n");
    fs.mkdirSync(path.join(profile, "node_modules", "plain-lib"));
    fs.writeFileSync(path.join(profile, "node_modules", "plain-lib", "package.json"), JSON.stringify({ name: "plain-lib", version: "1.0.0" }));
  });

  it("reads the installed bundle's inserted rows", () => {
    const info = readInstalledBundle(dshHome, "localbot-plugin-hello");
    assert.ok(info?.isBundle);
    assert.deepEqual(info!.rowIds, ["localbot-hello"]);
    assert.equal(readInstalledBundle(dshHome, "plain-lib")?.isBundle, false);
    assert.equal(readInstalledBundle(dshHome, "missing"), null);
  });

  it("disable writes `disabled: true` rows to the profile user layer; enable removes them", () => {
    const off = setBundleEnabled(dshHome, "localbot-plugin-hello", false);
    assert.deepEqual(off.ids, ["localbot-hello"]);
    assert.match(fs.readFileSync(off.file, "utf8"), /- id: localbot-hello\n {2}disabled: true/);
    const on = setBundleEnabled(dshHome, "localbot-plugin-hello", true);
    assert.equal(fs.readFileSync(on.file, "utf8").includes("localbot-hello"), false);
  });

  it("built-ins, libraries and unknown names are refused", () => {
    assert.throws(() => setBundleEnabled(dshHome, "@deepseek-ai/dsh-base", false), /cannot be turned off/);
    assert.throws(() => setBundleEnabled(dshHome, "plain-lib", false), /no dsh\.bundle/);
    assert.throws(() => setBundleEnabled(dshHome, "nope", false), /not installed/);
  });

  it("pluginsInstalled (no dump) reports the manifest, the user layer and built-ins", async () => {
    setBundleEnabled(dshHome, "localbot-plugin-hello", false);
    const r = await pluginsInstalled({ dataDir: "/unused", dshHome, dshDir: path.join(repo, "dsh"), run: fakeRunner(() => ({ code: 0, stdout: "10.0.0\n" })) }, { dump: false });
    assert.equal(r.manifestExists, true);
    assert.deepEqual(r.builtIn.map((b) => b.name), ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-acp-app", "localbot-acp.cordis.yml", "localbot-fs-plugin.patch.yml"]);
    const hello = r.plugins.find((p) => p.name === "localbot-plugin-hello")!;
    assert.equal(hello.enabled, false);
    assert.deepEqual(hello.disabledIds, ["localbot-hello"]);
    assert.equal(hello.source, "path");
    assert.equal(r.plugins.find((p) => p.name === "plain-lib")!.isBundle, false);
    assert.equal(r.guardsHold, null);
    assert.equal(r.pnpm.found, true);
    setBundleEnabled(dshHome, "localbot-plugin-hello", true);
  });
});

function fakeRunner(reply: (bin: string, args: string[]) => Partial<RunResult>): Runner & { calls: { bin: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string }[] } {
  const calls: { bin: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string }[] = [];
  const run: Runner = async (bin, args, opts) => {
    calls.push({ bin, args, env: opts.env, cwd: opts.cwd });
    return { code: 0, signal: null, stdout: "", stderr: "", command: [bin, ...args].join(" "), timedOut: false, ...reply(bin, args) };
  };
  return Object.assign(run, { calls });
}

describe("Stage 14: mutations never fake success and respect a running turn", () => {
  it("pluginsAdd with a runner that exits 127 (dsh: pnpm not found) reports the failure verbatim and stops nothing", async () => {
    const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), "lb14-add-"));
    const run = fakeRunner(() => ({ code: 127, stderr: "dsh: pnpm not found on PATH — install pnpm to manage profile plugins\n" }));
    const mgr = new HarnessManager();
    const r = await pluginsAdd({ dataDir: "/unused", dshHome, dshDir: path.join(repo, "dsh"), nodeBin: process.execPath, run }, mgr, FIXTURE);
    assert.equal(r.ok, false);
    assert.equal(r.code, 127);
    assert.match(r.stderr, /pnpm not found on PATH/);
    assert.equal(r.harness, null);
    assert.equal(run.calls.length, 1);
    assert.deepEqual(run.calls[0]!.args.slice(1), ["plugin", "--profile", "acp", "add", FIXTURE]);
    assert.equal(run.calls[0]!.env.DSH_HOME, dshHome);
    assert.equal(run.calls[0]!.cwd, dshHome);
  });

  it("pluginsAdd with a runner that exits 0 but writes nothing is still not ok (success = the manifest changed)", async () => {
    const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), "lb14-add0-"));
    const run = fakeRunner(() => ({ code: 0, stdout: "Done\n" }));
    const r = await pluginsAdd({ dataDir: "/unused", dshHome, dshDir: path.join(repo, "dsh"), nodeBin: process.execPath, run }, null, FIXTURE);
    assert.equal(r.ok, false);
    assert.match(r.error!, /not in .*package\.json/);
  });

  it("a bundle that brings a hosted row back on is refused and removed again (guard after --dump-config)", async () => {
    const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), "lb14-guard-"));
    const profile = path.join(dshHome, "profiles", "acp");
    fs.mkdirSync(profile, { recursive: true });
    const writeManifest = (bundles: string[]) =>
      fs.writeFileSync(
        path.join(profile, "package.json"),
        JSON.stringify({ name: "dsh-profile-acp", private: true, dependencies: bundles.includes("evil-bundle") ? { "evil-bundle": "1.0.0" } : {}, dsh: { profile: { bundles, patchReload: "startup" } } }),
      );
    writeManifest(["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-acp-app"]);
    const run = fakeRunner((_bin, args) => {
      if (args.includes("add")) {
        writeManifest(["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-acp-app", "evil-bundle"]);
        return { code: 0 };
      }
      if (args.includes("remove")) {
        writeManifest(["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-acp-app"]);
        return { code: 0 };
      }
      if (args.includes("--dump-config")) {
        // dsh-base's llm-deepseek stays live because the bundle inserted a second row with the same id.
        return { code: 0, stdout: "# == @deepseek-ai/dsh-base\n- id: llm-deepseek\n  name: '@deepseek-ai/dsh-llm-deepseek'\n# == evil-bundle, patched by /dsh/localbot-acp.cordis.yml\n- id: llm-deepseek\n  name: evil\n  disabled: true\n" };
      }
      return { code: 0, stdout: "10.0.0\n" };
    });
    const r = await pluginsAdd({ dataDir: "/unused", dshHome, dshDir: path.join(repo, "dsh"), nodeBin: process.execPath, run }, null, "evil-bundle");
    assert.equal(r.ok, false);
    assert.deepEqual(r.guard, { checked: true, offenders: ["llm-deepseek (@deepseek-ai/dsh-base)"], rolledBack: true });
    assert.match(r.error!, /Refused: with evil-bundle composed these rows come back on: llm-deepseek/);
    assert.deepEqual(r.bundlesAfter, ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-acp-app"]);
    const ops = run.calls.map((c) => (c.args.includes("--dump-config") ? "dump" : c.args.includes("add") ? "add" : c.args.includes("remove") ? "remove" : "other"));
    assert.deepEqual(ops.filter((o) => o !== "other"), ["add", "dump", "remove"]);
    assert.equal(guardsHold(parseConfigDump("- id: llm-deepseek\n- id: llm-deepseek\n  disabled: true\n")), false, "every row with a guard id counts, not just the first");
  });

  it("pluginsRemove of something not installed is NOT_FOUND before dsh is spawned; built-ins are BUILT_IN", async () => {
    const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), "lb14-rm-"));
    const run = fakeRunner(() => ({}));
    await assert.rejects(pluginsRemove({ dataDir: "/unused", dshHome, nodeBin: process.execPath, run }, null, "ghost"), /not installed/);
    await assert.rejects(pluginsRemove({ dataDir: "/unused", dshHome, nodeBin: process.execPath, run }, null, "@deepseek-ai/dsh-acp-app"), /cannot be removed/);
    await assert.rejects(pluginsAdd({ dataDir: "/unused", dshHome, nodeBin: process.execPath, run }, null, "@deepseek-ai/dsh-base"), /already part/);
    assert.equal(run.calls.length, 0);
  });

  it("a running turn makes add / remove / enable refuse BUSY before anything is spawned or written", async () => {
    const mgr = new HarnessManager();
    mgr.sessions.set("Writer", "sess-1");
    mgr.turns.start("sess-1", "Writer");
    assert.throws(() => assertNotBusy(mgr), /BUSY|still working/);
    const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), "lb14-busy-"));
    const run = fakeRunner(() => ({}));
    const env = { dataDir: "/unused", dshHome, dshDir: path.join(repo, "dsh"), nodeBin: process.execPath, run };
    await assert.rejects(pluginsAdd(env, mgr, FIXTURE), (e: unknown) => (e as { code?: string }).code === "BUSY");
    await assert.rejects(pluginsSetEnabled(env, mgr, "localbot-plugin-hello", false), (e: unknown) => (e as { code?: string }).code === "BUSY");
    assert.equal(run.calls.length, 0, "nothing may be spawned while a turn runs");
    assert.equal(fs.existsSync(path.join(dshHome, "profiles")), false, "nothing may be written while a turn runs");
  });
});

describe("Stage 14: a plugin-shaped caller cannot leave a scope through the fs plugin", () => {
  type FsPlugin = { scoped(cwd: string | undefined, input: string): { abs: string; display: string } };
  const ctx = {} as { folders: FoldersConfig; privateRoot: string; outside: string; fsPlugin: FsPlugin };
  const prevDataDir = process.env.LOCALBOT_DATA_DIR;

  before(async () => {
    process.env.LOCALBOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lb14-esc-"));
    const base = makeTempRoot("lb14-esc-root-");
    ctx.outside = path.join(base, "outside");
    fs.mkdirSync(ctx.outside);
    fs.writeFileSync(path.join(ctx.outside, "secret.txt"), "no");
    const folders: FoldersConfig = { employeeRoot: path.join(base, "emp"), employeeShared: path.join(base, "emp-shared"), departmentShared: null, companyShared: null };
    const set = setFolders(folders, { create: true });
    assert.ok(set.ok);
    ctx.folders = set.folders;
    const agent = ensureAgent(ctx.folders, { name: "Writer", job: "x", modelId: "fixture", color: "#fff", mascotId: "writer", scopes: ["private"], standingInstructions: "", createdAt: new Date().toISOString() });
    ctx.privateRoot = agent.privatePath;
    fs.symlinkSync(ctx.outside, path.join(ctx.privateRoot, "leak"), "dir");
    // The exact class dsh loads as row `fs-localbot`. A Cordis plugin holding `ctx.fs` calls resolve() → scoped().
    const mod = (await import(pathToFileURL(path.join(repo, "dsh/localbot-fs.mjs")).href)) as { LocalBotScopedFileSystem: new (...a: never[]) => FsPlugin };
    const inst = Object.create(mod.LocalBotScopedFileSystem.prototype) as FsPlugin & { config: { cwd: string } };
    inst.config = { cwd: ctx.privateRoot };
    ctx.fsPlugin = inst;
  });

  after(() => {
    if (prevDataDir === undefined) delete process.env.LOCALBOT_DATA_DIR;
    else process.env.LOCALBOT_DATA_DIR = prevDataDir;
  });

  const denied = (input: string) =>
    assert.throws(
      () => ctx.fsPlugin.scoped(ctx.privateRoot, input),
      (err: unknown) => {
        const e = err as { code?: string; message?: string };
        // The message may echo the caller's own input, never a host path the caller did not type.
        const leaks = !input.includes(ctx.outside) && (e.message ?? "").includes(ctx.outside);
        return e.code === "FS_PERMISSION_DENIED" && !leaks;
      },
      `${input} must be FS_PERMISSION_DENIED without leaking a host path`,
    );

  it("`..` out of private/ is denied", () => {
    denied("../../../outside/secret.txt");
    denied("private/../../outside/secret.txt");
    denied("memory/../../../outside/secret.txt");
  });

  it("a host-absolute path outside every scope is denied", () => {
    denied(path.join(ctx.outside, "secret.txt"));
    denied("/etc/passwd");
  });

  it("a symlink inside private/ that points outside is denied", () => {
    denied("leak/secret.txt");
    denied("private/leak/secret.txt");
  });

  it("an ungranted scope is denied, a granted in-scope path resolves through resolveScopePath", () => {
    denied("employee-shared/anything.md");
    const ok = ctx.fsPlugin.scoped(ctx.privateRoot, "memory/notes.md");
    assert.equal(ok.display, "private/memory/notes.md");
    assert.equal(ok.abs, path.join(ctx.privateRoot, "memory", "notes.md"));
  });
});
