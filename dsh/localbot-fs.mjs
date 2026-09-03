/**
 * LocalBot scoped filesystem for DeepSeek Harness (`ctx.fs`).
 *
 * Runs inside the `dsh --profile acp` process. It keeps the official
 * `@deepseek-ai/dsh-fs-local` mechanics (realpath target identity, atomic
 * writes, literal edits, UTF-8 checks) and owns only the path → target step:
 * every path the model or a Harness plugin supplies is turned into
 * `{ scope, relPath, agentName }` and resolved through LocalBot's Stage 2
 * resolver (`src/lib/fs/scopes.ts`). That is the containment boundary —
 * the ACP session `cwd` is used only to identify the active agent.
 *
 *   - `private/x`, `employee-shared/x`, … name a scope explicitly
 *   - a bare relative path resolves against the session cwd (the agent's
 *     private root) and is then mapped back to a scope
 *   - a host-absolute path is accepted only when it already lies inside one
 *     of this agent's granted, connected scope roots; anything else is denied
 *   - `..`, drive / UNC paths, ungranted scopes and symlink escapes are
 *     refused by the resolver before the disk is touched
 *   - a vanished configured folder is `DISCONNECTED` (FS_IO_ERROR), never an
 *     empty tree and never recreated locally
 *   - tool results carry logical display paths (`private/hello.md`), never
 *     host paths
 *
 * Loaded by the Cordis patch `dsh/localbot-acp.cordis.yml` as row
 * `fs-localbot`. Requires `node --experimental-strip-types` because it imports
 * LocalBot's TypeScript resolver directly.
 */
import path from "node:path";
import { FsError } from "@deepseek-ai/dsh-fs";
import { LocalFileSystem } from "@deepseek-ai/dsh-fs-local";
import { isUnderDir, loadConfig } from "../src/lib/fs/disk.ts";
import { displayPath, isScopeId, SCOPE_IDS, folderFor } from "../src/lib/fs/scope-model.ts";
import { agentsDir, privateRoot, readAgent, resolveForAgent, ScopeError } from "../src/lib/fs/scopes.ts";

const DRIVE_RE = /^[a-zA-Z]:/;
const READ_ONLY_DISPLAY = new Set(["private/AGENTS.md"]);

function isHostAbsolute(p) {
  const u = p.replace(/\\/g, "/");
  return path.isAbsolute(p) || u.startsWith("/") || u.startsWith("//") || DRIVE_RE.test(u);
}

/** Map a LocalBot ScopeError onto the Harness FsError vocabulary without host paths. */
function toFsError(err, shown) {
  if (err instanceof FsError) return err;
  if (err instanceof ScopeError) {
    switch (err.code) {
      case "DISCONNECTED":
        return new FsError(err.message, "FS_IO_ERROR", { cause: err });
      case "ESCAPE":
        return new FsError(
          `Denied: "${shown}" resolves outside its folder scope.`,
          "FS_PERMISSION_DENIED",
          { cause: err },
        );
      case "NOT_CONFIGURED":
      case "BAD_SCOPE":
      case "SCOPE_UNSET":
      case "BAD_PATH":
      case "NOT_GRANTED":
      default:
        return new FsError(err.message, "FS_PERMISSION_DENIED", { cause: err });
    }
  }
  return err;
}

export class LocalBotScopedFileSystem extends LocalFileSystem {
  static Config = LocalFileSystem.Config;

  folders() {
    const cfg = loadConfig();
    if (!cfg.folders) {
      throw new FsError("LocalBot folders are not set up yet. Open Settings → Folders.", "FS_PERMISSION_DENIED");
    }
    return cfg.folders;
  }

