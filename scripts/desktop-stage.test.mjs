import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import {
  buildTargetsOf,
  CATALOG_REQUIRED_FILE,
  CATALOG_RESOURCE_DIR,
  catalogLayoutChecks,
  checkBuiltWhisper,
  checksumLines,
  listCatalogJson,
  stageCatalog,
  harnessPackageJson,
  hasInstallerTarget,
  listInstallers,
  nodeRuntimeTarget,
  pnpmPinOf,
  pnpmShimCmd,
  pnpmShimSh,
  pnpmShimVersion,
  readNodeRuntimeCatalog,
  relativeImportsOf,
  sha256File,
  stagePnpm,
  stageWhisperBuilt,
  traceRelativeImports,
  versionAtLeast,
} from "./desktop-stage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PNPM_PIN = "10.33.3";

describe("desktop-stage: relative import tracing", () => {
  it("keeps value imports and drops type-only imports (what strip-types does at runtime)", () => {
    const src = [
      'import fs from "node:fs";',
      'import { a } from "./a.ts";',
      'import type { T } from "../types.ts";',
      'import { type U, b } from "../b.ts";',
      'export { c } from "./c.mjs";',
      'import "./side-effect.ts";',
      'import { FsError } from "@deepseek-ai/dsh-fs";',
    ].join("\n");
    assert.deepEqual(relativeImportsOf(src), ["./a.ts", "../b.ts", "./c.mjs", "./side-effect.ts"]);
  });

  it("traces the real fs plugin to files that all exist and never outside the repo", () => {
    const traced = traceRelativeImports(path.join(root, "dsh/localbot-fs.mjs"), root);
    assert.ok(traced.includes("dsh/localbot-fs.mjs"));
    for (const must of ["src/lib/fs/disk.ts", "src/lib/fs/scope-model.ts", "src/lib/fs/scopes.ts", "src/lib/runtime/llama-platform.ts", "catalog/llama-assets.json"]) {
      assert.ok(traced.includes(must), `${must} must be staged for the packaged Harness plugin`);
    }
    for (const rel of traced) {
      assert.equal(rel.startsWith(".."), false, rel);
      assert.ok(fs.existsSync(path.join(root, rel)), rel);
    }
  });
});

describe("desktop-stage: installer targets", () => {
  it("reads string and object targets", () => {
    const pkg = { build: { linux: { target: ["AppImage", { target: "deb", arch: ["x64"] }] }, mac: { target: "dir" }, win: {} } };
    assert.deepEqual(buildTargetsOf(pkg, "linux"), ["AppImage", "deb"]);
    assert.equal(hasInstallerTarget(pkg, "linux"), true);
    assert.equal(hasInstallerTarget(pkg, "mac"), false);
    assert.equal(hasInstallerTarget(pkg, "win"), false);
  });

  it("this repo's package.json has an installer target for every OS and identity null", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    assert.ok(hasInstallerTarget(pkg, "linux"), "linux still dir-only");
    assert.ok(hasInstallerTarget(pkg, "mac"), "mac still dir-only");
    assert.ok(hasInstallerTarget(pkg, "win"), "win still dir-only");
    assert.ok(buildTargetsOf(pkg, "linux").includes("AppImage") || buildTargetsOf(pkg, "linux").includes("deb"));
    assert.ok(buildTargetsOf(pkg, "mac").includes("dmg"));
    assert.ok(buildTargetsOf(pkg, "win").includes("nsis"));
    assert.equal(pkg.build.mac.identity, null);
    assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
    const from = pkg.build.extraResources.map((r) => r.from);
    assert.ok(from.includes("dist/desktop-harness"));
    assert.ok(from.includes("dist/desktop-node"));
    // Stage 20
    assert.ok(from.includes("dist/desktop-pnpm"));
    assert.ok(from.includes("dist/desktop-whisper"));
    assert.equal(pnpmPinOf(pkg), PNPM_PIN);
  });

  it("lists installers but never unpacked dirs or blockmaps", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-installers-"));
    fs.writeFileSync(path.join(dir, "LocalBot-0.1.0-linux-x86_64.AppImage"), "x");
    fs.writeFileSync(path.join(dir, "LocalBot-0.1.0-linux-amd64.deb"), "y");
    fs.writeFileSync(path.join(dir, "LocalBot-0.1.0-linux-x86_64.AppImage.blockmap"), "z");
    fs.mkdirSync(path.join(dir, "linux-unpacked"));
    const list = listInstallers(dir).map((p) => path.basename(p));
    assert.deepEqual(list, ["LocalBot-0.1.0-linux-amd64.deb", "LocalBot-0.1.0-linux-x86_64.AppImage"]);
    const lines = checksumLines(listInstallers(dir));
    assert.match(lines[0], /^[0-9a-f]{64} {2}LocalBot-0\.1\.0-linux-amd64\.deb$/);
    assert.equal(sha256File(path.join(dir, "LocalBot-0.1.0-linux-amd64.deb")), lines[0].slice(0, 64));
  });
});

