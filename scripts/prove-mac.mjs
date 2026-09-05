#!/usr/bin/env node
/**
 * Stage 10 prove-it for the Mac slice (run: `npm run prove:mac`). Darwin only.
 *
 * Fails when:
 *   - package.json build.mac.identity is not null, or build.mac.target has no dmg
 *   - no dist/desktop/*.dmg exists, or its sha256 is not written in STAGE_HANDOFF.md
 *   - STAGE_HANDOFF.md claims the Mac build is signed / notarized (identity is null,
 *     so the only honest words are UNSIGNED / not notarized)
 *   - src/components/localbot/chat.tsx dropped runAgentTurn, or the dsh pin floats
 *   - catalog/whisper-assets.json has a darwin row that is not `kind: "built"` or has a URL
 *   - the built whisper-cli is missing from ~/Library/Application Support/LocalBot
 *     (prints the build command and exits 1 — Mic is NOT BUILT on this Mac)
 *   - live gate (skip with --no-mic): the packaged LocalBot.app, launched with
 *     node/npm/npx removed from PATH, does not enable the Mic button, does not get
 *     microphone access from macOS TCC, or a real click-click (Stage 13: click to
 *     start, jfk.wav played out of the speakers, click to stop) does not put a
 *     transcript into the composer without sending a message — or the mic stops
 *     right after the first click (hold-only control). The press-and-hold
 *     fallback is checked second with the same fixture.
 *
 * Usage:
 *   npm run prove:mac                 # newest dist/desktop/*.dmg + dist/desktop/mac-arm64/LocalBot.app
 *   npm run prove:mac -- --no-mic     # static gates + whisper build only (no window)
 *   npm run prove:mac -- --app <LocalBot.app>
 *   npm run prove:mac -- --expect "<phrase>"   # what the mic must hear (default: the JFK fixture phrase)
 *   npm run prove:mac -- --tcc-wait 90         # seconds to wait for a human to click Allow on the TCC prompt
 *
 * The packaged app writes to the real ~/Library/Application Support/LocalBot
 * (Electron ignores $HOME for appData on macOS). If that folder has no
 * localbot-config.json yet, this script seeds one agent ("Writer") under a temp
 * work dir for the run and deletes the config again afterwards.
 */
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SIDECAR_URL } from "../desktop/packaged.mjs";
import { seedLocalBotData } from "./seed-localbot-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const log = (...a) => console.log("[prove-mac]", ...a);
const fail = (msg) => {
  console.error("[prove-mac] FAIL:", msg);
  process.exit(1);
};
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const JFK_PHRASE = "ask not what your country can do for you";

if (process.platform !== "darwin") fail(`this proof runs on the Mac host only; platform is ${process.platform}`);
const arch = process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";

// ---- 0. static gates -------------------------------------------------------
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (pkg.build.mac.identity !== null) fail("build.mac.identity is not null — Stage 10 ships UNSIGNED");
if (!(pkg.build.mac.target ?? []).includes("dmg")) fail("build.mac.target has no dmg");
if (!pkg.build.mac.extendInfo?.NSMicrophoneUsageDescription) fail("build.mac.extendInfo.NSMicrophoneUsageDescription is missing");
if (pkg.build.mac.hardenedRuntime === true || pkg.build.afterSign) fail("build.mac enables hardened runtime / afterSign — that is the paid signing path");

const chat = fs.readFileSync(path.join(root, "src/components/localbot/chat.tsx"), "utf8");
if (!chat.includes("runAgentTurn")) fail("src/components/localbot/chat.tsx dropped runAgentTurn");
if (!/import .*useVoiceInput/.test(chat)) fail("chat.tsx no longer wires useVoiceInput");
const dshPin = pkg.dependencies?.["@deepseek-ai/dsh"] ?? "";
if (!/^\d/.test(dshPin)) fail(`@deepseek-ai/dsh pin floats: "${dshPin}"`);

