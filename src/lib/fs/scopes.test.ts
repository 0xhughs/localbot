/**
 * Stage 2 — folder scopes. Run:
 *   node --experimental-strip-types --test src/lib/fs/scopes.test.ts
 * Every test here fails against the pre-Stage-2 tree (no scopes.ts, no
 * versioned folders object, browser-supplied companyRoot).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadConfig, makeTempRoot, patchConfig, suggestedFolders } from "./disk.ts";
import {
  displayPath,
  handoffScope,
  parseScopedPath,
  SCOPE_IDS,
  type FoldersConfig,
} from "./scope-model.ts";
import {
  ensureAgent,
  readAgent,
  resolveForAgent,
  resolveScopePath,
  safeSegments,
  ScopeError,
  scopedDelete,
  scopedList,
  scopedRead,
  scopedShell,
  scopedWrite,
  setAgentScopes,
  setFolders,
  validateFolder,
} from "./scopes.ts";

function withDataDir<T>(fn: (dir: string) => T): T {
  const prev = process.env.LOCALBOT_DATA_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localbot-cfg-"));
  process.env.LOCALBOT_DATA_DIR = dir;
  try {
    return fn(dir);
  } finally {
    if (prev === undefined) delete process.env.LOCALBOT_DATA_DIR;
    else process.env.LOCALBOT_DATA_DIR = prev;
  }
}

function fixture(): { folders: FoldersConfig; base: string } {
  const base = makeTempRoot("localbot-scopes-");
  const folders: FoldersConfig = {
    employeeRoot: path.join(base, "emp"),
    employeeShared: path.join(base, "emp-shared"),
    departmentShared: path.join(base, "dept-shared"),
    companyShared: null,
  };
  for (const p of [folders.employeeRoot, folders.employeeShared!, folders.departmentShared!]) {
    fs.mkdirSync(p, { recursive: true });
  }
  return { folders, base };
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof ScopeError) return err.code;
    throw err;
  }
  return "OK";
}

describe("scope model", () => {
  it("parses scope prefixes; bare names are private", () => {
    assert.deepEqual(parseScopedPath("hello.md"), { scope: "private", relPath: "hello.md" });
    assert.deepEqual(parseScopedPath("private/output/a.md"), { scope: "private", relPath: "output/a.md" });
    assert.deepEqual(parseScopedPath("employee-shared/notes.md"), {
      scope: "employee-shared",
      relPath: "notes.md",
    });
    assert.deepEqual(parseScopedPath("/department-shared/x"), { scope: "department-shared", relPath: "x" });
    assert.deepEqual(parseScopedPath("company-shared"), { scope: "company-shared", relPath: "" });
    assert.equal(displayPath("private", "a/b.md"), "private/a/b.md");
    assert.deepEqual([...SCOPE_IDS], ["private", "employee-shared", "department-shared", "company-shared"]);
  });

  it("handoff goes to employee-shared, else department-shared, else nowhere", () => {
    const f: FoldersConfig = { employeeRoot: "/e", employeeShared: "/s", departmentShared: "/d", companyShared: null };
    assert.equal(handoffScope(f), "employee-shared");
    assert.equal(handoffScope({ ...f, employeeShared: null }), "department-shared");
    assert.equal(handoffScope({ ...f, employeeShared: null, departmentShared: null }), null);
    assert.equal(handoffScope(null), null);
  });
});

describe("scope resolver", () => {
  it("private resolves to {employeeRoot}/agents/{Name}/private", () => {
    const { folders } = fixture();
    const r = resolveScopePath(folders, { scope: "private", relPath: "hello.md", agentName: "Writer" });
    assert.equal(r.abs, path.join(folders.employeeRoot, "agents", "Writer", "private", "hello.md"));
    assert.equal(r.display, "private/hello.md");
    const shared = resolveScopePath(folders, { scope: "department-shared", relPath: "a/b.md", agentName: "Writer" });
    assert.equal(shared.abs, path.join(folders.departmentShared!, "a", "b.md"));
  });

  it("rejects .. everywhere", () => {
    const { folders } = fixture();
    for (const rel of ["../x", "a/../../x", "..", "private/../../../etc/passwd", "a/..\\..\\x"]) {
      assert.equal(code(() => resolveScopePath(folders, { scope: "private", relPath: rel, agentName: "W" })), "BAD_PATH", rel);
    }
  });

  it("rejects absolute host paths, drive letters and UNC", () => {
    const { folders } = fixture();
    for (const rel of ["/etc/passwd", "\\\\server\\share\\x", "C:\\Windows\\win.ini", "c:/x", "//srv/share"]) {
      assert.equal(code(() => safeSegments(rel)), "BAD_PATH", rel);
    }
    assert.equal(code(() => safeSegments("a\0b")), "BAD_PATH");
    assert.equal(code(() => resolveScopePath(folders, { scope: "private", relPath: "/etc/passwd", agentName: "W" })), "BAD_PATH");
  });

  it("rejects unset and unknown scopes", () => {
    const { folders } = fixture();
    assert.equal(code(() => resolveScopePath(folders, { scope: "company-shared", relPath: "x", agentName: "W" })), "SCOPE_UNSET");
    assert.equal(
      code(() => resolveScopePath(folders, { scope: "nope" as never, relPath: "x", agentName: "W" })),
      "BAD_SCOPE",
    );
  });

  it("rejects symlink escapes, including dangling links", () => {
    const { folders, base } = fixture();
    const outside = path.join(base, "outside");
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "secret.md"), "secret");
    const priv = path.join(folders.employeeRoot, "agents", "Writer", "private");
    fs.mkdirSync(priv, { recursive: true });
    fs.symlinkSync(outside, path.join(priv, "link"), "dir");
    fs.symlinkSync(path.join(outside, "secret.md"), path.join(priv, "file-link"));
    fs.symlinkSync(path.join(outside, "missing.md"), path.join(priv, "dangling"));

    const t = (rel: string) => code(() => resolveScopePath(folders, { scope: "private", relPath: rel, agentName: "Writer" }));
    assert.equal(t("link/secret.md"), "ESCAPE");
    assert.equal(t("link"), "ESCAPE");
    assert.equal(t("file-link"), "ESCAPE");
    assert.equal(t("dangling"), "ESCAPE");
    assert.equal(t("plain.md"), "OK");

    fs.symlinkSync(path.join(priv, "inside-dir-target"), path.join(priv, "inside-link"), "dir");
    fs.mkdirSync(path.join(priv, "inside-dir-target"));
    assert.equal(t("inside-link/ok.md"), "OK");
  });
});

describe("agent grants live in agent.json next to private/", () => {
  it("ensureAgent creates the folder set and resolveForAgent enforces scopes", () => {
    const { folders } = fixture();
    const r = ensureAgent(folders, {
      name: "Writer",
      job: "Drafts",
      modelId: "qwen25-05b-q4",
      color: "sage",
      mascotId: "writer",
      scopes: ["private", "department-shared"],
      standingInstructions: "Do work.",
      createdAt: "2026-09-02T00:00:00.000Z",
    });
    assert.equal(r.privatePath, path.join(folders.employeeRoot, "agents", "Writer", "private"));
    assert.equal(fs.existsSync(path.join(r.agentDir, "agent.json")), true);
    assert.equal(fs.existsSync(path.join(r.agentDir, "AGENTS.md")), true);
    assert.equal(fs.existsSync(path.join(r.privatePath, "memory", "notes.md")), true);
    assert.equal(fs.existsSync(path.join(r.privatePath, "output")), true);
    assert.deepEqual(readAgent(folders, "Writer")?.scopes, ["private", "department-shared"]);

    const agentName = "Writer";
    assert.equal(code(() => resolveForAgent(folders, { scope: "department-shared", relPath: "x.md", agentName })), "OK");
    assert.equal(code(() => resolveForAgent(folders, { scope: "employee-shared", relPath: "x.md", agentName })), "NOT_GRANTED");
    assert.equal(code(() => resolveForAgent(folders, { scope: "private", relPath: "x.md", agentName: "Ghost" })), "OK");
    assert.equal(code(() => resolveForAgent(folders, { scope: "department-shared", relPath: "x.md", agentName: "Ghost" })), "NOT_GRANTED");

    setAgentScopes(folders, "Writer", ["private", "employee-shared"]);
    assert.equal(code(() => resolveForAgent(folders, { scope: "employee-shared", relPath: "x.md", agentName })), "OK");
    assert.equal(code(() => resolveForAgent(folders, { scope: "department-shared", relPath: "x.md", agentName })), "NOT_GRANTED");
  });

  it("scoped write/read/list/delete land on disk under the right root; shell stays in private", () => {
    const { folders } = fixture();
    ensureAgent(folders, {
      name: "Writer", job: "", modelId: "", color: "", mascotId: "",
      scopes: ["private", "employee-shared"], standingInstructions: "", createdAt: "",
    });
    const w = { scope: "private" as const, relPath: "hello.md", agentName: "Writer" };
    assert.equal(scopedWrite(folders, w, "# hello\n"), "private/hello.md");
    const abs = path.join(folders.employeeRoot, "agents", "Writer", "private", "hello.md");
    assert.equal(fs.readFileSync(abs, "utf8"), "# hello\n");
    assert.equal(scopedRead(folders, w, true), "# hello\n");

    scopedWrite(folders, { scope: "employee-shared", relPath: "task-1.md", agentName: "Writer" }, "t");
    assert.equal(fs.existsSync(path.join(folders.employeeShared!, "task-1.md")), true);
    const listed = scopedList(folders, { scope: "employee-shared", relPath: "", agentName: "Writer" }, true);
    assert.deepEqual(listed.map((e) => e.relPath), ["task-1.md"]);
    assert.equal(Object.keys(listed[0]!).includes("path"), false, "entries do not leak host paths");

    assert.equal(
      code(() => scopedWrite(folders, { scope: "department-shared", relPath: "x.md", agentName: "Writer" }, "x")),
      "NOT_GRANTED",
    );
    assert.equal(code(() => scopedDelete(folders, { scope: "private", relPath: "", agentName: "Writer" })), "BAD_PATH");
    scopedDelete(folders, w);
    assert.equal(fs.existsSync(abs), false);

    const sh = scopedShell(folders, "Writer", "ls");
    assert.equal(sh.code, 0);
    assert.match(sh.stdout, /memory\//);
    const esc = scopedShell(folders, "Writer", "cat /etc/hostname");
    assert.notEqual(esc.code, 0);
    assert.match(esc.stderr, /outside/i);
  });
});

describe("versioned folders config", () => {
  it("round-trips a version 2 folders object and preserves the model fields", () => {
    withDataDir((dir) => {
      const { folders } = fixture();
      patchConfig({ activeModelId: "qwen25-05b-q4", activeModelPath: path.join(dir, "m.gguf") });
      const r = setFolders(folders, { create: false });
      assert.equal(r.ok, true);
      const cfg = loadConfig();
      assert.equal(cfg.version, 2);
      assert.deepEqual(cfg.folders, folders);
      assert.equal(cfg.activeModelId, "qwen25-05b-q4");
      const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "localbot-config.json"), "utf8"));
      assert.equal(onDisk.version, 2);
      assert.equal(onDisk.folders.employeeRoot, folders.employeeRoot);
      assert.equal(onDisk.folders.companyShared, null);
      assert.equal("companyRoot" in onDisk, false);
      assert.equal(fs.existsSync(path.join(folders.employeeRoot, "agents")), true);
    });
  });

  it("refuses a missing folder unless create is requested; optional scopes may be null", () => {
    withDataDir(() => {
      const base = makeTempRoot("localbot-set-");
      const missing = path.join(base, "nope");
      const r = setFolders({ employeeRoot: missing }, { create: false });
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.field, "employeeRoot");
      const rel = setFolders({ employeeRoot: "relative/path" }, { create: true });
      assert.equal(rel.ok, false);
      const ok = setFolders({ employeeRoot: missing, employeeShared: null }, { create: true });
      assert.equal(ok.ok, true);
      assert.equal(fs.existsSync(missing), true);
      assert.equal(loadConfig().folders?.employeeShared, null);
      const v = validateFolder(missing);
      assert.equal(v.ok && v.writable, true);
      assert.equal(validateFolder("not/absolute").ok, false);
    });
  });

  it("migrates a v1 companyRoot once, keeps legacyCompanyRoot, deletes nothing", () => {
    withDataDir((dir) => {
      const root = makeTempRoot("localbot-legacy-");
      const oldWorkspace = path.join(root, "departments", "Operations", "people", "Employee One", "bots", "Writer", "workspace");
      fs.mkdirSync(oldWorkspace, { recursive: true });
      fs.mkdirSync(path.join(root, "departments", "Operations", "shared"), { recursive: true });
      fs.mkdirSync(path.join(root, "shared"), { recursive: true });
      fs.writeFileSync(path.join(oldWorkspace, "old.md"), "keep me");
      fs.writeFileSync(
        path.join(dir, "localbot-config.json"),
        JSON.stringify({ companyRoot: root, modelsDir: path.join(dir, "models"), activeModelId: "qwen25-05b-q4" }),
      );

      const cfg = loadConfig();
      assert.equal(cfg.version, 2);
      assert.equal(cfg.legacyCompanyRoot, root);
      assert.equal(cfg.folders?.employeeRoot, path.join(root, "departments", "Operations", "people", "Employee One"));
      assert.equal(cfg.folders?.departmentShared, path.join(root, "departments", "Operations", "shared"));
      assert.equal(cfg.folders?.companyShared, path.join(root, "shared"));
      assert.equal(cfg.folders?.employeeShared, null);
      assert.equal(cfg.activeModelId, "qwen25-05b-q4");
      assert.equal(fs.readFileSync(path.join(oldWorkspace, "old.md"), "utf8"), "keep me");

      const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "localbot-config.json"), "utf8"));
      assert.equal(onDisk.version, 2);
      assert.equal(onDisk.legacyCompanyRoot, root);
      assert.equal("companyRoot" in onDisk, false, "migration is written once");
      assert.deepEqual(loadConfig().folders, cfg.folders);
    });
  });

  it("suggested layout follows the plan template", () => {
    const s = suggestedFolders({ companyName: "Acme", departmentName: "Ops", employeeName: "Sam" });
    assert.match(s.employeeRoot, /Acme[\\/]departments[\\/]Ops[\\/]employees[\\/]Sam$/);
    assert.equal(s.employeeShared, path.join(s.employeeRoot, "shared"));
    assert.match(String(s.departmentShared), /departments[\\/]Ops[\\/]shared$/);
    assert.match(String(s.companyShared), /Acme[\\/]company-shared$/);
  });
});

describe("sidecar is the source of truth", () => {
  it("server functions take no companyRoot / allowedRoots from the browser", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/fs/server.ts"), "utf8");
    assert.equal(/companyRoot\??:/.test(src), false, "server.ts accepts companyRoot");
    assert.equal(/allowedRoots\??:/.test(src), false, "server.ts accepts allowedRoots");
    assert.match(src, /requireFolders\(\)/);
    assert.match(src, /scope/);
  });

  it("Electron exposes the native folder dialog through preload IPC only", () => {
    const main = fs.readFileSync(path.join(process.cwd(), "desktop/main.mjs"), "utf8");
    const preload = fs.readFileSync(path.join(process.cwd(), "desktop/preload.mjs"), "utf8");
    assert.match(main, /ipcMain\.handle\("localbot:pickFolder"/);
    assert.match(main, /showOpenDialog/);
    assert.match(main, /"openDirectory"/);
    assert.match(preload, /ipcRenderer\.invoke\("localbot:pickFolder"/);
    assert.equal(preload.includes("require("), false);
    assert.equal(/\bfs\b/.test(preload), false, "preload does not expose fs");
  });
});
