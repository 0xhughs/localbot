/**
 * Stage 17 — Sidecar token.
 *
 * These fail when:
 *   - the token stops being 32 random bytes per launch, or is read from disk / git
 *   - the serving process keeps the token in its env (children would inherit it)
 *   - a missing / empty / wrong header is not refused with the right code
 *   - the compare stops being constant-time (timingSafeEqual)
 *   - src/start.ts stops registering the middleware as global functionMiddleware,
 *     or the middleware grows a dev / env exception
 *   - desktop/main.mjs stops minting per launch, stops passing the token to the
 *     sidecar env, or hands it to the window any other way than preload argv
 *   - desktop/sidecar.mjs starts without a token; preload.cjs stops exposing it
 *   - the dev server injects the meta for a non-loopback Host, or the packaged
 *     sidecar path could inject it at all
 *   - a token or a bypass knob is committed; a prove script skips the gate
 *   - chat.tsx drops runAgentTurn; dsh / ACP pins float; localbot-fs.mjs changes
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  holdSidecarToken,
  injectSidecarTokenMeta,
  isLoopbackHost,
  isSidecarToken,
  mintSidecarToken,
  SIDECAR_TOKEN_ARG,
  SIDECAR_TOKEN_BYTES,
  SIDECAR_TOKEN_ENV,
  SIDECAR_TOKEN_HEADER as HEADER_MJS,
  SIDECAR_TOKEN_META as META_MJS,
  takeSidecarToken,
  tokenFromArgv,
  verifySidecarToken,
} from "../../desktop/sidecar-token.mjs";
import { BYPASS_PATTERNS, hygieneProblems, shippedFiles } from "../../scripts/sidecar-token-hygiene.mjs";
import { devTokenInjector, wantsDevToken } from "../../scripts/sidecar-token-plugin.mjs";
import { ACP_SDK_PIN, DSH_PIN } from "./harness/process.ts";
import {
  isSidecarAuthError,
  readBrowserSidecarToken,
  SIDECAR_TOKEN_HEADER,
  SIDECAR_TOKEN_META,
  SidecarAuthError,
} from "./sidecar-token-model.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const LOCALBOT_FS_SHA256 = "0bb5593abecbc116a7b3c614882cfc109831e88c45b735962ce14ef904c2b0a6";

describe("Stage 17: token helpers (desktop/sidecar-token.mjs)", () => {
  it("mints 32 random bytes as 64 hex, different every call", () => {
    const a = mintSidecarToken();
    const b = mintSidecarToken();
    assert.equal(SIDECAR_TOKEN_BYTES, 32);
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(a, b);
    assert.ok(isSidecarToken(a));
    for (const bad of ["", "abc", a.slice(1), a.toUpperCase(), `${a}0`, 42, null, undefined]) assert.equal(isSidecarToken(bad), false);
  });

  it("takeSidecarToken: consumes the env once into the slot and removes it from the env", () => {
    const token = mintSidecarToken();
    const env: Record<string, string | undefined> = { [SIDECAR_TOKEN_ENV]: token, PATH: "/usr/bin" };
    const slots: Record<PropertyKey, unknown> = {};
    assert.equal(takeSidecarToken(env, slots), token);
    assert.equal(env[SIDECAR_TOKEN_ENV], undefined, "the env copy is gone so spawned children do not inherit it");
    assert.equal(env.PATH, "/usr/bin");
    assert.equal(takeSidecarToken(env, slots), token, "second read comes from memory");
    assert.equal(takeSidecarToken({}, {}), null, "no env, no slot → null (the server refuses)");
    assert.equal(takeSidecarToken({ [SIDECAR_TOKEN_ENV]: "not-a-token" }, {}), null);
    const held: Record<PropertyKey, unknown> = {};
    holdSidecarToken(token, held);
    assert.equal(takeSidecarToken({}, held), token);
    assert.throws(() => holdSidecarToken("short", {}));
  });

  it("verifySidecarToken: NO_TOKEN for missing / empty, BAD_TOKEN for anything not byte-equal", () => {
    const token = mintSidecarToken();
    assert.deepEqual(verifySidecarToken(token, token), { ok: true });
    for (const none of [undefined, null, "", "   ", 7]) assert.deepEqual(verifySidecarToken(token, none), { ok: false, code: "NO_TOKEN" });
    assert.deepEqual(verifySidecarToken(token, mintSidecarToken()), { ok: false, code: "BAD_TOKEN" });
    assert.deepEqual(verifySidecarToken(token, token.slice(0, 63)), { ok: false, code: "BAD_TOKEN" });
    assert.deepEqual(verifySidecarToken(token, `${token}0`), { ok: false, code: "BAD_TOKEN" });
    assert.deepEqual(verifySidecarToken(token, token.toUpperCase()), { ok: false, code: "BAD_TOKEN" });
    assert.deepEqual(verifySidecarToken("", token), { ok: false, code: "BAD_TOKEN" }, "a server with no token accepts nothing");
  });

  it("the compare is constant-time (timingSafeEqual), not ===", () => {
    const src = read("desktop/sidecar-token.mjs");
    assert.match(src, /import \{ randomBytes, timingSafeEqual \} from "node:crypto"/);
    assert.match(src, /timingSafeEqual\(a, probe\)/);
    assert.match(src, /randomBytes\(SIDECAR_TOKEN_BYTES\)\.toString\("hex"\)/);
    assert.doesNotMatch(src, /readFileSync|writeFileSync|localbot-config/, "the token never touches disk");
  });

  it("tokenFromArgv reads the preload argument and nothing else", () => {
    const token = mintSidecarToken();
    assert.equal(tokenFromArgv(["/app/electron", `${SIDECAR_TOKEN_ARG}${token}`, "--foo"]), token);
    assert.equal(tokenFromArgv([`${SIDECAR_TOKEN_ARG}nope`]), null);
    assert.equal(tokenFromArgv([]), null);
    assert.equal(tokenFromArgv([token]), null, "a bare hex arg is not the token");
  });

  it("isLoopbackHost: 127.0.0.1 / localhost / ::1 only", () => {
    for (const ok of ["127.0.0.1", "127.0.0.1:8080", "localhost", "LOCALHOST:8080", "[::1]", "[::1]:8080", "::1"]) assert.equal(isLoopbackHost(ok), true, ok);
    for (const no of ["0.0.0.0:8080", "10.1.2.3:8080", "172.30.0.2:8080", "192.168.1.5", "localbot.local", "127.0.0.1.evil.com", "127.0.0.2", "", undefined, null, 8080]) {
      assert.equal(isLoopbackHost(no), false, String(no));
    }
  });

  it("injectSidecarTokenMeta: meta right after <head>, untouched without <head> or without a valid token", () => {
    const token = mintSidecarToken();
    const html = `<!doctype html><html><head><title>LocalBot</title></head><body></body></html>`;
    const out = injectSidecarTokenMeta(html, token);
    assert.equal(out, `<!doctype html><html><head><meta name="${META_MJS}" content="${token}"><title>LocalBot</title></head><body></body></html>`);
    assert.equal(injectSidecarTokenMeta(`<html><head lang="en"><title>x</title></head></html>`, token).includes(`<head lang="en"><meta name="${META_MJS}"`), true);
    assert.equal(injectSidecarTokenMeta("<html><body>no head</body></html>", token), "<html><body>no head</body></html>");
    assert.equal(injectSidecarTokenMeta(html, "not-a-token"), html);
  });

  it("browser and Node halves agree on the header and meta names", () => {
    assert.equal(SIDECAR_TOKEN_HEADER, HEADER_MJS);
    assert.equal(SIDECAR_TOKEN_META, META_MJS);
    assert.equal(SIDECAR_TOKEN_HEADER, "x-localbot-token");
    assert.equal(SIDECAR_TOKEN_ENV, "LOCALBOT_SIDECAR_TOKEN");
    assert.doesNotMatch(read("src/lib/sidecar-token-model.ts"), /from "node:|process\.env/, "the browser half has no Node imports");
  });
});

describe("Stage 17: renderer side (src/lib/sidecar-token-model.ts)", () => {
  it("readBrowserSidecarToken prefers the preload bridge, then the dev meta, else empty", () => {
    const bridgeToken = mintSidecarToken();
    const metaToken = mintSidecarToken();
    const doc = (content: string | null) => ({
      querySelector: (sel: string) => (sel === `meta[name="${SIDECAR_TOKEN_META}"]` && content !== null ? { getAttribute: () => content } : null),
    });
    assert.equal(readBrowserSidecarToken({ localbotDesktop: { sidecarToken: bridgeToken }, document: doc(metaToken) }), bridgeToken);
    assert.equal(readBrowserSidecarToken({ localbotDesktop: { sidecarToken: null }, document: doc(metaToken) }), metaToken, "main did not start the UI server → the document's token");
    assert.equal(readBrowserSidecarToken({ document: doc(metaToken) }), metaToken);
    assert.equal(readBrowserSidecarToken({ document: doc(null) }), "");
    assert.equal(readBrowserSidecarToken(undefined), "");
  });

  it("SidecarAuthError carries code + status; NO_TOKEN / BAD_TOKEN are 401, SERVER_NO_TOKEN is 503", () => {
    assert.equal(new SidecarAuthError("NO_TOKEN").status, 401);
    assert.equal(new SidecarAuthError("BAD_TOKEN").status, 401);
    assert.equal(new SidecarAuthError("SERVER_NO_TOKEN").status, 503);
    const e = new SidecarAuthError("BAD_TOKEN");
    assert.equal(e.code, "BAD_TOKEN");
    assert.equal(e.name, "SidecarAuthError");
    assert.ok(isSidecarAuthError(e));
    assert.ok(isSidecarAuthError(Object.assign(new Error("x"), { code: "NO_TOKEN" })), "a deserialized copy still counts");
    assert.equal(isSidecarAuthError(new Error("plain")), false);
  });
});

describe("Stage 17: dev-server plugin (scripts/sidecar-token-plugin.mjs)", () => {
  const token = mintSidecarToken();
  type Chunk = string | Buffer | undefined;
  function fakeRes(contentType: string) {
    const chunks: Chunk[] = [];
    const headers: Record<string, string> = { "content-type": contentType, "content-length": "999" };
    let headersSent = false;
    const res = {
      get headersSent() {
        return headersSent;
      },
      getHeader: (n: string) => headers[n.toLowerCase()],
      removeHeader: (n: string) => {
        delete headers[n.toLowerCase()];
      },
      write: (c: Chunk) => {
        headersSent = true;
        chunks.push(c);
        return true;
      },
      end: (c?: Chunk) => {
        headersSent = true;
        if (c !== undefined) chunks.push(c);
      },
    };
    return { res, chunks, headers };
  }
  const html = `<!doctype html><html><head><title>LocalBot</title></head><body>x</body></html>`;

  it("wantsDevToken: GET + loopback Host + HTML only", () => {
    assert.equal(wantsDevToken({ method: "GET", headers: { host: "127.0.0.1:8080", accept: "text/html,*/*" } }), true);
    assert.equal(wantsDevToken({ method: "GET", headers: { host: "localhost:8080", accept: "text/html" } }), true);
    assert.equal(wantsDevToken({ method: "GET", headers: { host: "10.1.2.3:8080", accept: "text/html" } }), false, "LAN Host");
    assert.equal(wantsDevToken({ method: "GET", headers: { host: "0.0.0.0:8080", accept: "text/html" } }), false);
    assert.equal(wantsDevToken({ method: "POST", headers: { host: "127.0.0.1:8080", accept: "text/html" } }), false);
    assert.equal(wantsDevToken({ method: "GET", headers: { host: "127.0.0.1:8080", accept: "application/json" } }), false, "fetch() for JSON never gets the meta");
    assert.equal(wantsDevToken({ method: "GET", headers: { host: "127.0.0.1:8080" } }), false);
  });

  it("devTokenInjector: injects into a loopback HTML document via write and via end", () => {
    const a = fakeRes("text/html; charset=utf-8");
    let nexted = 0;
    devTokenInjector(token)({ method: "GET", headers: { host: "127.0.0.1:8080", accept: "text/html" } } as never, a.res as never, () => {
      nexted++;
    });
    assert.equal(nexted, 1);
    a.res.write(Buffer.from(html));
    a.res.end();
    assert.equal(Buffer.concat(a.chunks.filter(Boolean).map((c) => Buffer.from(c as Buffer | string))).toString("utf8"), injectSidecarTokenMeta(html, token));
    assert.equal(a.headers["content-length"], undefined, "a fixed length would truncate the grown document");

    const b = fakeRes("text/html");
    devTokenInjector(token)({ method: "GET", headers: { host: "localhost:8080", accept: "text/html" } } as never, b.res as never, () => {});
    b.res.end(html);
    assert.equal(String(b.chunks[0]), injectSidecarTokenMeta(html, token));
  });

  it("devTokenInjector: leaves non-HTML, non-loopback and POST responses alone", () => {
    const js = fakeRes("text/javascript");
    devTokenInjector(token)({ method: "GET", headers: { host: "127.0.0.1:8080", accept: "text/html" } } as never, js.res as never, () => {});
    js.res.end(html);
    assert.equal(String(js.chunks[0]), html, "content-type is not HTML");
    assert.equal(js.headers["content-length"], "999");

    const lan = fakeRes("text/html");
    devTokenInjector(token)({ method: "GET", headers: { host: "172.30.0.2:8080", accept: "text/html" } } as never, lan.res as never, () => {});
    lan.res.end(html);
    assert.equal(String(lan.chunks[0]), html, "LAN Host: no token in the document");

    const post = fakeRes("text/html");
    devTokenInjector(token)({ method: "POST", headers: { host: "127.0.0.1:8080", accept: "text/html" } } as never, post.res as never, () => {});
    post.res.end(html);
    assert.equal(String(post.chunks[0]), html);
  });

  it("the plugin is dev-server only and the packaged sidecar has no injection path", () => {
    const plugin = read("scripts/sidecar-token-plugin.mjs");
    assert.match(plugin, /apply: "serve"/);
    assert.match(plugin, /if \(env\.isPreview\) return;/);
    assert.match(plugin, /configureServer\(server\)/);
    assert.doesNotMatch(plugin, /configurePreviewServer/, "preview (the Nitro build) never carries the token in HTML");
    assert.doesNotMatch(read("desktop/sidecar.mjs"), /injectSidecarTokenMeta|SIDECAR_TOKEN_META/);
    for (const f of ["src/routes/__root.tsx", "src/routes/index.tsx", "server/middleware/grok-pwa.ts"]) {
      assert.doesNotMatch(read(f), /sidecar-token|localbot-sidecar-token|LOCALBOT_SIDECAR_TOKEN/, `${f} must not serve the token`);
    }
    const vite = read("vite.config.ts");
    assert.match(vite, /import \{ sidecarTokenPlugin \} from "\.\/scripts\/sidecar-token-plugin\.mjs"/);
    assert.ok(vite.indexOf("sidecarTokenPlugin()") < vite.indexOf("tanstackStart()"), "registered before tanstackStart so it wraps the response");
  });
});