const outDir = path.join(root, "dist/desktop");
const dmgs = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((n) => n.endsWith(".dmg")) : [];
if (!dmgs.length) fail("no dist/desktop/*.dmg — run npm run build:desktop on this Mac");
dmgs.sort((a, b) => fs.statSync(path.join(outDir, b)).mtimeMs - fs.statSync(path.join(outDir, a)).mtimeMs);
const dmg = path.join(outDir, dmgs[0]);
const dmgSha = sha256(dmg);
const sums = fs.existsSync(path.join(outDir, "SHA256SUMS.txt")) ? fs.readFileSync(path.join(outDir, "SHA256SUMS.txt"), "utf8") : "";
if (!sums.includes(dmgSha)) fail(`SHA256SUMS.txt does not list ${dmgSha} for ${path.basename(dmg)}`);

const handoffPath = path.join(root, "STAGE_HANDOFF.md");
const handoff = fs.existsSync(handoffPath) ? fs.readFileSync(handoffPath, "utf8") : "";
if (!handoff.includes("## Stage 10")) fail("STAGE_HANDOFF.md has no '## Stage 10' section");
if (!handoff.includes(dmgSha)) fail(`STAGE_HANDOFF.md does not carry the .dmg sha256 ${dmgSha}`);
// "signed" / "notarized" may only appear negated: unsigned, UNSIGNED, "not signed", "not notarized", "no ... signing".
const claims = [];
for (const m of handoff.matchAll(/\b(un)?(signed|notarized)\b/gi)) {
  if (m[1]) continue; // unsigned
  const before = handoff.slice(Math.max(0, m.index - 40), m.index).toLowerCase();
  if (/\b(not|no|never|without|skip(ped|s)?|zero)\b[^.\n]*$/.test(before)) continue;
  if (/\bad-hoc\b[^.\n]*$/.test(before)) continue; // Electron's ad-hoc signature is not Developer ID
  claims.push(handoff.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, " "));
}
if (claims.length) fail(`STAGE_HANDOFF.md claims a signed/notarized build while identity is null:\n  ${claims.join("\n  ")}`);

const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog/whisper-assets.json"), "utf8"));
for (const t of ["darwin-arm64", "darwin-x64"]) {
  const row = catalog.targets[t];
  if (!row) continue;
  if (row.kind !== "built") fail(`catalog ${t} is kind ${row.kind}; darwin whisper-cli must be built from source`);
  if (row.url) fail(`catalog ${t} carries a URL — upstream ships no darwin CLI`);
  if (!/^[0-9a-f]{64}$/.test(row.sha256 ?? "")) fail(`catalog ${t} has no sha256`);
  if (row.source?.tag !== catalog.release) fail(`catalog ${t} source tag ${row.source?.tag} != release ${catalog.release}`);
}
for (const t of ["linux-x64", "win32-x64"]) if (!catalog.targets[t]?.url) fail(`catalog ${t} row lost its URL`);
log("static gates ok: identity null | dmg", path.basename(dmg), "sha256", dmgSha.slice(0, 12) + "…", "in STAGE_HANDOFF | no signed/notarized claim | runAgentTurn kept | dsh", dshPin);

// ---- 1. the built whisper-cli ------------------------------------------------
const appData = path.join(os.homedir(), "Library", "Application Support", "LocalBot");
const whisperDir = path.join(appData, "bin", arch, "whisper");
const whisperCli = path.join(whisperDir, "whisper-cli");
const manifestPath = path.join(whisperDir, "whisper-build.json");
const catRow = catalog.targets[arch];
if (!catRow) {
  log(`catalog has no ${arch} row: Mic on this Mac is NOT BUILT (npm run build:whisper-mac would build it, untested here)`);
} else if (!fs.existsSync(whisperCli) || !fs.existsSync(manifestPath)) {
  fail(`whisper-cli NOT BUILT at ${whisperCli} — run: ${catRow.build}`);
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const got = sha256(whisperCli);
  if (manifest.sha256 !== got) fail(`whisper-cli sha256 ${got} != whisper-build.json ${manifest.sha256}`);
  if (manifest.release !== catalog.release) fail(`whisper-build.json release ${manifest.release} != catalog ${catalog.release}`);
  const same = got === catRow.sha256 ? "= catalog" : `≠ catalog ${catRow.sha256.slice(0, 12)}… (rebuilt on another host; manifest wins)`;
  log(`whisper-cli built: ${whisperCli} sha256 ${got.slice(0, 12)}… ${same} · ${manifest.release} @ ${String(manifest.commit).slice(0, 10)}`);
}
if (flag("--no-mic")) {
  console.log(`STAGE10_MAC_STATIC_PASS dmg=${path.basename(dmg)} sha256=${dmgSha} whisper=${catRow && fs.existsSync(whisperCli) ? "built" : "NOT_BUILT"} arch=${arch}`);
  process.exit(0);
}
if (!catRow || !fs.existsSync(whisperCli)) fail("live mic gate needs the built whisper-cli");

