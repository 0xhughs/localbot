/**
 * Stage 21 — packaged catalog + channel `@` = Run all once members.
 *
 * These fail when:
 *   - the packaged layout has no resources/localbot-server/catalog/dsh-plugins.json
 *     where the sidecar reads it: build-desktop.mjs stops staging catalog/ into
 *     .output before electron-builder, or assertLayout stops requiring it, or the
 *     extraResources `.output → localbot-server` row goes
 *   - catalogRoot() stops honouring LOCALBOT_SERVER_DIR (else cwd); readPluginCatalog
 *     grows a built-in fallback; a catalog/*.json is not JSON
 *   - `@Seven` or `@Seven of Nine` with that id in memberIds still says "not a member":
 *     resolveMentions / mentionForms go, planSpeakers stops using them, longest match
 *     stops winning, or the runner stops handing membersOf(channel) to planSpeakers
 *   - chat.tsx drops runAgentTurn; dsh / ACP / pnpm pins float; the token / quit /
 *     pnpm gates go; dsh/localbot-fs.mjs changes
 *
 * Every static gate is one test, then each gate is shown to catch its
 * regression on a scratch copy of the tree, then the behaviour itself runs.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { CATALOG_RESOURCE_PATH, packagedCatalogGates } from "../../scripts/packaged-catalog-gates.mjs";
import { CATALOG_FILE, catalogPath, catalogRoot, readPluginCatalog } from "./harness/plugins.ts";
import { mentionForms, planSpeakers, resolveMentions, type ChannelMember } from "./channels-model.ts";
import { agentSlug } from "./fs/scope-model.ts";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const results = packagedCatalogGates(root);

/** scripts/desktop-stage.mjs is build-side JS; loaded by path (like the prove scripts) so tsc does not type-check the whole build helper. */
type StageMod = {
  listCatalogJson: (root: string) => string[];
  stageCatalog: (o: { root: string; into: string; log?: (s: string) => void }) => { dir: string; files: string[]; names: string[] };
  catalogLayoutChecks: (names: string[]) => string[];
  sha256File: (file: string) => string;
};
const { catalogLayoutChecks, listCatalogJson, sha256File, stageCatalog } = (await import(pathToFileURL(path.join(root, "scripts/desktop-stage.mjs")).href)) as StageMod;

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("Stage 21 — packaged-catalog gates on this tree", () => {
  it("produced gates", () => {
    assert.ok(results.length > 50, `expected a full gate list, got ${results.length}`);
  });
  for (const r of results) {
    it(r.label, () => {
      assert.equal(r.ok, true, r.label);
    });
  }
});