describe("Stage 17: the gate is global and has no exception", () => {
  it("src/start.ts registers sidecarTokenMiddleware as functionMiddleware and keeps CSRF", () => {
    const start = read("src/start.ts");
    assert.match(start, /export const startInstance = createStart\(/);
    assert.match(start, /functionMiddleware: \[sidecarTokenMiddleware\]/);
    assert.match(start, /requestMiddleware: \[csrfMiddleware\]/);
    assert.match(start, /createCsrfMiddleware\(\{\s*filter: \(ctx\) => ctx\.handlerType === "serverFn",/);
    assert.match(start, /key: "SidecarAuthError"/, "the 401 body carries `code` through the serialization adapter");
  });

  it("the middleware sends x-localbot-token from the client and asserts it on the server", () => {
    const mw = read("src/lib/runtime/sidecar-token-middleware.ts");
    assert.match(mw, /createMiddleware\(\{ type: "function" \}\)/);
    assert.match(mw, /\.client\(async \(\{ next \}\) => \{\s*return next\(\{ headers: \{ \[SIDECAR_TOKEN_HEADER\]: readBrowserSidecarToken\(\) \} \}\);/);
    assert.match(mw, /\.server\(async \(\{ next \}\) => \{\s*const \{ assertSidecarRequest \} = await import\("\.\/sidecar-token\.server\.ts"\);\s*assertSidecarRequest\(\);\s*return next\(\);/);
    const server = read("src/lib/runtime/sidecar-token.server.ts");
    assert.match(server, /const expected = takeSidecarToken\(\);/);
    assert.match(server, /fail\(new SidecarAuthError\("SERVER_NO_TOKEN"\)\)/, "a server without a token refuses every function");
    assert.match(server, /verifySidecarToken\(expected, presented\)/);
    assert.match(server, /setResponseStatus\(err\.status/);
    for (const f of [mw, server, read("src/start.ts"), read("desktop/sidecar-token.mjs")]) {
      assert.doesNotMatch(f, /NODE_ENV|import\.meta\.env\.(DEV|MODE|PROD)|LOCALBOT_PACKAGED|isPackagedMode/, "no dev / packaged branch around the gate");
      for (const re of BYPASS_PATTERNS) assert.doesNotMatch(f, re);
    }
  });

  it("no bypass knob and no committed token anywhere in shipped code or prove scripts", () => {
    const files = shippedFiles(root);
    assert.ok(files.length > 100, `scans the real tree (${files.length} files)`);
    for (const must of ["src/start.ts", "desktop/main.mjs", "scripts/prove-token.mjs", "dsh/localbot-fs.mjs", "package.json"]) assert.ok(files.includes(must), `${must} is scanned`);
    assert.deepEqual(hygieneProblems(root), []);
    // The rules themselves catch what they are meant to catch.
    // (assembled so this file does not trip its own scan)
    assert.ok(BYPASS_PATTERNS.some((re) => re.test(`if (process.env.${"LOCALBOT_"}${"SKIP_TOKEN"}) return next();`)));
    assert.ok(BYPASS_PATTERNS.some((re) => re.test(`const ${"disable"}${"SidecarToken"} = true`)));
  });

  it("desktop/main.mjs mints per launch, hands the token to the child env and the window's preload argv only", () => {
    const main = read("desktop/main.mjs");
    assert.match(main, /import \{ mintSidecarToken, SIDECAR_TOKEN_ARG, SIDECAR_TOKEN_ENV \} from "\.\/sidecar-token\.mjs"/);
    assert.match(main, /^const sidecarToken = mintSidecarToken\(\);/m, "one token per process launch");
    assert.equal((main.match(/\[SIDECAR_TOKEN_ENV\]: sidecarToken,/g) ?? []).length, 2, "sidecar env (packaged) and npm run dev env (desktop dev)");
    assert.match(main, /additionalArguments: tokenForWindow \? \[`\$\{SIDECAR_TOKEN_ARG\}\$\{tokenForWindow\}`\] : \[\]/);
    assert.match(main, /await createWindow\(load\.url, sidecarToken\)/);
    assert.match(main, /const \{ url, tokenForWindow \} = await ensureDevUi\(\);\s*await createWindow\(url, tokenForWindow\);/);
    assert.match(main, /if \(await up\(url, 1200\)\) return \{ url, tokenForWindow: null \};/, "a dev server we did not start: the document carries its own token");
    assert.match(main, /LocalBot is already running \(\$\{SIDECAR_URL\} is taken\)/, "a sidecar we did not start is refused, not reused");
    assert.doesNotMatch(main, /ipcMain\.handle\("localbot:(token|sidecarToken)/, "no IPC that hands the token to whoever asks");
    assert.doesNotMatch(main, /writeFileSync\([^)]*sidecarToken|sidecarToken[^\n]*writeFileSync/, "never written to disk");
  });

  it("desktop/sidecar.mjs refuses to start without a token; preload.cjs exposes it from argv", () => {
    const sidecar = read("desktop/sidecar.mjs");
    assert.match(sidecar, /import \{ isSidecarToken, SIDECAR_TOKEN_ENV \} from "\.\/sidecar-token\.mjs"/);
    assert.match(sidecar, /if \(!isSidecarToken\(process\.env\[SIDECAR_TOKEN_ENV\]\)\) \{[\s\S]*?process\.exit\(1\);/);
    assert.ok(sidecar.indexOf("isSidecarToken(process.env[SIDECAR_TOKEN_ENV])") < sidecar.indexOf("await import(pathToFileURL"), "refused before the server is imported");

    const preload = read("desktop/preload.cjs");
    assert.match(preload, /const SIDECAR_TOKEN_ARG = "--localbot-sidecar-token=";/);
    assert.equal(SIDECAR_TOKEN_ARG, "--localbot-sidecar-token=", "preload (CJS) duplicates the prefix; keep them equal");
    assert.match(preload, /for \(const a of process\.argv \|\| \[\]\)/);
    assert.match(preload, /\/\^\[0-9a-f\]\{64\}\$\/\.test\(v\)/);
    assert.match(preload, /^\s*sidecarToken,$/m, "exposed on window.localbotDesktop");
    assert.doesNotMatch(preload, /ipcRenderer\.(invoke|send)\([^)]*token/i);
    assert.match(read("src/lib/desktop-bridge.ts"), /sidecarToken\?: string \| null;/);
  });

  it("the packaged sidecar ships sidecar-token.mjs beside sidecar.mjs", () => {
    const build = read("scripts/build-desktop.mjs");
    assert.match(build, /desktop\/sidecar-token\.mjs"\), path\.join\(sidecarStage, "sidecar-token\.mjs"\)/);
    assert.match(build, /"resources\/localbot-sidecar\/sidecar-token\.mjs"/);
    assert.match(build, /"resources\/app\.asar\.unpacked\/desktop\/sidecar-token\.mjs"/);
  });

  it("npm test runs this file; npm run prove:token exists", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.match(pkg.scripts.test, /src\/lib\/sidecar-token\.test\.ts/);
    assert.match(pkg.scripts["prove:token"], /scripts\/prove-token\.mjs/);
  });
});

describe("Stage 17: untouched invariants", () => {
  it("chat.tsx still calls runAgentTurn; dsh / ACP pins exact; localbot-fs.mjs unchanged", () => {
    const chat = read("src/components/localbot/chat.tsx");
    assert.match(chat, /import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/);
    assert.match(chat, /await runAgentTurn\(\{/);
    const pkg = JSON.parse(read("package.json"));
    assert.equal(pkg.dependencies["@deepseek-ai/dsh"], "0.1.2-alpha.5");
    assert.equal(pkg.dependencies["@agentclientprotocol/sdk"], "1.4.0");
    assert.equal(DSH_PIN, "0.1.2-alpha.5");
    assert.equal(ACP_SDK_PIN, "1.4.0");
    assert.equal(createHash("sha256").update(read("dsh/localbot-fs.mjs")).digest("hex"), LOCALBOT_FS_SHA256);
  });
});