  /**
   * The active agent is the one whose `agents/{Name}/private` contains the
   * session cwd. Anything else is not a LocalBot session.
   */
  agentFromCwd(folders, cwd) {
    const agents = agentsDir(folders);
    const abs = path.resolve(cwd ?? this.config.cwd);
    const rel = path.relative(agents, abs);
    const segs = rel.split(path.sep).filter(Boolean);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel) || segs.length < 2 || segs[1] !== "private") {
      throw new FsError(
        "This session is not bound to a LocalBot agent folder (cwd must be agents/{Name}/private).",
        "FS_PERMISSION_DENIED",
      );
    }
    const slug = segs[0];
    if (!readAgent(folders, slug)) {
      throw new FsError(`No LocalBot agent record for "${slug}".`, "FS_PERMISSION_DENIED");
    }
    return slug;
  }

  scopeRootOrNull(folders, scope, agentName) {
    if (scope === "private") return privateRoot(folders, agentName);
    return folderFor(folders, scope);
  }

  /** Host-absolute path → `{ scope, relPath }` if it lies inside one of this agent's scope roots. */
  hostToScoped(folders, agentName, abs) {
    for (const scope of SCOPE_IDS) {
      const root = this.scopeRootOrNull(folders, scope, agentName);
      if (!root) continue;
      const r = path.resolve(root);
      if (abs === r || isUnderDir(r, abs)) {
        return { scope, relPath: path.relative(r, abs).split(path.sep).join("/") };
      }
    }
    return null;
  }

  /**
   * Turn a model/plugin path plus the session cwd into a resolved LocalBot
   * target. Every branch ends in `resolveForAgent` → `resolveScopePath`.
   */
  scoped(cwd, input) {
    if (typeof input !== "string" || input.trim().length === 0) {
      throw new FsError("file_path must be a non-empty string", "FS_NOT_FOUND");
    }
    const folders = this.folders();
    const agentName = this.agentFromCwd(folders, cwd);
    let target;
    try {
      if (isHostAbsolute(input)) {
        const mapped = this.hostToScoped(folders, agentName, path.resolve(input));
        if (!mapped) {
          throw new ScopeError("ESCAPE", `Denied: ${input} is outside the granted folders.`);
        }
        target = { ...mapped, agentName };
      } else {
        const segs = input.replace(/\\/g, "/").split("/").filter((s) => s !== "" && s !== ".");
        if (segs.length > 0 && isScopeId(segs[0])) {
          target = { scope: segs[0], relPath: segs.slice(1).join("/"), agentName };
        } else {
          const abs = path.resolve(cwd ?? this.config.cwd, input);
          const mapped = this.hostToScoped(folders, agentName, abs);
          if (!mapped) {
            throw new ScopeError("ESCAPE", `Denied: ${input} leaves the granted folders.`);
          }
          target = { ...mapped, agentName };
        }
      }
      const r = resolveForAgent(folders, target);
      return { abs: r.abs, display: displayPath(target.scope, target.relPath) };
    } catch (err) {
      throw toFsError(err, input);
    }
  }

  async resolve(p, opts) {
    if (opts?.signal?.aborted) throw new FsError("resolve aborted", "FS_ABORTED");
    const r = this.scoped(opts?.cwd, p);
    const local = await super.resolve(r.abs, { signal: opts?.signal });
    return { targetKey: local.targetKey, displayPath: r.display };
  }

  async lstat(p, opts, signal) {
    const r = this.scoped(opts?.cwd, p);
    return super.lstat(r.abs, undefined, signal);
  }

  /** Attachments and other host-mapped files are visible only inside a configured folder. */
  processPathFromHostPath(hostPath) {
    if (!path.isAbsolute(hostPath)) return undefined;
    let cfg;
    try {
      cfg = loadConfig();
    } catch {
      return undefined;
    }
    const roots = cfg.folders
      ? [cfg.folders.employeeRoot, cfg.folders.employeeShared, cfg.folders.departmentShared, cfg.folders.companyShared]
      : [];
    const abs = path.resolve(hostPath);
    for (const root of roots) {
      if (root && (abs === path.resolve(root) || isUnderDir(root, abs))) return abs;
    }
    return undefined;
  }

  async listDir(target, signal) {
    const entries = await super.listDir(target, signal);
    const base = target.displayPath.replace(/\/$/, "");
    return entries.map((e) => ({
      ...e,
      target: { ...e.target, displayPath: `${base}/${e.name}` },
    }));
  }

  guardReadOnly(target) {
    if (READ_ONLY_DISPLAY.has(target.displayPath)) {
      throw new FsError(
        `"${target.displayPath}" is managed by the employee and is read-only for tools.`,
        "FS_PERMISSION_DENIED",
      );
    }
  }

  async writeText(target, content, expected, signal) {
    this.guardReadOnly(target);
    return super.writeText(target, content, expected, signal);
  }

  async editText(target, edit, expected, signal) {
    this.guardReadOnly(target);
    return super.editText(target, edit, expected, signal);
  }
}

export default LocalBotScopedFileSystem;