describe("desktop-stage: Node runtime pin", () => {
  it("compares versions", () => {
    assert.equal(versionAtLeast("v22.23.2", "22.15.0"), true);
    assert.equal(versionAtLeast("v22.14.0", "22.15.0"), false);
    assert.equal(versionAtLeast("v24.1.0", "22.15.0"), true);
    assert.equal(versionAtLeast("garbage", "22.15.0"), false);
  });

  it("catalog pins one official archive per target with a sha256, all >= the dsh minimum", () => {
    const cat = readNodeRuntimeCatalog(root);
    assert.match(cat.base, /^https:\/\/nodejs\.org\/dist$/);
    assert.ok(versionAtLeast(cat.pin, cat.minimum), `${cat.pin} < ${cat.minimum}`);
    assert.ok(versionAtLeast(cat.minimum, "22.15.0"));
    for (const t of ["linux-x64", "darwin-arm64", "darwin-x64", "win32-x64"]) {
      const row = cat.targets[t];
      assert.ok(row, t);
      assert.ok(row.file.includes(cat.pin), `${row.file} is not ${cat.pin}`);
      assert.match(row.sha256, /^[0-9a-f]{64}$/);
      assert.ok(row.bin.endsWith(t.startsWith("win32") ? "node.exe" : "bin/node"));
    }
    assert.equal(nodeRuntimeTarget("linux", "x64"), "linux-x64");
    assert.equal(nodeRuntimeTarget("win32", "x64"), "win32-x64");
  });

  it("harness stage package.json carries exact pins only", () => {
    const pkg = harnessPackageJson({ dshPin: "0.1.2-alpha.5", fsVersion: "0.1.2-rc.1", fsLocalVersion: "0.1.2-rc.1" });
    assert.equal(pkg.type, "module");
    for (const v of Object.values(pkg.dependencies)) assert.match(v, /^\d/, v);
  });
});

