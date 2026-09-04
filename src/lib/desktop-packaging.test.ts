/**
 * Stage 8 — installers + packaged Harness + two-process share. These fail
 * when: an OS target is still `dir`-only; the build script hardcodes `--dir`;
 * a handoff says "signed" / "notarized" while `mac.identity` is null; packaged
 * findHarnessNode still scans ~/.nvm (or PATH); `chat.tsx` drops
 * `runAgentTurn`; the dsh / ACP pins float.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { DEV_UI_URL, harnessResourcePaths, packagedHarnessEnv, resolveUiLoad } from "../../desktop/packaged.mjs";
import { ACP_SDK_PIN, DSH_PIN, HARNESS_MIN_NODE, defaultDshDir, dshBinPath, findHarnessNode, nodeVersionOk } from "./harness/process.ts";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const pkg = JSON.parse(read("package.json"));

function targetsOf(osKey: "linux" | "mac" | "win"): string[] {
  const t = pkg.build?.[osKey]?.target;
  const list: unknown[] = Array.isArray(t) ? t : t ? [t] : [];
  return list.map((x) => (typeof x === "string" ? x : (x as { target?: string })?.target ?? "")).filter(Boolean);
}

/**
 * True when a line asserts a signature. Lines that say UNSIGNED / not signed
 * / not notarized / identity null / NOT BUILT are honest and allowed.
 */
export function claimsSigned(text: string): string[] {
  const bad: string[] = [];
  for (const line of text.split("\n")) {
    if (!/\b(signed|notarized|notarised)\b/i.test(line)) continue;
    if (/\bunsigned\b|not (signed|notarized|notarised)|never (signed|notarized|claims?)|no (apple|windows|signing|certificate|identity)|without (a )?(signature|signing|certificate)|identity[^\n]*null|NOT BUILT|UNVERIFIED|\bnor\b|cannot|can't|isn't|is not|are not|self-signed is not|unsigned\)/i.test(line)) continue;
    bad.push(line.trim());
  }
  return bad;
}

function fakeNode(dir: string, version: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const bin = path.join(dir, "node");
  fs.writeFileSync(bin, `#!/bin/sh\necho ${version}\n`, { mode: 0o755 });
  return bin;
}