// ---- 2. the packaged app, node-less PATH ------------------------------------
function newestApp() {
  const dir = path.join(outDir, process.arch === "arm64" ? "mac-arm64" : "mac");
  const app = path.join(dir, "LocalBot.app");
  return fs.existsSync(app) ? app : null;
}
const appBundle = path.resolve(opt("--app") ?? newestApp() ?? "");
if (!appBundle.endsWith(".app") || !fs.existsSync(appBundle)) fail(`no LocalBot.app (got ${appBundle}); run npm run build:desktop`);
const exe = path.join(appBundle, "Contents/MacOS/LocalBot");
const nodeBin = path.join(appBundle, "Contents/Resources/localbot-node/node");
if (!fs.existsSync(nodeBin)) fail(`no bundled Node at ${nodeBin}`);
const cs = spawnSync("codesign", ["-dvv", appBundle], { encoding: "utf8" });
const csOut = `${cs.stdout}\n${cs.stderr}`;
if (/Authority=Developer ID|Authority=Apple/.test(csOut)) fail("LocalBot.app carries a Developer ID / Apple signature — Stage 10 must be UNSIGNED");
const team = /TeamIdentifier=(.*)$/m.exec(csOut)?.[1]?.trim();
if (team && team !== "not set") fail(`LocalBot.app has TeamIdentifier=${team}`);
log("app", appBundle, "| bundled node", spawnSync(nodeBin, ["--version"], { encoding: "utf8" }).stdout.trim(), "| codesign:", /Signature=adhoc/.test(csOut) ? "ad-hoc only (Electron default), TeamIdentifier not set" : "no signature");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-prove-mac-"));
const cleanBin = path.join(tmp, "bin");
fs.mkdirSync(cleanBin);
const banned = /^(node|nodejs|npm|npx|corepack|electron)$/i;
for (const dir of ["/usr/bin", "/bin", "/usr/sbin", "/sbin"]) {
  if (!fs.existsSync(dir)) continue;
  for (const n of fs.readdirSync(dir)) {
    if (banned.test(n) || fs.existsSync(path.join(cleanBin, n))) continue;
    try {
      fs.symlinkSync(path.join(dir, n), path.join(cleanBin, n));
    } catch {
      /* dup */
    }
  }
}
if (spawnSync("/bin/sh", ["-c", "command -v node || command -v npm || command -v npx"], { env: { PATH: cleanBin } }).status === 0) fail("clean PATH still has node");

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
if (await up(SIDECAR_URL, 500)) fail(`${SIDECAR_URL} already answering — quit the other LocalBot first`);

