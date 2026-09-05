/**
 * Stage 16 — Channels.
 *
 * These fail when:
 *   - a channel file could land inside a scope root (assertChannelsOutsideScopes)
 *   - channels exist only in React state: the sidebar / pane stop calling the
 *     channels* server functions, or a created channel is not on disk / not
 *     readable by a FRESH node process
 *   - a channel turn never calls runAgentTurn: channelRunner.ts stops calling
 *     `deps.turn({ botId, userText })` with `turn: runAgentTurn`, or grows a
 *     second Harness loop (imports the harness server functions / manager)
 *   - the 1:1 chat changes: chat.tsx drops handoffTask or runAgentTurn, or `@`
 *     in a 1:1 no longer writes the handoff file first
 *   - a channel with < 2 members is accepted, an archived agent can be added,
 *     a non-member @ runs (or hands off), BUSY queues more than one page
 *   - selectedBotId and selectedChannelId can both be set
 *   - dsh / ACP pins float; localbot-fs.mjs changes
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { makeTempRoot } from "./fs/disk.ts";
import { loadRoster } from "./fs/host-index.ts";
import type { FoldersConfig } from "./fs/scope-model.ts";
import { ensureAgent, setAgentArchived, setFolders } from "./fs/scopes.ts";
import {
  addChannelMember,
  appendChannelMessages,
  assertChannelsOutsideScopes,
  channelMessagesPath,
  channelPath,
  channelsDir,
  createChannel,
  deleteChannel,
  listChannels,
  readChannel,
  readChannelMessages,
  removeChannelMember,
  renameChannel,
} from "./fs/channels.ts";
import { channelGate, channelGateAll, gateChannelSpeaker } from "./harness/channels.ts";
import { ACP_SDK_PIN, DSH_PIN } from "./harness/process.ts";
import {
  CHANNEL_CONTEXT_MESSAGES,
  CHANNEL_MIN_MEMBERS,
  CHANNEL_QUEUE_PER_MEMBER,
  ChannelError,
  channelTurnRulesText,
  cleanChannelName,
  cleanMemberIds,
  enqueuePage,
  normalizeChannelMessage,
  parseMentions,
  planSpeakers,
  renderChannelPrompt,
  type Channel,
  type ChannelMessage,
} from "./channels-model.ts";

const repo = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(repo, p), "utf8");

/** sha256 of dsh/localbot-fs.mjs on main at 64a5b3e. Stage 16 must not touch it. */
const LOCALBOT_FS_SHA256 = "0bb5593abecbc116a7b3c614882cfc109831e88c45b735962ce14ef904c2b0a6";

const isCode = (code: string) => (err: unknown) => err instanceof ChannelError && err.code === code;

