#!/usr/bin/env node
/**
 * Stage 12 prove-it: agent identity (run: `npm run prove:identity`).
 *
 * Static gates (always):
 *   - avatar.tsx paints with AGENT_COLORS[bot.color].hex (agentColorHex) and hands
 *     it to MascotMark; every mascot body is `fill={body}` with the theme token as
 *     the fallback only — no hard-coded var(--color-mascot-*) body fill
 *   - host-index.ts has sections[] + sectionId; store.ts loads sections from the
 *     sidecar in loadFromDisk and does not persist them; every section action calls
 *     the sidecar first
 *   - store.updateBotProfile awaits agentUpdateProfile; server.agentUpdateProfile
 *     runs renameAgent → renameRow → forgetSession → updateAgentProfile
 *   - sidebar.tsx: data-testid=new-agent → startSetupAgent (no newAgentOpen); the
 *     Advanced control is the only newAgentOpen: true; Edit profile in the … menu
 *   - chat.tsx keeps runAgentTurn and has the setup-chat path; the dsh pin is exact
 *
 * Live gates (skip with --static): dev Electron + Playwright against a temp
 * LOCALBOT_DATA_DIR seeded with Writer (clay) and Editor (pine).
 *   1. colour paints: each roster row's mascot body fill is the hex of its stored
 *      colour, the two rows differ, and the chat header for the selected agent
 *      carries the same fill
 *   2. Edit profile (… menu): rename Writer → Author, new job + description,
 *      colour moss, Save → agents/Author/agent.json has color moss + job,
 *      AGENTS.md has the description, agents/Writer/ is gone, the roster row and
 *      the header now paint moss, the chat file kept its id
 *   3. sections: + New section "Drafting" → … menu → Section → Drafting moves
 *      Author under the heading; localbot-agents.json has sections[0].name
 *      "Drafting" and the row's sectionId
 *   4. localStorage.clear() + reload against the same LOCALBOT_DATA_DIR: the
 *      Drafting heading is still there with Author under it (sections live on disk)
 *   5. conversational create: + New agent opens a setup chat (no modal): the
 *      agent asks for a name → "Scout" → job → "Finds sources" → description →
 *      "Cite everything." → agents/Scout/agent.json + AGENTS.md written, the
 *      placeholder folder is gone, the chat is a normal chat on Scout
 *   6. the Advanced control still opens the New agent modal; Cancel closes it
 *
 * Usage:
 *   npm run prove:identity                # dev Electron; starts vite on :8080
 *   npm run prove:identity -- --static    # static gates only
 *   npm run prove:identity -- --screenshot /tmp/stage12.png
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { seedLocalBotData } from "./seed-localbot-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const log = (...a) => console.log("[prove-identity]", ...a);
const fail = (msg) => {
  console.error("[prove-identity] FAIL:", msg);
  process.exit(1);
};
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// ---- 0. static gates -------------------------------------------------------
const pkg = JSON.parse(read("package.json"));
const avatar = read("src/components/localbot/avatar.tsx");
const mascots = read("src/components/localbot/mascots/index.tsx");
const sidebar = read("src/components/localbot/sidebar.tsx");
const chat = read("src/components/localbot/chat.tsx");
const store = read("src/lib/store.ts");
const server = read("src/lib/fs/server.ts");
const hostIndex = read("src/lib/fs/host-index.ts");

if (!/const hex = agentColorHex\(bot\.color\)/.test(avatar)) fail("avatar.tsx does not resolve bot.color through agentColorHex — the stored colour is ignored");
if (!/<MascotMark id=\{mascot\} color=\{hex\}/.test(avatar)) fail("avatar.tsx does not hand the colour to MascotMark");
if ((mascots.match(/data-part="body"/g) ?? []).length !== 3) fail("mascots/index.tsx: expected three mascot bodies marked data-part=\"body\"");
for (const m of mascots.matchAll(/<(ellipse|rect)[^>]*?data-part="body"[^>]*?>/g)) {
  if (!/fill=\{body\}/.test(m[0])) fail(`a mascot body still has a hard-coded fill: ${m[0]}`);
}
if (/fill="var\(--color-mascot-(writer|researcher|ops)\)"/.test(mascots)) fail("a mascot body still uses var(--color-mascot-*) directly (colour would not paint)");
for (const id of ["writer", "researcher", "ops"]) {
  if (!new RegExp(`const body = color \\?\\? "var\\(--color-mascot-${id}\\)"`).test(mascots)) fail(`${id} mascot: the body colour is not the colour prop (theme token may only be the fallback)`);
}
if (!/export type HostSection = \{ id: string; name: string; order: number \}/.test(hostIndex)) fail("host-index.ts has no HostSection { id, name, order }");
if (!/sections: HostSection\[\];/.test(hostIndex)) fail("HostIndex has no sections[]");
if (!/sectionId: string \| null;/.test(hostIndex)) fail("HostAgentRow has no sectionId");
if (!/loadFromDisk: async \(\) => \{[\s\S]*?sections: \[\.\.\.\(st\.index\.sections \?\? \[\]\)\]/.test(store)) fail("store.loadFromDisk does not read sections from the sidecar (they would live only in React state)");
const partialize = /partialize: \(s\) => \(\{([\s\S]*?)\}\),\s*\}/.exec(store);
if (!partialize || /\bsections:/.test(partialize[1])) fail("store.ts persists sections in localStorage");
if (!/createSection: async \(name\) => \{\s*const r = await sectionCreate\(/.test(store)) fail("store.createSection does not call the sidecar first");
if (!/moveBotToSection: async \(botId, sectionId\) => \{[\s\S]*?await statePatchAgent\(\{ data: \{ id: botId, sectionId \} \}\)/.test(store)) fail("store.moveBotToSection does not write the index row");
const upd = /updateBotProfile: async \(id, patch\) => \{([\s\S]*?)\n {6}\},/.exec(store);
if (!upd) fail("store.ts has no updateBotProfile");
if (!(upd[1].indexOf("await agentUpdateProfile({") >= 0 && upd[1].indexOf("await agentUpdateProfile({") < upd[1].indexOf("set((cur)"))) fail("store.updateBotProfile is store-only (no sidecar call before the state update)");
const srv = /export const agentUpdateProfile = createServerFn[\s\S]*?\n {2}\}\);/.exec(server);
if (!srv) fail("server.ts has no agentUpdateProfile");
for (const s of ["renameAgent(folders, data.agentName, wanted)", "renameRow(data.agentName, moved.name)", "harness.forgetSession(data.agentName)", "updateAgentProfile(folders, name, {"]) {
  if (!srv[0].includes(s)) fail(`server.agentUpdateProfile lacks ${s}`);
}
const newBtn = /<Button[^>]*data-testid="new-agent"[\s\S]*?<\/Button>/.exec(sidebar);
if (!newBtn || !/startSetupAgent\(\)/.test(newBtn[0])) fail("sidebar + New agent does not start a setup chat");
if (/newAgentOpen/.test(newBtn[0])) fail("sidebar + New agent still opens the modal by default");
const adv = /<Button[^>]*data-testid="new-agent-advanced"[\s\S]*?<\/Button>/.exec(sidebar);
if (!adv || !/newAgentOpen: true/.test(adv[0])) fail("sidebar has no Advanced control that opens NewAgentDialog");
if (!/setUi\(\{ editProfileBotId: bot\.id \}\)/.test(sidebar)) fail("sidebar … menu has no Edit profile item");
if (!/await runAgentTurn\(\{/.test(chat)) fail("chat.tsx dropped runAgentTurn");
if (!/await answerSetup\(trimmed\)/.test(chat)) fail("chat.tsx has no setup-chat path");
const dshPin = pkg.dependencies?.["@deepseek-ai/dsh"] ?? "";
if (!/^\d/.test(dshPin)) fail(`@deepseek-ai/dsh pin floats: "${dshPin}"`);
log("static gates ok: colour → agentColorHex → mascot body | sections in host index + loadFromDisk | profile save via agentUpdateProfile (rename → row → forgetSession → agent.json/AGENTS.md) | + → setup chat, Advanced → modal | runAgentTurn kept | dsh", dshPin);

if (flag("--static")) {
  console.log("STAGE12_IDENTITY_STATIC_PASS");
  process.exit(0);
}

// ---- 1. launch ---------------------------------------------------------------
const { _electron } = await import("playwright");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-prove-identity-"));
const work = path.join(tmp, "work");
const dataDir = path.join(tmp, "data");
const employeeRoot = path.join(work, "employees/Sam");
const cleanup = [];
process.on("exit", () => {
  for (const fn of cleanup.reverse()) {
    try {
      fn();
    } catch {
      /* best effort */
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