const configPath = path.join(appData, "localbot-config.json");
const seeded = !fs.existsSync(configPath);
const work = path.join(tmp, "work");
if (seeded) {
  seedLocalBotData({
    dataDir: appData,
    folders: { employeeRoot: path.join(work, "employees/Sam"), employeeShared: null, departmentShared: path.join(work, "departments/Ops/shared"), companyShared: null },
    agents: [{ name: "Writer" }],
    idPrefix: "mac",
  });
  log("AppData had no localbot-config.json — seeded one agent (Writer) for this run; it is removed afterwards");
} else {
  log("AppData config exists at", configPath, "— using it as is");
}
const cleanup = [];
process.on("exit", () => {
  for (const fn of cleanup.reverse()) {
    try {
      fn();
    } catch {
      /* best effort */
    }
  }
  if (seeded) {
    fs.rmSync(configPath, { force: true });
    fs.rmSync(path.join(appData, "agents"), { recursive: true, force: true });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

// The fixture the mic must hear. prove:stt already pinned its sha256 in the catalog.
const wav = path.join(appData, "fixtures", "jfk.wav");
if (!fs.existsSync(wav) || sha256(wav) !== catalog.fixture.sha256) {
  fs.mkdirSync(path.dirname(wav), { recursive: true });
  const r = await fetch(catalog.fixture.url);
  if (!r.ok) fail(`fixture download ${r.status}`);
  fs.writeFileSync(wav, Buffer.from(await r.arrayBuffer()));
  if (sha256(wav) !== catalog.fixture.sha256) fail("fixture sha256 mismatch");
}
const expect = (opt("--expect") ?? JFK_PHRASE).toLowerCase();
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const { _electron } = await import("playwright");
const electronApp = await _electron.launch({
  executablePath: exe,
  args: [],
  env: { PATH: cleanBin, HOME: os.homedir(), LANG: process.env.LANG ?? "en_US.UTF-8", TMPDIR: process.env.TMPDIR ?? "/tmp" },
  timeout: 90000,
});
const aPid = electronApp.process().pid;
cleanup.push(() => {
  try {
    process.kill(aPid, "SIGKILL");
  } catch {
    /* gone */
  }
});
const page = await electronApp.firstWindow({ timeout: 90000 });
if (!(await up(SIDECAR_URL, 60000))) fail("packaged sidecar never answered on " + SIDECAR_URL);
const realAppData = await electronApp.evaluate(({ app }) => app.getPath("appData"));
if (path.join(realAppData, "LocalBot") !== appData) fail(`packaged app's AppData is ${realAppData}/LocalBot, expected ${appData}`);
log("packaged app up: pid", aPid, "| sidecar", SIDECAR_URL, "| AppData", path.join(realAppData, "LocalBot"));

// ---- 3. TCC: microphone access -----------------------------------------------
const tccWait = Number(opt("--tcc-wait") ?? 90) * 1000;
let mic = await electronApp.evaluate(({ systemPreferences }) => systemPreferences.getMediaAccessStatus("microphone"));
log("TCC microphone status before:", mic);
if (mic === "denied" || mic === "restricted") fail(`macOS TCC has microphone ${mic} for com.localbot.app — System Settings › Privacy & Security › Microphone`);

const agentName = seeded ? "Writer" : null;
if (agentName) {
  await page.getByText(agentName, { exact: true }).first().waitFor({ timeout: 60000 });
  await page.getByText(agentName, { exact: true }).first().click();
} else {
  // Existing config: open the first agent in the sidebar.
  await page.locator("nav a, aside a, [data-testid='agent-link']").first().click({ timeout: 60000 }).catch(() => {});
}
const box = page.getByPlaceholder(/Message /);
await box.waitFor({ timeout: 30000 });
const micBtn = page.getByTestId("mic-button");
await micBtn.waitFor({ timeout: 30000 });
const deadline = Date.now() + 30000;
while (Date.now() < deadline && (await micBtn.isDisabled())) await page.waitForTimeout(250);
if (await micBtn.isDisabled()) fail(`Mic button stays disabled: ${await micBtn.getAttribute("title")}`);
log("Mic button enabled:", await micBtn.getAttribute("title"));

if (mic === "not-determined") {
  // First getUserMedia raises the TCC prompt. A human clicks Allow; nothing here can.
  log(`TCC prompt will appear — waiting up to ${tccWait / 1000}s for Allow (NSMicrophoneUsageDescription shown)`);
  const ask = electronApp.evaluate(({ systemPreferences }) => systemPreferences.askForMediaAccess("microphone"));
  const t0 = Date.now();
  while (Date.now() - t0 < tccWait) {
    mic = await electronApp.evaluate(({ systemPreferences }) => systemPreferences.getMediaAccessStatus("microphone"));
    if (mic !== "not-determined") break;
    await page.waitForTimeout(500);
  }
  await Promise.race([ask, page.waitForTimeout(1000)]);
  if (mic !== "granted") fail(`TCC microphone status is ${mic} after ${tccWait / 1000}s — Gate C is UNVERIFIED until Allow is clicked`);
}
log("TCC microphone status:", mic);

// ---- 4. voice input with the real microphone ---------------------------------
// Stage 13: the default gesture is click-click (click to start, click to stop).
// The old press-and-hold is kept as a fallback and checked second.
const voiceState = () => micBtn.getAttribute("data-voice-state");
const voiceNote = async () => (await page.getByTestId("voice-note").textContent().catch(() => "")) ?? "";
const waitVoice = async (want, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await voiceState()) === want) return true;
    await page.waitForTimeout(100);
  }
  return false;
};
const waitTranscript = async (ms) => {
  const end = Date.now() + ms;
  let n = "";
  while (Date.now() < end) {
    n = await voiceNote();
    if ((await voiceState()) === "idle" && n) return n;
    await page.waitForTimeout(250);
  }
  return n;
};
const playFixture = async () => {
  log("listening — playing", path.basename(wav), "out of the default output so the default input hears it");
  const play = spawn("afplay", [wav], { stdio: "ignore" });
  await new Promise((r) => play.on("exit", r));
  await page.waitForTimeout(600);
};

