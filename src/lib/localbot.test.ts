import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { CATALOG, fitModel, requiredMemoryGb } from "./catalog.ts";
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
import { classifyToolCall, pathAllowed } from "./permissions.ts";
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
    defaultModelId: "gemma4-e2b-q4",
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
      modelId: "gemma4-e2b-q4",
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

    const large = CATALOG.find((m) => m.id === "qwen35-27b-q4");
    assert.ok(large);
    const fit = fitModel(large, hw);
    assert.equal(fit.fits, false);
    assert.match(fit.reason, /Needs about/);
    assert.ok(requiredMemoryGb(large) > hw.availableRamGb);
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