const COLORS = { sage: "#8fa394", steel: "#7a8ea3", clay: "#c17f59", moss: "#6b8f71", slate: "#9aa0b4", pine: "#5f8f86" };
const { index: seeded } = seedLocalBotData({
  dataDir,
  folders: { employeeRoot, employeeShared: null, departmentShared: path.join(work, "departments/Ops/shared"), companyShared: null },
  agents: [
    { name: "Writer", job: "Drafts launch briefs", color: "clay", mascotId: "writer" },
    { name: "Editor", job: "Copy edits and tone", color: "pine", mascotId: "researcher" },
  ],
  idPrefix: "ident",
});
const writerId = seeded.agents[0].id;
// A chat for Writer so we can prove rename keeps the chat keyed by id.
fs.mkdirSync(path.join(dataDir, "chats"), { recursive: true });
fs.writeFileSync(
  path.join(dataDir, "chats", `${writerId}.json`),
  JSON.stringify({ version: 1, agentId: writerId, messages: [{ id: "m1", botId: writerId, role: "user", content: "seeded", createdAt: new Date().toISOString() }], chatGrants: {}, lastReadAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, null, 2),
);

async function up(url, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}
if (await up("http://127.0.0.1:8080/", 500)) fail("127.0.0.1:8080 already answering — stop the other npm run dev first (the proof needs vite on its own LOCALBOT_DATA_DIR)");
const electronBin = require("electron");
const env = { ...process.env, LOCALBOT_DATA_DIR: dataDir, BROWSER: "none" };
delete env.ELECTRON_RUN_AS_NODE;
log("dev Electron", electronBin, "| LOCALBOT_DATA_DIR", dataDir);
const electronApp = await _electron.launch({ executablePath: electronBin, args: [path.join(root, "desktop/main.mjs")], cwd: root, env, timeout: 180000 });
const pid = electronApp.process().pid;
cleanup.push(() => {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* gone */
  }
});
electronApp.process().stderr?.on("data", (d) => {
  const t = String(d);
  if (/preload|Unable to load|ERR_/i.test(t)) process.stderr.write("[electron] " + t);
});
const page = await electronApp.firstWindow({ timeout: 180000 });
await page.getByTestId("sidebar").waitFor({ timeout: 180000 });

