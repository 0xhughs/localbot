import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { CATALOG, CATALOG_PIN, fitModel, requiredMemoryGb } from "./catalog.ts";
import { allowedRootsFor, expectedCompanyPaths, grantPathFor, resolveAgentFilePath } from "./fs/company.ts";
import { seedCompanyTreeOnDisk } from "./fs/company-disk.ts";
import {
  assertInsideRoot,
  diskExists,
  diskRead,
  diskWrite,
  makeTempRoot,
} from "./fs/disk.ts";
import { scanHardware } from "./hardware.ts";
import { scanServerHardware, scanServerHardwareFrom } from "./hardware-server.ts";
import { classifyToolCall, pathAllowed } from "./permissions.ts";
import { executeTurn } from "./runtime/execute-turn.ts";
import { importGguf, streamHubDownload, verifyModel } from "./runtime/models.ts";
import { runLocalTurn } from "./runtime/local-engine.ts";
import { assertLoopbackOnly, describeBind, LOOPBACK_HOST, LOOPBACK_PORT } from "../runtime/loopback.ts";
import type { Bot, Company, Department, Employee } from "./types.ts";
import { posixJoin } from "./utils.ts";

function fixture() {
  const now = "2026-09-01T00:00:00.000Z";
  const root = makeTempRoot();
  const company: Company = {
    id: "co_1",
    name: "Studio",
    root,
    defaultDepartmentId: "dept_1",
    catalogPin: "test",
    createdAt: now,
  };
  const department: Department = {
    id: "dept_1",
    companyId: company.id,
    name: "Operations",
    path: posixJoin(root, "departments", "Operations"),
    createdAt: now,
  };
  const employee: Employee = {
    id: "emp_1",
    departmentId: department.id,
    displayName: "Employee One",
    path: posixJoin(department.path, "people", "Employee One"),
    defaultModelId: "qwen25-05b-q4",
    createdAt: now,
  };
  const bot = (name: string, id: string): Bot => {
    const botDir = posixJoin(employee.path, "bots", name);
    return {
      id,
      employeeId: employee.id,
      name,
      job: name,
      color: "sage",
      modelId: "qwen25-05b-q4",
      path: botDir,
      workspacePath: posixJoin(botDir, "workspace"),
      outputPath: posixJoin(botDir, "output"),
      memoryPath: posixJoin(botDir, "memory"),
      grants: ["workspace", "output", "shared", "outbox"],
      standingInstructions: "",
      pinned: false,
      hidden: false,
      unread: 0,
      createdAt: now,
    };
  };
  const writer = bot("Writer", "bot_w");
  const researcher = bot("Researcher", "bot_r");
  seedCompanyTreeOnDisk({
    companyRoot: root,
    company,
    department,
    employee,
    bots: [writer, researcher],
  });
  return { company, department, employee, writer, researcher, root };
}

describe("hardware scanner", () => {
  it("returns RAM and refuses a model that cannot fit", () => {
    const hw = scanHardware({
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      platform: "Linux x86_64",
      hardwareConcurrency: 4,
      deviceMemoryGb: 4,
    });
    assert.equal(hw.os, "Linux");
    assert.ok(hw.availableRamGb > 0);
    assert.ok(hw.availableRamGb <= 4);

    const large = CATALOG.find((m) => m.id === "qwen25-7b-q4");
    assert.ok(large);
    const fit = fitModel(large, hw);
    assert.equal(fit.fits, false);
    assert.match(fit.reason, /Needs about/);
    assert.ok(requiredMemoryGb(large) > hw.availableRamGb);
  });
});

describe("server hardware", () => {
  it("uses os.totalmem, not a 16 GB browser assumption", () => {
    const hw = scanServerHardwareFrom({
      totalmem: () => 4 * 1024 ** 3,
      freemem: () => 2.5 * 1024 ** 3,
      cpus: () => [{ model: "test" }, { model: "test" }, { model: "test" }, { model: "test" }],
      arch: () => "x64",
      platform: () => "linux",
    });
    assert.equal(hw.ramSource, "os");
    assert.ok(Math.abs(hw.totalRamGb - 4) < 0.01);
    assert.ok(hw.totalRamGb < 8);
    assert.ok(Math.abs(hw.availableRamGb - 2.5) < 0.01);
    const live = scanServerHardwareFrom(os);
    assert.equal(live.ramSource, "os");
    assert.ok(Math.abs(live.totalRamGb - os.totalmem() / 1024 ** 3) < 0.01);

    const large = CATALOG.find((m) => m.id === "qwen25-7b-q4");
    assert.ok(large);
    assert.equal(fitModel(large, hw).fits, false);

    const small = CATALOG.find((m) => m.id === "qwen25-05b-q4");
    assert.ok(small);
    const oneGig = scanServerHardwareFrom({
      totalmem: () => 1 * 1024 ** 3,
      freemem: () => 0.4 * 1024 ** 3,
      cpus: () => [{ model: "tiny" }],
      arch: () => "x64",
      platform: () => "linux",
    });
    assert.equal(fitModel(small, oneGig).fits, false);
  });
});

