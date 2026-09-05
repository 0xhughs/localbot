/**
 * Stage 9 — hold-to-talk STT. These fail when: a catalog row has an empty
 * sha256 (or a darwin / GPU / whisper-server row appears); a non-WAV or a
 * wrong-shape WAV is accepted; a clip is written under a scope root; the clip
 * is left on disk after success, failure or timeout; whisper-cli is spawned
 * from a llama.cpp bin dir; the spawn line is not `-m -f -l en -nt -np`; two
 * jobs overlap; the transcript is logged; the renderer uses MediaRecorder /
 * ffmpeg; the voice path can send; `chat.tsx` drops `runAgentTurn`; the dsh /
 * ACP pins float; Electron grants media to another origin or grants video.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { mediaPermissionDecision, normalizeOrigin, SIDECAR_URL, DEV_UI_URL } from "../../../desktop/packaged.mjs";
import { ACP_SDK_PIN, DSH_PIN } from "../harness/process.ts";
import {
  STT_MAX_BYTES,
  STT_MAX_SECONDS,
  STT_SAMPLE_RATE,
  bytesToBase64,
  encodeWavPcm16Mono,
  floatTo16BitPCM,
  inspectWav,
  resampleLinear,
  validateSttWav,
} from "../audio/wav.ts";
import { LLAMA_RUNTIME_IDS } from "./llama-platform.ts";
import {
  GGML_MAGIC,
  STT_TIMEOUT_MS,
  WHISPER_BUILD_MANIFEST,
  WHISPER_DEFAULT_MODEL,
  WHISPER_RELEASE,
  WHISPER_TARGETS,
  __resetSttForTests,
  assertSttOutsideScopes,
  assertWhisperExe,
  cleanTranscript,
  sttDir,
  sttSupport,
  transcribeWav,
  verifyBuiltWhisper,
  verifyWhisperArchive,
  verifyWhisperModel,
  whisperDir,
  whisperModelAsset,
  whisperModelIds,
  whisperRuntimeAsset,
  whisperSpawnPlan,
  whisperTarget,
  whisperUnsupportedReason,
} from "./stt.ts";
import { appendTranscript, MIN_CLIP_SECONDS } from "../audio/voice-text.ts";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const pkg = JSON.parse(read("package.json"));
const catalog = JSON.parse(read("catalog/whisper-assets.json"));
const HEX64 = /^[0-9a-f]{64}$/;
const notWin = process.platform !== "win32";

/** A PCM WAV with the given shape; `extraChunk` inserts a LIST chunk between fmt and data like whisper.cpp's jfk.wav. */
function makeWav(opts: { seconds?: number; rate?: number; channels?: number; bits?: number; format?: number; extraChunk?: boolean } = {}): Uint8Array {
  const rate = opts.rate ?? STT_SAMPLE_RATE;
  const channels = opts.channels ?? 1;
  const bits = opts.bits ?? 16;
  const format = opts.format ?? 1;
  const frames = Math.round((opts.seconds ?? 1) * rate);
  const dataBytes = (frames * channels * bits) / 8;
  const extra = opts.extraChunk ? 8 + 26 : 0;
  const buf = Buffer.alloc(44 + extra + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + extra + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(format, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE((rate * channels * bits) / 8, 28);
  buf.writeUInt16LE((channels * bits) / 8, 32);
  buf.writeUInt16LE(bits, 34);
  let at = 36;
  if (opts.extraChunk) {
    buf.write("LIST", at);
    buf.writeUInt32LE(26, at + 4);
    buf.write("INFOISFT", at + 8);
    at += 8 + 26;
  }
  buf.write("data", at);
  buf.writeUInt32LE(dataBytes, at + 4);
  for (let i = 0; i < frames * channels && bits === 16; i++) buf.writeInt16LE(Math.round(Math.sin(i / 20) * 8000), at + 8 + i * 2);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

describe("Stage 9: catalog/whisper-assets.json", () => {
  it("pins whisper.cpp v1.9.2 with a real sha256 and size on every runtime and model row", () => {
    assert.equal(catalog.release, "v1.9.2");
    assert.equal(WHISPER_RELEASE, "v1.9.2");
    assert.deepEqual(Object.keys(catalog.targets).sort(), [...WHISPER_TARGETS].sort());
    for (const [target, row] of Object.entries(catalog.targets) as [string, Record<string, unknown>][]) {
      assert.match(String(row.sha256 ?? ""), HEX64, `${target} has no sha256`);
      assert.match(String(row.binary), /^whisper-cli(\.exe)?$/, "only whisper-cli, never whisper-server");
      if (row.kind === "built") {
        // Stage 10: compiled on the host from the pinned tag; nothing to download, so no URL may appear.
        assert.equal(row.url, undefined, `${target} is built; it must not carry a download URL`);
        assert.equal(row.filename, undefined);
        assert.ok(typeof row.sizeBytes === "number" && row.sizeBytes > 500_000, `${target} sizeBytes`);
        const source = row.source as { repo: string; tag: string; commit: string };
        assert.equal(source.repo, "https://github.com/ggml-org/whisper.cpp");
        assert.equal(source.tag, "v1.9.2");
        assert.match(source.commit, /^[0-9a-f]{40}$/);
        const cmake = row.cmake as string[];
        assert.ok(cmake.includes("-DWHISPER_BUILD_SERVER=OFF"), "built rows never build whisper-server");
        assert.ok(cmake.includes("-DBUILD_SHARED_LIBS=OFF"));
        assert.ok(cmake.includes("-DWHISPER_BUILD_EXAMPLES=ON"));
        assert.equal(row.build, "npm run build:whisper-mac");
        continue;
      }
      assert.ok(typeof row.sizeBytes === "number" && row.sizeBytes > 1_000_000, `${target} sizeBytes`);
      assert.match(String(row.url), /^https:\/\/github\.com\/ggml-org\/whisper\.cpp\/releases\/download\/v1\.9\.2\//);
      assert.equal(/cublas|cuda|blas|vulkan|metal/i.test(String(row.filename)), false, `${target} is a GPU/BLAS row`);
    }
    for (const [id, row] of Object.entries(catalog.models) as [string, Record<string, unknown>][]) {
      assert.match(String(row.sha256 ?? ""), HEX64, `model ${id} has no sha256`);
      assert.ok(typeof row.sizeBytes === "number" && row.sizeBytes > 10_000_000, `model ${id} sizeBytes`);
      assert.match(String(row.url), /^https:\/\/huggingface\.co\/ggerganov\/whisper\.cpp\/resolve\/main\/ggml-[a-z.]+\.bin$/);
      assert.match(String(row.filename), /\.en\.bin$/, "english-only models this stage");
    }
    assert.equal(catalog.defaultModel, "base.en");
    assert.equal(WHISPER_DEFAULT_MODEL, "base.en");
    assert.ok(whisperModelIds().includes("base.en"));
    assert.match(catalog.fixture.sha256, HEX64);
    assert.match(catalog.fixture.url, /whisper\.cpp\/raw\/v1\.9\.2\/samples\/jfk\.wav$/);
  });

  it("the exact hashes from the 2026-09-04 downloads", () => {
    assert.equal(whisperRuntimeAsset("linux-x64")?.sha256, "46811a3ecf584307480a220b9ef5ff81b7b22dc41577cbc274ce3afc61f753b1");
    assert.equal(whisperRuntimeAsset("linux-x64")?.sizeBytes, 9497583);
    assert.equal(whisperRuntimeAsset("win32-x64")?.sha256, "49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a");
    assert.equal(whisperRuntimeAsset("win32-x64")?.sizeBytes, 8194445);
    assert.equal(whisperModelAsset("base.en")?.sha256, "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002");
    assert.equal(whisperModelAsset("base.en")?.sizeBytes, 147964211);
    assert.equal(whisperModelAsset("tiny.en")?.sha256, "921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f");
  });

  it("darwin-arm64 is a built row (Stage 10): no URL, pinned tag + commit; darwin-x64 stays NOT BUILT with an honest reason", () => {
    const mac = whisperRuntimeAsset("darwin-arm64");
    assert.ok(mac, "darwin-arm64 row missing");
    assert.equal(mac?.kind, "built");
    assert.equal(mac?.url, null);
    assert.equal(mac?.source?.tag, "v1.9.2");
    assert.equal(mac?.source?.commit, "306c88f4d1286aec1bf96e544632897886af5501");
    assert.equal(mac?.sha256, "fbd2a54cf4835af4ee45b26515a21fa97add9599601d0f6ca7acddfe2cd21f6e");
    assert.equal(mac?.sizeBytes, 3275928);
    assert.ok(mac?.cmake.includes("-DGGML_METAL=ON"), "Apple Silicon build is the Metal build");
    assert.equal(mac?.build, "npm run build:whisper-mac");
    assert.equal(whisperTarget("darwin", "arm64"), "darwin-arm64");
    assert.equal(whisperTarget("darwin", "aarch64"), "darwin-arm64");
    assert.equal(whisperUnsupportedReason("darwin", "arm64"), null);

    assert.equal(catalog.targets["darwin-x64"], undefined);
    assert.equal(whisperTarget("darwin", "x64"), null);
    assert.match(whisperUnsupportedReason("darwin", "x64") ?? "", /NOT BUILT for macOS x64/);
    assert.match(whisperUnsupportedReason("darwin", "x64") ?? "", /xcframework/);
    assert.match(whisperUnsupportedReason("darwin", "x64") ?? "", /build:whisper-mac/);
    assert.equal(whisperRuntimeAsset(null), null);
    assert.equal(whisperTarget("linux", "x64"), "linux-x64");
    assert.equal(whisperTarget("win32", "x64"), "win32-x64");
    assert.equal(whisperTarget("linux", "arm64"), null);
    assert.equal(whisperUnsupportedReason("linux", "x64"), null);
    // Still no invented darwin download: the only URLs in the file are the linux/win archives and the HF models.
    const urls = [...read("catalog/whisper-assets.json").matchAll(/"url":\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.equal(urls.some((u) => /macos|darwin|arm64/i.test(u)), false, `a darwin URL appeared: ${urls.join(", ")}`);
    assert.equal(urls.length, 5, "two archive rows + two model rows + the jfk.wav fixture");
  });

  it("Stage 10: a built row is verified against its whisper-build.json, never downloaded, and is NOT BUILT until it exists", () => {
    const asset = whisperRuntimeAsset("darwin-arm64")!;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-stt-built-"));
    const dir = path.join(tmp, "bin/darwin-arm64/whisper");
    const exe = path.join(dir, "whisper-cli");

    const missing = verifyBuiltWhisper(exe, asset);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.match(missing.error, /NOT BUILT on this Mac yet.*build:whisper-mac/);
    assert.deepEqual(sttSupport({ target: "darwin-arm64", asset, dir, builtOk: false, builtError: missing.ok ? null : missing.error }), {
      supported: false,
      reason: missing.ok ? null : missing.error,
    });

    fs.mkdirSync(dir, { recursive: true });
    const body = Buffer.from("#!/bin/sh\nprintf ' hello'\n");
    fs.writeFileSync(exe, body, { mode: 0o755 });
    const noManifest = verifyBuiltWhisper(exe, asset);
    assert.equal(noManifest.ok, false);
    if (!noManifest.ok) assert.match(noManifest.error, new RegExp(WHISPER_BUILD_MANIFEST));

    const sha = crypto.createHash("sha256").update(body).digest("hex");
    const manifest = { release: "v1.9.2", commit: asset.source!.commit, target: "darwin-arm64", binary: "whisper-cli", sha256: sha, sizeBytes: body.length, cmake: asset.cmake, dylibs: [] };
    const write = (m: unknown) => fs.writeFileSync(path.join(dir, WHISPER_BUILD_MANIFEST), JSON.stringify(m));
    write(manifest);
    const ok = verifyBuiltWhisper(exe, asset);
    assert.equal(ok.ok, true, JSON.stringify(ok));
    if (ok.ok) {
      assert.equal(ok.sha256, sha);
      assert.equal(ok.matchesCatalog, false, "a different build is valid but is not the catalog's binary");
    }
    assert.deepEqual(sttSupport({ target: "darwin-arm64", asset, dir, builtOk: true, builtError: null }), { supported: true, reason: null });

    write({ ...manifest, release: "v1.9.3" });
    assert.match((verifyBuiltWhisper(exe, asset) as { error: string }).error, /says whisper\.cpp v1\.9\.3/);
    write({ ...manifest, commit: "0".repeat(40) });
    assert.match((verifyBuiltWhisper(exe, asset) as { error: string }).error, /not the pinned/);
    write({ ...manifest, target: "darwin-x64" });
    assert.match((verifyBuiltWhisper(exe, asset) as { error: string }).error, /built for darwin-x64/);
    write({ ...manifest, sha256: "0".repeat(64) });
    assert.match((verifyBuiltWhisper(exe, asset) as { error: string }).error, /sha256 .* ≠ whisper-build\.json/);
    write(manifest);
    fs.appendFileSync(exe, "\n# tampered\n");
    assert.match((verifyBuiltWhisper(exe, asset) as { error: string }).error, /binary changed since it was built/);

    // Archive verification refuses a built row outright — there is no archive.
    assert.match((verifyWhisperArchive(path.join(tmp, "x.tar.gz"), asset) as { error: string }).error, /built row/);
    // The download path in stt.ts is never reached for built rows.
    const src = read("src/lib/runtime/stt.ts");
    assert.match(src, /if \(asset\.kind === "built"\) \{\s*const v = verifyBuiltWhisper\(exe, asset\);/);
    assert.equal(sttSupport({ target: null, asset: null, dir, builtOk: false, builtError: null, platform: "darwin", arch: "x64" }).supported, false);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("Stage 10: the mac build script pins the same flags as the catalog and installs only into …/whisper/", async () => {
    const mod = await import("../../../scripts/build-whisper-mac.mjs");
    assert.deepEqual(mod.whisperCmakeFlags("arm64"), catalog.targets["darwin-arm64"].cmake);
    assert.ok(mod.whisperCmakeFlags("x64").includes("-DGGML_METAL=OFF"), "Intel Mac gets a CPU build");
    assert.equal(mod.macWhisperTarget("arm64"), "darwin-arm64");
    assert.equal(mod.macWhisperTarget("x64"), "darwin-x64");
    assert.equal(mod.defaultMacBinRoot("/Users/sam"), "/Users/sam/Library/Application Support/LocalBot/bin");
    assert.equal(mod.WHISPER_REPO, catalog.targets["darwin-arm64"].source.repo);
    assert.deepEqual(mod.foreignDylibs("x:\n\t/usr/lib/libc++.1.dylib (compatibility version 1.0.0)\n\t/System/Library/Frameworks/Metal.framework/Versions/A/Metal (x)\n\t@rpath/libggml.dylib (y)"), ["@rpath/libggml.dylib"]);
    const src = read("scripts/build-whisper-mac.mjs");
    assert.match(src, /path\.join\(binRoot, target, "whisper"\)/);
    assert.match(src, /whisper-build\.json/);
    assert.equal(src.includes("releases/download"), false, "the build script never downloads a darwin CLI");
    assert.match(src, /--target", "whisper-cli"/);
    assert.match(pkg.scripts["build:whisper-mac"] ?? "", /scripts\/build-whisper-mac\.mjs/);
  });
});

describe("Stage 9: WAV gate", () => {
  it("accepts PCM16 mono 16 kHz, with or without a LIST chunk before data", () => {
    const plain = validateSttWav(makeWav({ seconds: 1.5 }));
    assert.equal(plain.ok, true);
    if (plain.ok) {
      assert.equal(plain.info.sampleRate, 16000);
      assert.equal(plain.info.channels, 1);
      assert.equal(plain.info.bitsPerSample, 16);
      assert.ok(Math.abs(plain.info.seconds - 1.5) < 0.001);
      assert.equal(plain.info.dataOffset, 44);
    }
    const list = validateSttWav(makeWav({ seconds: 1, extraChunk: true }));
    assert.equal(list.ok, true);
    if (list.ok) assert.equal(list.info.dataOffset, 44 + 34);
  });

  it("refuses non-WAV bytes and every wrong shape, before anything touches disk", () => {
    const cases: [string, Uint8Array, RegExp][] = [
      ["text", new TextEncoder().encode("hello, this is definitely not a wav file at all, just some text bytes here"), /Not a WAV/],
      ["short", new Uint8Array(10), /too short/],
      ["webm", new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...new Array(60).fill(0)]), /RIFF/],
      ["stereo", makeWav({ channels: 2 }), /mono/],
      ["44.1k", makeWav({ rate: 44100 }), /16000 Hz/],
      ["8-bit", makeWav({ bits: 8 }), /16-bit/],
      ["float", makeWav({ format: 3 }), /not PCM/],
      ["61 s", makeWav({ seconds: 61 }), /limit is 60 s|limit is 2/],
    ];
    for (const [name, bytes, re] of cases) {
      const r = validateSttWav(bytes);
      assert.equal(r.ok, false, `${name} was accepted`);
      if (!r.ok) assert.match(r.error, re, name);
    }
    const big = new Uint8Array(STT_MAX_BYTES + 1);
    const r = validateSttWav(big);
    assert.equal(r.ok, false);
    assert.equal(STT_MAX_SECONDS, 60);
    assert.equal(STT_MAX_BYTES, 2 * 1024 * 1024);
    // A header that claims data but has none.
    const empty = makeWav({ seconds: 0 });
    assert.equal(validateSttWav(empty).ok, false);
  });

  it("the renderer encoder round-trips through the sidecar parser", () => {
    const f32 = new Float32Array(16000);
    for (let i = 0; i < f32.length; i++) f32[i] = Math.sin(i / 10) * 0.5;
    const pcm = floatTo16BitPCM(f32);
    assert.equal(pcm.length, 16000);
    const wav = encodeWavPcm16Mono(pcm);
    assert.equal(wav.byteLength, 44 + 32000);
    const r = inspectWav(wav);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.info.seconds, 1);
    assert.equal(validateSttWav(wav).ok, true);
    const down = resampleLinear(new Float32Array(48000), 48000, 16000);
    assert.equal(down.length, 16000);
    assert.equal(resampleLinear(f32, 16000, 16000), f32);
    assert.equal(floatTo16BitPCM(new Float32Array([2, -2]))[0], 0x7fff);
    assert.equal(floatTo16BitPCM(new Float32Array([2, -2]))[1], -0x8000);
    assert.equal(Buffer.from(bytesToBase64(wav.subarray(0, 4)), "base64").toString(), "RIFF");
  });
});

describe("Stage 9: paths and the whisper/llama separation", () => {
  it("whisper lives in bin/{target}/whisper/, a sibling of the llama runtime dirs; clips in {dataDir}/stt", () => {
    const d = whisperDir("linux-x64");
    assert.equal(path.basename(d), "whisper");
    assert.equal(path.basename(path.dirname(d)), "linux-x64");
    assert.equal(path.basename(path.dirname(path.dirname(d))), "bin");
    for (const rt of LLAMA_RUNTIME_IDS) assert.equal(d.includes(`${path.sep}${rt}${path.sep}`), false, rt);
    assert.equal(path.basename(sttDir()), "stt");
    assert.equal(catalog.notes.includes("bin/{target}/whisper/"), true);
  });

  it("assertWhisperExe refuses the llama bin dir, a runtime dir, and any folder holding llama-server", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-stt-"));
    for (const rt of LLAMA_RUNTIME_IDS) {
      assert.throws(() => assertWhisperExe(path.join(tmp, "bin/linux-x64", rt, "whisper-cli")), /whisper\/ folder/);
    }
    assert.throws(() => assertWhisperExe(path.join(tmp, "bin/linux-x64/cpu/whisper/whisper-cli")), /llama\.cpp runtime dir/);
    const shared = path.join(tmp, "bin/linux-x64/whisper");
    fs.mkdirSync(shared, { recursive: true });
    fs.writeFileSync(path.join(shared, "llama-server"), "");
    assert.throws(() => assertWhisperExe(path.join(shared, "whisper-cli")), /also holds llama-server/);
    fs.rmSync(path.join(shared, "llama-server"));
    assert.doesNotThrow(() => assertWhisperExe(path.join(shared, "whisper-cli")));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("assertSttOutsideScopes throws when {dataDir}/stt is under any of the four roots", () => {
    const base = path.join(os.tmpdir(), "lb-stt-scope");
    const dir = path.join(base, "data", "stt");
    const ok = { employeeRoot: path.join(base, "work"), employeeShared: null, departmentShared: path.join(base, "dept"), companyShared: null };
    assert.doesNotThrow(() => assertSttOutsideScopes(ok, dir));
    assert.doesNotThrow(() => assertSttOutsideScopes(null, dir));
    for (const key of ["employeeRoot", "employeeShared", "departmentShared", "companyShared"] as const) {
      assert.throws(() => assertSttOutsideScopes({ ...ok, [key]: path.join(base, "data") }, dir), /Refusing to write voice clips/, key);
      assert.throws(() => assertSttOutsideScopes({ ...ok, [key]: base }, dir), /Refusing/, `${key} ancestor`);
    }
  });

  it("the spawn plan is exactly whisper-cli -m -f -l en -nt -np with LD_LIBRARY_PATH = the whisper dir", () => {
    const exe = "/x/bin/linux-x64/whisper/whisper-cli";
    const p = whisperSpawnPlan({ exe, model: "/m/ggml-base.en.bin", wav: "/d/stt/a.wav", platform: "linux", baseEnv: { LD_LIBRARY_PATH: "/usr/lib" } });
    assert.deepEqual(p.args, ["-m", "/m/ggml-base.en.bin", "-f", "/d/stt/a.wav", "-l", "en", "-nt", "-np"]);
    assert.equal(p.env.LD_LIBRARY_PATH, "/x/bin/linux-x64/whisper:/usr/lib");
    assert.equal(p.cwd, "/x/bin/linux-x64/whisper");
    assert.equal(p.exe, exe);
    assert.equal(p.args.includes("--host"), false);
    assert.equal(p.args.includes("--port"), false);
    const w = whisperSpawnPlan({ exe: "C:\\d\\bin\\win32-x64\\whisper\\whisper-cli.exe", model: "m", wav: "w", platform: "win32", baseEnv: { PATH: "C:\\Windows" } });
    assert.ok(String(w.env.PATH).startsWith(path.dirname("C:\\d\\bin\\win32-x64\\whisper\\whisper-cli.exe")));
    assert.equal(STT_TIMEOUT_MS, 60_000);
  });

  it("the model gate is size + ggml magic + sha256, never verifyGgufFile", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-stt-model-"));
    const body = Buffer.concat([GGML_MAGIC, Buffer.from("tiny fake whisper weights")]);
    const file = path.join(tmp, "ggml-fake.bin");
    fs.writeFileSync(file, body);
    const sha = crypto.createHash("sha256").update(body).digest("hex");
    const asset = { id: "fake", label: "fake", filename: "ggml-fake.bin", sizeBytes: body.length, sha256: sha, ramGb: 0, url: "" };
    assert.equal(verifyWhisperModel(file, asset).ok, true);
    assert.match((verifyWhisperModel(file, { ...asset, sizeBytes: body.length + 1 }) as { error: string }).error, /size/);
    assert.match((verifyWhisperModel(file, { ...asset, sha256: "0".repeat(64) }) as { error: string }).error, /sha256 mismatch/);
    assert.match((verifyWhisperModel(file, { ...asset, sha256: "" }) as { error: string }).error, /no sha256; refusing/);
    fs.writeFileSync(file, Buffer.concat([Buffer.from("GGUF"), body.subarray(4)]));
    assert.match((verifyWhisperModel(file, asset) as { error: string }).error, /not a ggml model/);
    assert.equal(read("src/lib/runtime/stt.ts").includes("verifyGgufFile"), true, "the comment names the thing it must not call");
    assert.equal(/import[^;]*verifyGgufFile/.test(read("src/lib/runtime/stt.ts")), false);
    assert.equal(/verifyGgufFile\(/.test(read("src/lib/runtime/stt.ts")), false);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe("Stage 9: transcribeWav with a fake whisper-cli", { skip: !notWin }, () => {
  let tmp: string;
  let whisper: string;
  let record: string;
  let exe: string;
  const folders = () => ({ employeeRoot: path.join(tmp, "work"), employeeShared: null, departmentShared: null, companyShared: null });

  function fakeCli(dir: string, body: string): string {
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, "whisper-cli");
    fs.writeFileSync(f, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    return f;
  }

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lb-stt-run-"));
    whisper = path.join(tmp, "bin/linux-x64/whisper");
    record = path.join(tmp, "record.txt");
    exe = fakeCli(
      whisper,
      [
        'wav=""; prev=""',
        'for a in "$@"; do if [ "$prev" = "-f" ]; then wav="$a"; fi; prev="$a"; done',
        `printf '%s\\n' "$*" > ${JSON.stringify(record)}`,
        `[ -f "$wav" ] && echo "WAV_EXISTS $wav" >> ${JSON.stringify(record)} || { echo "WAV_MISSING $wav" >> ${JSON.stringify(record)}; exit 3; }`,
        `echo "LD=$LD_LIBRARY_PATH" >> ${JSON.stringify(record)}`,
        "printf '\\n [BLANK_AUDIO] And so my fellow Americans, ask not.'",
      ].join("\n"),
    );
  });
  beforeEach(() => {
    __resetSttForTests();
    fs.rmSync(record, { force: true });
  });
  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const deps = (over: Record<string, unknown> = {}) => ({
    runtime: async () => ({ ok: true as const, exe, dir: whisper, target: "linux-x64" as const }),
    model: async () => ({ ok: true as const, path: path.join(tmp, "ggml-base.en.bin"), id: "base.en", sha256: "x" }),
    folders: folders(),
    scratchDir: path.join(tmp, "data/stt"),
    ...over,
  });

  it("writes the clip under stt/, whisper-cli sees it, the transcript comes back, the clip is gone", async () => {
    const r = await transcribeWav(makeWav({ seconds: 1 }), deps());
    assert.equal(r.ok, true, JSON.stringify(r));
    if (r.ok) {
      assert.equal(r.text, "And so my fellow Americans, ask not.");
      assert.equal(r.model, "base.en");
      assert.ok(r.ms >= 0);
      assert.equal(r.seconds, 1);
    }
    const rec = fs.readFileSync(record, "utf8");
    assert.match(rec, /^-m .*ggml-base\.en\.bin -f .*\/data\/stt\/[0-9a-f-]{36}\.wav -l en -nt -np$/m);
    assert.match(rec, /^WAV_EXISTS /m, "whisper-cli must find the wav while it runs");
    assert.match(rec, new RegExp(`^LD=${whisper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m"));
    assert.deepEqual(fs.readdirSync(path.join(tmp, "data/stt")), [], "the wav must be deleted in finally");
  });

  it("refuses non-WAV bytes before any file is written or process spawned", async () => {
    const scratch = path.join(tmp, "never/stt");
    const r = await transcribeWav(new TextEncoder().encode("not audio, just a string of characters long enough to pass the length check"), deps({ scratchDir: scratch }));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "BAD_WAV");
    assert.equal(fs.existsSync(scratch), false);
    assert.equal(fs.existsSync(record), false, "whisper-cli must not have run");
  });

  it("refuses a scoped scratch dir and never writes there", async () => {
    const scratch = path.join(tmp, "work/stt");
    const r = await transcribeWav(makeWav(), deps({ scratchDir: scratch }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "SCOPE");
      assert.match(r.error, /Refusing to write voice clips under a scope folder/);
    }
    assert.equal(fs.existsSync(scratch), false);
    assert.equal(fs.existsSync(record), false);
  });

  it("refuses to spawn whisper-cli from the llama bin dir even when the runtime resolver points there", async () => {
    const wrong = fakeCli(path.join(tmp, "bin/linux-x64/cpu"), "echo should-not-run > " + JSON.stringify(record));
    const r = await transcribeWav(makeWav(), deps({ runtime: async () => ({ ok: true as const, exe: wrong, dir: path.dirname(wrong), target: "linux-x64" as const }) }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "RUNTIME");
      assert.match(r.error, /whisper\/ folder/);
    }
    assert.equal(fs.existsSync(record), false);
    assert.deepEqual(fs.existsSync(path.join(tmp, "data/stt")) ? fs.readdirSync(path.join(tmp, "data/stt")) : [], []);
  });

  it("a failing whisper-cli still leaves no clip behind and reports the exit code", async () => {
    const bad = fakeCli(path.join(tmp, "bad/bin/linux-x64/whisper"), "echo boom >&2; exit 7");
    const r = await transcribeWav(makeWav(), deps({ runtime: async () => ({ ok: true as const, exe: bad, dir: path.dirname(bad), target: "linux-x64" as const }) }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "FAILED");
      assert.match(r.error, /exited with 7/);
      assert.match(r.error, /boom/);
    }
    assert.deepEqual(fs.readdirSync(path.join(tmp, "data/stt")), []);
  });

  it("a hung whisper-cli is SIGKILLed at the timeout and the clip is deleted", async () => {
    const hang = fakeCli(path.join(tmp, "hang/bin/linux-x64/whisper"), "exec sleep 30");
    const t0 = Date.now();
    const r = await transcribeWav(makeWav(), deps({ timeoutMs: 400, runtime: async () => ({ ok: true as const, exe: hang, dir: path.dirname(hang), target: "linux-x64" as const }) }));
    assert.ok(Date.now() - t0 < 5000, "timeout did not fire");
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "TIMEOUT");
      assert.match(r.error, /killed/);
    }
    assert.deepEqual(fs.readdirSync(path.join(tmp, "data/stt")), []);
  });

  it("one job at a time: an overlapping call is refused with BUSY, then the flag clears", async () => {
    const slow = fakeCli(path.join(tmp, "slow/bin/linux-x64/whisper"), "sleep 0.5; printf 'ok'");
    const d = deps({ runtime: async () => ({ ok: true as const, exe: slow, dir: path.dirname(slow), target: "linux-x64" as const }) });
    const first = transcribeWav(makeWav(), d);
    await new Promise((r) => setTimeout(r, 50));
    const second = await transcribeWav(makeWav(), d);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.code, "BUSY");
    const r1 = await first;
    assert.equal(r1.ok, true);
    const third = await transcribeWav(makeWav(), d);
    assert.equal(third.ok, true);
    assert.deepEqual(fs.readdirSync(path.join(tmp, "data/stt")), []);
  });

  it("a failing model or runtime resolver is a typed error, and the flag clears", async () => {
    const r = await transcribeWav(makeWav(), deps({ model: async () => ({ ok: false as const, error: "catalog row has no sha256" }) }));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "MODEL");
    const r2 = await transcribeWav(makeWav(), deps({ runtime: async () => ({ ok: false as const, error: "NOT BUILT" }) }));
    assert.equal(r2.ok, false);
    if (!r2.ok) assert.equal(r2.code, "RUNTIME");
    const ok = await transcribeWav(makeWav(), deps());
    assert.equal(ok.ok, true);
  });

  it("cleanTranscript drops whisper's blank-audio markers and squeezes whitespace", () => {
    assert.equal(cleanTranscript("\n [BLANK_AUDIO]  hello   world \n"), "hello world");
    assert.equal(cleanTranscript("[BLANK_AUDIO]"), "");
    assert.equal(cleanTranscript(" (silence) "), "");
  });
});

describe("Stage 9: source invariants", () => {
  const stt = read("src/lib/runtime/stt.ts");
  const mic = read("src/lib/audio/mic-capture.ts");
  const wav = read("src/lib/audio/wav.ts");
  const hook = read("src/components/localbot/use-voice-input.ts");
  const chat = read("src/components/localbot/chat.tsx");
  const main = read("desktop/main.mjs");

  it("the sidecar never logs the transcript, never calls dsh, never starts whisper-server", () => {
    assert.equal(stt.includes("console.log"), false, "stt.ts must not log");
    assert.equal(stt.includes("console.error"), false);
    assert.equal(/from "\.\.\/harness|@deepseek-ai\/dsh|HarnessProcess|runAgentTurn/.test(stt), false);
    assert.equal(/spawn\([^)]*whisper-server/.test(stt), false);
    assert.equal(stt.includes('"-nt", "-np"'), true);
    assert.equal(stt.includes("SIGKILL"), true);
    assert.equal(stt.includes("finally"), true);
    assert.equal(/fs\.rmSync\(wavPath/.test(stt), true);
  });

  it("the renderer builds the WAV itself: no MediaRecorder, no ffmpeg, no upload URL", () => {
    const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const src of [mic, wav, hook].map(code)) {
      assert.equal(src.includes("MediaRecorder"), false);
      assert.equal(/ffmpeg/i.test(src), false);
      assert.equal(/https?:\/\/(?!127\.0\.0\.1|localhost)/.test(src), false, "no remote URL");
    }
    assert.match(mic, /getUserMedia\(\{\s*audio:/);
    assert.match(mic, /video: false/);
    assert.match(mic, /sampleRate: STT_SAMPLE_RATE/);
  });

  it("the voice path never sends: the hook has no send()/runAgentTurn, chat.tsx still imports runAgentTurn", () => {
    assert.equal(/\bsend\(/.test(hook), false);
    assert.equal(hook.includes("runAgentTurn"), false);
    assert.equal(hook.includes("appendMessage"), false);
    assert.match(chat, /import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/);
    assert.match(chat, /useVoiceInput\(\{/);
    // Stage 13: the control is click-to-toggle (aria-label follows the state); hold is only a fallback.
    assert.match(chat, /aria-label=\{micAriaLabel\(voice\.state\)\}/);
    assert.equal(/aria-label="Hold to talk"/.test(chat), false, "the Mic is no longer a hold-only control");
    assert.match(chat, /data-voice-gesture="toggle"/);
    assert.match(chat, /onPointerDown=/);
    assert.match(chat, /onPointerUp=/);
    assert.match(chat, /appendTranscript\(cur, text\)/);
    // The onText callback only touches the composer.
    const onText = chat.slice(chat.indexOf("onText: (text) =>"), chat.indexOf("},", chat.indexOf("onText: (text) =>")));
    assert.equal(/\bsend\(|runAgentTurn|appendMessage/.test(onText), false, onText);
    assert.equal(appendTranscript("", "  hello  "), "hello");
    assert.equal(appendTranscript("draft ", "more"), "draft more");
    assert.equal(appendTranscript("draft", ""), "draft");
    assert.equal(MIN_CLIP_SECONDS, 0.4);
    // Still the Stage 4–8 truths.
    const model = read("src/lib/fs/scope-model.ts");
    for (const s of ["private", "employee-shared", "department-shared", "company-shared"]) assert.ok(model.includes(`"${s}"`), s);
  });

  it("dsh / ACP pins are exact and unchanged", () => {
    assert.equal(pkg.dependencies["@deepseek-ai/dsh"], DSH_PIN);
    assert.equal(pkg.dependencies["@agentclientprotocol/sdk"], ACP_SDK_PIN);
    assert.equal(DSH_PIN, "0.1.2-alpha.5");
    assert.equal(ACP_SDK_PIN, "1.4.0");
    assert.equal(read("dsh/localbot-acp.cordis.yml").includes("whisper"), false, "the Cordis overlay is untouched");
  });

  it("Electron grants media (audio only) to the UI origin and denies everyone else; mac has the usage string", () => {
    const sidecar = normalizeOrigin(SIDECAR_URL);
    assert.equal(sidecar, "http://127.0.0.1:18790");
    assert.equal(normalizeOrigin(DEV_UI_URL), "http://127.0.0.1:8080");
    const allowed = [sidecar];
    const dec = (permission: string, requestingOrigin: string, details?: { mediaTypes?: string[]; mediaType?: string }) =>
      mediaPermissionDecision({ permission, requestingOrigin, allowedOrigins: allowed, details });
    assert.equal(dec("media", "http://127.0.0.1:18790/", { mediaTypes: ["audio"] }), true);
    assert.equal(dec("media", "http://127.0.0.1:18790", { mediaType: "audio" }), true);
    assert.equal(dec("media", "http://127.0.0.1:18790/", { mediaTypes: ["video"] }), false);
    assert.equal(dec("media", "http://127.0.0.1:18790/", { mediaTypes: ["audio", "video"] }), false);
    assert.equal(dec("media", "http://127.0.0.1:18790/", { mediaTypes: [] }), false);
    assert.equal(dec("media", "http://127.0.0.1:18790/", undefined), false);
    assert.equal(dec("media", "http://127.0.0.1:8080/", { mediaTypes: ["audio"] }), false, "dev origin is not allowed when packaged");
    assert.equal(dec("media", "https://evil.example/", { mediaTypes: ["audio"] }), false);
    assert.equal(dec("media", "", { mediaTypes: ["audio"] }), false);
    assert.equal(dec("videoCapture", "http://127.0.0.1:18790/"), false);
    assert.equal(dec("notifications", "https://evil.example/"), false);
    assert.equal(dec("notifications", "http://127.0.0.1:18790/"), true, "non-media for our own origin keeps today's behaviour");
    assert.equal(mediaPermissionDecision({ permission: "media", requestingOrigin: "http://127.0.0.1:8080/", allowedOrigins: ["http://127.0.0.1:8080"], details: { mediaTypes: ["audio"] } }), true);

    assert.match(main, /setPermissionRequestHandler\(/);
    assert.match(main, /setPermissionCheckHandler\(/);
    assert.match(main, /mediaPermissionDecision\(\{/);
    assert.match(main, /installPermissionHandlers\(uiUrl\)/);
    assert.match(main, /packaged\(\) \? SIDECAR_URL : uiUrl/);
    assert.equal(main.includes("rmSync"), false);
    assert.match(String(pkg.build.mac.extendInfo?.NSMicrophoneUsageDescription ?? ""), /microphone/i);
    assert.match(String(pkg.build.mac.extendInfo?.NSMicrophoneUsageDescription ?? ""), /never leaves/i);
  });

  it("this suite and the prove script are wired into package.json", () => {
    assert.match(pkg.scripts.test, /src\/lib\/runtime\/stt\.test\.ts/);
    assert.match(pkg.scripts["prove:stt"] ?? "", /scripts\/prove-stt\.mjs/);
    const prove = read("scripts/prove-stt.mjs");
    assert.match(prove, /ask not what your country can do for you/);
    assert.match(prove, /transcribeWav\(/);
    assert.match(prove, /STAGE9_STT_PASS/);
    assert.match(prove, /whisperDir\(/);
    assert.match(prove, /WAV_NEVER_REACHED|never reached whisper-cli/);
  });
});