describe("Stage 21 — the gates themselves catch a regression", () => {
  function scratch(): string {
    const dir = tmp("lb-pc-");
    const write = (p: string, s: string) => {
      fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
      fs.writeFileSync(path.join(dir, p), s);
    };
    for (const p of [
      "package.json",
      "scripts/desktop-stage.mjs",
      "scripts/build-desktop.mjs",
      "scripts/excise-gates.mjs",
      "scripts/packaged-tools-gates.mjs",
      "scripts/prove-packaged-tools.mjs",
      "scripts/prove-channels.mjs",
      "desktop/packaged.mjs",
      "desktop/main.mjs",
      "desktop/sidecar.mjs",
      "desktop/quit-flush.mjs",
      "desktop/sidecar-token.mjs",
      "src/lib/harness/plugins.ts",
      "src/lib/harness/process.ts",
      "src/lib/runtime/plugins.ts",
      "src/lib/runtime/sidecar-token-middleware.ts",
      "src/lib/channels-model.ts",
      "src/lib/channels.test.ts",
      "src/runtime/channelRunner.ts",
      "src/components/localbot/channel.tsx",
      "src/components/localbot/chat.tsx",
      "src/start.ts",
      "dsh/localbot-fs.mjs",
    ]) {
      write(p, read(p));
    }
    for (const n of listCatalogJson(root)) write(`catalog/${n}`, read(`catalog/${n}`));
    return dir;
  }
  const failing = (dir: string) =>
    packagedCatalogGates(dir)
      .filter((r) => !r.ok)
      .map((r) => r.label);
  const edit = (dir: string, p: string, fn: (s: string) => string) => fs.writeFileSync(path.join(dir, p), fn(fs.readFileSync(path.join(dir, p), "utf8")));
  const editJson = (dir: string, p: string, fn: (j: Record<string, unknown>) => void) => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, p), "utf8"));
    fn(j);
    fs.writeFileSync(path.join(dir, p), JSON.stringify(j, null, 2));
  };

  it("a faithful scratch copy passes every gate", () => {
    assert.deepEqual(failing(scratch()), []);
  });

  it("catalog/dsh-plugins.json missing or malformed fails", () => {
    const dir = scratch();
    fs.rmSync(path.join(dir, "catalog/dsh-plugins.json"));
    assert.ok(failing(dir).some((l) => l === "catalog/dsh-plugins.json is checked in"));
    const dir2 = scratch();
    fs.writeFileSync(path.join(dir2, "catalog/dsh-plugins.json"), "{ not json");
    assert.ok(failing(dir2).some((l) => l.startsWith("every catalog/*.json parses")));
    const dir3 = scratch();
    editJson(dir3, "catalog/dsh-plugins.json", (j) => ((j.plugins as { install: { spec: string } }[])[0]!.install.spec = "https://registry.npmjs.org/-/v1/search?text=dsh"));
    assert.ok(failing(dir3).some((l) => l.includes("never registry URLs")));
  });

  it("losing the `.output → localbot-server` row fails", () => {
    const dir = scratch();
    editJson(dir, "package.json", (j) => {
      const b = j.build as { extraResources: { from: string }[] };
      b.extraResources = b.extraResources.filter((r) => r.from !== ".output");
    });
    assert.ok(failing(dir).some((l) => l.includes('{ from: ".output", to: "localbot-server" }')));
  });

  it("build-desktop.mjs no longer staging the catalog into .output, or staging it after electron-builder, or not asserting it, fails", () => {
    const dir = scratch();
    edit(dir, "scripts/build-desktop.mjs", (s) => s.replace('stageCatalog({ root, into: path.join(root, ".output") })', "null"));
    let f = failing(dir);
    assert.ok(f.some((l) => l.startsWith("build-desktop.mjs stages catalog/ into .output")));
    const dir2 = scratch();
    edit(dir2, "scripts/build-desktop.mjs", (s) => {
      const line = 'const catalogStage = stageCatalog({ root, into: path.join(root, ".output") });';
      return s.replace(line, "").replace("function assertLayout(appOutDir) {", `${line}\nfunction assertLayout(appOutDir) {`);
    });
    f = failing(dir2);
    assert.ok(f.some((l) => l.includes("BEFORE electron-builder")));
    const dir3 = scratch();
    edit(dir3, "scripts/build-desktop.mjs", (s) => s.replace("...catalogLayoutChecks(catalogStage.names),", ""));
    f = failing(dir3);
    assert.ok(f.some((l) => l.startsWith("assertLayout requires resources/localbot-server/catalog/")));
  });

  it("desktop-stage.mjs losing stageCatalog / the dsh-plugins.json requirement fails", () => {
    const dir = scratch();
    edit(dir, "scripts/desktop-stage.mjs", (s) => s.replace("export function stageCatalog(", "export function stageCatalogue("));
    assert.ok(failing(dir).some((l) => l === "desktop-stage.mjs exports stageCatalog"));
    const dir2 = scratch();
    edit(dir2, "scripts/desktop-stage.mjs", (s) => s.replace("if (!names.includes(CATALOG_REQUIRED_FILE)) throw new Error(", "if (false) throw new Error("));
    assert.ok(failing(dir2).some((l) => l === "listCatalogJson throws when catalog/ has no dsh-plugins.json"));
  });

  it("a forked resolver fails: cwd only, or a built-in fallback list", () => {
    const dir = scratch();
    edit(dir, "src/lib/harness/plugins.ts", (s) => s.replace("return dir ? path.resolve(dir) : process.cwd();", "return process.cwd();"));
    let f = failing(dir);
    assert.ok(f.some((l) => l.startsWith("plugins.ts: catalogRoot falls back to cwd")));
    const dir2 = scratch();
    edit(dir2, "src/lib/harness/plugins.ts", (s) => s.replace("export function catalogPath(root: string = catalogRoot()): string {", "export function catalogPath(root: string = process.cwd()): string {"));
    f = failing(dir2);
    assert.ok(f.some((l) => l === "plugins.ts: catalogPath = catalogRoot() + CATALOG_FILE"));
    const dir3 = scratch();
    edit(dir3, "src/lib/harness/plugins.ts", (s) => s.replace('throw new Error(`${file}: expected { version: 1, profile: "acp", plugins: [] }`);', "return DEFAULT_CATALOG;"));
    f = failing(dir3);
    assert.ok(f.some((l) => l.startsWith("readPluginCatalog has no built-in fallback list")));
    const dir4 = scratch();
    edit(dir4, "desktop/sidecar.mjs", (s) => s.replace("process.chdir(dir);", ""));
    f = failing(dir4);
    assert.ok(f.some((l) => l === "sidecar.mjs still chdirs to LOCALBOT_SERVER_DIR"));
  });

  it("@ no longer resolving like Run all fails: resolveMentions gone, planSpeakers back to exact-name tokens, runner list forked, picker changed", () => {
    const dir = scratch();
    edit(dir, "src/lib/channels-model.ts", (s) =>
      s.replace(
        "const { speakers, unknown } = resolveMentions(text, members);",
        "const speakers: string[] = []; const unknown: string[] = []; for (const name of parseMentions(text)) { const m = members.find((x) => x.name.toLowerCase() === name.toLowerCase()); if (!m) unknown.push(name); else if (!speakers.includes(m.id)) speakers.push(m.id); }",
      ),
    );
    let f = failing(dir);
    assert.ok(f.some((l) => l === "planSpeakers resolves through resolveMentions"));
    const dir2 = scratch();
    edit(dir2, "src/lib/channels-model.ts", (s) => s.replace("if (len > 0 && (!best || len > best.length)) best = { id: m.id, length: len };", "if (len > 0 && !best) best = { id: m.id, length: len };"));
    f = failing(dir2);
    assert.ok(f.some((l) => l.includes("LONGEST member form")));
    const dir3 = scratch();
    edit(dir3, "src/lib/channels-model.ts", (s) => s.replace('forms.add(folded.replace(/ /g, "_"));', ""));
    f = failing(dir3);
    assert.ok(f.some((l) => l.startsWith("mentionForms covers exact id")));
    const dir4 = scratch();
    edit(dir4, "src/runtime/channelRunner.ts", (s) => s.replace("const plan = planSpeakers(trimmed, members, { all: opts.all });", "const plan = planSpeakers(trimmed, membersOf(channel).filter((m) => !m.name.includes(' ')), { all: opts.all });"));
    f = failing(dir4);
    assert.ok(f.some((l) => l.startsWith("channelRunner hands the SAME membersOf(channel) list")));
    const dir5 = scratch();
    edit(dir5, "src/components/localbot/channel.tsx", (s) => s.replace("composer.slice(0, at) + `@${b.name} `", "composer.slice(0, at) + `@${b.id} `"));
    f = failing(dir5);
    assert.ok(f.some((l) => l.startsWith("the pane's @ picker inserts")));
    const dir6 = scratch();
    edit(dir6, "src/lib/channels-model.ts", (s) => s.replace('import { agentSlug } from "./fs/scope-model.ts";', 'import fs from "node:fs";\nconst agentSlug = (s: string) => s;'));
    f = failing(dir6);
    assert.ok(f.some((l) => l === "channels-model.ts stays browser-safe (no node: imports)"));
  });

  it("carried invariants: chat.tsx runAgentTurn, token gate, quit coordinator, pnpm gates, pins, localbot-fs sha", () => {
    const dir = scratch();
    edit(dir, "src/components/localbot/chat.tsx", (s) => s.replace('import { runAgentTurn } from "@/runtime/harnessAdapter"', 'import { runAgentTurnX } from "@/runtime/harnessAdapter"'));
    assert.ok(failing(dir).some((l) => l === "chat.tsx keeps runAgentTurn"));
    const dir2 = scratch();
    edit(dir2, "src/start.ts", (s) => s.replace("functionMiddleware: [sidecarTokenMiddleware]", "functionMiddleware: []"));
    assert.ok(failing(dir2).some((l) => l.startsWith("src/start.ts keeps the Stage 17 token gate")));
    const dir3 = scratch();
    edit(dir3, "desktop/main.mjs", (s) => s.replace(/createQuitCoordinator\(/g, "noQuit("));
    assert.ok(failing(dir3).some((l) => l.startsWith("desktop/main.mjs keeps the Stage 18 quit coordinator")));
    const dir4 = scratch();
    editJson(dir4, "package.json", (j) => {
      (j.dependencies as Record<string, string>)["@deepseek-ai/dsh"] = "^0.1.2-alpha.5";
      (j.devDependencies as Record<string, string>).pnpm = "^10";
    });
    const f4 = failing(dir4);
    assert.ok(f4.some((l) => l.startsWith("dsh pin is exact")) && f4.some((l) => l.startsWith("pnpm pin is exact")));
    const dir5 = scratch();
    edit(dir5, "src/lib/harness/plugins.ts", (s) => s.replace('if (needsPnpm && pnpm.kind === "missing") throw new PluginError("NO_PNPM", pnpm.error);', ""));
    assert.ok(failing(dir5).some((l) => l.startsWith("plugins.ts still refuses NO_PNPM")));
    const dir6 = scratch();
    edit(dir6, "dsh/localbot-fs.mjs", (s) => `${s}\n// changed\n`);
    assert.ok(failing(dir6).some((l) => l === "dsh/localbot-fs.mjs unchanged (sha256 pin)"));
    const dir7 = scratch();
    edit(dir7, "desktop/packaged.mjs", (s) => s.replace("env.LOCALBOT_PNPM_DIR = p.pnpmDir;", ""));
    assert.ok(failing(dir7).some((l) => l.startsWith("packaged.mjs still sets LOCALBOT_PNPM_DIR")));
  });
});

