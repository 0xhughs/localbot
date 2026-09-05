#!/usr/bin/env node
/**
 * Stage 11 prove-it: desktop chrome + composer + roster find (run: `npm run prove:chrome`).
 *
 * Static gates (always):
 *   - desktop/preload.cjs is CommonJS and main.mjs loads it under sandbox: true
 *   - main.mjs keeps hiddenInset + trafficLightPosition and has an Edit menu with
 *     the native roles undo / redo / cut / copy / paste / selectAll
 *   - desktop-titlebar.tsx has the traffic-light gutter and no Settings button
 *   - sidebar.tsx: + New agent above the roster search above the roster; Settings in
 *     the footer, after the Archived group — never next to the Wordmark
 *   - chat.tsx keeps runAgentTurn, a native <textarea> (no contenteditable), the
 *     6-line cap and the jump-to-latest control; the dsh pin does not float
 *
 * Live gates (skip with --static): the Electron app is launched with Playwright
 * against a temp LOCALBOT_DATA_DIR seeded with two agents and a 40-message chat.
 *   1. window.localbotDesktop exists (the preload bridge loaded) and the title
 *      strip renders; on darwin the Wordmark's top edge is below the traffic
 *      lights (BrowserWindow.getWindowButtonPosition + 12 px) and the strip's
 *      gutter clears them
 *   2. Settings button is in the bottom 64 px of the sidebar, below the roster;
 *      the title strip contains no Settings button
 *   3. + New agent is above the search field, which is above the roster; the
 *      Advanced control beside it opens the New agent dialog (Stage 12: + itself
 *      opens a setup chat — see prove-identity.mjs)
 *   4. typing in the search narrows the roster by name and by job; a miss shows
 *      "No agents match"; clearing shows everyone again
 *   5. composer: one line → grows per line → caps at 6 lines with overflowY auto
 *      and scrollHeight > clientHeight (inner scroll), .scrollbar-thin applied
 *   6. Edit menu: the application menu (Menu.getApplicationMenu) has the roles
 *      undo / redo / cut / copy / paste / selectAll, and selectAll → copy → cut →
 *      paste → undo act on the composer through the native path those menu items
 *      use on macOS (Menu.sendActionToFirstResponder; webContents methods elsewhere).
 *      Steals focus for ~2 s and uses the system clipboard (restored afterwards).
 *      If the window cannot become key the shortcut half is reported UNVERIFIED.
 *   7. transcript starts pinned (no ↓ control); scrolling up shows "Jump to latest";
 *      clicking it pins to the bottom again and hides the control
 *
 * Usage:
 *   npm run prove:chrome                 # dev Electron (node_modules/electron + desktop/main.mjs); starts vite on :8080
 *   npm run prove:chrome -- --static     # static gates only
 *   npm run prove:chrome -- --app <LocalBot.app>        # packaged app: real AppData. Empty AppData → seeded + full gates
 *                                                       # (seed removed afterwards); existing config → chrome-only gates,
 *                                                       # nothing written → STAGE11_CHROME_PACKAGED_PASS
 *   npm run prove:chrome -- --screenshot /tmp/stage11.png   # also save a picture of the final state
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
const log = (...a) => console.log("[prove-chrome]", ...a);
const fail = (msg) => {
  console.error("[prove-chrome] FAIL:", msg);
  process.exit(1);
};
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// ---- 0. static gates -------------------------------------------------------
const pkg = JSON.parse(read("package.json"));
const main = read("desktop/main.mjs");
if (fs.existsSync(path.join(root, "desktop/preload.mjs"))) fail("desktop/preload.mjs exists — an ESM preload never loads under sandbox: true");
const preload = read("desktop/preload.cjs");
if (/^\s*import\s/m.test(preload)) fail("desktop/preload.cjs uses ESM import");
if (!/require\("electron"\)/.test(preload)) fail("desktop/preload.cjs does not require electron");
if (!/preload:\s*path\.join\(here,\s*"preload\.cjs"\)/.test(main)) fail("main.mjs does not load desktop/preload.cjs");
if (!/sandbox:\s*true/.test(main)) fail("main.mjs turned the renderer sandbox off");
if (!/titleBarStyle:\s*process\.platform === "darwin" \? "hiddenInset" : "hidden"/.test(main)) fail("main.mjs lost hiddenInset");
if (!/trafficLightPosition:\s*\{/.test(main)) fail("main.mjs lost trafficLightPosition");
if (!pkg.build.asarUnpack.includes("desktop/**/*.cjs")) fail("package.json build.asarUnpack does not unpack desktop/**/*.cjs");
const edit = /label:\s*"Edit",\s*submenu:\s*\[([\s\S]*?)\]/.exec(main);
if (!edit) fail("main.mjs has no Edit menu");
for (const role of ["undo", "redo", "cut", "copy", "paste", "selectAll"]) {
  if (!new RegExp(`role:\\s*"${role}"`).test(edit[1])) fail(`Edit menu lacks role ${role}`);
}
const strip = read("src/components/localbot/desktop-titlebar.tsx");
if (!/data-testid="traffic-light-gutter"/.test(strip)) fail("desktop-titlebar.tsx lost the traffic-light gutter");
if (/aria-label="Settings"|<Settings\b/.test(strip)) fail("Settings button is in the title strip (next to the traffic lights)");
if (/<Wordmark/.test(strip)) fail("the Wordmark is in the title strip (under the traffic lights)");
const sidebar = read("src/components/localbot/sidebar.tsx");
const at = (re, what) => {
  const m = re.exec(sidebar);
  if (!m) fail(`sidebar.tsx has no ${what}`);
  return m.index;
};
const header = /data-testid="sidebar-header"[\s\S]*?<\/div>/.exec(sidebar);
if (!header) fail("sidebar.tsx has no sidebar-header block");
if (/Settings/.test(header[0])) fail("Settings is still next to the Wordmark in the sidebar header (the traffic-light corner)");
const iSettings = at(/aria-label="Settings"/, "Settings button");
const iRoster = at(/data-testid="roster"/, "roster");
const iSearch = at(/data-testid="roster-search"/, "roster search");
const iNew = at(/newAgentOpen:\s*true/, "+ New agent");
const iFooter = at(/data-testid="sidebar-footer"/, "sidebar footer");
if (!(iSettings > iRoster && iSettings > iFooter)) fail("Settings is not in the sidebar footer below the roster");
if (!(iNew < iSearch && iSearch < iRoster)) fail("sidebar order is not: + New agent, search, roster");
if (/newAgentOpen/.test(sidebar.slice(iFooter))) fail("+ New agent is (still) in the sidebar footer");
const chat = read("src/components/localbot/chat.tsx");
if (!chat.includes("runAgentTurn")) fail("src/components/localbot/chat.tsx dropped runAgentTurn");
if (/contentEditable|contenteditable/.test(chat)) fail("chat.tsx composer became a contenteditable");
if (/rows=\{2\}/.test(chat)) fail("chat.tsx composer is the fixed rows={2} textarea again");
if (!/data-testid="jump-to-latest"/.test(chat)) fail("chat.tsx has no jump-to-latest control");
if (!/COMPOSER_MAX_LINES/.test(chat)) fail("chat.tsx lost the composer line cap");
const dshPin = pkg.dependencies?.["@deepseek-ai/dsh"] ?? "";
if (!/^\d/.test(dshPin)) fail(`@deepseek-ai/dsh pin floats: "${dshPin}"`);
log("static gates ok: preload.cjs + sandbox | hiddenInset + trafficLightPosition | Edit roles | no Settings in title strip | sidebar order + / search / roster / Settings | runAgentTurn kept | dsh", dshPin);

