/**
 * Server functions for folder scopes. The sidecar is the source of truth:
 * every call carries `{ scope, relPath, agentName }` and the host path is
 * resolved here from `localbot-config.json`. Nothing in this file accepts a
 * root directory from the browser.
 */
import fs from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import type { DiskConfig, FoldersConfig, ScopedEntry, ScopeId } from "../types.ts";
import {
  isElectronRuntime,
  loadConfig,
  suggestedFolders,
  type DiskShellResult as ShellResult,
} from "./disk.ts";
import {
  copyAgent,
  ensureAgent,
  readAgent,
  readAgentStanding,
  removeAgent,
  renameAgent,
  requireFolders,
  ScopeError,
  setAgentArchived,
  setAgentModel,
  uniqueCopyName,
  scopedDelete,
  scopedList,
  scopedMkdir,
  scopedRead,
  scopedReplace,
  scopedShell,
  scopedStat,
  scopedTree,
  scopedWrite,
  setAgentScopes,
  setFolders,
  validateFolder,
  resolveScopePath,
  type AgentPaths,
  type EnsureAgentInput,
  type ScopedTarget,
} from "./scopes.ts";
import { refreshScopes, scopeStatuses, type ScopeStatus } from "./watch.ts";

type Fail = { ok: false; error: string; code: string };

function fail(err: unknown): Fail {
  if (err instanceof ScopeError) return { ok: false, error: err.message, code: err.code };
  return { ok: false, error: err instanceof Error ? err.message : String(err), code: "IO" };
}

export type ScopedArgs = ScopedTarget;

/* ---------- folders ---------- */

export type FoldersState = Pick<
  DiskConfig,
  "folders" | "legacyCompanyRoot" | "previewWritesToProjectData"
> & { isElectron: boolean };

export const foldersGet = createServerFn({ method: "POST" }).handler(
  async (): Promise<FoldersState> => {
    const cfg = loadConfig();
    return {
      folders: cfg.folders,
      legacyCompanyRoot: cfg.legacyCompanyRoot,
      previewWritesToProjectData: cfg.previewWritesToProjectData,
      isElectron: isElectronRuntime(),
    };
  },
);

export const foldersSuggest = createServerFn({ method: "POST" })
  .validator((input: { companyName?: string; departmentName?: string; employeeName?: string }) => input)
  .handler(async ({ data }): Promise<FoldersConfig> => suggestedFolders(data));

export const foldersValidate = createServerFn({ method: "POST" })
  .validator((input: { path: string }) => input)
  .handler(async ({ data }) => validateFolder(data.path));

export const foldersSet = createServerFn({ method: "POST" })
  .validator((input: { folders: Partial<FoldersConfig>; create: boolean }) => input)
  .handler(async ({ data }) => {
    try {
      return setFolders(data.folders, { create: Boolean(data.create) });
    } catch (err) {
      return { ...fail(err), field: null as keyof FoldersConfig | null };
    }
  });

/* ---------- agents ---------- */

type AgentOk = { ok: true } & AgentPaths;

export const agentEnsure = createServerFn({ method: "POST" })
  .validator((input: EnsureAgentInput) => input)
  .handler(async ({ data }): Promise<AgentOk | Fail> => {
    try {
      const r = ensureAgent(requireFolders(), data);
      return { ok: true, ...r };
    } catch (err) {
      return fail(err);
    }
  });

/**
 * Rename moves `agents/{Old}/` → `agents/{New}/` (private / memory / output
 * come along) and drops the agent's in-memory ACP session so the next prompt
 * opens `agents/{New}/private`. Refused while a Harness turn is running.
 */
export const agentRename = createServerFn({ method: "POST" })
  .validator((input: { agentName: string; newName: string }) => input)
  .handler(async ({ data }): Promise<AgentOk | Fail> => {
    try {
      const { getHarnessManager } = await import("../harness/index.ts");
      const harness = getHarnessManager();
      if (harness.hasActiveTurn(data.agentName)) {
        throw new ScopeError("BUSY", `${data.agentName} is still working on a message. Stop it first.`);
      }
      const r = renameAgent(requireFolders(), data.agentName, data.newName);
      harness.forgetSession(data.agentName);
      return { ok: true, ...r };
    } catch (err) {
      return fail(err);
    }
  });

/** Duplicate copies the source `private/` tree and AGENTS.md into a new agent folder. */
export const agentDuplicate = createServerFn({ method: "POST" })
  .validator((input: { agentName: string; newName?: string; avoid?: string[] }) => input)
  .handler(async ({ data }): Promise<AgentOk | Fail> => {
    try {
      const folders = requireFolders();
      const name = data.newName?.trim() || uniqueCopyName(folders, data.agentName, data.avoid ?? []);
      const r = copyAgent(folders, data.agentName, name);
      return { ok: true, ...r };
    } catch (err) {
      return fail(err);
    }
  });

