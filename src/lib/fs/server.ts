/**
 * Server functions for folder scopes. The sidecar is the source of truth:
 * every call carries `{ scope, relPath, agentName }` and the host path is
 * resolved here from `localbot-config.json`. Nothing in this file accepts a
 * root directory from the browser.
 */
import fs from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import type { ChatMessage, DiskConfig, FoldersConfig, ScopedEntry, ScopeId } from "../types.ts";
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
  updateAgentProfile,
  type AgentPaths,
  type AgentProfilePatch,
  type EnsureAgentInput,
  type ScopedTarget,
} from "./scopes.ts";
import { refreshScopes, scopeStatuses, type ScopeStatus } from "./watch.ts";
import {
  clearAgentSession,
  createSection,
  deleteSection,
  ensureRow,
  HostIndexError,
  hostIndexExists,
  listSections,
  loadHostIndex,
  loadRoster,
  migrateLegacySnapshot,
  patchHostIndex,
  patchRowById,
  readAllChats,
  removeRow,
  renameRow,
  renameSection,
  reorderSections,
  resetHostIndex,
  writeChat,
  type HostAgentPatch,
  type HostIndex,
  type HostIndexPatch,
  type HostSection,
  type LegacySnapshot,
  type MigrationResult,
  type RosterEntry,
} from "./host-index.ts";

type Fail = { ok: false; error: string; code: string };