if (flag("--static")) {
  console.log("STAGE11_CHROME_STATIC_PASS");
  process.exit(0);
}

// ---- 1. launch ---------------------------------------------------------------
const { _electron } = await import("playwright");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-prove-chrome-"));
const work = path.join(tmp, "work");
const appArg = opt("--app");
let dataDir;
let seededReal = false;
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

const AGENTS = [
  { name: "Writer", job: "Drafts launch briefs" },
  { name: "Editor", job: "Copy edits and tone" },
];
function seed(dir) {
  const { index } = seedLocalBotData({
    dataDir: dir,
    folders: { employeeRoot: path.join(work, "employees/Sam"), employeeShared: null, departmentShared: path.join(work, "departments/Ops/shared"), companyShared: null },
    agents: AGENTS,
    idPrefix: "chrome",
  });
  // A long transcript for the first agent so the pane overflows and the ↓ control has work to do.
  const writer = index.agents[0];
  const messages = [];
  for (let i = 1; i <= 20; i++) {
    const t = new Date(Date.now() - (40 - i) * 60000).toISOString();
    messages.push({ id: `m${i}u`, botId: writer.id, role: "user", content: `Seeded message ${i}: please summarize section ${i} of the brief.`, createdAt: t });
    messages.push({ id: `m${i}a`, botId: writer.id, role: "assistant", content: `Section ${i} summary.\n\n- point one\n- point two\n- point three`, createdAt: t });
  }
  fs.mkdirSync(path.join(dir, "chats"), { recursive: true });
  fs.writeFileSync(path.join(dir, "chats", `${writer.id}.json`), JSON.stringify({ version: 1, agentId: writer.id, messages, chatGrants: {}, lastReadAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, null, 2));
  return index;
}

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

let electronApp;
// Packaged app against an AppData that already belongs to the human: launch it,
// read the chrome layout, touch nothing (no seed, no roster / composer / clipboard).
let chromeOnly = false;
if (appArg) {
  // Packaged app: real AppData (Electron ignores $HOME for appData on macOS).
  let exe = path.resolve(appArg);
  if (exe.endsWith(".app")) exe = path.join(exe, "Contents/MacOS/LocalBot");
  if (!fs.existsSync(exe)) fail(`no executable at ${exe}`);
  const preloadInApp = path.join(path.dirname(exe), "..", "Resources", "app.asar.unpacked", "desktop", "preload.cjs");
  if (!fs.existsSync(preloadInApp)) fail(`${preloadInApp} is not in the app bundle — this .app predates Stage 11; run npm run build:desktop`);
  dataDir = process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support", "LocalBot") : path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "LocalBot");
  if (await up("http://127.0.0.1:18790/", 500)) fail("127.0.0.1:18790 already answering — quit the other LocalBot first");
  if (fs.existsSync(path.join(dataDir, "localbot-config.json"))) {
    chromeOnly = true;
    log("packaged app", exe, "| AppData", dataDir, "already has a config — chrome-only gates, nothing is written or seeded");
  } else {
    seed(dataDir);
    seededReal = true;
    cleanup.push(() => {
      fs.rmSync(path.join(dataDir, "localbot-config.json"), { force: true });
      fs.rmSync(path.join(dataDir, "localbot-agents.json"), { force: true });
      fs.rmSync(path.join(dataDir, "chats"), { recursive: true, force: true });
    });
    log("packaged app", exe, "| seeded", dataDir, "(removed afterwards)");
  }
  // Same minimal env as prove-mac: the packaged app needs no node on PATH and must not inherit ELECTRON_RUN_AS_NODE.
  const env = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: os.homedir(), LANG: process.env.LANG ?? "en_US.UTF-8", TMPDIR: process.env.TMPDIR ?? "/tmp" };
  electronApp = await _electron.launch({ executablePath: exe, args: [], env, timeout: 120000 });
} else {
  dataDir = path.join(tmp, "data");
  seed(dataDir);
  if (await up("http://127.0.0.1:8080/", 500)) fail("127.0.0.1:8080 already answering — stop the other npm run dev first (the proof needs vite on its own LOCALBOT_DATA_DIR)");
  const electronBin = require("electron");
  const env = { ...process.env, LOCALBOT_DATA_DIR: dataDir, BROWSER: "none" };
  delete env.ELECTRON_RUN_AS_NODE;
  log("dev Electron", electronBin, "| main desktop/main.mjs | LOCALBOT_DATA_DIR", dataDir);
  electronApp = await _electron.launch({ executablePath: electronBin, args: [path.join(root, "desktop/main.mjs")], cwd: root, env, timeout: 180000 });
}
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
const platform = await electronApp.evaluate(() => process.platform);
const box = async (sel) => {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) fail(`${sel} has no bounding box`);
  return b;
};