const agentJson = (name) => JSON.parse(fs.readFileSync(path.join(employeeRoot, "agents", name, "agent.json"), "utf8"));
const agentsMd = (name) => fs.readFileSync(path.join(employeeRoot, "agents", name, "AGENTS.md"), "utf8");
const hostIndexFile = () => JSON.parse(fs.readFileSync(path.join(dataDir, "localbot-agents.json"), "utf8"));
const row = (name) => page.locator('[data-testid="roster-row"]', { has: page.locator("span.truncate.text-sm.font-medium", { hasText: new RegExp(`^${name}$`) }) }).first();
const rowPaint = async (name) => {
  const r = row(name);
  await r.waitFor({ timeout: 15000 });
  return {
    color: await r.getAttribute("data-agent-color"),
    fill: await r.locator('[data-part="body"]').first().getAttribute("fill"),
    ring: await r.locator('[data-testid="agent-avatar"]').first().evaluate((el) => getComputedStyle(el).boxShadow),
  };
};
const headerPaint = async () => ({
  color: await page.getByTestId("chat-header").getAttribute("data-agent-color"),
  fill: await page.locator('[data-testid="chat-header"] [data-part="body"]').first().getAttribute("fill"),
  name: (await page.locator('[data-testid="chat-header"] h1').textContent())?.trim(),
});
const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const openMenu = async (name) => {
  const r = row(name);
  await r.hover();
  await r.locator(`summary[aria-label="Actions for ${name}"]`).click();
};
const menuItem = (name, label) => row(name).locator("details button", { hasText: new RegExp(`^\\s*${label}\\s*$`) }).first();