/** Archive / unarchive: only the `archived` flag in agent.json changes. Files stay. */
export const agentSetArchived = createServerFn({ method: "POST" })
  .validator((input: { agentName: string; archived: boolean }) => input)
  .handler(async ({ data }): Promise<{ ok: true; archived: boolean } | Fail> => {
    try {
      const { getHarnessManager } = await import("../harness/index.ts");
      const harness = getHarnessManager();
      if (data.archived && harness.hasActiveTurn(data.agentName)) {
        throw new ScopeError("BUSY", `${data.agentName} is still working on a message. Stop it first.`);
      }
      const rec = setAgentArchived(requireFolders(), data.agentName, data.archived);
      if (data.archived) harness.forgetSession(data.agentName);
      return { ok: true, archived: rec.archived };
    } catch (err) {
      return fail(err);
    }
  });

/**
 * Stage 6: pick the GGUF this agent runs on. Only files verified on disk are
 * accepted; the change lands in agent.json and applies from the agent's next
 * turn (llama-server restarts onto that file after a health check).
 */
export const agentSetModel = createServerFn({ method: "POST" })
  .validator((input: { agentName: string; modelId: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; modelId: string; name: string; path: string } | Fail> => {
    try {
      const { listModelsOnDisk, modelFileForId } = await import("../runtime/models.ts");
      const target = modelFileForId(data.modelId);
      const onDisk = target ? listModelsOnDisk().find((m) => m.path === target.path) : undefined;
      if (!target || !onDisk) {
        throw new ScopeError("NOT_FOUND", `${data.modelId} is not in the models folder. Download or import it first.`);
      }
      if (!onDisk.verified) {
        const { ensureVerified } = await import("../runtime/models.ts");
        const v = ensureVerified(onDisk.path, target.model);
        if (!v.ok) throw new ScopeError("BAD_PATH", `${onDisk.filename} failed verification: ${v.error}`);
      }
      const rec = setAgentModel(requireFolders(), data.agentName, onDisk.modelId);
      return { ok: true, modelId: rec.modelId, name: onDisk.name, path: onDisk.path };
    } catch (err) {
      return fail(err);
    }
  });

export const agentSetScopes = createServerFn({ method: "POST" })
  .validator((input: { agentName: string; scopes: string[] }) => input)
  .handler(async ({ data }): Promise<{ ok: true; scopes: ScopeId[] } | Fail> => {
    try {
      return { ok: true, scopes: setAgentScopes(requireFolders(), data.agentName, data.scopes) };
    } catch (err) {
      return fail(err);
    }
  });

export const agentInfo = createServerFn({ method: "POST" })
  .validator((input: { agentName: string }) => input)
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true; standing: string | null; scopes: ScopeId[]; exists: boolean; archived: boolean; modelId: string } | Fail
    > => {
      try {
        const folders = requireFolders();
        const rec = readAgent(folders, data.agentName);
        return {
          ok: true,
          exists: Boolean(rec),
          standing: readAgentStanding(folders, data.agentName),
          scopes: rec?.scopes ?? ["private"],
          archived: rec?.archived ?? false,
          modelId: rec?.modelId ?? "",
        };
      } catch (err) {
        return fail(err);
      }
    },
  );