describe("company folder contract", () => {
  it("creating Employee One + two bots creates the exact folder tree on disk", () => {
    const { company, department, employee, writer, researcher, root } = fixture();
    const expected = expectedCompanyPaths({
      company,
      department,
      employee,
      bots: [writer, researcher],
    });
    for (const p of expected) {
      assert.equal(fs.existsSync(p), true, `missing ${p}`);
    }
    assert.equal(fs.existsSync(path.join(root, "company.json")), true);
    assert.equal(fs.existsSync(writer.workspacePath), true);
    assert.equal(fs.statSync(writer.workspacePath).isDirectory(), true);
    assert.equal(fs.existsSync(researcher.outputPath), true);
  });
});

describe("workspace grants", () => {
  it("writing hello.md via the disk adapter creates a file fs.existsSync can see", () => {
    const { writer, employee, department, company, root } = fixture();
    const relative = resolveAgentFilePath("hello.md", writer, employee, department, company);
    assert.equal(relative, posixJoin(writer.workspacePath, "hello.md"));
    diskWrite(root, relative, "# hello\n");
    assert.equal(fs.existsSync(relative), true);
    assert.equal(fs.readFileSync(relative, "utf8"), "# hello\n");
    assert.equal(diskRead(root, relative), "# hello\n");
    assert.equal(diskExists(root, relative), true);
  });

  it("agent is denied from writing outside grants", () => {
    const { writer, employee, department, company, root } = fixture();
    const outside = posixJoin(
      company.root,
      "departments",
      "Operations",
      "people",
      "Other",
      "secret.md",
    );
    assert.equal(pathAllowed(outside, writer, employee, department, company), false);
    const cls = classifyToolCall(
      { name: "write_file", args: { path: outside, content: "x" } },
      {
        bot: writer,
        employee,
        department,
        company,
        webSearchEnabled: false,
        controlThisComputer: false,
      },
    );
    assert.equal(cls.allowedByGrant, false);
    const allowed = allowedRootsFor(writer, employee, department, company);
    assert.throws(
      () => diskWrite(root, outside, "x", allowed),
      /outside this agent's grants/,
    );
  });

  it("writing outside company root throws", () => {
    const { root } = fixture();
    assert.throws(
      () => diskWrite(root, "/tmp/localbot-escape-test.md", "nope"),
      /outside company root/,
    );
    assert.throws(
      () => assertInsideRoot(root, path.join(root, "..", "sibling.md")),
      /outside company root/,
    );
  });

  it("two bots granted shared/ can both write files there on disk", () => {
    const { writer, researcher, employee, department, company, root } = fixture();
    const shared = grantPathFor(writer, employee, department, company, "shared");
    assert.equal(pathAllowed(shared, writer, employee, department, company), true);
    assert.equal(pathAllowed(shared, researcher, employee, department, company), true);
    diskWrite(root, posixJoin(shared, "from-writer.md"), "w");
    diskWrite(root, posixJoin(shared, "from-researcher.md"), "r");
    assert.equal(fs.readFileSync(path.join(shared, "from-writer.md"), "utf8"), "w");
    assert.equal(fs.readFileSync(path.join(shared, "from-researcher.md"), "utf8"), "r");
  });
});

describe("local model policy", () => {
  it("turn.ts default path does not call api.x.ai", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/runtime/turn.ts"), "utf8");
    assert.equal(src.includes("api.x.ai"), false);
    assert.equal(src.includes("execute-turn"), true);
    const hosted = fs.readFileSync(
      path.join(process.cwd(), "src/lib/runtime/hosted-turn.ts"),
      "utf8",
    );
    assert.equal(hosted.includes("api.x.ai"), true);
  });

  it("runLocalTurn does not require XAI_API_KEY", async () => {
    const prev = process.env.LOCALBOT_DATA_DIR;
    const tmp = makeTempRoot();
    process.env.LOCALBOT_DATA_DIR = tmp;
    try {
      const r = await runLocalTurn({
        messages: [{ role: "user", content: "hi" }],
        allowNetwork: false,
      });
      assert.equal(r.ok, false);
      assert.match(r.error, /Local model not ready/);
      assert.equal(/api\.x\.ai|XAI_API_KEY|hosted grok/i.test(r.error), false);
    } finally {
      if (prev === undefined) delete process.env.LOCALBOT_DATA_DIR;
      else process.env.LOCALBOT_DATA_DIR = prev;
    }
  });
});