function fail(err: unknown): Fail {
  if (err instanceof ScopeError || err instanceof HostIndexError) return { ok: false, error: err.message, code: err.code };
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

/** Stage 7: every lifecycle result carries the host-index row id the roster keys on. */
type AgentOk = { ok: true; id: string } & AgentPaths;

export const agentEnsure = createServerFn({ method: "POST" })
  .validator((input: EnsureAgentInput & { id?: string; pinned?: boolean }) => input)
  .handler(async ({ data }): Promise<AgentOk | Fail> => {
    try {
      const r = ensureAgent(requireFolders(), data);
      const row = ensureRow(r.name, { id: data.id, pinned: data.pinned, createdAt: data.createdAt });
      return { ok: true, id: row.id, ...r };
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
      // Same id (chats stay addressable); the persisted session is dropped with the in-memory one.
      const row = renameRow(data.agentName, r.name) ?? ensureRow(r.name);
      harness.forgetSession(data.agentName);
      return { ok: true, id: row.id, ...r };
    } catch (err) {
      return fail(err);
    }
  });

export type AgentProfileResult = {
  ok: true;
  id: string;
  name: string;
  privatePath: string;
  scopes: ScopeId[];
  job: string;
  color: string;
  mascotId: string;
  standingInstructions: string;
  /** True when agents/{Old}/ was moved to agents/{New}/ (the ACP session was dropped). */
  renamed: boolean;
};

/**
 * Stage 12 — Edit profile. Disk first, store second: when the name changed the
 * folder is moved (`renameAgent`), the index row follows (`renameRow`) and the
 * ACP session is forgotten; then job / mascot / color land in agent.json and
 * AGENTS.md is rewritten as `# Name / job / description`. Refused while a
 * Harness turn is running. Nothing here is store-only.
 */
export const agentUpdateProfile = createServerFn({ method: "POST" })
  .validator((input: { agentName: string; newName?: string } & AgentProfilePatch) => input)
  .handler(async ({ data }): Promise<AgentProfileResult | Fail> => {
    try {
      const folders = requireFolders();
      const { getHarnessManager } = await import("../harness/index.ts");
      const harness = getHarnessManager();
      if (harness.hasActiveTurn(data.agentName)) {
        throw new ScopeError("BUSY", `${data.agentName} is still working on a message. Stop it first.`);
      }
      let name = data.agentName;
      let renamed = false;
      const wanted = data.newName?.trim().replace(/\s+/g, " ");
      if (wanted && wanted !== data.agentName) {
        const moved = renameAgent(folders, data.agentName, wanted);
        renameRow(data.agentName, moved.name);
        harness.forgetSession(data.agentName);
        name = moved.name;
        renamed = true;
      }
      const profile = updateAgentProfile(folders, name, {
        job: data.job,
        description: data.description,
        mascotId: data.mascotId,
        color: data.color,
      });
      const row = ensureRow(profile.name);
      return {
        ok: true,
        id: row.id,
        name: profile.name,
        privatePath: profile.privatePath,
        scopes: profile.scopes,
        job: profile.job,
        color: profile.color,
        mascotId: profile.mascotId,
        standingInstructions: profile.standingInstructions,
        renamed,
      };
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
      const row = ensureRow(r.name);
      return { ok: true, id: row.id, ...r };
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
      if (data.archived) {
        harness.forgetSession(data.agentName);
        clearAgentSession(data.agentName);
      }
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
      removeRow(data.agentName);
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  });

/* ---------- Stage 7: durable host state (index + chats) ---------- */

export type HostConfigMirror = Pick<DiskConfig, "allowHostedDemo" | "useExistingOllama" | "ollamaModel" | "activeModelId">;

export type StateLoadResult =
  | {
      ok: true;
      /** False on a data dir that has never had an index: the browser may offer its copy for migration. */
      hasIndex: boolean;
      index: Omit<HostIndex, "agents">;
      roster: RosterEntry[];
      /** Why the roster is empty when it should not be (e.g. employee root DISCONNECTED). */
      rosterError: { code: string; error: string } | null;
      config: HostConfigMirror;
      folders: FoldersConfig | null;
    }
  | Fail;

function configMirror(): HostConfigMirror {
  const cfg = loadConfig();
  return {
    allowHostedDemo: cfg.allowHostedDemo,
    useExistingOllama: cfg.useExistingOllama,
    ollamaModel: cfg.ollamaModel,
    activeModelId: cfg.activeModelId,
  };
}

/**
 * Everything the renderer needs at boot, from disk: onboarding flag and labels
 * from the index, the roster from `agents/*\/agent.json` ⋈ index, and the
 * Safety / model switches from `localbot-config.json` so the checkboxes match
 * what the sidecar enforces. The browser's `localStorage` is not consulted.
 */
export const stateLoad = createServerFn({ method: "POST" }).handler(async (): Promise<StateLoadResult> => {
  try {
    const cfg = loadConfig();
    const hasIndex = hostIndexExists();
    const { agents: _rows, ...index } = loadHostIndex();
    void _rows;
    let roster: RosterEntry[] = [];
    let rosterError: { code: string; error: string } | null = null;
    if (cfg.folders) {
      try {
        roster = loadRoster(requireFolders());
      } catch (err) {
        const f = fail(err);
        rosterError = { code: f.code, error: f.error };
      }
    }
    return { ok: true, hasIndex, index, roster, rosterError, config: configMirror(), folders: cfg.folders };
  } catch (err) {
    return fail(err);
  }
});

export const statePatchIndex = createServerFn({ method: "POST" })
  .validator((input: HostIndexPatch) => input)
  .handler(async ({ data }): Promise<{ ok: true; index: Omit<HostIndex, "agents"> } | Fail> => {
    try {
      const { agents: _rows, ...index } = patchHostIndex(data);
      void _rows;
      return { ok: true, index };
    } catch (err) {
      return fail(err);
    }
  });

/** pinned / hidden / unread / sectionId live in the index, not in the browser. */
export const statePatchAgent = createServerFn({ method: "POST" })
  .validator((input: { id: string } & HostAgentPatch) => input)
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    try {
      const { id, ...patch } = data;
      if (!patchRowById(id, patch)) throw new ScopeError("NOT_FOUND", `No agent with id ${id} in the host index.`);
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  });

/* ---------- Stage 12: roster sections (host index, not React state) ---------- */

export type SectionsResult = { ok: true; sections: HostSection[] } | Fail;

export const sectionsList = createServerFn({ method: "POST" }).handler(async (): Promise<SectionsResult> => {
  try {
    return { ok: true, sections: listSections() };
  } catch (err) {
    return fail(err);
  }
});

export const sectionCreate = createServerFn({ method: "POST" })
  .validator((input: { name: string }) => input)
  .handler(async ({ data }): Promise<({ ok: true; section: HostSection } & { sections: HostSection[] }) | Fail> => {
    try {
      const section = createSection(data.name);
      return { ok: true, section, sections: listSections() };
    } catch (err) {
      return fail(err);
    }
  });

export const sectionRename = createServerFn({ method: "POST" })
  .validator((input: { id: string; name: string }) => input)
  .handler(async ({ data }): Promise<SectionsResult> => {
    try {
      renameSection(data.id, data.name);
      return { ok: true, sections: listSections() };
    } catch (err) {
      return fail(err);
    }
  });

/** Agents filed under the section become unsorted; no agent folder or chat is touched. */
export const sectionDelete = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<({ ok: true; unsorted: number; sections: HostSection[] }) | Fail> => {
    try {
      const r = deleteSection(data.id);
      return { ok: true, unsorted: r.unsorted, sections: listSections() };
    } catch (err) {
      return fail(err);
    }
  });

