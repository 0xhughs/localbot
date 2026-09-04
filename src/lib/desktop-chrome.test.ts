/**
 * Stage 11 — desktop chrome + composer + roster find.
 *
 * These fail when:
 *   - Settings is back in the title-bar cluster (sidebar header next to the
 *     Wordmark, or inside desktop-titlebar.tsx) instead of the sidebar footer
 *   - "+ New agent" is only in the sidebar footer again (it must be at the top,
 *     under the title strip, with the roster search under it)
 *   - desktop/main.mjs has no Edit menu with the native roles
 *     (undo, redo, cut, copy, paste, selectAll) — the Mac shortcut fix
 *   - the preload is ESM again (a sandboxed preload never loads as ESM, so the
 *     bridge — and with it the title strip — would silently vanish)
 *   - main.mjs drops hiddenInset / trafficLightPosition, or the strip loses the
 *     traffic-light gutter
 *   - chat.tsx drops runAgentTurn, swaps the <textarea> for a contenteditable,
 *     loses the 6-line cap, or loses the jump-to-latest control
 *   - the dsh / ACP pins float
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { COMPOSER_MAX_LINES, composerHeight, isPinnedToBottom } from "./chat-layout.ts";
import { ACP_SDK_PIN, DSH_PIN } from "./harness/process.ts";
import { filterRoster, rosterMatches } from "./roster-search.ts";

const REPO = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(REPO, p), "utf8");
const pkg = JSON.parse(read("package.json"));

describe("Stage 11: title strip and traffic lights", () => {
  const main = read("desktop/main.mjs");
  const strip = read("src/components/localbot/desktop-titlebar.tsx");

  it("main.mjs keeps hiddenInset + trafficLightPosition (no second title-bar system)", () => {
    assert.match(main, /titleBarStyle:\s*process\.platform === "darwin" \? "hiddenInset" : "hidden"/);
    assert.match(main, /trafficLightPosition:\s*\{\s*x:\s*\d+,\s*y:\s*\d+\s*\}/);
    assert.match(main, /frame:\s*false/);
  });

  it("the strip leaves a gutter for the lights on darwin and carries no Settings button", () => {
    assert.match(strip, /WebkitAppRegion:\s*"drag"/);
    assert.match(strip, /data-testid="traffic-light-gutter"/);
    const gutter = /className="w-\[(\d+)px\]/.exec(strip);
    assert.ok(gutter, "gutter has no explicit width");
    // x 14 + three 12 px buttons + two 8 px gaps = 66 px; the gutter must clear that.
    assert.ok(Number(gutter![1]) >= 68, `gutter ${gutter![1]}px does not clear the traffic lights`);
    // The strip may relay the Cmd+, menu accelerator (onSettings) but renders no Settings button and no mark.
    assert.equal(/aria-label="Settings"|<Settings\b|SettingsIcon/.test(strip), false, "a Settings button crept into the title strip");
    assert.equal(/<Wordmark|<Logo/.test(strip), false, "the mark crept into the title strip");
  });

  it("the preload is CommonJS so it loads under sandbox: true, and main points at it", () => {
    assert.ok(fs.existsSync(path.join(REPO, "desktop/preload.cjs")), "desktop/preload.cjs missing");
    assert.equal(fs.existsSync(path.join(REPO, "desktop/preload.mjs")), false, "preload.mjs is back — it never loads sandboxed");
    const preload = read("desktop/preload.cjs");
    assert.equal(/^\s*import\s/m.test(preload), false, "preload uses ESM import");
    assert.match(preload, /require\("electron"\)/);
    assert.match(preload, /contextBridge\.exposeInMainWorld\("localbotDesktop"/);
    assert.match(main, /preload:\s*path\.join\(here,\s*"preload\.cjs"\)/);
    assert.match(main, /sandbox:\s*true/);
    assert.match(main, /contextIsolation:\s*true/);
    assert.ok(pkg.build.files.includes("desktop/**/*.cjs"), "build.files does not ship .cjs");
    assert.ok(pkg.build.asarUnpack.includes("desktop/**/*.cjs"), "asarUnpack does not unpack .cjs (main resolves it from app.asar.unpacked)");
    assert.match(read("scripts/build-desktop.mjs"), /app\.asar\.unpacked\/desktop\/preload\.cjs/);
  });

  it("main.mjs installs a native Edit menu: undo, redo, cut, copy, paste, selectAll", () => {
    const edit = /label:\s*"Edit",\s*submenu:\s*\[([\s\S]*?)\]/.exec(main);
    assert.ok(edit, "no Edit menu in buildMenu()");
    for (const role of ["undo", "redo", "cut", "copy", "paste", "selectAll"]) {
      assert.match(edit![1], new RegExp(`role:\\s*"${role}"`), `Edit menu lacks role ${role}`);
    }
    // Native roles only — no clipboard code in the renderer.
    for (const f of ["src/components/localbot/chat.tsx", "src/components/localbot/sidebar.tsx"]) {
      assert.equal(/navigator\.clipboard|execCommand\(/.test(read(f)), false, `${f} reimplements the clipboard`);
    }
  });
});