describe("Stage 21 — catalog staging (behaviour)", () => {
  it("listCatalogJson lists every catalog/*.json, dsh-plugins.json among them, and refuses a folder without it", () => {
    const names = listCatalogJson(root);
    assert.ok(names.includes("dsh-plugins.json"));
    assert.deepEqual(names, [...names].sort());
    const fake = tmp("lb-cat-");
    fs.mkdirSync(path.join(fake, "catalog"));
    fs.writeFileSync(path.join(fake, "catalog/models.json"), "{}");
    assert.throws(() => listCatalogJson(fake), /has no dsh-plugins\.json/);
    fs.writeFileSync(path.join(fake, "catalog/dsh-plugins.json"), "nope");
    assert.throws(() => listCatalogJson(fake), /JSON/);
  });

  it("stageCatalog copies every file byte-for-byte into <into>/catalog/ and replaces a stale copy", () => {
    const into = tmp("lb-out-");
    fs.writeFileSync(path.join(into, "stale.txt"), "x");
    fs.mkdirSync(path.join(into, "catalog"));
    fs.writeFileSync(path.join(into, "catalog/left-over.json"), "{}");
    const r = stageCatalog({ root, into, log: () => {} });
    assert.equal(r.dir, path.join(into, "catalog"));
    assert.deepEqual(r.names, listCatalogJson(root));
    for (const n of r.names) assert.equal(sha256File(path.join(into, "catalog", n)), sha256File(path.join(root, "catalog", n)), n);
    assert.equal(fs.existsSync(path.join(into, "catalog/left-over.json")), false, "the staged folder is rebuilt, not merged");
    assert.equal(fs.existsSync(path.join(into, "stale.txt")), true, "only catalog/ inside .output is touched");
  });

  it("catalogLayoutChecks names resources/localbot-server/catalog/dsh-plugins.json first, then every staged file", () => {
    const checks = catalogLayoutChecks(["whisper-assets.json", "models.json"]);
    assert.equal(checks[0], CATALOG_RESOURCE_PATH);
    assert.deepEqual(checks, [CATALOG_RESOURCE_PATH, "resources/localbot-server/catalog/whisper-assets.json", "resources/localbot-server/catalog/models.json"]);
    assert.deepEqual(catalogLayoutChecks([]), [CATALOG_RESOURCE_PATH], "even with nothing staged the required file is demanded");
  });

  it("a packed tree built from a staged .output passes the layout check; the Stage 20 shape (no catalog/) fails it", () => {
    const build = tmp("lb-pack-");
    const output = path.join(build, ".output");
    fs.mkdirSync(output, { recursive: true });
    const r = stageCatalog({ root, into: output, log: () => {} });
    const packed = path.join(build, "linux-unpacked");
    fs.cpSync(output, path.join(packed, "resources/localbot-server"), { recursive: true });
    const checks = catalogLayoutChecks(r.names);
    assert.deepEqual(checks.filter((rel) => !fs.existsSync(path.join(packed, rel))), []);
    fs.rmSync(path.join(packed, "resources/localbot-server/catalog"), { recursive: true });
    assert.ok(checks.filter((rel) => !fs.existsSync(path.join(packed, rel))).includes(CATALOG_RESOURCE_PATH));
  });
});