// ---- 2. bridge + title strip + traffic lights --------------------------------
const bridge = await page.evaluate(() => typeof window.localbotDesktop);
if (bridge !== "object") fail(`window.localbotDesktop is ${bridge} — the preload bridge did not load`);
const stripBox = await box('[data-testid="desktop-titlebar"]');
const wordmarkBox = await box('[data-testid="sidebar-header"]');
let lights = null;
if (platform === "darwin") {
  lights = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getWindowButtonPosition());
  const gutter = await box('[data-testid="traffic-light-gutter"]');
  // Three 12 px buttons + two 8 px gaps from lights.x.
  const lightsRight = (lights?.x ?? 14) + 52;
  const lightsBottom = (lights?.y ?? 12) + 12;
  if (gutter.x + gutter.width < lightsRight) fail(`title strip gutter ends at ${gutter.x + gutter.width}px, traffic lights reach ${lightsRight}px`);
  if (stripBox.y + stripBox.height < lightsBottom) fail(`title strip is ${stripBox.height}px tall, lights reach ${lightsBottom}px`);
  if (wordmarkBox.y < lightsBottom) fail(`sidebar header (Wordmark) starts at y=${wordmarkBox.y}, under the traffic lights (bottom ${lightsBottom})`);
  log(`traffic lights at (${lights.x}, ${lights.y}) · gutter to ${gutter.x + gutter.width}px · strip ${stripBox.height}px · Wordmark row starts y=${wordmarkBox.y}`);
} else {
  if (wordmarkBox.y < stripBox.y + stripBox.height) fail("sidebar header overlaps the title strip");
  log(`title strip ${stripBox.height}px · Wordmark row starts y=${wordmarkBox.y} (${platform}: no traffic lights)`);
}
if ((await page.locator('[data-testid="desktop-titlebar"] [aria-label="Settings"]').count()) !== 0) fail("a Settings button is inside the title strip");

