import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildTargetsOf,
  checksumLines,
  harnessPackageJson,
  hasInstallerTarget,
  listInstallers,
  nodeRuntimeTarget,
  readNodeRuntimeCatalog,
  relativeImportsOf,
  sha256File,
  traceRelativeImports,
  versionAtLeast,
} from "./desktop-stage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
