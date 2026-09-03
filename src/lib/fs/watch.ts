/**
 * Sidecar-side change detection for the four folder scopes.
 *
 * One `RootWatcher` per configured folder (employeeRoot, employeeShared,
 * departmentShared, companyShared). Each root gets `fs.watch` when the OS can
 * deliver events, plus a bounded metadata poll: slow as a safety net in
 * `watch` mode, fast as the only source in `poll` mode (network mounts, UNC
 * paths, or platforms where recursive `fs.watch` is unavailable).
 *
 * A watcher never creates, moves, or writes anything. A root that cannot be
 * stat'ed is reported as `disconnected`; it is not replaced by a local copy.
 */
import fs from "node:fs";
import path from "node:path";
import type { FoldersConfig, ScopeId } from "../types.ts";
import { configuredScopes, SCOPE_META, type FolderKey } from "./scope-model.ts";

export type WatchMode = "watch" | "poll";

export type ScopeStatus = {
  scope: ScopeId;
  status: "ok" | "disconnected";
  mode: WatchMode;
  /** Monotonic per root. Bumps on any observed change or status flip. */
  version: number;
  error: string | null;
  checkedAt: string;
};

export type WatcherOptions = {
  /** Skip `fs.watch` and rely on the poll only. */
  forcePoll?: boolean;
  /** Poll interval in `poll` mode. */
  pollMs?: number;
  /** Safety poll interval in `watch` mode. */
  safetyPollMs?: number;
};

export const DEFAULT_POLL_MS = 2000;
export const DEFAULT_SAFETY_POLL_MS = 15000;
/** Bounded metadata walk: never deeper or wider than this per poll tick. */
export const POLL_MAX_DEPTH = 4;
export const POLL_MAX_ENTRIES = 2000;
const EVENT_DEBOUNCE_MS = 150;

const NETWORK_FSTYPES = new Set([
  "cifs",
  "smb3",
  "smbfs",
  "nfs",
  "nfs4",
  "afpfs",
  "9p",
  "davfs",
  "fuse.sshfs",
  "fuse.rclone",
  "fuse.gvfsd-fuse",
  "vboxsf",
  "prl_fs",
]);

function envPollMs(): number {
  const n = Number(process.env.LOCALBOT_WATCH_POLL_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_POLL_MS;
}

function envForcePoll(): boolean {
  return process.env.LOCALBOT_WATCH_MODE === "poll";
}

/**
 * Best-effort "is this a network mount" check. Linux reads /proc/self/mounts;
 * Windows treats UNC paths as network. Mapped drive letters and macOS
 * /Volumes cannot be classified without native calls, so they keep `fs.watch`
 * and rely on the safety poll.
 */
export function looksLikeNetworkMount(root: string): boolean {
  if (process.platform === "win32") return /^[\\/]{2}/.test(root);
  if (process.platform !== "linux") return false;
  let real = root;
  try {
    real = fs.realpathSync.native(root);
  } catch {
    /* use as-is */
  }
  let mounts: string;
  try {
    mounts = fs.readFileSync("/proc/self/mounts", "utf8");
  } catch {
    return false;
  }
  let bestLen = -1;
  let bestType = "";
  for (const line of mounts.split("\n")) {
    const parts = line.split(" ");
    if (parts.length < 3) continue;
    const mnt = parts[1].replace(/\\040/g, " ");
    const type = parts[2];
    if ((real === mnt || real.startsWith(mnt.endsWith("/") ? mnt : mnt + "/")) && mnt.length > bestLen) {
      bestLen = mnt.length;
      bestType = type;
    }
  }
  return NETWORK_FSTYPES.has(bestType);
}

type Fingerprint = Map<string, string>;

function describeFsError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT" || code === "ENOTDIR") return "Folder is missing or the drive is disconnected (ENOENT).";
  if (code) return `Folder is not reachable (${code}).`;
  return err instanceof Error ? err.message : String(err);
}

/** Bounded metadata snapshot of a root. Throws when the root itself cannot be read. */
export function fingerprintRoot(root: string): Fingerprint {
  const st = fs.statSync(root);
  if (!st.isDirectory()) throw new Error("Not a folder.");
  const out: Fingerprint = new Map();
  const stack: { abs: string; depth: number }[] = [{ abs: root, depth: 0 }];
  while (stack.length && out.size < POLL_MAX_ENTRIES) {
    const { abs, depth } = stack.pop()!;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of ents) {
      if (out.size >= POLL_MAX_ENTRIES) break;
      const p = path.join(abs, d.name);
      let s: fs.Stats;
      try {
        s = fs.lstatSync(p);
      } catch {
        continue;
      }
      const rel = path.relative(root, p).split(path.sep).join("/");
      out.set(rel, `${s.isDirectory() ? "d" : "f"}:${s.size}:${s.mtimeMs}`);
      if (s.isDirectory() && depth + 1 < POLL_MAX_DEPTH) stack.push({ abs: p, depth: depth + 1 });
    }
  }
  return out;
}

function sameFingerprint(a: Fingerprint, b: Fingerprint): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

export class RootWatcher {
  readonly root: string;
  version = 0;
  status: "ok" | "disconnected" = "ok";
  error: string | null = null;
  mode: WatchMode = "poll";
  checkedAt = 0;

  private fsw: fs.FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private debounce: NodeJS.Timeout | null = null;
  private snapshot: Fingerprint | null = null;
  private closed = false;
  private readonly pollMs: number;
  private readonly safetyPollMs: number;
  private readonly forcePoll: boolean;

