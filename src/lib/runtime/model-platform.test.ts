/**
 * Stage 6 — Model platform. Run:
 *   node --experimental-strip-types --test src/lib/runtime/model-platform.test.ts
 *
 * These fail if:
 *   - a downloadable catalog row has an empty / malformed sha256
 *   - a sha256 mismatch still activates (activeModelPath moves), or a
 *     downloadable row without a hash is accepted, or "already on disk",
 *     findReadyModel or import skip the verifier
 *   - `"--n-gpu-layers", "0"` is the only path (no GPU asset, no layers branch)
 *   - llama-assets.json loses a HEAD-checked b10749 row or gains an unofficial URL
 *   - two agents with different modelIds never attempt a llama-server restart
 *   - Ollama is still only pingOllama / a hardcoded llama3.2
 *   - import adopts the wizard card's catalog id for a different file
 *   - chat.tsx drops runAgentTurn, or the dsh / ACP pins float
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { ChildProcess } from "node:child_process";
import { CATALOG } from "../catalog.ts";
import { llamaBinDir, loadConfig, patchConfig } from "../fs/disk.ts";
import { ensureAgent, readAgent, setAgentModel, setFolders } from "../fs/scopes.ts";
import type { FoldersConfig } from "../fs/scope-model.ts";
import { parseNvidiaSmi, parseWmiVideo, probeGpuWith, type ProbeIo } from "../hardware-server.ts";
import {
  ALL_GPU_LAYERS,
  allLlamaAssets,
  defaultRuntimeFor,
  gpuLayersFor,
  gpuRuntimesFor,
  llamaAssetFor,
  NO_GPU,
  pickLlamaRuntime,
  runtimesFor,
  type GpuProbe,
} from "./llama-platform.ts";
import {
  __setSpawnForTests,
  ensureLocalServer,
  listOllamaModels,
  llamaSpawnPlan,
  loadedServer,
  pingLocal,
  resolveLlamaRuntime,
  resolveOllamaRoute,
  stopLocalServer,
  type LlamaSpawnPlan,
} from "./local-engine.ts";
import { appLaunchReport } from "./harness-launch.ts";
import {
  activateModel,
  findReadyModel,
  importGguf,
  listModelsOnDisk,
  resolveModelForAgent,
  sha256File,
  startDownload,
  verifyGgufFile,
} from "./models.ts";
import { LOOPBACK_HOST, LOOPBACK_PORT } from "../../runtime/loopback.ts";

const repo = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(repo, p), "utf8");
const SHA256 = /^[0-9a-f]{64}$/;

function gguf(fill: number, extra = 64): Buffer {
  return Buffer.concat([Buffer.from("GGUF"), Buffer.from([3, 0, 0, 0]), Buffer.alloc(extra, fill)]);
}

/** Isolated data dir (config + models folder) for one test. */
function withDataDir<T>(fn: (dir: string, modelsDir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localbot-s6-"));
  const prev = process.env.LOCALBOT_DATA_DIR;
  process.env.LOCALBOT_DATA_DIR = dir;
  const restore = () => {
    if (prev === undefined) delete process.env.LOCALBOT_DATA_DIR;
    else process.env.LOCALBOT_DATA_DIR = prev;
  };
  let out: T;
  try {
    const modelsDir = path.join(dir, "LocalBot", "models");
    fs.mkdirSync(modelsDir, { recursive: true });
    out = fn(dir, modelsDir);
  } catch (err) {
    restore();
    throw err;
  }
  if (out instanceof Promise) return out.finally(restore) as T;
  restore();
  return out;
}

// ── hashes ───────────────────────────────────────────────────────────────────

describe("Stage 6: catalog hashes", () => {
  it("every downloadable catalog row has a real sha256", () => {
    const raw = JSON.parse(read("catalog/models.json")) as { models: { id: string; downloadable: boolean; sha256: string }[] };
    for (const m of raw.models.filter((r) => r.downloadable)) {
      assert.match(m.sha256 ?? "", SHA256, `${m.id} has no sha256 — a downloadable row must carry one`);
    }
    for (const m of CATALOG.filter((r) => r.downloadable)) assert.match(m.sha256, SHA256, m.id);
    assert.ok(raw.models.length >= 4);
  });

  it("the pinned hashes are the ones the Hub serves (0.5B and 1.5B were hashed from real downloads)", () => {
    const by = Object.fromEntries(CATALOG.map((m) => [m.id, m.sha256]));
    assert.equal(by["qwen25-05b-q4"], "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db");
    assert.equal(by["qwen25-15b-q4"], "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e");
    assert.equal(by["qwen25-3b-q4"], "626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d");
    assert.equal(by["qwen25-7b-q4"], "65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423");
  });

  it("a downloaded 0.5B on disk hashes to the catalog value (skipped when the file is absent)", { timeout: 60000 }, () => {
    const dest = path.join(repo, "data/LocalBot/models/qwen2.5-0.5b-instruct-q4_k_m.gguf");
    if (!fs.existsSync(dest)) return;
    assert.equal(sha256File(dest), CATALOG.find((m) => m.id === "qwen25-05b-q4")!.sha256);
  });
});

describe("Stage 6: one verifier gates activation", { concurrency: false }, () => {
  it("verifyGgufFile refuses a downloadable row with no sha256, a mismatch, a wrong size and a non-GGUF", () =>
    withDataDir((_dir, models) => {
      const file = path.join(models, "x.gguf");
      const bytes = gguf(1);
      fs.writeFileSync(file, bytes);
      const good = sha256File(file);
      assert.equal(verifyGgufFile(file, { sha256: good, sizeBytes: bytes.length }).ok, true);
      const noHash = verifyGgufFile(file, { downloadable: true, catalogId: "row-x" });
      assert.equal(noHash.ok, false);
      assert.match(noHash.ok ? "" : noHash.error, /no sha256/);
      const mismatch = verifyGgufFile(file, { sha256: "0".repeat(64) });
      assert.equal(mismatch.ok, false);
      assert.match(mismatch.ok ? "" : mismatch.error, /sha256 mismatch/);
      assert.equal(verifyGgufFile(file, { sizeBytes: bytes.length + 1 }).ok, false);
      fs.writeFileSync(path.join(models, "not.gguf"), Buffer.from("hello world, not a model"));
      assert.match(verifyGgufFile(path.join(models, "not.gguf")).ok ? "" : "missing magic", /missing magic/);
    }));

  it("a hash mismatch leaves activeModelPath unchanged; a match records verifiedModels", () =>
    withDataDir((_dir, models) => {
      const ok = path.join(models, "ok.gguf");
      fs.writeFileSync(ok, gguf(2));
      const first = activateModel(ok, null);
      assert.equal(first.ok, true);
      assert.equal(loadConfig().activeModelPath, ok);
      assert.equal(loadConfig().verifiedModels[ok]?.sha256, sha256File(ok));

      const bad = path.join(models, "bad.gguf");
      fs.writeFileSync(bad, gguf(3));
      const fake = { ...CATALOG[0]!, id: "fake-row", filename: "bad.gguf", sizeBytes: gguf(3).length, sha256: "f".repeat(64), downloadable: true };
      const r = activateModel(bad, fake);
      assert.equal(r.ok, false);
      assert.equal(loadConfig().activeModelPath, ok, "mismatch must not move the active model");
      assert.equal(loadConfig().verifiedModels[bad], undefined);
      assert.equal(listModelsOnDisk().find((m) => m.filename === "bad.gguf")?.verified, false);
    }));

  it("startDownload 'already on disk' runs the verifier instead of a blind activate", { timeout: 60000 }, async () =>
    withDataDir(async (_dir, models) => {
      const row = CATALOG.find((m) => m.id === "qwen25-05b-q4")!;
      const dest = path.join(models, row.filename);
      // Right size (sparse), right magic, wrong bytes → must be refused.
      const fd = fs.openSync(dest, "w");
      fs.writeSync(fd, Buffer.from("GGUF"), 0, 4, 0);
      fs.ftruncateSync(fd, row.sizeBytes);
      fs.closeSync(fd);
      const st = await startDownload(row.id);
      assert.equal(st.status, "error");
      assert.match(st.error ?? "", /sha256 mismatch/);
      assert.equal(loadConfig().activeModelPath, null);
      assert.equal(findReadyModel(), null, "findReadyModel must not adopt the unverifiable catalog file");
    }));

  it("findReadyModel activates only files that verify, and records the hash", () =>
    withDataDir((_dir, models) => {
      const imported = path.join(models, "team-model.gguf");
      fs.writeFileSync(imported, gguf(4));
      const r = findReadyModel();
      assert.ok(r);
      assert.equal(r.path, imported);
      assert.equal(r.modelId, "team-model.gguf");
      assert.equal(r.sha256, sha256File(imported));
      assert.equal(loadConfig().activeModelPath, imported);
      // A file rewritten after verification (same size, new mtime) is re-hashed, not believed.
      fs.writeFileSync(imported, gguf(5));
      const later = new Date(Date.now() + 5000);
      fs.utimesSync(imported, later, later);
      const again = findReadyModel();
      assert.ok(again);
      assert.equal(again.sha256, sha256File(imported), "stale record must be re-verified, not believed");
      assert.notEqual(again.sha256, r.sha256);
      // A hand-edited record without the file's mtime is ignored too.
      patchConfig({ verifiedModels: { [imported]: { sha256: "0".repeat(64), size: gguf(5).length, catalogId: null, verifiedAt: "", mtimeMs: 1 } } });
      assert.equal(findReadyModel()?.sha256, sha256File(imported));
    }));

  it("import adopts a catalog id only when the filename is that row; the badge names the real file", () =>
    withDataDir((dir, models) => {
      const src = path.join(dir, "my-finetune.gguf");
      fs.writeFileSync(src, gguf(6));
      const r = importGguf(src, "qwen25-05b-q4");
      assert.equal(r.ok, true);
      if (!r.ok) return;
      assert.equal(r.catalogId, null);
      assert.equal(r.modelId, "my-finetune.gguf");
      assert.equal(loadConfig().activeModelId, "my-finetune.gguf", "the wizard card id must not label an unrelated file");
      assert.equal(loadConfig().activeModelPath, path.join(models, "my-finetune.gguf"));
      assert.equal(r.sha256, sha256File(src));

      // A file *named* like a catalog row but with other bytes is refused (hash), not activated.
      const fakeRow = path.join(dir, "qwen2.5-0.5b-instruct-q4_k_m.gguf");
      fs.writeFileSync(fakeRow, gguf(7));
      const bad = importGguf(fakeRow);
      assert.equal(bad.ok, false);
      assert.equal(loadConfig().activeModelPath, path.join(models, "my-finetune.gguf"));
    }));
});

// ── GPU runtimes ─────────────────────────────────────────────────────────────

describe("Stage 6: llama.cpp GPU runtimes", () => {
  const OFFICIAL = /^https:\/\/github\.com\/ggml-org\/llama\.cpp\/releases\/download\/b10749\/(llama-b10749-bin-[a-z0-9.-]+|cudart-llama-bin-[a-z0-9.-]+)\.(tar\.gz|zip)$/;

  it("pins only HEAD-checked official b10749 rows per (target, runtime)", () => {
    const names = (t: Parameters<typeof runtimesFor>[0]) => runtimesFor(t).map((a) => `${a.runtime}:${a.filename}`).sort();
    assert.deepEqual(names("linux-x64"), ["cpu:llama-b10749-bin-ubuntu-x64.tar.gz", "vulkan:llama-b10749-bin-ubuntu-vulkan-x64.tar.gz"]);
    assert.deepEqual(names("win32-x64"), [
      "cpu:llama-b10749-bin-win-cpu-x64.zip",
      "cuda-12.4:llama-b10749-bin-win-cuda-12.4-x64.zip",
      "vulkan:llama-b10749-bin-win-vulkan-x64.zip",
    ]);
    assert.deepEqual(names("darwin-arm64"), ["metal:llama-b10749-bin-macos-arm64.tar.gz"]);
    assert.deepEqual(names("darwin-x64"), ["cpu:llama-b10749-bin-macos-x64.tar.gz"]);
    assert.equal(gpuRuntimesFor("darwin-x64").length, 0, "Intel Mac GPU is NOT BUILT — no asset exists");
    assert.equal(llamaAssetFor("win32", "x64", "cuda-12.4")?.extra?.filename, "cudart-llama-bin-win-cuda-12.4-x64.zip");
    for (const a of allLlamaAssets()) {
      assert.match(a.url, OFFICIAL, a.url);
      assert.ok(a.url.endsWith("/" + a.filename));
      if (a.extra) assert.match(a.extra.url, OFFICIAL);
      assert.equal(a.gpu, a.runtime !== "cpu");
    }
    assert.equal(defaultRuntimeFor("darwin-arm64"), "metal");
    assert.equal(defaultRuntimeFor("linux-x64"), "cpu");
  });

  const nvidia: GpuProbe = { vendor: "nvidia", name: "NVIDIA GeForce RTX 3060", vramGb: 12, cuda: true, vulkan: true, metal: false, evidence: ["nvidia-smi"] };
  const amd: GpuProbe = { vendor: "amd", name: "AMD Radeon RX 7800", vramGb: 16, cuda: false, vulkan: true, metal: false, evidence: ["/dev/dri"] };
  const nvidiaNoDriver: GpuProbe = { ...nvidia, cuda: false, vulkan: false };

  it("picks CPU vs GPU from host facts, never from a browser string", () => {
    assert.equal(pickLlamaRuntime("linux-x64", NO_GPU).asset.runtime, "cpu");
    assert.equal(pickLlamaRuntime("win32-x64", NO_GPU).asset.runtime, "cpu");
    assert.equal(pickLlamaRuntime("win32-x64", nvidia).asset.runtime, "cuda-12.4");
    assert.equal(pickLlamaRuntime("win32-x64", amd).asset.runtime, "vulkan");
    assert.equal(pickLlamaRuntime("linux-x64", nvidia).asset.runtime, "vulkan", "no Linux CUDA row is pinned; Vulkan is the GPU path");
    assert.equal(pickLlamaRuntime("linux-x64", amd).asset.runtime, "vulkan");
    assert.equal(pickLlamaRuntime("linux-x64", nvidiaNoDriver).asset.runtime, "cpu");
    assert.equal(pickLlamaRuntime("darwin-arm64", NO_GPU).asset.runtime, "metal");
    const intelMac = pickLlamaRuntime("darwin-x64", amd);
    assert.equal(intelMac.asset.runtime, "cpu");
    assert.match(intelMac.reason, /NOT BUILT/);
    // Explicit preference wins when pinned, otherwise says so and falls to CPU.
    assert.equal(pickLlamaRuntime("linux-x64", NO_GPU, "vulkan").asset.runtime, "vulkan");
    const notPinned = pickLlamaRuntime("linux-x64", nvidia, "cuda-12.4");
    assert.equal(notPinned.asset.runtime, "cpu");
    assert.match(notPinned.reason, /NOT BUILT/);
    assert.equal(pickLlamaRuntime("win32-x64", nvidia, "cpu").asset.runtime, "cpu");
  });

  it("--n-gpu-layers is 0 on a CPU build and > 0 only on a GPU build", () => {
    const cpu = llamaAssetFor("linux", "x64", "cpu")!;
    const vulkan = llamaAssetFor("linux", "x64", "vulkan")!;
    const metal = llamaAssetFor("darwin", "arm64")!;
    const fourGb = 4683074240;
    assert.equal(gpuLayersFor(cpu, nvidia, fourGb), 0, "a CPU binary never gets GPU layers, whatever the probe says");
    assert.equal(gpuLayersFor(vulkan, NO_GPU, fourGb), 0 + ALL_GPU_LAYERS, "GPU build with unknown VRAM offloads everything");
    assert.equal(gpuLayersFor(metal, { vramGb: null }, fourGb), ALL_GPU_LAYERS);
    assert.equal(gpuLayersFor(vulkan, nvidia, fourGb), ALL_GPU_LAYERS);
    const partial = gpuLayersFor(vulkan, { vramGb: 4 }, fourGb);
    assert.ok(partial >= 1 && partial < ALL_GPU_LAYERS, `partial offload expected, got ${partial}`);
    assert.equal(gpuLayersFor(vulkan, { vramGb: 8 }, 491400032), ALL_GPU_LAYERS);

    const cpuPlan = llamaSpawnPlan({ modelPath: "/m/a.gguf", asset: cpu, probe: nvidia, modelBytes: fourGb, contextTokens: 8192, cpuCount: 4 });
    const gpuPlan = llamaSpawnPlan({ modelPath: "/m/a.gguf", asset: vulkan, probe: nvidia, modelBytes: fourGb, contextTokens: 8192, cpuCount: 4 });
    const layersArg = (p: LlamaSpawnPlan) => p.args[p.args.indexOf("--n-gpu-layers") + 1];
    assert.equal(layersArg(cpuPlan), "0");
    assert.equal(layersArg(gpuPlan), String(ALL_GPU_LAYERS));
    assert.equal(gpuPlan.runtime, "vulkan");
    assert.deepEqual(cpuPlan.args.slice(0, 2), ["-m", "/m/a.gguf"]);
    assert.ok(cpuPlan.args.includes("--jinja"));
  });

  it("no source file hardcodes --n-gpu-layers 0 any more", () => {
    const engine = read("src/lib/runtime/local-engine.ts");
    assert.equal(/"--n-gpu-layers",\s*"0"/.test(engine), false, "local-engine.ts must derive the layer count");
    assert.match(engine, /gpuLayersFor\(/);
    assert.match(engine, /String\(gpuLayers\)/);
    const desktop = read("desktop/llama.mjs");
    assert.equal(/"--n-gpu-layers",\s*"0"/.test(desktop), false);
    assert.equal(desktop.includes("childProcess.spawn"), false, "Electron main no longer spawns a second llama-server");
    assert.equal(read("desktop/main.mjs").includes("spawnLlamaServer"), false);
  });

  const io = (over: Partial<ProbeIo>): ProbeIo => ({
    platform: "linux",
    arch: "x64",
    exists: () => false,
    readDir: () => [],
    readFile: () => null,
    run: () => null,
    env: {},
    ...over,
  });

  it("the sidecar probe reads real host sources (nvidia-smi, /sys/class/drm, WMI, arch) and yields NO_GPU on a bare box", () => {
    assert.deepEqual({ ...probeGpuWith(io({})), evidence: [] }, { ...NO_GPU, evidence: [] });

    const nv = probeGpuWith(
      io({
        run: (file) => (file === "nvidia-smi" ? "NVIDIA GeForce RTX 4070, 12282\n" : null),
      }),
    );
    assert.equal(nv.vendor, "nvidia");
    assert.equal(nv.cuda, true);
    assert.equal(nv.vramGb, 12);
    assert.match(nv.evidence.join(" "), /nvidia-smi/);

    const drm = probeGpuWith(
      io({
        readDir: (p) => (p === "/sys/class/drm" ? ["card0", "card0-DP-1", "renderD128"] : p === "/dev/dri" ? ["card0", "renderD128"] : p === "/usr/share/vulkan/icd.d" ? ["radeon_icd.x86_64.json"] : []),
        readFile: (p) => (p === "/sys/class/drm/card0/device/vendor" ? "0x1002\n" : null),
      }),
    );
    assert.equal(drm.vendor, "amd");
    assert.equal(drm.vulkan, true);
    assert.equal(drm.cuda, false);

    const win = probeGpuWith(
      io({
        platform: "win32",
        exists: (p) => /vulkan-1\.dll$/.test(p),
        run: (file) => (file === "powershell" ? JSON.stringify([{ Name: "AMD Radeon RX 6700 XT", AdapterRAM: 12 * 1024 ** 3 }]) : null),
      }),
    );
    assert.equal(win.vendor, "amd");
    assert.equal(win.vulkan, true);
    assert.equal(win.vramGb, 12);
    assert.equal(pickLlamaRuntime("win32-x64", win).asset.runtime, "vulkan");

    const mac = probeGpuWith(io({ platform: "darwin", arch: "arm64", run: () => "Apple M2 Pro\n" }));
    assert.equal(mac.metal, true);
    assert.equal(mac.vendor, "apple");
    assert.equal(mac.name, "Apple M2 Pro");

    assert.equal(parseNvidiaSmi(null), null);
    assert.deepEqual(parseNvidiaSmi("NVIDIA A10, 23028"), { name: "NVIDIA A10", vramGb: 22.5 });
    assert.equal(parseWmiVideo("garbage").length, 0);
    assert.equal(parseWmiVideo(JSON.stringify({ Name: "Intel(R) UHD Graphics", AdapterRAM: 0 }))[0]?.vendor, "intel");
  });
});

// ── Ollama discovery ─────────────────────────────────────────────────────────

describe("Stage 6: Ollama discovery", { concurrency: false }, () => {
  let server: http.Server;
  let base = "";
  let tags: unknown = { models: [] };
  before(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/api/tags") {
        res.setHeader("content-type", "application/json");
        res.end(typeof tags === "string" ? tags : JSON.stringify(tags));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}`;
  });
  after(() => server.close());

  it("listOllamaModels returns tags or a typed error — never a boolean", async () => {
    const dead = await listOllamaModels("http://127.0.0.1:1");
    assert.equal(dead.ok, false);
    assert.equal(dead.ok ? "" : dead.code, "UNREACHABLE");

    tags = { models: [] };
    const empty = await listOllamaModels(base);
    assert.equal(empty.ok, false);
    assert.equal(empty.ok ? "" : empty.code, "NO_MODELS");

    tags = "not json";
    const bad = await listOllamaModels(base);
    assert.equal(bad.ok ? "" : bad.code, "BAD_RESPONSE");

    tags = { models: [{ name: "llama3.2:3b", size: 2019393189, details: { family: "llama", parameter_size: "3.2B", quantization_level: "Q4_K_M" } }, { name: "qwen2.5:7b", size: 1 }] };
    const ok = await listOllamaModels(base);
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.deepEqual(
      ok.models.map((m) => m.name),
      ["llama3.2:3b", "qwen2.5:7b"],
    );
    assert.equal(ok.models[0]!.parameterSize, "3.2B");
  });

  it("the route uses the picked tag and refuses when nothing is picked or listed", async () =>
    withDataDir(async () => {
      tags = { models: [{ name: "llama3.2:3b", size: 1 }, { name: "qwen2.5:7b", size: 1 }] };
      patchConfig({ useExistingOllama: true, ollamaModel: null });
      await assert.rejects(() => resolveOllamaRoute(loadConfig(), base), /no model is picked/);
      patchConfig({ ollamaModel: "mistral:7b" });
      await assert.rejects(() => resolveOllamaRoute(loadConfig(), base), /no longer lists mistral:7b/);
      patchConfig({ ollamaModel: "qwen2.5:7b" });
      const route = await resolveOllamaRoute(loadConfig(), base);
      assert.equal(route.model, "qwen2.5:7b");
      assert.equal(route.baseUrl, `${base}/v1`);
      await assert.rejects(() => resolveOllamaRoute(loadConfig(), "http://127.0.0.1:1"), /Nothing answered/);
    }));

  it("switch on + 11434 silent → the prompt is refused; no fallthrough to llama.cpp, no hosted route", async () =>
    withDataDir(async (dir) => {
      const folders = seedFolders(dir);
      ensureAgent(folders, agentInput("Writer", "team-model.gguf"));
      patchConfig({ useExistingOllama: true, ollamaModel: "anything" });
      // Only if nothing is really listening on 11434 on this host.
      const live = await listOllamaModels();
      if (live.ok) return;
      await assert.rejects(() => appLaunchReport("Writer"), /Nothing answered on http:\/\/127\.0\.0\.1:11434|Ollama/);
      assert.equal(loadedServer(), null, "llama.cpp must not have been started as a fallback");
    }));

  it("source: harness-launch.ts no longer hardcodes llama3.2 or pings", () => {
    const launch = read("src/lib/runtime/harness-launch.ts");
    assert.equal(launch.includes("llama3.2"), false);
    assert.equal(launch.includes("pingOllama"), false);
    assert.match(launch, /resolveOllamaRoute/);
    assert.match(launch, /appLaunchSpec\(agentName: string\)/);
    assert.match(launch, /resolveModelForAgent\(agentName\)/);
    const engine = read("src/lib/runtime/local-engine.ts");
    assert.equal(engine.includes("export async function pingOllama"), false);
    assert.match(engine, /export async function listOllamaModels/);
    assert.match(read("src/components/localbot/settings.tsx"), /modelOllamaList/);
  });
});

// ── per-agent model ──────────────────────────────────────────────────────────

function seedFolders(base: string): FoldersConfig {
  const folders: FoldersConfig = {
    employeeRoot: path.join(base, "emp"),
    employeeShared: path.join(base, "emp-shared"),
    departmentShared: null,
    companyShared: null,
  };
  fs.mkdirSync(folders.employeeRoot, { recursive: true });
  fs.mkdirSync(folders.employeeShared!, { recursive: true });
  const set = setFolders(folders, { create: true });
  assert.equal(set.ok, true, set.ok ? "" : set.error);
  return folders;
}

function agentInput(name: string, modelId: string) {
  return {
    name,
    job: "Drafts briefs",
    modelId,
    color: "sage",
    mascotId: "writer",
    scopes: ["private"],
    standingInstructions: "Keep it short.",
    createdAt: "2026-09-04T00:00:00.000Z",
  };
}

type FakeChild = ChildProcess & { plan: LlamaSpawnPlan; killed: boolean };

/** A fake llama-server: answers /health and /props on the real loopback port for the spawned plan. */
function fakeLlama(spawned: LlamaSpawnPlan[], killed: string[]) {
  return (_exe: string, plan: LlamaSpawnPlan): ChildProcess => {
    spawned.push(plan);
    const em = new EventEmitter() as FakeChild;
    em.plan = plan;
    em.killed = false;
    const srv = http.createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/health") res.end(JSON.stringify({ status: "ok" }));
      else if (req.url === "/props") res.end(JSON.stringify({ model_path: plan.modelPath }));
      else {
        res.statusCode = 404;
        res.end();
      }
    });
    Object.assign(em, {
      pid: 4242 + spawned.length,
      exitCode: null as number | null,
      stdout: null,
      stderr: null,
      kill: () => {
        if (em.killed) return true;
        em.killed = true;
        killed.push(plan.modelPath);
        srv.closeAllConnections();
        srv.close(() => {
          (em as { exitCode: number | null }).exitCode = 0;
          em.emit("exit", 0, null);
        });
        return true;
      },
    });
    srv.listen(LOOPBACK_PORT, LOOPBACK_HOST);
    return em;
  };
}

describe("Stage 6: per-agent model restarts the one llama-server", { concurrency: false }, () => {
  it("agent.json.modelId is durable and picks the file for that agent", () =>
    withDataDir((dir, models) => {
      const folders = seedFolders(dir);
      const a = path.join(models, "a.gguf");
      const b = path.join(models, "b.gguf");
      fs.writeFileSync(a, gguf(10));
      fs.writeFileSync(b, gguf(11));
      assert.equal(activateModel(a, null).ok, true);
      assert.equal(activateModel(b, null).ok, true);

      ensureAgent(folders, agentInput("Writer", "a.gguf"));
      ensureAgent(folders, agentInput("Editor", "b.gguf"));
      assert.equal(resolveModelForAgent("Writer").path, a);
      assert.equal(resolveModelForAgent("Editor").path, b);
      assert.equal(resolveModelForAgent("Editor").source, "agent");

      // A stale browser copy does not overwrite the durable pick.
      ensureAgent(folders, agentInput("Writer", "b.gguf"));
      assert.equal(readAgent(folders, "Writer")?.modelId, "a.gguf");
      setAgentModel(folders, "Writer", "b.gguf");
      assert.equal(readAgent(folders, "Writer")?.modelId, "b.gguf");
      assert.equal(resolveModelForAgent("Writer").path, b);
      assert.throws(() => setAgentModel(folders, "Writer", "../x.gguf"));

      // Missing file → fallback with a visible notice, never silent.
      ensureAgent(folders, agentInput("Ops", "qwen25-7b-q4"));
      const ops = resolveModelForAgent("Ops");
      assert.equal(ops.source, "fallback");
      assert.match(ops.notice ?? "", /not on disk/);
      assert.ok(ops.path);
    }));

  it("switching the selected agent to another modelId stops the child, waits for dark, spawns the new file (dsh untouched)", { timeout: 60000 }, async () =>
    withDataDir(async (dir, models) => {
      assert.equal(
        await pingLocal(),
        false,
        `something already answers on ${LOOPBACK_HOST}:${LOOPBACK_PORT}; stop llama-server before running this suite`,
      );
      const folders = seedFolders(dir);
      const a = path.join(models, "a.gguf");
      const b = path.join(models, "b.gguf");
      fs.writeFileSync(a, gguf(20, 2048));
      fs.writeFileSync(b, gguf(21, 2048));
      assert.equal(activateModel(a, null).ok, true);
      assert.equal(activateModel(b, null).ok, true);
      ensureAgent(folders, agentInput("Writer", "a.gguf"));
      ensureAgent(folders, agentInput("Editor", "b.gguf"));
      // Pin the CPU row (Metal on Apple Silicon) and drop a fake binary so ensureLlamaBinary downloads nothing.
      patchConfig({ llamaRuntime: "cpu" });
      const rt = resolveLlamaRuntime();
      assert.ok(rt);
      const binDir = llamaBinDir(rt.asset.runtime);
      fs.mkdirSync(binDir, { recursive: true });
      fs.writeFileSync(path.join(binDir, process.platform === "win32" ? "llama-server.exe" : "llama-server"), "#!/bin/sh\n");

      const spawned: LlamaSpawnPlan[] = [];
      const killed: string[] = [];
      __setSpawnForTests(fakeLlama(spawned, killed));
      try {
        const first = await appLaunchReport("Writer");
        assert.equal(first.route, "llama.cpp");
        assert.equal(first.model?.path, a);
        assert.equal(first.restarted, false);
        assert.equal(spawned.length, 1);
        assert.equal(spawned[0]!.modelPath, a);
        assert.equal(loadedServer()?.modelPath, a);

        // Same agent again: reuse, no restart.
        const again = await appLaunchReport("Writer");
        assert.equal(again.restarted, false);
        assert.equal(spawned.length, 1);

        // Another agent, another modelId: the child is stopped and a new one is spawned on b.
        const second = await appLaunchReport("Editor");
        assert.equal(second.model?.path, b);
        assert.equal(second.restarted, true, "a different modelId must restart llama-server");
        assert.deepEqual(killed, [a]);
        assert.equal(spawned.length, 2);
        assert.equal(spawned[1]!.modelPath, b);
        assert.equal(loadedServer()?.modelPath, b);
        assert.equal(await pingLocal(), true);

        // The Harness launch key does not change across the switch → HarnessManager keeps its dsh process.
        const k = (s: typeof first.spec) => JSON.stringify([s.dataDir, s.dshHome ?? "", s.llamaBaseUrl, s.model ?? "", s.contextTokens ?? 0, s.maxTokens ?? 0, s.nodeBin ?? ""]);
        assert.equal(k(first.spec), k(second.spec));
        assert.equal(first.spec.llamaBaseUrl, `http://${LOOPBACK_HOST}:${LOOPBACK_PORT}/v1`);

        // Layers on this CPU-only run: 0 on the CPU build; a GPU build would be > 0 (covered above).
        for (const p of spawned) {
          const layers = Number(p.args[p.args.indexOf("--n-gpu-layers") + 1]);
          assert.equal(layers > 0, p.runtime !== "cpu");
        }

        // Direct call with the same path: still no restart.
        const same = await ensureLocalServer(b);
        assert.equal(same.ok && same.restarted, false);
        assert.equal(spawned.length, 2);
      } finally {
        await stopLocalServer();
        __setSpawnForTests(null);
      }
      assert.equal(await pingLocal(), false);
      assert.equal(loadedServer(), null);
    }));

  it("source: the chat pane still sends through runAgentTurn and the badge follows the agent's file", () => {
    const chat = read("src/components/localbot/chat.tsx");
    assert.match(chat, /import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/);
    assert.match(chat, /modelStatusForAgent\(\{ data: \{ agentName: botName \} \}\)/);
    assert.match(read("src/lib/runtime/harness.ts"), /appLaunchReport\(data\.agentName\)/);
    assert.match(read("src/lib/store.ts"), /agentSetModel\(\{ data: \{ agentName: bot\.name, modelId \} \}\)/);
    assert.match(read("src/components/localbot/settings.tsx"), /AgentModelSelect/);
    assert.match(read("src/components/localbot/new-agent.tsx"), /AgentModelSelect/);
  });

  it("dsh / ACP pins stay exact", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    assert.equal(pkg.dependencies["@deepseek-ai/dsh"], "0.1.2-alpha.5");
    assert.equal(pkg.dependencies["@agentclientprotocol/sdk"], "1.4.0");
  });
});