describe("Stage 8: installer targets", () => {
  it("every OS has a real installer target; linux has AppImage and/or deb, mac dmg, win nsis", () => {
    for (const osKey of ["linux", "mac", "win"] as const) {
      const t = targetsOf(osKey);
      assert.ok(t.length > 0, `${osKey} has no target`);
      assert.ok(t.some((x) => x !== "dir"), `${osKey} target is still only "dir": ${JSON.stringify(t)}`);
    }
    assert.ok(targetsOf("linux").includes("AppImage") || targetsOf("linux").includes("deb"));
    assert.ok(targetsOf("mac").includes("dmg"));
    assert.ok(targetsOf("win").includes("nsis"));
  });

  it("the build script no longer hardcodes --dir and refuses dir-only configs", () => {
    const src = read("scripts/build-desktop.mjs");
    assert.equal(src.includes('"--dir"'), false, "scripts/build-desktop.mjs still passes --dir");
    assert.equal(/\s--dir(\s|"|')/.test(src), false);
    assert.match(src, /hasInstallerTarget\(pkg, osKey\)/);
    assert.match(src, /SHA256SUMS\.txt/);
  });

  it("ships UNSIGNED: identity null, no signing config, no signed/notarized claims in the handoffs", () => {
    assert.equal(pkg.build.mac.identity, null);
    assert.equal(pkg.build.win.certificateFile, undefined);
    assert.equal(pkg.build.win.certificateSubjectName, undefined);
    assert.equal(pkg.build.afterSign, undefined);
    assert.equal(pkg.build.mac.notarize, undefined);
    const stage = read("STAGE_HANDOFF.md");
    assert.match(stage, /## Stage 8/);
    assert.deepEqual(claimsSigned(stage), [], "STAGE_HANDOFF.md claims a signature");
    const hand = read("LOCALBOT_HANDOFF.md");
    const stage8 = hand.slice(hand.indexOf("Stage 8"), hand.indexOf("## Update after Stage 7"));
    assert.ok(stage8.length > 0, "LOCALBOT_HANDOFF.md has no Stage 8 section before Stage 7");
    assert.deepEqual(claimsSigned(stage8), [], "LOCALBOT_HANDOFF.md Stage 8 section claims a signature");
    assert.match(stage, /UNSIGNED/);
  });

  it("claimsSigned catches the sentence the rule forbids and allows the honest ones", () => {
    assert.deepEqual(claimsSigned("The .dmg is signed and notarized."), ["The .dmg is signed and notarized."]);
    assert.deepEqual(claimsSigned("UNSIGNED .deb; mac.identity is null; not notarized."), []);
    assert.deepEqual(claimsSigned("Signed installers: NOT BUILT (no Apple ID, no Windows cert)."), []);
  });

  it("uninstall leaves employee work alone: no deleteAppDataOnUninstall, scope folders never under the app dir", () => {
    assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
    const main = read("desktop/main.mjs");
    assert.match(main, /app\.getPath\("appData"\)/);
    assert.equal(main.includes("rmSync"), false, "Electron main must not delete anything");
  });
});

describe("Stage 8: packaged Harness runtime", () => {
  it("package.json ships the Harness tree and a Node runtime as explicit extraResources", () => {
    const rows = pkg.build.extraResources as { from: string; to: string }[];
    const harness = rows.find((r) => r.from === "dist/desktop-harness");
    assert.ok(harness, "no dist/desktop-harness extraResources entry");
    // Staged as dist/desktop-harness/localbot-harness/node_modules and copied to the
    // resources root: electron-builder drops a node_modules directly under `from`.
    assert.equal(harness?.to, ".");
    assert.ok(rows.some((r) => r.from === "dist/desktop-node" && r.to === "localbot-node"), "no localbot-node extraResources entry");
    assert.match(read("scripts/build-desktop.mjs"), /dist\/desktop-harness\/localbot-harness/);
    const cat = JSON.parse(read("catalog/node-runtime.json"));
    assert.ok(nodeVersionOk(cat.pin), `${cat.pin} < ${HARNESS_MIN_NODE.join(".")}`);
    assert.equal(cat.minimum, HARNESS_MIN_NODE.join("."));
    for (const t of ["linux-x64", "darwin-arm64", "darwin-x64", "win32-x64"]) assert.match(cat.targets[t].sha256, /^[0-9a-f]{64}$/);
  });

  it("dsh and ACP pins are exact and the harness stage uses the same dsh pin", () => {
    assert.equal(pkg.dependencies["@deepseek-ai/dsh"], DSH_PIN);
    assert.equal(pkg.dependencies["@agentclientprotocol/sdk"], ACP_SDK_PIN);
    assert.match(DSH_PIN, /^\d/);
    assert.match(ACP_SDK_PIN, /^\d/);
    assert.match(read("scripts/build-desktop.mjs"), /dshPin = pkg\.dependencies\?\.\["@deepseek-ai\/dsh"\]/);
  });

  it("resource paths + env: main hands the sidecar the bundled Node, dsh dir and modules", () => {
    const p = harnessResourcePaths({ resourcesPath: "/app/resources/", platform: "linux" });
    assert.equal(p.nodeBin, "/app/resources/localbot-node/node");
    assert.equal(p.dshDir, "/app/resources/localbot-harness/dsh");
    assert.equal(p.modulesDir, "/app/resources/localbot-harness/node_modules");
    assert.equal(harnessResourcePaths({ resourcesPath: "C:\\App\\resources", platform: "win32" }).nodeBin, "C:\\App\\resources/localbot-node/node.exe");

    const all = packagedHarnessEnv({ resourcesPath: "/app/resources", platform: "linux", exists: () => true });
    assert.deepEqual(all, {
      LOCALBOT_DSH_NODE: "/app/resources/localbot-node/node",
      LOCALBOT_DSH_DIR: "/app/resources/localbot-harness/dsh",
      LOCALBOT_DSH_MODULES: "/app/resources/localbot-harness/node_modules",
    });
    const noNode = packagedHarnessEnv({ resourcesPath: "/app/resources", platform: "linux", exists: (f) => !f.includes("localbot-node") });
    assert.equal(noNode.LOCALBOT_DSH_NODE, undefined, "a missing bundled Node must not be papered over");
    assert.equal(noNode.LOCALBOT_DSH_DIR, "/app/resources/localbot-harness/dsh");

    const main = read("desktop/main.mjs");
    const pkgBranch = main.slice(main.indexOf("async function startSidecar"), main.indexOf("async function ensureDevUi"));
    assert.match(pkgBranch, /packagedHarnessEnv\(\{/);
    assert.match(pkgBranch, /\.\.\.harness,/);
    assert.equal(pkgBranch.includes("npm run dev"), false);

    assert.equal(dshBinPath({ LOCALBOT_DSH_MODULES: "/app/resources/localbot-harness/node_modules" }), path.join("/app/resources/localbot-harness/node_modules", "@deepseek-ai/dsh/lib/bin.js"));
    assert.equal(defaultDshDir({ LOCALBOT_DSH_DIR: "/app/resources/localbot-harness/dsh" }), path.resolve("/app/resources/localbot-harness/dsh"));
  });

  it("packaged findHarnessNode never scans ~/.nvm or PATH; dev mode still may", { skip: process.platform === "win32" }, () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "lb-home-"));
    const nvmBin = fakeNode(path.join(home, ".nvm/versions/node/v22.99.0/bin"), "v22.99.0");
    const own = { ownVersion: "v22.14.0", ownExecPath: "/electron/LocalBot", homedir: home };

    const dev = findHarnessNode({ ...own, env: {} });
    assert.equal(dev.ok, true);
    if (dev.ok) {
      assert.equal(dev.bin, nvmBin);
      assert.equal(dev.source, "nvm");
    }

    const packaged = findHarnessNode({ ...own, env: { LOCALBOT_PACKAGED: "1", PATH: path.dirname(nvmBin) } });
    assert.equal(packaged.ok, false, "packaged mode picked a Node from ~/.nvm");
    if (!packaged.ok) {
      assert.match(packaged.error, /never uses node from PATH or ~\/\.nvm/);
      assert.match(packaged.error, /resources\/localbot-node/);
    }

    const bundled = fakeNode(path.join(home, "app/resources/localbot-node"), "v22.23.2");
    const viaEnv = findHarnessNode({ ...own, env: { LOCALBOT_PACKAGED: "1", LOCALBOT_DSH_NODE: bundled } });
    assert.equal(viaEnv.ok, true);
    if (viaEnv.ok) {
      assert.equal(viaEnv.bin, bundled);
      assert.equal(viaEnv.source, "explicit");
      assert.equal(viaEnv.version, "v22.23.2");
    }

    const tooOld = fakeNode(path.join(home, "old"), "v22.14.0");
    const refused = findHarnessNode({ ...own, env: { LOCALBOT_PACKAGED: "1", LOCALBOT_DSH_NODE: tooOld } });
    assert.equal(refused.ok, false, "an old bundled Node must be refused, not worked around");

    const ownOk = findHarnessNode({ ownVersion: "v22.20.0", ownExecPath: "/electron/LocalBot", homedir: home, env: { LOCALBOT_PACKAGED: "1" } });
    assert.equal(ownOk.ok && ownOk.source, "own");

    const src = read("src/lib/harness/process.ts");
    assert.equal(src.includes('spawn("node"'), false);
    assert.equal(src.includes("execSync(\"node"), false);
  });

  it("the sidecar's Node never runs the Harness in packaged mode (Electron 36 = Node 22.14 is documented and refused)", () => {
    assert.equal(nodeVersionOk("v22.14.0"), false);
    assert.equal(pkg.build.electronVersion, "36.3.1");
    assert.match(read("desktop/packaged.mjs"), /localbot-node/);
  });

  it("packaged UI load stays sidecar-only (Stage 8 changes nothing there)", () => {
    const r = resolveUiLoad({ packaged: true, sidecarReady: true, uiUrlEnv: DEV_UI_URL });
    assert.equal(r.spawnsNpmDev, false);
    assert.equal(r.url?.includes("8080"), false);
  });
});

describe("Stage 8: two-process share + kept invariants", () => {
  it("a runnable two-process share script exists and targets a shared scope, not private", () => {
    const src = read("scripts/two-process-share.mjs");
    assert.match(src, /department-shared|employee-shared/);
    assert.match(src, /18790/);
    assert.match(src, /8080/);
    assert.equal(/scope:\s*"private"/.test(src), false);
    assert.match(src, /two-process, one host/i);
  });

  it("a packaged-launch proof script exists and strips node from PATH", () => {
    const src = read("scripts/prove-packaged.mjs");
    assert.match(src, /PATH/);
    assert.match(src, /command -v node/);
    assert.match(src, /SIDECAR_URL|18790/);
    assert.match(src, /harnessResourcePaths/);
    assert.match(src, /LOCALBOT_PACKAGED: "1"/);
    assert.match(src, /new HarnessProcess\(/, "the proof must go through the sidecar's real spawn path");
    assert.match(src, /findHarnessNode\(\)/);
  });

  it("chat.tsx still runs turns through runAgentTurn; the four scopes are intact", () => {
    assert.match(read("src/components/localbot/chat.tsx"), /import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/);
    const model = read("src/lib/fs/scope-model.ts");
    for (const s of ["private", "employee-shared", "department-shared", "company-shared"]) assert.ok(model.includes(`"${s}"`), s);
  });
});