// ---- 2. colour paints ---------------------------------------------------------------
const w0 = await rowPaint("Writer");
const e0 = await rowPaint("Editor");
if (w0.color !== "clay" || w0.fill !== COLORS.clay) fail(`Writer (clay) row paints ${JSON.stringify(w0)}, expected body fill ${COLORS.clay}`);
if (e0.color !== "pine" || e0.fill !== COLORS.pine) fail(`Editor (pine) row paints ${JSON.stringify(e0)}, expected body fill ${COLORS.pine}`);
if (w0.fill === e0.fill) fail("two agents with different stored colours render the same fill — colour does not paint");
if (!w0.ring.includes(hexToRgb(COLORS.clay))) fail(`Writer avatar ring is ${w0.ring}, expected ${hexToRgb(COLORS.clay)}`);
await row("Writer").locator("button").first().click();
await page.getByTestId("chat-header").waitFor({ timeout: 15000 });
let h = await headerPaint();
if (h.name !== "Writer" || h.color !== "clay" || h.fill !== COLORS.clay) fail(`chat header for Writer paints ${JSON.stringify(h)}`);
log(`colour paints: Writer clay → row body ${w0.fill} · Editor pine → row body ${e0.fill} · header ${h.fill} (ring ${hexToRgb(COLORS.clay)})`);

// ---- 3. Edit profile ---------------------------------------------------------------
await openMenu("Writer");
await menuItem("Writer", "Edit profile").click();
const panel = page.getByTestId("edit-profile");
await panel.waitFor({ timeout: 10000 });
if ((await page.getByTestId("profile-name").inputValue()) !== "Writer") fail("Edit profile did not load the current name");
if ((await page.getByTestId("profile-job").inputValue()) !== "Drafts launch briefs") fail("Edit profile did not load the current job");
await page.getByTestId("profile-name").fill("Author");
await page.getByTestId("profile-job").fill("Long-form drafts");
await page.getByTestId("profile-description").fill("Cite sources.\n\nOne page max.");
await page.getByTestId("profile-mascot-ops").click();
await page.getByTestId("profile-color-moss").click();
await page.getByTestId("profile-save").click();
await panel.waitFor({ state: "hidden", timeout: 15000 });
if (fs.existsSync(path.join(employeeRoot, "agents", "Writer"))) fail("Edit profile rename left agents/Writer/ on disk");
const author = agentJson("Author");
if (author.color !== "moss") fail(`agents/Author/agent.json color is ${author.color}, expected moss`);
if (author.job !== "Long-form drafts") fail(`agents/Author/agent.json job is ${author.job}`);
if (author.mascotId !== "ops") fail(`agents/Author/agent.json mascotId is ${author.mascotId}`);
if (author.name !== "Author") fail(`agents/Author/agent.json name is ${author.name}`);
const md = agentsMd("Author");
if (md !== "# Author\n\nLong-form drafts\n\nCite sources.\n\nOne page max.\n") fail(`agents/Author/AGENTS.md is ${JSON.stringify(md)}`);
const idxAfterRename = hostIndexFile();
const authorRow = idxAfterRename.agents.find((a) => a.name === "Author");
if (!authorRow || authorRow.id !== writerId) fail(`host index row after rename: ${JSON.stringify(authorRow)}, expected id ${writerId}`);
if (!fs.existsSync(path.join(dataDir, "chats", `${writerId}.json`))) fail("rename lost the chat file (chats are keyed by id)");
const a1 = await rowPaint("Author");
if (a1.color !== "moss" || a1.fill !== COLORS.moss) fail(`Author row after Save paints ${JSON.stringify(a1)}, expected ${COLORS.moss}`);
h = await headerPaint();
if (h.name !== "Author" || h.fill !== COLORS.moss) fail(`chat header after Save paints ${JSON.stringify(h)}`);
if ((await row("Author").locator("span.text-\\[11px\\]").first().textContent())?.trim() !== "Long-form drafts") fail("roster row does not show the new job");
log(`Edit profile: Writer → Author on disk (agents/Author/agent.json color=moss job="Long-form drafts" mascot=ops · AGENTS.md body written · row id kept ${writerId}) · row + header now paint ${a1.fill}`);