describe("Stage 11: sidebar order — + New agent top, roster find, Settings bottom", () => {
  const sidebar = read("src/components/localbot/sidebar.tsx");
  const idx = (re: RegExp) => {
    const m = re.exec(sidebar);
    assert.ok(m, `sidebar.tsx has no ${re}`);
    return m!.index;
  };

  it("Settings is in the footer, after the roster, not beside the Wordmark", () => {
    const header = /data-testid="sidebar-header"[\s\S]*?<\/div>/.exec(sidebar);
    assert.ok(header, "no sidebar-header block");
    assert.equal(/Settings/.test(header![0]), false, "Settings is still next to the Wordmark (title-bar corner)");
    const settings = idx(/aria-label="Settings"/);
    assert.ok(settings > idx(/data-testid="roster"/), "Settings is above the roster");
    assert.ok(settings > idx(/data-testid="archived-agents"/), "Settings is above the Archived group");
    assert.ok(settings > idx(/data-testid="sidebar-footer"/), "Settings is not inside the footer");
    assert.equal(sidebar.match(/aria-label="Settings"/g)?.length, 1, "more than one Settings button in the sidebar");
  });

  it("+ New agent is at the top, under the title strip, and not only in the footer", () => {
    const newAgent = idx(/newAgentOpen:\s*true/);
    assert.ok(newAgent > idx(/data-testid="sidebar-header"/), "New agent is above the header");
    assert.ok(newAgent < idx(/data-testid="roster-search"/), "New agent is below the search field");
    assert.ok(newAgent < idx(/data-testid="roster"/), "New agent is below the roster (footer placement)");
    const footer = sidebar.slice(idx(/data-testid="sidebar-footer"/));
    assert.equal(/newAgentOpen/.test(footer), false, "New agent is (also) in the footer");
    // The modal is unchanged this stage.
    assert.match(read("src/components/localbot/shell.tsx"), /<NewAgentDialog \/>/);
  });

  it("the search field filters by name / job as you type through filterRoster", () => {
    assert.match(sidebar, /import \{ filterRoster, normalizeRosterQuery \} from "@\/lib\/roster-search"/);
    assert.match(sidebar, /filterRoster\(visibleBots\(\{ bots: allBots \}\), query\)/);
    assert.match(sidebar, /filterRoster\(archivedBots\(\{ bots: allBots \}\), query\)/);
    assert.match(sidebar, /type="search"/);
    assert.match(sidebar, /onChange=\{\(e\) => setQuery\(e\.target\.value\)\}/);
  });
});

describe("Stage 11: roster search (pure)", () => {
  const roster = [
    { id: "1", name: "Writer", job: "Drafts launch briefs" },
    { id: "2", name: "Editor", job: "Copy edits and tone" },
    { id: "3", name: "Ops Bot", job: "Weekly ops summaries" },
  ];

  it("empty or whitespace query returns the same list (identity)", () => {
    assert.equal(filterRoster(roster, ""), roster);
    assert.equal(filterRoster(roster, "   "), roster);
  });

  it("matches name or job, case-insensitive, all words must hit", () => {
    assert.deepEqual(filterRoster(roster, "wri").map((b) => b.id), ["1"]);
    assert.deepEqual(filterRoster(roster, "EDIT").map((b) => b.id), ["2"]);
    assert.deepEqual(filterRoster(roster, "ops").map((b) => b.id), ["3"]);
    assert.deepEqual(filterRoster(roster, "launch brief").map((b) => b.id), ["1"]);
    assert.deepEqual(filterRoster(roster, "ops launch"), []);
    assert.equal(rosterMatches({ name: "Solo", job: null }, "solo"), true);
    assert.equal(rosterMatches({ name: "Solo", job: null }, "job"), false);
  });
});

