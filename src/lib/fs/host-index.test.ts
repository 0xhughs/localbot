/**
 * Stage 7 — Durable AppData state. Run:
 *   node --experimental-strip-types --test src/lib/fs/host-index.test.ts
 *
 * Fails if:
 *   - the roster still lives only in localStorage (store.ts persists bots /
 *     sessions / onboarded, or app.tsx does not load from the sidecar)
 *   - a data dir with agents/ on disk yields an empty roster with no browser state
 *   - rename / archive / duplicate do not survive a reload from disk
 *   - host JSON files are not written temp + rename with a .bak
 *   - chats land under a scope root (the model could read them as work files)
 *   - the migration from localbot-state-v3 is lossy or not idempotent
 *   - HarnessManager does not persist / resume / clear the ACP session id
 *   - chat.tsx drops runAgentTurn, or the dsh / ACP pins float
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { atomicWriteJson, configPath, loadConfig, makeTempRoot, patchConfig } from "./disk.ts";
import {
  assertChatsOutsideScopes,
  chatPath,
  chatsDir,
  clearAgentSession,
  ensureRow,
  findRow,
  hostIndexExists,
  hostIndexPath,
  loadHostIndex,
  loadRoster,
  migrateLegacySnapshot,
  patchHostIndex,
  patchRowById,
  readAgentSession,
  readAllChats,
  readChat,
  removeRow,
  renameRow,
  resetHostIndex,
  writeAgentSession,
  writeChat,
  type LegacySnapshot,
} from "./host-index.ts";
import type { FoldersConfig } from "./scope-model.ts";
import { copyAgent, ensureAgent, readAgent, removeAgent, renameAgent, setAgentArchived, setFolders } from "./scopes.ts";

const repo = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(repo, p), "utf8");

let dataDir: string;
let folders: FoldersConfig;
const prevDataDir = process.env.LOCALBOT_DATA_DIR;

function mkAgent(name: string, extra: Partial<Parameters<typeof ensureAgent>[1]> = {}) {
  return ensureAgent(folders, {
    name,
    job: `${name} job`,
    modelId: "qwen25-05b-q4",
    color: "sage",
    mascotId: "writer",
    scopes: ["private"],
    standingInstructions: `Be ${name}.`,
    createdAt: "2026-09-04T00:00:00.000Z",
    ...extra,
  });
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-stage7-"));
  process.env.LOCALBOT_DATA_DIR = dataDir;
  const base = makeTempRoot("lb-stage7-root-");
  const set = setFolders(
    { employeeRoot: path.join(base, "emp"), employeeShared: path.join(base, "emp-shared"), departmentShared: null, companyShared: null },
    { create: true },
  );
  assert.ok(set.ok);
  folders = set.folders;
});

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.LOCALBOT_DATA_DIR;
  else process.env.LOCALBOT_DATA_DIR = prevDataDir;
});

describe("Stage 7 — atomic host writes", () => {
  it("atomicWriteJson leaves no temp file, keeps the previous copy as .bak, and never a truncated file", () => {
    const file = path.join(dataDir, "x.json");
    atomicWriteJson(file, { a: 1 });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { a: 1 });
    assert.equal(fs.existsSync(`${file}.bak`), false, "no .bak before a second write");
    atomicWriteJson(file, { a: 2 });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { a: 2 });
    assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`, "utf8")), { a: 1 });
    assert.deepEqual(fs.readdirSync(dataDir).filter((n) => n.includes(".tmp")), [], "temp file renamed away");
  });

  it("patchConfig writes localbot-config.json through the same temp + rename path (with .bak)", () => {
    patchConfig({ allowHostedDemo: false });
    patchConfig({ useExistingOllama: true });
    assert.ok(fs.existsSync(`${configPath()}.bak`));
    assert.equal(loadConfig().useExistingOllama, true);
    const src = read("src/lib/fs/disk.ts");
    assert.match(src, /function writeConfigFile\(cfg: DiskConfig\): void \{\s*atomicWriteJson\(configPath\(\), cfg\);/);
    assert.match(src, /fs\.renameSync\(tmp, file\)/);
  });

  it("the host index and chat files are written atomically too", () => {
    ensureRow("Writer");
    ensureRow("Editor");
    assert.ok(fs.existsSync(`${hostIndexPath()}.bak`));
    const row = findRow(loadHostIndex(), "Writer")!;
    writeChat(row.id, { messages: [{ id: "m1" }], chatGrants: {}, lastReadAt: "" }, folders);
    writeChat(row.id, { messages: [{ id: "m1" }, { id: "m2" }], chatGrants: {}, lastReadAt: "" }, folders);
    assert.ok(fs.existsSync(`${chatPath(row.id)}.bak`));
    assert.equal(readChat(row.id)!.messages.length, 2);
  });
});

describe("Stage 7 — roster = agents/*/agent.json ⋈ host index", () => {
  it("a data dir with agents/ on disk and no browser state at all yields the roster (localStorage wiped)", () => {
    mkAgent("Writer");
    mkAgent("Editor");
    assert.equal(hostIndexExists(), false, "nothing has written an index yet");
    // This is exactly what stateLoad does for a browser whose localStorage is empty.
    const roster = loadRoster(folders);
    assert.deepEqual(roster.map((r) => r.name), ["Editor", "Writer"]);
    for (const r of roster) {
      assert.match(r.id, /^bot_[0-9a-f]{8}$/);
      assert.equal(r.job, `${r.name} job`);
      assert.equal(r.modelId, "qwen25-05b-q4");
      assert.equal(r.archived, false);
      assert.equal(r.pinned, false);
      assert.equal(r.privatePath, path.join(folders.employeeRoot, "agents", r.name, "private"));
      assert.equal(r.standingInstructions, `Be ${r.name}.`);
    }
    assert.ok(hostIndexExists(), "the join wrote the missing rows");
    // Stable across reloads.
    const again = loadRoster(folders);
    assert.deepEqual(again.map((r) => r.id), roster.map((r) => r.id));
  });

  it("a hand-copied agent folder appears with a new id; a hand-deleted folder leaves the roster", () => {
    mkAgent("Writer");
    const first = loadRoster(folders);
    const agents = path.join(folders.employeeRoot, "agents");
    fs.cpSync(path.join(agents, "Writer"), path.join(agents, "Copied"), { recursive: true });
    const rec = JSON.parse(fs.readFileSync(path.join(agents, "Copied", "agent.json"), "utf8")) as { name: string };
    rec.name = "Copied";
    fs.writeFileSync(path.join(agents, "Copied", "agent.json"), JSON.stringify(rec));
    const roster = loadRoster(folders);
    assert.deepEqual(roster.map((r) => r.name), ["Copied", "Writer"]);
    assert.notEqual(roster[0]!.id, first[0]!.id);
    fs.rmSync(path.join(agents, "Writer"), { recursive: true });
    assert.deepEqual(loadRoster(folders).map((r) => r.name), ["Copied"]);
    assert.ok(findRow(loadHostIndex(), "Writer"), "the row is kept so its chat file stays addressable");
  });

  it("pinned / hidden / unread live in the index, not the browser, and agent.json is not touched by them", () => {
    mkAgent("Writer");
    const [w] = loadRoster(folders);
    const before = fs.readFileSync(path.join(folders.employeeRoot, "agents", "Writer", "agent.json"), "utf8");
    patchRowById(w!.id, { pinned: true, hidden: true, unread: 3 });
    const [after] = loadRoster(folders);
    assert.equal(after!.pinned, true);
    assert.equal(after!.hidden, true);
    assert.equal(after!.unread, 3);
    assert.equal(fs.readFileSync(path.join(folders.employeeRoot, "agents", "Writer", "agent.json"), "utf8"), before);
    assert.equal(patchRowById("bot_nope", { pinned: true }), null);
  });

  it("rename keeps the id and drops the persisted session; archive survives a reload; duplicate is a new row", () => {
    mkAgent("Writer");
    const [w] = loadRoster(folders);
    const cwd = path.join(folders.employeeRoot, "agents", "Writer", "private");
    writeAgentSession("Writer", "sess-1", cwd);
    writeChat(w!.id, { messages: [{ id: "m1", content: "hi" }], chatGrants: { "acp:shell": true }, lastReadAt: "" }, folders);
    // The order agentRename uses: disk first, then the index row.
    renameAgent(folders, "Writer", "Author");
    const row = renameRow("Writer", "Author");
    assert.ok(row);
    assert.equal(row.id, w!.id, "same id after rename");
    assert.equal(row.sessionId, null, "the session pointed at agents/Writer/private");
    assert.equal(readAgentSession("Author"), null);
    const roster = loadRoster(folders);
    assert.deepEqual(roster.map((r) => [r.name, r.id]), [["Author", w!.id]]);
    assert.equal(readChat(w!.id)!.messages.length, 1, "chats are keyed by id; rename does not move them");

    setAgentArchived(folders, "Author", true);
    clearAgentSession("Author");
    assert.equal(loadRoster(folders)[0]!.archived, true, "archived is read from agent.json on reload");
    setAgentArchived(folders, "Author", false);

    copyAgent(folders, "Author", "Author copy");
    const dup = ensureRow("Author copy");
    assert.notEqual(dup.id, w!.id);
    const names = loadRoster(folders).map((r) => [r.name, r.id]);
    assert.deepEqual(names, [["Author", w!.id], ["Author copy", dup.id]]);

    removeAgent(folders, "Author copy");
    removeRow("Author copy");
    assert.deepEqual(loadRoster(folders).map((r) => r.name), ["Author"]);
    assert.equal(findRow(loadHostIndex(), "Author copy"), undefined);
  });

  it("onboarded / labels / selectedCatalogId are in the index; reset keeps a .bak and leaves agent folders", () => {
    mkAgent("Writer");
    patchHostIndex({
      onboarded: true,
      company: { id: "co_1", name: "Acme", createdAt: "2026-09-04T00:00:00.000Z" },
      department: { id: "dept_1", name: "Ops", createdAt: "" },
      employee: { id: "emp_1", name: "Sam", createdAt: "" },
      selectedCatalogId: "qwen25-15b-q4",
    });
    const idx = loadHostIndex();
    assert.equal(idx.onboarded, true);
    assert.equal(idx.company?.name, "Acme");
    assert.equal(idx.employee?.id, "emp_1");
    assert.equal(idx.selectedCatalogId, "qwen25-15b-q4");
    resetHostIndex();
    assert.equal(loadHostIndex().onboarded, false);
    assert.equal(JSON.parse(fs.readFileSync(`${hostIndexPath()}.bak`, "utf8")).onboarded, true);
    assert.ok(readAgent(folders, "Writer"), "reset never deletes an agent folder");
  });
});