  constructor(root: string, opts: WatcherOptions = {}) {
    this.root = path.resolve(root);
    this.pollMs = opts.pollMs ?? envPollMs();
    this.safetyPollMs = opts.safetyPollMs ?? DEFAULT_SAFETY_POLL_MS;
    this.forcePoll = opts.forcePoll ?? envForcePoll();
    this.scan(false);
    if (!this.forcePoll && !looksLikeNetworkMount(this.root)) this.tryWatch();
    this.schedule();
  }

  private tryWatch(): boolean {
    if (this.status !== "ok") return false;
    try {
      const w = fs.watch(this.root, { recursive: true, persistent: false }, () => this.onEvent());
      w.on("error", () => this.dropWatch());
      this.fsw = w;
      this.mode = "watch";
      return true;
    } catch {
      this.fsw = null;
      this.mode = "poll";
      return false;
    }
  }

  private dropWatch(): void {
    try {
      this.fsw?.close();
    } catch {
      /* already closed */
    }
    this.fsw = null;
    if (this.mode !== "poll") {
      this.mode = "poll";
      this.schedule();
    }
    this.scan(true);
  }

  private onEvent(): void {
    if (this.closed) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = null;
      // An event is a change even if the bounded snapshot cannot see it.
      const before = this.version;
      this.scan(true);
      if (this.version === before && this.status === "ok") this.bump();
    }, EVENT_DEBOUNCE_MS);
    this.debounce.unref?.();
  }

  private bump(): void {
    this.version += 1;
  }

  private schedule(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.closed) return;
    const ms = this.mode === "watch" ? this.safetyPollMs : this.pollMs;
    this.timer = setInterval(() => this.tick(), ms);
    this.timer.unref?.();
  }

  private tick(): void {
    if (this.closed) return;
    this.scan(true);
    // A root that came back after a disconnect gets its fs.watch re-attached.
    if (this.status === "ok" && this.mode === "poll" && !this.forcePoll && !this.fsw) {
      if (!looksLikeNetworkMount(this.root) && this.tryWatch()) this.schedule();
    }
  }

  /** Re-read the root's metadata. Flips status and bumps `version` on change. */
  scan(bumpOnChange: boolean): void {
    this.checkedAt = Date.now();
    let fp: Fingerprint;
    try {
      fp = fingerprintRoot(this.root);
    } catch (err) {
      const msg = describeFsError(err);
      const was = this.status;
      this.status = "disconnected";
      this.error = msg;
      this.snapshot = null;
      if (this.fsw) {
        try {
          this.fsw.close();
        } catch {
          /* ignore */
        }
        this.fsw = null;
        this.mode = "poll";
        this.schedule();
      }
      if (was === "ok" && bumpOnChange) this.bump();
      return;
    }
    const was = this.status;
    this.status = "ok";
    this.error = null;
    const changed = was !== "ok" || (this.snapshot !== null && !sameFingerprint(this.snapshot, fp));
    this.snapshot = fp;
    if (changed && bumpOnChange) this.bump();
  }

  /** Refresh: rescan now, regardless of interval. */
  forceRescan(): void {
    this.scan(true);
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = null;
    try {
      this.fsw?.close();
    } catch {
      /* ignore */
    }
    this.fsw = null;
  }

  toStatus(scope: ScopeId): ScopeStatus {
    return {
      scope,
      status: this.status,
      mode: this.mode,
      version: this.version,
      error: this.error,
      checkedAt: new Date(this.checkedAt).toISOString(),
    };
  }
}

/* ---------- registry: one watcher per configured folder ---------- */

const registry = new Map<string, RootWatcher>();

/** Start watchers for every configured folder; stop those no longer configured. */
export function syncWatchers(
  folders: FoldersConfig | null,
  opts?: WatcherOptions,
): Map<FolderKey, RootWatcher> {
  const wanted = new Map<FolderKey, string>();
  if (folders) {
    for (const key of Object.keys(folders) as FolderKey[]) {
      const v = folders[key];
      if (v) wanted.set(key, path.resolve(v));
    }
  }
  const keep = new Set(wanted.values());
  for (const [root, w] of registry) {
    if (!keep.has(root)) {
      w.close();
      registry.delete(root);
    }
  }
  const out = new Map<FolderKey, RootWatcher>();
  for (const [key, root] of wanted) {
    let w = registry.get(root);
    if (!w) {
      w = new RootWatcher(root, opts);
      registry.set(root, w);
    }
    out.set(key, w);
  }
  return out;
}

/** Status for each configured scope. Unset (`null`) scopes are not listed. */
export function scopeStatuses(folders: FoldersConfig | null, opts?: WatcherOptions): ScopeStatus[] {
  const watchers = syncWatchers(folders, opts);
  return configuredScopes(folders).map((scope) => {
    const w = watchers.get(SCOPE_META[scope].key)!;
    return w.toStatus(scope);
  });
}

/** Refresh: rescan every configured root now, then report. */
export function refreshScopes(folders: FoldersConfig | null, opts?: WatcherOptions): ScopeStatus[] {
  const watchers = syncWatchers(folders, opts);
  for (const w of watchers.values()) w.forceRescan();
  return scopeStatuses(folders, opts);
}

export function stopAllWatchers(): void {
  for (const w of registry.values()) w.close();
  registry.clear();
}
