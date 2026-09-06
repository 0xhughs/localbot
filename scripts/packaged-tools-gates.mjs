/**
 * Stage 20 — packaged-runtime-completeness gates shared by
 * src/lib/packaged-tools.test.ts and scripts/prove-packaged-tools.mjs. Pure:
 * read the tree under `root`, return { ok, label } results. No network, no
 * spawning.
 *
 * What counts as a regression (any one → exit 1 in the proof, a failing test):
 *   - pnpm is not pinned exactly in package.json, or node_modules/pnpm is not that version
 *   - package.json extraResources loses the dist/desktop-pnpm or dist/desktop-whisper row,
 *     or gains a GGUF / llama.cpp runtime row (those stay first-use AppData downloads)
 *   - scripts/desktop-stage.mjs loses stagePnpm / the shims / stageWhisperBuilt /
 *     checkBuiltWhisper, or a shim reaches for `node` on PATH
 *   - scripts/build-desktop.mjs no longer stages pnpm, checks the shim with an empty PATH,
 *     stages whisper on darwin-arm64, or asserts the packed layout
 *   - desktop/packaged.mjs no longer sets LOCALBOT_PNPM_DIR / LOCALBOT_WHISPER_DIR
 *   - src/lib/harness/plugins.ts no longer prepends LOCALBOT_PNPM_DIR to PATH, sets
 *     npm_config_store_dir under DSH_HOME, or refuses NO_PNPM in packaged mode; or
 *     pnpmStatus stops preferring the bundled shim
 *   - src/lib/runtime/stt.ts built branch no longer seeds from LOCALBOT_WHISPER_DIR
 *     (back to "compile with cmake" only), or reaches for cmake / git / a download
 *   - plugins.tsx says "does not bundle pnpm" again, or shows the banner when pnpm was found
 *   - chat.tsx drops runAgentTurn; start.ts drops the token gate; main.mjs drops the quit
 *     coordinator; dsh / ACP pins float; dsh/localbot-fs.mjs changes; mac.identity !== null
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DSH_PIN = "0.1.2-alpha.5";
export const ACP_SDK_PIN = "1.4.0";
export const PNPM_PIN = "10.33.3";
export const LOCALBOT_FS_SHA256 = "0bb5593abecbc116a7b3c614882cfc109831e88c45b735962ce14ef904c2b0a6";

/** extraResources `from` values that must never appear (models / GPU runtimes stay first-use downloads). */
export const FORBIDDEN_RESOURCE_FROM = [/gguf/i, /llama/i, /models?\b/i, /runtimes?\b/i];
/** File names that must not be under any extraResources source folder listed in package.json. */
export const FORBIDDEN_RESOURCE_FILES = [/\.gguf$/i, /^llama-server(\.exe)?$/i, /^ggml-.*\.bin$/i];

/**
 * @param {string} root
 * @param {string} dir
 * @returns {string[]} repo-relative file paths (never into node_modules)
 */
export function walk(root, dir) {
  /** @type {string[]} */
  const out = [];
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      out.push(...walk(root, rel));
    } else out.push(rel);
  }
  return out;
}

/**
 * Run every gate. Never throws for a failing gate — a missing file is a
 * failing gate, not a crash.
 * @param {string} root repo root
 * @returns {{ ok: boolean, label: string }[]}
 */
