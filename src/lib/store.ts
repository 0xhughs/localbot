import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CATALOG_PIN } from "./catalog";
import {
  agentDuplicate,
  agentEnsure,
  agentFsDelete,
  agentFsRead,
  agentFsReplace,
  agentFsRunCommand,
  agentFsTree,
  agentFsWrite,
  agentRemove,
  agentRename,
  agentSetArchived,
  agentSetModel,
  agentSetScopes,
  agentUpdateProfile,
  chatLoadAll,
  chatSave,
  foldersGet,
  foldersSet,
  sectionCreate,
  sectionDelete,
  sectionRename,
  stateLoad,
  stateMigrate,
  statePatchAgent,
  statePatchIndex,
  stateReset,
  type ChatBody,
  type StateLoadResult,
} from "./fs/server";
import type { LegacySnapshot, RosterEntry } from "./fs/host-index";
import {
  agentSlug,
  displayPath,
  handoffScope,
  parseScopedPath,
  SCOPE_META,
  type FoldersConfig,
  type ScopeId,
} from "./fs/scope-model";
import { mascotIdForTemplate, isMascotId, type MascotId } from "./mascots";
import {
  AGENT_COLORS,
  isActiveBot,
  type AgentColorId,
  type AgentSection,
  type AppSnapshot,
  type Bot,
  type ChatMessage,
  type Company,
  type Department,
  type Employee,
  type FolderGrant,
  type HardwareReport,
  type Session,
  type Settings,
  type UiState,
  type RuntimeStatus,
} from "./types";
import { nowIso, uid } from "./utils";

const DEFAULT_SETTINGS: Settings = {
  darkMode: true,
  webSearchEnabled: false,
  controlThisComputer: false,
  denseUi: true,
  companyRootIsShared: false,
  allowHostedDemo: false,
  useExistingOllama: false,
};

const DEFAULT_UI: UiState = {
  selectedBotId: null,
  showComputer: false,
  showSettings: false,
  settingsTab: "general",
  composer: "",
  commandOpen: false,
  agentsOpen: false,
  pendingPermission: null,
  previewPath: null,
  newAgentOpen: false,
  setupBotId: null,
  editProfileBotId: null,
  showPlugins: false,
  pluginsTab: "catalog",
};

/** Placeholder name for an agent created by the setup chat before it has told us its name. */
export const SETUP_PLACEHOLDER_NAME = "New agent";
export const SETUP_PLACEHOLDER_JOB = "Setting up";

const DEFAULT_STANDING =
  "Do the work in your private folder. Put finished deliverables in private/output/. Use the shared folders when handing work to another agent.";

function emptySnapshot(): AppSnapshot {
  return {
    version: 2,
    onboarded: false,
    company: null,
    departments: [],
    employees: [],
    bots: [],
    selectedCatalogId: null,
    sessions: {},
    hardware: null,
    settings: DEFAULT_SETTINGS,
    runtime: {
      engine: "llama.cpp",
      model: "",
      aiAvailable: false,
      lastHeartbeat: null,
      ggufPath: null,
      loopback: null,
      ramEstimate: "—",
      badge: "Local model not ready",
    },
    activeEmployeeId: null,
    previewWritesToProjectData: true,
  };
}

export type FoldersMeta = {
  legacyCompanyRoot: string | null;
  isElectron: boolean;
  loaded: boolean;
};

type Result = { ok: true } | { ok: false; error: string };

/** Mirror of the switches in `localbot-config.json` that have no `Settings` field of their own. */
export type HostConfigMirror = { ollamaModel: string | null; activeModelId: string | null };

