/**
 * Stage 15 — Routines.
 *
 * These fail when:
 *   - a routine file could land inside a scope root (assertRoutinesOutsideScopes)
 *   - routines exist only in React state: the dialog stops calling the
 *     routines* server functions, or those stop reaching src/lib/fs/routines.ts,
 *     or a created routine is not on disk / not readable by a fresh reader
 *   - Run now skips runAgentTurn: routines.tsx stops calling runRoutine, or
 *     routineRunner.ts stops calling runAgentTurn with the instructions as the
 *     user text, or grows a second Harness loop (imports the harness server
 *     functions / HarnessManager)
 *   - the chat proposal writes without Confirm (Dismiss or parsing creates a
 *     file), or the model's block is not inert
 *   - an archived agent, a BUSY agent or a DISCONNECTED employee root still fires
 *   - two claims on the same routine both succeed
 *   - a missed beat is replayed more than once
 *   - the footer order is not Routines > Plugins > Settings
 *   - ungranted permissions during a routine are not denied
 *   - chat.tsx drops runAgentTurn; dsh / ACP pins float; localbot-fs.mjs changes
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
  acquireRoutineLock,
  assertRoutinesOutsideScopes,
  createRoutine,
  deleteRoutine,
  listRoutines,
  readRoutine,
  routineLockPath,
  routinePath,
  routinesDir,
  updateRoutine,
} from "./fs/routines.ts";
import { gateRoutine, routinesClaim, routinesDue, routinesFinish } from "./harness/routines.ts";
import { standingInstructionsText } from "./harness/index.ts";
import { ACP_SDK_PIN, DSH_PIN } from "./harness/process.ts";
import {
  CLAIM_STALE_MS,
  ROUTINE_BLOCK_INSTRUCTION,
  ROUTINE_PERMISSION_DECISION,
  ROUTINE_TICK_MS,
  RoutineError,
  describeSchedule,
  nextRunAt,
  parseCron,
  parseRoutineProposal,
  parseSchedule,
  parseScheduleText,
  scheduleDue,
  scheduleTextOf,
  splitRoutineBlocks,
  type Routine,
} from "./routines-model.ts";

const repo = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(repo, p), "utf8");

/** sha256 of dsh/localbot-fs.mjs on main at 1f1de14. Stage 15 must not touch it. */
const LOCALBOT_FS_SHA256 = "0bb5593abecbc116a7b3c614882cfc109831e88c45b735962ce14ef904c2b0a6";

const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0);

const isCode = (code: string) => (err: unknown) => err instanceof RoutineError && err.code === code;

