/**
 * Stage 21 — gates shared by src/lib/packaged-catalog.test.ts and
 * scripts/prove-packaged-catalog.mjs. Pure: read the tree under `root`,
 * return { ok, label } results. No network, no spawning.
 *
 * What counts as a regression (any one → exit 1 in the proof, a failing test):
 *   - the packaged layout has no localbot-server/catalog/dsh-plugins.json where the
 *     sidecar reads it: build-desktop.mjs stops staging catalog/ into .output before
 *     electron-builder, or assertLayout stops requiring it; extraResources loses the
 *     `.output → localbot-server` row; a catalog/*.json is not JSON or dsh-plugins.json
 *     is gone / malformed
 *   - the resolver forks: src/lib/harness/plugins.ts `catalogRoot` stops honouring
 *     LOCALBOT_SERVER_DIR (else cwd), CATALOG_FILE moves, readPluginCatalog grows a
 *     built-in fallback list, or the sidecar stops chdir-ing / main.mjs stops passing
 *     LOCALBOT_SERVER_DIR; or anything scrapes npm for a plugin list
 *   - `@` in a channel stops resolving like Run all once: channels-model.ts loses
 *     resolveMentions / mentionForms / agentSlug, planSpeakers stops calling it, the
 *     runner stops passing membersOf(channel) to planSpeakers, the pane's picker stops
 *     inserting `@${b.name} `, or channels.test.ts loses the "Seven of Nine" case
 *   - carried invariants: chat.tsx drops runAgentTurn / handoffTask-before-turn;
 *     start.ts drops the token gate; main.mjs drops the quit coordinator; the pnpm
 *     bundle gates (pin, extraResources row, LOCALBOT_PNPM_DIR, NO_PNPM) go; dsh / ACP
 *     pins float; dsh/localbot-fs.mjs changes; mac.identity !== null
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DSH_PIN = "0.1.2-alpha.5";
export const ACP_SDK_PIN = "1.4.0";
export const PNPM_PIN = "10.33.3";
export const LOCALBOT_FS_SHA256 =
  "0bb5593abecbc116a7b3c614882cfc109831e88c45b735962ce14ef904c2b0a6";
export const CATALOG_REQUIRED_FILE = "dsh-plugins.json";
export const CATALOG_RESOURCE_PATH = "resources/localbot-server/catalog/dsh-plugins.json";

/**
 * Run every gate. Never throws for a failing gate — a missing file is a
 * failing gate, not a crash.
 * @param {string} root repo root
 * @returns {{ ok: boolean, label: string }[]}
 */