describe("Stage 21 — one resolver: LOCALBOT_SERVER_DIR when set, else cwd", () => {
  it("catalogRoot / catalogPath", () => {
    assert.equal(CATALOG_FILE, "catalog/dsh-plugins.json");
    assert.equal(catalogRoot({}), process.cwd());
    assert.equal(catalogRoot({ LOCALBOT_SERVER_DIR: "" }), process.cwd());
    assert.equal(catalogRoot({ LOCALBOT_SERVER_DIR: "/opt/LocalBot/resources/localbot-server" }), path.resolve("/opt/LocalBot/resources/localbot-server"));
    assert.equal(catalogPath("/x/localbot-server"), path.join("/x/localbot-server", "catalog/dsh-plugins.json"));
    assert.equal(catalogPath(), path.join(root, "catalog/dsh-plugins.json"), "dev: unset → cwd = repo root");
  });

  it("readPluginCatalog reads the staged copy through LOCALBOT_SERVER_DIR, and a missing copy is ENOENT naming that path — never a fallback", () => {
    const into = tmp("lb-srv-");
    stageCatalog({ root, into, log: () => {} });
    const viaServer = readPluginCatalog(catalogPath(catalogRoot({ LOCALBOT_SERVER_DIR: into })));
    const viaRepo = readPluginCatalog(catalogPath(root));
    assert.deepEqual(
      viaServer.plugins.map((p) => p.id),
      viaRepo.plugins.map((p) => p.id),
    );
    const hole = tmp("lb-hole-");
    assert.throws(() => readPluginCatalog(catalogPath(catalogRoot({ LOCALBOT_SERVER_DIR: hole }))), (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return msg.includes(path.join(hole, "catalog/dsh-plugins.json")) && /ENOENT/.test(msg);
    });
  });

  it("a FRESH node process with cwd elsewhere and LOCALBOT_SERVER_DIR set reads the staged catalog (the packaged sidecar's situation)", () => {
    const into = tmp("lb-srv2-");
    stageCatalog({ root, into, log: () => {} });
    const elsewhere = tmp("lb-cwd-");
    const probe = `
      import { catalogPath, readPluginCatalog } from ${JSON.stringify(pathToFileURL(path.join(root, "src/lib/harness/plugins.ts")).href)};
      const file = catalogPath();
      console.log(JSON.stringify({ file, ids: readPluginCatalog(file).plugins.map((p) => p.id) }));
    `;
    const res = spawnSync(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "--input-type=module", "-e", probe], {
      cwd: elsewhere,
      env: { ...process.env, LOCALBOT_SERVER_DIR: into, LOCALBOT_PACKAGED: "1" },
      encoding: "utf8",
    });
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout.trim().split("\n").pop()!) as { file: string; ids: string[] };
    assert.equal(out.file, path.join(into, "catalog/dsh-plugins.json"));
    assert.deepEqual(out.ids, readPluginCatalog(catalogPath(root)).plugins.map((p) => p.id));
  });
});