export const agentRemove = createServerFn({ method: "POST" })
  .validator((input: { agentName: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    try {
      removeAgent(requireFolders(), data.agentName);
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  });

/* ---------- agent tools (containment + this agent's scope grant) ---------- */

export const agentFsList = createServerFn({ method: "POST" })
  .validator((input: ScopedArgs) => input)
  .handler(async ({ data }): Promise<{ ok: true; entries: ScopedEntry[] } | Fail> => {
    try {
      return { ok: true, entries: scopedList(requireFolders(), data, true) };
    } catch (err) {
      return fail(err);
    }
  });

export const agentFsRead = createServerFn({ method: "POST" })
  .validator((input: ScopedArgs) => input)
  .handler(async ({ data }): Promise<{ ok: true; content: string } | Fail> => {
    try {
      return { ok: true, content: scopedRead(requireFolders(), data, true) };
    } catch (err) {
      return fail(err);
    }
  });

export const agentFsWrite = createServerFn({ method: "POST" })
  .validator((input: ScopedArgs & { content: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; display: string } | Fail> => {
    try {
      return { ok: true, display: scopedWrite(requireFolders(), data, data.content) };
    } catch (err) {
      return fail(err);
    }
  });

export const agentFsMkdir = createServerFn({ method: "POST" })
  .validator((input: ScopedArgs) => input)
  .handler(async ({ data }): Promise<{ ok: true; display: string } | Fail> => {
    try {
      return { ok: true, display: scopedMkdir(requireFolders(), data) };
    } catch (err) {
      return fail(err);
    }
  });

export const agentFsReplace = createServerFn({ method: "POST" })
  .validator((input: ScopedArgs & { oldString: string; newString: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; display: string } | Fail> => {
    try {
      return {
        ok: true,
        display: scopedReplace(requireFolders(), data, data.oldString, data.newString),
      };
    } catch (err) {
      return fail(err);
    }
  });

export const agentFsDelete = createServerFn({ method: "POST" })
  .validator((input: ScopedArgs) => input)
  .handler(async ({ data }): Promise<{ ok: true; display: string } | Fail> => {
    try {
      return { ok: true, display: scopedDelete(requireFolders(), data) };
    } catch (err) {
      return fail(err);
    }
  });

export const agentFsStat = createServerFn({ method: "POST" })
  .validator((input: ScopedArgs) => input)
  .handler(async ({ data }): Promise<{ ok: true; entry: ScopedEntry | null } | Fail> => {
    try {
      return { ok: true, entry: scopedStat(requireFolders(), data, true) };
    } catch (err) {
      return fail(err);
    }
  });

export const agentFsTree = createServerFn({ method: "POST" })
  .validator((input: ScopedArgs & { max?: number }) => input)
  .handler(async ({ data }): Promise<{ ok: true; listing: string } | Fail> => {
    try {
      return { ok: true, listing: scopedTree(requireFolders(), data, data.max ?? 80, true) };
    } catch (err) {
      return fail(err);
    }
  });

export const agentFsRunCommand = createServerFn({ method: "POST" })
  .validator((input: { agentName: string; command: string }) => input)
  .handler(async ({ data }): Promise<({ ok: true } & ShellResult) | Fail> => {
    try {
      return { ok: true, ...scopedShell(requireFolders(), data.agentName, data.command) };
    } catch (err) {
      return fail(err);
    }
  });

/* ---------- Computer pane (the human browsing their own configured folders) ---------- */

export const browseList = createServerFn({ method: "POST" })
  .validator((input: ScopedArgs) => input)
  .handler(async ({ data }): Promise<{ ok: true; entries: ScopedEntry[] } | Fail> => {
    try {
      return { ok: true, entries: scopedList(requireFolders(), data, false) };
    } catch (err) {
      return fail(err);
    }
  });

export const browseRead = createServerFn({ method: "POST" })
  .validator((input: ScopedArgs) => input)
  .handler(async ({ data }): Promise<{ ok: true; content: string } | Fail> => {
    try {
      return { ok: true, content: scopedRead(requireFolders(), data, false) };
    } catch (err) {
      return fail(err);
    }
  });

export const browseStat = createServerFn({ method: "POST" })
  .validator((input: ScopedArgs) => input)
  .handler(async ({ data }): Promise<{ ok: true; entry: ScopedEntry | null } | Fail> => {
    try {
      return { ok: true, entry: scopedStat(requireFolders(), data, false) };
    } catch (err) {
      return fail(err);
    }
  });

/* ---------- Computer pane: watch / poll / Refresh ---------- */

export type ScopesStatusResult = { ok: true; scopes: ScopeStatus[] } | Fail;

/**
 * Per-scope watcher status. Starts the sidecar watchers on first call and
 * keeps them in sync with the configured folders. Null scopes are absent.
 * The pane polls this and re-lists a section when its `version` moves.
 */
export const scopesStatus = createServerFn({ method: "POST" }).handler(
  async (): Promise<ScopesStatusResult> => {
    try {
      return { ok: true, scopes: scopeStatuses(loadConfig().folders) };
    } catch (err) {
      return fail(err);
    }
  },
);

/** Refresh button: rescan every configured root right now, then report. */
export const browseRefresh = createServerFn({ method: "POST" }).handler(
  async (): Promise<ScopesStatusResult> => {
    try {
      return { ok: true, scopes: refreshScopes(loadConfig().folders) };
    } catch (err) {
      return fail(err);
    }
  },
);

/**
 * Host path of a scoped target, for the desktop "Reveal in Finder/Explorer"
 * action only. The browser never sends a host path in; it receives one here
 * and hands it to the narrow Electron IPC, which re-checks it against the
 * configured folders before showing it.
 */
export const browseHostPath = createServerFn({ method: "POST" })
  .validator((input: ScopedArgs) => input)
  .handler(async ({ data }): Promise<{ ok: true; hostPath: string; exists: boolean } | Fail> => {
    try {
      const r = resolveScopePath(requireFolders(), data);
      return { ok: true, hostPath: r.abs, exists: fs.existsSync(r.abs) };
    } catch (err) {
      return fail(err);
    }
  });