export function packagedCatalogGates(root) {
  /** @type {{ ok: boolean, label: string }[]} */
  const results = [];
  /** @param {unknown} ok @param {string} label */
  const gate = (ok, label) => results.push({ ok: Boolean(ok), label });
  /** @param {string} p */
  const exists = (p) => fs.existsSync(path.join(root, p));
  /** @param {string} p */
  const read = (p) => (exists(p) ? fs.readFileSync(path.join(root, p), "utf8") : "");
  /** @param {string} p */
  const json = (p) => {
    try {
      return JSON.parse(read(p));
    } catch {
      return null;
    }
  };

  // 1. the checked-in catalog folder itself
  {
    const dir = path.join(root, "catalog");
    const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort() : [];
    gate(names.length > 0, `catalog/ holds JSON files (${names.join(", ") || "none"})`);
    gate(names.includes(CATALOG_REQUIRED_FILE), `catalog/${CATALOG_REQUIRED_FILE} is checked in`);
    const bad = names.filter((n) => json(`catalog/${n}`) === null);
    gate(bad.length === 0, `every catalog/*.json parses${bad.length ? ` — bad: ${bad.join(", ")}` : ""}`);
    const cat = json(`catalog/${CATALOG_REQUIRED_FILE}`);
    gate(
      cat?.version === 1 && cat?.profile === "acp" && Array.isArray(cat?.plugins) && cat.plugins.length > 0,
      "catalog/dsh-plugins.json is { version: 1, profile: acp, plugins: [...] }",
    );
    /** @type {string[]} */
    const specs = Array.isArray(cat?.plugins) ? cat.plugins.map((/** @type {{ install?: { spec?: unknown } }} */ p) => String(p?.install?.spec ?? "")) : [];
    gate(
      specs.length > 0 && specs.every((/** @type {string} */ s) => !/^https?:/i.test(s) && !/registry\.npmjs\.org/i.test(s)),
      "catalog entries are package names / repo paths, never registry URLs (no npm scrape)",
    );
  }

  // 2. package.json: the row that lands .output at resources/localbot-server, scripts, pins
  const pkg = json("package.json");
  gate(pkg !== null, "package.json parses");
  if (pkg) {
    /** @type {{ from?: string, to?: string }[]} */
    const rows = Array.isArray(pkg.build?.extraResources) ? pkg.build.extraResources : [];
    gate(
      rows.some((r) => r.from === ".output" && r.to === "localbot-server"),
      'extraResources has { from: ".output", to: "localbot-server" } (the sidecar folder the catalog rides in)',
    );
    gate(
      rows.some((r) => r.from === "dist/desktop-pnpm" && r.to === "."),
      "extraResources keeps dist/desktop-pnpm (Stage 20 pnpm bundle)",
    );
    gate(
      rows.some((r) => r.from === "dist/desktop-harness" && r.to === ".") && rows.some((r) => r.from === "dist/desktop-node"),
      "extraResources keeps dist/desktop-harness + dist/desktop-node (Stage 8)",
    );
    gate(!rows.some((r) => /gguf|llama|models?\b|runtimes?\b/i.test(String(r.from ?? ""))), "extraResources carries no GGUF / llama.cpp / models / runtimes row");
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    gate(deps["@deepseek-ai/dsh"] === DSH_PIN, `dsh pin is exact ${DSH_PIN} (got ${deps["@deepseek-ai/dsh"]})`);
    gate(deps["@agentclientprotocol/sdk"] === ACP_SDK_PIN, `ACP SDK pin is exact ${ACP_SDK_PIN} (got ${deps["@agentclientprotocol/sdk"]})`);
    gate(deps.pnpm === PNPM_PIN, `pnpm pin is exact ${PNPM_PIN} (got ${JSON.stringify(deps.pnpm)})`);
    gate(pkg.build?.mac?.identity === null, `build.mac.identity is null (got ${JSON.stringify(pkg.build?.mac?.identity)})`);
    const scripts = pkg.scripts ?? {};
    gate(/prove-packaged-catalog\.mjs/.test(String(scripts["prove:packaged-catalog"] ?? "")), "npm run prove:packaged-catalog exists");
    gate(String(scripts.test ?? "").includes("src/lib/packaged-catalog.test.ts"), "npm test runs src/lib/packaged-catalog.test.ts");
    gate(String(scripts.test ?? "").includes("src/lib/channels.test.ts"), "npm test runs src/lib/channels.test.ts");
    gate(/prove-channels\.mjs/.test(String(scripts["prove:channels"] ?? "")) && /prove-packaged-tools\.mjs/.test(String(scripts["prove:packaged-tools"] ?? "")), "prove:channels and prove:packaged-tools still exist");
  }

  // 3. desktop-stage.mjs: stageCatalog + the layout list, honest about dsh-plugins.json
  {
    const stage = read("scripts/desktop-stage.mjs");
    gate(stage.length > 0, "scripts/desktop-stage.mjs exists");
    gate(/export function stageCatalog\(/.test(stage), "desktop-stage.mjs exports stageCatalog");
    gate(/export function listCatalogJson\(/.test(stage) && /export function catalogLayoutChecks\(/.test(stage), "desktop-stage.mjs exports listCatalogJson + catalogLayoutChecks");
    gate(/export const CATALOG_REQUIRED_FILE = "dsh-plugins\.json";/.test(stage), 'CATALOG_REQUIRED_FILE is "dsh-plugins.json"');
    gate(/export const CATALOG_RESOURCE_DIR = "localbot-server\/catalog";/.test(stage), 'CATALOG_RESOURCE_DIR is "localbot-server/catalog"');
    gate(/if \(!names\.includes\(CATALOG_REQUIRED_FILE\)\) throw new Error\(/.test(stage), "listCatalogJson throws when catalog/ has no dsh-plugins.json");
    gate(/for \(const n of names\) JSON\.parse\(fs\.readFileSync\(path\.join\(dir, n\), "utf8"\)\);/.test(stage), "listCatalogJson refuses a catalog file that is not JSON");
    gate(/if \(sha256File\(from\) !== sha256File\(to\)\) throw new Error\(/.test(stage), "stageCatalog re-hashes every copy");
    gate(/const set = new Set\(\[CATALOG_REQUIRED_FILE, \.\.\.names\]\);/.test(stage) && /`resources\/\$\{CATALOG_RESOURCE_DIR\}\/\$\{n\}`/.test(stage), "catalogLayoutChecks always lists resources/localbot-server/catalog/dsh-plugins.json");
    gate(!/fetch\(|https?:\/\/registry\.npmjs\.org|npm (search|view)/i.test(stage.slice(stage.indexOf("Stage 21"))), "catalog staging never fetches (no npm scrape)");
  }

  // 4. build-desktop.mjs: stage before electron-builder, assert after
  {
    const build = read("scripts/build-desktop.mjs");
    gate(build.length > 0, "scripts/build-desktop.mjs exists");
    const stageCall = build.indexOf('stageCatalog({ root, into: path.join(root, ".output") })');
    const builderCall = build.indexOf("electron-builder (");
    gate(stageCall >= 0, 'build-desktop.mjs stages catalog/ into .output (stageCatalog({ root, into: path.join(root, ".output") }))');
    gate(stageCall >= 0 && builderCall > stageCall, "catalog is staged into .output BEFORE electron-builder copies .output → localbot-server");
    gate(/\.\.\.catalogLayoutChecks\(catalogStage\.names\),/.test(build), "assertLayout requires resources/localbot-server/catalog/<every staged file>");
    gate(/"resources\/localbot-server\/server\/index\.mjs",/.test(build), "assertLayout still requires the sidecar server entry");
    gate(/"resources\/localbot-pnpm\/bin\/pnpm"/.test(build), "assertLayout still requires the packed pnpm shim (Stage 20)");
    gate(!/GGUF|\.gguf|llama-server/i.test(build), "build-desktop.mjs stages no GGUF / llama-server");
    gate(/pkg\.build\?\.mac\?\.identity !== null/.test(build), "build-desktop.mjs still refuses a non-null mac.identity");
  }

  // 5. one resolver for dev and packaged
  {
    const src = read("src/lib/harness/plugins.ts");
    gate(src.length > 0, "src/lib/harness/plugins.ts exists");
    gate(/export const CATALOG_FILE = "catalog\/dsh-plugins\.json";/.test(src), 'CATALOG_FILE is "catalog/dsh-plugins.json" (same relative path in dev and packaged)');
    gate(/export function catalogRoot\(/.test(src) && /env\.LOCALBOT_SERVER_DIR/.test(src), "plugins.ts: catalogRoot reads LOCALBOT_SERVER_DIR");
    gate(/return dir \? path\.resolve\(dir\) : process\.cwd\(\);/.test(src), "plugins.ts: catalogRoot falls back to cwd (dev checkout) only when LOCALBOT_SERVER_DIR is unset");
    gate(/export function catalogPath\(root: string = catalogRoot\(\)\): string \{\s*return path\.join\(root, CATALOG_FILE\);/.test(src), "plugins.ts: catalogPath = catalogRoot() + CATALOG_FILE");
    gate(/the plugin catalog is missing \(ENOENT\)/.test(src), "readPluginCatalog names the missing path on ENOENT");
    gate(
      !/DEFAULT_CATALOG|FALLBACK_CATALOG|builtInCatalog/.test(src) && /throw new Error\(`\$\{file\}: expected \{ version: 1, profile: "acp", plugins: \[\] \}`\);/.test(src),
      "readPluginCatalog has no built-in fallback list (a missing / malformed file is an error)",
    );
    gate(!/fetch\(|registry\.npmjs\.org|npm (search|view)/i.test(src), "plugins.ts never scrapes npm for a plugin list");
    const server = read("src/lib/runtime/plugins.ts");
    gate(/readPluginCatalog\(file\)/.test(server) && /const file = catalogPath\(\);/.test(server), "pluginsCatalog server fn reads catalogPath() (no second path)");
    const sidecar = read("desktop/sidecar.mjs");
    gate(/const dir = process\.env\.LOCALBOT_SERVER_DIR;/.test(sidecar) && /process\.chdir\(dir\);/.test(sidecar), "sidecar.mjs still chdirs to LOCALBOT_SERVER_DIR");
    const main = read("desktop/main.mjs");
    gate(/LOCALBOT_SERVER_DIR: serverDir,/.test(main) && /cwd: serverDir,/.test(main), "main.mjs passes LOCALBOT_SERVER_DIR (= resources/localbot-server) and uses it as the sidecar cwd");
    gate(/path\.join\(process\.resourcesPath, "localbot-server"\)/.test(main), "main.mjs: packaged server dir is resources/localbot-server");
  }

  // 6. @ in a channel = Run all once members
  {
    const model = read("src/lib/channels-model.ts");
    gate(model.length > 0, "src/lib/channels-model.ts exists");
    gate(/import \{ agentSlug \} from "\.\/fs\/scope-model\.ts";/.test(model), "channels-model.ts imports agentSlug from the browser-safe scope-model");
    gate(!/from "node:/.test(model), "channels-model.ts stays browser-safe (no node: imports)");
    gate(/export function mentionForms\(member: ChannelMember\): string\[\]/.test(model), "channels-model.ts exports mentionForms");
    gate(/forms\.add\(id\);/.test(model) && /forms\.add\(folded\);/.test(model) && /folded\.replace\(\/ \/g, "-"\)/.test(model) && /folded\.replace\(\/ \/g, "_"\)/.test(model) && /agentSlug\(member\.name\)/.test(model), "mentionForms covers exact id, roster name, agentSlug, hyphen and underscore joins");
    gate(/export function resolveMentions\(text: string, members: readonly ChannelMember\[\]\): ResolvedMentions/.test(model), "channels-model.ts exports resolveMentions(text, members)");
    gate(/if \(len > 0 && \(!best \|\| len > best\.length\)\) best = \{ id: m\.id, length: len \};/.test(model), "resolveMentions picks the LONGEST member form at each @ (Seven of Nine beats Seven)");
    gate(/escapeRe\(form\)\.replace\(\/ \/g, "\\\\s\+"\)/.test(model) && /"iu"/.test(model), "member forms match case-insensitively with any whitespace run between words");
    gate(/const \{ speakers, unknown \} = resolveMentions\(text, members\);/.test(model), "planSpeakers resolves through resolveMentions");
    gate(/if \(speakers\.length === 0 && unknown\.length === 0\) return \{ speakers: \[members\[0\]!\.id\], unknown: \[\], reason: "default-first" \};/.test(model), "no @ → the first member (unchanged)");
    gate(/if \(opts\.all\) return \{ speakers: members\.map\(\(m\) => m\.id\), unknown: \[\], reason: "all" \};/.test(model), "Run all once still pages members.map(m => m.id) — the list @ now resolves against");
    const runner = read("src/runtime/channelRunner.ts");
    gate(/const members = membersOf\(channel\);\s*const plan = planSpeakers\(trimmed, members, \{ all: opts\.all \}\);/.test(runner), "channelRunner hands the SAME membersOf(channel) list to planSpeakers for @ and for Run all");
    gate(/for \(const id of channel\.memberIds\) \{\s*const b = bots\.find\(\(x\) => x\.id === id\);\s*if \(b\) out\.push\(\{ id: b\.id, name: b\.name \}\);/.test(runner), "membersOf = memberIds ∩ roster, by id");
    gate(/for \(const name of plan\.unknown\) \{\s*await systemLine\(channelId, `@\$\{name\} is not a member of #\$\{channel\.name\}/.test(runner), "a miss still gets the system line (no run, no handoff)");
    gate(!/handoffTask|agentFsWrite/.test(runner), "channelRunner never writes a handoff file");
    gate(/import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/.test(runner) && /turn: runAgentTurn,/.test(runner), "channelRunner still pages through runAgentTurn");
    const pane = read("src/components/localbot/channel.tsx");
    gate(/composer\.slice\(0, at\) \+ `@\$\{b\.name\} `/.test(pane), "the pane's @ picker inserts `@${b.name} ` (the multi-word form @ now understands)");
    const test = read("src/lib/channels.test.ts");
    gate(/Seven of Nine/.test(test) && /resolveMentions/.test(test) && /mentionForms/.test(test), 'channels.test.ts covers "@Seven of Nine" through resolveMentions / mentionForms');
    const prove = read("scripts/prove-channels.mjs");
    gate(/Seven of Nine/.test(prove), 'prove-channels.mjs pages "Seven of Nine" live by name');
  }

  // 7. invariants earlier stages gate
  {
    const chat = read("src/components/localbot/chat.tsx");
    gate(/import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/.test(chat) && /await runAgentTurn\(\{/.test(chat), "chat.tsx keeps runAgentTurn");
    const send = /const send = async \(text: string\) => \{([\s\S]*?)\n {2}\};/.exec(chat)?.[1] ?? "";
    gate(/await handoffTask\(bot\.id, name, trimmed\)/.test(send) && send.indexOf("await handoffTask(") < send.indexOf("await runAgentTurn("), "chat.tsx 1:1 handoffTask untouched (still before the turn)");
    gate(!/channelRunner|sendChannelMessage|resolveMentions/.test(chat), "chat.tsx knows nothing about channel mention resolution (1:1 unchanged)");
    const start = read("src/start.ts");
    gate(/functionMiddleware: \[sidecarTokenMiddleware\]/.test(start) && /requestMiddleware: \[csrfMiddleware\]/.test(start), "src/start.ts keeps the Stage 17 token gate (and CSRF)");
    gate(exists("src/lib/runtime/sidecar-token-middleware.ts") && exists("desktop/sidecar-token.mjs"), "token middleware modules present");
    const sidecar = read("desktop/sidecar.mjs");
    gate(/isSidecarToken\(process\.env\[SIDECAR_TOKEN_ENV\]\)/.test(sidecar), "sidecar.mjs still refuses to start without the token");
    const main = read("desktop/main.mjs");
    gate(exists("desktop/quit-flush.mjs") && /createQuitCoordinator\(/.test(main) && /quitCoordinator\.requestQuit\(/.test(main), "desktop/main.mjs keeps the Stage 18 quit coordinator");
    const packaged = read("desktop/packaged.mjs");
    gate(/env\.LOCALBOT_PNPM_DIR = p\.pnpmDir;/.test(packaged), "packaged.mjs still sets LOCALBOT_PNPM_DIR (Stage 20)");
    const plugins = read("src/lib/harness/plugins.ts");
    gate(/if \(needsPnpm && pnpm\.kind === "missing"\) throw new PluginError\("NO_PNPM", pnpm\.error\);/.test(plugins), "plugins.ts still refuses NO_PNPM in packaged mode without the bundle (Stage 20)");
    gate(exists("dsh/localbot-fs.mjs") && createHash("sha256").update(read("dsh/localbot-fs.mjs")).digest("hex") === LOCALBOT_FS_SHA256, "dsh/localbot-fs.mjs unchanged (sha256 pin)");
    const proc = read("src/lib/harness/process.ts");
    gate(
      new RegExp(`export const DSH_PIN = "${DSH_PIN.replace(/\./g, "\\.")}";`).test(proc) && new RegExp(`export const ACP_SDK_PIN = "${ACP_SDK_PIN.replace(/\./g, "\\.")}";`).test(proc),
      "process.ts pins match",
    );
    gate(exists("scripts/packaged-tools-gates.mjs") && exists("scripts/prove-packaged-tools.mjs") && exists("scripts/excise-gates.mjs"), "Stage 19 / 20 gate modules still present");
  }

  return results;
}