describe("Stage 16: pins, the fs boundary and the 1:1 chat are untouched", () => {
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; scripts: Record<string, string> };
  const chat = read("src/components/localbot/chat.tsx");
  const store = read("src/lib/store.ts");

  it("dsh / ACP pins are exact and unchanged", () => {
    assert.equal(pkg.dependencies["@deepseek-ai/dsh"], DSH_PIN);
    assert.equal(DSH_PIN, "0.1.2-alpha.5");
    assert.equal(pkg.dependencies["@agentclientprotocol/sdk"], ACP_SDK_PIN);
    assert.equal(ACP_SDK_PIN, "1.4.0");
    for (const k of ["@deepseek-ai/dsh", "@agentclientprotocol/sdk"]) assert.doesNotMatch(pkg.dependencies[k]!, /^[\^~]/);
  });

  it("dsh/localbot-fs.mjs is byte-identical to main (sha256 pin)", () => {
    assert.equal(createHash("sha256").update(read("dsh/localbot-fs.mjs")).digest("hex"), LOCALBOT_FS_SHA256, "dsh/localbot-fs.mjs changed — Stage 16 must not touch the scoped fs");
  });

  it("chat.tsx still sends through runAgentTurn", () => {
    assert.match(chat, /import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/);
    assert.match(chat, /const result = await runAgentTurn\(\{\s*botId: bot\.id,\s*userText: trimmed/);
  });

  it("@ in a 1:1 chat is still handoff-to-file: send() calls handoffTask for every mention BEFORE the turn", () => {
    assert.match(chat, /const handoffTask = useLocalBot\(\(s\) => s\.handoffTask\)/);
    const send = /const send = async \(text: string\) => \{([\s\S]*?)\n {2}\};/.exec(chat);
    assert.ok(send, "no send()");
    const body = send![1]!;
    assert.match(body, /const mentions = \[\.\.\.trimmed\.matchAll\(\/@\(\[A-Za-z0-9_-\]\+\)\/g\)\]/);
    assert.match(body, /for \(const name of mentions\) \{[\s\S]*?await handoffTask\(bot\.id, name, trimmed\)/);
    assert.ok(body.indexOf("await handoffTask(") < body.indexOf("await runAgentTurn("), "handoff first, then the turn");
    // The handoff itself still writes the task file into a shared scope.
    assert.match(store, /handoffTask: async \(fromBotId, toBotName, task\) => \{[\s\S]*?const filename = `task-\$\{Date\.now\(\)\}-\$\{from\.name\}-to-\$\{to\.name\}\.md`;[\s\S]*?await agentFsWrite\(/);
    // chat.tsx knows nothing about channels: no channel runner, no channel server functions.
    assert.equal(/channelRunner|channelsAppend|channelsCreate|sendChannelMessage/.test(chat), false, "chat.tsx must stay the 1:1 chat");
  });

  it("the adapter still only starts / polls / cancels / decides (no loop, no replay); the reply sink is optional", () => {
    const adapter = read("src/runtime/harnessAdapter.ts");
    assert.equal(/\bwhile\s*\(\s*rounds/.test(adapter), false);
    assert.match(adapter, /onAssistantText\?: \(text: string\) => void;/);
    assert.match(adapter, /if \(opts\.events\.onAssistantText\) opts\.events\.onAssistantText\(text\.trim\(\)\);\s*else useLocalBot\.getState\(\)\.appendMessage\(opts\.botId, \{ role: "assistant", content: text\.trim\(\) \}\)/);
    assert.match(read("src/runtime/routineRunner.ts"), /turn: runAgentTurn,/, "routines unchanged");
  });

  it("npm test runs channels.test.ts and prove:channels exists", () => {
    assert.match(pkg.scripts.test!, /src\/lib\/channels\.test\.ts/);
    assert.match(pkg.scripts["prove:channels"]!, /scripts\/prove-channels\.mjs/);
  });
});

describe("Stage 16: a channel turn is one runAgentTurn per member, not a second loop", () => {
  const runner = read("src/runtime/channelRunner.ts");
  const pane = read("src/components/localbot/channel.tsx");
  const sidebar = read("src/components/localbot/sidebar.tsx");
  const shell = read("src/components/localbot/shell.tsx");
  const store = read("src/lib/store.ts");

  it("channelRunner imports runAgentTurn from the adapter and calls it for the member with the channel context as the user text", () => {
    assert.match(runner, /import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/);
    assert.match(runner, /turn: runAgentTurn,/, "the default turn dependency must be runAgentTurn");
    assert.match(runner, /await deps\.turn\(\{\s*botId: bot\.id,\s*userText,/);
    assert.match(runner, /const userText = renderChannelPrompt\(\{/);
    assert.match(runner, /onAssistantText: \(text\) => \{[\s\S]*?appendChannelMessage\(channelId, \{ id, role: "assistant", speakerId: bot\.id, content: text \}\)/);
  });

  it("channelRunner never talks to the Harness directly (no second loop, no shared session)", () => {
    assert.equal(/@\/lib\/runtime\/harness"/.test(runner), false, "must not import harnessPrompt / harnessPoll");
    assert.equal(/harnessPrompt|harnessPoll|harnessDecide|HarnessManager|getHarnessManager|session\/prompt|session\/new/.test(runner), false);
    assert.equal(/@\/lib\/harness\/index|\.\.\/lib\/harness\/index/.test(runner), false);
  });

  it("a non-member @ never hands off: the runner has no handoffTask and no agentFsWrite", () => {
    assert.equal(/handoffTask|agentFsWrite|writeBotFile/.test(runner), false);
    assert.match(runner, /is not a member of #\$\{channel\.name\} — add them first\. Nobody ran and nothing was handed off\./);
  });

  it("gates on the sidecar first; ARCHIVED / DISCONNECTED skip with a system line; BUSY queues through enqueuePage", () => {
    assert.match(runner, /gate: \(id, agentId\) => channelsGate\(\{ data: \{ id, agentId \} \}\)/);
    assert.match(runner, /if \(gate\.gate\.code === "BUSY"\) return queuePage\(/);
    assert.match(runner, /const \{ queue, added \} = enqueuePage\(sess\?\.queued \?\? \[\], botId\)/);
    assert.match(runner, /await systemLine\(channelId, gate\.gate\.reason\)/);
    assert.equal(/"allow-once"|"allow-chat"/.test(runner), false, "the runner never answers a permission itself");
  });

  it("the pane sends through sendChannelMessage; Run all once is an explicit button passing all: true", () => {
    assert.match(pane, /import \{ decideChannelPermission, sendChannelMessage, stopChannelTurn \} from "@\/runtime\/channelRunner"/);
    assert.match(pane, /void sendChannelMessage\(channel\.id, text, \{ all \}\)/);
    assert.match(pane, /data-testid="channel-run-all"[\s\S]*?onClick=\{\(\) => send\(composer, true\)\}/);
    assert.match(pane, /data-testid="channel-composer"/);
    assert.match(pane, /channelTurnRulesText\(first\?\.name \?\? null\)/, "the header tooltip documents the default speaker");
    assert.match(pane, /function MemberMentionHint\(\{ members \}: \{ members: Bot\[\] \}\)/, "the @ picker lists members only");
    assert.equal(/allBots|s\.bots\.filter\(isActiveBot\)/.test(/function MemberMentionHint[\s\S]*$/.exec(pane)![0]), false);
    assert.equal(/from "@\/runtime\/harnessAdapter"|from "@\/lib\/runtime\/harness"/.test(pane), false, "the pane runs nothing itself");
  });

  it("sidebar: a labelled Channels group, New channel, and Open channel with… — all through the store's server-backed actions", () => {
    assert.match(sidebar, /data-testid="channels-section"/);
    assert.match(sidebar, /data-testid="channel-row"/);
    assert.match(sidebar, /data-testid="new-channel"/);
    assert.match(sidebar, /Open channel with…/);
    assert.match(sidebar, /openChannelWith\(bot\.id\)/);
    assert.match(sidebar, /const channels = useLocalBot\(\(s\) => s\.channels\)/);
    assert.equal(/localStorage|useState<Channel\[\]>/.test(sidebar), false, "channels must come from disk, not React state");
    // The channel rows are inside their own labelled group, not the roster-row list.
    const section = /data-testid="channels-section"[\s\S]*?data-testid="new-channel"/.exec(sidebar);
    assert.ok(section);
    assert.equal(/data-testid="roster-row"/.test(section![0]), false);
    assert.match(section![0], />\s*Channels\s*</);
  });

  it("shell shows ChannelPane xor ChatPane; the store keeps selectedBotId xor selectedChannelId", () => {
    assert.match(shell, /\{selectedChannel \? <ChannelPane \/> : <ChatPane \/>\}/);
    assert.match(shell, /if \(!selected && !selectedChannel\)/);
    assert.match(store, /selectBot: \(id\) => \{[\s\S]*?selectedChannelId: id \? null : s\.ui\.selectedChannelId/);
    assert.match(store, /selectChannel: async \(id\) => \{[\s\S]*?selectedChannelId: id, selectedBotId: null/);
  });

  it("every store mutation is a channels* server function (disk first)", () => {
    for (const fn of ["channelsList", "channelsCreate", "channelsRename", "channelsDelete", "channelsAddMember", "channelsRemoveMember", "channelsRead", "channelsAppend"]) {
      assert.match(store, new RegExp(`\\b${fn}\\(`), `store.ts must call ${fn}`);
    }
    assert.match(store, /await get\(\)\.loadChannels\(\);/, "loadFromDisk re-reads channels from disk");
    assert.match(store, /openChannelWith: async \(targetBotId\) => \{[\s\S]*?return get\(\)\.createChannel\(`\$\{current\.name\} \+ \$\{target\.name\}`, \[current\.id, target\.id\]\)/);
    const partial = /partialize: \(s\) => \(\{([\s\S]*?)\}\)/.exec(store);
    assert.ok(partial);
    assert.equal(/channels/.test(partial![1]!), false, "channels are never persisted in the browser copy");
  });
});

describe("Stage 16: turn rules (pure)", () => {
  const members = [
    { id: "bot_a", name: "Alice" },
    { id: "bot_b", name: "Bob" },
    { id: "bot_c", name: "Cara" },
  ];

  it("parses @ mentions in order, deduplicated", () => {
    assert.deepEqual(parseMentions("hi @Bob and @alice, @Bob again"), ["Bob", "alice"]);
    assert.deepEqual(parseMentions("no mentions here"), []);
  });

  it("no @ → the first member only (the documented default)", () => {
    const p = planSpeakers("what is the plan?", members);
    assert.deepEqual(p, { speakers: ["bot_a"], unknown: [], reason: "default-first" });
    assert.match(channelTurnRulesText("Alice"), /No @ → the first member \(Alice\) answers\./);
  });

  it("@Alice → only Alice; several @ → those members in mention order, one list", () => {
    assert.deepEqual(planSpeakers("@Alice take this", members).speakers, ["bot_a"]);
    assert.deepEqual(planSpeakers("@Cara then @bob please", members).speakers, ["bot_c", "bot_b"]);
    assert.deepEqual(planSpeakers("@Bob @Bob @Bob", members).speakers, ["bot_b"]);
  });

  it("a non-member @ is reported and runs nobody; a lone non-member @ runs nobody at all", () => {
    const p = planSpeakers("@Zed do it", members);
    assert.deepEqual(p.speakers, []);
    assert.deepEqual(p.unknown, ["Zed"]);
    const mixed = planSpeakers("@Zed and @Alice", members);
    assert.deepEqual(mixed.speakers, ["bot_a"]);
    assert.deepEqual(mixed.unknown, ["Zed"]);
  });

  it("Run all is only the explicit flag — never implied by the text", () => {
    assert.deepEqual(planSpeakers("everyone, all of you, @all", members).speakers, [], "'@all' is just an unknown name");
    assert.deepEqual(planSpeakers("", members, { all: true }), { speakers: ["bot_a", "bot_b", "bot_c"], unknown: [], reason: "all" });
    assert.deepEqual(planSpeakers("x", []), { speakers: [], unknown: [], reason: "nobody" });
  });

  it("BUSY queue keeps at most one page per member", () => {
    assert.equal(CHANNEL_QUEUE_PER_MEMBER, 1);
    let q = enqueuePage([], "bot_a");
    assert.deepEqual(q, { queue: ["bot_a"], added: true });
    q = enqueuePage(q.queue, "bot_a");
    assert.deepEqual(q, { queue: ["bot_a"], added: false }, "a second page for the same member is dropped");
    q = enqueuePage(q.queue, "bot_b");
    assert.deepEqual(q.queue, ["bot_a", "bot_b"]);
    assert.equal(enqueuePage(q.queue, "bot_b").added, false);
  });

  it("the member's user text is the last N lines with speaker names, then an instruction to reply as itself", () => {
    const msgs: ChannelMessage[] = [];
    for (let i = 0; i < CHANNEL_CONTEXT_MESSAGES + 5; i++) {
      msgs.push({ id: `m${i}`, role: i % 2 ? "assistant" : "user", speakerId: i % 2 ? "bot_b" : null, content: `line ${i}`, createdAt: "" });
    }
    const channel: Pick<Channel, "name" | "memberIds"> = { name: "launch", memberIds: ["bot_a", "bot_b"] };
    const text = renderChannelPrompt({ channel, messages: msgs, speaker: members[0]!, names: { bot_a: "Alice", bot_b: "Bob" }, employeeName: "Sam", why: "mentions" });
    assert.match(text, /^You are Alice, a member of the channel #launch with Bob and Sam \(the employee\)\./);
    assert.match(text, /You were paged with @Alice\./);
    assert.match(text, new RegExp(`Recent channel messages \\(oldest first, ${CHANNEL_CONTEXT_MESSAGES} of ${msgs.length}\\):`));
    assert.equal(/\[Sam\] line 0\n/.test(text), false, "older lines are cut");
    assert.match(text, /\[Bob\] line 27\n\[Sam\] line 28\n\nReply now as Alice\.$/);
    const dflt = renderChannelPrompt({ channel, messages: [], speaker: members[0]!, names: {}, employeeName: "Sam", why: "default-first" });
    assert.match(dflt, /You are the first member of this channel, so you answer when nobody is paged\./);
    assert.match(dflt, /\(no messages yet\)/);
  });

  it("names and member lists are cleaned; < 2 members is refused", () => {
    assert.equal(CHANNEL_MIN_MEMBERS, 2);
    assert.equal(cleanChannelName("  # launch   room "), "launch room");
    assert.throws(() => cleanChannelName(""), isCode("BAD_NAME"));
    assert.throws(() => cleanChannelName("x".repeat(61)), isCode("BAD_NAME"));
    assert.deepEqual(cleanMemberIds(["a", "b", "a"]), ["a", "b"]);
    assert.throws(() => cleanMemberIds(["a", "a"]), isCode("TOO_FEW_MEMBERS"));
    assert.throws(() => cleanMemberIds(["a"]), isCode("TOO_FEW_MEMBERS"));
    assert.throws(() => cleanMemberIds([]), isCode("TOO_FEW_MEMBERS"));
    assert.equal(normalizeChannelMessage({ id: "x", role: "user", content: "hi" })?.speakerId, null);
    assert.equal(normalizeChannelMessage({ id: "x", role: "nope", content: "hi" }), null);
    assert.equal(normalizeChannelMessage({ role: "user", content: "hi" }), null, "id is required");
  });
});

describe("Stage 16: records on disk, outside every scope", () => {
  const ctx = {} as { folders: FoldersConfig; base: string; dataDir: string; aliceId: string; bobId: string; oldId: string };
  const prevDataDir = process.env.LOCALBOT_DATA_DIR;
  const roster = () => loadRoster(ctx.folders);
  const cctx = () => ({ folders: ctx.folders, roster: roster() });

  before(() => {
    ctx.dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb16-data-"));
    process.env.LOCALBOT_DATA_DIR = ctx.dataDir;
    ctx.base = makeTempRoot("lb16-root-");
    const folders: FoldersConfig = {
      employeeRoot: path.join(ctx.base, "emp"),
      employeeShared: path.join(ctx.base, "emp-shared"),
      departmentShared: path.join(ctx.base, "dept-shared"),
      companyShared: null,
    };
    const set = setFolders(folders, { create: true });
    assert.ok(set.ok);
    ctx.folders = set.folders;
    const now = new Date().toISOString();
    ensureAgent(ctx.folders, { name: "Alice", job: "writes", modelId: "fixture", color: "sage", mascotId: "writer", scopes: ["private"], standingInstructions: "", createdAt: now });
    ensureAgent(ctx.folders, { name: "Bob", job: "reviews", modelId: "fixture", color: "steel", mascotId: "ops", scopes: ["private"], standingInstructions: "", createdAt: now });
    ensureAgent(ctx.folders, { name: "Old", job: "retired", modelId: "fixture", color: "sage", mascotId: "ops", scopes: ["private"], standingInstructions: "", createdAt: now });
    setAgentArchived(ctx.folders, "Old", true);
    const rows = roster();
    ctx.aliceId = rows.find((r) => r.name === "Alice")!.id;
    ctx.bobId = rows.find((r) => r.name === "Bob")!.id;
    ctx.oldId = rows.find((r) => r.name === "Old")!.id;
  });

  after(() => {
    if (prevDataDir === undefined) delete process.env.LOCALBOT_DATA_DIR;
    else process.env.LOCALBOT_DATA_DIR = prevDataDir;
  });

  it("refuses a channels dir under any scope root — nothing is written", () => {
    const saved = process.env.LOCALBOT_DATA_DIR;
    const c = cctx();
    try {
      for (const root of [ctx.folders.employeeRoot, ctx.folders.employeeShared!, ctx.folders.departmentShared!]) {
        process.env.LOCALBOT_DATA_DIR = path.join(root, "LocalBot-data");
        assert.throws(() => assertChannelsOutsideScopes(ctx.folders), isCode("OUTSIDE_SCOPE"), `channels under ${root} must be refused`);
        assert.throws(() => createChannel({ name: "Leak", memberIds: [ctx.aliceId, ctx.bobId] }, c), isCode("OUTSIDE_SCOPE"));
        assert.equal(fs.existsSync(path.join(root, "LocalBot-data", "channels")), false, "no channels/ may appear inside a scope");
      }
    } finally {
      process.env.LOCALBOT_DATA_DIR = saved;
    }
    assert.doesNotThrow(() => assertChannelsOutsideScopes(ctx.folders));
    assert.doesNotThrow(() => assertChannelsOutsideScopes(null));
    const dir = channelsDir();
    for (const root of [ctx.folders.employeeRoot, ctx.folders.employeeShared!, ctx.folders.departmentShared!]) {
      assert.equal(path.relative(root, dir).startsWith(".."), true, `${dir} must be outside ${root}`);
    }
  });

  it("refuses empty name, < 2 members, unknown agent, archived member — nothing on disk", () => {
    const before = listChannels().length;
    assert.throws(() => createChannel({ name: "  ", memberIds: [ctx.aliceId, ctx.bobId] }, cctx()), isCode("BAD_NAME"));
    assert.throws(() => createChannel({ name: "Solo", memberIds: [ctx.aliceId] }, cctx()), isCode("TOO_FEW_MEMBERS"));
    assert.throws(() => createChannel({ name: "Dup", memberIds: [ctx.aliceId, ctx.aliceId] }, cctx()), isCode("TOO_FEW_MEMBERS"));
    assert.throws(() => createChannel({ name: "Ghost", memberIds: [ctx.aliceId, "bot_nope"] }, cctx()), isCode("UNKNOWN_AGENT"));
    assert.throws(() => createChannel({ name: "Retired", memberIds: [ctx.aliceId, ctx.oldId] }, cctx()), isCode("ARCHIVED"));
    assert.equal(listChannels().length, before);
    assert.equal(fs.existsSync(channelsDir()) ? fs.readdirSync(channelsDir()).length : 0, 0, "nothing written by the refused creates");
  });

  it("create writes {dataDir}/channels/{id}.json + {id}.messages.json atomically; rename keeps .bak; NOT_FOUND on a missing id", () => {
    const ch = createChannel({ name: "launch", memberIds: [ctx.aliceId, ctx.bobId] }, cctx());
    const file = channelPath(ch.id);
    const tfile = channelMessagesPath(ch.id);
    assert.equal(path.dirname(file), path.join(ctx.dataDir, "channels"));
    assert.ok(fs.existsSync(file), "record must be on disk");
    assert.ok(fs.existsSync(tfile), "transcript must be on disk");
    assert.equal(path.basename(tfile), `${ch.id}.messages.json`);
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Channel;
    assert.deepEqual(Object.keys(raw).sort(), ["createdAt", "id", "memberIds", "name", "updatedAt"]);
    assert.deepEqual(raw.memberIds, [ctx.aliceId, ctx.bobId]);
    assert.deepEqual(readChannel(ch.id), ch);
    assert.deepEqual(readChannelMessages(ch.id).messages, []);
    assert.ok(listChannels().some((x) => x.id === ch.id));
    assert.equal(listChannels().length, 1, "the .messages.json file is not listed as a channel");
    assert.equal(fs.readdirSync(path.dirname(file)).some((n) => n.endsWith(".tmp")), false, "no temp file left behind");

    const r = renameChannel(ch.id, "launch-2", cctx());
    assert.equal(r.name, "launch-2");
    assert.ok(fs.existsSync(`${file}.bak`), "previous copy kept as .bak");
    assert.equal((JSON.parse(fs.readFileSync(`${file}.bak`, "utf8")) as Channel).name, "launch");
    assert.throws(() => renameChannel(ch.id, "", cctx()), isCode("BAD_NAME"));
    assert.throws(() => renameChannel("ch_missing0000", "x", cctx()), isCode("NOT_FOUND"));
    assert.throws(() => addChannelMember("ch_missing0000", ctx.aliceId, cctx()), isCode("NOT_FOUND"));
    assert.throws(() => appendChannelMessages("ch_missing0000", [{ id: "m", role: "user", content: "x" }], ctx.folders), isCode("NOT_FOUND"));
    deleteChannel(ch.id);
  });

  it("add / remove member: archived refused, duplicate refused, cannot drop below 2, non-member refused", () => {
    const now = new Date().toISOString();
    ensureAgent(ctx.folders, { name: "Cara", job: "plans", modelId: "fixture", color: "moss", mascotId: "ops", scopes: ["private"], standingInstructions: "", createdAt: now });
    const caraId = roster().find((r) => r.name === "Cara")!.id;
    const ch = createChannel({ name: "team", memberIds: [ctx.aliceId, ctx.bobId] }, cctx());
    assert.throws(() => addChannelMember(ch.id, ctx.oldId, cctx()), isCode("ARCHIVED"));
    assert.throws(() => addChannelMember(ch.id, "bot_nope", cctx()), isCode("UNKNOWN_AGENT"));
    assert.throws(() => addChannelMember(ch.id, ctx.aliceId, cctx()), isCode("ALREADY_MEMBER"));
    assert.deepEqual(addChannelMember(ch.id, caraId, cctx()).memberIds, [ctx.aliceId, ctx.bobId, caraId]);
    assert.deepEqual(readChannel(ch.id)!.memberIds, [ctx.aliceId, ctx.bobId, caraId], "add is on disk");
    assert.throws(() => removeChannelMember(ch.id, "bot_nope", cctx()), isCode("NOT_MEMBER"));
    assert.deepEqual(removeChannelMember(ch.id, caraId, cctx()).memberIds, [ctx.aliceId, ctx.bobId]);
    assert.throws(() => removeChannelMember(ch.id, ctx.bobId, cctx()), isCode("TOO_FEW_MEMBERS"), "cannot drop below 2");
    assert.deepEqual(readChannel(ch.id)!.memberIds, [ctx.aliceId, ctx.bobId], "the refused remove wrote nothing");
    deleteChannel(ch.id);
  });

  it("appends the employee line as role user and a member reply with speakerId; the transcript is the durable copy", () => {
    const ch = createChannel({ name: "thread", memberIds: [ctx.aliceId, ctx.bobId] }, cctx());
    const t1 = appendChannelMessages(ch.id, [{ id: "u1", role: "user", speakerId: null, content: "@Alice draft the brief" }], ctx.folders);
    assert.equal(t1.messages.length, 1);
    assert.equal(t1.messages[0]!.role, "user");
    assert.equal(t1.messages[0]!.speakerId, null);
    assert.ok(t1.messages[0]!.createdAt, "createdAt filled in");
    const t2 = appendChannelMessages(ch.id, [{ id: "a1", role: "assistant", speakerId: ctx.aliceId, content: "On it.", chips: [{ id: "c", kind: "write", label: "Write", detail: "private/brief.md", status: "ok" }] }], ctx.folders);
    assert.equal(t2.messages.length, 2);
    assert.equal(t2.messages[1]!.speakerId, ctx.aliceId);
    assert.equal(t2.messages[1]!.chips?.length, 1);
    // Same id twice is not duplicated (the browser may retry).
    assert.equal(appendChannelMessages(ch.id, [{ id: "a1", role: "assistant", speakerId: ctx.aliceId, content: "On it." }], ctx.folders).messages.length, 2);
    assert.throws(() => appendChannelMessages(ch.id, [{ role: "user", content: "no id" }], ctx.folders), isCode("BAD_MESSAGE"));
    const onDisk = JSON.parse(fs.readFileSync(channelMessagesPath(ch.id), "utf8")) as { channelId: string; messages: ChannelMessage[] };
    assert.equal(onDisk.channelId, ch.id);
    assert.equal(onDisk.messages.length, 2);
    assert.ok(fs.existsSync(`${channelMessagesPath(ch.id)}.bak`));
    deleteChannel(ch.id);
    assert.equal(fs.existsSync(channelPath(ch.id)), false);
    assert.equal(fs.existsSync(channelMessagesPath(ch.id)), false);
    assert.equal(fs.existsSync(`${channelMessagesPath(ch.id)}.bak`), false, "delete removes the transcript .bak too");
  });

  it("a FRESH node process reads the record and transcript back (fails if channels only lived in React state)", async () => {
    const { spawnSync } = await import("node:child_process");
    const { pathToFileURL } = await import("node:url");
    const ch = createChannel({ name: "durable", memberIds: [ctx.aliceId, ctx.bobId] }, cctx());
    appendChannelMessages(ch.id, [{ id: "u1", role: "user", speakerId: null, content: "hello room" }], ctx.folders);
    const probe = `
      import { listChannels, readChannelMessages } from ${JSON.stringify(pathToFileURL(path.join(repo, "src/lib/fs/channels.ts")).href)};
      const list = listChannels();
      console.log(JSON.stringify({ ids: list.map((c) => c.id), names: list.map((c) => c.name), lines: list.map((c) => readChannelMessages(c.id).messages.map((m) => m.content)) }));
    `;
    const res = spawnSync(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "--input-type=module", "-e", probe], {
      env: { ...process.env, LOCALBOT_DATA_DIR: ctx.dataDir },
      encoding: "utf8",
    });
    const out = JSON.parse(res.stdout.trim().split("\n").pop()!) as { ids: string[]; names: string[]; lines: string[][] };
    assert.ok(out.ids.includes(ch.id), `fresh process must see channels/${ch.id}.json (stderr=${res.stderr})`);
    assert.ok(out.names.includes("durable"));
    assert.deepEqual(out.lines[out.ids.indexOf(ch.id)], ["hello room"]);
    deleteChannel(ch.id);
  });

  it("gates: NOT_MEMBER / ARCHIVED / BUSY / DISCONNECTED keep a member from running; a free member passes", () => {
    const ch = createChannel({ name: "gated", memberIds: [ctx.aliceId, ctx.bobId] }, cctx());
    const deps = (busy: string[] = []) => ({ folders: ctx.folders, roster: roster(), hasActiveTurn: (n: string) => busy.includes(n) });
    assert.equal(gateChannelSpeaker(ch, ctx.aliceId, deps()).name, "Alice");
    assert.throws(() => gateChannelSpeaker(ch, ctx.oldId, deps()), isCode("NOT_MEMBER"), "a non-member is refused before anything else");
    assert.throws(() => gateChannelSpeaker(ch, "bot_nope", deps()), isCode("NOT_MEMBER"));
    assert.throws(() => gateChannelSpeaker(ch, ctx.aliceId, deps(["Alice"])), isCode("BUSY"));
    assert.equal(gateChannelSpeaker(ch, ctx.bobId, deps(["Alice"])).name, "Bob", "Bob is free while Alice is busy");
    assert.throws(() => gateChannelSpeaker(ch, ctx.aliceId, { folders: null, roster: roster(), hasActiveTurn: () => false }), isCode("NOT_CONFIGURED"));

    setAgentArchived(ctx.folders, "Bob", true);
    assert.throws(() => gateChannelSpeaker(ch, ctx.bobId, deps()), isCode("ARCHIVED"), "a member archived after the fact is skipped");
    const all = channelGateAll(ch.id, deps());
    assert.deepEqual(all.map((g) => g.ok), [true, false]);
    assert.equal(all[1]!.ok ? "" : all[1]!.code, "ARCHIVED");
    setAgentArchived(ctx.folders, "Bob", false);

    const rows = roster();
    const away = `${ctx.folders.employeeRoot}.away`;
    fs.renameSync(ctx.folders.employeeRoot, away);
    try {
      const g = channelGate(ch.id, ctx.aliceId, { folders: ctx.folders, roster: rows, hasActiveTurn: () => false });
      assert.equal(g.ok ? "" : g.code, "DISCONNECTED");
    } finally {
      fs.renameSync(away, ctx.folders.employeeRoot);
    }
    assert.equal(channelGate(ch.id, ctx.aliceId, deps()).ok, true);
    assert.throws(() => channelGate("ch_missing0000", ctx.aliceId, deps()), isCode("NOT_FOUND"));
    deleteChannel(ch.id);
  });
});
