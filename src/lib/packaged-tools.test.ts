/**
 * Stage 20 — packaged runtime completeness. Every gate in
 * scripts/packaged-tools-gates.mjs is one test here, plus behaviour tests for
 * the pieces the gates only read: the bundled-pnpm lookup / PATH prepend /
 * NO_PNPM refusal, `pnpmStatus`, the packaged.mjs env, and
 * `seedWhisperFromResources` on darwin-arm64 fixtures. The staging side
 * (stagePnpm, the shims on a bundled Node with an EMPTY PATH, the whisper bake
 * check) is covered by scripts/desktop-stage.test.mjs. `npm test` fails the
 * moment `pluginsAdd` would need a pnpm from the employee's PATH in packaged
 * mode, or the Mic's built branch can only say "compile with cmake" again.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { PNPM_PIN, packagedToolsGates } from "../../scripts/packaged-tools-gates.mjs";
import { harnessResourcePaths, packagedHarnessEnv } from "../../desktop/packaged.mjs";
import { HarnessManager } from "./harness/index.ts";
import {
  PluginError,
  pathKeyOf,
  pluginsAdd,
  pluginsInstalled,
  pnpmChildEnv,
  pnpmLookup,
  pnpmStatus,
  type RunResult,
  type Runner,
} from "./harness/plugins.ts";
import {
  WHISPER_BUILD_MANIFEST,
  seedWhisperFromResources,
  whisperResourceDir,
  whisperRuntimeAsset,
  verifyBuiltWhisper,
} from "./runtime/stt.ts";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const results = packagedToolsGates(root);
const FIXTURE = path.join(root, "dsh/plugins/localbot-plugin-hello");

function fakeRunner(
  reply: (bin: string, args: string[]) => Partial<RunResult>,
): Runner & { calls: { bin: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string }[] } {
  const calls: { bin: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string }[] = [];
  const run: Runner = async (bin, args, opts) => {
    calls.push({ bin, args, env: opts.env, cwd: opts.cwd });
    return {
      code: 0,
      signal: null,
      stdout: "",
      stderr: "",
      command: [bin, ...args].join(" "),
      timedOut: false,
      ...reply(bin, args),
    };
  };
  return Object.assign(run, { calls });
}

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("Stage 20 — packaged-tools gates on this tree", () => {
  it("produced gates", () => {
    assert.ok(results.length > 60, `expected a full gate list, got ${results.length}`);
  });
  for (const r of results) {
    it(r.label, () => {
      assert.equal(r.ok, true, r.label);
    });
  }
});

describe("Stage 20 — the gates themselves catch a regression", () => {
  function scratch(): string {
    const dir = tmp("lb-pt-");
    const write = (p: string, s: string) => {
      fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
      fs.writeFileSync(path.join(dir, p), s);
    };
    const copy = (p: string) => write(p, read(p));
    for (const p of [
      "package.json",
      "node_modules/pnpm/package.json",
      "node_modules/pnpm/dist/pnpm.cjs",
      "node_modules/pnpm/bin/pnpm.cjs",
      "node_modules/pnpm/LICENSE",
      "scripts/desktop-stage.mjs",
      "scripts/build-desktop.mjs",
      "scripts/excise-gates.mjs",
      "scripts/prove-excise.mjs",
      "desktop/packaged.mjs",
      "desktop/main.mjs",
      "desktop/quit-flush.mjs",
      "desktop/sidecar-token.mjs",
      "src/lib/harness/plugins.ts",
      "src/lib/harness/process.ts",
      "src/lib/plugins-model.ts",
      "src/lib/runtime/stt.ts",
      "src/lib/runtime/sidecar-token-middleware.ts",
      "src/components/localbot/plugins.tsx",
      "src/components/localbot/chat.tsx",
      "src/start.ts",
      "dsh/localbot-fs.mjs",
      "catalog/whisper-assets.json",
    ]) {
      copy(p);
    }
    return dir;
  }
  const failing = (dir: string) =>
    packagedToolsGates(dir)
      .filter((r) => !r.ok)
      .map((r) => r.label);
  const edit = (dir: string, p: string, fn: (s: string) => string) =>
    fs.writeFileSync(path.join(dir, p), fn(fs.readFileSync(path.join(dir, p), "utf8")));
  const editJson = (dir: string, p: string, fn: (j: Record<string, unknown>) => void) => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, p), "utf8"));
    fn(j);
    fs.writeFileSync(path.join(dir, p), JSON.stringify(j, null, 2));
  };

  it("a faithful scratch copy passes every gate", () => {
    const dir = scratch();
    assert.deepEqual(failing(dir), []);
  });

  it("a floating pnpm pin, or none, fails", () => {
    const dir = scratch();
    editJson(
      dir,
      "package.json",
      (j) => ((j.devDependencies as Record<string, string>).pnpm = "^10.0.0"),
    );
    assert.ok(failing(dir).some((l) => l.startsWith("pnpm pin is exact")));
    editJson(dir, "package.json", (j) => delete (j.devDependencies as Record<string, string>).pnpm);
    assert.ok(failing(dir).some((l) => l.startsWith("pnpm pin is exact")));
  });

  it("dropping either extraResources row fails; adding a GGUF / llama row fails", () => {
    const dir = scratch();
    editJson(dir, "package.json", (j) => {
      const b = j.build as { extraResources: { from: string }[] };
      b.extraResources = b.extraResources.filter((r) => r.from !== "dist/desktop-pnpm");
    });
    assert.ok(failing(dir).some((l) => l.includes("dist/desktop-pnpm")));
    const dir2 = scratch();
    editJson(dir2, "package.json", (j) => {
      const b = j.build as { extraResources: { from: string }[] };
      b.extraResources = b.extraResources.filter((r) => r.from !== "dist/desktop-whisper");
    });
    assert.ok(failing(dir2).some((l) => l.includes("dist/desktop-whisper")));
    const dir3 = scratch();
    editJson(dir3, "package.json", (j) => {
      const b = j.build as { extraResources: { from: string; to: string }[] };
      b.extraResources.push({ from: "dist/desktop-llama-runtimes", to: "localbot-llama" });
    });
    assert.ok(failing(dir3).some((l) => l.includes("no GGUF / llama.cpp")));
    fs.mkdirSync(path.join(dir3, "dist/desktop-pnpm"), { recursive: true });
    fs.writeFileSync(path.join(dir3, "dist/desktop-pnpm/qwen.gguf"), "x");
    assert.ok(failing(dir3).some((l) => l.includes("holds a .gguf")));
  });

  it("mac.identity !== null fails", () => {
    const dir = scratch();
    editJson(
      dir,
      "package.json",
      (j) =>
        ((j.build as { mac: { identity: unknown } }).mac.identity = "Developer ID Application: X"),
    );
    assert.ok(failing(dir).some((l) => l.startsWith("build.mac.identity is null")));
  });

  it("plugins.ts: losing the PATH prepend, the NO_PNPM refusal, the store dir, or the bundled-first status fails", () => {
    const dir = scratch();
    edit(dir, "src/lib/harness/plugins.ts", (s) =>
      s.replace(
        "env[key] = current ? `${lookup.dir}${delimiter}${current}` : lookup.dir;",
        "/* no prepend */",
      ),
    );
    assert.ok(failing(dir).some((l) => l.includes("prepended to the child's PATH")));
    const dir2 = scratch();
    edit(dir2, "src/lib/harness/plugins.ts", (s) =>
      s.replace(
        'if (needsPnpm && pnpm.kind === "missing") throw new PluginError("NO_PNPM", pnpm.error);',
        "",
      ),
    );
    assert.ok(failing(dir2).some((l) => l.includes("throws NO_PNPM before dsh is spawned")));
    const dir3 = scratch();
    edit(dir3, "src/lib/harness/plugins.ts", (s) =>
      s.replace('env.npm_config_store_dir = path.join(dshHome, "pnpm-store");', ""),
    );
    assert.ok(failing(dir3).some((l) => l.includes("npm_config_store_dir")));
    const dir4 = scratch();
    edit(dir4, "src/lib/harness/plugins.ts", (s) =>
      s.replace(
        'run(lookup.bin, ["--version"]',
        'run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--version"]',
      ),
    );
    const f4 = failing(dir4);
    assert.ok(f4.some((l) => l.includes("probes the bundled shim first")));
    assert.ok(f4.some((l) => l.includes("never spawns a bare pnpm")));
  });

  it("stt.ts: a built branch that only verifies (back to 'compile with cmake') fails; a cmake spawn fails", () => {
    const dir = scratch();
    edit(dir, "src/lib/runtime/stt.ts", (s) =>
      s.replace(
        "const seed = seedWhisperFromResources({ target, asset, from: whisperResourceDir(), to: dir });\n",
        "",
      ),
    );
    assert.ok(failing(dir).some((l) => l.includes("seeds before it can say NOT_BUILT")));
    const dir2 = scratch();
    edit(
      dir2,
      "src/lib/runtime/stt.ts",
      (s) => s + '\nchildProcess.spawnSync("cmake", ["--build", "."]);\n',
    );
    assert.ok(failing(dir2).some((l) => l.includes("never spawns cmake")));
    const dir3 = scratch();
    edit(dir3, "src/lib/runtime/stt.ts", (s) =>
      s.replace('if (have.ok) return { seeded: false, reason: "already-valid", error: null };', ""),
    );
    assert.ok(failing(dir3).some((l) => l.includes("never overwrites a valid AppData copy")));
  });

  it("plugins.tsx: the old 'does not bundle pnpm' sentence fails", () => {
    const dir = scratch();
    edit(dir, "src/components/localbot/plugins.tsx", (s) =>
      s.replace(
        "Enable / Disable and this list still work.",
        "This packaged LocalBot does not bundle pnpm. Enable / Disable and this list still work.",
      ),
    );
    assert.ok(failing(dir).some((l) => l.includes('"does not bundle pnpm"')));
  });

  it("packaged.mjs / main.mjs: dropping LOCALBOT_PNPM_DIR or LOCALBOT_WHISPER_DIR fails", () => {
    const dir = scratch();
    edit(dir, "desktop/packaged.mjs", (s) =>
      s.replace(
        "if (has(`${p.pnpmDir}/${pnpmShimName(platform)}`)) env.LOCALBOT_PNPM_DIR = p.pnpmDir;",
        "",
      ),
    );
    assert.ok(
      failing(dir).some((l) => l.includes("sets LOCALBOT_PNPM_DIR only when the shim exists")),
    );
    const dir2 = scratch();
    edit(dir2, "desktop/packaged.mjs", (s) =>
      s.replace("env.LOCALBOT_WHISPER_DIR = p.whisperDir;", "void 0;"),
    );
    assert.ok(failing(dir2).some((l) => l.includes("sets LOCALBOT_WHISPER_DIR")));
    const dir3 = scratch();
    edit(dir3, "desktop/main.mjs", (s) => s.replace(/LOCALBOT_PNPM_DIR/g, "X"));
    assert.ok(failing(dir3).some((l) => l.includes("main.mjs reports a missing")));
  });

  it("build-desktop.mjs: skipping the pnpm stage, the empty-PATH shim check, or the whisper stage fails", () => {
    const dir = scratch();
    edit(dir, "scripts/build-desktop.mjs", (s) =>
      s.replace(
        "stagePnpm({ root, stage: pnpmStageRoot, pin: pnpmPin })",
        "({ shim: '', cmd: '' })",
      ),
    );
    assert.ok(failing(dir).some((l) => l.includes("stages pnpm from the exact pin")));
    const dir2 = scratch();
    edit(dir2, "scripts/build-desktop.mjs", (s) =>
      s.replace("stagedPnpmVersion !== pnpmPin", "false"),
    );
    assert.ok(failing(dir2).some((l) => l.includes("empty PATH")));
    const dir3 = scratch();
    edit(dir3, "scripts/build-desktop.mjs", (s) =>
      s.replace('whisperTarget === "darwin-arm64"', "false"),
    );
    assert.ok(failing(dir3).some((l) => l.includes("stages whisper-cli on darwin-arm64")));
  });

  it("the earlier-stage invariants still flip: runAgentTurn, token gate, quit coordinator, pins, localbot-fs.mjs", () => {
    const dir = scratch();
    edit(dir, "src/components/localbot/chat.tsx", (s) =>
      s.replace(/runAgentTurn/g, "runSomethingElse"),
    );
    assert.ok(failing(dir).some((l) => l === "chat.tsx keeps runAgentTurn"));
    const dir2 = scratch();
    edit(dir2, "src/start.ts", (s) =>
      s.replace("functionMiddleware: [sidecarTokenMiddleware]", "functionMiddleware: []"),
    );
    assert.ok(failing(dir2).some((l) => l.includes("Stage 17 token gate")));
    const dir3 = scratch();
    edit(dir3, "desktop/main.mjs", (s) => s.replace(/createQuitCoordinator\(/g, "noCoordinator("));
    assert.ok(failing(dir3).some((l) => l.includes("Stage 18 quit coordinator")));
    const dir4 = scratch();
    editJson(
      dir4,
      "package.json",
      (j) => ((j.dependencies as Record<string, string>)["@deepseek-ai/dsh"] = "^0.1.2-alpha.5"),
    );
    assert.ok(failing(dir4).some((l) => l.startsWith("dsh pin is exact")));
    const dir5 = scratch();
    fs.appendFileSync(path.join(dir5, "dsh/localbot-fs.mjs"), "\n// changed\n");
    assert.ok(failing(dir5).some((l) => l.includes("localbot-fs.mjs unchanged")));
  });
});

