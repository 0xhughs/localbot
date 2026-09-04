/**
 * Stage 3 — four-scope browser + watch/poll + Refresh. Run:
 *   node --experimental-strip-types --test src/lib/fs/watch.test.ts
 *
 * These fail against the Stage 2 tree: there is no watch.ts, browseList treats
 * a missing configured root as "No such directory" (soft empty), there is no
 * Refresh server fn, and main.mjs has no reveal IPC.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import { makeTempRoot } from "./disk.ts";
import type { FoldersConfig } from "./scope-model.ts";
import { ScopeError, resolveScopePath, scopedList, scopedWrite, ensureAgent } from "./scopes.ts";
import {
  POLL_MAX_DEPTH,
  POLL_MAX_ENTRIES,
  RootWatcher,
  fingerprintRoot,
  refreshScopes,
  scopeStatuses,
  stopAllWatchers,
  syncWatchers,
} from "./watch.ts";

const REPO = path.resolve(import.meta.dirname, "../../..");

function fixture(): { folders: FoldersConfig; base: string } {
  const base = makeTempRoot("localbot-watch-");
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

const AGENT = {
  name: "Writer",
  job: "writes",
  modelId: "m",
  color: "#fff",
  mascotId: "writer",
  scopes: ["private", "employee-shared", "department-shared"],
  standingInstructions: "",
  createdAt: new Date().toISOString(),
};

async function waitFor(pred: () => boolean, ms = 4000, step = 25): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, step));
  }
  return pred();
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

after(() => stopAllWatchers());

describe("external writes are seen without this process writing them", () => {
  it("fs.watch mode: a file written by someone else bumps the root version", async () => {
    const { folders } = fixture();
    // Safety poll is 60s away, so only OS events can deliver this in time.
    const w = new RootWatcher(folders.departmentShared!, { forcePoll: false, safetyPollMs: 60_000 });
    try {
      assert.equal(w.mode, "watch", "recursive fs.watch did not attach on this OS");
      // macOS: the FSEvents stream behind a recursive fs.watch starts asynchronously and
      // does not replay writes made before it is live; under a parallel test run that
      // gap is long enough to swallow an immediate write (the app's safety poll covers
      // it in production). Let the stream come up before "the colleague" writes.
      if (process.platform === "darwin") await new Promise((r) => setTimeout(r, 500));
      const v0 = w.version;
      // Not through scopedWrite: this simulates another machine / Explorer.
      fs.writeFileSync(path.join(folders.departmentShared!, "from-colleague.md"), "hi\n");
      const seen = await waitFor(() => w.version > v0);
      assert.equal(seen, true, `version stayed at ${v0} in ${w.mode} mode`);
    } finally {
      w.close();
    }
  });

  it("poll mode (NAS / SMB fallback): the bounded metadata poll sees a new nested file", async () => {
    const { folders } = fixture();
    const w = new RootWatcher(folders.employeeShared!, { forcePoll: true, pollMs: 60 });
    try {
      assert.equal(w.mode, "poll");
      const v0 = w.version;
      fs.mkdirSync(path.join(folders.employeeShared!, "reports", "q3"), { recursive: true });
      fs.writeFileSync(path.join(folders.employeeShared!, "reports", "q3", "summary.md"), "x\n");
      const seen = await waitFor(() => w.version > v0);
      assert.equal(seen, true, "poll never noticed the external write");
      const v1 = w.version;
      // Modifying an existing file (size / mtime) is also a change.
      await new Promise((r) => setTimeout(r, 20));
      fs.appendFileSync(path.join(folders.employeeShared!, "reports", "q3", "summary.md"), "more\n");
      assert.equal(await waitFor(() => w.version > v1), true, "poll missed an in-place edit");
    } finally {
      w.close();
    }
  });

  it("poll is bounded: depth and entry caps are constants, and the walk stops at them", () => {
    assert.ok(POLL_MAX_DEPTH >= 2 && POLL_MAX_DEPTH <= 8);
    assert.ok(POLL_MAX_ENTRIES >= 500 && POLL_MAX_ENTRIES <= 10_000);
    const root = makeTempRoot("localbot-deep-");
    let cur = root;
    for (let i = 0; i < POLL_MAX_DEPTH + 3; i++) {
      cur = path.join(cur, `d${i}`);
      fs.mkdirSync(cur);
    }
    const fp = fingerprintRoot(root);
    const deepest = [...fp.keys()].reduce((m, k) => Math.max(m, k.split("/").length), 0);
    assert.equal(deepest, POLL_MAX_DEPTH, "walk went deeper than the cap");
    assert.ok(fp.size <= POLL_MAX_ENTRIES);
  });

  it("scopeStatuses starts one watcher per configured folder and never lists an unset scope", () => {
    stopAllWatchers();
    const { folders } = fixture();
    const list = scopeStatuses(folders, { forcePoll: true, pollMs: 60_000 });
    assert.deepEqual(
      list.map((s) => s.scope),
      ["private", "employee-shared", "department-shared"],
    );
    assert.equal(list.some((s) => s.scope === "company-shared"), false, "null scope was listed");
    for (const s of list) {
      assert.equal(s.status, "ok");
      assert.equal(typeof s.version, "number");
    }
    // Pointing companyShared at a folder adds it; dropping departmentShared removes it.
    const next: FoldersConfig = {
      ...folders,
      departmentShared: null,
      companyShared: path.join(path.dirname(folders.employeeRoot), "co"),
    };
    fs.mkdirSync(next.companyShared!, { recursive: true });
    const watchers = syncWatchers(next, { forcePoll: true, pollMs: 60_000 });
    assert.deepEqual([...watchers.keys()].sort(), ["companyShared", "employeeRoot", "employeeShared"]);
    assert.deepEqual(
      scopeStatuses(next, { forcePoll: true, pollMs: 60_000 }).map((s) => s.scope),
      ["private", "employee-shared", "company-shared"],
    );
    stopAllWatchers();
  });
});

describe("Refresh re-lists", () => {
  it("refreshScopes rescans now: a write the slow poll has not seen yet bumps version and shows up in the listing", async () => {
    stopAllWatchers();
    const { folders } = fixture();
    ensureAgent(folders, AGENT);
    // A poll interval far longer than the test: only Refresh can notice.
    const before = scopeStatuses(folders, { forcePoll: true, pollMs: 60 * 60 * 1000 });
    const dept0 = before.find((s) => s.scope === "department-shared")!;
    const listing0 = scopedList(folders, { scope: "department-shared", relPath: "", agentName: "Writer" }, false);
    assert.equal(listing0.some((e) => e.name === "external.md"), false);

    fs.writeFileSync(path.join(folders.departmentShared!, "external.md"), "from another laptop\n");
    await new Promise((r) => setTimeout(r, 30));

    const idle = scopeStatuses(folders).find((s) => s.scope === "department-shared")!;
    assert.equal(idle.version, dept0.version, "test setup: slow poll must not have run yet");

    const after = refreshScopes(folders).find((s) => s.scope === "department-shared")!;
    assert.ok(after.version > dept0.version, "Refresh did not rescan the root");
    const listing1 = scopedList(folders, { scope: "department-shared", relPath: "", agentName: "Writer" }, false);
    assert.equal(listing1.some((e) => e.name === "external.md"), true, "Refresh did not re-list");
    stopAllWatchers();
  });

  it("the Computer pane has a Refresh control wired to browseRefresh and re-lists on the watcher version", () => {
    const pane = fs.readFileSync(path.join(REPO, "src/components/localbot/computer.tsx"), "utf8");
    assert.ok(/aria-label="Refresh"/.test(pane), "no Refresh button");
    assert.ok(/browseRefresh\(\)/.test(pane), "Refresh does not call browseRefresh");
    assert.ok(/scopesStatus\(\)/.test(pane), "pane does not poll scopesStatus");
    assert.ok(/st\?\.version/.test(pane), "sections do not re-list on watcher version");
    const server = fs.readFileSync(path.join(REPO, "src/lib/fs/server.ts"), "utf8");
    assert.ok(/export const browseRefresh/.test(server));
    assert.ok(/export const scopesStatus/.test(server));
  });
});

describe("a missing share is an error, never a silent empty tree", () => {
  it("browse listing on a removed configured root throws DISCONNECTED (not [])", () => {
    const { folders } = fixture();
    ensureAgent(folders, AGENT);
    fs.writeFileSync(path.join(folders.departmentShared!, "a.md"), "a\n");
    assert.equal(
      scopedList(folders, { scope: "department-shared", relPath: "", agentName: "Writer" }, false).length,
      1,
    );
    fs.rmSync(folders.departmentShared!, { recursive: true, force: true });
    assert.equal(
      code(() => scopedList(folders, { scope: "department-shared", relPath: "", agentName: "Writer" }, false)),
      "DISCONNECTED",
    );
    assert.equal(
      code(() => resolveScopePath(folders, { scope: "department-shared", relPath: "x/y.md", agentName: "Writer" })),
      "DISCONNECTED",
    );
    // Other scopes keep working.
    assert.equal(code(() => scopedList(folders, { scope: "employee-shared", relPath: "", agentName: "Writer" }, false)), "OK");
    assert.equal(code(() => scopedList(folders, { scope: "private", relPath: "", agentName: "Writer" }, false)), "OK");
  });

  it("a write into a disconnected scope is refused and does not recreate the folder locally", () => {
    const { folders } = fixture();
    ensureAgent(folders, AGENT);
    fs.rmSync(folders.employeeShared!, { recursive: true, force: true });
    assert.equal(
      code(() =>
        scopedWrite(folders, { scope: "employee-shared", relPath: "notes.md", agentName: "Writer" }, "x"),
      ),
      "DISCONNECTED",
    );
    assert.equal(fs.existsSync(folders.employeeShared!), false, "LocalBot invented a local copy");
  });

  it("the watcher flips to disconnected with the OS reason and back to ok when the share returns", async () => {
    const { folders } = fixture();
    const w = new RootWatcher(folders.departmentShared!, { forcePoll: true, pollMs: 40 });
    try {
      assert.equal(w.status, "ok");
      const v0 = w.version;
      fs.rmSync(folders.departmentShared!, { recursive: true, force: true });
      assert.equal(await waitFor(() => w.status === "disconnected"), true);
      assert.match(w.error ?? "", /ENOENT|disconnected|missing/i);
      assert.ok(w.version > v0, "status flip must bump version so the pane re-renders");
      const v1 = w.version;
      fs.mkdirSync(folders.departmentShared!, { recursive: true });
      assert.equal(await waitFor(() => w.status === "ok"), true);
      assert.equal(w.error, null);
      assert.ok(w.version > v1);
    } finally {
      w.close();
    }
  });

  it("a missing agent private subfolder is still 'not created yet', not disconnected", () => {
    const { folders } = fixture();
    // employeeRoot exists; agents/Writer/private does not.
    let err: unknown = null;
    try {
      scopedList(folders, { scope: "private", relPath: "", agentName: "Writer" }, false);
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof Error);
    assert.equal(err instanceof ScopeError, false);
    assert.match((err as Error).message, /No such directory/);
  });
});

describe("path rules still hold on the browse path", () => {
  it("unset scope, .., absolute, drive and UNC are refused before touching disk", () => {
    const { folders } = fixture();
    const t = (scope: string, relPath: string) =>
      code(() => scopedList(folders, { scope: scope as never, relPath, agentName: "Writer" }, false));
    assert.equal(t("company-shared", ""), "SCOPE_UNSET");
    assert.equal(t("department-shared", "../emp-shared"), "BAD_PATH");
    assert.equal(t("department-shared", "a/../../x"), "BAD_PATH");
    assert.equal(t("department-shared", "/etc"), "BAD_PATH");
    assert.equal(t("department-shared", "C:\\Users"), "BAD_PATH");
    assert.equal(t("department-shared", "\\\\nas\\share"), "BAD_PATH");
    assert.equal(t("nope", ""), "BAD_SCOPE");
  });

  it("a symlink that leaves the scope is still ESCAPE", () => {
    const { folders, base } = fixture();
    const outside = path.join(base, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "secret.txt"), "s\n");
    fs.symlinkSync(outside, path.join(folders.departmentShared!, "link"), "dir");
    assert.equal(
      code(() => scopedList(folders, { scope: "department-shared", relPath: "link", agentName: "Writer" }, false)),
      "ESCAPE",
    );
  });
});

describe("Reveal in Finder / Explorer is one narrow IPC", () => {
  it("main.mjs handles localbot:revealPath with shell.showItemInFolder, gated to configured folders", () => {
    const main = fs.readFileSync(path.join(REPO, "desktop/main.mjs"), "utf8");
    assert.ok(main.includes('ipcMain.handle("localbot:revealPath"'), "no revealPath IPC");
    assert.ok(main.includes("shell.showItemInFolder("), "does not call showItemInFolder");
    assert.ok(/configuredFolderRoots\(\)/.test(main), "reveal is not gated to configured folders");
    const preload = fs.readFileSync(path.join(REPO, "desktop/preload.cjs"), "utf8");
    assert.ok(preload.includes('ipcRenderer.invoke("localbot:revealPath"'), "preload does not expose revealPath");
    // Still narrow: no Node / fs / shell reaches the renderer (the CJS preload requires electron only).
    assert.equal(/node:fs|child_process|require\("(?!electron")/.test(preload), false);
    const server = fs.readFileSync(path.join(REPO, "src/lib/fs/server.ts"), "utf8");
    assert.ok(/export const browseHostPath/.test(server), "no sidecar host-path lookup for reveal");
    assert.equal(/companyRoot\??:|allowedRoots\??:/.test(server), false, "browser-supplied roots crept back");
  });

  it("the pane uses the bridge only when Electron exposes it; the web preview keeps copy-path", () => {
    const pane = fs.readFileSync(path.join(REPO, "src/components/localbot/computer.tsx"), "utf8");
    assert.ok(/canRevealPath\(\)/.test(pane));
    assert.ok(/copy path/.test(pane));
    assert.ok(/browseHostPath\(/.test(pane), "reveal must resolve the host path on the sidecar");
  });
});