type Actions = {
  ui: UiState;
  hydrated: boolean;
  /**
   * Stage 7: true once `loadFromDisk` has replaced the roster / chats /
   * onboarding flag with the sidecar's copy. Nothing renders before that, so a
   * stale browser copy is never shown as the roster.
   */
  diskLoaded: boolean;
  /** Why the roster could not be read (e.g. employee root DISCONNECTED). */
  diskNotice: string | null;
  /** The old `localStorage["localbot-state-v3"]`, kept only until `stateMigrate` has run once. */
  legacySnapshot: LegacySnapshot | null;
  hostConfig: HostConfigMirror;
  diskEpoch: number;
  /** Server-owned folder scopes. Not persisted in the browser; loaded from the sidecar. */
  folders: FoldersConfig | null;
  foldersMeta: FoldersMeta;
  /** Stage 12: roster sections from the host index. Not persisted in the browser. */
  sections: AgentSection[];
  setHydrated: (v: boolean) => void;
  setUi: (patch: Partial<UiState>) => void;
  resetAll: () => void;
  /** Read index + roster + chats + config mirror from the sidecar; migrate the browser copy first when the data dir has no index yet. */
  loadFromDisk: () => Promise<void>;
  setHardware: (h: HardwareReport) => void;
  noteCatalog: (catalogId: string) => void;
  setAiAvailable: (available: boolean) => void;
  setRuntime: (patch: Partial<RuntimeStatus>) => void;
  bumpDisk: () => void;
  refreshFolders: () => Promise<FoldersConfig | null>;
  applyFolders: (
    folders: FoldersConfig,
    create: boolean,
  ) => Promise<
    | { ok: true; folders: FoldersConfig; previous: FoldersConfig | null }
    | { ok: false; error: string; field: keyof FoldersConfig | null }
  >;
  ensureAgents: () => Promise<void>;
  completeOnboarding: (input: {
    companyName: string;
    departmentName: string;
    employeeName: string;
    botName: string;
    botJob: string;
    color: AgentColorId;
    mascotId?: MascotId;
    modelId: string;
    folders: FoldersConfig;
    createFolders: boolean;
  }) => Promise<Result>;
  createBot: (input: {
    name: string;
    job: string;
    color: AgentColorId;
    mascotId?: MascotId;
    modelId: string;
    scopes?: ScopeId[];
  }) => Promise<Bot>;
  /** Sidecar first: moves agents/{Old}/ → agents/{New}/, then the roster label. */
  renameBot: (id: string, name: string) => Promise<Result>;
  /**
   * Stage 12 — Edit profile. Sidecar first (`agentUpdateProfile`: rename on
   * disk when the name changed, agent.json, AGENTS.md body), then the roster row.
   */
  updateBotProfile: (
    id: string,
    patch: { name?: string; job?: string; description?: string; mascotId?: MascotId; color?: AgentColorId },
  ) => Promise<Result>;
  /**
   * Stage 12 — conversational create. `agentEnsure`s a placeholder folder
   * (agents/New agent/) through `createBot`, selects it and puts its chat in
   * setup mode; the setup chat then renames it and writes job / AGENTS.md.
   */
  startSetupAgent: () => Promise<{ ok: true; bot: Bot } | { ok: false; error: string }>;
  /** Setup chat done (or abandoned): the chat becomes a normal chat on that agent. */
  endSetup: (botId: string) => void;
  /** Stage 12: roster sections — every call writes the host index first. */
  createSection: (name: string) => Promise<{ ok: true; section: AgentSection } | { ok: false; error: string }>;
  renameSection: (id: string, name: string) => Promise<Result>;
  deleteSection: (id: string) => Promise<Result>;
  moveBotToSection: (botId: string, sectionId: string | null) => Promise<Result>;
  updateBot: (id: string, patch: Partial<Bot>) => void;
  /** Sidecar copies private/ + AGENTS.md into a new agents/{Name copy}/ tree. */
  duplicateBot: (id: string) => Promise<{ ok: true; bot: Bot } | { ok: false; error: string }>;
  /** Local UI filter only. Not archive. */
  hideBot: (id: string, hidden: boolean) => void;
  /** Persists `archived` in agent.json. Files stay; agentRemove is never called. */
  archiveBot: (id: string, archived: boolean) => Promise<Result>;
  pinBot: (id: string, pinned: boolean) => void;
  deleteBot: (id: string) => Promise<void>;
  setBotScopes: (id: string, scopes: ScopeId[]) => Promise<Result>;
  /** Stage 6: writes agent.json.modelId via the sidecar; applies from the agent's next turn. */
  setBotModel: (id: string, modelId: string) => Promise<Result>;
  markRead: (botId: string) => void;
  bumpUnread: (botId: string) => void;
  renameCompany: (name: string) => void;
  appendMessage: (
    botId: string,
    msg: Omit<ChatMessage, "id" | "botId" | "createdAt"> &
      Partial<Pick<ChatMessage, "id" | "createdAt">>,
  ) => ChatMessage;
  patchMessage: (botId: string, msgId: string, patch: Partial<ChatMessage>) => void;
  setSessionRunning: (botId: string, running: boolean) => void;
  requestStop: (botId: string) => void;
  clearStop: (botId: string) => void;
  addChatGrant: (botId: string, key: string) => void;
  hasChatGrant: (botId: string, key: string) => boolean;
  writeBotFile: (botId: string, path: string, content: string) => Promise<Result>;
  readBotFile: (
    botId: string,
    path: string,
  ) => Promise<{ ok: true; content: string } | { ok: false; error: string }>;
  listBotDir: (
    botId: string,
    path: string,
  ) => Promise<{ ok: true; listing: string } | { ok: false; error: string }>;
  replaceBotFile: (
    botId: string,
    path: string,
    oldString: string,
    newString: string,
  ) => Promise<Result>;
  deleteBotFile: (botId: string, path: string) => Promise<Result>;
  shellBot: (
    botId: string,
    command: string,
  ) => Promise<
    | { ok: true; stdout: string; stderr: string; code: number }
    | { ok: false; error: string }
  >;
  handoffTask: (
    fromBotId: string,
    toBotName: string,
    task: string,
  ) => Promise<{ ok: true; toBotId: string; path: string } | { ok: false; error: string }>;
  updateSettings: (patch: Partial<Settings>) => void;
  selectBot: (id: string | null) => void;
};

export type LocalBotState = AppSnapshot & Actions;

function sessionOf(botId: string): Session {
  return {
    botId,
    messages: [],
    running: false,
    stopRequested: false,
    chatGrants: {},
    lastReadAt: nowIso(),
  };
}

const memoryStorage = {
  getItem: (k: string) =>
    typeof localStorage === "undefined" ? null : localStorage.getItem(k),
  setItem: (k: string, v: string) => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(k, v);
  },
  removeItem: (k: string) => {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(k);
  },
};

/** Map pre-Stage-2 grants onto scopes when an old browser session hydrates. */
export function scopesFromLegacyGrants(grants: readonly FolderGrant[] | undefined): ScopeId[] {
  const out: ScopeId[] = ["private"];
  if (grants?.includes("shared")) out.push("department-shared");
  if (grants?.includes("company-shared")) out.push("company-shared");
  return out;
}

function sameName(a: string, b: string): boolean {
  return agentSlug(a).toLowerCase() === agentSlug(b).toLowerCase();
}

/** First roster row to land on when the current one goes away. */
function nextSelectable(bots: readonly Bot[], excludeId: string): string | null {
  const active = bots.filter((b) => b.id !== excludeId && isActiveBot(b));
  return (active.find((b) => b.pinned) ?? active[0] ?? bots.find((b) => b.id !== excludeId && !b.archived))?.id ?? null;
}

function withScope(bot: Bot, path: string): { scope: ScopeId; relPath: string } | { error: string } {
  const parsed = parseScopedPath(path);
  if (!bot.scopes.includes(parsed.scope)) {
    return {
      error: `Denied: ${displayPath(parsed.scope, parsed.relPath)} is outside this agent's folders (${SCOPE_META[parsed.scope].label} is not granted).`,
    };
  }
  return parsed;
}

function colorId(raw: string): AgentColorId {
  return raw in AGENT_COLORS ? (raw as AgentColorId) : "sage";
}