describe("Stage 7 — chats on disk, outside every scope", () => {
  it("chats/{agentId}.json holds messages + chatGrants and is not under private/ or any scope root", () => {
    mkAgent("Writer");
    const [w] = loadRoster(folders);
    writeChat(w!.id, { messages: [{ id: "m1", role: "user", content: "hello" }], chatGrants: { "acp:shell": true }, lastReadAt: "t" }, folders);
    const file = chatPath(w!.id);
    assert.equal(path.dirname(file), chatsDir());
    assert.equal(chatsDir(), path.join(dataDir, "chats"));
    for (const root of [folders.employeeRoot, folders.employeeShared!, w!.privatePath]) {
      assert.equal(path.relative(root, file).startsWith(".."), true, `${file} must not be under ${root}`);
    }
    const all = readAllChats();
    assert.deepEqual(Object.keys(all), [w!.id]);
    assert.deepEqual(all[w!.id]!.chatGrants, { "acp:shell": true });
    assert.equal(all[w!.id]!.lastReadAt, "t");
    assert.throws(() => chatPath("../escape"), /Bad agent id/);
    assert.throws(() => chatPath("a/b"), /Bad agent id/);
  });

  it("refuses to write chats when the data dir sits inside a scope folder", () => {
    process.env.LOCALBOT_DATA_DIR = path.join(folders.employeeRoot, "data");
    assert.throws(() => assertChatsOutsideScopes(folders), /Refusing to store chats under a scope folder/);
    assert.throws(() => writeChat("bot_x", { messages: [], chatGrants: {}, lastReadAt: "" }, folders), /Refusing/);
    assert.equal(fs.existsSync(path.join(folders.employeeRoot, "data", "chats")), false);
    process.env.LOCALBOT_DATA_DIR = dataDir;
    assert.doesNotThrow(() => assertChatsOutsideScopes(folders));
  });

  it("Delete removes the row and its chat file; nothing else in chats/ is touched", () => {
    mkAgent("Writer");
    mkAgent("Editor");
    const roster = loadRoster(folders);
    for (const r of roster) writeChat(r.id, { messages: [{ id: r.id }], chatGrants: {}, lastReadAt: "" }, folders);
    const editor = roster.find((r) => r.name === "Editor")!;
    const writer = roster.find((r) => r.name === "Writer")!;
    removeAgent(folders, "Editor");
    removeRow("Editor");
    assert.equal(fs.existsSync(chatPath(editor.id)), false);
    assert.equal(fs.existsSync(chatPath(writer.id)), true);
  });
});

