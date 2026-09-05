#!/usr/bin/env node
/**
 * Stage 16 prove-it: Channels (run: `npm run prove:channels`).
 *
 * Everything runs against a temp LOCALBOT_DATA_DIR and temp scope folders —
 * never the real AppData, never a real share. It uses the same sidecar
 * modules the channels* server functions call (src/lib/fs/channels.ts,
 * src/lib/harness/channels.ts) and the same pure turn rules the renderer uses
 * (src/lib/channels-model.ts).
 *
 * Static gates (source):
 *   - sidebar has a labelled Channels group (data-testid=channels-section), New channel,
 *     Open channel with…; channel rows are not roster rows
 *   - shell renders ChannelPane xor ChatPane; store keeps selectedBotId xor selectedChannelId
 *   - channelRunner.ts calls runAgentTurn({ botId, userText }) per member, never imports the
 *     harness server functions (no second loop), never hands off (no handoffTask / agentFsWrite)
 *   - chat.tsx keeps handoffTask + runAgentTurn, @ still writes the handoff file first
 *   - every store mutation is a channels* server function; channels never in partialize
 *   - dsh / ACP pins exact; dsh/localbot-fs.mjs sha256 pin
 *
 * Live gates (disk, no dsh, no model):
 *   1. OUTSIDE: LOCALBOT_DATA_DIR inside the employee root / a share → create refused, no file
 *   2. REFUSE: empty name / one member / unknown agent / archived member → nothing written
 *   3. RECORD: create → channels/{id}.json (5 fields) + {id}.messages.json; a FRESH node
 *      process reads both back (fails if channels only lived in React state)
 *   4. MEMBERS: add archived refused; remove below 2 refused; add/remove persisted; .bak kept
 *   5. TRANSCRIPT: employee line role user, member reply with speakerId, dedupe by id
 *   6. TURN RULES: no @ → first; @Bob → Bob only; @Cara @Alice → that order; @Zed → unknown,
 *      gate NOT_MEMBER; Run all only with the flag; BUSY (real HarnessManager turn) → gate BUSY
 *      and enqueuePage keeps exactly one; ARCHIVED / DISCONNECTED → gate refuses
 *
 * Usage:
 *   npm run prove:channels
 *   npm run prove:channels -- --static     # source gates only
 *   npm run prove:channels -- --keep       # leave the temp dirs behind
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const log = (...a) => console.log("[prove-channels]", ...a);
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error("[prove-channels] FAIL:", msg);
};
const gate = (ok, msg) => (ok ? log("ok:", msg) : fail(msg));
const codeOf = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err?.code ?? "THREW";
  }
};

const LOCALBOT_FS_SHA256 = "0bb5593abecbc116a7b3c614882cfc109831e88c45b735962ce14ef904c2b0a6";

/* ---------------- static gates ---------------- */

