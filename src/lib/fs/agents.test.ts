/**
 * Stage 5 — Multi-agent polish. Run:
 *   node --experimental-strip-types --test src/lib/fs/agents.test.ts
 *
 * These fail if:
 *   - rename changes the label but leaves agents/{Old}/ in place, or
 *     private/memory/notes.md does not follow
 *   - two agents share one disk folder after duplicate, or the copy lacks the
 *     source memory / AGENTS.md
 *   - archive deletes or moves any file, or is not persisted in agent.json
 *   - a name collision (case-insensitive), empty / illegal name, or missing
 *     source folder is accepted
 *   - @Name handoff can target anything but employee-shared / department-shared
 *   - `..` / absolute escapes start passing for a renamed agent
 *   - the store rename stops going through the sidecar (`agentRename`)
 *   - chat.tsx stops importing runAgentTurn, or the dsh / ACP pins float
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { makeTempRoot } from "./disk.ts";
import { agentSlug, handoffScope, type FoldersConfig } from "./scope-model.ts";
import {
  agentDirOwner,
  assertAgentName,
  copyAgent,
  ensureAgent,
  listAgentDirs,
  readAgent,
  renameAgent,
  resolveScopePath,
  ScopeError,
  scopedWrite,
  setAgentArchived,
  uniqueCopyName,
} from "./scopes.ts";

const repo = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(repo, p), "utf8");

/** Source between the first `start` and the next `end` after it. */
function section(src: string, start: string, end: string): string {
  const i = src.indexOf(start);
  assert.notEqual(i, -1, `missing "${start}"`);
  const j = src.indexOf(end, i);
  assert.notEqual(j, -1, `missing "${end}" after "${start}"`);
  return src.slice(i, j);
}

function fixture(): { folders: FoldersConfig; base: string; agents: string } {
  const base = makeTempRoot("localbot-agents-");
  const folders: FoldersConfig = {
    employeeRoot: path.join(base, "emp"),
    employeeShared: path.join(base, "emp-shared"),
    departmentShared: path.join(base, "dept-shared"),
    companyShared: path.join(base, "company-shared"),
  };
  for (const p of Object.values(folders)) fs.mkdirSync(p!, { recursive: true });
  return { folders, base, agents: path.join(folders.employeeRoot, "agents") };
}

function seed(folders: FoldersConfig, name: string, scopes: string[] = ["private", "employee-shared"]) {
  return ensureAgent(folders, {
    name,
    job: "Drafts briefs",
    modelId: "qwen25-05b-q4",
    color: "sage",
    mascotId: "writer",
    scopes,
    standingInstructions: "Keep it short.",
    createdAt: "2026-09-03T00:00:00.000Z",
  });
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof ScopeError) return err.code;
    throw err;
  }
  return "OK";
}

