#!/usr/bin/env node
/**
 * Stage 15 prove-it: Routines (run: `npm run prove:routines`).
 *
 * Everything runs against a temp LOCALBOT_DATA_DIR and temp scope folders —
 * never the real AppData, never a real share. It uses the same sidecar
 * modules the Routines screen's server functions call
 * (src/lib/fs/routines.ts, src/lib/harness/routines.ts).
 *
 * Static gates (source):
 *   - sidebar footer: sidebar-routines ABOVE sidebar-plugins ABOVE sidebar-settings
 *   - routines.tsx calls routinesList / routinesCreate / routinesUpdate / routinesDelete
 *     and Run now is runRoutine(); RoutinesDialog + useRoutineTicker mounted in shell.tsx
 *   - routineRunner.ts calls runAgentTurn with the routine instructions as userText,
 *     never imports the harness server functions (no second loop), denies permissions
 *   - chat.tsx keeps runAgentTurn; only Confirm calls routinesCreate
 *   - dsh / ACP pins exact; dsh/localbot-fs.mjs sha256 pin
 *
 * Live gates (disk, no dsh, no model):
 *   1. OUTSIDE: LOCALBOT_DATA_DIR inside the employee root / a share → create refused, no file
 *   2. RECORD: create → {dataDir}/routines/{id}.json exists with the 10 fields;
 *      a FRESH node process reads it back (fails if routines only lived in React state)
 *   3. REFUSE: empty name / unknown agent / archived target → nothing written
 *   4. GATES: due → BUSY (real HarnessManager with a running turn) → disabled → archived
 *      → DISCONNECTED (employee root renamed away) each keep the routine out of `due`
 *   5. CLAIM: exclusive marker, second claim refused, finish persists lastRunAt/lastStatus,
 *      three missed daily beats replay exactly once
 *   6. PROPOSAL: parsing a ```localbot-routine reply writes nothing
 *
 * Usage:
 *   npm run prove:routines
 *   npm run prove:routines -- --static     # source gates only
 *   npm run prove:routines -- --keep       # leave the temp dirs behind
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
const log = (...a) => console.log("[prove-routines]", ...a);
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error("[prove-routines] FAIL:", msg);
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
  const footer = /data-testid="sidebar-footer"[\s\S]*$/.exec(sidebar)?.[0] ?? "";
  const r = footer.indexOf('data-testid="sidebar-routines"');
  const p = footer.indexOf('data-testid="sidebar-plugins"');
  const s = footer.indexOf('data-testid="sidebar-settings"');
  gate(r >= 0, "sidebar footer has data-testid=sidebar-routines");
  gate(r >= 0 && p >= 0 && s >= 0 && r < p && p < s, "footer order is Routines > Plugins > Settings");
  gate(/setUi\(\{ showRoutines: true \}\)/.test(sidebar), "Routines button opens the Routines screen");

  const dialog = read("src/components/localbot/routines.tsx");
  for (const fn of ["routinesList", "routinesCreate", "routinesUpdate", "routinesDelete"]) {
    gate(new RegExp(`\\b${fn}\\(`).test(dialog), `routines.tsx calls ${fn}()`);
  }
  gate(/from "@\/lib\/runtime\/routines"/.test(dialog), "routines.tsx imports the server functions");
  gate(/await runRoutine\(r\.id, \{ manual: true, agentId: r\.agentId \}\)/.test(dialog), "Run now is runRoutine() — the same path as the ticker");
  gate(!/localStorage/.test(dialog), "routines.tsx never reads routines from localStorage");

  const shell = read("src/components/localbot/shell.tsx");
  gate(/<RoutinesDialog \/>/.test(shell), "RoutinesDialog is mounted in the shell");
  gate(/useRoutineTicker\(diskLoaded\)/.test(shell), "useRoutineTicker is mounted in the shell");

  const runner = read("src/runtime/routineRunner.ts");
  gate(/import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/.test(runner) && /turn: runAgentTurn,/.test(runner), "routineRunner uses runAgentTurn");
  gate(/await deps\.turn\(\{\s*botId: bot\.id,\s*userText: due\.instructions/.test(runner), "routine instructions are the user text of the turn");
  gate(!/@\/lib\/runtime\/harness"|harnessPrompt|harnessPoll|getHarnessManager/.test(runner), "routineRunner has no second Harness loop");
  gate(/askPermission: async \(req\) => \{[\s\S]*?return ROUTINE_PERMISSION_DECISION;/.test(runner) && !/"allow-once"|"allow-chat"/.test(runner), "ungranted permissions during a routine are denied");
  gate(/routinesClaim\(\{ data: \{ id, manual \} \}\)/.test(runner) && /routinesFinish\(\{ data: \{ id, status, error \} \}\)/.test(runner), "runner claims first, finishes last");
  gate(/window\.setInterval\(tick, ROUTINE_TICK_MS\)/.test(runner), "ticker every ROUTINE_TICK_MS while the window is open");

  const chat = read("src/components/localbot/chat.tsx");
  gate(/import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/.test(chat) && /runAgentTurn\(/.test(chat), "chat.tsx keeps runAgentTurn");
  gate((chat.match(/routinesCreate\(/g) ?? []).length === 1 && /const confirm = async \(i: number, p: RoutineProposal\) => \{[\s\S]*?await routinesCreate\(/.test(chat), "chat.tsx: exactly one write path, inside Confirm");
  const dismiss = /const dismiss = \(i: number\) => \{([\s\S]*?)\};/.exec(chat);
  gate(Boolean(dismiss) && !/routinesCreate|routinesUpdate/.test(dismiss[1]), "Dismiss writes nothing");

  gate(/ROUTINE_BLOCK_INSTRUCTION,/.test(read("src/lib/harness/index.ts")), "standing instructions carry the proposal line");

  const pkg = JSON.parse(read("package.json"));
  gate(pkg.dependencies["@deepseek-ai/dsh"] === "0.1.2-alpha.5", "dsh pin is exact 0.1.2-alpha.5");
  gate(pkg.dependencies["@agentclientprotocol/sdk"] === "1.4.0", "ACP SDK pin is exact 1.4.0");
  gate(createHash("sha256").update(read("dsh/localbot-fs.mjs")).digest("hex") === LOCALBOT_FS_SHA256, "dsh/localbot-fs.mjs unchanged (sha256 pin)");
  gate(/src\/lib\/routines\.test\.ts/.test(pkg.scripts.test), "npm test runs routines.test.ts");
}

if (flag("--static")) finish();

/* ---------------- live gates ---------------- */

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lb15-prove-"));
process.env.LOCALBOT_DATA_DIR = dataDir;
const base = fs.mkdtempSync(path.join(os.tmpdir(), "lb15-roots-"));
const folders = {
  employeeRoot: path.join(base, "emp"),
  employeeShared: path.join(base, "emp-shared"),
  departmentShared: null,
  companyShared: null,
};

