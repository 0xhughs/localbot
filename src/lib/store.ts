import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CATALOG_PIN } from "./catalog";
import {
  allowedRootsFor,
  botPath,
  departmentPath,
  employeePath,
  grantPathFor,
  remapUnderRoot,
  resolveAgentFilePath,
} from "./fs/company";
import {
  fsDelete,
  fsMove,
  fsRead,
  fsReplace,
  fsRunCommand,
  fsSeedBot,
  fsSeedCompanyTree,
  fsSeedDepartment,
  fsSeedEmployee,
  fsSetCompanyRoot,
  fsTree,
  fsWrite,
} from "./fs/server";
import { pathAllowed } from "./permissions";
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
} from "./types";
import { nowIso, posixJoin, uid } from "./utils";

const DEFAULT_SETTINGS: Settings = {
  darkMode: true,
  webSearchEnabled: false,
  controlThisComputer: false,
  denseUi: true,
  companyRootIsShared: false,
};

const DEFAULT_UI: UiState = {
  selectedBotId: null,
  showComputer: true,
  showSettings: false,
  settingsTab: "general",
  composer: "",
  commandOpen: false,
  agentsOpen: false,
  pendingPermission: null,
  previewPath: null,
  newAgentOpen: false,
};

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
      engine: "hosted-grok-4.5",
      model: "grok-4.5",
      aiAvailable: false,
      lastHeartbeat: null,
    },
    activeEmployeeId: null,
    previewWritesToProjectData: true,
  };
}