describe("Stage 11: composer + transcript", () => {
  const chat = read("src/components/localbot/chat.tsx");

  it("chat.tsx still runs turns through runAgentTurn and keeps the voice hook", () => {
    assert.match(chat, /import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/);
    assert.match(chat, /await runAgentTurn\(\{/);
    assert.match(chat, /import .*useVoiceInput/);
  });

  it("the composer is a native <textarea> that grows to six lines with the themed scrollbar", () => {
    assert.equal(COMPOSER_MAX_LINES, 6);
    assert.match(chat, /data-max-lines=\{COMPOSER_MAX_LINES\}/);
    assert.equal(/contentEditable|contenteditable/.test(chat), false, "composer became a contenteditable");
    assert.equal(/rows=\{2\}/.test(chat), false, "fixed rows={2} textarea is back");
    const ta = /<textarea\s+ref=\{textarea\}([\s\S]*?)\/>/.exec(chat);
    assert.ok(ta, "no textarea");
    assert.match(ta![1], /scrollbar-thin/);
    assert.match(ta![1], /resize-none/);
    assert.match(chat, /composerHeight\(\{/);
    const css = read("src/styles.css");
    assert.match(css, /\.scrollbar-thin::-webkit-scrollbar-thumb/);
    assert.match(css, /\.scrollbar-thin::-webkit-scrollbar-track[\s\S]*?background:\s*transparent/);
  });

  it("composerHeight grows with content then caps at maxLines and reports overflow", () => {
    const base = { lineHeight: 20, verticalPadding: 12 };
    assert.deepEqual(composerHeight({ ...base, scrollHeight: 32 }), { height: 32, overflow: false });
    assert.deepEqual(composerHeight({ ...base, scrollHeight: 72 }), { height: 72, overflow: false });
    assert.deepEqual(composerHeight({ ...base, scrollHeight: 132 }), { height: 132, overflow: false }); // exactly 6 lines
    assert.deepEqual(composerHeight({ ...base, scrollHeight: 152 }), { height: 132, overflow: true }); // 7 lines → scroll
    assert.deepEqual(composerHeight({ ...base, scrollHeight: 0 }), { height: 32, overflow: false }); // never below one line
    assert.deepEqual(composerHeight({ ...base, lineHeight: NaN, scrollHeight: 500 }), { height: 132, overflow: true }); // fallback 20px
    assert.deepEqual(composerHeight({ ...base, scrollHeight: 100, maxLines: 3 }), { height: 72, overflow: true });
  });

  it("isPinnedToBottom: at bottom / within slack / scrolled up / nothing to scroll", () => {
    assert.equal(isPinnedToBottom({ scrollTop: 900, clientHeight: 100, scrollHeight: 1000 }), true);
    assert.equal(isPinnedToBottom({ scrollTop: 880, clientHeight: 100, scrollHeight: 1000 }), true);
    assert.equal(isPinnedToBottom({ scrollTop: 800, clientHeight: 100, scrollHeight: 1000 }), false);
    assert.equal(isPinnedToBottom({ scrollTop: 0, clientHeight: 100, scrollHeight: 1000 }), false);
    assert.equal(isPinnedToBottom({ scrollTop: 0, clientHeight: 500, scrollHeight: 300 }), true);
    assert.equal(isPinnedToBottom({ scrollTop: 860, clientHeight: 100, scrollHeight: 1000 }, 10), false);
  });

  it("the transcript only follows while pinned and shows Jump to latest otherwise", () => {
    assert.match(chat, /onScroll=\{onTranscriptScroll\}/);
    assert.match(chat, /data-pinned=\{pinned \? "true" : "false"\}/);
    assert.match(chat, /if \(!pinned\) return;\s*scroller\.current\?\.scrollTo/);
    assert.match(chat, /\{!pinned && \([\s\S]*?data-testid="jump-to-latest"/);
    assert.match(chat, /aria-label="Jump to latest"/);
    assert.match(chat, /onClick=\{jumpToLatest\}/);
  });
});

describe("Stage 11: pins do not float", () => {
  it("dsh and ACP pins are exact", () => {
    assert.equal(pkg.dependencies["@deepseek-ai/dsh"], DSH_PIN);
    assert.equal(pkg.dependencies["@agentclientprotocol/sdk"], ACP_SDK_PIN);
    assert.match(DSH_PIN, /^\d/);
    assert.match(ACP_SDK_PIN, /^\d/);
  });
});