describe("Stage 20 — bundled pnpm: lookup, PATH, refusal", () => {
  it("pnpmLookup: LOCALBOT_PNPM_DIR with a shim wins everywhere; packaged without it is missing; dev without it is PATH", () => {
    const dir = tmp("lb-pnpm-dir-");
    fs.writeFileSync(path.join(dir, "pnpm"), "#!/bin/sh\n", { mode: 0o755 });
    fs.writeFileSync(path.join(dir, "pnpm.cmd"), "@echo off\r\n");
    const bundled = pnpmLookup({ LOCALBOT_PNPM_DIR: dir, LOCALBOT_PACKAGED: "1" }, "linux");
    assert.deepEqual(bundled, { kind: "bundled", dir, bin: path.join(dir, "pnpm") });
    assert.deepEqual(pnpmLookup({ LOCALBOT_PNPM_DIR: dir }, "win32"), {
      kind: "bundled",
      dir,
      bin: path.join(dir, "pnpm.cmd"),
    });
    const devBundled = pnpmLookup({ LOCALBOT_PNPM_DIR: dir }, "linux");
    assert.equal(devBundled.kind, "bundled", "dev mode also uses the bundle when told to");

    const missing = pnpmLookup(
      { LOCALBOT_PACKAGED: "1", PATH: "/usr/local/bin:/usr/bin" },
      "linux",
    );
    assert.equal(missing.kind, "missing");
    if (missing.kind === "missing") {
      assert.match(missing.error, /packaged mode never uses pnpm from PATH/);
      assert.match(missing.error, /resources\/localbot-pnpm/);
    }
    const broken = pnpmLookup(
      { LOCALBOT_PACKAGED: "1", LOCALBOT_PNPM_DIR: path.join(dir, "nope") },
      "linux",
    );
    assert.equal(
      broken.kind,
      "missing",
      "a LOCALBOT_PNPM_DIR without the shim is a missing bundle, not a PATH fallback",
    );
    if (broken.kind === "missing") assert.match(broken.error, /has no pnpm/);

    assert.deepEqual(pnpmLookup({ PATH: "/usr/bin" }, "linux"), { kind: "path", bin: "pnpm" });
    assert.deepEqual(pnpmLookup({ Path: "C:\\x" }, "win32"), { kind: "path", bin: "pnpm.cmd" });
  });

  it("pnpmChildEnv: bundled bin dir goes first on PATH (Path on win32), store dir under DSH_HOME, nothing else touched", () => {
    const bundled = {
      kind: "bundled" as const,
      dir: "/app/resources/localbot-pnpm/bin",
      bin: "/app/resources/localbot-pnpm/bin/pnpm",
    };
    const posix = pnpmChildEnv(
      { PATH: "/usr/bin:/bin", HOME: "/home/e" },
      "/data/dsh-home",
      bundled,
      ":",
    );
    assert.equal(posix.PATH, "/app/resources/localbot-pnpm/bin:/usr/bin:/bin");
    assert.equal(posix.npm_config_store_dir, path.join("/data/dsh-home", "pnpm-store"));
    assert.equal(posix.HOME, "/home/e");
    const win = pnpmChildEnv(
      { Path: "C:\\Windows\\System32" },
      "C:\\Users\\e\\AppData\\Roaming\\LocalBot\\dsh-home",
      { ...bundled, dir: "C:\\App\\resources\\localbot-pnpm\\bin" },
      ";",
    );
    assert.equal(win.Path, "C:\\App\\resources\\localbot-pnpm\\bin;C:\\Windows\\System32");
    assert.equal(win.PATH, undefined, "must not add a second PATH key beside Path");
    assert.equal(pathKeyOf({ Path: "x" }), "Path");
    assert.equal(pathKeyOf({}), "PATH");
    const empty = pnpmChildEnv({}, "/data/dsh-home", bundled, ":");
    assert.equal(
      empty.PATH,
      "/app/resources/localbot-pnpm/bin",
      "an empty PATH becomes just the bundle",
    );
    const viaPath = pnpmChildEnv(
      { PATH: "/usr/bin" },
      "/data/dsh-home",
      { kind: "path", bin: "pnpm" },
      ":",
    );
    assert.equal(viaPath.PATH, "/usr/bin", "dev mode leaves PATH alone");
    assert.equal(viaPath.npm_config_store_dir, path.join("/data/dsh-home", "pnpm-store"));
  });

  it("pluginsAdd in packaged mode with no bundled pnpm refuses NO_PNPM before dsh is spawned (never exit 127 from host PATH)", async () => {
    const dshHome = tmp("lb-pt-add-");
    const run = fakeRunner(() => ({ code: 127, stderr: "dsh: pnpm not found on PATH\n" }));
    const env: NodeJS.ProcessEnv = { ...process.env, LOCALBOT_PACKAGED: "1" };
    delete env.LOCALBOT_PNPM_DIR;
    await assert.rejects(
      pluginsAdd(
        {
          dataDir: "/unused",
          dshHome,
          dshDir: path.join(root, "dsh"),
          nodeBin: process.execPath,
          env,
          run,
        },
        new HarnessManager(),
        FIXTURE,
      ),
      (err: unknown) =>
        err instanceof PluginError &&
        err.code === "NO_PNPM" &&
        /never uses pnpm from PATH/.test(err.message),
    );
    assert.equal(run.calls.length, 0, "dsh must not have been spawned");
    assert.equal(
      fs.existsSync(path.join(dshHome, "profiles")),
      false,
      "nothing was written to the profile",
    );
  });

  it("pluginsAdd with a bundled pnpm hands dsh a PATH that starts with the bundle and a store dir under DSH_HOME", async () => {
    const dshHome = tmp("lb-pt-add2-");
    const binDir = tmp("lb-pt-bin-");
    fs.writeFileSync(path.join(binDir, "pnpm"), "#!/bin/sh\n", { mode: 0o755 });
    fs.writeFileSync(path.join(binDir, "pnpm.cmd"), "@echo off\r\n");
    const run = fakeRunner(() => ({ code: 0 }));
    const env: NodeJS.ProcessEnv = {
      PATH: "/usr/bin",
      LOCALBOT_PACKAGED: "1",
      LOCALBOT_PNPM_DIR: binDir,
      HOME: os.homedir(),
    };
    const r = await pluginsAdd(
      {
        dataDir: "/unused",
        dshHome,
        dshDir: path.join(root, "dsh"),
        nodeBin: process.execPath,
        env,
        run,
      },
      null,
      FIXTURE,
    );
    assert.equal(run.calls.length, 1);
    const child = run.calls[0]!.env;
    assert.ok(String(child.PATH).startsWith(`${binDir}${path.delimiter}`), `PATH=${child.PATH}`);
    assert.equal(child.npm_config_store_dir, path.join(dshHome, "pnpm-store"));
    assert.equal(child.LOCALBOT_DSH_NODE, process.execPath, "the shim is told which Node to use");
    assert.equal(child.DSH_HOME, dshHome);
    // The fake dsh wrote no manifest, so the add honestly reports failure.
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /not in/);
  });

  it("pnpmStatus: bundled shim first (absolute path), PATH only in dev mode, packaged-without-bundle never probes", async () => {
    const binDir = tmp("lb-pt-status-");
    fs.writeFileSync(path.join(binDir, "pnpm"), "#!/bin/sh\n", { mode: 0o755 });
    const run = fakeRunner(() => ({ code: 0, stdout: `${PNPM_PIN}\n` }));
    const bundled = await pnpmStatus(
      { LOCALBOT_PNPM_DIR: binDir, LOCALBOT_PACKAGED: "1", LOCALBOT_DSH_NODE: process.execPath },
      run,
      "linux",
    );
    assert.deepEqual(bundled, {
      found: true,
      version: PNPM_PIN,
      source: "bundled",
      dir: binDir,
      error: null,
    });
    assert.equal(run.calls[0]!.bin, path.join(binDir, "pnpm"));
    assert.equal(run.calls[0]!.env.LOCALBOT_DSH_NODE, process.execPath);

    const dev = fakeRunner(() => ({ code: 0, stdout: "9.9.9\n" }));
    const viaPath = await pnpmStatus({ PATH: "/usr/bin" }, dev, "linux");
    assert.deepEqual(viaPath, {
      found: true,
      version: "9.9.9",
      source: "path",
      dir: null,
      error: null,
    });
    assert.equal(dev.calls[0]!.bin, "pnpm");

    const never = fakeRunner(() => ({ code: 0, stdout: "9.9.9\n" }));
    const packaged = await pnpmStatus({ LOCALBOT_PACKAGED: "1", PATH: "/usr/bin" }, never, "linux");
    assert.equal(packaged.found, false);
    assert.equal(packaged.source, null);
    assert.match(packaged.error ?? "", /never uses pnpm from PATH/);
    assert.equal(never.calls.length, 0, "packaged mode without the bundle must not probe PATH");

    const broken = fakeRunner(() => ({ code: 1, stderr: "node: bad option\n" }));
    const notRunning = await pnpmStatus(
      { LOCALBOT_PNPM_DIR: binDir, LOCALBOT_DSH_NODE: process.execPath },
      broken,
      "linux",
    );
    assert.equal(notRunning.found, false);
    assert.equal(notRunning.source, "bundled");
    assert.match(notRunning.error ?? "", /exited 1: node: bad option/);
  });

  it("pluginsInstalled reports the pnpm source so the UI can say whose pnpm it is", async () => {
    const dshHome = tmp("lb-pt-inst-");
    const binDir = tmp("lb-pt-inst-bin-");
    fs.writeFileSync(path.join(binDir, "pnpm"), "#!/bin/sh\n", { mode: 0o755 });
    const run = fakeRunner(() => ({ code: 0, stdout: `${PNPM_PIN}\n` }));
    const r = await pluginsInstalled(
      {
        dataDir: "/unused",
        dshHome,
        dshDir: path.join(root, "dsh"),
        nodeBin: process.execPath,
        env: {
          LOCALBOT_PACKAGED: "1",
          LOCALBOT_PNPM_DIR: binDir,
          LOCALBOT_DSH_NODE: process.execPath,
        },
        run,
      },
      { dump: false },
    );
    assert.deepEqual(r.pnpm, {
      found: true,
      version: PNPM_PIN,
      source: "bundled",
      dir: binDir,
      error: null,
    });
    // Installed (the dump) must still work when the bundle is missing in packaged mode: only add / remove refuse.
    const dump = fakeRunner((_bin, args) =>
      args.includes("--dump-config")
        ? { code: 0, stdout: "# == dsh-base\n- id: system-prompt\n" }
        : { code: 1 },
    );
    const noBundle = await pluginsInstalled(
      {
        dataDir: "/unused",
        dshHome,
        dshDir: path.join(root, "dsh"),
        nodeBin: process.execPath,
        env: { LOCALBOT_PACKAGED: "1", HOME: os.homedir() },
        run: dump,
      },
      { dump: true },
    );
    assert.equal(noBundle.dump.ok, true, JSON.stringify(noBundle.dump));
    assert.equal(noBundle.pnpm.found, false);
    assert.equal(noBundle.pnpm.source, null);
  });

  it("plugins.tsx: red banner only when !pnpm.found, the old sentence is gone, and the source is shown when found", () => {
    const ui = read("src/components/localbot/plugins.tsx");
    assert.match(ui, /\{report && !report\.pnpm\.found && \(/);
    assert.match(ui, /data-testid="plugins-pnpm-missing"/);
    assert.match(ui, /data-testid="plugins-pnpm-source"/);
    assert.equal(ui.includes("does not bundle pnpm"), false);
    assert.match(ui, /bundled with LocalBot/);
    assert.match(ui, /NO_PNPM/);
  });
});

describe("Stage 20 — Electron main hands the sidecar the new resources", () => {
  it("packaged.mjs resource paths include the pnpm bin and the per-target whisper folder; env only when the files exist", () => {
    const p = harnessResourcePaths({
      resourcesPath: "/app/resources",
      platform: "darwin",
      arch: "arm64",
    });
    assert.equal(p.pnpmDir, "/app/resources/localbot-pnpm/bin");
    assert.equal(p.whisperDir, "/app/resources/localbot-whisper/darwin-arm64/whisper");
    const present = new Set([
      "/app/resources/localbot-pnpm/bin/pnpm",
      "/app/resources/localbot-whisper/darwin-arm64/whisper/whisper-cli",
      "/app/resources/localbot-whisper/darwin-arm64/whisper/whisper-build.json",
    ]);
    const env = packagedHarnessEnv({
      resourcesPath: "/app/resources",
      platform: "darwin",
      arch: "arm64",
      exists: (f) => present.has(f),
    });
    assert.equal(env.LOCALBOT_PNPM_DIR, "/app/resources/localbot-pnpm/bin");
    assert.equal(env.LOCALBOT_WHISPER_DIR, "/app/resources/localbot-whisper/darwin-arm64/whisper");
    assert.equal(env.LOCALBOT_DSH_NODE, undefined, "only what exists is set");
    const noManifest = packagedHarnessEnv({
      resourcesPath: "/app/resources",
      platform: "darwin",
      arch: "arm64",
      exists: (f) => present.has(f) && !f.endsWith("whisper-build.json"),
    });
    assert.equal(
      noManifest.LOCALBOT_WHISPER_DIR,
      undefined,
      "a whisper-cli without its manifest is not offered",
    );
    const win = packagedHarnessEnv({
      resourcesPath: "C:\\App\\resources",
      platform: "win32",
      arch: "x64",
      exists: (f) => f.endsWith("pnpm.cmd"),
    });
    assert.equal(win.LOCALBOT_PNPM_DIR, "C:\\App\\resources/localbot-pnpm/bin");
    assert.equal(win.LOCALBOT_WHISPER_DIR, undefined);
    const linuxNoPnpm = packagedHarnessEnv({
      resourcesPath: "/app/resources",
      platform: "linux",
      arch: "x64",
      exists: (f) => f.endsWith("/pnpm.cmd"),
    });
    assert.equal(linuxNoPnpm.LOCALBOT_PNPM_DIR, undefined, "on posix only the sh shim counts");
  });
});

describe("Stage 20 — whisper seed from resources (darwin-arm64 fixtures)", () => {
  const asset = whisperRuntimeAsset("darwin-arm64")!;
  function fixture(dir: string, body: Buffer, overrides: Record<string, unknown> = {}) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "whisper-cli"), body, { mode: 0o755 });
    const sha = crypto.createHash("sha256").update(body).digest("hex");
    const manifest = {
      release: "v1.9.2",
      commit: asset.source!.commit,
      target: "darwin-arm64",
      binary: "whisper-cli",
      sha256: sha,
      sizeBytes: body.length,
      cmake: asset.cmake,
      dylibs: [],
      ...overrides,
    };
    fs.writeFileSync(path.join(dir, WHISPER_BUILD_MANIFEST), JSON.stringify(manifest));
    return sha;
  }

  it("whisperResourceDir reads LOCALBOT_WHISPER_DIR only", () => {
    assert.equal(whisperResourceDir({}), null);
    assert.equal(whisperResourceDir({ LOCALBOT_WHISPER_DIR: "  " }), null);
    assert.equal(
      whisperResourceDir({
        LOCALBOT_WHISPER_DIR: "/app/resources/localbot-whisper/darwin-arm64/whisper",
      }),
      path.resolve("/app/resources/localbot-whisper/darwin-arm64/whisper"),
    );
  });

  it("fresh AppData + a valid resource → copied, verified, executable; no cmake / git / network involved", () => {
    const base = tmp("lb-pt-seed-");
    const from = path.join(base, "resources/localbot-whisper/darwin-arm64/whisper");
    const to = path.join(base, "AppData/bin/darwin-arm64/whisper");
    const sha = fixture(from, Buffer.from("#!/bin/sh\necho baked\n"));
    const r = seedWhisperFromResources({
      target: "darwin-arm64",
      asset,
      from,
      to,
      platform: "darwin",
    });
    assert.deepEqual(r, { seeded: true, from, to, sha256: sha });
    assert.ok(fs.existsSync(path.join(to, "whisper-cli")));
    assert.ok(fs.existsSync(path.join(to, WHISPER_BUILD_MANIFEST)));
    assert.equal(fs.statSync(path.join(to, "whisper-cli")).mode & 0o111, 0o111);
    assert.equal(verifyBuiltWhisper(path.join(to, "whisper-cli"), asset).ok, true);
    assert.equal(
      fs.readdirSync(to).some((n) => n.startsWith(".")),
      false,
      "no temp files left behind",
    );
    // Second call: already valid, nothing rewritten.
    const before = fs.statSync(path.join(to, "whisper-cli")).mtimeMs;
    assert.deepEqual(
      seedWhisperFromResources({ target: "darwin-arm64", asset, from, to, platform: "darwin" }),
      { seeded: false, reason: "already-valid", error: null },
    );
    assert.equal(fs.statSync(path.join(to, "whisper-cli")).mtimeMs, before);
  });

  it("a valid AppData copy is never overwritten by a different (also valid) resource", () => {
    const base = tmp("lb-pt-seed2-");
    const from = path.join(base, "res");
    const to = path.join(base, "app");
    fixture(from, Buffer.from("#!/bin/sh\necho resource\n"));
    const appSha = fixture(to, Buffer.from("#!/bin/sh\necho appdata-build\n"));
    const r = seedWhisperFromResources({
      target: "darwin-arm64",
      asset,
      from,
      to,
      platform: "darwin",
    });
    assert.equal(r.seeded, false);
    if (!r.seeded) assert.equal(r.reason, "already-valid");
    assert.equal(
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(to, "whisper-cli")))
        .digest("hex"),
      appSha,
    );
  });

  it("an invalid AppData copy (tampered) IS replaced by a valid resource", () => {
    const base = tmp("lb-pt-seed3-");
    const from = path.join(base, "res");
    const to = path.join(base, "app");
    const resSha = fixture(from, Buffer.from("#!/bin/sh\necho resource\n"));
    fixture(to, Buffer.from("#!/bin/sh\necho old\n"));
    fs.appendFileSync(path.join(to, "whisper-cli"), "# tampered\n");
    assert.equal(verifyBuiltWhisper(path.join(to, "whisper-cli"), asset).ok, false);
    const r = seedWhisperFromResources({
      target: "darwin-arm64",
      asset,
      from,
      to,
      platform: "darwin",
    });
    assert.equal(r.seeded, true);
    if (r.seeded) assert.equal(r.sha256, resSha);
  });

  it("no resource → no-resource (NOT BUILT stays honest); an invalid resource is never copied", () => {
    const base = tmp("lb-pt-seed4-");
    const to = path.join(base, "app");
    assert.deepEqual(
      seedWhisperFromResources({
        target: "darwin-arm64",
        asset,
        from: null,
        to,
        platform: "darwin",
      }),
      { seeded: false, reason: "no-resource", error: null },
    );
    assert.equal(fs.existsSync(to), false);
    const from = path.join(base, "res");
    fixture(from, Buffer.from("#!/bin/sh\necho x\n"), { commit: "0".repeat(40) });
    const bad = seedWhisperFromResources({
      target: "darwin-arm64",
      asset,
      from,
      to,
      platform: "darwin",
    });
    assert.equal(bad.seeded, false);
    if (!bad.seeded) {
      assert.equal(bad.reason, "resource-invalid");
      assert.match(bad.error ?? "", /not the pinned/);
    }
    assert.equal(fs.existsSync(to), false, "an unverified resource must not land in AppData");
    const missing = seedWhisperFromResources({
      target: "darwin-arm64",
      asset,
      from: path.join(base, "nowhere"),
      to,
      platform: "darwin",
    });
    assert.equal(missing.seeded, false);
    if (!missing.seeded) assert.equal(missing.reason, "resource-invalid");
    // Archive rows (linux / win) never seed: they download on first use as before.
    const linux = whisperRuntimeAsset("linux-x64")!;
    assert.deepEqual(
      seedWhisperFromResources({ target: "linux-x64", asset: linux, from, to, platform: "linux" }),
      { seeded: false, reason: "not-built-row", error: null },
    );
  });

  it("the sidecar's status + ensure paths call the seed before they can say NOT_BUILT (source-locked)", () => {
    const src = read("src/lib/runtime/stt.ts");
    const ensure = src.slice(
      src.indexOf("export async function ensureWhisperRuntime"),
      src.indexOf("export type EnsureModel"),
    );
    assert.ok(
      ensure.indexOf("seedWhisperFromResources(") <
        ensure.indexOf("verifyBuiltWhisper(exe, asset)"),
      "seed runs before the verify that decides NOT_BUILT",
    );
    assert.match(ensure, /carries no baked whisper-cli for this host/);
    const status = src.slice(
      src.indexOf("export function sttStatus"),
      src.indexOf("// ── spawn plan"),
    );
    assert.match(
      status,
      /seedWhisperFromResources\(\{ target, asset, from: resourceDir, to: dir \}\)/,
    );
    assert.match(status, /resourceDir,/);
  });
});