// ---- 3. sidebar order ----------------------------------------------------------
const sidebarBox = await box('[data-testid="sidebar"]');
const newBox = await box('[data-testid="new-agent"]');
const searchBox = await box('[data-testid="roster-search"]');
const rosterBox = await box('[data-testid="roster"]');
const settingsBox = await box('[data-testid="sidebar-settings"]');
if (!(wordmarkBox.y < newBox.y && newBox.y < searchBox.y && searchBox.y < rosterBox.y)) fail(`sidebar order wrong: header y=${wordmarkBox.y} new=${newBox.y} search=${searchBox.y} roster=${rosterBox.y}`);
if (settingsBox.y < rosterBox.y + rosterBox.height - 1) fail(`Settings (y=${settingsBox.y}) is not below the roster (bottom ${rosterBox.y + rosterBox.height})`);
const sidebarBottom = sidebarBox.y + sidebarBox.height;
if (settingsBox.y + settingsBox.height < sidebarBottom - 64) fail(`Settings is ${sidebarBottom - (settingsBox.y + settingsBox.height)}px above the sidebar bottom`);
if (settingsBox.y < stripBox.y + stripBox.height + 100) fail("Settings is up in the title corner");
if ((await page.locator('[aria-label="Settings"]:visible').count()) !== 1) fail("expected exactly one visible Settings button (the sidebar footer)");
log(`sidebar: + New agent y=${Math.round(newBox.y)} · search y=${Math.round(searchBox.y)} · roster y=${Math.round(rosterBox.y)} · Settings y=${Math.round(settingsBox.y)} (sidebar bottom ${Math.round(sidebarBottom)})`);
// Stage 12: + New agent opens a setup chat (proven in prove:identity); the same
// modal is now behind the Advanced control next to it.
await page.getByTestId("new-agent-advanced").click();
const newAgentHeading = page.getByRole("heading", { name: "New agent" });
await newAgentHeading.waitFor({ timeout: 10000 });
await page.getByRole("button", { name: "Cancel" }).click();
await newAgentHeading.waitFor({ state: "hidden", timeout: 10000 });
log("Advanced (next to + New agent) opens the same New agent modal; Cancel closes it");