describe("Stage 7 — ACP session map in the index", () => {
  it("write / read / clear a session, creating the row when needed", () => {
    mkAgent("Writer");
    assert.equal(readAgentSession("Writer"), null);
    const cwd = path.join(folders.employeeRoot, "agents", "Writer", "private");
    writeAgentSession("Writer", "sess-abc", cwd);
    assert.deepEqual(readAgentSession("Writer"), { sessionId: "sess-abc", cwd });
    const row = findRow(loadHostIndex(), "Writer")!;
    assert.equal(row.sessionId, "sess-abc");
    assert.equal(row.sessionCwd, cwd);
    clearAgentSession("Writer");
    assert.equal(readAgentSession("Writer"), null);
    assert.equal(findRow(loadHostIndex(), "Writer")!.id, row.id, "clearing the session keeps the row");
  });

  it("HarnessManager persists the id after session/new, tries session/resume from the store, and clears it on forget", () => {
    const mgr = read("src/lib/harness/index.ts");
    assert.match(mgr, /const persisted = this\.store\.load\(agentName\)/);
    assert.match(mgr, /await proc\.resumeSession\(persisted\.sessionId, cwd\)/);
    assert.match(mgr, /const res = await proc\.newSession\(cwd\);\s*this\.sessions\.set\(agentName, res\.sessionId\);\s*this\.store\.save\(agentName, res\.sessionId, cwd\)/);
    assert.match(mgr, /forgetSession\(agentName: string\): boolean \{[\s\S]*?this\.store\.clear\(agentName\)/);
    assert.match(mgr, /import \{ hostIndexSessionStore, type SessionStore \} from "\.\.\/fs\/host-index\.ts"/);
    const proc = read("src/lib/harness/process.ts");
    assert.match(proc, /this\.connection\(\)\.resumeSession\(\{ sessionId, cwd, mcpServers: \[\] \}\)/);
    // The renderer never replays history: the adapter only starts a turn and polls.
    const adapter = read("src/runtime/harnessAdapter.ts");
    assert.equal(/messages\.map\(/.test(adapter), false);
    assert.equal(adapter.includes("history"), false);
  });
});

describe("Stage 7 — migration from localbot-state-v3", () => {
  const snapshot: LegacySnapshot = {
    onboarded: true,
    company: { id: "co_1", name: "Acme", createdAt: "2026-09-01T00:00:00.000Z" },
    departments: [{ id: "dept_1", name: "Ops", createdAt: "" }],
    employees: [{ id: "emp_1", displayName: "Sam", createdAt: "", departmentId: "dept_1" }],
    activeEmployeeId: "emp_1",
    selectedCatalogId: "qwen25-05b-q4",
    bots: [
      { id: "bot_old1", name: "Writer", job: "Writes", color: "sage", mascotId: "writer", modelId: "qwen25-05b-q4", scopes: ["private"], pinned: true, hidden: false, unread: 2, createdAt: "2026-09-01T00:00:00.000Z" },
      { id: "bot_old2", name: "Editor", job: "Edits", color: "clay", mascotId: "ops", modelId: "qwen25-05b-q4", scopes: ["private"], pinned: false, hidden: true, unread: 0, createdAt: "2026-09-02T00:00:00.000Z" },
    ],
    sessions: {
      bot_old1: { messages: [{ id: "m1", role: "user", content: "hi" }, { id: "m2", role: "assistant", content: "hello" }], chatGrants: { "acp:write": true }, lastReadAt: "t1" },
      bot_old2: { messages: [], chatGrants: {}, lastReadAt: "" },
    },
  };

  it("writes the index + chats + marker + a recoverable export, keeps old ids, and is a no-op the second time", () => {
    const r = migrateLegacySnapshot(snapshot, folders);
    assert.ok(r.ok && r.migrated);
    assert.equal(r.agents, 2);
    assert.equal(r.chats, 1, "only sessions with messages become chat files");
    const idx = loadHostIndex();
    assert.equal(idx.onboarded, true);
    assert.equal(idx.migratedFrom, "localbot-state-v3");
    assert.equal(idx.company?.name, "Acme");
    assert.equal(idx.department?.name, "Ops");
    assert.equal(idx.employee?.name, "Sam");
    assert.equal(idx.selectedCatalogId, "qwen25-05b-q4");
    assert.deepEqual(
      idx.agents.map((a) => [a.id, a.name, a.pinned, a.hidden, a.unread, a.sessionId]),
      [["bot_old1", "Writer", true, false, 2, null], ["bot_old2", "Editor", false, true, 0, null]],
    );
    assert.equal(readChat("bot_old1")!.messages.length, 2);
    assert.deepEqual(readChat("bot_old1")!.chatGrants, { "acp:write": true });
    assert.equal(readChat("bot_old2"), null);
    assert.ok(fs.existsSync(path.join(dataDir, "localbot-state-v3.migrated.json")));

    // Twice: the index exists → nothing is rewritten.
    const before = fs.readFileSync(hostIndexPath(), "utf8");
    const again = migrateLegacySnapshot({ ...snapshot, bots: [{ id: "bot_new", name: "Intruder" }] }, folders);
    assert.ok(again.ok && !again.migrated);
    assert.equal(again.reason, "index exists");
    assert.equal(fs.readFileSync(hostIndexPath(), "utf8"), before);
  });

  it("an empty browser copy migrates nothing and leaves no index (fresh install)", () => {
    const r = migrateLegacySnapshot({ bots: [] }, folders);
    assert.ok(r.ok && !r.migrated);
    assert.equal(hostIndexExists(), false);
  });

  it("after migration the roster joins the migrated rows to the folders ensureAgent creates", () => {
    migrateLegacySnapshot(snapshot, folders);
    for (const b of snapshot.bots!) mkAgent(b.name!, { createdAt: b.createdAt });
    const roster = loadRoster(folders);
    assert.deepEqual(roster.map((r) => [r.name, r.id, r.pinned, r.hidden]), [["Editor", "bot_old2", false, true], ["Writer", "bot_old1", true, false]]);
  });
});

describe("Stage 7 — the browser copy is chrome only", () => {
  const store = read("src/lib/store.ts");
  const app = read("src/components/localbot/app.tsx");

  it("store.ts no longer persists bots / sessions / onboarded / labels / selectedCatalogId", () => {
    const partialize = /partialize: \(s\) => \(\{([\s\S]*?)\}\),\s*\}/.exec(store);
    assert.ok(partialize, "partialize present");
    const body = partialize[1]!;
    for (const key of ["bots", "sessions", "onboarded", "company", "departments", "employees", "activeEmployeeId", "selectedCatalogId"]) {
      assert.equal(new RegExp(`\\b${key}:`).test(body), false, `partialize must not persist ${key}`);
    }
    for (const key of ["hardware", "settings", "runtime"]) {
      assert.match(body, new RegExp(`\\b${key}:`), `UI chrome ${key} may stay in localStorage`);
    }
  });

  it("the roster, chats, onboarding flag and config mirror are loaded from the sidecar before anything renders", () => {
    assert.match(store, /loadFromDisk: async \(\) => \{[\s\S]*?await stateLoad\(\)/);
    assert.match(store, /await chatLoadAll\(\)/);
    assert.match(store, /st\.roster\.map\(\(r\) => botFromRoster\(r, employeeId\)\)/);
    assert.match(store, /onboarded: st\.index\.onboarded/);
    assert.match(store, /allowHostedDemo: st\.config\.allowHostedDemo, useExistingOllama: st\.config\.useExistingOllama/);
    assert.match(store, /await stateMigrate\(\{ data: \{ snapshot: legacy \} \}\)/);
    assert.match(app, /void loadFromDisk\(\)/);
    assert.match(app, /if \(!ready \|\| !diskLoaded\)/);
  });

  it("lifecycle keeps the index in step and chats debounce to chatSave", () => {
    const server = read("src/lib/fs/server.ts");
    assert.match(server, /const row = ensureRow\(r\.name, \{ id: data\.id, pinned: data\.pinned, createdAt: data\.createdAt \}\)/);
    assert.match(server, /renameRow\(data\.agentName, r\.name\)/);
    assert.match(server, /removeRow\(data\.agentName\)/);
    assert.match(server, /clearAgentSession\(data\.agentName\)/);
    assert.match(store, /scheduleChatSave\(botId\)/);
    assert.match(store, /await chatSave\(\{/);
    assert.match(store, /void statePatchAgent\(\{ data: \{ id, pinned \} \}\)/);
    assert.match(store, /void statePatchAgent\(\{ data: \{ id, hidden \} \}\)/);
  });

  it("chat.tsx still sends through runAgentTurn and the Harness / ACP pins are exact", () => {
    const chat = read("src/components/localbot/chat.tsx");
    assert.match(chat, /import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/);
    assert.match(chat, /await runAgentTurn\(\{/);
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    assert.equal(pkg.dependencies["@deepseek-ai/dsh"], "0.1.2-alpha.5");
    assert.equal(pkg.dependencies["@agentclientprotocol/sdk"], "1.4.0");
  });
});