/** One roster row from the sidecar (agent.json ⋈ host index) as the browser's `Bot`. */
export function botFromRoster(r: RosterEntry, employeeId: string): Bot {
  return {
    id: r.id,
    employeeId,
    name: r.name,
    job: r.job,
    color: colorId(r.color),
    mascotId: isMascotId(r.mascotId) ? r.mascotId : mascotIdForTemplate(r.name),
    modelId: r.modelId,
    scopes: r.scopes,
    privatePath: r.privatePath,
    standingInstructions: r.standingInstructions || DEFAULT_STANDING,
    pinned: r.pinned,
    hidden: r.hidden,
    archived: r.archived,
    unread: r.unread,
    sectionId: r.sectionId ?? null,
    createdAt: r.createdAt,
  };
}

type DiskState = Extract<StateLoadResult, { ok: true }>;
type ChatBodies = Record<string, ChatBody>;

/** Company / Department / Employee objects rebuilt from the index labels (display + `resolveBot`). */
function labelsToOrg(index: DiskState["index"]): Pick<AppSnapshot, "company" | "departments" | "employees" | "activeEmployeeId"> {
  const company: Company | null = index.company
    ? { id: index.company.id, name: index.company.name, root: "", defaultDepartmentId: index.department?.id ?? "", catalogPin: CATALOG_PIN, createdAt: index.company.createdAt }
    : null;
  const department: Department | null =
    company && index.department
      ? { id: index.department.id, companyId: company.id, name: index.department.name, path: "", createdAt: index.department.createdAt }
      : null;
  const employee: Employee | null =
    department && index.employee
      ? { id: index.employee.id, departmentId: department.id, displayName: index.employee.name, path: "", defaultModelId: index.selectedCatalogId, createdAt: index.employee.createdAt }
      : null;
  return {
    company,
    departments: department ? [department] : [],
    employees: employee ? [employee] : [],
    activeEmployeeId: employee?.id ?? null,
  };
}

const CHAT_SAVE_DEBOUNCE_MS = 400;
const chatTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Chats live in `{dataDir}/chats/{agentId}.json`; the browser only debounces the writes. */
function scheduleChatSave(botId: string): void {
  const prev = chatTimers.get(botId);
  if (prev) clearTimeout(prev);
  chatTimers.set(
    botId,
    setTimeout(() => {
      chatTimers.delete(botId);
      void saveChatNow(botId);
    }, CHAT_SAVE_DEBOUNCE_MS),
  );
}

async function saveChatNow(botId: string): Promise<void> {
  const s = useLocalBot.getState();
  if (!s.diskLoaded) return;
  if (!s.bots.some((b) => b.id === botId)) return;
  const sess = s.sessions[botId];
  if (!sess) return;
  await chatSave({
    data: { agentId: botId, messages: sess.messages, chatGrants: sess.chatGrants, lastReadAt: sess.lastReadAt },
  });
}

/** Write every pending chat now (window closing). */
export function flushChatSaves(): void {
  for (const [botId, t] of chatTimers) {
    clearTimeout(t);
    chatTimers.delete(botId);
    void saveChatNow(botId);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushChatSaves);
}

