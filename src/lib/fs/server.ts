/**
 * Server functions for folder scopes. The sidecar is the source of truth:
 * every call carries `{ scope, relPath, agentName }` and the host path is
 * resolved here from `localbot-config.json`. Nothing in this file accepts a
 * root directory from the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import type { DiskConfig, FoldersConfig, ScopedEntry, ScopeId } from "../types.ts";
import {
  isElectronRuntime,
  loadConfig,
  suggestedFolders,
  type DiskShellResult as ShellResult,
} from "./disk.ts";
import {
  ensureAgent,
  readAgent,
  readAgentStanding,
  removeAgent,
  requireFolders,
  ScopeError,
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
  type EnsureAgentInput,
  type ScopedTarget,
} from "./scopes.ts";

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

export const agentEnsure = createServerFn({ method: "POST" })
  .validator((input: EnsureAgentInput) => input)
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; privatePath: string; agentDir: string; scopes: ScopeId[] } | Fail> => {
      try {
        const r = ensureAgent(requireFolders(), data);
        return { ok: true, ...r };
      } catch (err) {
        return fail(err);
      }
    },
  );

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
    }): Promise<{ ok: true; standing: string | null; scopes: ScopeId[]; exists: boolean } | Fail> => {
      try {
        const folders = requireFolders();
        const rec = readAgent(folders, data.agentName);
        return {
          ok: true,
          exists: Boolean(rec),
          standing: readAgentStanding(folders, data.agentName),
          scopes: rec?.scopes ?? ["private"],
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