// ---- 4. sections -----------------------------------------------------------------
await page.getByTestId("new-section").click();
const secInput = page.getByTestId("section-name-input");
await secInput.waitFor({ timeout: 5000 });
await secInput.fill("Drafting");
await secInput.press("Enter");
const heading = page.locator('[data-testid="section-name"]', { hasText: "Drafting" });
await heading.waitFor({ timeout: 10000 });
let idx = hostIndexFile();
if (!Array.isArray(idx.sections) || idx.sections.length !== 1 || idx.sections[0].name !== "Drafting") fail(`localbot-agents.json sections = ${JSON.stringify(idx.sections)}`);
const draftingId = idx.sections[0].id;
await openMenu("Author");
await menuItem("Author", "Drafting").click();
await page.locator(`[data-testid="roster-section"][data-section-id="${draftingId}"] [data-testid="roster-row"][data-agent-id="${writerId}"]`).waitFor({ timeout: 10000 });
idx = hostIndexFile();
if (idx.agents.find((a) => a.id === writerId)?.sectionId !== draftingId) fail(`host index row sectionId = ${JSON.stringify(idx.agents.find((a) => a.id === writerId))}`);
const editorRow = idx.agents.find((a) => a.name === "Editor");
if (editorRow.sectionId !== null) fail("Editor got a section it was never moved to");
// Search crosses groups: "long" (Author's job) keeps the Drafting heading; "copy" (Editor) drops the empty heading.
const search = page.getByTestId("roster-search");
await search.fill("long");
await page.waitForTimeout(150);
if ((await heading.count()) !== 1 || (await row("Author").count()) !== 1 || (await row("Editor").count()) !== 0) fail("search inside a section does not narrow across groups");
await search.fill("copy");
await page.waitForTimeout(150);
if ((await heading.count()) !== 0 || (await row("Editor").count()) !== 1) fail("an empty section is not hidden while searching");
await search.fill("");
await page.waitForTimeout(150);
log(`sections: "Drafting" ${draftingId} in localbot-agents.json · Author row sectionId=${draftingId} · search crosses groups, empty heading hidden while searching`);

// ---- 5. localStorage wipe + reload ---------------------------------------------------
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByTestId("sidebar").waitFor({ timeout: 60000 });
await heading.waitFor({ timeout: 30000 });
await page.locator(`[data-testid="roster-section"][data-section-id="${draftingId}"] [data-testid="roster-row"][data-agent-id="${writerId}"]`).waitFor({ timeout: 10000 });
const a2 = await rowPaint("Author");
if (a2.fill !== COLORS.moss) fail(`after a localStorage wipe Author paints ${a2.fill}`);
log("localStorage.clear() + reload: Drafting heading still there with Author under it; colour still moss (all from disk)");