describe("desktop-stage: Stage 20 bundled pnpm", () => {
  it("pnpmPinOf accepts only x.y.z", () => {
    assert.equal(pnpmPinOf({ devDependencies: { pnpm: "10.33.3" } }), "10.33.3");
    assert.throws(() => pnpmPinOf({ devDependencies: { pnpm: "^10.33.3" } }), /pin pnpm exactly/);
    assert.throws(() => pnpmPinOf({ devDependencies: {} }), /pin pnpm exactly/);
  });

  it("the shims use only shell builtins, LOCALBOT_DSH_NODE or the sibling bundled Node — never node from PATH", () => {
    const sh = pnpmShimSh();
    assert.match(sh, /^#!\/bin\/sh\n/);
    assert.match(sh, /LOCALBOT_DSH_NODE:-\$here\/\.\.\/\.\.\/localbot-node\/node/);
    assert.equal(/\bdirname\b|\breadlink\b|\brealpath\b/.test(sh), false, "no external commands: PATH may be empty");
    assert.equal(/exec node\b|exec "node"/.test(sh), false);
    const cmd = pnpmShimCmd();
    assert.match(cmd, /^@echo off\r\n/);
    assert.match(cmd, /LOCALBOT_DSH_NODE/);
    assert.match(cmd, /localbot-node\\node\.exe/);
    assert.match(cmd, /exit \/b %ERRORLEVEL%/);
  });

  it("stagePnpm produces the documented layout and the shim prints the pin on the bundled Node with an EMPTY PATH", { skip: process.platform === "win32" }, () => {
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), "lb-stage-pnpm-"));
    const r = stagePnpm({ root, stage, pin: PNPM_PIN, log: () => undefined });
    for (const rel of ["bin/pnpm", "bin/pnpm.cmd", "pnpm.cjs", "pnpm/bin/pnpm.cjs", "pnpm/dist/pnpm.cjs", "pnpm/package.json", "LICENSE", "pnpm-runtime.json"]) {
      assert.ok(fs.existsSync(path.join(r.dir, rel)), rel);
    }
    assert.equal(fs.statSync(r.shim).mode & 0o111, 0o111, "shim is executable");
    const manifest = JSON.parse(fs.readFileSync(path.join(r.dir, "pnpm-runtime.json"), "utf8"));
    assert.equal(manifest.pin, PNPM_PIN);
    assert.match(manifest.sha256["pnpm/dist/pnpm.cjs"], /^[0-9a-f]{64}$/);
    assert.equal(fs.existsSync(path.join(r.dir, "pnpm", "README.md")), false);
    // The whole point: no pnpm, no node on PATH; LOCALBOT_DSH_NODE names the Node.
    assert.equal(pnpmShimVersion(r.shim, process.execPath), PNPM_PIN);
    // And the sibling fallback: resources/localbot-node/node next to localbot-pnpm.
    const nodeDir = path.join(stage, "localbot-node");
    fs.mkdirSync(nodeDir, { recursive: true });
    fs.symlinkSync(process.execPath, path.join(nodeDir, "node"));
    assert.equal(pnpmShimVersion(r.shim, "", { LOCALBOT_DSH_NODE: "" }), PNPM_PIN, "empty LOCALBOT_DSH_NODE falls back to ../../localbot-node/node");
    assert.throws(() => stagePnpm({ root, stage, pin: "10.0.0", log: () => undefined }), /package\.json pins 10\.0\.0/);
    fs.rmSync(stage, { recursive: true, force: true });
  });
});

describe("desktop-stage: Stage 20 baked darwin-arm64 whisper-cli", () => {
  it("checkBuiltWhisper / stageWhisperBuilt accept only a build matching the catalog tag + commit + manifest sha256", () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog/whisper-assets.json"), "utf8"));
    const from = fs.mkdtempSync(path.join(os.tmpdir(), "lb-whisper-src-"));
    const body = Buffer.from("#!/bin/sh\necho usage: whisper-cli\n");
    fs.writeFileSync(path.join(from, "whisper-cli"), body, { mode: 0o755 });
    const sha = crypto.createHash("sha256").update(body).digest("hex");
    const row = catalog.targets["darwin-arm64"];
    const manifest = { release: catalog.release, commit: row.source.commit, target: "darwin-arm64", binary: "whisper-cli", sha256: sha, sizeBytes: body.length, cmake: row.cmake, dylibs: [] };
    const write = (m) => fs.writeFileSync(path.join(from, "whisper-build.json"), JSON.stringify(m));
    const check = () => checkBuiltWhisper({ catalog, target: "darwin-arm64", dir: from });
    assert.match(check().error ?? "", /whisper-build\.json is missing/);
    write(manifest);
    const ok = check();
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(ok.matchesCatalog, false, "a fixture is not the author's binary — allowed, reported");
    write({ ...manifest, release: "v1.9.3" });
    assert.match(check().error ?? "", /catalog pins v1\.9\.2/);
    write({ ...manifest, commit: "0".repeat(40) });
    assert.match(check().error ?? "", /not the pinned/);
    write({ ...manifest, target: "darwin-x64" });
    assert.match(check().error ?? "", /built for darwin-x64/);
    write({ ...manifest, sha256: "0".repeat(64) });
    assert.match(check().error ?? "", /sha256 .* ≠ whisper-build\.json/);
    write({ ...manifest, dylibs: ["libggml.dylib"] });
    assert.match(check().error ?? "", /lists libggml\.dylib but it is not beside/);
    assert.match(checkBuiltWhisper({ catalog, target: "darwin-x64", dir: from }).error ?? "", /no built row for darwin-x64/);
    assert.match(checkBuiltWhisper({ catalog, target: "linux-x64", dir: from }).error ?? "", /no built row for linux-x64/);

    write({ ...manifest, commit: "0".repeat(40) });
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), "lb-whisper-stage-"));
    assert.throws(() => stageWhisperBuilt({ root, stage, target: "darwin-arm64", from, log: () => undefined }), /not the pinned/);
    assert.equal(fs.existsSync(path.join(stage, "localbot-whisper")), false, "nothing staged on a mismatch");
    write(manifest);
    const staged = stageWhisperBuilt({ root, stage, target: "darwin-arm64", from, log: () => undefined });
    assert.equal(staged.dir, path.join(stage, "localbot-whisper/darwin-arm64/whisper"));
    assert.ok(fs.existsSync(path.join(staged.dir, "whisper-cli")));
    assert.equal(fs.statSync(path.join(staged.dir, "whisper-cli")).mode & 0o111, 0o111);
    assert.ok(fs.existsSync(path.join(staged.dir, "whisper-build.json")));
    assert.equal(staged.sha256, sha);
    assert.equal(checkBuiltWhisper({ catalog, target: "darwin-arm64", dir: staged.dir }).ok, true);
    fs.rmSync(from, { recursive: true, force: true });
    fs.rmSync(stage, { recursive: true, force: true });
  });
});