const scopes = await import(pathToFileURL(path.join(root, "src/lib/fs/scopes.ts")).href);
const hostIndex = await import(pathToFileURL(path.join(root, "src/lib/fs/host-index.ts")).href);
const R = await import(pathToFileURL(path.join(root, "src/lib/fs/routines.ts")).href);
const G = await import(pathToFileURL(path.join(root, "src/lib/harness/routines.ts")).href);
const M = await import(pathToFileURL(path.join(root, "src/lib/routines-model.ts")).href);
const { HarnessManager } = await import(pathToFileURL(path.join(root, "src/lib/harness/index.ts")).href);

const set = scopes.setFolders(folders, { create: true });
if (!set.ok) {
  fail(`setFolders: ${set.error}`);
  finish();
}
const now0 = new Date().toISOString();
scopes.ensureAgent(set.folders, { name: "Scheduler", job: "runs routines", modelId: "fixture", color: "sage", mascotId: "ops", scopes: ["private"], standingInstructions: "", createdAt: now0 });
scopes.ensureAgent(set.folders, { name: "Retired", job: "archived", modelId: "fixture", color: "sage", mascotId: "ops", scopes: ["private"], standingInstructions: "", createdAt: now0 });
scopes.setAgentArchived(set.folders, "Retired", true);
const roster = () => hostIndex.loadRoster(set.folders);
const schedulerId = roster().find((r) => r.name === "Scheduler").id;
const retiredId = roster().find((r) => r.name === "Retired").id;
const rctx = () => ({ folders: set.folders, roster: roster() });
log(`dataDir=${dataDir}\n  employeeRoot=${set.folders.employeeRoot}\n  routines/=${R.routinesDir()}`);

