/**
 * Stage 18 — Quit flush.
 *
 * These fail when:
 *   - desktop/main.mjs calls stopChildren() directly from before-quit /
 *     window-all-closed / anywhere but the coordinator, or before-quit stops
 *     holding the quit (preventDefault + quitReady), or the first win.close()
 *     is not routed through the coordinator
 *   - the coordinator kills the child before the renderer's ack or the timeout,
 *     runs stopChildren more than once for concurrent requestQuit calls, or
 *     its default timeout is not 2000 ms
 *   - preload.cjs drops onFlushRequest / flushDone, or the IPC names drift
 *     from quit-flush.mjs; the Stage 17 token bridge changes
 *   - store.ts: flushChatSaves is void again, stops awaiting the in-flight
 *     saves, or chatSave / channelsAppend / host-index writes are no longer
 *     tracked; pagehide becomes the Electron path again
 *   - the renderer flush stops cancelling turns, stops finishing claimed
 *     routines as "stopped", or does not answer flushDone when it throws
 *   - runAgentTurn stops registering turns; runRoutine stops registering claims
 *   - chat.tsx drops runAgentTurn; the token middleware leaves start.ts;
 *     dsh / ACP pins float; dsh/localbot-fs.mjs changes
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createQuitCoordinator, FLUSH_DONE_CHANNEL, FLUSH_REQUEST_CHANNEL, QUIT_FLUSH_TIMEOUT_MS } from "../../desktop/quit-flush.mjs";
import { ACP_SDK_PIN, DSH_PIN } from "./harness/process.ts";
import {
  claimedRoutines,
  inFlightTurns,
  pendingWriteCount,
  pendingWrites,
  registerRoutineClaim,
  registerTurn,
  resetPendingWritesForTests,
  trackWrite,
  tracked,
} from "./pending-writes.ts";
import { cancelInFlightTurns, capForRequest, FLUSH_COVERS, flushWith, installQuitFlushWith, RENDERER_FLUSH_CAP_MS, withCap } from "./quit-flush-core.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
/** Source without `//` line comments, so a gate counts code, not prose. */
const code = (src: string) => src.replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/[^\n"'`]*$/gm, "");
const LOCALBOT_FS_SHA256 = "0bb5593abecbc116a7b3c614882cfc109831e88c45b735962ce14ef904c2b0a6";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function harness(opts: { timeoutMs?: number; asked?: boolean; throwOnRequest?: boolean } = {}) {
  const order: string[] = [];
  const co = createQuitCoordinator({
    requestFlush: (reason) => {
      order.push(`requestFlush:${reason}`);
      if (opts.throwOnRequest) throw new Error("no webContents");
      return opts.asked ?? true;
    },
    stopChildren: () => {
      order.push("stopChildren");
    },
    quit: (o) => {
      order.push(`quit:${o.acked ? "acked" : o.asked ? "timeout" : "unasked"}`);
    },
    timeoutMs: opts.timeoutMs,
    log: () => {},
  });
  return { co, order };
}

describe("Stage 18 — createQuitCoordinator (desktop/quit-flush.mjs)", () => {
  it("default timeout is 2000 ms and the IPC names are the ones preload.cjs uses", () => {
    assert.equal(QUIT_FLUSH_TIMEOUT_MS, 2000);
    assert.equal(harness().co.timeoutMs, 2000);
    assert.equal(FLUSH_REQUEST_CHANNEL, "localbot:flush");
    assert.equal(FLUSH_DONE_CHANNEL, "localbot:flushDone");
  });

  it("ack path: requestFlush → flushDone → stopChildren → quit, in that order", async () => {
    const { co, order } = harness({ timeoutMs: 60_000 });
    assert.equal(co.phase, "idle");
    const p = co.requestQuit("before-quit");
    assert.equal(co.quitting, true);
    await tick();
    assert.deepEqual(order, ["requestFlush:before-quit"], "nothing but the flush request before the ack");
    await wait(30);
    assert.deepEqual(order, ["requestFlush:before-quit"], "stopChildren is unreachable while the renderer is still flushing");
    assert.equal(co.phase, "flushing");
    assert.equal(co.flushDone({ chats: 1 }), true);
    const out = await p;
    assert.deepEqual(order, ["requestFlush:before-quit", "stopChildren", "quit:acked"]);
    assert.equal(out.acked, true);
    assert.equal(out.timedOut, false);
    assert.deepEqual(out.summary, { chats: 1 });
    assert.equal(co.phase, "done");
    assert.equal(co.settled, true);
  });

  it("timeout path: no ack → stopChildren only after timeoutMs, outcome says timedOut", async () => {
    const { co, order } = harness({ timeoutMs: 80 });
    const t0 = Date.now();
    const p = co.requestQuit("window-close");
    await wait(30);
    assert.deepEqual(order, ["requestFlush:window-close"], "still waiting at 30 ms");
    const out = await p;
    assert.ok(Date.now() - t0 >= 75, `waited the full timeout (${Date.now() - t0} ms)`);
    assert.deepEqual(order, ["requestFlush:window-close", "stopChildren", "quit:timeout"]);
    assert.equal(out.acked, false);
    assert.equal(out.timedOut, true);
    assert.equal(out.asked, true);
    // A late ack is counted, not acted on.
    assert.equal(co.flushDone({}), false);
    assert.equal(co.lateAcks, 1);
  });

  it("re-entrant: Cmd+Q during a window-close flush joins the same promise; one stopChildren, one quit", async () => {
    const { co, order } = harness({ timeoutMs: 60_000 });
    const a = co.requestQuit("window-close");
    const b = co.requestQuit("before-quit");
    const c = co.requestQuit("window-all-closed");
    assert.equal(a, b);
    assert.equal(b, c);
    await tick();
    co.flushDone("ok");
    await a;
    assert.deepEqual(order, ["requestFlush:window-close", "stopChildren", "quit:acked"]);
    assert.equal(order.filter((x) => x === "stopChildren").length, 1);
    // After it settled, another requestQuit is still the same settled promise.
    assert.equal(co.requestQuit("again"), a);
  });

  it("no renderer to ask (quit during boot): no wait at all, stopChildren then quit", async () => {
    const { co, order } = harness({ timeoutMs: 60_000, asked: false });
    const t0 = Date.now();
    const out = await co.requestQuit("before-quit");
    assert.ok(Date.now() - t0 < 500, "did not sit on the timeout");
    assert.deepEqual(order, ["requestFlush:before-quit", "stopChildren", "quit:unasked"]);
    assert.equal(out.asked, false);
    assert.equal(out.acked, false);
  });

  it("requestFlush throwing counts as not asked (never hangs, never skips stopChildren)", async () => {
    const { co, order } = harness({ timeoutMs: 60_000, throwOnRequest: true });
    const out = await co.requestQuit("before-quit");
    assert.deepEqual(order, ["requestFlush:before-quit", "stopChildren", "quit:unasked"]);
    assert.equal(out.asked, false);
  });

  it("flushDone before any requestQuit is ignored (false) and does not pre-satisfy a later quit", async () => {
    const { co, order } = harness({ timeoutMs: 60 });
    assert.equal(co.flushDone({}), false);
    assert.equal(co.lateAcks, 0);
    const out = await co.requestQuit("before-quit");
    assert.equal(out.timedOut, true, "the stray ack did not count");
    assert.deepEqual(order, ["requestFlush:before-quit", "stopChildren", "quit:timeout"]);
  });

  it("refuses to be built without its three collaborators", () => {
    assert.throws(() => createQuitCoordinator({} as never), /requestFlush/);
    assert.throws(() => createQuitCoordinator({ requestFlush: () => true } as never), /stopChildren/);
    assert.throws(() => createQuitCoordinator({ requestFlush: () => true, stopChildren: () => {} } as never), /quit/);
  });
});

describe("Stage 18 — desktop/main.mjs routes every quit through the coordinator", () => {
  const main = code(read("desktop/main.mjs"));

  it("imports the coordinator and builds it with stopChildren, a quitReady quit and the 2 s constant", () => {
    assert.match(main, /import \{ createQuitCoordinator, FLUSH_DONE_CHANNEL, FLUSH_REQUEST_CHANNEL, QUIT_FLUSH_TIMEOUT_MS \} from "\.\/quit-flush\.mjs"/);
    assert.match(main, /const quitCoordinator = createQuitCoordinator\(\{[\s\S]*?requestFlush: requestRendererFlush,\s*stopChildren,\s*quit: \(\) => \{\s*quitReady = true;\s*app\.quit\(\);\s*\},\s*timeoutMs: QUIT_FLUSH_TIMEOUT_MS,/);
    assert.doesNotMatch(main, /timeoutMs:\s*\d/, "the timeout must be the shared constant, not a literal");
    assert.match(main, /ipcMain\.on\(FLUSH_DONE_CHANNEL, \(_e, summary\) => \{\s*quitCoordinator\.flushDone\(summary\);/);
    assert.match(main, /w\.webContents\.send\(FLUSH_REQUEST_CHANNEL, \{ reason, timeoutMs: QUIT_FLUSH_TIMEOUT_MS \}\)/);
    assert.match(main, /if \(wins\.length === 0\) return false;/, "no renderer → the coordinator must not wait");
  });

  it("stopChildren() is never called directly — only the definition remains", () => {
    const calls = main.match(/\bstopChildren\(\)/g) ?? [];
    assert.deepEqual(calls, ["stopChildren()"], `expected only the definition, got ${calls.length} occurrences`);
    assert.match(main, /function stopChildren\(\) \{/);
    // The only other place a sidecar handle is killed is the boot failure path (no window yet).
    const kills = main.match(/sidecarChild\??\.kill\(\)/g) ?? [];
    assert.equal(kills.length, 2, "stopChildren + the boot-timeout path only");
  });

  it("before-quit holds the quit until the renderer flushed, then lets the coordinator's app.quit() through", () => {
    const m = main.match(/app\.on\("before-quit", \(event\) => \{([\s\S]*?)\n\}\);/);
    assert.ok(m, "before-quit handler with an event argument");
    const body = m![1]!;
    assert.match(body, /if \(quitReady\) return;/);
    assert.match(body, /event\.preventDefault\(\);/);
    assert.match(body, /quitCoordinator\.requestQuit\("before-quit"\)/);
    assert.doesNotMatch(body, /stopChildren/, "before-quit must not kill the sidecar itself");
    assert.doesNotMatch(body, /app\.quit\(\)/, "before-quit must not re-enter app.quit itself; the coordinator does");
  });

  it("window-all-closed joins the coordinator instead of killing children", () => {
    const m = main.match(/app\.on\("window-all-closed", \(\) => \{([\s\S]*?)\n\}\);/);
    assert.ok(m, "window-all-closed handler");
    const body = m![1]!;
    assert.match(body, /quitCoordinator\.requestQuit\("window-all-closed"\)/);
    assert.doesNotMatch(body, /stopChildren/);
    assert.doesNotMatch(body, /app\.quit\(\)/, "app.quit() belongs to the coordinator's quit()");
  });

  it("the first win.close() is held for the flush; the window is destroyed after the coordinator settles", () => {
    const m = main.match(/win\.on\("close", \(event\) => \{([\s\S]*?)\n {2}\}\);/);
    assert.ok(m, "win.on(\"close\") handler");
    const body = m![1]!;
    assert.match(body, /if \(quitReady\) return;/);
    assert.match(body, /event\.preventDefault\(\);/);
    assert.match(body, /quitCoordinator\.requestQuit\("window-close"\)\.then\(\(\) => \{\s*if \(!win\.isDestroyed\(\)\) win\.destroy\(\);/);
    // The title-bar X still goes through win.close(), so it hits this handler.
    assert.match(main, /ipcMain\.on\("localbot:close", \(\) => win\.close\(\)\);/);
  });

  it("Stage 17 stays: one token per launch, env + argv hand-offs, sandboxed CJS preload", () => {
    assert.match(main, /const sidecarToken = mintSidecarToken\(\);/);
    assert.match(main, /\[SIDECAR_TOKEN_ENV\]: sidecarToken,/);
    assert.match(main, /additionalArguments: tokenForWindow \? \[`\$\{SIDECAR_TOKEN_ARG\}\$\{tokenForWindow\}`\] : \[\],/);
    assert.match(main, /preload: path\.join\(here, "preload\.cjs"\)/);
    assert.match(main, /sandbox: true/);
  });

  it("build-desktop asserts quit-flush.mjs is in the unpacked desktop dir the packaged main imports from", () => {
    assert.match(read("scripts/build-desktop.mjs"), /"resources\/app\.asar\.unpacked\/desktop\/quit-flush\.mjs"/);
    const pkg = JSON.parse(read("package.json"));
    assert.ok(pkg.build.files.includes("desktop/**/*.mjs"));
    assert.ok(pkg.build.asarUnpack.includes("desktop/**/*.mjs"));
  });
});

describe("Stage 18 — desktop/preload.cjs bridge", () => {
  const preload = read("desktop/preload.cjs");

  it("exposes onFlushRequest / flushDone on the same IPC names main uses", () => {
    assert.match(preload, /onFlushRequest: \(fn\) => \{[\s\S]*?ipcRenderer\.on\("localbot:flush", wrap\);[\s\S]*?return \(\) => ipcRenderer\.removeListener\("localbot:flush", wrap\);/);
    assert.match(preload, /flushDone: \(summary\) => ipcRenderer\.send\("localbot:flushDone", summary\)/);
    assert.ok(preload.includes(`"${FLUSH_REQUEST_CHANNEL}"`));
    assert.ok(preload.includes(`"${FLUSH_DONE_CHANNEL}"`));
  });

  it("the Stage 17 token bridge is unchanged", () => {
    assert.match(preload, /const SIDECAR_TOKEN_ARG = "--localbot-sidecar-token=";/);
    assert.match(preload, /return \/\^\[0-9a-f\]\{64\}\$\/\.test\(v\) \? v : null;/);
    assert.match(preload, /contextBridge\.exposeInMainWorld\("localbotDesktop", \{\s*platform: process\.platform,[\s\S]*?\n {2}sidecarToken,/);
    assert.doesNotMatch(preload, /^\s*import\s/m, "still CJS (sandbox: true)");
    assert.doesNotMatch(preload, /ipcRenderer\.(invoke|send)\([^)]*token/i, "the token never travels over IPC");
  });

  it("the TS bridge type declares both", () => {
    const bridge = read("src/lib/desktop-bridge.ts");
    assert.match(bridge, /onFlushRequest\?: \(fn: \(req: \{ reason: string; timeoutMs: number \}\) => void\) => \(\) => void;/);
    assert.match(bridge, /flushDone\?: \(summary: unknown\) => void;/);
    assert.match(bridge, /sidecarToken\?: string \| null;/);
  });
});

describe("Stage 18 — pending-writes registries", () => {
  it("trackWrite returns the same promise and forgets it when it settles (resolve or reject)", async () => {
    resetPendingWritesForTests();
    const ok = deferred<number>();
    const bad = deferred<number>();
    assert.equal(trackWrite(ok.promise), ok.promise);
    trackWrite(bad.promise);
    assert.equal(pendingWriteCount(), 2);
    ok.resolve(1);
    bad.reject(new Error("sidecar gone"));
    await bad.promise.catch(() => {});
    await tick();
    assert.equal(pendingWriteCount(), 0);
  });

  it("tracked(fn) keeps the call shape and the result", async () => {
    resetPendingWritesForTests();
    const fn = async (a: { data: { id: string } }) => ({ ok: true as const, id: a.data.id });
    const t = tracked(fn);
    const p = t({ data: { id: "x" } });
    assert.equal(pendingWriteCount(), 1);
    assert.deepEqual(await p, { ok: true, id: "x" });
    await tick();
    assert.equal(pendingWriteCount(), 0);
  });

  it("turns and routine claims register and forget", () => {
    resetPendingWritesForTests();
    let cancels = 0;
    const forget = registerTurn({ turnId: "t1", botId: "bot_a", cancel: () => cancels++ });
    const forgetClaim = registerRoutineClaim({ id: "rt_1", agentId: "bot_a" });
    assert.deepEqual(inFlightTurns().map((t) => t.turnId), ["t1"]);
    assert.deepEqual(claimedRoutines(), [{ id: "rt_1", agentId: "bot_a" }]);
    assert.equal(cancelInFlightTurns(), 1);
    assert.equal(cancels, 1);
    forget();
    forgetClaim();
    assert.equal(inFlightTurns().length, 0);
    assert.equal(claimedRoutines().length, 0);
    assert.equal(cancelInFlightTurns(), 0);
  });
});

describe("Stage 18 — renderer flush (quit-flush-core.ts)", () => {
  it("cap sits inside main's 2 s; capForRequest follows a smaller main timeout", () => {
    assert.equal(RENDERER_FLUSH_CAP_MS, 1800);
    assert.ok(RENDERER_FLUSH_CAP_MS < QUIT_FLUSH_TIMEOUT_MS);
    assert.equal(capForRequest(QUIT_FLUSH_TIMEOUT_MS), 1800);
    assert.equal(capForRequest(undefined), 1800);
    assert.equal(capForRequest(1000), 800);
    assert.equal(capForRequest(-5), 1800);
    assert.deepEqual([...FLUSH_COVERS], [
      "session/cancel for in-flight turns",
      "routinesFinish stopped for claimed routines",
      "chats/{id}.json (debounced + in-flight)",
      "channels/*.messages.json + host index (tracked writes)",
    ]);
  });

  it("withCap reports capped when the promise is slower than the cap", async () => {
    const never = new Promise<void>(() => {});
    const r = await withCap(never, 20);
    assert.equal(r.capped, true);
    const fast = await withCap(Promise.resolve(7), 1000);
    assert.deepEqual(fast, { capped: false, value: 7 });
  });

  it("flushWith: cancels turns first, finishes claimed routines, waits for chats + tracked writes, reports counts", async () => {
    const order: string[] = [];
    const chat = deferred<void>();
    const routine = deferred<unknown>();
    const channel = deferred<unknown>();
    const summaryP = flushWith(
      {
        cancelTurns: () => {
          order.push("cancel");
          return 2;
        },
        stopRoutines: () => {
          order.push("routines");
          return [routine.promise];
        },
        flushChats: () => {
          order.push("chats");
          return chat.promise;
        },
        otherWrites: () => {
          order.push("writes");
          return [channel.promise];
        },
        pendingChats: () => 3,
        inFlightChats: () => 1,
      },
      "before-quit",
      5000,
    );
    await tick();
    assert.deepEqual(order, ["cancel", "routines", "chats", "writes"]);
    let done = false;
    void summaryP.then(() => {
      done = true;
    });
    chat.resolve();
    await wait(10);
    assert.equal(done, false, "still waiting for the routine finish + the channel append");
    routine.resolve({ ok: true });
    channel.reject(new Error("Not saved"));
    const s = await summaryP;
    assert.equal(s.reason, "before-quit");
    assert.equal(s.turnsCancelled, 2);
    assert.equal(s.routinesStopped, 1);
    assert.equal(s.chatsPending, 3);
    assert.equal(s.chatsInFlight, 1);
    assert.equal(s.writesAwaited, 1);
    assert.equal(s.capped, false);
  });

  it("flushWith: a write that never answers is capped, never hangs, never throws", async () => {
    const s = await flushWith(
      {
        cancelTurns: () => {
          throw new Error("no turns");
        },
        stopRoutines: () => [],
        flushChats: () => new Promise<void>(() => {}),
        otherWrites: () => [Promise.reject(new Error("dead"))],
      },
      "window-close",
      40,
    );
    assert.equal(s.capped, true);
    assert.equal(s.turnsCancelled, 0);
    assert.ok(s.ms >= 35);
  });

  it("flushWith with the real registries: registered turns are cancelled and tracked writes awaited", async () => {
    resetPendingWritesForTests();
    let cancelled = 0;
    registerTurn({ turnId: "t9", botId: "b", cancel: () => cancelled++ });
    const w = deferred<void>();
    trackWrite(w.promise);
    const p = flushWith({ cancelTurns: cancelInFlightTurns, stopRoutines: () => [], flushChats: async () => {}, otherWrites: pendingWrites }, "q", 1000);
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    await wait(10);
    assert.equal(cancelled, 1);
    assert.equal(settled, false);
    w.resolve();
    const s = await p;
    assert.equal(s.writesAwaited, 1);
    assert.equal(s.capped, false);
    resetPendingWritesForTests();
  });

  function fakeBridge() {
    const acks: unknown[] = [];
    let handler: ((req: { reason: string; timeoutMs: number }) => void) | null = null;
    let removed = 0;
    const bridge = {
      platform: "linux",
      sidecarToken: null,
      setTitle: () => {},
      minimize: () => {},
      maximize: () => {},
      close: () => {},
      onSettings: () => () => {},
      onFlushRequest: (fn: (req: { reason: string; timeoutMs: number }) => void) => {
        handler = fn;
        return () => {
          removed++;
          handler = null;
        };
      },
      flushDone: (summary: unknown) => {
        acks.push(summary);
      },
    };
    return { bridge, acks, fire: (req: { reason: string; timeoutMs: number }) => handler?.(req), removed: () => removed, hasHandler: () => handler !== null };
  }

  it("installQuitFlushWith: main's request runs the flush with the derived cap and gets flushDone(summary)", async () => {
    const fb = fakeBridge();
    const runs: [string, number][] = [];
    const off = installQuitFlushWith(fb.bridge, async (reason, capMs) => {
      runs.push([reason, capMs]);
      return { reason, turnsCancelled: 0, routinesStopped: 0, chatsPending: 1, chatsInFlight: 0, writesAwaited: 0, capped: false, ms: 3 };
    });
    fb.fire({ reason: "before-quit", timeoutMs: 2000 });
    await tick();
    await tick();
    assert.deepEqual(runs, [["before-quit", 1800]]);
    assert.equal(fb.acks.length, 1);
    assert.equal((fb.acks[0] as { reason: string }).reason, "before-quit");
    off();
    assert.equal(fb.removed(), 1);
    assert.equal(fb.hasHandler(), false);
  });

  it("installQuitFlushWith: a throwing flush still answers flushDone (main must not sit on its timeout)", async () => {
    const fb = fakeBridge();
    installQuitFlushWith(fb.bridge, async () => {
      throw new Error("store exploded");
    });
    fb.fire({ reason: "window-close", timeoutMs: 2000 });
    await tick();
    await tick();
    assert.deepEqual(fb.acks, [{ reason: "window-close", error: "store exploded" }]);
  });

  it("installQuitFlushWith: two requests while one flush runs → one flush, one ack", async () => {
    const fb = fakeBridge();
    const gate = deferred<void>();
    let runs = 0;
    installQuitFlushWith(fb.bridge, async (reason) => {
      runs++;
      await gate.promise;
      return { reason, turnsCancelled: 0, routinesStopped: 0, chatsPending: 0, chatsInFlight: 0, writesAwaited: 0, capped: false, ms: 0 };
    });
    fb.fire({ reason: "window-close", timeoutMs: 2000 });
    fb.fire({ reason: "before-quit", timeoutMs: 2000 });
    await tick();
    assert.equal(runs, 1);
    gate.resolve();
    await tick();
    await tick();
    assert.equal(fb.acks.length, 1);
  });

  it("installQuitFlushWith: no bridge / a pre-Stage-18 bridge → no-op unsubscribe", () => {
    assert.equal(typeof installQuitFlushWith(undefined, async () => ({}) as never), "function");
    const old = { platform: "darwin", setTitle() {}, minimize() {}, maximize() {}, close() {}, onSettings: () => () => {} };
    assert.doesNotThrow(() => installQuitFlushWith(old, async () => ({}) as never)());
  });
});

describe("Stage 18 — renderer wiring (source gates)", () => {
  const store = read("src/lib/store.ts");
  const qf = read("src/lib/quit-flush.ts");
  const adapter = read("src/runtime/harnessAdapter.ts");
  const runner = read("src/runtime/routineRunner.ts");
  const shell = read("src/components/localbot/shell.tsx");

  it("store.ts: flushChatSaves is a Promise that fires the debounces and awaits the in-flight saves", () => {
    assert.match(store, /export async function flushChatSaves\(\): Promise<void> \{/);
    assert.doesNotMatch(store, /export function flushChatSaves\(\): void/);
    assert.match(store, /const chatSavesInFlight = new Set<Promise<void>>\(\);/);
    assert.match(store, /for \(const \[botId, t\] of chatTimers\) \{\s*clearTimeout\(t\);\s*chatTimers\.delete\(botId\);\s*waits\.push\(saveChatNow\(botId\)\);/);
    assert.match(store, /for \(const p of chatSavesInFlight\) waits\.push\(p\);\s*await Promise\.allSettled\(waits\);/);
    assert.match(store, /export function pendingChatSaveCount\(\): number/);
    assert.match(store, /export function inFlightChatSaveCount\(\): number/);
    assert.match(store, /await chatSave\(\{/, "the save still goes through chatSave (host-index.test.ts gate)");
  });

  it("store.ts: chatSave, channelsAppend and every host-index write are tracked; call sites keep their names", () => {
    assert.match(store, /import \{ tracked \} from "\.\/pending-writes";/);
    for (const fn of ["chatSave", "channelsAppend", "sectionCreate", "sectionDelete", "sectionRename", "stateMigrate", "statePatchAgent", "statePatchIndex", "stateReset"]) {
      assert.match(store, new RegExp(`^const ${fn} = tracked\\(${fn}Fn\\);$`, "m"), `${fn} must be the tracked binding`);
      assert.match(store, new RegExp(`\\b${fn} as ${fn}Fn,`), `${fn} is imported under the Fn alias`);
    }
    assert.match(store, /void statePatchAgent\(\{ data: \{ id, pinned \} \}\)/);
    assert.match(store, /await channelsAppend\(\{ data: \{ id: channelId, messages: \[message\] \} \}\)/);
  });

  it("store.ts: pagehide is the bare-browser fallback only — it steps aside when the bridge can flush", () => {
    assert.match(store, /window\.addEventListener\("pagehide", \(\) => \{\s*if \(typeof window\.localbotDesktop\?\.onFlushRequest === "function"\) return;\s*void flushChatSaves\(\);\s*\}\);/);
    assert.doesNotMatch(store, /addEventListener\("pagehide", flushChatSaves\)/, "the old fire-and-forget wiring is gone");
    assert.doesNotMatch(store, /keepalive/, "no fire-and-forget fetch was added instead of the handshake");
  });

  it("quit-flush.ts binds Stop's session/cancel, routinesFinish(stopped), the store flush and the write registry", () => {
    assert.match(qf, /import \{ flushChatSaves, inFlightChatSaveCount, pendingChatSaveCount \} from "\.\/store";/);
    assert.match(qf, /import \{ routinesFinish \} from "\.\/runtime\/routines";/);
    assert.match(qf, /cancelTurns: cancelInFlightTurns,/);
    assert.match(qf, /stopRoutines: \(\) => claimedRoutines\(\)\.map\(\(r\) => routinesFinish\(\{ data: \{ id: r\.id, status: "stopped", error: null \} \}\)\),/);
    assert.match(qf, /flushChats: flushChatSaves,/);
    assert.match(qf, /otherWrites: pendingWrites,/);
    assert.match(qf, /return installQuitFlushWith\(bridge, flushForQuit\);/);
    assert.doesNotMatch(qf, /harnessPrompt|createServerFn|\bdsh\b/, "no second Harness loop in the flush");
  });

  it("shell.tsx mounts installQuitFlush once; routines ticker stays", () => {
    assert.match(shell, /import \{ installQuitFlush \} from "@\/lib\/quit-flush";/);
    assert.match(shell, /useEffect\(\(\) => installQuitFlush\(\), \[\]\);/);
    assert.match(shell, /useRoutineTicker\(diskLoaded\);/);
  });

  it("runAgentTurn registers each turn with its session/cancel and forgets it in finally", () => {
    assert.match(adapter, /import \{ registerTurn \} from "@\/lib\/pending-writes";/);
    assert.match(adapter, /const forgetTurn = registerTurn\(\{ turnId, botId: opts\.botId, cancel: onAbort \}\);/);
    assert.match(adapter, /void harnessCancel\(\{ data: \{ turnId \} \}\);/);
    assert.match(adapter, /\} finally \{\s*forgetTurn\(\);\s*opts\.abort\.removeEventListener\("abort", onAbort\);/);
  });

  it("runRoutine registers the claim between routinesClaim and routinesFinish", () => {
    assert.match(runner, /import \{ registerRoutineClaim \} from "@\/lib\/pending-writes";/);
    assert.match(runner, /const claimed = await deps\.claim\(id, opts\.manual\);[\s\S]*?const forgetClaim = registerRoutineClaim\(\{ id, agentId: due\.agentId \}\);\s*try \{\s*return await runClaimedRoutine\(id, due, opts, deps\);\s*\} finally \{\s*forgetClaim\(\);/);
    assert.match(runner, /turn: runAgentTurn,/);
    assert.match(runner, /routinesFinish\(\{ data: \{ id, status, error \} \}\)/);
  });
});

describe("Stage 18 — invariants from earlier stages", () => {
  it("chat.tsx still calls runAgentTurn; the token middleware is global; dsh / ACP pins exact; localbot-fs.mjs unchanged", () => {
    const chat = read("src/components/localbot/chat.tsx");
    assert.match(chat, /import \{ runAgentTurn \} from "@\/runtime\/harnessAdapter"/);
    assert.match(chat, /await runAgentTurn\(\{/);
    const start = read("src/start.ts");
    assert.match(start, /functionMiddleware: \[sidecarTokenMiddleware\]/);
    assert.match(read("src/lib/runtime/sidecar-token-middleware.ts"), /assertSidecarRequest/);
    const pkg = JSON.parse(read("package.json"));
    assert.equal(pkg.dependencies["@deepseek-ai/dsh"], "0.1.2-alpha.5");
    assert.equal(pkg.dependencies["@agentclientprotocol/sdk"], "1.4.0");
    assert.equal(DSH_PIN, "0.1.2-alpha.5");
    assert.equal(ACP_SDK_PIN, "1.4.0");
    assert.equal(createHash("sha256").update(read("dsh/localbot-fs.mjs")).digest("hex"), LOCALBOT_FS_SHA256);
  });

  it("package.json runs this file in npm test and has prove:quit", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.match(pkg.scripts.test, /src\/lib\/quit-flush\.test\.ts/);
    assert.match(pkg.scripts["prove:quit"], /scripts\/prove-quit\.mjs/);
  });
});