/** Every file under `dir` as `relative path → content`, symlinks not followed. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out[path.relative(dir, p).split(path.sep).join("/")] = fs.readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return out;
}

describe("agent names", () => {
  it("rejects empty, illegal, reserved and dot names; accepts ordinary ones", () => {
    for (const bad of ["", "   ", "a/b", "a\\b", "x:y", "q?", "*", "<x>", "a|b", '"q"', ".", "..", ".hidden", "Trail.", "CON", "com1", "a\tb", "x".repeat(65)]) {
      assert.equal(code(() => assertAgentName(bad)), "BAD_NAME", JSON.stringify(bad));
    }
    assert.equal(assertAgentName("  Writer  two "), "Writer two");
    assert.equal(assertAgentName("Ops-2 (EMEA)"), "Ops-2 (EMEA)");
    assert.equal(agentSlug("Writer"), "Writer");
  });
});

describe("rename moves agents/{Old}/ → agents/{New}/", () => {
  it("the whole tree follows: agent.json, AGENTS.md, private/memory/notes.md, private/output", () => {
    const { folders, agents } = fixture();
    const w = seed(folders, "Writer");
    fs.writeFileSync(path.join(w.privatePath, "memory", "notes.md"), "# Memory\n\nremember the brief\n");
    fs.writeFileSync(path.join(w.privatePath, "output", "draft.md"), "draft v1");
    fs.writeFileSync(path.join(w.privatePath, "AGENTS.md"), "# Writer\n\nmirrored\n");
    const before = snapshot(path.join(agents, "Writer"));

    const r = renameAgent(folders, "Writer", "Author");
    assert.equal(r.name, "Author");
    assert.equal(r.agentDir, path.join(agents, "Author"));
    assert.equal(r.privatePath, path.join(agents, "Author", "private"));
    assert.equal(fs.existsSync(path.join(agents, "Writer")), false, "old folder must be gone");
    assert.equal(fs.existsSync(path.join(agents, "Author")), true);
    assert.deepEqual(listAgentDirs(folders), ["Author"]);

    const after = snapshot(path.join(agents, "Author"));
    assert.equal(after["private/memory/notes.md"], "# Memory\n\nremember the brief\n", "memory notes follow");
    assert.equal(after["private/output/draft.md"], "draft v1", "output follows");
    assert.equal(Object.keys(after).length, Object.keys(before).length, "no file lost or invented");

    const rec = readAgent(folders, "Author");
    assert.equal(rec?.name, "Author");
    assert.deepEqual(rec?.scopes, ["private", "employee-shared"]);
    assert.equal(rec?.createdAt, "2026-09-03T00:00:00.000Z", "record fields survive");
    assert.equal(readAgent(folders, "Writer"), null);
    assert.match(after["AGENTS.md"]!, /^# Author\n/);
    assert.match(after["AGENTS.md"]!, /Keep it short\./, "standing instructions body untouched");
    assert.match(after["private/AGENTS.md"]!, /^# Author\n/);

    // Chat / Computer pane / Harness cwd all derive from the name → the new folder.
    const priv = resolveScopePath(folders, { scope: "private", relPath: "", agentName: "Author" });
    assert.equal(priv.abs, path.join(agents, "Author", "private"));
    assert.equal(scopedWrite(folders, { scope: "private", relPath: "after.md", agentName: "Author" }, "x"), "private/after.md");
    assert.equal(fs.existsSync(path.join(agents, "Author", "private", "after.md")), true);
    assert.equal(fs.existsSync(path.join(agents, "Writer")), false, "writing as the new name never recreates the old folder");
  });

  it("refuses empty / illegal names, a missing source, and a collision — and moves nothing", () => {
    const { folders, agents } = fixture();
    seed(folders, "Writer");
    seed(folders, "Editor");
    const before = { w: snapshot(path.join(agents, "Writer")), e: snapshot(path.join(agents, "Editor")) };

    assert.equal(code(() => renameAgent(folders, "Writer", "")), "BAD_NAME");
    assert.equal(code(() => renameAgent(folders, "Writer", "  ")), "BAD_NAME");
    assert.equal(code(() => renameAgent(folders, "Writer", "a/b")), "BAD_NAME");
    assert.equal(code(() => renameAgent(folders, "Writer", "..")), "BAD_NAME");
    assert.equal(code(() => renameAgent(folders, "Writer", "../escape")), "BAD_NAME");
    assert.equal(code(() => renameAgent(folders, "Writer", "Editor")), "EXISTS");
    assert.equal(code(() => renameAgent(folders, "Writer", "editor")), "EXISTS", "case-insensitive collision");
    assert.equal(code(() => renameAgent(folders, "Writer", "EDITOR ")), "EXISTS");
    assert.equal(code(() => renameAgent(folders, "Ghost", "Anything")), "NOT_FOUND");

    assert.deepEqual(listAgentDirs(folders).sort(), ["Editor", "Writer"]);
    assert.deepEqual(snapshot(path.join(agents, "Writer")), before.w);
    assert.deepEqual(snapshot(path.join(agents, "Editor")), before.e);
    assert.equal(fs.existsSync(path.join(folders.employeeRoot, "escape")), false);
  });

  it("a case-only rename (Writer → writer) goes through a temp name and keeps every file", () => {
    const { folders, agents } = fixture();
    const w = seed(folders, "Writer");
    fs.writeFileSync(path.join(w.privatePath, "memory", "notes.md"), "case test");
    const r = renameAgent(folders, "Writer", "writer");
    assert.equal(r.name, "writer");
    assert.deepEqual(listAgentDirs(folders), ["writer"], "exactly one folder, new casing");
    assert.equal(fs.readFileSync(path.join(agents, "writer", "private", "memory", "notes.md"), "utf8"), "case test");
    assert.equal(readAgent(folders, "writer")?.name, "writer");
    assert.equal(fs.readdirSync(agents).some((d) => d.startsWith(".rename-")), false, "no temp folder left behind");
    // Same name again is a no-op, not an error.
    assert.equal(renameAgent(folders, "writer", "writer").name, "writer");
  });
});

describe("duplicate copies the private tree into a new folder", () => {
  it("copyAgent: separate folders, memory + output + AGENTS.md copied, fresh agent.json", () => {
    const { folders, agents } = fixture();
    const w = seed(folders, "Writer", ["private", "department-shared"]);
    fs.writeFileSync(path.join(w.privatePath, "memory", "notes.md"), "# Memory\n\nlearned things\n");
    fs.writeFileSync(path.join(w.privatePath, "output", "report.md"), "final");
    fs.mkdirSync(path.join(w.privatePath, "drafts"));
    fs.writeFileSync(path.join(w.privatePath, "drafts", "a.md"), "wip");
    fs.writeFileSync(path.join(w.privatePath, "AGENTS.md"), "# Writer\n\nstale mirror\n");
    fs.writeFileSync(path.join(agents, "Writer", "AGENTS.md"), "# Writer\n\nDrafts briefs\n\nAlways cite sources.\n");

    const name = uniqueCopyName(folders, "Writer");
    assert.equal(name, "Writer copy");
    const c = copyAgent(folders, "Writer", name, "2026-09-03T12:00:00.000Z");
    assert.notEqual(c.privatePath, w.privatePath, "two agents never share a folder");
    assert.equal(c.agentDir, path.join(agents, "Writer copy"));
    assert.equal(fs.realpathSync(c.privatePath) !== fs.realpathSync(w.privatePath), true);

    const copied = snapshot(c.agentDir);
    assert.equal(copied["private/memory/notes.md"], "# Memory\n\nlearned things\n");
    assert.equal(copied["private/output/report.md"], "final");
    assert.equal(copied["private/drafts/a.md"], "wip");
    assert.equal(copied["AGENTS.md"], "# Writer copy\n\nDrafts briefs\n\nAlways cite sources.\n", "standing instructions copied, retitled");
    assert.equal("private/AGENTS.md" in copied, false, "the mirrored copy is regenerated by the sidecar, not copied");
    const rec = readAgent(folders, "Writer copy");
    assert.equal(rec?.name, "Writer copy");
    assert.deepEqual(rec?.scopes, ["private", "department-shared"]);
    assert.equal(rec?.createdAt, "2026-09-03T12:00:00.000Z");
    assert.equal(rec?.archived, false);

    // Writes into the copy do not appear in the source and vice versa.
    scopedWrite(folders, { scope: "private", relPath: "memory/notes.md", agentName: "Writer copy" }, "copy's notes");
    assert.equal(fs.readFileSync(path.join(w.privatePath, "memory", "notes.md"), "utf8"), "# Memory\n\nlearned things\n");
    scopedWrite(folders, { scope: "private", relPath: "only-src.md", agentName: "Writer" }, "src");
    assert.equal(fs.existsSync(path.join(c.privatePath, "only-src.md")), false);

    // Next copy name skips the taken one; collisions on disk are refused.
    assert.equal(uniqueCopyName(folders, "Writer"), "Writer copy 2");
    assert.equal(uniqueCopyName(folders, "Writer copy"), "Writer copy 2");
    assert.equal(uniqueCopyName(folders, "Writer", ["Writer copy 2"]), "Writer copy 3");
    assert.equal(code(() => copyAgent(folders, "Writer", "Writer copy")), "EXISTS");
    assert.equal(code(() => copyAgent(folders, "Writer", "writer COPY")), "EXISTS");
    assert.equal(code(() => copyAgent(folders, "Writer", "WRITER")), "EXISTS", "cannot duplicate onto the source's own name");
    assert.equal(code(() => copyAgent(folders, "Nobody", "X")), "NOT_FOUND");
    assert.equal(code(() => copyAgent(folders, "Writer", "bad/name")), "BAD_NAME");
    assert.deepEqual(listAgentDirs(folders).sort(), ["Writer", "Writer copy"]);
  });

  it("ensureAgent refuses to adopt a folder that differs only by case", () => {
    const { folders } = fixture();
    seed(folders, "Writer");
    assert.equal(code(() => seed(folders, "writer")), "EXISTS");
    assert.equal(agentDirOwner(folders, "WRITER"), "Writer");
    assert.equal(agentDirOwner(folders, "Nobody"), null);
    assert.deepEqual(listAgentDirs(folders), ["Writer"]);
  });
});

describe("archive keeps every file", () => {
  it("setAgentArchived flips only agent.json; unarchive restores; ensureAgent preserves it", () => {
    const { folders, agents } = fixture();
    const w = seed(folders, "Writer");
    fs.writeFileSync(path.join(w.privatePath, "memory", "notes.md"), "keep me");
    fs.writeFileSync(path.join(w.privatePath, "output", "deliverable.md"), "keep me too");
    const before = snapshot(path.join(agents, "Writer"));

    const rec = setAgentArchived(folders, "Writer", true);
    assert.equal(rec.archived, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(agents, "Writer", "agent.json"), "utf8")).archived, true, "persisted on disk");
    assert.equal(readAgent(folders, "Writer")?.archived, true);
    const after = snapshot(path.join(agents, "Writer"));
    delete before["agent.json"];
    delete after["agent.json"];
    assert.deepEqual(after, before, "archive changed a file other than agent.json");
    assert.equal(fs.existsSync(w.privatePath), true);
    assert.deepEqual(listAgentDirs(folders), ["Writer"], "archive must not remove or move the folder");

    // Re-hydrating from the browser (ensureAgents) keeps the disk flag.
    const again = seed(folders, "Writer");
    assert.equal(again.archived, true);
    assert.equal(readAgent(folders, "Writer")?.archived, true);

    assert.equal(setAgentArchived(folders, "Writer", false).archived, false);
    assert.equal(readAgent(folders, "Writer")?.archived, false);
    const restored = snapshot(path.join(agents, "Writer"));
    delete restored["agent.json"];
    assert.deepEqual(restored, before);
    assert.equal(code(() => setAgentArchived(folders, "Ghost", true)), "NOT_FOUND");
  });
});

describe("@Name handoff target folders", () => {
  it("handoffScope is employee-shared, else department-shared, else null — never company-shared or private", () => {
    const f: FoldersConfig = { employeeRoot: "/e", employeeShared: "/s", departmentShared: "/d", companyShared: "/c" };
    assert.equal(handoffScope(f), "employee-shared");
    assert.equal(handoffScope({ ...f, employeeShared: null }), "department-shared");
    assert.equal(handoffScope({ ...f, employeeShared: null, departmentShared: null }), null, "company-shared alone is not a handoff target");
    assert.equal(handoffScope({ employeeRoot: "/e", employeeShared: null, departmentShared: null, companyShared: null }), null);
  });

  it("the task file lands in the shared folder on disk, and only when both agents are granted it", () => {
    const { folders } = fixture();
    seed(folders, "Writer", ["private", "employee-shared"]);
    seed(folders, "Editor", ["private"]);
    const scope = handoffScope(folders)!;
    const file = `task-1-Writer-to-Editor.md`;
    assert.equal(scopedWrite(folders, { scope, relPath: file, agentName: "Writer" }, "# Handoff\n"), `employee-shared/${file}`);
    assert.equal(fs.existsSync(path.join(folders.employeeShared!, file)), true);
    assert.equal(fs.existsSync(path.join(folders.employeeRoot, file)), false);
    assert.equal(code(() => scopedWrite(folders, { scope, relPath: file, agentName: "Editor" }, "x")), "NOT_GRANTED");
    assert.equal(code(() => scopedWrite(folders, { scope, relPath: `../${file}`, agentName: "Writer" }, "x")), "BAD_PATH");
  });

  it("store: handoff resolves the scope with handoffScope, refuses archived / hidden targets, writes through agentFsWrite", () => {
    const store = read("src/lib/store.ts");
    const body = section(store, "handoffTask: async", "updateSettings:");
    assert.match(body, /handoffScope\(s\.folders\)/);
    assert.match(body, /to\.archived/);
    assert.match(body, /to\.hidden/);
    assert.match(body, /agentFsWrite\(\{\s*data: \{ scope, relPath: filename, agentName: from\.name/);
    assert.equal(body.includes('"company-shared"'), false);
    assert.equal(body.includes('"private"'), false);
  });
});

describe("escapes still fail closed for a renamed agent", () => {
  it("`..`, absolute, drive and UNC paths are BAD_PATH; symlinks out are ESCAPE", () => {
    const { folders, base } = fixture();
    seed(folders, "Writer");
    renameAgent(folders, "Writer", "Author");
    const t = (rel: string) => code(() => resolveScopePath(folders, { scope: "private", relPath: rel, agentName: "Author" }));
    for (const rel of ["../x", "..", "a/../../x", "/etc/passwd", "C:\\x", "\\\\srv\\share"]) assert.equal(t(rel), "BAD_PATH", rel);
    const outside = path.join(base, "outside");
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(folders.employeeRoot, "agents", "Author", "private", "out"), "dir");
    assert.equal(t("out/x.md"), "ESCAPE");
    assert.equal(code(() => renameAgent(folders, "Author", "../../evil")), "BAD_NAME");
  });
});

describe("wiring that must not regress", () => {
  it("store rename goes through the sidecar (agentRename), not a label-only update", () => {
    const store = read("src/lib/store.ts");
    const body = section(store, "renameBot: async", "updateBot:");
    assert.match(body, /await agentRename\(\{ data: \{ agentName: bot\.name, newName/);
    assert.match(body, /privatePath: r\.privatePath/, "the new private path comes from the sidecar");
    assert.equal(store.includes("function slugName"), false, "store.slugName is gone; agentSlug is the one cleaner");
    assert.match(store, /agentSlug/);
  });

  it("duplicate copies on disk via agentDuplicate; archive persists via agentSetArchived; delete still uses agentRemove", () => {
    const store = read("src/lib/store.ts");
    const dup = section(store, "duplicateBot: async", "hideBot:");
    assert.match(dup, /await agentDuplicate\(/);
    assert.equal(dup.includes("createBot("), false, "a store-only clone through createBot is a fail");
    const arch = section(store, "archiveBot: async", "pinBot:");
    assert.match(arch, /await agentSetArchived\(/);
    assert.equal(arch.includes("agentRemove"), false, "archive must never remove the folder");
    const del = section(store, "deleteBot: async", "setBotScopes:");
    assert.match(del, /await agentRemove\(/);

    const server = read("src/lib/fs/server.ts");
    for (const fn of ["agentRename", "agentDuplicate", "agentSetArchived"]) assert.match(server, new RegExp(`export const ${fn} = createServerFn`));
    assert.match(server, /renameAgent\(requireFolders\(\), data\.agentName, data\.newName\)/);
    assert.match(server, /harness\.forgetSession\(data\.agentName\)/);
    assert.match(server, /hasActiveTurn\(data\.agentName\)/);

    const scopes = read("src/lib/fs/scopes.ts");
    const archiveFn = section(scopes, "export function setAgentArchived", "\nexport function ");
    assert.equal(/rmSync|unlinkSync|renameSync|rmdirSync/.test(archiveFn), false, "archive touches only agent.json");
    const renameFn = section(scopes, "export function renameAgent", "export function uniqueCopyName");
    assert.match(renameFn, /fs\.renameSync\(src, dst\)/, "rename must move the folder");
    assert.equal(/cpSync|rmSync/.test(renameFn), false, "rename moves; it never copies or deletes");
  });

  it("sidebar wires Rename / Archive / Unarchive next to Hide and Delete", () => {
    const sidebar = read("src/components/localbot/sidebar.tsx");
    for (const action of ["renameBot", "archiveBot", "duplicateBot", "hideBot", "deleteBot", "archivedBots"]) {
      assert.ok(sidebar.includes(action), `sidebar uses ${action}`);
    }
    assert.match(sidebar, /archiveBot\(bot\.id, true\)/);
    assert.match(sidebar, /archiveBot\(bot\.id, false\)/, "unarchive control");
    assert.match(sidebar, />\s*Rename\s*</);
    assert.match(sidebar, />\s*Hide\s*</);
  });

  it("chat.tsx still sends through runAgentTurn and the Harness pins are exact", () => {
    assert.match(read("src/components/localbot/chat.tsx"), /import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/);
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    assert.equal(pkg.dependencies["@deepseek-ai/dsh"], "0.1.2-alpha.5");
    assert.equal(pkg.dependencies["@agentclientprotocol/sdk"], "1.4.0");
    const adapter = read("src/runtime/harnessAdapter.ts");
    assert.equal(/\bwhile\s*\(\s*rounds/.test(adapter), false);
  });

  it("Harness manager can forget a session and refuses while a turn is active", () => {
    const mgr = read("src/lib/harness/index.ts");
    assert.match(mgr, /forgetSession\(agentName: string\)/);
    assert.match(mgr, /hasActiveTurn\(agentName: string\)/);
    assert.match(mgr, /this\.sessions\.delete\(agentName\)/);
  });
});