// 4a. click-click (default)
await box.fill("");
const sentBefore = await page.locator("li[data-role='user']").count();
if ((await micBtn.getAttribute("data-voice-gesture")) !== "toggle") fail("mic-button is not a click-to-toggle control (data-voice-gesture)");
await micBtn.click();
if (!(await waitVoice("listening", 5000))) fail(`Mic did not enter listening after one click: ${(await voiceNote()) || "no note"}`);
await page.waitForTimeout(1500);
if ((await voiceState()) !== "listening") fail(`the mic stopped ${await voiceState()} after a single click — the control still requires a hold`);
const elapsedEarly = Number(await micBtn.getAttribute("data-elapsed-seconds"));
if (!(elapsedEarly >= 1)) fail(`the listening timer is not counting (data-elapsed-seconds=${elapsedEarly})`);
await playFixture();
await micBtn.click();
const note = await waitTranscript(60000);
const composer = await box.inputValue();
log("click-click voice note:", JSON.stringify(note));
log("composer:", JSON.stringify(composer));
let sent = (await page.locator("li[data-role='user']").count()) - sentBefore;
if (sent) fail(`click-to-toggle sent ${sent} message(s); the transcript must only land in the composer`);
if (!/Heard /.test(note)) fail(`no transcript after click-click: ${note || "no voice note"}`);
if (!norm(composer).includes(norm(expect))) fail(`composer "${composer}" does not contain "${expect}" — the mic did not hear the fixture (check speaker → mic path)`);
const heard = /Heard ([\d.]+) s · (\S+) · (\d+) ms/.exec(note);

// 4b. press-and-hold fallback
await box.fill("");
const bb = await micBtn.boundingBox();
if (!bb) fail("mic button has no bounding box");
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
await page.mouse.down();
if (!(await waitVoice("listening", 5000))) {
  await page.mouse.up();
  fail(`Mic did not enter listening on press: ${(await voiceNote()) || "no note"}`);
}
await playFixture();
await page.mouse.up();
const holdNote = await waitTranscript(60000);
const holdComposer = await box.inputValue();
log("hold voice note:", JSON.stringify(holdNote));
sent = (await page.locator("li[data-role='user']").count()) - sentBefore;
if (sent) fail(`hold-to-talk sent ${sent} message(s)`);
if (!/Heard /.test(holdNote)) fail(`hold fallback gave no transcript: ${holdNote || "no voice note"}`);
if (!norm(holdComposer).includes(norm(expect))) fail(`hold fallback composer "${holdComposer}" does not contain "${expect}"`);

// The sidecar transcribed with the built binary: the clip dir is empty again and whisper-cli was the one in AppData.
const clipDir = path.join(appData, "stt");
const leftover = fs.existsSync(clipDir) ? fs.readdirSync(clipDir) : [];
if (leftover.length) fail(`voice clip left behind: ${leftover.join(", ")}`);
log("clip deleted after transcription; Enter is still bound to send → runAgentTurn (static)");

console.log(
  `STAGE10_MAC_MIC_PASS tcc=${mic} gesture=click-click heard_s=${heard?.[1] ?? "?"} model=${heard?.[2] ?? "?"} ms=${heard?.[3] ?? "?"} text=${JSON.stringify(composer)} hold_fallback=WORKS whisper=${whisperCli} app=${appBundle} dmg_sha256=${dmgSha}`,
);
await electronApp.close().catch(() => {});
process.exit(0);