// ---- 6. conversational create ---------------------------------------------------------
await page.getByTestId("new-agent").click();
const pane = page.getByTestId("chat-pane");
await page.locator('[data-testid="chat-pane"][data-setup="true"]').waitFor({ timeout: 15000 });
if ((await page.getByRole("heading", { level: 2, name: "New agent" }).count()) !== 0) fail("+ New agent opened the modal instead of a setup chat");
if (!fs.existsSync(path.join(employeeRoot, "agents", "New agent", "agent.json"))) fail("setup chat did not ensure agents/New agent/ on disk first");
const composer = page.getByTestId("composer");
const transcript = page.getByTestId("transcript");
await transcript.getByText(/What should I be called\?/).waitFor({ timeout: 10000 });
await composer.fill("Scout");
await composer.press("Enter");
await transcript.getByText(/Scout\. What's my job\?/).waitFor({ timeout: 10000 });
await composer.fill("Finds sources");
await composer.press("Enter");
await transcript.getByText(/Anything I should always keep in mind\?/).waitFor({ timeout: 10000 });
await composer.fill("Cite everything.");
await composer.press("Enter");
await page.locator('[data-testid="chat-pane"][data-setup="false"]').waitFor({ timeout: 30000 });
await transcript.getByText(/All set\. I'm Scout — Finds sources/).waitFor({ timeout: 10000 });
if (fs.existsSync(path.join(employeeRoot, "agents", "New agent"))) fail("setup chat left the placeholder agents/New agent/ folder behind");
const scout = agentJson("Scout");
if (scout.job !== "Finds sources") fail(`agents/Scout/agent.json job is ${scout.job}`);
if (agentsMd("Scout") !== "# Scout\n\nFinds sources\n\nCite everything.\n") fail(`agents/Scout/AGENTS.md is ${JSON.stringify(agentsMd("Scout"))}`);
h = await headerPaint();
if (h.name !== "Scout") fail(`after setup the chat header is ${h.name}, expected Scout`);
if (!/^Message Scout/.test((await composer.getAttribute("placeholder")) ?? "")) fail(`after setup the composer placeholder is ${await composer.getAttribute("placeholder")}`);
await row("Scout").waitFor({ timeout: 10000 });
if (!hostIndexFile().agents.some((a) => a.name === "Scout")) fail("host index has no Scout row after setup");
void pane;
log('conversational create: + → setup chat on agents/New agent/ → "Scout" → "Finds sources" → "Cite everything." → agents/Scout/agent.json + AGENTS.md · placeholder folder gone · chat is now a normal chat on Scout');

// ---- 7. Advanced still opens the modal ---------------------------------------------------
await page.getByTestId("new-agent-advanced").click();
const modalHeading = page.getByRole("heading", { level: 2, name: "New agent" });
await modalHeading.waitFor({ timeout: 10000 });
await page.getByRole("button", { name: "Cancel" }).click();
await modalHeading.waitFor({ state: "hidden", timeout: 10000 });
log("Advanced control opens the New agent modal; Cancel closes it");

const shot = opt("--screenshot");
if (shot) {
  await page.screenshot({ path: path.resolve(shot) });
  log("screenshot", path.resolve(shot));
}

console.log(
  `STAGE12_IDENTITY_PASS color_row=${w0.fill}/${e0.fill} header=${COLORS.moss} profile=agents/Author(agent.json+AGENTS.md,row_id_kept) sections=disk(${draftingId}) wipe_reload=kept setup_chat=agents/Scout advanced_modal=WORKS data_dir=temp`,
);
await electronApp.close().catch(() => {});
process.exit(0);