if (chromeOnly) {
  console.log(
    `STAGE11_CHROME_PACKAGED_PASS bridge=object platform=${platform}${lights ? ` lights=${lights.x},${lights.y}` : ""} strip_h=${Math.round(stripBox.height)} wordmark_y=${Math.round(wordmarkBox.y)} settings_y=${Math.round(settingsBox.y)} app=${path.resolve(appArg)} (roster search / composer / Edit roles / jump-to-latest proven in dev mode: npm run prove:chrome)`,
  );
  await electronApp.close().catch(() => {});
  process.exit(0);
}

// ---- 4. roster search -----------------------------------------------------------
const rosterNames = async () => (await page.locator('[data-testid="roster"] span.truncate.text-sm.font-medium').allTextContents()).map((s) => s.trim());
const all = await rosterNames();
if (!(all.includes("Writer") && all.includes("Editor"))) fail(`roster shows ${JSON.stringify(all)}, expected Writer + Editor`);
const search = page.getByTestId("roster-search");
await search.fill("edit");
await page.waitForTimeout(100);
let names = await rosterNames();
if (JSON.stringify(names) !== JSON.stringify(["Editor"])) fail(`search "edit" → ${JSON.stringify(names)}`);
await search.fill("launch brief");
await page.waitForTimeout(100);
names = await rosterNames();
if (JSON.stringify(names) !== JSON.stringify(["Writer"])) fail(`search by job "launch brief" → ${JSON.stringify(names)}`);
await search.fill("zzqx");
await page.waitForTimeout(100);
if (!/No agents match/.test((await page.getByTestId("roster-empty").textContent()) ?? "")) fail("a miss does not say 'No agents match'");
await search.fill("");
await page.waitForTimeout(100);
names = await rosterNames();
if (JSON.stringify(names) !== JSON.stringify(all)) fail(`clearing the search shows ${JSON.stringify(names)}, expected ${JSON.stringify(all)}`);
log(`roster search: "edit" → Editor · "launch brief" (job) → Writer · miss → "No agents match" · empty → ${all.join(", ")}`);

// ---- 5. composer grows to 6 lines then scrolls inside ---------------------------
await page.getByText("Writer", { exact: true }).first().click();
const composer = page.getByTestId("composer");
await composer.waitFor({ timeout: 30000 });
const metrics = async () =>
  composer.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { height: el.getBoundingClientRect().height, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, lineHeight: parseFloat(cs.lineHeight), overflowY: cs.overflowY, overflow: el.dataset.overflow, classes: el.className };
  });
