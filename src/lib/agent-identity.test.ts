/**
 * Stage 12 — agent identity: Edit profile, colour that paints, roster
 * sections on disk, conversational create. Run:
 *   node --experimental-strip-types --test src/lib/agent-identity.test.ts
 *
 * These fail when:
 *   - profile save skips the sidecar (store.ts `updateBotProfile` sets state
 *     without `agentUpdateProfile`, or server.ts does not rename on disk /
 *     forget the ACP session / write agent.json + AGENTS.md)
 *   - colour is stored but ignored: avatar.tsx does not paint with
 *     AGENT_COLORS[bot.color].hex, or the mascot bodies are back on the
 *     hard-coded var(--color-mascot-*) fills, or the roster row / chat header
 *     stop rendering AgentAvatar
 *   - sections live only in React state: the host index has no sections[] /
 *     sectionId, a fresh loadHostIndex on the same dataDir loses them, or
 *     store.ts does not read them from the sidecar in loadFromDisk
 *   - + still only opens NewAgentDialog (no setup-chat path), or the modal is gone
 *   - chat.tsx drops runAgentTurn, or the dsh / ACP pins float
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { agentColorHex, agentColorId, FALLBACK_AGENT_COLOR } from "./agent-color.ts";
import { makeTempRoot } from "./fs/disk.ts";
import {
  createSection,
  deleteSection,
  findRow,
  hostIndexPath,
  listSections,
  loadHostIndex,
  loadRoster,
  patchRowById,
  renameRow,
  renameSection,
  reorderSections,
  saveHostIndex,
} from "./fs/host-index.ts";
import type { FoldersConfig } from "./fs/scope-model.ts";
import {
  ensureAgent,
  readAgent,
  readAgentStanding,
  renameAgent,
  setFolders,
  standingBodyOf,
  standingMarkdown,
  updateAgentProfile,
} from "./fs/scopes.ts";
import { ACP_SDK_PIN, DSH_PIN } from "./harness/process.ts";
import { groupRoster } from "./roster-sections.ts";
import { parseSetupAnswer, setupPrompt, setupStepForAnswers, SETUP_STEPS } from "./setup-chat.ts";
import { AGENT_COLORS } from "./types.ts";

const REPO = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(REPO, p), "utf8");
const pkg = JSON.parse(read("package.json"));

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
    createdAt: "2026-09-05T00:00:00.000Z",
    ...extra,
  });
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-stage12-"));
  process.env.LOCALBOT_DATA_DIR = dataDir;
  const base = makeTempRoot("lb-stage12-root-");
  const set = setFolders(
    { employeeRoot: path.join(base, "emp"), employeeShared: null, departmentShared: null, companyShared: null },
    { create: true },
  );
  assert.ok(set.ok);
  folders = set.folders;
});

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.LOCALBOT_DATA_DIR;
  else process.env.LOCALBOT_DATA_DIR = prevDataDir;
});

/* ---------------- Edit profile: disk ---------------- */

