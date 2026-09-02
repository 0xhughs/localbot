import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CATALOG_PIN } from "./catalog";
import {
  agentEnsure,
  agentFsDelete,
  agentFsRead,
  agentFsReplace,
  agentFsRunCommand,
  agentFsTree,
  agentFsWrite,
  agentRemove,
  agentSetScopes,
  foldersGet,
  foldersSet,
} from "./fs/server";
import {
  displayPath,
  handoffScope,
  parseScopedPath,
  SCOPE_META,
  type FoldersConfig,
  type ScopeId,
} from "./fs/scope-model";
import { mascotIdForTemplate, isMascotId, type MascotId } from "./mascots";
import type {
  AgentColorId,
  AppSnapshot,
  Bot,
  ChatMessage,
  Company,
  Department,
  Employee,
  FolderGrant,
  HardwareReport,
  Session,
  Settings,
  UiState,
  RuntimeStatus,
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
};

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

type Actions = {
  ui: UiState;
  hydrated: boolean;
  diskEpoch: number;
  /** Server-owned folder scopes. Not persisted in the browser; loaded from the sidecar. */
  folders: FoldersConfig | null;
  foldersMeta: FoldersMeta;
  setHydrated: (v: boolean) => void;
  setUi: (patch: Partial<UiState>) => void;
  resetAll: () => void;
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
  renameBot: (id: string, name: string) => void;
  updateBot: (id: string, patch: Partial<Bot>) => void;
  duplicateBot: (id: string) => Promise<Bot | null>;
  hideBot: (id: string, hidden: boolean) => void;
  pinBot: (id: string, pinned: boolean) => void;
  deleteBot: (id: string) => Promise<void>;
  setBotScopes: (id: string, scopes: ScopeId[]) => Promise<Result>;
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

function slugName(name: string): string {
  const s = name.trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ");
  return s || "Untitled";
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

function withScope(bot: Bot, path: string): { scope: ScopeId; relPath: string } | { error: string } {
  const parsed = parseScopedPath(path);
  if (!bot.scopes.includes(parsed.scope)) {
    return {
      error: `Denied: ${displayPath(parsed.scope, parsed.relPath)} is outside this agent's folders (${SCOPE_META[parsed.scope].label} is not granted).`,
    };
  }
  return parsed;
}

export const useLocalBot = create<LocalBotState>()(
  persist(
    (set, get) => ({
      ...emptySnapshot(),
      ui: DEFAULT_UI,
      hydrated: false,
      diskEpoch: 0,
      folders: null,
      foldersMeta: { legacyCompanyRoot: null, isElectron: false, loaded: false },
      setHydrated: (v) => set({ hydrated: v }),
      setUi: (patch) => set({ ui: { ...get().ui, ...patch } }),
      resetAll: () =>
        set({ ...emptySnapshot(), ui: { ...DEFAULT_UI }, hydrated: true, diskEpoch: 0 }),

      setHardware: (h) => set({ hardware: h }),
      noteCatalog: (catalogId) => set({ selectedCatalogId: catalogId }),
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
        const next: Bot[] = [];
        for (const bot of s.bots) {
          const r = await agentEnsure({
            data: {
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
          next.push(r.ok ? { ...bot, privatePath: r.privatePath, scopes: r.scopes } : bot);
        }
        set({ bots: next, diskEpoch: get().diskEpoch + 1 });
      },

      completeOnboarding: async (input) => {
        const companyName = slugName(input.companyName);
        const deptName = slugName(input.departmentName);
        const empName = slugName(input.employeeName);
        const botName = slugName(input.botName);
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
          },
        });
        if (!ensured.ok) return { ok: false, error: ensured.error };
        const bot: Bot = {
          id: uid("bot"),
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
          unread: 0,
          createdAt: now,
        };
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
        const name = slugName(input.name);
        if (s.bots.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
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
          id: uid("bot"),
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
          unread: 0,
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

      renameBot: (id, name) => {
        const next = slugName(name);
        set((s) => ({ bots: s.bots.map((b) => (b.id === id ? { ...b, name: next } : b)) }));
      },
      updateBot: (id, patch) => {
        set((s) => ({
          bots: s.bots.map((b) => (b.id === id ? { ...b, ...patch, id: b.id } : b)),
        }));
      },
      duplicateBot: async (id) => {
        const src = get().bots.find((b) => b.id === id);
        if (!src) return null;
        return get().createBot({
          name: `${src.name} copy`,
          job: src.job,
          color: src.color,
          mascotId: src.mascotId,
          modelId: src.modelId,
          scopes: src.scopes,
        });
      },
      hideBot: (id, hidden) =>
        set((s) => ({ bots: s.bots.map((b) => (b.id === id ? { ...b, hidden } : b)) })),
      pinBot: (id, pinned) =>
        set((s) => ({ bots: s.bots.map((b) => (b.id === id ? { ...b, pinned } : b)) })),
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
              s.ui.selectedBotId === id ? (remaining[0]?.id ?? null) : s.ui.selectedBotId,
          },
        });
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
      markRead: (botId) =>
        set((s) => ({
          bots: s.bots.map((b) => (b.id === botId ? { ...b, unread: 0 } : b)),
          sessions: {
            ...s.sessions,
            [botId]: { ...(s.sessions[botId] ?? sessionOf(botId)), lastReadAt: nowIso() },
          },
        })),
      bumpUnread: (botId) =>
        set((s) => ({
          bots: s.bots.map((b) =>
            b.id === botId && s.ui.selectedBotId !== botId ? { ...b, unread: b.unread + 1 } : b,
          ),
        })),

      renameCompany: (name) =>
        set((s) => (s.company ? { company: { ...s.company, name: slugName(name) } } : s)),

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
      addChatGrant: (botId, key) =>
        set((s) => {
          const sess = s.sessions[botId] ?? sessionOf(botId);
          return {
            sessions: {
              ...s.sessions,
              [botId]: { ...sess, chatGrants: { ...sess.chatGrants, [key]: true } },
            },
          };
        }),
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
        const needle = toBotName.replace(/^@/, "").toLowerCase();
        const to = s.bots.find((b) => b.name.toLowerCase() === needle && !b.hidden);
        if (!to) return { ok: false, error: `No agent named ${toBotName}` };
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
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppSnapshot>;
        const bots = (p.bots ?? current.bots).map((raw) => {
          const legacy = raw as Bot & { grants?: FolderGrant[] };
          const scopes =
            Array.isArray(legacy.scopes) && legacy.scopes.length > 0
              ? legacy.scopes
              : scopesFromLegacyGrants(legacy.grants);
          return {
            ...raw,
            scopes,
            privatePath: typeof legacy.privatePath === "string" ? legacy.privatePath : "",
            mascotId: isMascotId(raw.mascotId) ? raw.mascotId : mascotIdForTemplate(raw.name ?? ""),
          };
        });
        return {
          ...current,
          ...p,
          bots,
          settings: {
            ...current.settings,
            ...p.settings,
            allowHostedDemo: Boolean(p.settings?.allowHostedDemo),
            useExistingOllama: Boolean(p.settings?.useExistingOllama),
          },
        };
      },
      partialize: (s) => ({
        version: s.version,
        onboarded: s.onboarded,
        company: s.company,
        departments: s.departments,
        employees: s.employees,
        bots: s.bots,
        selectedCatalogId: s.selectedCatalogId,
        sessions: Object.fromEntries(
          Object.entries(s.sessions).map(([id, sess]) => [
            id,
            { ...sess, running: false, stopRequested: false },
          ]),
        ),
        hardware: s.hardware,
        settings: s.settings,
        runtime: { ...s.runtime, aiAvailable: false },
        activeEmployeeId: s.activeEmployeeId,
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

export function visibleBots(s: AppSnapshot): Bot[] {
  return [...s.bots]
    .filter((b) => !b.hidden)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
}