export const sectionReorder = createServerFn({ method: "POST" })
  .validator((input: { ids: string[] }) => input)
  .handler(async ({ data }): Promise<SectionsResult> => {
    try {
      return { ok: true, sections: reorderSections(data.ids) };
    } catch (err) {
      return fail(err);
    }
  });

/**
 * One-time import of the browser's `localbot-state-v3`. Refuses (harmlessly)
 * once an index exists. Creates the agent folders for imported bots when the
 * folders are configured, exactly like `ensureAgents` used to.
 */
export const stateMigrate = createServerFn({ method: "POST" })
  .validator((input: { snapshot: LegacySnapshot }) => input)
  .handler(async ({ data }): Promise<MigrationResult | Fail> => {
    try {
      const cfg = loadConfig();
      const r = migrateLegacySnapshot(data.snapshot, cfg.folders);
      if (r.migrated && cfg.folders) {
        const folders = requireFolders();
        for (const b of data.snapshot.bots ?? []) {
          if (!b.name) continue;
          try {
            ensureAgent(folders, {
              name: b.name,
              job: b.job ?? "",
              modelId: b.modelId ?? "",
              color: b.color ?? "",
              mascotId: b.mascotId ?? "",
              scopes: b.scopes ?? ["private"],
              standingInstructions: b.standingInstructions ?? "",
              createdAt: b.createdAt ?? new Date().toISOString(),
              archived: b.archived,
            });
          } catch {
            /* an illegal legacy name or a disconnected root: the row is kept, the folder is not created */
          }
        }
      }
      return r;
    } catch (err) {
      return fail(err);
    }
  });

/** "Reset this workspace": fresh index (old one in .bak). Files on disk stay. */
export const stateReset = createServerFn({ method: "POST" }).handler(async (): Promise<{ ok: true } | Fail> => {
  try {
    resetHostIndex();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
});

export type ChatBody = { messages: ChatMessage[]; chatGrants: Record<string, true>; lastReadAt: string };

export const chatLoadAll = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true; chats: Record<string, ChatBody> } | Fail> => {
    try {
      const all = readAllChats();
      const chats: Record<string, ChatBody> = {};
      for (const [id, c] of Object.entries(all)) {
        chats[id] = { messages: c.messages as ChatMessage[], chatGrants: c.chatGrants, lastReadAt: c.lastReadAt };
      }
      return { ok: true, chats };
    } catch (err) {
      return fail(err);
    }
  },
);

/** Atomic write of one agent's transcript into `{dataDir}/chats/{agentId}.json`. Never under a scope. */
export const chatSave = createServerFn({ method: "POST" })
  .validator((input: { agentId: string } & ChatBody) => input)
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    try {
      const cfg = loadConfig();
      if (!loadHostIndex().agents.some((r) => r.id === data.agentId)) {
        throw new ScopeError("NOT_FOUND", `No agent with id ${data.agentId} in the host index.`);
      }
      writeChat(data.agentId, { messages: data.messages, chatGrants: data.chatGrants, lastReadAt: data.lastReadAt }, cfg.folders);
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