describe("gguf download writer", () => {
  it("streams bytes to disk; the file is a GGUF, not a synthetic json blob", async () => {
    const payload = Buffer.concat([
      Buffer.from("GGUF"),
      Buffer.from([3, 0, 0, 0]),
      Buffer.alloc(64, 7),
    ]);
    const server = http.createServer((req, res) => {
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(payload.length),
      });
      res.end(payload);
    });
    const port = await new Promise<number>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });
    const destDir = makeTempRoot();
    const partial = path.join(destDir, "tiny.gguf.partial");
    const dest = path.join(destDir, "tiny.gguf");
    try {
      const ac = new AbortController();
      await streamHubDownload(
        `http://127.0.0.1:${port}/tiny.gguf`,
        partial,
        0,
        () => undefined,
        ac.signal,
      );
      fs.renameSync(partial, dest);
      const buf = fs.readFileSync(dest);
      assert.equal(buf.subarray(0, 4).toString("utf8"), "GGUF");
      assert.equal(buf.includes(Buffer.from("\n{")), false);
      assert.notEqual(buf.toString("utf8").slice(0, 20), "GGUF\n{");
      assert.equal(buf.length, payload.length);
    } finally {
      server.close();
    }
  });
});

describe("catalog pin", () => {
  it("loads ids from catalog/models.json", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "catalog/models.json"), "utf8")) as {
      pin: string;
      models: { id: string; gated: boolean }[];
    };
    assert.equal(CATALOG_PIN, raw.pin);
    assert.deepEqual(
      CATALOG.map((m) => m.id),
      raw.models.filter((m) => !m.gated).map((m) => m.id),
    );
    assert.ok(CATALOG.some((m) => m.id === "qwen25-05b-q4" && m.downloadable));
  });
});

describe("loopback bind", () => {
  it("binds 127.0.0.1:18789 and refuses 0.0.0.0", () => {
    assert.equal(LOOPBACK_HOST, "127.0.0.1");
    assert.equal(LOOPBACK_PORT, 18789);
    const check = describeBind();
    assert.equal(check.loopbackOnly, true);
    assert.equal(check.lanBind, false);
    assert.throws(() => assertLoopbackOnly("0.0.0.0"), /Refusing non-loopback bind/);
  });
});

describe("checksum honesty", () => {
  it("does not ship ggufBlob", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/checksum.ts"), "utf8");
    assert.equal(src.includes("ggufBlob"), false);
  });
});

describe("executeTurn default", () => {
  it("does not require XAI_API_KEY", { timeout: 60000 }, async () => {
    const prev = process.env.XAI_API_KEY;
    delete process.env.XAI_API_KEY;
    try {
      const out = await executeTurn({
        allowNetwork: false,
        messages: [
          { role: "system", content: "Reply with the single word hello." },
          { role: "user", content: "Say hello" },
        ],
      });
      if (!out.ok) {
        assert.equal(out.error.includes("AI is not available in this environment"), false);
        assert.match(out.error, /Local model|llama-server|GGUF|not ready/i);
      } else {
        assert.equal(typeof out.content, "string");
      }
    } finally {
      if (prev !== undefined) process.env.XAI_API_KEY = prev;
    }
  });
});

describe("import and verify", { concurrency: false }, () => {
  it("importGguf copies real bytes into the models dir", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localbot-data-"));
    const prev = process.env.LOCALBOT_DATA_DIR;
    process.env.LOCALBOT_DATA_DIR = tmp;
    try {
      const src = path.join(tmp, "imported.gguf");
      const blob = Buffer.concat([Buffer.from("GGUF"), Buffer.from([3, 0, 0, 0]), Buffer.alloc(64, 9)]);
      fs.writeFileSync(src, blob);
      const r = importGguf(src);
      assert.equal(r.ok, true);
      assert.ok(r.path);
      const copied = fs.readFileSync(r.path);
      assert.equal(copied.subarray(0, 4).toString("utf8"), "GGUF");
      assert.deepEqual(copied, blob);
      assert.equal(copied.toString("utf8").startsWith("GGUF\n{"), false);
    } finally {
      if (prev === undefined) delete process.env.LOCALBOT_DATA_DIR;
      else process.env.LOCALBOT_DATA_DIR = prev;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("verifyModel accepts the downloaded Small GGUF when present", { timeout: 30000 }, () => {
    const dest = path.join(process.cwd(), "data/LocalBot/models/qwen2.5-0.5b-instruct-q4_k_m.gguf");
    if (!fs.existsSync(dest)) return;
    const v = verifyModel("qwen25-05b-q4");
    assert.equal(v.ok, true, v.error);
    assert.equal(v.path, dest);
  });
});
