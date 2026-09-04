#!/usr/bin/env node
/**
 * Stage 9 prove-it (run: `npm run prove:stt`).
 *
 * Runs the real sidecar path — `transcribeWav` from src/lib/runtime/stt.ts —
 * against whisper.cpp's own jfk.wav (the v1.9.2 sample, sha256-pinned in
 * catalog/whisper-assets.json), with whisper-cli and ggml-base.en.bin
 * downloaded + verified into a LocalBot data dir exactly as the app does on
 * first use. Fails when:
 *   - any runtime / model row in catalog/whisper-assets.json lacks a sha256
 *   - the fixture's sha256 does not match the pin
 *   - a non-WAV buffer is accepted, or a clip is written under a scope root
 *   - whisper-cli is spawned from anywhere but {dataDir}/bin/{target}/whisper/,
 *     or a llama-server sits in that folder
 *   - the WAV handed to whisper-cli does not exist at spawn time, is not under
 *     {dataDir}/stt/, or is still on disk afterwards
 *   - the spawn line is not `-m … -f … -l en -nt -np`
 *   - the transcript does not contain the pinned JFK phrase
 *   - chat.tsx dropped runAgentTurn, or the dsh / ACP pins float
 *
 * Usage:
 *   npm run prove:stt                          # data dir: $TMPDIR/localbot-prove-stt (reused, so the 148 MB model downloads once)
 *   npm run prove:stt -- --data-dir <dir>      # e.g. your real ~/.config/LocalBot to reuse its whisper install
 *   npm run prove:stt -- --wav <file.wav>      # another PCM16 mono 16 kHz clip; then --expect "<phrase>"
 *   npm run prove:stt -- --fresh                # delete the data dir first (re-downloads everything)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import childProcess from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const log = (...a) => console.log("[prove-stt]", ...a);
const fail = (msg) => {
  console.error("[prove-stt] FAIL:", msg);
  process.exit(1);
};
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
/** What whisper.cpp's jfk.wav says; the transcript must contain this (punctuation/case-insensitive). */
const JFK_PHRASE = "ask not what your country can do for you";

// ---- 0. static gates -------------------------------------------------------
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog/whisper-assets.json"), "utf8"));
const HEX = /^[0-9a-f]{64}$/;
if (catalog.fixture?.expectPhrase !== JFK_PHRASE) fail(`catalog fixture phrase drifted from "${JFK_PHRASE}"`);
for (const [t, row] of Object.entries(catalog.targets)) if (!HEX.test(row.sha256 ?? "")) fail(`catalog runtime row ${t} has no sha256`);
for (const [m, row] of Object.entries(catalog.models)) if (!HEX.test(row.sha256 ?? "")) fail(`catalog model row ${m} has no sha256`);
if (!HEX.test(catalog.fixture?.sha256 ?? "")) fail("catalog fixture has no sha256");
// Upstream ships no darwin CLI. A darwin row is allowed only as `kind: "built"` (Stage 10: compiled from the pinned tag) and must carry no URL.
for (const t of ["darwin-arm64", "darwin-x64"]) {
  const row = catalog.targets[t];
  if (!row) continue;
  if (row.kind !== "built") fail(`${t} row is kind ${row.kind}; upstream ships no darwin CLI, only a built row is honest`);
  if (row.url) fail(`${t} built row carries a URL (${row.url}); nothing may be invented`);
  if (row.source?.tag !== catalog.release) fail(`${t} built row is from ${row.source?.tag}, not ${catalog.release}`);
}
const chat = fs.readFileSync(path.join(root, "src/components/localbot/chat.tsx"), "utf8");
if (!/import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/.test(chat)) fail("chat.tsx dropped runAgentTurn");
const { DSH_PIN, ACP_SDK_PIN } = await import("../src/lib/harness/process.ts");
if (pkg.dependencies["@deepseek-ai/dsh"] !== DSH_PIN || !/^\d/.test(DSH_PIN)) fail("dsh pin floats");
if (pkg.dependencies["@agentclientprotocol/sdk"] !== ACP_SDK_PIN || !/^\d/.test(ACP_SDK_PIN)) fail("ACP pin floats");
log(`static gates ok: ${Object.keys(catalog.targets).length} runtime rows, ${Object.keys(catalog.models).length} model rows hashed | runAgentTurn kept | dsh ${DSH_PIN}`);

// ---- 1. data dir like the app's ----------------------------------------------
const dataDir = path.resolve(opt("--data-dir") ?? path.join(os.tmpdir(), "localbot-prove-stt"));
if (flag("--fresh")) fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });
process.env.LOCALBOT_DATA_DIR = dataDir;
process.env.LOCALBOT_ELECTRON = "1"; // bin/ and models/ directly under the data dir, as in the packaged app
const stt = await import("../src/lib/runtime/stt.ts");
const { LLAMA_RUNTIME_IDS } = await import("../src/lib/runtime/llama-platform.ts");