type Actions = {
  ui: UiState;
  hydrated: boolean;
  diskEpoch: number;
  setHydrated: (v: boolean) => void;
  setUi: (patch: Partial<UiState>) => void;
  resetAll: () => void;
  setHardware: (h: HardwareReport) => void;
  noteCatalog: (catalogId: string) => void;
  setAiAvailable: (available: boolean) => void;
  bumpDisk: () => void;
  completeOnboarding: (input: {
    companyName: string;
    departmentName: string;
    employeeName: string;
    botName: string;
    botJob: string;
    color: AgentColorId;
    modelId: string;
    sharedRoot: boolean;
    companyRoot: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  createBot: (input: {
    name: string;
    job: string;
    color: AgentColorId;
    modelId: string;
    extraGrants?: FolderGrant[];
  }) => Promise<Bot>;
  renameBot: (id: string, name: string) => void;
  updateBot: (id: string, patch: Partial<Bot>) => void;
  duplicateBot: (id: string) => Promise<Bot | null>;
  hideBot: (id: string, hidden: boolean) => void;
  pinBot: (id: string, pinned: boolean) => void;
  deleteBot: (id: string) => Promise<void>;
  setBotGrants: (id: string, grants: FolderGrant[]) => Promise<void>;
  moveBotToEmployee: (botId: string, employeeId: string) => Promise<void>;
  markRead: (botId: string) => void;
  bumpUnread: (botId: string) => void;
  createDepartment: (name: string) => Promise<Department>;
  createEmployee: (departmentId: string, displayName: string) => Promise<Employee>;
  setCompanyRootShared: (shared: boolean) => void;
  renameCompany: (name: string) => void;
  applyCompanyRoot: (absolutePath: string) => Promise<{ ok: true; root: string } | { ok: false; error: string }>;
  seedFoldersHere: () => Promise<{ ok: true } | { ok: false; error: string }>;
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
  writeBotFile: (
    botId: string,
    path: string,
    content: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
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
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  deleteBotFile: (
    botId: string,
    path: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
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

function ctxRoots(
  s: Pick<AppSnapshot, "bots" | "employees" | "departments" | "company">,
  botId: string,
) {
  const ctx = resolveBot(s, botId);
  if (!ctx) return null;
  return {
    ...ctx,
    companyRoot: ctx.company.root,
    allowedRoots: allowedRootsFor(ctx.bot, ctx.employee, ctx.department, ctx.company),
  };
}

export const useLocalBot = create<LocalBotState>()(
  persist(
    (set, get) => ({
      ...emptySnapshot(),
      ui: DEFAULT_UI,
      hydrated: false,
      diskEpoch: 0,
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
      bumpDisk: () => set((s) => ({ diskEpoch: s.diskEpoch + 1 })),

      completeOnboarding: async (input) => {
        const companyName = slugName(input.companyName);
        const deptName = slugName(input.departmentName);
        const empName = slugName(input.employeeName);
        const botName = slugName(input.botName);
        const root = input.companyRoot.trim();
        if (!root) return { ok: false, error: "Company root path is required." };
        const cfg = await fsSetCompanyRoot({ data: { absolutePath: root } });
        const now = nowIso();
        const company: Company = {
          id: uid("co"),
          name: companyName,
          root: cfg.companyRoot,
          defaultDepartmentId: "",
          catalogPin: CATALOG_PIN,
          createdAt: now,
        };
        const department: Department = {
          id: uid("dept"),
          companyId: company.id,
          name: deptName,
          path: departmentPath(company.root, deptName),
          createdAt: now,
        };
        company.defaultDepartmentId = department.id;
        const employee: Employee = {
          id: uid("emp"),
          departmentId: department.id,
          displayName: empName,
          path: employeePath(department.path, empName),
          defaultModelId: input.modelId,
          createdAt: now,
        };
        const bP = botPath(employee.path, botName);
        const bot: Bot = {
          id: uid("bot"),
          employeeId: employee.id,
          name: botName,
          job: input.botJob.trim() || "Generalist",
          color: input.color,
          modelId: input.modelId,
          path: bP,
          workspacePath: posixJoin(bP, "workspace"),
          outputPath: posixJoin(bP, "output"),
          memoryPath: posixJoin(bP, "memory"),
          grants: ["workspace", "output", "outbox", "shared"],
          standingInstructions:
            "Do the work in your workspace. Put finished deliverables in output/. Use the department shared folder when handing work to another agent.",
          pinned: true,
          hidden: false,
          unread: 0,
          createdAt: now,
        };
        const seeded = await fsSeedCompanyTree({
          data: {
            companyRoot: company.root,
            company,
            department,
            employee,
            bots: [bot],
          },
        });
        if (!seeded.ok) return seeded;
        set({
          onboarded: true,
          company,
          departments: [department],
          employees: [employee],
          bots: [bot],
          selectedCatalogId: input.modelId,
          sessions: { [bot.id]: sessionOf(bot.id) },
          activeEmployeeId: employee.id,
          previewWritesToProjectData: cfg.previewWritesToProjectData,
          settings: { ...get().settings, companyRootIsShared: input.sharedRoot },
          runtime: {
            ...get().runtime,
            lastHeartbeat: now,
          },
          ui: { ...DEFAULT_UI, selectedBotId: bot.id, showComputer: true },
          diskEpoch: get().diskEpoch + 1,
        });
        return { ok: true };
      },

      createBot: async (input) => {
        const s = get();
        const employee =
          s.employees.find((e) => e.id === s.activeEmployeeId) ?? s.employees[0];
        const department = s.departments.find((d) => d.id === employee?.departmentId);
        if (!employee || !department || !s.company) {
          throw new Error("Create a company first");
        }
        const name = slugName(input.name);
        const bP = botPath(employee.path, name);
        const now = nowIso();
        const bot: Bot = {
          id: uid("bot"),
          employeeId: employee.id,
          name,
          job: input.job.trim() || "Generalist",
          color: input.color,
          modelId: input.modelId,
          path: bP,
          workspacePath: posixJoin(bP, "workspace"),
          outputPath: posixJoin(bP, "output"),
          memoryPath: posixJoin(bP, "memory"),
          grants: ["workspace", "output", "outbox", ...(input.extraGrants ?? ["shared"])],
          standingInstructions:
            "Do the work in your workspace. Put finished deliverables in output/.",
          pinned: false,
          hidden: false,
          unread: 0,
          createdAt: now,
        };
        await fsSeedBot({
          data: {
            companyRoot: s.company.root,
            bot,
            department,
            employee,
          },
        });
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
          modelId: src.modelId,
          extraGrants: src.grants.filter((g) => g === "shared" || g === "company-shared"),
        });
      },
      hideBot: (id, hidden) =>
        set((s) => ({ bots: s.bots.map((b) => (b.id === id ? { ...b, hidden } : b)) })),
      pinBot: (id, pinned) =>
        set((s) => ({ bots: s.bots.map((b) => (b.id === id ? { ...b, pinned } : b)) })),
      deleteBot: async (id) => {
        const s = get();
        const bot = s.bots.find((b) => b.id === id);
        if (bot && s.company) {
          await fsDelete({ data: { path: bot.path, companyRoot: s.company.root } });
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
      setBotGrants: async (id, grants) => {
        const s = get();
        const bot = s.bots.find((b) => b.id === id);
        if (!bot || !s.company) return;
        await fsWrite({
          data: {
            companyRoot: s.company.root,
            path: posixJoin(bot.path, "bot.json"),
            content:
              JSON.stringify(
                {
                  name: bot.name,
                  job: bot.job,
                  modelId: bot.modelId,
                  color: bot.color,
                  grants,
                  createdAt: bot.createdAt,
                },
                null,
                2,
              ) + "\n",
          },
        });
        set({
          bots: s.bots.map((b) => (b.id === id ? { ...b, grants } : b)),
          diskEpoch: s.diskEpoch + 1,
        });
      },
      moveBotToEmployee: async (botId, employeeId) => {
        const s = get();
        const bot = s.bots.find((b) => b.id === botId);
        const employee = s.employees.find((e) => e.id === employeeId);
        const department = s.departments.find((d) => d.id === employee?.departmentId);
        if (!bot || !employee || !department || !s.company) return;
        const dest = botPath(employee.path, bot.name);
        await fsMove({
          data: { from: bot.path, to: dest, companyRoot: s.company.root },
        });
        set({
          diskEpoch: s.diskEpoch + 1,
          bots: s.bots.map((b) =>
            b.id === botId
              ? {
                  ...b,
                  employeeId,
                  path: dest,
                  workspacePath: posixJoin(dest, "workspace"),
                  outputPath: posixJoin(dest, "output"),
                  memoryPath: posixJoin(dest, "memory"),
                }
              : b,
          ),
        });
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

      createDepartment: async (name) => {
        const s = get();
        if (!s.company) throw new Error("No company");
        const deptName = slugName(name);
        const department: Department = {
          id: uid("dept"),
          companyId: s.company.id,
          name: deptName,
          path: departmentPath(s.company.root, deptName),
          createdAt: nowIso(),
        };
        await fsSeedDepartment({
          data: { companyRoot: s.company.root, department },
        });
        set({ departments: [...s.departments, department], diskEpoch: s.diskEpoch + 1 });
        return department;
      },
      createEmployee: async (departmentId, displayName) => {
        const s = get();
        const department = s.departments.find((d) => d.id === departmentId);
        if (!department || !s.company) throw new Error("Missing department");
        const employee: Employee = {
          id: uid("emp"),
          departmentId,
          displayName: slugName(displayName),
          path: employeePath(department.path, slugName(displayName)),
          defaultModelId: s.selectedCatalogId,
          createdAt: nowIso(),
        };
        await fsSeedEmployee({
          data: { companyRoot: s.company.root, department, employee },
        });
        set({ employees: [...s.employees, employee], diskEpoch: s.diskEpoch + 1 });
        return employee;
      },
      setCompanyRootShared: (shared) =>
        set((s) => ({ settings: { ...s.settings, companyRootIsShared: shared } })),
      renameCompany: (name) =>
        set((s) => (s.company ? { company: { ...s.company, name: slugName(name) } } : s)),

      applyCompanyRoot: async (absolutePath) => {
        try {
          const cfg = await fsSetCompanyRoot({ data: { absolutePath } });
          const s = get();
          if (!s.company) {
            set({ previewWritesToProjectData: cfg.previewWritesToProjectData });
            return { ok: true, root: cfg.companyRoot };
          }
          const oldRoot = s.company.root;
          const newRoot = cfg.companyRoot;
          const remap = (p: string) => remapUnderRoot(oldRoot, newRoot, p);
          set({
            company: { ...s.company, root: newRoot },
            departments: s.departments.map((d) => ({ ...d, path: remap(d.path) })),
            employees: s.employees.map((e) => ({ ...e, path: remap(e.path) })),
            bots: s.bots.map((b) => ({
              ...b,
              path: remap(b.path),
              workspacePath: remap(b.workspacePath),
              outputPath: remap(b.outputPath),
              memoryPath: remap(b.memoryPath),
            })),
            previewWritesToProjectData: cfg.previewWritesToProjectData,
            diskEpoch: s.diskEpoch + 1,
          });
          return { ok: true, root: cfg.companyRoot };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      },

      seedFoldersHere: async () => {
        const s = get();
        if (!s.company || !s.departments[0] || !s.employees[0]) {
          return { ok: false, error: "Finish onboarding first." };
        }
        const seeded = await fsSeedCompanyTree({
          data: {
            companyRoot: s.company.root,
            company: s.company,
            department: s.departments[0],
            employee: s.employees[0],
            bots: s.bots.filter((b) => b.employeeId === s.employees[0]!.id),
          },
        });
        if (seeded.ok) set({ diskEpoch: s.diskEpoch + 1 });
        return seeded;
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
        const ctx = ctxRoots(get(), botId);
        if (!ctx) return { ok: false, error: "Unknown agent" };
        const n = resolveAgentFilePath(path, ctx.bot, ctx.employee, ctx.department, ctx.company);
        if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) {
          return { ok: false, error: `Denied: ${n} is outside this agent's grants.` };
        }
        const r = await fsWrite({
          data: {
            path: n,
            content,
            companyRoot: ctx.companyRoot,
            allowedRoots: ctx.allowedRoots,
          },
        });
        if (r.ok) get().bumpDisk();
        return r;
      },
      readBotFile: async (botId, path) => {
        const ctx = ctxRoots(get(), botId);
        if (!ctx) return { ok: false, error: "Unknown agent" };
        const n = resolveAgentFilePath(path, ctx.bot, ctx.employee, ctx.department, ctx.company);
        if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) {
          return { ok: false, error: `Denied: ${n} is outside this agent's grants.` };
        }
        return fsRead({
          data: { path: n, companyRoot: ctx.companyRoot, allowedRoots: ctx.allowedRoots },
        });
      },
      listBotDir: async (botId, path) => {
        const ctx = ctxRoots(get(), botId);
        if (!ctx) return { ok: false, error: "Unknown agent" };
        const n = resolveAgentFilePath(path, ctx.bot, ctx.employee, ctx.department, ctx.company);
        if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) {
          return { ok: false, error: `Denied: ${n} is outside this agent's grants.` };
        }
        return fsTree({
          data: {
            path: n,
            companyRoot: ctx.companyRoot,
            allowedRoots: ctx.allowedRoots,
            max: 80,
          },
        });
      },
      replaceBotFile: async (botId, path, oldString, newString) => {
        const ctx = ctxRoots(get(), botId);
        if (!ctx) return { ok: false, error: "Unknown agent" };
        const n = resolveAgentFilePath(path, ctx.bot, ctx.employee, ctx.department, ctx.company);
        if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) {
          return { ok: false, error: `Denied: ${n} is outside this agent's grants.` };
        }
        const r = await fsReplace({
          data: {
            path: n,
            oldString,
            newString,
            companyRoot: ctx.companyRoot,
            allowedRoots: ctx.allowedRoots,
          },
        });
        if (r.ok) get().bumpDisk();
        return r;
      },
      deleteBotFile: async (botId, path) => {
        const ctx = ctxRoots(get(), botId);
        if (!ctx) return { ok: false, error: "Unknown agent" };
        const n = resolveAgentFilePath(path, ctx.bot, ctx.employee, ctx.department, ctx.company);
        if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) {
          return { ok: false, error: `Denied: ${n} is outside this agent's grants.` };
        }
        const r = await fsDelete({
          data: { path: n, companyRoot: ctx.companyRoot, allowedRoots: ctx.allowedRoots },
        });
        if (r.ok) get().bumpDisk();
        return r;
      },
      shellBot: async (botId, command) => {
        const ctx = ctxRoots(get(), botId);
        if (!ctx) return { ok: false, error: "Unknown agent" };
        const r = await fsRunCommand({
          data: {
            command,
            cwd: ctx.bot.workspacePath,
            companyRoot: ctx.companyRoot,
            allowedRoots: ctx.allowedRoots,
          },
        });
        if (r.ok) get().bumpDisk();
        return r;
      },

      handoffTask: async (fromBotId, toBotName, task) => {
        const s = get();
        const from = ctxRoots(s, fromBotId);
        if (!from) return { ok: false, error: "Unknown agent" };
        const needle = toBotName.replace(/^@/, "").toLowerCase();
        const to = s.bots.find((b) => b.name.toLowerCase() === needle && !b.hidden);
        if (!to) return { ok: false, error: `No agent named ${toBotName}` };
        if (!from.bot.grants.includes("shared") || !to.grants.includes("shared")) {
          return { ok: false, error: "Both agents need the department shared grant." };
        }
        const shared = grantPathFor(
          from.bot,
          from.employee,
          from.department,
          from.company,
          "shared",
        );
        const filename = `task-${Date.now()}-${from.bot.name}-to-${to.name}.md`;
        const path = posixJoin(shared, filename);
        const body = `# Handoff from ${from.bot.name} to ${to.name}\n\n${task}\n`;
        const wrote = await fsWrite({
          data: {
            path,
            content: body,
            companyRoot: from.companyRoot,
            allowedRoots: from.allowedRoots,
          },
        });
        if (!wrote.ok) return wrote;
        const toSess = s.sessions[to.id] ?? sessionOf(to.id);
        const notice: ChatMessage = {
          id: uid("msg"),
          botId: to.id,
          role: "system",
          content: `${from.bot.name} handed you a task in shared/${filename}:\n\n${task}`,
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
        return { ok: true, toBotId: to.id, path };
      },

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      selectBot: (id) => {
        set((s) => ({ ui: { ...s.ui, selectedBotId: id, agentsOpen: false } }));
        if (id) get().markRead(id);
      },
    }),
    {
      name: "localbot-state-v2",
      storage: createJSONStorage(() => memoryStorage),
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