{
  const sidebar = read("src/components/localbot/sidebar.tsx");
  gate(/data-testid="channels-section"/.test(sidebar), "sidebar has data-testid=channels-section");
  const section = /data-testid="channels-section"[\s\S]*?data-testid="new-channel"/.exec(sidebar)?.[0] ?? "";
  gate(section.length > 0 && !/data-testid="roster-row"/.test(section) && />\s*Channels\s*</.test(section), "channels are a labelled group, not roster rows");
  gate(/Open channel with…/.test(sidebar) && /openChannelWith\(bot\.id\)/.test(sidebar), "roster … has Open channel with… (the only promotion from 1:1)");
  gate(/const channels = useLocalBot\(\(s\) => s\.channels\)/.test(sidebar) && !/localStorage/.test(sidebar), "sidebar lists channels from the store's disk copy");

  const shell = read("src/components/localbot/shell.tsx");
  gate(/\{selectedChannel \? <ChannelPane \/> : <ChatPane \/>\}/.test(shell), "shell renders ChannelPane xor ChatPane");

  const store = read("src/lib/store.ts");
  gate(/selectBot: \(id\) => \{[\s\S]*?selectedChannelId: id \? null : s\.ui\.selectedChannelId/.test(store), "selectBot clears selectedChannelId");
  gate(/selectChannel: async \(id\) => \{[\s\S]*?selectedChannelId: id, selectedBotId: null/.test(store), "selectChannel clears selectedBotId");
  for (const fn of ["channelsList", "channelsCreate", "channelsRename", "channelsDelete", "channelsAddMember", "channelsRemoveMember", "channelsRead", "channelsAppend"]) {
    gate(new RegExp(`\\b${fn}\\(`).test(store), `store.ts calls ${fn}()`);
  }
  gate(/await get\(\)\.loadChannels\(\);/.test(store), "loadFromDisk re-reads channels from disk");
  const partial = /partialize: \(s\) => \(\{([\s\S]*?)\}\)/.exec(store)?.[1] ?? "channels";
  gate(!/channels/.test(partial), "channels are never persisted in the browser copy (partialize)");

  const runner = read("src/runtime/channelRunner.ts");
  gate(/import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/.test(runner) && /turn: runAgentTurn,/.test(runner), "channelRunner uses runAgentTurn");
  gate(/await deps\.turn\(\{\s*botId: bot\.id,\s*userText,/.test(runner) && /const userText = renderChannelPrompt\(\{/.test(runner), "one runAgentTurn per member with the channel lines as user text");
  gate(/onAssistantText: \(text\) => \{[\s\S]*?appendChannelMessage\(channelId, \{ id, role: "assistant", speakerId: bot\.id, content: text \}\)/.test(runner), "the reply lands on the shared transcript with speakerId");
  gate(!/@\/lib\/runtime\/harness"|harnessPrompt|harnessPoll|getHarnessManager|HarnessManager|session\/new/.test(runner), "channelRunner has no second Harness loop / shared session");
  gate(!/handoffTask|agentFsWrite/.test(runner), "channelRunner never writes a handoff file");
  gate(/const \{ queue, added \} = enqueuePage\(sess\?\.queued \?\? \[\], botId\)/.test(runner) && /if \(gate\.gate\.code === "BUSY"\) return queuePage\(/.test(runner), "BUSY → enqueuePage (one page per member)");
  gate(/gate: \(id, agentId\) => channelsGate\(\{ data: \{ id, agentId \} \}\)/.test(runner), "runner asks the sidecar gate first");
  gate(!/"allow-once"|"allow-chat"/.test(runner), "runner never answers a permission itself (cards stay per-agent)");

  const pane = read("src/components/localbot/channel.tsx");
  gate(/void sendChannelMessage\(channel\.id, text, \{ all \}\)/.test(pane) && /data-testid="channel-run-all"[\s\S]*?onClick=\{\(\) => send\(composer, true\)\}/.test(pane), "Run all once is an explicit button (all: true)");
  gate(/channelTurnRulesText\(first\?\.name \?\? null\)/.test(pane), "header tooltip documents the default speaker");
  gate(/function MemberMentionHint\(\{ members \}: \{ members: Bot\[\] \}\)/.test(pane), "composer @ picker lists members only");
  gate(!/from "@\/runtime\/harnessAdapter"/.test(pane), "the pane runs nothing itself");

  const chat = read("src/components/localbot/chat.tsx");
  gate(/import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/.test(chat) && /const result = await runAgentTurn\(\{\s*botId: bot\.id,\s*userText: trimmed/.test(chat), "chat.tsx keeps runAgentTurn");
  const send = /const send = async \(text: string\) => \{([\s\S]*?)\n {2}\};/.exec(chat)?.[1] ?? "";
  gate(/for \(const name of mentions\) \{[\s\S]*?await handoffTask\(bot\.id, name, trimmed\)/.test(send) && send.indexOf("await handoffTask(") < send.indexOf("await runAgentTurn("), "@ in a 1:1 chat still writes the handoff file before the turn");
  gate(!/channelRunner|sendChannelMessage|channelsAppend/.test(chat), "chat.tsx knows nothing about channels (1:1 unchanged)");
  gate(/const filename = `task-\$\{Date\.now\(\)\}-\$\{from\.name\}-to-\$\{to\.name\}\.md`;[\s\S]*?await agentFsWrite\(/.test(store), "handoffTask still writes task-*.md");

  const adapter = read("src/runtime/harnessAdapter.ts");
  gate(/onAssistantText\?: \(text: string\) => void;/.test(adapter) && !/\bwhile\s*\(\s*rounds/.test(adapter), "adapter: optional reply sink, still no loop");

  const pkg = JSON.parse(read("package.json"));
  gate(pkg.dependencies["@deepseek-ai/dsh"] === "0.1.2-alpha.5", "dsh pin is exact 0.1.2-alpha.5");
  gate(pkg.dependencies["@agentclientprotocol/sdk"] === "1.4.0", "ACP SDK pin is exact 1.4.0");
  gate(createHash("sha256").update(read("dsh/localbot-fs.mjs")).digest("hex") === LOCALBOT_FS_SHA256, "dsh/localbot-fs.mjs unchanged (sha256 pin)");
  gate(/src\/lib\/channels\.test\.ts/.test(pkg.scripts.test), "npm test runs channels.test.ts");
}

if (flag("--static")) finish();

/* ---------------- live gates ---------------- */

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb16-prove-"));
process.env.LOCALBOT_DATA_DIR = dataDir;
const base = fs.mkdtempSync(path.join(os.tmpdir(), "lb16-roots-"));
const folders = {
  employeeRoot: path.join(base, "emp"),
  employeeShared: path.join(base, "emp-shared"),
  departmentShared: null,
  companyShared: null,
};

const scopes = await import(pathToFileURL(path.join(root, "src/lib/fs/scopes.ts")).href);
const hostIndex = await import(pathToFileURL(path.join(root, "src/lib/fs/host-index.ts")).href);
const C = await import(pathToFileURL(path.join(root, "src/lib/fs/channels.ts")).href);
const G = await import(pathToFileURL(path.join(root, "src/lib/harness/channels.ts")).href);
const M = await import(pathToFileURL(path.join(root, "src/lib/channels-model.ts")).href);
const { HarnessManager } = await import(pathToFileURL(path.join(root, "src/lib/harness/index.ts")).href);

const set = scopes.setFolders(folders, { create: true });
if (!set.ok) {
  fail(`setFolders: ${set.error}`);
  finish();
}
const now0 = new Date().toISOString();
for (const [name, mascotId] of [["Alice", "writer"], ["Bob", "ops"], ["Cara", "ops"], ["Retired", "ops"]]) {
  scopes.ensureAgent(set.folders, { name, job: name, modelId: "fixture", color: "sage", mascotId, scopes: ["private"], standingInstructions: "", createdAt: now0 });
}
scopes.setAgentArchived(set.folders, "Retired", true);
const roster = () => hostIndex.loadRoster(set.folders);
const idOf = (name) => roster().find((r) => r.name === name).id;
const alice = idOf("Alice");
const bob = idOf("Bob");
const cara = idOf("Cara");
const retired = idOf("Retired");
const cctx = () => ({ folders: set.folders, roster: roster() });
log(`dataDir=${dataDir}\n  employeeRoot=${set.folders.employeeRoot}\n  channels/=${C.channelsDir()}`);

try {
  // 1. OUTSIDE
  {
    const c = cctx();
    for (const scopeRoot of [set.folders.employeeRoot, set.folders.employeeShared]) {
      process.env.LOCALBOT_DATA_DIR = path.join(scopeRoot, "LocalBot");
      const code = codeOf(() => C.createChannel({ name: "Leak", memberIds: [alice, bob] }, c));
      gate(code === "OUTSIDE_SCOPE", `channels/ under ${path.basename(scopeRoot)} refused with OUTSIDE_SCOPE (got ${code})`);
      gate(!fs.existsSync(path.join(scopeRoot, "LocalBot", "channels")), `no channels/ appeared inside ${path.basename(scopeRoot)}`);
    }
    process.env.LOCALBOT_DATA_DIR = dataDir;
  }

  // 2. REFUSE
  {
    gate(codeOf(() => C.createChannel({ name: "  ", memberIds: [alice, bob] }, cctx())) === "BAD_NAME", "empty name refused (BAD_NAME)");
    gate(codeOf(() => C.createChannel({ name: "Solo", memberIds: [alice] }, cctx())) === "TOO_FEW_MEMBERS", "one member refused (TOO_FEW_MEMBERS)");
    gate(codeOf(() => C.createChannel({ name: "Ghost", memberIds: [alice, "bot_nope"] }, cctx())) === "UNKNOWN_AGENT", "unknown agent refused (UNKNOWN_AGENT)");
    gate(codeOf(() => C.createChannel({ name: "Old", memberIds: [alice, retired] }, cctx())) === "ARCHIVED", "archived member refused (ARCHIVED)");
    gate(!fs.existsSync(C.channelsDir()) || fs.readdirSync(C.channelsDir()).length === 0, "nothing written by the refused creates");
  }

  // 3. RECORD + fresh process
  const ch = C.createChannel({ name: "launch", memberIds: [alice, bob] }, cctx());
  const file = C.channelPath(ch.id);
  const tfile = C.channelMessagesPath(ch.id);
  gate(fs.existsSync(file) && path.dirname(file) === path.join(dataDir, "channels"), `record on disk at channels/${ch.id}.json`);
  gate(fs.existsSync(tfile) && path.basename(tfile) === `${ch.id}.messages.json`, `transcript on disk at channels/${ch.id}.messages.json`);
  {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const fields = ["id", "name", "memberIds", "createdAt", "updatedAt"];
    gate(fields.every((f) => f in raw) && Object.keys(raw).length === fields.length, `record has exactly ${fields.join(", ")}`);
    gate(Array.isArray(raw.memberIds) && raw.memberIds.length === 2, "record has two members");
  }
  C.appendChannelMessages(ch.id, [{ id: "u1", role: "user", speakerId: null, content: "@Bob draft the launch note" }], set.folders);
  {
    const probe = `
      import { listChannels, readChannelMessages } from ${JSON.stringify(pathToFileURL(path.join(root, "src/lib/fs/channels.ts")).href)};
      const list = listChannels();
      console.log(JSON.stringify({ ids: list.map((c) => c.id), names: list.map((c) => c.name), lines: list.map((c) => readChannelMessages(c.id).messages.map((m) => [m.role, m.content])) }));
    `;
    const res = spawnSync(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "--input-type=module", "-e", probe], {
      env: { ...process.env, LOCALBOT_DATA_DIR: dataDir },
      encoding: "utf8",
    });
    let out = null;
    try {
      out = JSON.parse(res.stdout.trim().split("\n").pop());
    } catch {
      out = null;
    }
    if (!out || !out.ids.includes(ch.id)) {
      fail(`a fresh node process did not find channels/${ch.id}.json — channels would exist only in React state (stdout=${res.stdout.trim()} stderr=${res.stderr.trim()})`);
      throw new Error("record not durable");
    }
    const lines = out.lines[out.ids.indexOf(ch.id)];
    gate(out.names.includes("launch") && lines.length === 1 && lines[0][0] === "user", `fresh process read back "${out.names.join(", ")}" and its transcript (${lines.length} line)`);
  }

  // 4. MEMBERS
  gate(codeOf(() => C.addChannelMember(ch.id, retired, cctx())) === "ARCHIVED", "add archived member refused (ARCHIVED)");
  gate(codeOf(() => C.addChannelMember(ch.id, alice, cctx())) === "ALREADY_MEMBER", "adding a member twice refused (ALREADY_MEMBER)");
  gate(codeOf(() => C.removeChannelMember(ch.id, bob, cctx())) === "TOO_FEW_MEMBERS", "removing down to one member refused (TOO_FEW_MEMBERS)");
  C.addChannelMember(ch.id, cara, cctx());
  gate(JSON.stringify(C.readChannel(ch.id).memberIds) === JSON.stringify([alice, bob, cara]), "add member is on disk, order kept");
  gate(fs.existsSync(`${file}.bak`), "previous record kept as .bak");
  C.removeChannelMember(ch.id, cara, cctx());
  gate(JSON.stringify(C.readChannel(ch.id).memberIds) === JSON.stringify([alice, bob]), "remove member is on disk");
  gate(C.renameChannel(ch.id, "launch-room", cctx()).name === "launch-room" && C.readChannel(ch.id).name === "launch-room", "rename is on disk");
  gate(codeOf(() => C.renameChannel("ch_missing0000", "x", cctx())) === "NOT_FOUND", "unknown channel → NOT_FOUND");

  // 5. TRANSCRIPT
  {
    const t = C.appendChannelMessages(ch.id, [{ id: "a1", role: "assistant", speakerId: bob, content: "Draft attached." }], set.folders);
    gate(t.messages.length === 2 && t.messages[0].role === "user" && t.messages[0].speakerId === null, "employee line is role user with no speaker");
    gate(t.messages[1].role === "assistant" && t.messages[1].speakerId === bob, "member reply carries speakerId");
    gate(C.appendChannelMessages(ch.id, [{ id: "a1", role: "assistant", speakerId: bob, content: "Draft attached." }], set.folders).messages.length === 2, "same id appended twice is not duplicated");
    gate(codeOf(() => C.appendChannelMessages("ch_missing0000", [{ id: "x", role: "user", content: "x" }], set.folders)) === "NOT_FOUND", "append to a missing channel → NOT_FOUND, nothing written");
    gate(!fs.existsSync(C.channelMessagesPath("ch_missing0000")), "no stray transcript file");
  }

  // 6. TURN RULES + gates
  {
    const members = [
      { id: alice, name: "Alice" },
      { id: bob, name: "Bob" },
    ];
    let p = M.planSpeakers("what is the status?", members);
    gate(p.speakers.length === 1 && p.speakers[0] === alice && p.reason === "default-first", "no @ → first member (Alice) only");
    p = M.planSpeakers("@Bob take it", members);
    gate(p.speakers.length === 1 && p.speakers[0] === bob, "@Bob → only Bob");
    p = M.planSpeakers("@bob then @Alice", members);
    gate(JSON.stringify(p.speakers) === JSON.stringify([bob, alice]), "several @ → mention order");
    p = M.planSpeakers("@Zed please", members);
    gate(p.speakers.length === 0 && p.unknown[0] === "Zed", "non-member @ → nobody runs, name reported");
    gate(M.planSpeakers("everyone @all", members).speakers.length === 0, "'everyone' / '@all' in text never means all");
    p = M.planSpeakers("", members, { all: true });
    gate(JSON.stringify(p.speakers) === JSON.stringify([alice, bob]) && p.reason === "all", "Run all only with the explicit flag");
    let q = M.enqueuePage([], bob);
    q = M.enqueuePage(q.queue, bob);
    gate(q.queue.length === 1 && q.added === false, "BUSY queue keeps exactly one page per member");

    const rec = C.readChannel(ch.id);
    const mgr = new HarnessManager();
    const deps = () => ({ folders: set.folders, roster: roster(), hasActiveTurn: (n) => mgr.hasActiveTurn(n) });
    gate(G.channelGate(ch.id, alice, deps()).ok === true, "gate: a free member passes");
    gate(G.channelGate(ch.id, cara, deps()).code === "NOT_MEMBER", "gate: non-member refused (NOT_MEMBER) — no run, no handoff");
    gate(codeOf(() => G.gateChannelSpeaker(rec, retired, deps())) === "NOT_MEMBER", "gate: archived non-member is NOT_MEMBER first");

    // BUSY: a real HarnessManager with a running turn on Bob's session.
    mgr.sessions.set("Bob", "sess-channels");
    mgr.turns.start("sess-channels", "Bob");
    gate(G.channelGate(ch.id, bob, deps()).code === "BUSY", "gate: a running turn makes Bob BUSY");
    gate(G.channelGate(ch.id, alice, deps()).ok === true, "gate: Alice is still free while Bob is busy");
    mgr.sessions.delete("Bob");
    gate(G.channelGate(ch.id, bob, deps()).ok === true, "turn gone → Bob passes again");

    scopes.setAgentArchived(set.folders, "Bob", true);
    gate(G.channelGate(ch.id, bob, deps()).code === "ARCHIVED", "gate: member archived after the fact → ARCHIVED (skip + system line)");
    const all = G.channelGateAll(ch.id, deps());
    gate(all.length === 2 && all[0].ok === true && all[1].ok === false, "gateAll reports each member");
    scopes.setAgentArchived(set.folders, "Bob", false);

    const rows = roster();
    const away = `${set.folders.employeeRoot}.away`;
    fs.renameSync(set.folders.employeeRoot, away);
    try {
      gate(G.channelGate(ch.id, alice, { folders: set.folders, roster: rows, hasActiveTurn: () => false }).code === "DISCONNECTED", "gate: employee root gone → DISCONNECTED");
    } finally {
      fs.renameSync(away, set.folders.employeeRoot);
    }
  }

  // delete
  C.deleteChannel(ch.id);
  gate(!fs.existsSync(file) && !fs.existsSync(`${file}.bak`) && !fs.existsSync(tfile) && !fs.existsSync(`${tfile}.bak`), "delete removes record, transcript and both .bak files");
  gate(C.listChannels().length === 0, "nothing left in channels/");
} catch (err) {
  fail(`live: ${err?.stack ?? err}`);
} finally {
  if (!flag("--keep")) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(base, { recursive: true, force: true });
  } else {
    log(`kept ${dataDir} and ${base}`);
  }
}

finish();

function finish() {
  if (failures.length) {
    console.error(`\n[prove-channels] ${failures.length} failure(s):\n - ${failures.join("\n - ")}`);
    process.exit(1);
  }
  console.log(`\nSTAGE16_CHANNELS_PASS static+${flag("--static") ? "0" : "live"} outside/refuse/record-fresh-process/members/transcript/turn-rules/busy-one/archived/disconnected/delete`);
  process.exit(0);
}
