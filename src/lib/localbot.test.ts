import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATALOG, fitModel, requiredMemoryGb } from "./catalog.ts";
import { checksumBlob, ggufBlob, verifyChecksum } from "./checksum.ts";
import {
  expectedCompanyPaths,
  seedCompanyTree,
  seedHome,
  writeModelBlob,
} from "./fs/company.ts";
import { exists, isFile, readFile, writeFile, type Vfs } from "./fs/vfs.ts";
import { scanHardware } from "./hardware.ts";
import { classifyToolCall, pathAllowed } from "./permissions.ts";
import type { Bot, Company, Department, DownloadedModel, Employee } from "./types.ts";
import { posixJoin } from "./utils.ts";
import {
  assertLoopbackOnly,
  describeBind,
  DEFAULT_RUNTIME_KEYS,
  hasProviderKeys,
  LOOPBACK_HOST,
} from "../runtime/loopback.ts";

function fixture() {
  const now = "2026-09-01T00:00:00.000Z";
  const company: Company = {
    id: "co_1",
    name: "Studio",
    root: "/Documents/LocalBot/Studio",
    defaultDepartmentId: "dept_1",
    catalogPin: "test",
    createdAt: now,
  };
  const department: Department = {
    id: "dept_1",
    companyId: company.id,
    name: "Operations",
    path: "/Documents/LocalBot/Studio/departments/Operations",
    createdAt: now,
  };
  const employee: Employee = {
    id: "emp_1",
    departmentId: department.id,
    displayName: "Employee One",
    path: "/Documents/LocalBot/Studio/departments/Operations/people/Employee One",
    defaultModelId: "gemma4-e2b-q4",
    createdAt: now,
  };
  const bot = (name: string, id: string): Bot => {
    const path = posixJoin(employee.path, "bots", name);
    return {
      id,
      employeeId: employee.id,
      name,
      job: name,
      color: "sage",
      modelId: "gemma4-e2b-q4",
      path,
      workspacePath: posixJoin(path, "workspace"),
      outputPath: posixJoin(path, "output"),
      memoryPath: posixJoin(path, "memory"),
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
  let vfs: Vfs = {};
  vfs = seedHome(vfs, "/LocalBot");
  vfs = seedCompanyTree({
    vfs,
    company,
    department,
    employee,
    bots: [writer, researcher],
  });
  return { company, department, employee, writer, researcher, vfs };
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

    const large = CATALOG.find((m) => m.id === "qwen35-27b-q4");
    assert.ok(large);
    const fit = fitModel(large, hw);
    assert.equal(fit.fits, false);
    assert.match(fit.reason, /Needs about/);
    assert.ok(requiredMemoryGb(large) > hw.availableRamGb);
  });
});

describe("download checksum", () => {
  it("writes a GGUF and verifies checksum", async () => {
    const model = CATALOG[0]!;
    const blob = ggufBlob({
      id: model.id,
      filename: model.filename,
      sizeBytes: model.sizeBytes,
      sha256: model.sha256,
    });
    assert.match(blob, /^GGUF/);
    const digest = await checksumBlob(blob);
    const record: DownloadedModel = {
      id: "mdl_1",
      catalogId: model.id,
      filename: model.filename,
      path: `/LocalBot/models/${model.filename}`,
      sizeBytes: model.sizeBytes,
      sha256: digest,
      downloadedAt: "2026-09-01T00:00:00.000Z",
      source: "catalog",
    };
    let vfs: Vfs = {};
    vfs = writeModelBlob(vfs, "/LocalBot", record, blob);
    assert.equal(exists(vfs, record.path), true);
    assert.equal(isFile(vfs, record.path), true);
    const onDisk = readFile(vfs, record.path);
    const check = await verifyChecksum(onDisk, digest);
    assert.equal(check.ok, true);
    assert.equal(check.actual, digest);
  });
});

describe("company folder contract", () => {
  it("creating Employee One + two bots creates the exact folder tree", () => {
    const { company, department, employee, writer, researcher, vfs } = fixture();
    const expected = expectedCompanyPaths({
      company,
      department,
      employee,
      bots: [writer, researcher],
    });
    for (const p of expected) {
      assert.equal(exists(vfs, p), true, `missing ${p}`);
    }
    assert.equal(exists(vfs, posixJoin(company.root, "company.json")), true);
    assert.equal(exists(vfs, posixJoin(writer.path, "workspace")), true);
    assert.equal(exists(vfs, posixJoin(researcher.path, "output")), true);
  });
});

describe("workspace grants", () => {
  it("agent can create a file in its workspace and it appears on disk", () => {
    const { writer, vfs } = fixture();
    const path = posixJoin(writer.workspacePath, "hello.md");
    const next = writeFile(vfs, path, "# hello\n");
    assert.equal(readFile(next, path), "# hello\n");
    assert.equal(isFile(next, path), true);
  });

  it("agent is denied from writing outside grants", () => {
    const { writer, employee, department, company } = fixture();
    const outside = "/Documents/LocalBot/Studio/departments/Operations/people/Other/secret.md";
    assert.equal(
      pathAllowed(outside, writer, employee, department, company),
      false,
    );
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
  });

  it("two bots granted shared/ can both write files there", () => {
    let { writer, researcher, employee, department, company, vfs } = fixture();
    const shared = posixJoin(department.path, "shared");
    assert.equal(pathAllowed(shared, writer, employee, department, company), true);
    assert.equal(pathAllowed(shared, researcher, employee, department, company), true);
    vfs = writeFile(vfs, posixJoin(shared, "from-writer.md"), "w");
    vfs = writeFile(vfs, posixJoin(shared, "from-researcher.md"), "r");
    assert.equal(readFile(vfs, posixJoin(shared, "from-writer.md")), "w");
    assert.equal(readFile(vfs, posixJoin(shared, "from-researcher.md")), "r");
  });
});

describe("runtime safety", () => {
  it("app starts with no API keys on the default path", () => {
    assert.deepEqual(DEFAULT_RUNTIME_KEYS, {});
    assert.equal(hasProviderKeys({}), false);
    assert.equal(hasProviderKeys({ ANTHROPIC_API_KEY: "sk" }), true);
  });

  it("loopback-only bind check", () => {
    const ok = describeBind();
    assert.equal(ok.host, "127.0.0.1");
    assert.equal(ok.loopbackOnly, true);
    assert.equal(ok.lanBind, false);
    assert.equal(LOOPBACK_HOST, "127.0.0.1");
    assert.doesNotThrow(() => assertLoopbackOnly());
    assert.throws(() => assertLoopbackOnly("0.0.0.0"));
    const lan = describeBind("0.0.0.0", 18789);
    assert.equal(lan.loopbackOnly, false);
    assert.equal(lan.lanBind, true);
  });
});