describe("Stage 15: pins, the fs boundary and chat.tsx are untouched", () => {
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };

  it("dsh / ACP pins are exact and unchanged", () => {
    assert.equal(pkg.dependencies["@deepseek-ai/dsh"], DSH_PIN);
    assert.equal(DSH_PIN, "0.1.2-alpha.5");
    assert.equal(pkg.dependencies["@agentclientprotocol/sdk"], ACP_SDK_PIN);
    assert.equal(ACP_SDK_PIN, "1.4.0");
    for (const k of ["@deepseek-ai/dsh", "@agentclientprotocol/sdk"]) assert.doesNotMatch(pkg.dependencies[k]!, /^[\^~]/);
  });

  it("dsh/localbot-fs.mjs is byte-identical to main (sha256 pin)", () => {
    assert.equal(createHash("sha256").update(read("dsh/localbot-fs.mjs")).digest("hex"), LOCALBOT_FS_SHA256, "dsh/localbot-fs.mjs changed — Stage 15 must not touch the scoped fs");
  });

  it("chat.tsx still sends through runAgentTurn", () => {
    const chat = read("src/components/localbot/chat.tsx");
    assert.match(chat, /import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/);
    assert.match(chat, /const result = await runAgentTurn\(\{\s*botId: bot\.id,\s*userText: trimmed/);
  });
});

describe("Stage 15: the runner is the existing runAgentTurn path, not a second loop", () => {
  const runner = read("src/runtime/routineRunner.ts");
  const dialog = read("src/components/localbot/routines.tsx");
  const shell = read("src/components/localbot/shell.tsx");
  const sidebar = read("src/components/localbot/sidebar.tsx");

  it("routineRunner imports runAgentTurn from the adapter and calls it with the routine instructions as the user text", () => {
    assert.match(runner, /import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/);
    assert.match(runner, /turn: runAgentTurn,/, "the default turn dependency must be runAgentTurn");
    assert.match(runner, /await deps\.turn\(\{\s*botId: bot\.id,\s*userText: due\.instructions/);
  });

  it("routineRunner never talks to the Harness directly (no second loop)", () => {
    assert.equal(/@\/lib\/runtime\/harness"/.test(runner), false, "must not import harnessPrompt / harnessPoll");
    assert.equal(/harnessPrompt|harnessPoll|harnessDecide|HarnessManager|getHarnessManager|session\/prompt/.test(runner), false);
    assert.equal(/@\/lib\/harness\/index|\.\.\/lib\/harness\/index/.test(runner), false);
  });

  it("routineRunner claims on the sidecar first and reports finish; ungranted permissions are denied", () => {
    assert.match(runner, /routinesClaim\(\{ data: \{ id, manual \} \}\)/);
    assert.match(runner, /routinesFinish\(\{ data: \{ id, status, error \} \}\)/);
    assert.match(runner, /askPermission: async \(req\) => \{[\s\S]*?return ROUTINE_PERMISSION_DECISION;/);
    assert.equal(ROUTINE_PERMISSION_DECISION, "deny");
    assert.equal(/"allow-once"|"allow-chat"/.test(runner), false, "a routine must never allow a permission");
    assert.match(runner, /Routine "\$\{due\.name\}" ran/);
  });

  it("the ticker is mounted once in the shell and runs every 30 s + on open", () => {
    assert.match(shell, /import \{ useRoutineTicker \} from "@\/runtime\/routineRunner"/);
    assert.match(shell, /useRoutineTicker\(diskLoaded\)/);
    assert.match(shell, /<RoutinesDialog \/>/);
    assert.match(runner, /window\.setInterval\(tick, ROUTINE_TICK_MS\)/);
    assert.equal(ROUTINE_TICK_MS, 30_000);
    assert.match(runner, /routinesDue\(\{ data: \{\} \}\)/);
  });

  it("Run now in the dialog is runRoutine (same path), and every mutation is a server function", () => {
    assert.match(dialog, /import \{ runRoutine \} from "@\/runtime\/routineRunner"/);
    assert.match(dialog, /await runRoutine\(r\.id, \{ manual: true, agentId: r\.agentId \}\)/);
    for (const fn of ["routinesList", "routinesCreate", "routinesUpdate", "routinesDelete"]) {
      assert.match(dialog, new RegExp(`\\b${fn}\\(`), `routines.tsx must call ${fn}`);
    }
    assert.match(dialog, /from "@\/lib\/runtime\/routines"/);
    assert.equal(/localStorage|useState<Routine\[\]>/.test(dialog), false, "the list must come from disk, not React state");
    assert.match(dialog, /runs <span className="text-fg">once<\/span> on the next open — no backlog replay/);
  });

  it("sidebar footer: Routines above Plugins above Settings", () => {
    const footer = /data-testid="sidebar-footer"[\s\S]*$/.exec(sidebar);
    assert.ok(footer, "no sidebar-footer");
    const r = footer![0].indexOf('data-testid="sidebar-routines"');
    const p = footer![0].indexOf('data-testid="sidebar-plugins"');
    const s = footer![0].indexOf('data-testid="sidebar-settings"');
    assert.ok(r >= 0, "sidebar-routines missing from the footer");
    assert.ok(p >= 0 && s >= 0);
    assert.ok(r < p && p < s, "order must be Routines, Plugins, Settings");
    assert.match(sidebar, /setUi\(\{ showRoutines: true \}\)/);
    assert.equal((sidebar.match(/data-testid="sidebar-routines"/g) ?? []).length, 1);
  });

  it("chat.tsx renders the proposal card and only Confirm calls routinesCreate", () => {
    const chat = read("src/components/localbot/chat.tsx");
    assert.match(chat, /splitRoutineBlocks\(message\.content\)/);
    assert.match(chat, /const confirm = async \(i: number, p: RoutineProposal\) => \{[\s\S]*?await routinesCreate\(/);
    const dismiss = /const dismiss = \(i: number\) => \{([\s\S]*?)\};/.exec(chat);
    assert.ok(dismiss, "no dismiss handler");
    assert.equal(/routinesCreate|routinesUpdate/.test(dismiss![1]!), false, "Dismiss must not write");
    assert.equal((chat.match(/routinesCreate\(/g) ?? []).length, 1, "exactly one write path in chat.tsx: Confirm");
    assert.match(chat, /data-testid="routine-proposal-confirm"/);
    assert.match(chat, /data-testid="routine-proposal-dismiss"/);
  });

  it("the standing instructions carry the one proposal line", () => {
    assert.match(read("src/lib/harness/index.ts"), /ROUTINE_BLOCK_INSTRUCTION,/);
    assert.match(ROUTINE_BLOCK_INSTRUCTION, /```localbot-routine/);
    assert.match(ROUTINE_BLOCK_INSTRUCTION, /you cannot create, edit or run routines yourself/);
  });
});

describe("Stage 15: schedules", () => {
  it("parses the object form and the shorthand strings", () => {
    assert.deepEqual(parseSchedule("manual"), { kind: "manual" });
    assert.deepEqual(parseSchedule("every 15 minutes"), { kind: "every", minutes: 15 });
    assert.deepEqual(parseSchedule("every 2 hours"), { kind: "every", minutes: 120 });
    assert.deepEqual(parseSchedule("daily 09:05"), { kind: "daily", hour: 9, minute: 5 });
    assert.deepEqual(parseSchedule("daily at 9:05"), { kind: "daily", hour: 9, minute: 5 });
    assert.deepEqual(parseSchedule("cron 0 9 * * 1-5"), { kind: "cron", expr: "0 9 * * 1-5" });
    assert.deepEqual(parseSchedule("*/10 * * * *"), { kind: "cron", expr: "*/10 * * * *" });
    assert.deepEqual(parseSchedule({ kind: "every", minutes: "30" }), { kind: "every", minutes: 30 });
    assert.deepEqual(parseSchedule({ kind: "daily", hour: 23, minute: 59 }), { kind: "daily", hour: 23, minute: 59 });
  });

  it("refuses bad schedules", () => {
    for (const bad of ["", "every 0 minutes", "every 99999 minutes", "daily 24:00", "daily 9", "cron 0 9 * *", "cron 60 * * * *", "cron a b c d e", "weekly", { kind: "nope" }, { kind: "every", minutes: 1.5 }, null]) {
      assert.throws(() => parseSchedule(bad), isCode("BAD_SCHEDULE"), `should refuse ${JSON.stringify(bad)}`);
    }
  });

  it("round-trips the dialog form fields", () => {
    assert.deepEqual(parseScheduleText(scheduleTextOf({ kind: "every", every: "45", dailyAt: "", cron: "" })), { kind: "every", minutes: 45 });
    assert.deepEqual(parseScheduleText(scheduleTextOf({ kind: "daily", every: "", dailyAt: "07:30", cron: "" })), { kind: "daily", hour: 7, minute: 30 });
    assert.deepEqual(parseScheduleText(scheduleTextOf({ kind: "cron", every: "", dailyAt: "", cron: "0 */2 * * *" })), { kind: "cron", expr: "0 */2 * * *" });
    assert.deepEqual(parseScheduleText(scheduleTextOf({ kind: "manual", every: "", dailyAt: "", cron: "" })), { kind: "manual" });
  });

  it("describes schedules for the list", () => {
    assert.equal(describeSchedule({ kind: "manual" }), "Manual (Run now only)");
    assert.equal(describeSchedule({ kind: "every", minutes: 15 }), "Every 15 min");
    assert.equal(describeSchedule({ kind: "every", minutes: 60 }), "Every hour");
    assert.equal(describeSchedule({ kind: "every", minutes: 180 }), "Every 3 hours");
    assert.equal(describeSchedule({ kind: "daily", hour: 9, minute: 0 }), "Daily at 09:00");
    assert.equal(describeSchedule({ kind: "cron", expr: "0 9 * * 1-5" }), "Cron 0 9 * * 1-5");
  });

  it("nextRunAt: manual never, every = anchor + N, daily = next HH:MM local", () => {
    const at = local(2026, 9, 5, 8, 0);
    assert.equal(nextRunAt({ kind: "manual" }, at), null);
    assert.equal(nextRunAt({ kind: "every", minutes: 15 }, at)!.getTime(), local(2026, 9, 5, 8, 15).getTime());
    assert.equal(nextRunAt({ kind: "daily", hour: 9, minute: 0 }, at)!.getTime(), local(2026, 9, 5, 9, 0).getTime());
    assert.equal(nextRunAt({ kind: "daily", hour: 9, minute: 0 }, local(2026, 9, 5, 9, 0))!.getTime(), local(2026, 9, 6, 9, 0).getTime(), "exactly at the beat → tomorrow");
    assert.equal(nextRunAt({ kind: "daily", hour: 9, minute: 0 }, local(2026, 9, 5, 14, 0))!.getTime(), local(2026, 9, 6, 9, 0).getTime());
  });

  it("cron: fields, ranges, steps, lists, Vixie dom/dow OR, 7 = Sunday", () => {
    const spec = parseCron("0 9 * * 1-5");
    assert.deepEqual([...spec.hour], [9]);
    assert.deepEqual([...spec.dow].sort(), [1, 2, 3, 4, 5]);
    assert.equal(spec.domAny, true);
    assert.equal(spec.dowAny, false);
    assert.deepEqual([...parseCron("*/15 * * * *").minute], [0, 15, 30, 45]);
    assert.deepEqual([...parseCron("5,35 8-10/2 * * *").hour], [8, 10]);
    assert.ok(parseCron("0 0 * * 7").dow.has(0));
    // Sat 2026-09-05 08:00 → weekday 09:00 is Monday 2026-09-07.
    assert.equal(nextRunAt({ kind: "cron", expr: "0 9 * * 1-5" }, local(2026, 9, 5, 8, 0))!.getTime(), local(2026, 9, 7, 9, 0).getTime());
    // Every 10 minutes from 08:03 → 08:10.
    assert.equal(nextRunAt({ kind: "cron", expr: "*/10 * * * *" }, local(2026, 9, 5, 8, 3))!.getTime(), local(2026, 9, 5, 8, 10).getTime());
    // 1st of the month at 07:00 from Sep 5 → Oct 1.
    assert.equal(nextRunAt({ kind: "cron", expr: "0 7 1 * *" }, local(2026, 9, 5, 8, 0))!.getTime(), local(2026, 10, 1, 7, 0).getTime());
    // Both restricted: 15th OR Monday → Mon Sep 7 comes first.
    assert.equal(nextRunAt({ kind: "cron", expr: "0 9 15 * 1" }, local(2026, 9, 5, 8, 0))!.getTime(), local(2026, 9, 7, 9, 0).getTime());
    // Feb 30 never happens → null within the search window.
    assert.equal(nextRunAt({ kind: "cron", expr: "0 0 30 2 *" }, local(2026, 9, 5)), null);
  });

  it("scheduleDue: one catch-up per missed beat window, no backlog replay", () => {
    const base: Routine = {
      id: "rt_test00000001",
      name: "Daily",
      agentId: "bot_1",
      instructions: "x",
      schedule: { kind: "daily", hour: 9, minute: 0 },
      enabled: true,
      createdAt: local(2026, 9, 1, 8, 0).toISOString(),
      lastRunAt: local(2026, 9, 1, 9, 0).toISOString(),
      lastStatus: "ok",
      lastError: null,
    };
    // App closed Sep 2, 3, 4; opened Sep 5 14:00 → due once.
    const opened = local(2026, 9, 5, 14, 0);
    assert.equal(scheduleDue(base, opened), true);
    // After the catch-up run (claim at 14:00) → not due until Sep 6 09:00.
    const ran = { ...base, lastRunAt: opened.toISOString(), lastStatus: "ok" as const };
    assert.equal(scheduleDue(ran, local(2026, 9, 5, 14, 1)), false);
    assert.equal(scheduleDue(ran, local(2026, 9, 5, 23, 59)), false);
    assert.equal(scheduleDue(ran, local(2026, 9, 6, 9, 0)), true);
    // Disabled and manual never.
    assert.equal(scheduleDue({ ...base, enabled: false }, opened), false);
    assert.equal(scheduleDue({ ...base, schedule: { kind: "manual" } }, opened), false);
    // New routine before its first beat.
    assert.equal(scheduleDue({ ...base, lastRunAt: null, createdAt: local(2026, 9, 5, 8, 0).toISOString() }, local(2026, 9, 5, 8, 30)), false);
    assert.equal(scheduleDue({ ...base, lastRunAt: null, createdAt: local(2026, 9, 5, 8, 0).toISOString() }, local(2026, 9, 5, 9, 0)), true);
    // A live claim blocks; a stale one (crash) does not — the beat it consumed stays consumed.
    const running: Routine = { ...base, schedule: { kind: "every", minutes: 15 }, lastStatus: "running", lastRunAt: local(2026, 9, 5, 13, 50).toISOString() };
    assert.equal(scheduleDue(running, local(2026, 9, 5, 14, 10)), false, "14:10: the 14:05 beat is due, but the claim is live");
    assert.equal(scheduleDue(running, new Date(opened.getTime() + CLAIM_STALE_MS + 60_000)), true, "claim older than CLAIM_STALE_MS is a crash leftover");
    assert.equal(scheduleDue({ ...running, lastStatus: "ok" }, local(2026, 9, 5, 14, 5)), true);
    assert.equal(scheduleDue({ ...running, lastStatus: "ok" }, local(2026, 9, 5, 14, 4)), false);
  });
});

describe("Stage 15: the model's proposal block is inert until Confirm", () => {
  const reply = [
    "Sure — here is a routine for that.",
    "",
    "```localbot-routine",
    JSON.stringify({ name: "Morning inbox", instructions: "Summarize private/inbox into private/output/summary.md", schedule: "daily 09:00" }),
    "```",
    "",
    "Confirm it in LocalBot when you are ready.",
  ].join("\n");

  it("splits the block out of the reply and parses it", () => {
    const { text, proposals } = splitRoutineBlocks(reply);
    assert.equal(text, "Sure — here is a routine for that.\n\nConfirm it in LocalBot when you are ready.");
    assert.equal(proposals.length, 1);
    const p = proposals[0]!;
    assert.ok(p.ok);
    assert.equal(p.proposal.name, "Morning inbox");
    assert.deepEqual(p.proposal.schedule, { kind: "daily", hour: 9, minute: 0 });
  });

  it("malformed blocks become an error card, not a saved routine", () => {
    assert.equal(parseRoutineProposal("{ not json").ok, false);
    assert.equal(parseRoutineProposal(JSON.stringify({ name: "", instructions: "x" })).ok, false);
    assert.equal(parseRoutineProposal(JSON.stringify({ name: "x", instructions: "y", schedule: "weekly" })).ok, false);
    assert.equal(parseRoutineProposal(JSON.stringify({ name: "x", instructions: "y" })).ok, true, "schedule defaults to manual");
    assert.equal(splitRoutineBlocks("no blocks here").proposals.length, 0);
  });

  it("parsing never touches disk", () => {
    const prev = process.env.LOCALBOT_DATA_DIR;
    process.env.LOCALBOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lb15-inert-"));
    try {
      for (let i = 0; i < 5; i++) splitRoutineBlocks(reply);
      assert.equal(fs.existsSync(routinesDir()), false, "parsing a proposal must not create routines/");
      assert.equal(listRoutines().length, 0);
    } finally {
      if (prev === undefined) delete process.env.LOCALBOT_DATA_DIR;
      else process.env.LOCALBOT_DATA_DIR = prev;
    }
  });
});

describe("Stage 15: records on disk, outside every scope", () => {
  const ctx = {} as { folders: FoldersConfig; base: string; dataDir: string; writerId: string; oldId: string };
  const prevDataDir = process.env.LOCALBOT_DATA_DIR;
  const roster = () => loadRoster(ctx.folders);
  const rctx = () => ({ folders: ctx.folders, roster: roster() });

  before(() => {
    ctx.dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb15-data-"));
    process.env.LOCALBOT_DATA_DIR = ctx.dataDir;
    ctx.base = makeTempRoot("lb15-root-");
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
    ensureAgent(ctx.folders, { name: "Writer", job: "writes", modelId: "fixture", color: "sage", mascotId: "writer", scopes: ["private"], standingInstructions: "", createdAt: now });
    ensureAgent(ctx.folders, { name: "Old", job: "retired", modelId: "fixture", color: "sage", mascotId: "ops", scopes: ["private"], standingInstructions: "", createdAt: now });
    setAgentArchived(ctx.folders, "Old", true);
    const rows = roster();
    ctx.writerId = rows.find((r) => r.name === "Writer")!.id;
    ctx.oldId = rows.find((r) => r.name === "Old")!.id;
  });

  after(() => {
    if (prevDataDir === undefined) delete process.env.LOCALBOT_DATA_DIR;
    else process.env.LOCALBOT_DATA_DIR = prevDataDir;
  });

  it("refuses a routines dir under any scope root — nothing is written", () => {
    const saved = process.env.LOCALBOT_DATA_DIR;
    const c = rctx(); // roster read while the data dir is still the real one
    try {
      for (const root of [ctx.folders.employeeRoot, ctx.folders.employeeShared!, ctx.folders.departmentShared!]) {
        process.env.LOCALBOT_DATA_DIR = path.join(root, "LocalBot-data");
        assert.throws(() => assertRoutinesOutsideScopes(ctx.folders), isCode("OUTSIDE_SCOPE"), `routines under ${root} must be refused`);
        assert.throws(
          () => createRoutine({ name: "Leak", agentId: ctx.writerId, instructions: "x", schedule: { kind: "manual" } }, c),
          isCode("OUTSIDE_SCOPE"),
        );
        assert.equal(fs.existsSync(path.join(root, "LocalBot-data", "routines")), false, "no routines/ may appear inside a scope");
      }
    } finally {
      process.env.LOCALBOT_DATA_DIR = saved;
    }
    assert.doesNotThrow(() => assertRoutinesOutsideScopes(ctx.folders));
    assert.doesNotThrow(() => assertRoutinesOutsideScopes(null));
  });

  it("the routines dir is not reachable through any scope (host-index chats rule, same idea)", () => {
    const dir = routinesDir();
    for (const root of [ctx.folders.employeeRoot, ctx.folders.employeeShared!, ctx.folders.departmentShared!]) {
      assert.equal(path.relative(root, dir).startsWith(".."), true, `${dir} must be outside ${root}`);
    }
  });

  it("refuses empty name, unknown agent, archived target — nothing on disk", () => {
    const before = listRoutines().length;
    assert.throws(() => createRoutine({ name: "   ", agentId: ctx.writerId, instructions: "x", schedule: { kind: "manual" } }, rctx()), isCode("BAD_NAME"));
    assert.throws(() => createRoutine({ name: "Ok", agentId: ctx.writerId, instructions: "  ", schedule: { kind: "manual" } }, rctx()), isCode("BAD_INSTRUCTIONS"));
    assert.throws(() => createRoutine({ name: "Ok", agentId: "bot_nope", instructions: "x", schedule: { kind: "manual" } }, rctx()), isCode("UNKNOWN_AGENT"));
    assert.throws(() => createRoutine({ name: "Ok", agentId: ctx.oldId, instructions: "x", schedule: { kind: "manual" } }, rctx()), isCode("ARCHIVED"));
    assert.throws(() => createRoutine({ name: "Ok", agentId: ctx.writerId, instructions: "x", schedule: "weekly" as never }, rctx()), isCode("BAD_SCHEDULE"));
    assert.equal(listRoutines().length, before);
  });

  it("create writes {dataDir}/routines/{id}.json atomically; a fresh reader sees it; update keeps .bak", () => {
    const r = createRoutine({ name: "Morning inbox", agentId: ctx.writerId, instructions: "Summarize inbox", schedule: "daily 09:00" }, rctx());
    const file = routinePath(r.id);
    assert.equal(path.dirname(file), path.join(ctx.dataDir, "routines"));
    assert.ok(fs.existsSync(file), "record must be on disk");
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Routine;
    assert.deepEqual(Object.keys(raw).sort(), ["agentId", "createdAt", "enabled", "id", "instructions", "lastError", "lastRunAt", "lastStatus", "name", "schedule"].sort());
    assert.equal(raw.lastStatus, "never");
    assert.equal(raw.lastRunAt, null);
    assert.deepEqual(readRoutine(r.id), r, "readRoutine reads back what was written");
    assert.ok(listRoutines().some((x) => x.id === r.id));
    assert.equal(fs.readdirSync(path.dirname(file)).some((n) => n.endsWith(".tmp")), false, "no temp file left behind");

    const u = updateRoutine(r.id, { name: "Morning inbox v2", enabled: false, schedule: { kind: "every", minutes: 30 } }, rctx());
    assert.equal(u.name, "Morning inbox v2");
    assert.equal(u.enabled, false);
    assert.ok(fs.existsSync(`${file}.bak`), "previous copy kept as .bak");
    assert.equal((JSON.parse(fs.readFileSync(`${file}.bak`, "utf8")) as Routine).name, "Morning inbox");
    assert.throws(() => updateRoutine(r.id, { agentId: ctx.oldId }, rctx()), isCode("ARCHIVED"));
    assert.throws(() => updateRoutine("rt_missing0000", { name: "x" }, rctx()), isCode("NOT_FOUND"));
    assert.throws(() => routinePath("../escape"), isCode("BAD_ID"));

    assert.ok(deleteRoutine(r.id));
    assert.equal(fs.existsSync(file), false);
    assert.equal(fs.existsSync(`${file}.bak`), false);
  });

  it("gates: disabled / archived / DISCONNECTED / BUSY / already running do not fire; a healthy routine does", () => {
    const now = new Date();
    const past = new Date(now.getTime() - 10 * 60_000);
    const r = createRoutine({ name: "Every5", agentId: ctx.writerId, instructions: "tick", schedule: "every 5 minutes" }, rctx(), past);
    const deps = (busy = false) => ({ folders: ctx.folders, roster: roster(), hasActiveTurn: () => busy });

    let rep = routinesDue(now, deps());
    assert.deepEqual(rep.due.map((d) => d.id), [r.id]);
    assert.equal(rep.due[0]!.agentName, "Writer");
    assert.equal(rep.due[0]!.instructions, "tick");

    // BUSY
    rep = routinesDue(now, deps(true));
    assert.equal(rep.due.length, 0);
    assert.equal(rep.skipped[0]?.code, "BUSY");
    assert.throws(() => routinesClaim(r.id, { manual: true }, now, deps(true)), isCode("BUSY"), "Run now must also refuse BUSY");

    // disabled
    updateRoutine(r.id, { enabled: false }, rctx());
    rep = routinesDue(now, deps());
    assert.equal(rep.due.length, 0);
    assert.equal(rep.skipped.length, 0, "a disabled routine is not even a candidate");
    assert.throws(() => routinesClaim(r.id, { manual: false }, now, deps()), isCode("DISABLED"));
    updateRoutine(r.id, { enabled: true }, rctx());

    // archived target (archived after the routine was created)
    setAgentArchived(ctx.folders, "Writer", true);
    rep = routinesDue(now, deps());
    assert.equal(rep.due.length, 0);
    assert.equal(rep.skipped[0]?.code, "ARCHIVED");
    assert.throws(() => routinesClaim(r.id, { manual: true }, now, deps()), isCode("ARCHIVED"), "Run now must refuse an archived agent");
    setAgentArchived(ctx.folders, "Writer", false);

    // unknown agent
    rep = routinesDue(now, { ...deps(), roster: [] });
    assert.equal(rep.skipped[0]?.code, "UNKNOWN_AGENT");

    // DISCONNECTED employee root (share unmounted)
    const moved = `${ctx.folders.employeeRoot}.away`;
    fs.renameSync(ctx.folders.employeeRoot, moved);
    try {
      const rows = roster();
      rep = routinesDue(now, { folders: ctx.folders, roster: rows.length ? rows : [{ id: ctx.writerId, name: "Writer", archived: false } as never], hasActiveTurn: () => false });
      assert.equal(rep.due.length, 0);
      assert.equal(rep.skipped[0]?.code, "DISCONNECTED", `got ${JSON.stringify(rep.skipped)}`);
    } finally {
      fs.renameSync(moved, ctx.folders.employeeRoot);
    }

    // not configured
    rep = routinesDue(now, { ...deps(), folders: null });
    assert.equal(rep.skipped[0]?.code, "NOT_CONFIGURED");

    // healthy again → gateRoutine returns the roster row
    assert.equal(gateRoutine(readRoutine(r.id)!, deps(), { manual: false }, now).name, "Writer");
    deleteRoutine(r.id);
  });

  it("claim is exclusive and finish persists lastRunAt / lastStatus; a missed beat runs once", () => {
    const now = new Date();
    const created = new Date(now.getTime() - 3 * 86_400_000); // three days of missed daily beats
    const r = createRoutine({ name: "Daily", agentId: ctx.writerId, instructions: "report", schedule: "daily 00:00" }, rctx(), created);
    const deps = { folders: ctx.folders, roster: roster(), hasActiveTurn: () => false };

    assert.equal(routinesDue(now, deps).due.length, 1);
    const claimed = routinesClaim(r.id, { manual: false }, now, deps);
    assert.equal(claimed.routine.lastStatus, "running");
    assert.equal(claimed.routine.lastRunAt, now.toISOString());
    assert.ok(fs.existsSync(routineLockPath(r.id)), "the exclusive marker exists while running");
    assert.equal((readRoutine(r.id) as Routine).lastStatus, "running", "the claim is on disk, not in memory");

    // A second window: not due (claimed) and the claim is refused.
    assert.equal(routinesDue(now, deps).due.length, 0);
    assert.throws(() => routinesClaim(r.id, { manual: true }, now, deps), isCode("ALREADY_RUNNING"));
    assert.equal(acquireRoutineLock(r.id, now, CLAIM_STALE_MS), false, "O_EXCL marker refuses a second holder");

    const done = routinesFinish(r.id, "ok", null, ctx.folders);
    assert.equal(done.lastStatus, "ok");
    assert.equal(done.lastRunAt, now.toISOString());
    assert.equal(fs.existsSync(routineLockPath(r.id)), false, "marker released");
    // One catch-up only: three missed days do not replay.
    assert.equal(routinesDue(new Date(now.getTime() + 60_000), deps).due.length, 0);

    // error path keeps the message
    routinesClaim(r.id, { manual: true }, new Date(now.getTime() + 120_000), deps);
    const failed = routinesFinish(r.id, "error", "llama-server not ready", ctx.folders);
    assert.equal(failed.lastStatus, "error");
    assert.equal(failed.lastError, "llama-server not ready");
    const stopped = (() => {
      routinesClaim(r.id, { manual: true }, new Date(now.getTime() + 180_000), deps);
      return routinesFinish(r.id, "stopped", null, ctx.folders);
    })();
    assert.equal(stopped.lastStatus, "stopped");
    assert.equal(stopped.lastError, null);

    // a stale marker from a crash is taken over
    fs.writeFileSync(routineLockPath(r.id), "{}");
    const old = new Date(now.getTime() - CLAIM_STALE_MS - 60_000);
    fs.utimesSync(routineLockPath(r.id), old, old);
    assert.equal(acquireRoutineLock(r.id, now, CLAIM_STALE_MS), true);
    deleteRoutine(r.id);
    assert.equal(fs.existsSync(routineLockPath(r.id)), false);
  });

  it("the mirrored standing instructions tell the model it can only propose", () => {
    const text = standingInstructionsText("Writer");
    assert.match(text, /```localbot-routine/);
    assert.match(text, /you cannot create, edit or run routines yourself/);
    assert.match(text, /Granted folders: `private\/`/, "Stage 4–12 header still present");
  });
});