describe("Stage 12 — Edit profile writes agent.json + AGENTS.md on disk", () => {
  it("job / colour / mascot land in agent.json and the description becomes the AGENTS.md body", () => {
    mkAgent("Writer");
    const before = loadRoster(folders)[0]!;
    assert.equal(before.color, "sage");
    const r = updateAgentProfile(folders, "Writer", {
      job: "Drafts launch briefs",
      description: "Always start from private/output/brief.md.\n\nKeep it to one page.",
      color: "clay",
      mascotId: "researcher",
    });
    assert.equal(r.name, "Writer");
    assert.equal(r.job, "Drafts launch briefs");
    assert.equal(r.color, "clay");
    assert.equal(r.mascotId, "researcher");
    const rec = readAgent(folders, "Writer")!;
    assert.equal(rec.color, "clay");
    assert.equal(rec.mascotId, "researcher");
    assert.equal(rec.job, "Drafts launch briefs");
    assert.equal(rec.modelId, "qwen25-05b-q4", "profile save never touches the model");
    const md = readAgentStanding(folders, "Writer")!;
    assert.equal(md, "# Writer\n\nDrafts launch briefs\n\nAlways start from private/output/brief.md.\n\nKeep it to one page.\n");
    const after = loadRoster(folders)[0]!;
    assert.equal(after.color, "clay");
    assert.equal(after.job, "Drafts launch briefs");
    assert.equal(after.standingInstructions, "Always start from private/output/brief.md.\n\nKeep it to one page.");
    assert.equal(after.id, before.id, "same roster id");
  });

  it("a partial patch keeps the other fields and the existing description", () => {
    mkAgent("Writer");
    updateAgentProfile(folders, "Writer", { color: "pine" });
    const rec = readAgent(folders, "Writer")!;
    assert.equal(rec.color, "pine");
    assert.equal(rec.job, "Writer job");
    assert.equal(rec.mascotId, "writer");
    assert.equal(standingBodyOf(readAgentStanding(folders, "Writer")), "Be Writer.");
    // An empty description clears the body but keeps heading + job.
    updateAgentProfile(folders, "Writer", { description: "" });
    assert.equal(readAgentStanding(folders, "Writer"), "# Writer\n\nWriter job\n");
  });

  it("rename-on-disk first, then the profile on the new name: folder moved, heading retitled, row id kept", () => {
    mkAgent("Writer");
    const [row] = loadRoster(folders);
    const moved = renameAgent(folders, "Writer", "Author");
    assert.equal(moved.name, "Author");
    assert.ok(renameRow("Writer", "Author"));
    const r = updateAgentProfile(folders, "Author", { job: "Long-form", color: "moss" });
    assert.equal(r.name, "Author");
    assert.equal(fs.existsSync(path.join(folders.employeeRoot, "agents", "Writer")), false);
    assert.ok(fs.existsSync(path.join(folders.employeeRoot, "agents", "Author", "agent.json")));
    assert.match(readAgentStanding(folders, "Author")!, /^# Author\n\nLong-form\n/);
    const roster = loadRoster(folders);
    assert.deepEqual(roster.map((x) => [x.name, x.id, x.color]), [["Author", row!.id, "moss"]]);
  });

  it("refuses a colour / mascot that is not a plain token, and a missing agent", () => {
    mkAgent("Writer");
    assert.throws(() => updateAgentProfile(folders, "Writer", { color: "../x" }), /Bad color/);
    assert.throws(() => updateAgentProfile(folders, "Writer", { mascotId: "a/b" }), /Bad mascotId/);
    assert.throws(() => updateAgentProfile(folders, "Nobody", { job: "x" }), /No agent folder/);
  });

  it("standingMarkdown and standingBodyOf round-trip", () => {
    const md = standingMarkdown("Ops", "Keeps the lights on", "Line one.\n\nLine two.");
    assert.equal(md, "# Ops\n\nKeeps the lights on\n\nLine one.\n\nLine two.\n");
    assert.equal(standingBodyOf(md), "Line one.\n\nLine two.");
    assert.equal(standingBodyOf(standingMarkdown("Ops", "job", "")), "");
    assert.equal(standingBodyOf(null), "");
  });
});

/* ---------------- Sections: disk ---------------- */

describe("Stage 12 — roster sections live in the host index, not in React state", () => {
  it("create / rename / reorder / delete are written to localbot-agents.json and survive a fresh load", () => {
    mkAgent("Writer");
    mkAgent("Editor");
    const [editor, writer] = loadRoster(folders);
    const drafting = createSection("Drafting");
    const review = createSection("Review");
    assert.match(drafting.id, /^sec_[0-9a-f]{8}$/);
    assert.deepEqual(listSections().map((s) => [s.name, s.order]), [["Drafting", 0], ["Review", 1]]);
    patchRowById(writer!.id, { sectionId: drafting.id });
    patchRowById(editor!.id, { sectionId: review.id });

    // Nothing in a browser: read the file the way a brand-new process would.
    const raw = JSON.parse(fs.readFileSync(hostIndexPath(), "utf8")) as { sections: unknown[]; agents: { name: string; sectionId: string | null }[] };
    assert.deepEqual(raw.sections, [
      { id: drafting.id, name: "Drafting", order: 0 },
      { id: review.id, name: "Review", order: 1 },
    ]);
    assert.equal(raw.agents.find((a) => a.name === "Writer")!.sectionId, drafting.id);
    assert.equal(raw.agents.find((a) => a.name === "Editor")!.sectionId, review.id);

    const fresh = loadHostIndex();
    assert.deepEqual(fresh.sections.map((s) => s.name), ["Drafting", "Review"]);
    const roster = loadRoster(folders);
    assert.deepEqual(roster.map((r) => [r.name, r.sectionId]), [["Editor", review.id], ["Writer", drafting.id]]);

    renameSection(review.id, "Copy review");
    reorderSections([review.id, drafting.id]);
    assert.deepEqual(loadHostIndex().sections.map((s) => [s.name, s.order]), [["Copy review", 0], ["Drafting", 1]]);

    const del = deleteSection(drafting.id);
    assert.equal(del.unsorted, 1);
    assert.deepEqual(loadHostIndex().sections.map((s) => s.name), ["Copy review"]);
    assert.equal(findRow(loadHostIndex(), "Writer")!.sectionId, null, "agents in a deleted section become unsorted");
    assert.equal(findRow(loadHostIndex(), "Editor")!.sectionId, review.id);
    assert.ok(readAgent(folders, "Writer"), "deleting a section never touches an agent folder");
  });

  it("validation: empty / duplicate names, unknown section on move, dangling sectionId on load", () => {
    mkAgent("Writer");
    const [w] = loadRoster(folders);
    assert.throws(() => createSection("   "), /cannot be empty/);
    createSection("Drafting");
    assert.throws(() => createSection("drafting"), /already exists/);
    assert.throws(() => renameSection("sec_nope", "X"), /No section/);
    assert.throws(() => patchRowById(w!.id, { sectionId: "sec_nope" }), /No section with id/);
    assert.equal(patchRowById(w!.id, { pinned: true })!.sectionId, null, "pinned patch leaves the section alone");
    // A row pointing at a section that is gone from the file is unsorted, not dropped.
    const idx = loadHostIndex();
    saveHostIndex({ ...idx, agents: idx.agents.map((r) => ({ ...r, sectionId: "sec_gone" })) });
    const again = loadHostIndex();
    assert.equal(again.agents.length, 1);
    assert.equal(again.agents[0]!.sectionId, null);
  });

  it("an index written before Stage 12 (no sections key) loads with an empty list and unsorted rows", () => {
    mkAgent("Writer");
    loadRoster(folders);
    const raw = JSON.parse(fs.readFileSync(hostIndexPath(), "utf8")) as Record<string, unknown>;
    delete raw.sections;
    for (const a of raw.agents as Record<string, unknown>[]) delete a.sectionId;
    fs.writeFileSync(hostIndexPath(), JSON.stringify(raw));
    const idx = loadHostIndex();
    assert.deepEqual(idx.sections, []);
    assert.equal(idx.agents[0]!.sectionId, null);
    assert.equal(loadRoster(folders)[0]!.sectionId, null);
  });
});

/* ---------------- Pure helpers ---------------- */

describe("Stage 12 — groupRoster (pure)", () => {
  const sections = [
    { id: "s2", name: "Review", order: 1 },
    { id: "s1", name: "Drafting", order: 0 },
  ];
  const bots = [
    { id: "a", name: "Writer", sectionId: "s1" },
    { id: "b", name: "Editor", sectionId: "s2" },
    { id: "c", name: "Ops", sectionId: null },
    { id: "d", name: "Ghost", sectionId: "s_gone" },
  ];

  it("groups by section order, unsorted (and dangling) last", () => {
    const g = groupRoster(bots, sections);
    assert.deepEqual(
      g.map((x) => [x.section?.name ?? null, x.bots.map((b) => b.id)]),
      [["Drafting", ["a"]], ["Review", ["b"]], [null, ["c", "d"]]],
    );
  });

  it("keeps empty sections while browsing, hides them while searching; no sections → one plain group", () => {
    const g = groupRoster([bots[0]!], sections);
    assert.deepEqual(g.map((x) => [x.section?.name ?? null, x.bots.length]), [["Drafting", 1], ["Review", 0]]);
    const s = groupRoster([bots[0]!], sections, { searching: true });
    assert.deepEqual(s.map((x) => [x.section?.name ?? null, x.bots.length]), [["Drafting", 1]]);
    assert.deepEqual(groupRoster(bots, []).map((x) => [x.section, x.bots.length]), [[null, 4]]);
    assert.deepEqual(groupRoster([], []).map((x) => [x.section, x.bots.length]), [[null, 0]]);
    // Search crosses groups: a filtered list from two sections keeps both headings.
    const both = groupRoster([bots[0]!, bots[1]!], sections, { searching: true });
    assert.deepEqual(both.map((x) => x.section?.name), ["Drafting", "Review"]);
  });
});

describe("Stage 12 — setup chat script (pure)", () => {
  it("asks name → job → description, then is done", () => {
    assert.deepEqual(SETUP_STEPS, ["name", "job", "description"]);
    assert.equal(setupStepForAnswers(0), "name");
    assert.equal(setupStepForAnswers(1), "job");
    assert.equal(setupStepForAnswers(2), "description");
    assert.equal(setupStepForAnswers(3), "done");
    assert.match(setupPrompt("name", {}), /What should I be called\?/);
    assert.match(setupPrompt("job", { name: "Scout" }), /^Scout\. What's my job\?/);
    assert.match(setupPrompt("description", { name: "Scout" }), /AGENTS\.md/);
    assert.match(setupPrompt("done", { name: "Scout", job: "Finds sources" }), /I'm Scout — Finds sources/);
  });

  it("validates names the way the sidecar does, trims jobs, treats skip as an empty description", () => {
    assert.deepEqual(parseSetupAnswer("name", "  Scout  "), { ok: true, value: "Scout" });
    assert.equal(parseSetupAnswer("name", "").ok, false);
    assert.equal(parseSetupAnswer("name", "a/b").ok, false);
    assert.equal(parseSetupAnswer("name", ".hidden").ok, false);
    assert.equal(parseSetupAnswer("name", "x".repeat(65)).ok, false);
    assert.deepEqual(parseSetupAnswer("job", "  Finds   sources "), { ok: true, value: "Finds sources" });
    assert.equal(parseSetupAnswer("job", "").ok, false);
    assert.deepEqual(parseSetupAnswer("description", "skip"), { ok: true, value: "" });
    assert.deepEqual(parseSetupAnswer("description", "Cite everything."), { ok: true, value: "Cite everything." });
    assert.equal(parseSetupAnswer("done", "x").ok, false);
  });
});

describe("Stage 12 — agent colour resolves to paint", () => {
  it("every palette id maps to its hex; unknown ids fall back instead of rendering unpainted", () => {
    for (const c of Object.values(AGENT_COLORS)) assert.equal(agentColorHex(c.id), c.hex);
    assert.equal(agentColorId("nope"), FALLBACK_AGENT_COLOR);
    assert.equal(agentColorHex("#7c9cff"), AGENT_COLORS[FALLBACK_AGENT_COLOR].hex);
    assert.equal(agentColorHex(undefined), AGENT_COLORS[FALLBACK_AGENT_COLOR].hex);
  });
});

/* ---------------- Source gates ---------------- */

describe("Stage 12 — profile save goes through the sidecar, not the store", () => {
  const store = read("src/lib/store.ts");
  const server = read("src/lib/fs/server.ts");

  it("store.updateBotProfile awaits agentUpdateProfile before it touches the roster row", () => {
    const fn = /updateBotProfile: async \(id, patch\) => \{([\s\S]*?)\n {6}\},/.exec(store);
    assert.ok(fn, "store.ts has no updateBotProfile action");
    const body = fn![1]!;
    const call = body.indexOf("await agentUpdateProfile({");
    assert.ok(call >= 0, "updateBotProfile does not call the sidecar (agentUpdateProfile)");
    const setIdx = body.indexOf("set((cur)");
    assert.ok(setIdx > call, "updateBotProfile updates React state before the sidecar answered");
    assert.match(body, /if \(!r\.ok\) return \{ ok: false, error: r\.error \}/);
    assert.match(body, /newName: wanted && wanted !== bot\.name \? wanted : undefined/);
  });

  it("server.agentUpdateProfile renames on disk (renameAgent + renameRow + forgetSession) then writes agent.json + AGENTS.md", () => {
    const fn = /export const agentUpdateProfile = createServerFn[\s\S]*?\n {2}\}\);/.exec(server);
    assert.ok(fn, "server.ts has no agentUpdateProfile");
    const body = fn![0];
    const i = (s: string) => {
      const at = body.indexOf(s);
      assert.ok(at >= 0, `agentUpdateProfile lacks ${s}`);
      return at;
    };
    assert.ok(i("renameAgent(folders, data.agentName, wanted)") < i("renameRow(data.agentName, moved.name)"));
    assert.ok(i("renameRow(data.agentName, moved.name)") < i("harness.forgetSession(data.agentName)"));
    assert.ok(i("harness.forgetSession(data.agentName)") < i("updateAgentProfile(folders, name, {"));
    assert.match(body, /hasActiveTurn\(data\.agentName\)/);
    const scopes = read("src/lib/fs/scopes.ts");
    assert.match(scopes, /export function updateAgentProfile\([\s\S]*?writeAgentRecord\(dir, next\);[\s\S]*?writeAgentStanding\(folders, agentName, job, body\)/);
    assert.match(scopes, /export function writeAgentRecord\(/);
  });

  it("the Edit profile panel exists, is reached from the … menu, and saves through updateBotProfile", () => {
    const panel = read("src/components/localbot/edit-profile.tsx");
    assert.match(panel, /useLocalBot\(\(s\) => s\.updateBotProfile\)/);
    assert.match(panel, /await updateBotProfile\(bot\.id, \{ name, job, description, mascotId, color \}\)/);
    for (const id of ["profile-name", "profile-job", "profile-description", "profile-save"]) {
      assert.match(panel, new RegExp(`data-testid="${id}"`), `edit-profile.tsx lacks ${id}`);
    }
    assert.match(panel, /MASCOT_IDS\.map/);
    assert.match(panel, /AGENT_COLOR_LIST\.map/);
    assert.equal(/agentEnsure|fs\.writeFileSync|writeAgentRecord/.test(panel), false, "the panel writes disk itself");
    const sidebar = read("src/components/localbot/sidebar.tsx");
    assert.match(sidebar, /setUi\(\{ editProfileBotId: bot\.id \}\)/);
    assert.match(sidebar, /Edit profile/);
    assert.match(read("src/components/localbot/shell.tsx"), /<EditProfileDialog \/>/);
  });
});

describe("Stage 12 — colour paints (roster row + chat header), not just a swatch", () => {
  const avatar = read("src/components/localbot/avatar.tsx");
  const mascots = read("src/components/localbot/mascots/index.tsx");
  const sidebar = read("src/components/localbot/sidebar.tsx");
  const chat = read("src/components/localbot/chat.tsx");

  it("AgentAvatar resolves bot.color through AGENT_COLORS and hands the hex to the mascot", () => {
    assert.match(avatar, /import \{ agentColorBackdrop, agentColorHex, agentColorId \} from "@\/lib\/agent-color"/);
    assert.match(avatar, /const hex = agentColorHex\(bot\.color\)/);
    assert.match(avatar, /<MascotMark id=\{mascot\} color=\{hex\}/);
    assert.match(avatar, /data-agent-color=\{agentColorId\(bot\.color\)\}/);
    assert.match(avatar, /boxShadow: `0 0 0 1\.5px \$\{hex\}`/);
    assert.match(read("src/lib/agent-color.ts"), /AGENT_COLORS\[agentColorId\(color\)\]\.hex/);
  });

  it("every mascot body is filled with the colour prop; the theme token is only the fallback", () => {
    const bodies = mascots.match(/data-part="body"/g) ?? [];
    assert.equal(bodies.length, 3, "three mascots, three bodies");
    for (const m of mascots.matchAll(/<(ellipse|rect)[^>]*?data-part="body"[^>]*?>/g)) {
      assert.match(m[0], /fill=\{body\}/, `mascot body uses a hard-coded fill: ${m[0]}`);
    }
    for (const id of ["writer", "researcher", "ops"]) {
      assert.match(mascots, new RegExp(`const body = color \\?\\? "var\\(--color-mascot-${id}\\)"`), `${id}: body colour is not the prop`);
    }
    assert.equal((mascots.match(/fill="var\(--color-mascot-(writer|researcher|ops)\)"/g) ?? []).length, 0, "a mascot body still uses the token directly");
  });

  it("the roster row and the chat header both render AgentAvatar with the bot (its colour)", () => {
    const row = /data-testid="roster-row"[\s\S]*?<\/details>/.exec(sidebar);
    assert.ok(row, "no roster-row block");
    assert.match(row![0], /<AgentAvatar bot=\{bot\} size="sm" \/>/);
    assert.match(row![0], /data-agent-color=\{bot\.color\}/);
    const header = /<header[\s\S]*?<\/header>/.exec(chat);
    assert.ok(header, "no chat header");
    assert.match(header![0], /<AgentAvatar bot=\{bot\} size="sm" \/>/);
    assert.match(header![0], /data-agent-color=\{bot\.color\}/);
  });
});

describe("Stage 12 — sections are read from the sidecar and grouped in the sidebar", () => {
  const store = read("src/lib/store.ts");
  const sidebar = read("src/components/localbot/sidebar.tsx");
  const hostIndex = read("src/lib/fs/host-index.ts");

  it("host index types carry sections[] and sectionId; the store loads them in loadFromDisk and never persists them", () => {
    assert.match(hostIndex, /export type HostSection = \{ id: string; name: string; order: number \}/);
    assert.match(hostIndex, /sections: HostSection\[\];/);
    assert.match(hostIndex, /sectionId: string \| null;/);
    assert.match(hostIndex, /export type HostAgentPatch = Partial<Pick<HostAgentRow, "pinned" \| "hidden" \| "unread" \| "sectionId">>/);
    assert.match(store, /loadFromDisk: async \(\) => \{[\s\S]*?sections: \[\.\.\.\(st\.index\.sections \?\? \[\]\)\]/);
    assert.match(store, /sectionId: r\.sectionId \?\? null/);
    const partialize = /partialize: \(s\) => \(\{([\s\S]*?)\}\),\s*\}/.exec(store);
    assert.ok(partialize);
    assert.equal(/\bsections:/.test(partialize![1]!), false, "sections must not be persisted in localStorage");
    assert.equal(/\bbots:/.test(partialize![1]!), false);
    // Every section action is a sidecar call first.
    assert.match(store, /createSection: async \(name\) => \{\s*const r = await sectionCreate\(/);
    assert.match(store, /renameSection: async \(id, name\) => \{\s*const r = await sectionRename\(/);
    assert.match(store, /deleteSection: async \(id\) => \{\s*const r = await sectionDelete\(/);
    assert.match(store, /moveBotToSection: async \(botId, sectionId\) => \{[\s\S]*?await statePatchAgent\(\{ data: \{ id: botId, sectionId \} \}\)/);
  });

  it("the sidebar groups through groupRoster, keeps the search across groups, and offers create / rename / delete / move", () => {
    assert.match(sidebar, /import \{ groupRoster \} from "@\/lib\/roster-sections"/);
    assert.match(sidebar, /const groups = groupRoster\(bots, sections, \{ searching \}\)/);
    assert.match(sidebar, /filterRoster\(visibleBots\(\{ bots: allBots \}\), query\)/, "search must run before grouping");
    assert.match(sidebar, /data-testid="roster-section"/);
    assert.match(sidebar, /data-testid="new-section"/);
    assert.match(sidebar, /Rename section/);
    assert.match(sidebar, /Delete section/);
    assert.match(sidebar, /data-testid="move-to-section"/);
    assert.match(sidebar, /moveBotToSection\(bot\.id, sec\.id\)/);
    assert.match(sidebar, /moveBotToSection\(bot\.id, null\)/);
  });
});

describe("Stage 12 — + opens a setup chat; the modal is the Advanced fallback", () => {
  const sidebar = read("src/components/localbot/sidebar.tsx");
  const chat = read("src/components/localbot/chat.tsx");
  const store = read("src/lib/store.ts");

  it("data-testid=new-agent starts the setup agent; only the Advanced control opens NewAgentDialog", () => {
    const newBtn = /<Button[^>]*data-testid="new-agent"[\s\S]*?<\/Button>/.exec(sidebar);
    assert.ok(newBtn, "no + New agent button");
    assert.match(newBtn![0], /startSetupAgent\(\)/);
    assert.equal(/newAgentOpen/.test(newBtn![0]), false, "+ New agent still opens the modal by default");
    const adv = /<Button[^>]*data-testid="new-agent-advanced"[\s\S]*?<\/Button>/.exec(sidebar);
    assert.ok(adv, "no Advanced control");
    assert.match(adv![0], /newAgentOpen: true/);
    assert.match(read("src/components/localbot/shell.tsx"), /<NewAgentDialog \/>/);
    assert.match(read("src/components/localbot/new-agent.tsx"), /await createBot\(\{/);
  });

  it("startSetupAgent goes through createBot → agentEnsure and flags the chat; the setup chat writes through updateBotProfile", () => {
    assert.match(store, /startSetupAgent: async \(\) => \{[\s\S]*?await get\(\)\.createBot\(\{ name, job: SETUP_PLACEHOLDER_JOB/);
    assert.match(store, /createBot: async \(input\) => \{[\s\S]*?await agentEnsure\(\{/);
    assert.match(store, /setupBotId: bot\.id/);
    assert.match(chat, /const inSetup = Boolean\(selected && setupBotId === selected\)/);
    assert.match(chat, /if \(inSetup\) \{\s*await answerSetup\(trimmed\);\s*return;\s*\}/);
    assert.match(chat, /await updateBotProfile\(bot\.id, \{\s*name: state\.name,\s*job: state\.job,\s*description: state\.description,\s*\}\)/);
    assert.match(chat, /endSetup\(bot\.id\)/);
    assert.match(chat, /setupPrompt\("name", \{\}\)/);
    assert.match(chat, /data-setup=\{inSetup \? "true" : "false"\}/);
  });

  it("chat.tsx still runs normal turns through runAgentTurn, and the pins are exact", () => {
    assert.match(chat, /import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/);
    assert.match(chat, /await runAgentTurn\(\{/);
    assert.equal(pkg.dependencies["@deepseek-ai/dsh"], DSH_PIN);
    assert.equal(pkg.dependencies["@agentclientprotocol/sdk"], ACP_SDK_PIN);
    assert.match(DSH_PIN, /^\d/);
    assert.match(ACP_SDK_PIN, /^\d/);
  });
});