export function packagedToolsGates(root) {
  /** @type {{ ok: boolean, label: string }[]} */
  const results = [];
  /** @param {unknown} ok @param {string} label */
  const gate = (ok, label) => results.push({ ok: Boolean(ok), label });
  /** @param {string} p */
  const exists = (p) => fs.existsSync(path.join(root, p));
  /** @param {string} p */
  const read = (p) => (exists(p) ? fs.readFileSync(path.join(root, p), "utf8") : "");

  // 1. package.json: pnpm pin, extraResources rows, nothing heavy in the installer, identity null
  let pkg = null;
  try {
    pkg = JSON.parse(read("package.json"));
  } catch {
    pkg = null;
  }
  gate(pkg !== null, "package.json parses");
  if (pkg) {
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    gate(deps.pnpm === PNPM_PIN, `pnpm pin is exact ${PNPM_PIN} (got ${JSON.stringify(deps.pnpm)})`);
    let installed = null;
    try {
      installed = JSON.parse(read("node_modules/pnpm/package.json")).version;
    } catch {
      installed = null;
    }
    gate(installed === PNPM_PIN, `node_modules/pnpm is the pinned ${PNPM_PIN} (got ${installed ?? "not installed"})`);
    gate(exists("node_modules/pnpm/dist/pnpm.cjs") && exists("node_modules/pnpm/bin/pnpm.cjs") && exists("node_modules/pnpm/LICENSE"), "node_modules/pnpm carries bin/pnpm.cjs, dist/pnpm.cjs and LICENSE");
    gate(deps["@deepseek-ai/dsh"] === DSH_PIN, `dsh pin is exact ${DSH_PIN} (got ${deps["@deepseek-ai/dsh"]})`);
    gate(deps["@agentclientprotocol/sdk"] === ACP_SDK_PIN, `ACP SDK pin is exact ${ACP_SDK_PIN} (got ${deps["@agentclientprotocol/sdk"]})`);
    /** @type {{ from?: string, to?: string, filter?: string[] }[]} */
    const rows = Array.isArray(pkg.build?.extraResources) ? pkg.build.extraResources : [];
    const from = rows.map((r) => String(r.from ?? ""));
    gate(rows.some((r) => r.from === "dist/desktop-pnpm" && r.to === "." && Array.isArray(r.filter) && r.filter.includes("**/*")), 'extraResources has { from: "dist/desktop-pnpm", to: ".", filter: ["**/*"] }');
    gate(rows.some((r) => r.from === "dist/desktop-whisper" && r.to === "." && Array.isArray(r.filter) && r.filter.includes("**/*")), 'extraResources has { from: "dist/desktop-whisper", to: ".", filter: ["**/*"] }');
    gate(rows.some((r) => r.from === "dist/desktop-harness" && r.to === "."), "extraResources keeps dist/desktop-harness (Stage 8)");
    gate(rows.some((r) => r.from === "dist/desktop-node" && r.to === "localbot-node"), "extraResources keeps dist/desktop-node (Stage 8)");
    const heavy = from.filter((f) => FORBIDDEN_RESOURCE_FROM.some((re) => re.test(f)));
    gate(heavy.length === 0, `extraResources carries no GGUF / llama.cpp / models / runtimes row${heavy.length ? ` — ${heavy.join(", ")}` : ""}`);
    const heavyFiles = from.flatMap((f) => walk(root, f)).filter((f) => FORBIDDEN_RESOURCE_FILES.some((re) => re.test(path.basename(f))));
    gate(heavyFiles.length === 0, `no staged extraResources folder holds a .gguf / llama-server / ggml model${heavyFiles.length ? ` — ${heavyFiles.slice(0, 3).join(", ")}` : ""}`);
    gate(pkg.build?.mac?.identity === null, `build.mac.identity is null (got ${JSON.stringify(pkg.build?.mac?.identity)})`);
    gate(pkg.build?.mac?.notarize === undefined && pkg.build?.afterSign === undefined, "no notarize / afterSign config");
    const scripts = pkg.scripts ?? {};
    gate(typeof scripts["prove:packaged-tools"] === "string" && /prove-packaged-tools\.mjs/.test(scripts["prove:packaged-tools"]), "npm run prove:packaged-tools exists");
    gate(String(scripts.test ?? "").includes("src/lib/packaged-tools.test.ts"), "npm test runs src/lib/packaged-tools.test.ts");
    gate(String(scripts["build:whisper-mac"] ?? "").includes("scripts/build-whisper-mac.mjs"), "npm run build:whisper-mac still exists (the bake source)");
  }

  // 2. desktop-stage.mjs: the staging functions and honest shims
  {
    const stage = read("scripts/desktop-stage.mjs");
    gate(stage.length > 0, "scripts/desktop-stage.mjs exists");
    gate(/export function stagePnpm\(/.test(stage), "desktop-stage.mjs exports stagePnpm");
    gate(/export function pnpmShimSh\(/.test(stage) && /export function pnpmShimCmd\(/.test(stage), "desktop-stage.mjs exports both shims (sh + cmd)");
    gate(/LOCALBOT_DSH_NODE:-\$here\/\.\.\/\.\.\/localbot-node\/node/.test(stage), "sh shim runs LOCALBOT_DSH_NODE or the sibling localbot-node/node — never node from PATH");
    gate(!/exec node |exec "node"|\bnode\.exe" %HERE%|"node" "%HERE%/.test(stage), "shims never call a bare node");
    gate(/export function pnpmShimVersion\(/.test(stage) && /PATH: emptyPath/.test(stage), "desktop-stage.mjs checks a shim with an empty PATH (pnpmShimVersion)");
    gate(/export function pnpmPinOf\(/.test(stage) && /\^\\d\+\\\.\\d\+\\\.\\d\+\$/.test(stage), "pnpmPinOf refuses a floating pnpm pin");
    gate(/export function stageWhisperBuilt\(/.test(stage) && /export function checkBuiltWhisper\(/.test(stage), "desktop-stage.mjs exports stageWhisperBuilt + checkBuiltWhisper");
    gate(/manifest\.release !== catalog\.release/.test(stage) && /manifest\.commit !== row\.source\.commit/.test(stage), "checkBuiltWhisper refuses a catalog tag / commit mismatch");
    gate(!/releases\/download|fetch\(.*whisper/i.test(stage.slice(stage.indexOf("Stage 20: baked"))), "whisper staging never downloads a darwin CLI");
  }

  // 3. build-desktop.mjs wires them in and checks the packed app
  {
    const build = read("scripts/build-desktop.mjs");
    gate(build.length > 0, "scripts/build-desktop.mjs exists");
    gate(/stagePnpm\(\{ root, stage: pnpmStageRoot, pin: pnpmPin \}\)/.test(build), "build-desktop.mjs stages pnpm from the exact pin");
    gate(/pnpmShimVersion\(/.test(build) && /stagedPnpmVersion !== pnpmPin/.test(build), "build-desktop.mjs refuses when the staged shim does not print the pin on the bundled Node with an empty PATH");
    gate(/whisperTarget === "darwin-arm64"/.test(build) && /stageWhisperBuilt\(\{ root, stage: whisperStageRoot, target: whisperTarget, from \}\)/.test(build), "build-desktop.mjs stages whisper-cli on darwin-arm64 build hosts");
    gate(/--whisper-dir/.test(build) && /defaultMacBinRoot\(\)/.test(build) && /build-whisper-mac\.mjs"\), "--bin-root"/.test(build), "whisper source order: --whisper-dir, AppData Stage 10 output, build:whisper-mac");
    gate(/"resources\/localbot-pnpm\/bin\/pnpm"/.test(build) && /"resources\/localbot-pnpm\/pnpm\.cjs"/.test(build) && /"resources\/localbot-pnpm\/pnpm-runtime\.json"/.test(build), "assertLayout requires the packed pnpm shim, entry and manifest");
    gate(/resources\/localbot-whisper\/darwin-arm64\/whisper\/whisper-cli/.test(build) && /resources\/localbot-whisper\/darwin-arm64\/whisper\/whisper-build\.json/.test(build), "assertLayout requires the packed whisper-cli + manifest when staged");
    gate(/pkg\.build\?\.mac\?\.identity !== null/.test(build), "build-desktop.mjs still refuses a non-null mac.identity");
    gate(!/GGUF|\.gguf|llama-server/i.test(build), "build-desktop.mjs stages no GGUF / llama-server");
  }

  // 4. Electron main hands the sidecar the new resources, only when present
  {
    const packaged = read("desktop/packaged.mjs");
    gate(/pnpmDir: `\$\{res\}\/localbot-pnpm\/bin`/.test(packaged), "packaged.mjs: pnpmDir = resources/localbot-pnpm/bin");
    gate(/whisperDir: `\$\{res\}\/localbot-whisper\/\$\{platform\}-\$\{arch\}\/whisper`/.test(packaged), "packaged.mjs: whisperDir = resources/localbot-whisper/{platform}-{arch}/whisper");
    gate(/if \(has\(`\$\{p\.pnpmDir\}\/\$\{pnpmShimName\(platform\)\}`\)\) env\.LOCALBOT_PNPM_DIR = p\.pnpmDir;/.test(packaged), "packagedHarnessEnv sets LOCALBOT_PNPM_DIR only when the shim exists");
    gate(/env\.LOCALBOT_WHISPER_DIR = p\.whisperDir;/.test(packaged) && /whisper-build\.json`\)/.test(packaged), "packagedHarnessEnv sets LOCALBOT_WHISPER_DIR only when whisper-cli + whisper-build.json exist");
    const main = read("desktop/main.mjs");
    gate(/LOCALBOT_PNPM_DIR/.test(main) && /LOCALBOT_WHISPER_DIR/.test(main), "main.mjs reports a missing bundled pnpm / baked whisper-cli");
  }

  // 5. plugins.ts: the dsh child gets LocalBot's pnpm, never a hoped-for one
  {
    const src = read("src/lib/harness/plugins.ts");
    gate(src.length > 0, "src/lib/harness/plugins.ts exists");
    gate(/export function pnpmLookup\(/.test(src) && /env\.LOCALBOT_PNPM_DIR/.test(src), "plugins.ts: pnpmLookup reads LOCALBOT_PNPM_DIR");
    gate(/export function pnpmChildEnv\(/.test(src) && /env\[key\] = current \? `\$\{lookup\.dir\}\$\{delimiter\}\$\{current\}` : lookup\.dir;/.test(src), "plugins.ts: the bundled bin dir is prepended to the child's PATH");
    gate(/Object\.keys\(env\)\.find\(\(k\) => k\.toLowerCase\(\) === "path"\)/.test(src), "plugins.ts: PATH prepend honours a win32 `Path` key");
    gate(/env\.npm_config_store_dir = path\.join\(dshHome, "pnpm-store"\);/.test(src), "plugins.ts: npm_config_store_dir lives under DSH_HOME");
    gate(/"NO_PNPM"/.test(src) && /packaged mode never uses pnpm from PATH/.test(src), "plugins.ts: packaged mode with no bundle refuses NO_PNPM (never pnpm from PATH)");
    gate(/if \(needsPnpm && pnpm\.kind === "missing"\) throw new PluginError\("NO_PNPM", pnpm\.error\);/.test(src), "plugins.ts: resolved() throws NO_PNPM before dsh is spawned");
    gate(/const r = resolved\(o, \{ needsPnpm: true \}\);/.test(src), "plugins.ts: runDshPlugin (add / remove) requires pnpm");
    gate(/export async function pnpmStatus\(/.test(src) && /const lookup = pnpmLookup\(env, platform\);/.test(src) && /run\(lookup\.bin, \["--version"\]/.test(src), "plugins.ts: pnpmStatus probes the bundled shim first");
    gate(!/(?:spawn|spawnSync|run)\(\s*(?:process\.platform === "win32" \? "pnpm\.cmd" : )?"pnpm(?:\.cmd)?"\s*,/.test(src), "plugins.ts never spawns a bare pnpm itself (Stage 14's PATH probe is gone)");
    gate(/"NO_PNPM"/.test(read("src/lib/harness/plugins.ts").match(/export type PluginErrorCode = [^;]+;/)?.[0] ?? ""), "PluginErrorCode includes NO_PNPM");
    const model = read("src/lib/plugins-model.ts");
    gate(/source: "bundled" \| "path" \| null/.test(model), "plugins-model.ts: InstalledReport.pnpm carries its source");
  }

  // 6. stt.ts: the darwin-arm64 built row seeds from the app, no cmake on the employee's Mac
  {
    const stt = read("src/lib/runtime/stt.ts");
    gate(stt.length > 0, "src/lib/runtime/stt.ts exists");
    gate(/export function whisperResourceDir\(/.test(stt) && /env\.LOCALBOT_WHISPER_DIR/.test(stt), "stt.ts: whisperResourceDir reads LOCALBOT_WHISPER_DIR");
    gate(/export function seedWhisperFromResources\(/.test(stt), "stt.ts: seedWhisperFromResources exists");
    gate(/if \(have\.ok\) return \{ seeded: false, reason: "already-valid", error: null \};/.test(stt), "seedWhisperFromResources never overwrites a valid AppData copy");
    gate(/const check = verifyBuiltWhisper\(src, asset\);\s*if \(!check\.ok\) return \{ seeded: false, reason: "resource-invalid"/.test(stt), "seedWhisperFromResources copies only a resource that passes verifyBuiltWhisper");
    gate(/if \(asset\.kind === "built"\) \{\s*const seed = seedWhisperFromResources\(\{ target, asset, from: whisperResourceDir\(\), to: dir \}\);\s*const v = verifyBuiltWhisper\(exe, asset\);/.test(stt), "ensureWhisperRuntime seeds before it can say NOT_BUILT");
    gate(/seedWhisperFromResources\(\{ target, asset, from: resourceDir, to: dir \}\);/.test(stt), "sttStatus seeds too (fresh AppData reports supported without a Mic press)");
    gate(!/spawn[a-zA-Z]*\(\s*["'](cmake|git|clang|make)["']/.test(stt), "stt.ts never spawns cmake / git / clang / make");
    gate(!/darwin[^\n]*releases\/download/.test(stt) && !/url:[^\n]*darwin/.test(stt), "stt.ts still never downloads a darwin whisper-cli");
    let cat = null;
    try {
      cat = JSON.parse(read("catalog/whisper-assets.json"));
    } catch {
      cat = null;
    }
    gate(cat?.targets?.["darwin-arm64"]?.kind === "built" && cat.targets["darwin-arm64"].url === undefined, "catalog: darwin-arm64 stays a built row with no URL");
    gate(cat?.targets?.["darwin-x64"] === undefined, "catalog: darwin-x64 has no row (NOT BUILT)");
    gate(cat?.targets?.["linux-x64"]?.kind === "tar.gz" && cat?.targets?.["win32-x64"]?.kind === "zip", "catalog: linux / win rows unchanged (first-use downloads)");
  }

  // 7. Plugins UI: honest banner
  {
    const ui = read("src/components/localbot/plugins.tsx");
    gate(ui.length > 0, "src/components/localbot/plugins.tsx exists");
    gate(!/does not bundle pnpm/.test(ui), 'plugins.tsx no longer says "does not bundle pnpm"');
    gate(/\{report && !report\.pnpm\.found && \(/.test(ui) && /data-testid="plugins-pnpm-missing"/.test(ui), "plugins.tsx shows the red pnpm banner only when !pnpm.found");
    gate(/report\.pnpm\.source === "bundled"/.test(ui), "plugins.tsx tells the employee the pnpm is LocalBot's own when it is");
  }

  // 8. invariants earlier stages gate
  {
    const chat = read("src/components/localbot/chat.tsx");
    gate(/import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/.test(chat) && /await runAgentTurn\(\{/.test(chat), "chat.tsx keeps runAgentTurn");
    const start = read("src/start.ts");
    gate(/functionMiddleware: \[sidecarTokenMiddleware\]/.test(start) && /requestMiddleware: \[csrfMiddleware\]/.test(start), "src/start.ts keeps the Stage 17 token gate (and CSRF)");
    gate(exists("src/lib/runtime/sidecar-token-middleware.ts") && exists("desktop/sidecar-token.mjs"), "token middleware modules present");
    const main = read("desktop/main.mjs");
    gate(exists("desktop/quit-flush.mjs") && /createQuitCoordinator\(/.test(main) && /quitCoordinator\.requestQuit\(/.test(main), "desktop/main.mjs keeps the Stage 18 quit coordinator");
    gate(exists("dsh/localbot-fs.mjs") && createHash("sha256").update(read("dsh/localbot-fs.mjs")).digest("hex") === LOCALBOT_FS_SHA256, "dsh/localbot-fs.mjs unchanged (sha256 pin)");
    const proc = read("src/lib/harness/process.ts");
    gate(new RegExp(`export const DSH_PIN = "${DSH_PIN.replace(/\./g, "\\.")}";`).test(proc) && new RegExp(`export const ACP_SDK_PIN = "${ACP_SDK_PIN.replace(/\./g, "\\.")}";`).test(proc), "process.ts pins match");
    gate(/Packaged mode never uses node from PATH or ~\/\.nvm/.test(proc), "findHarnessNode still refuses PATH / nvm in packaged mode");
    gate(exists("scripts/excise-gates.mjs") && exists("scripts/prove-excise.mjs"), "Stage 19 gates still present");
  }

  return results;
}