export const useLocalBot = create<LocalBotState>()(
  persist(
    (set, get) => ({
      ...emptySnapshot(),
      ui: DEFAULT_UI,
      hydrated: false,
      diskLoaded: false,
      diskNotice: null,
      legacySnapshot: null,
      hostConfig: { ollamaModel: null, activeModelId: null },
      diskEpoch: 0,
      folders: null,
      foldersMeta: { legacyCompanyRoot: null, isElectron: false, loaded: false },
      sections: [],
      setHydrated: (v) => set({ hydrated: v }),
      setUi: (patch) => set({ ui: { ...get().ui, ...patch } }),
      resetAll: () => {
        // Fresh host index (the old one is kept as .bak); agent folders and chat files stay on disk.
        void stateReset();
        set({ ...emptySnapshot(), ui: { ...DEFAULT_UI }, hydrated: true, diskLoaded: true, diskNotice: null, legacySnapshot: null, diskEpoch: 0, sections: [] });
      },

      loadFromDisk: async () => {
        let st = await stateLoad();
        if (!st.ok) {
          set({ diskLoaded: true, diskNotice: st.error });
          return;
        }
        const legacy = get().legacySnapshot;
        if (!st.hasIndex && legacy) {
          // First launch after Stage 7 on this data dir: the browser copy is imported once, then never trusted again.
          await stateMigrate({ data: { snapshot: legacy } });
          const again = await stateLoad();
          if (again.ok) st = again;
        }
        const chatsR = await chatLoadAll();
        const chats: ChatBodies = chatsR.ok ? chatsR.chats : {};
        const org = labelsToOrg(st.index);
        const employeeId = org.activeEmployeeId ?? "";
        const bots = st.roster.map((r) => botFromRoster(r, employeeId));
        const sessions: Record<string, Session> = {};
        for (const b of bots) {
          const c = chats[b.id];
          sessions[b.id] = c
            ? { botId: b.id, messages: c.messages as ChatMessage[], running: false, stopRequested: false, chatGrants: c.chatGrants, lastReadAt: c.lastReadAt || nowIso() }
            : sessionOf(b.id);
        }
        const cur = get();
        const selectedBotId = cur.ui.selectedBotId && bots.some((b) => b.id === cur.ui.selectedBotId) ? cur.ui.selectedBotId : null;
        set({
          onboarded: st.index.onboarded,
          ...org,
          bots,
          sessions,
          selectedCatalogId: st.index.selectedCatalogId ?? st.config.activeModelId,
          settings: { ...cur.settings, allowHostedDemo: st.config.allowHostedDemo, useExistingOllama: st.config.useExistingOllama },
          hostConfig: { ollamaModel: st.config.ollamaModel, activeModelId: st.config.activeModelId },
          folders: st.folders,
          // Stage 12: sections come from the index on disk; a wiped localStorage changes nothing here.
          sections: [...(st.index.sections ?? [])].sort((a, b) => a.order - b.order),
          previewWritesToProjectData: cur.previewWritesToProjectData,
          diskNotice: st.rosterError ? st.rosterError.error : null,
          legacySnapshot: null,
          diskLoaded: true,
          ui: { ...cur.ui, selectedBotId },
          diskEpoch: cur.diskEpoch + 1,
        });
      },

      setHardware: (h) => set({ hardware: h }),
      noteCatalog: (catalogId) => {
        set({ selectedCatalogId: catalogId });
        void statePatchIndex({ data: { selectedCatalogId: catalogId } });
      },
      setAiAvailable: (available) =>
        set((s) => ({
          runtime: {
            ...s.runtime,
            aiAvailable: available,
            lastHeartbeat: nowIso(),
          },
        })),
      setRuntime: (patch) =>
        set((s) => ({
          runtime: { ...s.runtime, ...patch, lastHeartbeat: nowIso() },
        })),
      bumpDisk: () => set((s) => ({ diskEpoch: s.diskEpoch + 1 })),

      refreshFolders: async () => {
        const st = await foldersGet();
        set({
          folders: st.folders,
          previewWritesToProjectData: st.previewWritesToProjectData,
          foldersMeta: {
            legacyCompanyRoot: st.legacyCompanyRoot,
            isElectron: st.isElectron,
            loaded: true,
          },
        });
        return st.folders;
      },

      applyFolders: async (folders, create) => {
        const r = await foldersSet({ data: { folders, create } });
        if (!r.ok) return { ok: false, error: r.error, field: r.field };
        set({ folders: r.folders, diskEpoch: get().diskEpoch + 1 });
        await get().refreshFolders();
        await get().ensureAgents();
        return { ok: true, folders: r.folders, previous: r.previous };
      },

      ensureAgents: async () => {
        const s = get();
        if (!s.folders) return;
        // After a folder change every known agent gets its agents/{Name}/ under
        // the new root (nothing old is moved), then the roster is re-read from disk.
        for (const bot of s.bots) {
          await agentEnsure({
            data: {
              id: bot.id,
              pinned: bot.pinned,
              name: bot.name,
              job: bot.job,
              modelId: bot.modelId,
              color: bot.color,
              mascotId: bot.mascotId,
              scopes: bot.scopes,
              standingInstructions: bot.standingInstructions,
              createdAt: bot.createdAt,
            },
          });
        }
        await get().loadFromDisk();
      },

      completeOnboarding: async (input) => {
        const companyName = agentSlug(input.companyName);
        const deptName = agentSlug(input.departmentName);
        const empName = agentSlug(input.employeeName);
        const botName = agentSlug(input.botName);
        const saved = await foldersSet({
          data: { folders: input.folders, create: input.createFolders },
        });
        if (!saved.ok) return { ok: false, error: saved.error };
        const now = nowIso();
        const company: Company = {
          id: uid("co"),
          name: companyName,
          root: "",
          defaultDepartmentId: "",
          catalogPin: CATALOG_PIN,
          createdAt: now,
        };
        const department: Department = {
          id: uid("dept"),
          companyId: company.id,
          name: deptName,
          path: "",
          createdAt: now,
        };
        company.defaultDepartmentId = department.id;
        const employee: Employee = {
          id: uid("emp"),
          departmentId: department.id,
          displayName: empName,
          path: "",
          defaultModelId: input.modelId,
          createdAt: now,
        };
        const scopes: ScopeId[] = ["private"];
        if (saved.folders.employeeShared) scopes.push("employee-shared");
        if (saved.folders.departmentShared) scopes.push("department-shared");
        const ensured = await agentEnsure({
          data: {
            name: botName,
            job: input.botJob.trim() || "Generalist",
            modelId: input.modelId,
            color: input.color,
            mascotId: input.mascotId ?? mascotIdForTemplate(botName),
            scopes,
            standingInstructions: DEFAULT_STANDING,
            createdAt: now,
            pinned: true,
          },
        });
        if (!ensured.ok) return { ok: false, error: ensured.error };
        const bot: Bot = {
          id: ensured.id,
          employeeId: employee.id,
          name: botName,
          job: input.botJob.trim() || "Generalist",
          color: input.color,
          mascotId: input.mascotId ?? mascotIdForTemplate(botName),
          modelId: input.modelId,
          scopes: ensured.scopes,
          privatePath: ensured.privatePath,
          standingInstructions: DEFAULT_STANDING,
          pinned: true,
          hidden: false,
          archived: false,
          unread: 0,
          sectionId: null,
          createdAt: now,
        };
        // The host index is the durable record of "onboarded" and the labels.
        const indexed = await statePatchIndex({
          data: {
            onboarded: true,
            company: { id: company.id, name: company.name, createdAt: now },
            department: { id: department.id, name: department.name, createdAt: now },
            employee: { id: employee.id, name: employee.displayName, createdAt: now },
            selectedCatalogId: input.modelId,
          },
        });
        if (!indexed.ok) return { ok: false, error: indexed.error };
        set({
          onboarded: true,
          company,
          departments: [department],
          employees: [employee],
          bots: [bot],
          selectedCatalogId: input.modelId,
          sessions: { [bot.id]: sessionOf(bot.id) },
          activeEmployeeId: employee.id,
          folders: saved.folders,
          runtime: { ...get().runtime, lastHeartbeat: now },
          ui: { ...DEFAULT_UI, selectedBotId: bot.id, showComputer: false },
          diskEpoch: get().diskEpoch + 1,
        });
        await get().refreshFolders();
        return { ok: true };
      },

      createBot: async (input) => {
        const s = get();
        const employee =
          s.employees.find((e) => e.id === s.activeEmployeeId) ?? s.employees[0];
        if (!employee || !s.company) throw new Error("Finish onboarding first");
        if (!s.folders) throw new Error("Pick your folders in Settings → Folders first");
        const name = agentSlug(input.name);
        if (s.bots.some((b) => sameName(b.name, name))) {
          throw new Error(`An agent named ${name} already exists`);
        }
        const now = nowIso();
        const wanted: ScopeId[] = input.scopes ?? ["private"];
        if (!input.scopes) {
          if (s.folders.employeeShared) wanted.push("employee-shared");
          if (s.folders.departmentShared) wanted.push("department-shared");
        }
        const job = input.job.trim() || "Generalist";
        const mascotId = input.mascotId ?? mascotIdForTemplate(name);
        const ensured = await agentEnsure({
          data: {
            name,
            job,
            modelId: input.modelId,
            color: input.color,
            mascotId,
            scopes: wanted,
            standingInstructions: "Do the work in your private folder. Put finished deliverables in private/output/.",
            createdAt: now,
          },
        });
        if (!ensured.ok) throw new Error(ensured.error);
        const bot: Bot = {
          id: ensured.id,
          employeeId: employee.id,
          name,
          job,
          color: input.color,
          mascotId,
          modelId: input.modelId,
          scopes: ensured.scopes,
          privatePath: ensured.privatePath,
          standingInstructions:
            "Do the work in your private folder. Put finished deliverables in private/output/.",
          pinned: false,
          hidden: false,
          archived: false,
          unread: 0,
          sectionId: null,
          createdAt: now,
        };
        set({
          bots: [...s.bots, bot],
          sessions: { ...s.sessions, [bot.id]: sessionOf(bot.id) },
          ui: { ...s.ui, selectedBotId: bot.id, newAgentOpen: false },
          diskEpoch: s.diskEpoch + 1,
        });
        return bot;
      },

      renameBot: async (id, name) => {
        const s = get();
        const bot = s.bots.find((b) => b.id === id);
        if (!bot) return { ok: false, error: "Unknown agent" };
        if (!s.folders) return { ok: false, error: "Pick your folders in Settings → Folders first" };
        const wanted = name.trim().replace(/\s+/g, " ");
        if (!wanted) return { ok: false, error: "Agent name cannot be empty." };
        if (wanted === bot.name) return { ok: true };
        if (s.bots.some((b) => b.id !== id && sameName(b.name, wanted))) {
          return { ok: false, error: `An agent named ${wanted} already exists.` };
        }
        if (s.sessions[id]?.running) {
          return { ok: false, error: `${bot.name} is still working on a message. Stop it first.` };
        }
        // The sidecar moves agents/{Old}/ → agents/{New}/ and drops the ACP
        // session; only then does the roster label change. Chats stay on bot.id.
        const r = await agentRename({ data: { agentName: bot.name, newName: wanted } });
        if (!r.ok) return { ok: false, error: r.error };
        set((cur) => ({
          bots: cur.bots.map((b) =>
            b.id === id ? { ...b, name: r.name, privatePath: r.privatePath, scopes: r.scopes } : b,
          ),
          diskEpoch: cur.diskEpoch + 1,
        }));
        return { ok: true };
      },
      updateBotProfile: async (id, patch) => {
        const s = get();
        const bot = s.bots.find((b) => b.id === id);
        if (!bot) return { ok: false, error: "Unknown agent" };
        if (!s.folders) return { ok: false, error: "Pick your folders in Settings → Folders first" };
        if (s.sessions[id]?.running) {
          return { ok: false, error: `${bot.name} is still working on a message. Stop it first.` };
        }
        const wanted = patch.name !== undefined ? patch.name.trim().replace(/\s+/g, " ") : undefined;
        if (wanted !== undefined && !wanted) return { ok: false, error: "Agent name cannot be empty." };
        if (wanted && wanted !== bot.name && s.bots.some((b) => b.id !== id && sameName(b.name, wanted))) {
          return { ok: false, error: `An agent named ${wanted} already exists.` };
        }
        // Sidecar first: folder move (if renamed) + agent.json + AGENTS.md. Only then the roster row.
        const r = await agentUpdateProfile({
          data: {
            agentName: bot.name,
            newName: wanted && wanted !== bot.name ? wanted : undefined,
            job: patch.job,
            description: patch.description,
            mascotId: patch.mascotId,
            color: patch.color,
          },
        });
        if (!r.ok) return { ok: false, error: r.error };
        set((cur) => ({
          bots: cur.bots.map((b) =>
            b.id === id
              ? {
                  ...b,
                  name: r.name,
                  privatePath: r.privatePath,
                  scopes: r.scopes,
                  job: r.job,
                  color: colorId(r.color),
                  mascotId: isMascotId(r.mascotId) ? r.mascotId : b.mascotId,
                  standingInstructions: r.standingInstructions || DEFAULT_STANDING,
                }
              : b,
          ),
          diskEpoch: cur.diskEpoch + 1,
        }));
        return { ok: true };
      },
      startSetupAgent: async () => {
        const s = get();
        // "New agent", then "New agent 2", … — free in the roster (disk collisions are refused by ensureAgent).
        const taken = new Set(s.bots.map((b) => agentSlug(b.name).toLowerCase()));
        let name = SETUP_PLACEHOLDER_NAME;
        for (let i = 2; taken.has(name.toLowerCase()) && i < 1000; i++) name = `${SETUP_PLACEHOLDER_NAME} ${i}`;
        const modelId = s.selectedCatalogId ?? s.hostConfig.activeModelId ?? "";
        try {
          // The same disk path as the Advanced modal: createBot → agentEnsure → agents/{Name}/.
          const bot = await get().createBot({ name, job: SETUP_PLACEHOLDER_JOB, color: "steel", mascotId: "ops", modelId });
          set((cur) => ({ ui: { ...cur.ui, selectedBotId: bot.id, setupBotId: bot.id, newAgentOpen: false, composer: "" } }));
          return { ok: true, bot };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
      endSetup: (botId) => {
        set((cur) => (cur.ui.setupBotId === botId ? { ui: { ...cur.ui, setupBotId: null } } : {}));
      },
      createSection: async (name) => {
        const r = await sectionCreate({ data: { name } });
        if (!r.ok) return { ok: false, error: r.error };
        set({ sections: r.sections });
        return { ok: true, section: r.section };
      },
      renameSection: async (id, name) => {
        const r = await sectionRename({ data: { id, name } });
        if (!r.ok) return { ok: false, error: r.error };
        set({ sections: r.sections });
        return { ok: true };
      },
      deleteSection: async (id) => {
        const r = await sectionDelete({ data: { id } });
        if (!r.ok) return { ok: false, error: r.error };
        set((cur) => ({
          sections: r.sections,
          bots: cur.bots.map((b) => (b.sectionId === id ? { ...b, sectionId: null } : b)),
        }));
        return { ok: true };
      },
      moveBotToSection: async (botId, sectionId) => {
        const bot = get().bots.find((b) => b.id === botId);
        if (!bot) return { ok: false, error: "Unknown agent" };
        // Index row first; the browser copy follows.
        const r = await statePatchAgent({ data: { id: botId, sectionId } });
        if (!r.ok) return { ok: false, error: r.error };
        set((cur) => ({ bots: cur.bots.map((b) => (b.id === botId ? { ...b, sectionId } : b)) }));
        return { ok: true };
      },
      updateBot: (id, patch) => {
        set((s) => ({
          bots: s.bots.map((b) => (b.id === id ? { ...b, ...patch, id: b.id } : b)),
        }));
      },
      duplicateBot: async (id) => {
        const s = get();
        const src = s.bots.find((b) => b.id === id);
        if (!src) return { ok: false, error: "Unknown agent" };
        if (!s.folders) return { ok: false, error: "Pick your folders in Settings → Folders first" };
        const employee = s.employees.find((e) => e.id === src.employeeId) ?? s.employees[0];
        if (!employee) return { ok: false, error: "Finish onboarding first" };
        // Disk copy first (private/ incl. memory/notes.md, output/, AGENTS.md, fresh agent.json).
        const r = await agentDuplicate({
          data: { agentName: src.name, avoid: s.bots.map((b) => b.name) },
        });
        if (!r.ok) return { ok: false, error: r.error };
        // The copy is filed where the source is; the index row is written first.
        if (src.sectionId) await statePatchAgent({ data: { id: r.id, sectionId: src.sectionId } });
        const bot: Bot = {
          id: r.id,
          employeeId: employee.id,
          name: r.name,
          job: src.job,
          color: src.color,
          mascotId: src.mascotId,
          modelId: src.modelId,
          scopes: r.scopes,
          privatePath: r.privatePath,
          standingInstructions: src.standingInstructions,
          pinned: false,
          hidden: false,
          archived: false,
          unread: 0,
          sectionId: src.sectionId,
          createdAt: nowIso(),
        };
        set((cur) => ({
          bots: [...cur.bots, bot],
          sessions: { ...cur.sessions, [bot.id]: sessionOf(bot.id) },
          ui: { ...cur.ui, selectedBotId: bot.id },
          diskEpoch: cur.diskEpoch + 1,
        }));
        return { ok: true, bot };
      },
      hideBot: (id, hidden) => {
        set((s) => {
          const bots = s.bots.map((b) => (b.id === id ? { ...b, hidden } : b));
          const selectedBotId =
            hidden && s.ui.selectedBotId === id ? nextSelectable(bots, id) : s.ui.selectedBotId;
          return { bots, ui: { ...s.ui, selectedBotId } };
        });
        void statePatchAgent({ data: { id, hidden } });
      },
      archiveBot: async (id, archived) => {
        const s = get();
        const bot = s.bots.find((b) => b.id === id);
        if (!bot) return { ok: false, error: "Unknown agent" };
        if (!s.folders) return { ok: false, error: "Pick your folders in Settings → Folders first" };
        if (archived && s.sessions[id]?.running) {
          return { ok: false, error: `${bot.name} is still working on a message. Stop it first.` };
        }
        const r = await agentSetArchived({ data: { agentName: bot.name, archived } });
        if (!r.ok) return { ok: false, error: r.error };
        set((cur) => {
          const bots = cur.bots.map((b) => (b.id === id ? { ...b, archived: r.archived } : b));
          const selectedBotId =
            r.archived && cur.ui.selectedBotId === id ? nextSelectable(bots, id) : cur.ui.selectedBotId;
          return { bots, ui: { ...cur.ui, selectedBotId }, diskEpoch: cur.diskEpoch + 1 };
        });
        return { ok: true };
      },
      pinBot: (id, pinned) => {
        set((s) => ({ bots: s.bots.map((b) => (b.id === id ? { ...b, pinned } : b)) }));
        void statePatchAgent({ data: { id, pinned } });
      },
      deleteBot: async (id) => {
        const s = get();
        const bot = s.bots.find((b) => b.id === id);
        if (bot && s.folders) {
          await agentRemove({ data: { agentName: bot.name } });
        }
        const sessions = { ...s.sessions };
        delete sessions[id];
        const remaining = s.bots.filter((b) => b.id !== id);
        set({
          bots: remaining,
          sessions,
          diskEpoch: s.diskEpoch + 1,
          ui: {
            ...s.ui,
            selectedBotId:
              s.ui.selectedBotId === id ? nextSelectable(remaining, id) : s.ui.selectedBotId,
            setupBotId: s.ui.setupBotId === id ? null : s.ui.setupBotId,
            editProfileBotId: s.ui.editProfileBotId === id ? null : s.ui.editProfileBotId,
          },
        });
      },
      setBotModel: async (id, modelId) => {
        const s = get();
        const bot = s.bots.find((b) => b.id === id);
        if (!bot) return { ok: false, error: "Unknown agent" };
        if (!s.folders) return { ok: false, error: "Pick your folders in Settings → Folders first" };
        if (s.sessions[id]?.running) {
          return { ok: false, error: `${bot.name} is still working on a message. Stop it first.` };
        }
        const r = await agentSetModel({ data: { agentName: bot.name, modelId } });
        if (!r.ok) return { ok: false, error: r.error };
        set((cur) => ({
          bots: cur.bots.map((b) => (b.id === id ? { ...b, modelId: r.modelId } : b)),
          diskEpoch: cur.diskEpoch + 1,
        }));
        return { ok: true };
      },
      setBotScopes: async (id, scopes) => {
        const s = get();
        const bot = s.bots.find((b) => b.id === id);
        if (!bot) return { ok: false, error: "Unknown agent" };
        const r = await agentSetScopes({ data: { agentName: bot.name, scopes } });
        if (!r.ok) return { ok: false, error: r.error };
        set({
          bots: s.bots.map((b) => (b.id === id ? { ...b, scopes: r.scopes } : b)),
          diskEpoch: s.diskEpoch + 1,
        });
        return { ok: true };
      },
      markRead: (botId) => {
        const had = get().bots.find((b) => b.id === botId)?.unread ?? 0;
        set((s) => ({
          bots: s.bots.map((b) => (b.id === botId ? { ...b, unread: 0 } : b)),
          sessions: {
            ...s.sessions,
            [botId]: { ...(s.sessions[botId] ?? sessionOf(botId)), lastReadAt: nowIso() },
          },
        }));
        if (had > 0) void statePatchAgent({ data: { id: botId, unread: 0 } });
      },
      bumpUnread: (botId) => {
        set((s) => ({
          bots: s.bots.map((b) =>
            b.id === botId && s.ui.selectedBotId !== botId ? { ...b, unread: b.unread + 1 } : b,
          ),
        }));
        const bot = get().bots.find((b) => b.id === botId);
        if (bot) void statePatchAgent({ data: { id: botId, unread: bot.unread } });
      },

      renameCompany: (name) => {
        const s = get();
        if (!s.company) return;
        const company = { ...s.company, name: agentSlug(name) };
        set({ company });
        void statePatchIndex({ data: { company: { id: company.id, name: company.name, createdAt: company.createdAt } } });
      },

      appendMessage: (botId, msg) => {
        const message: ChatMessage = {
          id: msg.id ?? uid("msg"),
          botId,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt ?? nowIso(),
          chips: msg.chips,
          permission: msg.permission,
          permissionDecision: msg.permissionDecision,
          handoffTo: msg.handoffTo,
        };
        set((s) => {
          const sess = s.sessions[botId] ?? sessionOf(botId);
          return {
            sessions: {
              ...s.sessions,
              [botId]: { ...sess, messages: [...sess.messages, message] },
            },
          };
        });
        scheduleChatSave(botId);
        return message;
      },
      patchMessage: (botId, msgId, patch) => {
        set((s) => {
          const sess = s.sessions[botId];
          if (!sess) return s;
          return {
            sessions: {
              ...s.sessions,
              [botId]: {
                ...sess,
                messages: sess.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
              },
            },
          };
        });
        scheduleChatSave(botId);
      },
      setSessionRunning: (botId, running) =>
        set((s) => {
          const sess = s.sessions[botId] ?? sessionOf(botId);
          return {
            sessions: {
              ...s.sessions,
              [botId]: { ...sess, running, stopRequested: running ? sess.stopRequested : false },
            },
          };
        }),
      requestStop: (botId) =>
        set((s) => {
          const sess = s.sessions[botId];
          if (!sess) return s;
          return { sessions: { ...s.sessions, [botId]: { ...sess, stopRequested: true, running: false } } };
        }),
      clearStop: (botId) =>
        set((s) => {
          const sess = s.sessions[botId];
          if (!sess) return s;
          return { sessions: { ...s.sessions, [botId]: { ...sess, stopRequested: false } } };
        }),
      addChatGrant: (botId, key) => {
        set((s) => {
          const sess = s.sessions[botId] ?? sessionOf(botId);
          return {
            sessions: {
              ...s.sessions,
              [botId]: { ...sess, chatGrants: { ...sess.chatGrants, [key]: true } },
            },
          };
        });
        scheduleChatSave(botId);
      },
      hasChatGrant: (botId, key) => Boolean(get().sessions[botId]?.chatGrants[key]),

      writeBotFile: async (botId, path, content) => {
        const bot = get().bots.find((b) => b.id === botId);
        if (!bot) return { ok: false, error: "Unknown agent" };
        const t = withScope(bot, path);
        if ("error" in t) return { ok: false, error: t.error };
        const r = await agentFsWrite({ data: { ...t, agentName: bot.name, content } });
        if (r.ok) get().bumpDisk();
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      readBotFile: async (botId, path) => {
        const bot = get().bots.find((b) => b.id === botId);
        if (!bot) return { ok: false, error: "Unknown agent" };
        const t = withScope(bot, path);
        if ("error" in t) return { ok: false, error: t.error };
        const r = await agentFsRead({ data: { ...t, agentName: bot.name } });
        return r.ok ? { ok: true, content: r.content } : { ok: false, error: r.error };
      },
      listBotDir: async (botId, path) => {
        const bot = get().bots.find((b) => b.id === botId);
        if (!bot) return { ok: false, error: "Unknown agent" };
        const t = withScope(bot, path);
        if ("error" in t) return { ok: false, error: t.error };
        const r = await agentFsTree({ data: { ...t, agentName: bot.name, max: 80 } });
        return r.ok ? { ok: true, listing: r.listing } : { ok: false, error: r.error };
      },
      replaceBotFile: async (botId, path, oldString, newString) => {
        const bot = get().bots.find((b) => b.id === botId);
        if (!bot) return { ok: false, error: "Unknown agent" };
        const t = withScope(bot, path);
        if ("error" in t) return { ok: false, error: t.error };
        const r = await agentFsReplace({
          data: { ...t, agentName: bot.name, oldString, newString },
        });
        if (r.ok) get().bumpDisk();
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      deleteBotFile: async (botId, path) => {
        const bot = get().bots.find((b) => b.id === botId);
        if (!bot) return { ok: false, error: "Unknown agent" };
        const t = withScope(bot, path);
        if ("error" in t) return { ok: false, error: t.error };
        const r = await agentFsDelete({ data: { ...t, agentName: bot.name } });
        if (r.ok) get().bumpDisk();
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      shellBot: async (botId, command) => {
        const bot = get().bots.find((b) => b.id === botId);
        if (!bot) return { ok: false, error: "Unknown agent" };
        const r = await agentFsRunCommand({ data: { agentName: bot.name, command } });
        if (r.ok) get().bumpDisk();
        return r.ok
          ? { ok: true, stdout: r.stdout, stderr: r.stderr, code: r.code }
          : { ok: false, error: r.error };
      },

      handoffTask: async (fromBotId, toBotName, task) => {
        const s = get();
        const from = s.bots.find((b) => b.id === fromBotId);
        if (!from) return { ok: false, error: "Unknown agent" };
        const needle = toBotName.replace(/^@/, "");
        const to = s.bots.find((b) => sameName(b.name, needle));
        if (!to) return { ok: false, error: `No agent named ${toBotName}` };
        if (to.archived) {
          return { ok: false, error: `${to.name} is archived. Unarchive it before handing work over. Nothing was written.` };
        }
        if (to.hidden) {
          return { ok: false, error: `${to.name} is hidden. Unhide it before handing work over. Nothing was written.` };
        }
        if (from.archived) return { ok: false, error: `${from.name} is archived.` };
        // employee-shared, else department-shared, else nothing — never company-shared, never private.
        const scope = handoffScope(s.folders);
        if (!scope) {
          return {
            ok: false,
            error:
              "No shared folder is connected. Handoffs need Employee shared or Department shared — pick one in Settings → Folders. Nothing was written.",
          };
        }
        if (!from.scopes.includes(scope)) {
          return { ok: false, error: `${from.name} is not granted ${SCOPE_META[scope].label}.` };
        }
        if (!to.scopes.includes(scope)) {
          return { ok: false, error: `${to.name} is not granted ${SCOPE_META[scope].label}, so it could not read the task.` };
        }
        const filename = `task-${Date.now()}-${from.name}-to-${to.name}.md`;
        const body = `# Handoff from ${from.name} to ${to.name}\n\n${task}\n`;
        const wrote = await agentFsWrite({
          data: { scope, relPath: filename, agentName: from.name, content: body },
        });
        if (!wrote.ok) return { ok: false, error: wrote.error };
        const display = displayPath(scope, filename);
        const toSess = s.sessions[to.id] ?? sessionOf(to.id);
        const notice: ChatMessage = {
          id: uid("msg"),
          botId: to.id,
          role: "system",
          content: `${from.name} handed you a task in ${display}:\n\n${task}`,
          createdAt: nowIso(),
        };
        set({
          diskEpoch: s.diskEpoch + 1,
          sessions: {
            ...s.sessions,
            [to.id]: { ...toSess, messages: [...toSess.messages, notice] },
          },
          bots: s.bots.map((b) => (b.id === to.id ? { ...b, unread: b.unread + 1 } : b)),
        });
        scheduleChatSave(to.id);
        void statePatchAgent({ data: { id: to.id, unread: to.unread + 1 } });
        return { ok: true, toBotId: to.id, path: display };
      },

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      selectBot: (id) => {
        set((s) => ({ ui: { ...s.ui, selectedBotId: id, agentsOpen: false } }));
        if (id) get().markRead(id);
      },
    }),
    {
      name: "localbot-state-v3",
      storage: createJSONStorage(() => memoryStorage),
      /**
       * Stage 7: the browser copy is UI chrome only. Roster / chats /
       * onboarding / labels come from the sidecar in `loadFromDisk`. A
       * pre-Stage-7 `localbot-state-v3` that still carries bots is stashed as
       * `legacySnapshot` for the one-time `stateMigrate`; it is never merged
       * into the live roster.
       */
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppSnapshot>;
        const legacyBots = (p.bots ?? []).map((raw) => {
          const legacy = raw as Bot & { grants?: FolderGrant[] };
          const scopes =
            Array.isArray(legacy.scopes) && legacy.scopes.length > 0
              ? legacy.scopes
              : scopesFromLegacyGrants(legacy.grants);
          return {
            ...raw,
            scopes,
            mascotId: isMascotId(raw.mascotId) ? raw.mascotId : mascotIdForTemplate(raw.name ?? ""),
            hidden: Boolean(raw.hidden),
            archived: Boolean(raw.archived),
          };
        });
        const legacySnapshot: LegacySnapshot | null =
          legacyBots.length > 0 || p.onboarded === true
            ? {
                onboarded: p.onboarded,
                company: p.company,
                departments: p.departments,
                employees: p.employees,
                activeEmployeeId: p.activeEmployeeId,
                selectedCatalogId: p.selectedCatalogId,
                bots: legacyBots,
                sessions: p.sessions,
              }
            : null;
        return {
          ...current,
          version: current.version,
          hardware: p.hardware ?? current.hardware,
          runtime: p.runtime ? { ...current.runtime, ...p.runtime, aiAvailable: false } : current.runtime,
          previewWritesToProjectData: p.previewWritesToProjectData ?? current.previewWritesToProjectData,
          settings: {
            ...current.settings,
            ...p.settings,
            // Mirrors of localbot-config.json; loadFromDisk overwrites them from the sidecar.
            allowHostedDemo: Boolean(p.settings?.allowHostedDemo),
            useExistingOllama: Boolean(p.settings?.useExistingOllama),
          },
          legacySnapshot,
        };
      },
      // UI chrome only. NOT persisted here any more: onboarded, company /
      // departments / employees / activeEmployeeId, bots, selectedCatalogId,
      // sessions (chats + chat grants). Those live in {dataDir}/localbot-agents.json,
      // agents/{Name}/agent.json and {dataDir}/chats/.
      partialize: (s) => ({
        version: s.version,
        hardware: s.hardware,
        settings: s.settings,
        runtime: { ...s.runtime, aiAvailable: false },
        previewWritesToProjectData: s.previewWritesToProjectData,
      }),
    },
  ),
);

export function resolveBot(
  s: Pick<AppSnapshot, "bots" | "employees" | "departments" | "company">,
  botId: string,
) {
  const bot = s.bots.find((b) => b.id === botId);
  if (!bot || !s.company) return null;
  const employee = s.employees.find((e) => e.id === bot.employeeId);
  if (!employee) return null;
  const department = s.departments.find((d) => d.id === employee.departmentId);
  if (!department) return null;
  return { bot, employee, department, company: s.company };
}

/** Default roster: not hidden (local filter), not archived (agent.json). */
export function visibleBots(s: Pick<AppSnapshot, "bots">): Bot[] {
  return [...s.bots]
    .filter(isActiveBot)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
}

/** Archived agents, for the restore list. */
export function archivedBots(s: Pick<AppSnapshot, "bots">): Bot[] {
  return s.bots.filter((b) => b.archived).sort((a, b) => a.name.localeCompare(b.name));
}