await composer.fill("one line");
const m1 = await metrics();
await composer.fill(["1", "2", "3"].join("\n"));
const m3 = await metrics();
await composer.fill(["1", "2", "3", "4", "5", "6"].join("\n"));
const m6 = await metrics();
await composer.fill(Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\n"));
const m12 = await metrics();
const lh = m1.lineHeight;
if (!(m3.height > m1.height + lh * 1.5)) fail(`composer did not grow: 1 line ${m1.height}px, 3 lines ${m3.height}px`);
if (!(m6.height > m3.height + lh * 2.5)) fail(`composer did not grow to 6 lines: 3 lines ${m3.height}px, 6 lines ${m6.height}px`);
if (Math.abs(m12.height - m6.height) > 1) fail(`composer kept growing past 6 lines: 6 → ${m6.height}px, 12 → ${m12.height}px`);
if (m12.overflowY !== "auto" || m12.overflow !== "true") fail(`composer at 12 lines: overflowY=${m12.overflowY} data-overflow=${m12.overflow}`);
if (!(m12.scrollHeight > m12.clientHeight + lh * 4)) fail(`composer at 12 lines does not scroll inside: scrollHeight ${m12.scrollHeight} clientHeight ${m12.clientHeight}`);
if (m6.overflowY !== "hidden") fail(`composer at 6 lines shows a scrollbar: overflowY=${m6.overflowY}`);
if (!/\bscrollbar-thin\b/.test(m12.classes)) fail("composer lacks .scrollbar-thin");
const thumbRule = await page.evaluate(() => {
  for (const sheet of document.styleSheets) {
    try {
      for (const r of sheet.cssRules) if (r.selectorText && r.selectorText.includes(".scrollbar-thin::-webkit-scrollbar-thumb")) return r.style.cssText;
    } catch {
      /* cross-origin */
    }
  }
  return null;
});
if (!thumbRule) fail("no .scrollbar-thin::-webkit-scrollbar-thumb rule in the loaded stylesheets");
log(`composer: 1 line ${Math.round(m1.height)}px · 3 lines ${Math.round(m3.height)}px · 6 lines ${Math.round(m6.height)}px · 12 lines ${Math.round(m12.height)}px (inner scroll ${m12.scrollHeight}/${m12.clientHeight}, thumb: ${thumbRule.slice(0, 60)}…)`);

// ---- 6. Edit menu roles act on the composer ------------------------------------
const roles = await electronApp.evaluate(({ Menu }) => {
  const menu = Menu.getApplicationMenu();
  const editMenu = menu?.items.find((i) => i.label === "Edit");
  return (editMenu?.submenu?.items ?? []).filter((i) => i.role).map((i) => ({ role: i.role, accelerator: i.accelerator ?? null }));
});
for (const role of ["undo", "redo", "cut", "copy", "paste", "selectall"]) {
  if (!roles.some((r) => r.role.toLowerCase() === role)) fail(`application Edit menu has no ${role} item (have ${roles.map((r) => r.role).join(", ")})`);
}
// On macOS the editing roles are native menu items: Cmd A / C / V / X / Z go
// menu → responder chain (`selectAll:` …), never through JS. MenuItem.click()
// is a no-op for them, so this drives the same native path the menu uses,
// which needs the window to be key (the proof steals focus for ~2 s).
// Elsewhere the roles call the webContents methods, so that is what runs there.
const SELECTORS = { selectall: "selectAll:", copy: "copy:", cut: "cut:", paste: "paste:", undo: "undo:" };
const METHODS = { selectall: "selectAll", copy: "copy", cut: "cut", paste: "paste", undo: "undo" };
const focused = await electronApp.evaluate(async ({ app, BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0];
  app.focus({ steal: true });
  win.show();
  win.focus();
  await new Promise((r) => setTimeout(r, 400));
  return BrowserWindow.getFocusedWindow() != null && win.isFocused();
});
const clickRole = (role) =>
  electronApp.evaluate(({ Menu, BrowserWindow }, { role, selector, method }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const item = Menu.getApplicationMenu()
      .items.find((i) => i.label === "Edit")
      .submenu.items.find((i) => (i.role ?? "").toLowerCase() === role);
    if (!item) throw new Error(`no Edit › ${role}`);
    if (process.platform === "darwin") Menu.sendActionToFirstResponder(selector);
    else win.webContents[method]();
  }, { role, selector: SELECTORS[role], method: METHODS[role] });
const SAMPLE = "clipboard round trip 4711";
let editVerdict;
if (!focused) {
  editVerdict = "UNVERIFIED (window could not become key — screen locked or another app refused to yield; the menu roles are present)";
  log("Edit menu: roles present:", roles.map((r) => r.role).join(", "), "—", editVerdict);
} else {
  const clipBefore = await electronApp.evaluate(({ clipboard }) => clipboard.readText());
  cleanup.push(() => {
    // put the user's clipboard back
    electronApp?.evaluate(({ clipboard }, t) => clipboard.writeText(t), clipBefore).catch(() => {});
  });
  await composer.fill(SAMPLE);
  await composer.focus();
  await clickRole("selectall");
  await page.waitForTimeout(150);
  const sel = await composer.evaluate((el) => [el.selectionStart, el.selectionEnd, el.value.length]);
  if (!(sel[0] === 0 && sel[1] === sel[2] && sel[2] === SAMPLE.length)) fail(`Edit › Select All did not select the composer: ${JSON.stringify(sel)}`);
  await clickRole("copy");
  await page.waitForTimeout(250);
  const copied = await electronApp.evaluate(({ clipboard }) => clipboard.readText());
  if (copied !== SAMPLE) fail(`Edit › Copy put ${JSON.stringify(copied)} on the clipboard, expected ${JSON.stringify(SAMPLE)}`);
  await clickRole("cut");
  await page.waitForTimeout(250);
  if ((await composer.inputValue()) !== "") fail("Edit › Cut left text in the composer");
  await clickRole("paste");
  await page.waitForTimeout(250);
  if ((await composer.inputValue()) !== SAMPLE) fail(`Edit › Paste gave ${JSON.stringify(await composer.inputValue())}`);
  await clickRole("undo");
  await page.waitForTimeout(250);
  const afterUndo = await composer.inputValue();
  if (afterUndo === SAMPLE) fail("Edit › Undo did not change the composer");
  await composer.fill("");
  editVerdict = `WORKS (selectAll → copy ${JSON.stringify(copied)} → cut → paste → undo ${JSON.stringify(afterUndo)})`;
  log(`Edit menu roles reach the composer through the native path: ${editVerdict} · items ${roles.map((r) => r.role).join(", ")}`);
}

// ---- 7. jump to latest ------------------------------------------------------------
const transcript = page.getByTestId("transcript");
const jump = page.getByTestId("jump-to-latest");
const scroll = async () => transcript.evaluate((el) => ({ top: el.scrollTop, client: el.clientHeight, height: el.scrollHeight, pinned: el.dataset.pinned }));
let s = await scroll();
if (!(s.height > s.client + 200)) {
  // make sure the pane overflows — shrink the window if a large screen swallowed 40 messages
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 600));
  await page.waitForTimeout(400);
  s = await scroll();
  if (!(s.height > s.client + 200)) fail(`transcript does not overflow (scrollHeight ${s.height}, clientHeight ${s.client})`);
}
if (s.pinned !== "true" || s.height - (s.top + s.client) > 32) fail(`transcript did not start pinned to the bottom: ${JSON.stringify(s)}`);
if ((await jump.count()) !== 0) fail("Jump to latest is visible while pinned to the bottom");
await transcript.evaluate((el) => el.scrollTo({ top: 0 }));
await page.waitForTimeout(150);
s = await scroll();
if (s.pinned !== "false") fail(`scrolling up did not unpin: ${JSON.stringify(s)}`);
await jump.waitFor({ timeout: 5000 });
await jump.click();
await page.waitForTimeout(200);
s = await scroll();
if (s.pinned !== "true" || s.height - (s.top + s.client) > 32) fail(`Jump to latest did not pin to the bottom: ${JSON.stringify(s)}`);
if ((await jump.count()) !== 0) fail("Jump to latest is still visible after clicking it");
log(`jump to latest: pinned at start (no ↓) → scrollTop 0 shows ↓ → click → bottom (${s.top}+${s.client}/${s.height}), ↓ hidden`);

// Optional picture for the handoff: 8-line composer (scrolling inside), transcript scrolled up so ↓ shows.
const shot = opt("--screenshot");
if (shot) {
  await composer.fill(Array.from({ length: 8 }, (_, i) => `composer line ${i + 1}`).join("\n"));
  await transcript.evaluate((el) => el.scrollTo({ top: el.scrollHeight / 2 }));
  await jump.waitFor({ timeout: 5000 });
  await page.screenshot({ path: path.resolve(shot) });
  log("screenshot", path.resolve(shot));
}

console.log(
  `STAGE11_CHROME_PASS bridge=object platform=${platform}${lights ? ` lights=${lights.x},${lights.y}` : ""} strip_h=${Math.round(stripBox.height)} wordmark_y=${Math.round(wordmarkBox.y)} settings_y=${Math.round(settingsBox.y)} composer_lines=1:${Math.round(m1.height)} 6:${Math.round(m6.height)} 12:${Math.round(m12.height)} edit_roles=${roles.map((r) => r.role).join(",")} edit_shortcuts=${editVerdict.split(" ")[0]} data_dir=${seededReal ? dataDir + " (seeded, removed)" : "temp"}`,
);
await electronApp.close().catch(() => {});
process.exit(0);