const target = stt.whisperTarget();
if (!target) fail(`${stt.whisperUnsupportedReason()} — this proof needs linux-x64, win32-x64, or a Mac with whisper-cli built (npm run build:whisper-mac)`);
const asset = stt.whisperRuntimeAsset(target);
const whisperDir = stt.whisperDir(target);
if (asset?.kind === "built" && !opt("--data-dir")) {
  // Built rows are never downloaded: a Mac proof points at the install the
  // build script wrote (Electron layout: ~/Library/Application Support/LocalBot).
  fail(`${target} is a built row; pass --data-dir <dir> whose bin/${target}/whisper/ holds the compiled whisper-cli (default install: ${path.join(os.homedir(), "Library/Application Support/LocalBot")})`);
}
const sttDir = stt.sttDir();
log(`data dir ${dataDir}`);
log(`whisper dir ${whisperDir}`);
log(`clip dir    ${sttDir}`);
if (path.basename(whisperDir) !== "whisper") fail(`whisper dir does not end in /whisper: ${whisperDir}`);
if (LLAMA_RUNTIME_IDS.includes(path.basename(path.dirname(whisperDir)))) fail(`whisper dir is inside a llama runtime dir: ${whisperDir}`);

// ---- 2. fixture -------------------------------------------------------------
let wavPath = opt("--wav");
const expectPhrase = opt("--expect") ?? JFK_PHRASE;
if (!wavPath) {
  wavPath = path.join(dataDir, "fixtures", catalog.fixture.filename);
  if (!fs.existsSync(wavPath) || sha256(wavPath) !== catalog.fixture.sha256) {
    fs.mkdirSync(path.dirname(wavPath), { recursive: true });
    log(`downloading fixture ${catalog.fixture.url}`);
    const res = await fetch(catalog.fixture.url, { redirect: "follow" });
    if (!res.ok) fail(`fixture download failed: HTTP ${res.status}`);
    fs.writeFileSync(wavPath, Buffer.from(await res.arrayBuffer()));
  }
  const got = sha256(wavPath);
  if (got !== catalog.fixture.sha256) fail(`fixture sha256 ${got} ≠ pinned ${catalog.fixture.sha256}`);
  log(`fixture ${catalog.fixture.filename} sha256 ok (${fs.statSync(wavPath).size} B)`);
}
const wavBytes = new Uint8Array(fs.readFileSync(wavPath));
const { validateSttWav } = await import("../src/lib/audio/wav.ts");
const shape = validateSttWav(wavBytes);
if (!shape.ok) fail(`fixture is not the accepted WAV shape: ${shape.error}`);
log(`fixture shape ok: PCM16 mono ${shape.info.sampleRate} Hz, ${shape.info.seconds.toFixed(2)} s`);

// ---- 3. runtime + model, downloaded and verified the way the app does --------
const t0 = Date.now();
const runtime = await stt.ensureWhisperRuntime();
if (!runtime.ok) fail(`runtime: ${runtime.error}`);
if (path.resolve(path.dirname(runtime.exe)) !== path.resolve(whisperDir)) fail(`whisper-cli landed in ${path.dirname(runtime.exe)}, not ${whisperDir}`);
for (const n of ["llama-server", "llama-server.exe", "whisper-server", "whisper-server.exe"]) {
  if (fs.existsSync(path.join(whisperDir, n))) fail(`${n} is in the whisper dir`);
}
if (asset?.kind === "built") {
  const built = stt.verifyBuiltWhisper(runtime.exe, asset);
  if (!built.ok) fail(`built whisper-cli failed its manifest check: ${built.error}`);
  log(
    `runtime ok (built from ${asset.source?.tag} @ ${asset.source?.commit.slice(0, 10)}): ${runtime.exe} sha256 ${built.sha256.slice(0, 12)}… ${built.matchesCatalog ? "= catalog" : "(this host's build; catalog has the author's)"} (${Date.now() - t0} ms)`,
  );
} else {
  const archive = path.join(path.dirname(path.dirname(whisperDir)), catalog.targets[target].filename);
  log(`runtime ok: ${runtime.exe} (${Date.now() - t0} ms; archive sha256 ${fs.existsSync(archive) ? sha256(archive).slice(0, 12) + "…" : "n/a"})`);
}
const t1 = Date.now();
const model = await stt.ensureWhisperModel();
if (!model.ok) fail(`model: ${model.error}`);
if (model.sha256 !== catalog.models[model.id].sha256) fail(`model sha256 ${model.sha256} ≠ catalog`);
log(`model ok: ${model.path} sha256 ${model.sha256.slice(0, 12)}… (${Date.now() - t1} ms)`);