describe("Stage 21 — @ in a channel resolves like Run all once", () => {
  const seven: ChannelMember = { id: "bot_seven", name: "Seven" };
  const son: ChannelMember = { id: "bot_son", name: "Seven of Nine" };
  const bob: ChannelMember = { id: "bot_b", name: "Bob" };
  const members = [son, seven, bob];
  const runAll = planSpeakers("", members, { all: true }).speakers;

  it("mentionForms: id, name, agentSlug, hyphen and underscore joins — lowercased", () => {
    assert.deepEqual(mentionForms(son), ["bot_son", "seven of nine", "seven-of-nine", "seven_of_nine"]);
    assert.deepEqual(mentionForms({ id: "bot_q", name: "Q: The Q?" }), ["bot_q", "q: the q?", "q:-the-q?", "q:_the_q?", agentSlug("Q: The Q?").toLowerCase(), "q-the-q", "q_the_q"]);
  });

  it("@Seven with Seven's id in memberIds pages Seven; @Seven of Nine (what the picker inserts) pages Seven of Nine", () => {
    assert.deepEqual(planSpeakers("@Seven status?", members), { speakers: ["bot_seven"], unknown: [], reason: "mentions" });
    assert.deepEqual(planSpeakers("@Seven of Nine status?", members), { speakers: ["bot_son"], unknown: [], reason: "mentions" });
    assert.deepEqual(planSpeakers("@Seven of Nine ", members).speakers, ["bot_son"], "trailing space from the picker");
    assert.deepEqual(planSpeakers("@Seven of Nine", members).speakers, ["bot_son"], "end of text");
    assert.deepEqual(planSpeakers("@Seven of Nine, report", members).speakers, ["bot_son"], "punctuation after the name");
  });

  it("longest member form wins at each @; the earlier member wins a tie", () => {
    const r = resolveMentions("@Seven of Nine and @Seven", members);
    assert.deepEqual(r.speakers, ["bot_son", "bot_seven"]);
    assert.deepEqual(
      r.hits.map((h) => [h.text, h.memberId]),
      [
        ["Seven of Nine", "bot_son"],
        ["Seven", "bot_seven"],
      ],
    );
    const twins = [
      { id: "bot_1", name: "Sam" },
      { id: "bot_2", name: "sam" },
    ];
    assert.deepEqual(planSpeakers("@SAM", twins).speakers, ["bot_1"]);
  });

  it("case-insensitive; slugs; raw id; any whitespace run between words", () => {
    for (const t of ["@seven of nine go", "@SEVEN OF NINE go", "@seven-of-nine go", "@Seven_of_Nine go", "@bot_son go", "@BOT_SON go", "@Seven  of\tNine go"]) {
      assert.deepEqual(planSpeakers(t, members).speakers, ["bot_son"], t);
    }
  });

  it("every @ hit is one of the ids Run all once would page; several @ keep mention order, deduplicated", () => {
    const p = planSpeakers("@bob then @Seven of Nine then @seven, @Bob again", members);
    assert.deepEqual(p.speakers, ["bot_b", "bot_son", "bot_seven"]);
    for (const id of p.speakers) assert.ok(runAll.includes(id));
    assert.deepEqual(runAll, ["bot_son", "bot_seven", "bot_b"]);
  });

  it("a miss is still unknown (system line, no run): unknown name, a name whose id is not in memberIds, a prefix of a name", () => {
    assert.deepEqual(planSpeakers("@Zed do it", members), { speakers: [], unknown: ["Zed"], reason: "mentions" });
    assert.deepEqual(planSpeakers("@Seven of Nine hi", [bob]), { speakers: [], unknown: ["Seven"], reason: "mentions" });
    assert.deepEqual(planSpeakers("@Bobby?", members).unknown, ["Bobby"], "@Bob never matches @Bobby");
    assert.deepEqual(planSpeakers("@Bob-x", members).unknown, ["Bob-x"]);
    assert.deepEqual(planSpeakers("@Zoë and @zoë", members).unknown, ["Zoë"], "unicode token, deduplicated case-insensitively");
    const mixed = planSpeakers("@Zed and @Seven of Nine", members);
    assert.deepEqual(mixed, { speakers: ["bot_son"], unknown: ["Zed"], reason: "mentions" });
  });

  it("no @ (or a bare @) → the first member only; Run all only with the flag; no members → nobody — unchanged", () => {
    assert.deepEqual(planSpeakers("status?", members), { speakers: ["bot_son"], unknown: [], reason: "default-first" });
    assert.deepEqual(planSpeakers("@ nothing", members), { speakers: ["bot_son"], unknown: [], reason: "default-first" });
    assert.deepEqual(planSpeakers("everyone, @all", members).speakers, []);
    assert.deepEqual(planSpeakers("", members, { all: true }), { speakers: ["bot_son", "bot_seven", "bot_b"], unknown: [], reason: "all" });
    assert.deepEqual(planSpeakers("@Seven", []), { speakers: [], unknown: [], reason: "nobody" });
  });

  it("names with regex characters are matched literally", () => {
    const odd = [{ id: "bot_cpp", name: "C++ (Core)" }, bob];
    assert.deepEqual(planSpeakers("@C++ (Core) build", odd).speakers, ["bot_cpp"]);
    assert.deepEqual(planSpeakers("@c++-(core) build", odd).speakers, ["bot_cpp"]);
  });
});
