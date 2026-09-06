/**
 * Stage 19 — template excision. Every gate in scripts/excise-gates.mjs is one
 * test here, so `npm test` fails the moment a template module, package, or
 * import comes back — and the moment a LocalBot invariant the earlier stages
 * rely on (runAgentTurn in chat.tsx, the token middleware, the quit
 * coordinator, the dsh / ACP pins, the localbot-fs.mjs hash) is dropped.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  ACP_SDK_PIN,
  DSH_PIN,
  FORBIDDEN_DEPS,
  GONE,
  IMPORT_ROOTS,
  LOCALBOT_FS_SHA256,
  excisionGates,
  isTemplateSpecifier,
  templateImportsIn,
} from "../../scripts/excise-gates.mjs";

const root = process.cwd();
const results = excisionGates(root);

describe("Stage 19 — excision gates on this tree", () => {
  it("produced gates", () => {
    assert.ok(results.length > 60, `expected a full gate list, got ${results.length}`);
  });
  for (const r of results) {
    it(r.label, () => {
      assert.equal(r.ok, true, r.label);
    });
  }
});

describe("Stage 19 — the gates themselves catch a regression", () => {
  function scratch(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-excise-"));
    // A minimal LocalBot-shaped tree: the gates read these files.
    const write = (p: string, s: string) => {
      fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
      fs.writeFileSync(path.join(dir, p), s);
    };
    const copy = (p: string) => write(p, fs.readFileSync(path.join(root, p), "utf8"));
    for (const p of [
      "package.json",
      "vite.config.ts",
      "src/routes/__root.tsx",
      "src/lib/runtime/turn.ts",
      "src/lib/runtime/harness-launch.ts",
      "src/components/localbot/chat.tsx",
      "src/start.ts",
      "src/lib/runtime/sidecar-token-middleware.ts",
      "desktop/sidecar-token.mjs",
      "desktop/main.mjs",
      "desktop/quit-flush.mjs",
      "src/lib/quit-flush.ts",
      "src/lib/quit-flush-core.ts",
      "src/lib/pending-writes.ts",
      "dsh/localbot-fs.mjs",
      "scripts/desktop-stage.mjs",
      "src/lib/fs/server.ts",
      "src/lib/fs/disk.ts",
      "src/lib/fs/scopes.ts",
      "src/lib/harness/index.ts",
      "src/lib/runtime/harness.ts",
      "src/runtime/harnessAdapter.ts",
      "src/lib/harness/process.ts",
    ]) {
      copy(p);
    }
    return dir;
  }
  const failing = (dir: string) =>
    excisionGates(dir)
      .filter((r) => !r.ok)
      .map((r) => r.label);

  it("a clean copy passes", () => {
    const dir = scratch();
    try {
      assert.deepEqual(failing(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("src/lib/auth back on disk fails", () => {
    const dir = scratch();
    try {
      fs.mkdirSync(path.join(dir, "src/lib/auth"));
      fs.writeFileSync(path.join(dir, "src/lib/auth/server.ts"), "export const x = 1;\n");
      assert.ok(failing(dir).includes("gone: src/lib/auth"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a component importing @/lib/auth fails", () => {
    const dir = scratch();
    try {
      fs.writeFileSync(
        path.join(dir, "src/components/localbot/leak.tsx"),
        'import { AuthProvider } from "@/lib/auth/provider";\nexport const L = AuthProvider;\n',
      );
      assert.ok(failing(dir).some((l) => l.startsWith("src/components: no import")));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a runtime module importing lib/db or app-data fails", () => {
    const dir = scratch();
    try {
      fs.writeFileSync(
        path.join(dir, "src/lib/runtime/leak.ts"),
        'import { getSql } from "../db";\nimport { appData } from "@/lib/app-data";\nexport { getSql, appData };\n',
      );
      const f = failing(dir);
      assert.ok(
        f.some((l) => l.startsWith("src/lib/runtime: no import")),
        f.join("\n"),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("better-auth back in package.json deps fails", () => {
    const dir = scratch();
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      pkg.dependencies["better-auth"] = "~1.6.30";
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
      assert.ok(
        failing(dir).some(
          (l) => l.startsWith("package.json deps: no better-auth") && l.includes("better-auth"),
        ),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('api.x.ai or `from "pg"` in shipped source fails', () => {
    const dir = scratch();
    try {
      fs.writeFileSync(
        path.join(dir, "src/lib/runtime/hosted.ts"),
        'export const url = "https://api.x.ai/v1/chat/completions";\n',
      );
      fs.writeFileSync(
        path.join(dir, "desktop/pool.mjs"),
        'import { Pool } from "pg";\nexport { Pool };\n',
      );
      const f = failing(dir).filter((l) => l.startsWith("src/ scripts/ desktop/ vite.config.ts"));
      assert.equal(f.length, 1, f.join("\n"));
      assert.match(f[0], /hosted\.ts/);
      assert.match(f[0], /pool\.mjs/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("build running db:migrate again fails", () => {
    const dir = scratch();
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      pkg.scripts.build = "vite build && npm run db:migrate";
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
      const f = failing(dir);
      assert.ok(
        f.some((l) => l.startsWith('build is "vite build"')),
        f.join("\n"),
      );
      assert.ok(f.includes("no script runs db:migrate / migrate.mjs"), f.join("\n"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("npm test running a template suite again fails", () => {
    const dir = scratch();
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      pkg.scripts.test = "node --test 'scripts/**/*.test.mjs' && " + pkg.scripts.test;
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
      assert.ok(failing(dir).includes("npm test no longer runs scripts/**/*.test.mjs"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("chat.tsx dropping runAgentTurn fails", () => {
    const dir = scratch();
    try {
      const p = path.join(dir, "src/components/localbot/chat.tsx");
      fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/runAgentTurn/g, "runSomethingElse"));
      assert.ok(failing(dir).includes("chat.tsx keeps runAgentTurn"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("start.ts emptying functionMiddleware fails", () => {
    const dir = scratch();
    try {
      const p = path.join(dir, "src/start.ts");
      fs.writeFileSync(
        p,
        fs
          .readFileSync(p, "utf8")
          .replace("functionMiddleware: [sidecarTokenMiddleware]", "functionMiddleware: [ ]"),
      );
      assert.ok(failing(dir).includes("src/start.ts keeps the Stage 17 token gate (and CSRF)"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("main.mjs without the quit coordinator fails", () => {
    const dir = scratch();
    try {
      const p = path.join(dir, "desktop/main.mjs");
      fs.writeFileSync(
        p,
        fs.readFileSync(p, "utf8").replace(/createQuitCoordinator\(/g, "noCoordinator("),
      );
      assert.ok(failing(dir).includes("desktop/main.mjs keeps the Stage 18 quit coordinator"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a floating dsh pin, a changed localbot-fs.mjs, and serverDir back in vite.config.ts all fail", () => {
    const dir = scratch();
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      pkg.dependencies["@deepseek-ai/dsh"] = "^" + DSH_PIN;
      pkg.dependencies["@agentclientprotocol/sdk"] = "^" + ACP_SDK_PIN;
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
      fs.appendFileSync(path.join(dir, "dsh/localbot-fs.mjs"), "\n// drift\n");
      const v = path.join(dir, "vite.config.ts");
      fs.writeFileSync(
        v,
        fs
          .readFileSync(v, "utf8")
          .replace("nitro({", 'nitro({\n            serverDir: "./server",'),
      );
      const f = failing(dir);
      assert.ok(
        f.some((l) => l.startsWith("dsh pin is exact")),
        f.join("\n"),
      );
      assert.ok(
        f.some((l) => l.startsWith("ACP SDK pin is exact")),
        f.join("\n"),
      );
      assert.ok(f.includes("dsh/localbot-fs.mjs unchanged (sha256 pin)"), f.join("\n"));
      assert.ok(f.includes('vite.config.ts: no serverDir: "./server"'), f.join("\n"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("__root.tsx mounting AuthProvider or the /__grok manifest fails", () => {
    const dir = scratch();
    try {
      const p = path.join(dir, "src/routes/__root.tsx");
      fs.writeFileSync(
        p,
        fs
          .readFileSync(p, "utf8")
          .replace("<Outlet />", "<AuthProvider><Outlet /></AuthProvider>")
          .replace(
            '{ rel: "stylesheet", href: appCss },',
            '{ rel: "stylesheet", href: appCss },\n      { rel: "manifest", href: "/__grok/manifest.webmanifest" },',
          ),
      );
      const f = failing(dir);
      assert.ok(f.includes("__root.tsx: no AuthProvider"), f.join("\n"));
      assert.ok(f.includes("__root.tsx: no /__grok/* manifest or icon tags"), f.join("\n"));
      assert.ok(f.includes("__root.tsx: plain <Outlet /> then <Scripts />"), f.join("\n"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("sidecarTokenPlugin() moved after tanstackStart() fails", () => {
    const dir = scratch();
    try {
      const v = path.join(dir, "vite.config.ts");
      fs.writeFileSync(
        v,
        fs
          .readFileSync(v, "utf8")
          .replace("    sidecarTokenPlugin(),\n", "")
          .replace("    tanstackStart(),\n", "    tanstackStart(),\n    sidecarTokenPlugin(),\n"),
      );
      assert.ok(
        failing(dir).includes("vite.config.ts: sidecarTokenPlugin() before tanstackStart()"),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("turn.ts reading XAI_API_KEY again fails", () => {
    const dir = scratch();
    try {
      const p = path.join(dir, "src/lib/runtime/turn.ts");
      fs.appendFileSync(p, "\nexport const hostedOn = Boolean(process.env.XAI_API_KEY);\n");
      const f = failing(dir);
      assert.ok(f.includes("turn.ts: no hosted chain, no API key"), f.join("\n"));
      assert.ok(
        f.some(
          (l) => l.startsWith("src/ scripts/ desktop/ vite.config.ts") && l.includes("turn.ts"),
        ),
        f.join("\n"),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Stage 19 — gate constants", () => {
  it("cover the delete list the stage shipped", () => {
    for (const p of [
      "src/lib/auth",
      "src/lib/db.ts",
      "src/lib/app-data",
      "migrations",
      "server",
      "public/__grok",
      ".grok",
      "startup.sh",
      "scripts/with-app-env.mjs",
      "src/lib/runtime/execute-turn.ts",
      "src/lib/runtime/hosted-turn.ts",
    ]) {
      assert.ok(GONE.includes(p), p);
    }
    assert.deepEqual(IMPORT_ROOTS, [
      "src/components",
      "src/routes",
      "src/lib/fs",
      "src/lib/runtime",
      "src/lib/harness",
    ]);
    assert.deepEqual(FORBIDDEN_DEPS, [
      "better-auth",
      "kysely",
      "pg",
      "@types/pg",
      "@electric-sql/pglite",
      "jose",
    ]);
    assert.equal(
      LOCALBOT_FS_SHA256,
      "0bb5593abecbc116a7b3c614882cfc109831e88c45b735962ce14ef904c2b0a6",
    );
  });
  it("the import matcher hits the template specifiers and not LocalBot's", () => {
    for (const s of [
      "@/lib/auth/client",
      "../auth/isolation.server.ts",
      "@/lib/db",
      "../db.ts",
      "../db",
      "@/lib/app-data",
      "../app-data/index.ts",
      "./runtime/execute-turn.ts",
      "./hosted-turn.ts",
      "@/components/preview-host-bridge",
      "./scripts/grok-pwa-plugin.mjs",
      "../../scripts/migration-plan.mjs",
    ]) {
      assert.ok(isTemplateSpecifier(s), s);
    }
    for (const s of [
      "@/lib/runtime/sidecar-token-middleware",
      "../fs/disk.ts",
      "@/runtime/harnessAdapter",
      "./debug-log.ts",
      "./dbx.ts",
      "@/lib/authoring",
      "./scripts/sidecar-token-plugin.mjs",
      "@/lib/harness/turns",
    ]) {
      assert.equal(isTemplateSpecifier(s), false, s);
    }
    assert.deepEqual(
      templateImportsIn(
        'import { a } from "@/lib/auth/client";\nconst m = await import("./execute-turn.ts");\nconst p = require("pg");\nimport { ok } from "./fs/disk.ts";\n',
      ),
      ["@/lib/auth/client", "./execute-turn.ts"],
    );
  });
});