try {
  // 1. OUTSIDE
  {
    const c = rctx();
    for (const scopeRoot of [set.folders.employeeRoot, set.folders.employeeShared]) {
      process.env.LOCALBOT_DATA_DIR = path.join(scopeRoot, "LocalBot");
      const code = codeOf(() => R.createRoutine({ name: "Leak", agentId: schedulerId, instructions: "x", schedule: "manual" }, c));
      gate(code === "OUTSIDE_SCOPE", `routines/ under ${path.basename(scopeRoot)} refused with OUTSIDE_SCOPE (got ${code})`);
      gate(!fs.existsSync(path.join(scopeRoot, "LocalBot", "routines")), `no routines/ appeared inside ${path.basename(scopeRoot)}`);
    }
    process.env.LOCALBOT_DATA_DIR = dataDir;
  }

  // 3. REFUSE
  {
    gate(codeOf(() => R.createRoutine({ name: "  ", agentId: schedulerId, instructions: "x", schedule: "manual" }, rctx())) === "BAD_NAME", "empty name refused (BAD_NAME)");
    gate(codeOf(() => R.createRoutine({ name: "x", agentId: "bot_nope", instructions: "x", schedule: "manual" }, rctx())) === "UNKNOWN_AGENT", "unknown agent refused (UNKNOWN_AGENT)");
    gate(codeOf(() => R.createRoutine({ name: "x", agentId: retiredId, instructions: "x", schedule: "manual" }, rctx())) === "ARCHIVED", "archived target refused (ARCHIVED)");
    gate(codeOf(() => R.createRoutine({ name: "x", agentId: schedulerId, instructions: "x", schedule: "weekly" }, rctx())) === "BAD_SCHEDULE", "bad schedule refused (BAD_SCHEDULE)");
    gate(!fs.existsSync(R.routinesDir()) || fs.readdirSync(R.routinesDir()).length === 0, "nothing written by the refused creates");
  }

  // 2. RECORD + fresh process
  const created = R.createRoutine({ name: "Every minute", agentId: schedulerId, instructions: "Say hello and stop.", schedule: "every 1 minutes" }, rctx(), new Date(Date.now() - 5 * 60_000));
  const file = R.routinePath(created.id);
  gate(fs.existsSync(file) && path.dirname(file) === path.join(dataDir, "routines"), `record on disk at routines/${created.id}.json`);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const fields = ["id", "name", "agentId", "instructions", "schedule", "enabled", "createdAt", "lastRunAt", "lastStatus", "lastError"];
  gate(fields.every((f) => f in raw) && Object.keys(raw).length === fields.length, `record has exactly ${fields.join(", ")}`);
  {
    const probe = `
      import { listRoutines, routinesDir } from ${JSON.stringify(pathToFileURL(path.join(root, "src/lib/fs/routines.ts")).href)};
      const list = listRoutines();
      console.log(JSON.stringify({ dir: routinesDir(), ids: list.map((r) => r.id), names: list.map((r) => r.name) }));
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
    if (!out || !out.ids.includes(created.id)) {
      fail(`a fresh node process did not find routines/${created.id}.json — routines would exist only in React state (stdout=${res.stdout.trim()} stderr=${res.stderr.trim()})`);
      throw new Error("record not durable");
    }
    gate(out.names.includes("Every minute"), `fresh process read back "${out.names.join(", ")}" from ${out.dir}`);
  }

  // 4. GATES
  const now = new Date();
  const mgr = new HarnessManager();
  const deps = () => ({ folders: set.folders, roster: roster(), hasActiveTurn: (n) => mgr.hasActiveTurn(n) });
  let rep = G.routinesDue(now, deps());
  gate(rep.due.length === 1 && rep.due[0].id === created.id && rep.due[0].agentName === "Scheduler", "routinesDue lists the due routine with its agent");

  // BUSY: a real HarnessManager with a running turn on Scheduler's session.
  mgr.sessions.set("Scheduler", "sess-routines");
  mgr.turns.start("sess-routines", "Scheduler");
  rep = G.routinesDue(now, deps());
  gate(rep.due.length === 0 && rep.skipped[0]?.code === "BUSY", `BUSY: a running turn keeps it out of due (${rep.skipped[0]?.code})`);
  gate(codeOf(() => G.routinesClaim(created.id, { manual: true }, now, deps())) === "BUSY", "BUSY: Run now is refused too");
  gate(!fs.existsSync(R.routineLockPath(created.id)), "BUSY: no claim marker was left behind");
  mgr.sessions.delete("Scheduler");
  rep = G.routinesDue(now, deps());
  gate(rep.due.length === 1, "turn gone → due again");

  // disabled
  R.updateRoutine(created.id, { enabled: false }, rctx());
  rep = G.routinesDue(now, deps());
  gate(rep.due.length === 0 && rep.skipped.length === 0, "disabled: not a candidate at all");
  gate(codeOf(() => G.routinesClaim(created.id, { manual: false }, now, deps())) === "DISABLED", "disabled: ticker claim refused (DISABLED)");
  R.updateRoutine(created.id, { enabled: true }, rctx());

  // archived after the fact
  scopes.setAgentArchived(set.folders, "Scheduler", true);
  rep = G.routinesDue(now, deps());
  gate(rep.due.length === 0 && rep.skipped[0]?.code === "ARCHIVED", `archived agent: skipped (${rep.skipped[0]?.code})`);
  gate(codeOf(() => G.routinesClaim(created.id, { manual: true }, now, deps())) === "ARCHIVED", "archived agent: Run now refused (ARCHIVED)");
  scopes.setAgentArchived(set.folders, "Scheduler", false);

  // DISCONNECTED: the employee root goes away (unmounted share)
  {
    const rows = roster();
    const away = `${set.folders.employeeRoot}.away`;
    fs.renameSync(set.folders.employeeRoot, away);
    try {
      rep = G.routinesDue(now, { folders: set.folders, roster: rows, hasActiveTurn: () => false });
      gate(rep.due.length === 0 && rep.skipped[0]?.code === "DISCONNECTED", `DISCONNECTED employee root: skipped (${rep.skipped[0]?.code})`);
      gate(codeOf(() => G.routinesClaim(created.id, { manual: true }, now, { folders: set.folders, roster: rows, hasActiveTurn: () => false })) === "DISCONNECTED", "DISCONNECTED: Run now refused");
    } finally {
      fs.renameSync(away, set.folders.employeeRoot);
    }
  }

  // 5. CLAIM / FINISH / once
  const claimed = G.routinesClaim(created.id, { manual: false }, now, deps());
  gate(claimed.routine.lastStatus === "running" && claimed.routine.lastRunAt === now.toISOString(), "claim → lastStatus running, lastRunAt = now, on disk");
  gate(fs.existsSync(R.routineLockPath(created.id)), "claim → exclusive marker exists");
  gate(JSON.parse(fs.readFileSync(file, "utf8")).lastStatus === "running", "claim is in the JSON file (a second window sees it)");
  gate(codeOf(() => G.routinesClaim(created.id, { manual: true }, now, deps())) === "ALREADY_RUNNING", "second claim refused (ALREADY_RUNNING)");
  gate(G.routinesDue(now, deps()).due.length === 0, "a claimed routine is not due for another window");
  const finished = G.routinesFinish(created.id, "ok", null, set.folders);
  gate(finished.lastStatus === "ok" && finished.lastRunAt === now.toISOString() && !fs.existsSync(R.routineLockPath(created.id)), "finish ok → lastStatus ok, marker released");
  gate(JSON.parse(fs.readFileSync(file, "utf8")).lastStatus === "ok", "finish is on disk");
  gate(G.routinesDue(new Date(now.getTime() + 30_000), deps()).due.length === 0, "30 s later: not due (every 1 min counts from the claim)");
  gate(G.routinesDue(new Date(now.getTime() + 61_000), deps()).due.length === 1, "61 s later: due again");

  // missed beats replay once
  const daily = R.createRoutine({ name: "Daily 00:00", agentId: schedulerId, instructions: "report", schedule: "daily 00:00" }, rctx(), new Date(now.getTime() - 3 * 86_400_000));
  gate(G.routinesDue(now, deps()).due.some((d) => d.id === daily.id), "three missed daily beats → due once on open");
  G.routinesClaim(daily.id, { manual: false }, now, deps());
  G.routinesFinish(daily.id, "error", "llama-server not ready", set.folders);
  const dailyAfter = R.readRoutine(daily.id);
  gate(dailyAfter.lastStatus === "error" && dailyAfter.lastError === "llama-server not ready", "finish error keeps the message");
  gate(!G.routinesDue(new Date(now.getTime() + 60_000), deps()).due.some((d) => d.id === daily.id), "no backlog replay: the other two missed beats are gone");

  // 6. PROPOSAL inert
  {
    const before = fs.readdirSync(R.routinesDir()).filter((n) => n.endsWith(".json")).length;
    const reply = "Here you go.\n```localbot-routine\n" + JSON.stringify({ name: "Inbox sweep", instructions: "Summarize private/inbox", schedule: "daily 09:00" }) + "\n```\n";
    const { proposals, text } = M.splitRoutineBlocks(reply);
    gate(proposals.length === 1 && proposals[0].ok && text === "Here you go.", "proposal block parsed out of the reply");
    gate(fs.readdirSync(R.routinesDir()).filter((n) => n.endsWith(".json")).length === before, "parsing the proposal wrote nothing (Confirm is the only write)");
    gate(M.parseRoutineProposal("{ nope").ok === false, "malformed block → error card, no write");
  }

  // delete
  R.deleteRoutine(created.id);
  R.deleteRoutine(daily.id);
  gate(!fs.existsSync(file) && !fs.existsSync(`${file}.bak`), "delete removes the record and its .bak");
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
    console.error(`\n[prove-routines] ${failures.length} failure(s):\n - ${failures.join("\n - ")}`);
    process.exit(1);
  }
  console.log(`\nSTAGE15_ROUTINES_PASS static+${flag("--static") ? "0" : "live"} outside/record-fresh-process/refuse/busy/disabled/archived/disconnected/claim/finish/once/proposal-inert`);
  process.exit(0);
}