// ---- 4. negative gates through the real entry point --------------------------
const notWav = await stt.transcribeWav(new TextEncoder().encode("this is not a wav file, it is a sentence of plain text long enough to pass"), {
  runtime: async () => runtime,
  model: async () => model,
  folders: null,
});
if (notWav.ok || notWav.code !== "BAD_WAV") fail(`non-WAV bytes were accepted: ${JSON.stringify(notWav)}`);
log(`non-WAV refused: ${notWav.error}`);
const scoped = await stt.transcribeWav(wavBytes, {
  runtime: async () => runtime,
  model: async () => model,
  folders: { employeeRoot: dataDir, employeeShared: null, departmentShared: null, companyShared: null },
});
if (scoped.ok || scoped.code !== "SCOPE") fail(`a scoped clip dir was accepted: ${JSON.stringify(scoped)}`);
log(`scoped clip dir refused: ${scoped.error.split(".")[0]}`);
if (fs.existsSync(sttDir) && fs.readdirSync(sttDir).length) fail(`clips left in ${sttDir} after refused calls`);

// ---- 5. the real run, instrumented at the spawn seam -------------------------
const seen = { exe: null, args: null, wavExistedAtSpawn: false, wavUnderSttDir: false, ldPath: null };
const spawn = (plan) => {
  seen.exe = plan.exe;
  seen.args = plan.args;
  seen.ldPath = plan.env.LD_LIBRARY_PATH ?? plan.env.PATH ?? null;
  const f = plan.args[plan.args.indexOf("-f") + 1];
  seen.wavExistedAtSpawn = Boolean(f) && fs.existsSync(f);
  const rel = f ? path.relative(sttDir, path.resolve(f)) : "..";
  seen.wavUnderSttDir = rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  return childProcess.spawn(plan.exe, plan.args, { cwd: plan.cwd, env: plan.env, stdio: ["ignore", "pipe", "pipe"] });
};
const t2 = Date.now();
const result = await stt.transcribeWav(wavBytes, { spawn, folders: null });
if (!seen.exe) fail("WAV_NEVER_REACHED: transcribeWav returned without spawning whisper-cli — the fixture never reached whisper-cli");
if (!seen.wavExistedAtSpawn) fail("WAV_NEVER_REACHED: the -f path did not exist when whisper-cli was spawned");
if (!seen.wavUnderSttDir) fail(`clip was not under ${sttDir}: ${seen.args?.join(" ")}`);
if (path.resolve(path.dirname(seen.exe)) !== path.resolve(whisperDir)) fail(`whisper-cli spawned from ${path.dirname(seen.exe)} — must be ${whisperDir}`);
if (path.basename(seen.exe) !== stt.whisperCliName()) fail(`spawned ${seen.exe}, not ${stt.whisperCliName()}`);
if (!String(seen.ldPath ?? "").split(process.platform === "win32" ? ";" : ":").includes(whisperDir)) fail(`library path does not start with the whisper dir: ${seen.ldPath}`);
const a = seen.args;
if (!(a[0] === "-m" && a[1] === model.path && a[2] === "-f" && a[4] === "-l" && a[5] === "en" && a[6] === "-nt" && a[7] === "-np" && a.length === 8)) {
  fail(`unexpected whisper-cli args: ${a.join(" ")}`);
}
if (!result.ok) fail(`transcribe: [${result.code}] ${result.error}`);
if (fs.existsSync(sttDir) && fs.readdirSync(sttDir).length) fail(`clip left on disk: ${fs.readdirSync(sttDir).join(", ")}`);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
if (!norm(result.text).includes(norm(expectPhrase))) fail(`transcript does not contain "${expectPhrase}": "${result.text}"`);
log(`whisper-cli ${seen.exe}`);
log(`args ${a.map((x) => (x.includes(dataDir) ? x.replace(dataDir, "{dataDir}") : x)).join(" ")}`);
log(`transcript (${result.ms} ms, model ${result.model}, ${result.seconds.toFixed(2)} s of audio): "${result.text}"`);
log(`clip deleted: ${sttDir} is ${fs.existsSync(sttDir) ? "empty" : "absent"}`);
console.log(
  `STAGE9_STT_PASS text=${JSON.stringify(result.text)} ms=${result.ms} model=${result.model} release=${stt.WHISPER_RELEASE} exe=${seen.exe} kind=${asset?.kind} total_ms=${Date.now() - t2}`,
);