describe("desktop-stage: Stage 21 catalog next to the packaged sidecar", () => {
  it("listCatalogJson lists every catalog/*.json (dsh-plugins.json included) and refuses a folder without it or with a non-JSON file", () => {
    const names = listCatalogJson(root);
    assert.ok(names.includes(CATALOG_REQUIRED_FILE));
    assert.equal(CATALOG_REQUIRED_FILE, "dsh-plugins.json");
    for (const n of names) assert.ok(fs.existsSync(path.join(root, "catalog", n)));
    const fake = fs.mkdtempSync(path.join(os.tmpdir(), "lb-cat-"));
    assert.throws(() => listCatalogJson(fake), /does not exist/);
    fs.mkdirSync(path.join(fake, "catalog"));
    fs.writeFileSync(path.join(fake, "catalog/models.json"), "{}");
    assert.throws(() => listCatalogJson(fake), /has no dsh-plugins\.json/);
    fs.writeFileSync(path.join(fake, "catalog/dsh-plugins.json"), "{ nope");
    assert.throws(() => listCatalogJson(fake), /JSON/);
    fs.rmSync(fake, { recursive: true, force: true });
  });

  it("stageCatalog writes byte-identical copies into <into>/catalog/ and the layout list names resources/localbot-server/catalog/dsh-plugins.json first", () => {
    const into = fs.mkdtempSync(path.join(os.tmpdir(), "lb-output-"));
    const r = stageCatalog({ root, into, log: () => undefined });
    assert.equal(r.dir, path.join(into, "catalog"));
    assert.deepEqual(r.names, listCatalogJson(root));
    for (const n of r.names) assert.equal(sha256File(path.join(into, "catalog", n)), sha256File(path.join(root, "catalog", n)), n);
    const checks = catalogLayoutChecks(r.names);
    assert.equal(checks[0], `resources/${CATALOG_RESOURCE_DIR}/dsh-plugins.json`);
    assert.equal(CATALOG_RESOURCE_DIR, "localbot-server/catalog");
    assert.equal(checks.length, r.names.length);
    // What electron-builder makes of it: resources/localbot-server = .output. Every check resolves; drop catalog/ and the first one fails.
    const packed = fs.mkdtempSync(path.join(os.tmpdir(), "lb-packed-"));
    fs.cpSync(into, path.join(packed, "resources/localbot-server"), { recursive: true });
    assert.deepEqual(checks.filter((rel) => !fs.existsSync(path.join(packed, rel))), []);
    fs.rmSync(path.join(packed, "resources/localbot-server/catalog"), { recursive: true });
    assert.ok(checks.filter((rel) => !fs.existsSync(path.join(packed, rel))).includes(checks[0]));
    fs.rmSync(into, { recursive: true, force: true });
    fs.rmSync(packed, { recursive: true, force: true });
  });
});
