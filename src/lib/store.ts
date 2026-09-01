import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CATALOG_PIN, getCatalogModel } from "./catalog";
import { ggufBlob, checksumBlob } from "./checksum";
import {
  DEFAULT_COMPANY_ROOT,
  DEFAULT_HOME,
  botPath,
  companyRootPath,
  departmentPath,
  employeePath,
  expectedCompanyPaths,
  grantPathFor,
  seedBotFolder,
  seedCompanyTree,
  seedHome,
  writeModelBlob,
} from "./fs/company";
import {
  exists,
  listTree,
  moveTree,
  normalizePath,
  prettyTree,
  readFile,
  removeNode,
  strReplace,
  type Vfs,
  writeFile,
} from "./fs/vfs";
import { runVirtualShell } from "./fs/shell";
import { pathAllowed } from "./permissions";
import { LOOPBACK_HOST, LOOPBACK_PORT } from "@/runtime/loopback";
import type {
  AgentColorId,
  AppSnapshot,
  Bot,
  ChatMessage,
  Company,
  Department,
  DownloadedModel,
  DownloadJob,
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
  useExistingOllama: false,
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
    version: 1,
    onboarded: false,
    localbotHome: DEFAULT_HOME,
    company: null,
    departments: [],
    employees: [],
    bots: [],
    models: [],
    files: {},
    sessions: {},
    hardware: null,
    download: null,
    settings: DEFAULT_SETTINGS,
    runtime: {
      bindHost: LOOPBACK_HOST,
      bindPort: LOOPBACK_PORT,
      ready: false,
      engine: "embedded-llama.cpp",
      mode: "standard",
      lastHeartbeat: null,
    },
    activeEmployeeId: null,
  };
}

type Actions = {
  ui: UiState;
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  setUi: (patch: Partial<UiState>) => void;
  resetAll: () => void;
  setHardware: (h: HardwareReport) => void;
  setDownload: (job: DownloadJob | null) => void;
  completeDownload: (catalogId: string) => Promise<DownloadedModel>;
  importGguf: (filename: string, bytes: number) => Promise<DownloadedModel>;
  completeOnboarding: (input: {
    companyName: string;
    departmentName: string;
    employeeName: string;
    botName: string;
    botJob: string;
    color: AgentColorId;
    modelId: string;
    sharedRoot: boolean;
  }) => void;
  createBot: (input: {
    name: string;
    job: string;
    color: AgentColorId;
    modelId: string;
    extraGrants?: FolderGrant[];
  }) => Bot;
  renameBot: (id: string, name: string) => void;
  updateBot: (id: string, patch: Partial<Bot>) => void;
  duplicateBot: (id: string) => Bot | null;
  hideBot: (id: string, hidden: boolean) => void;
  pinBot: (id: string, pinned: boolean) => void;
  deleteBot: (id: string) => void;
  setBotGrants: (id: string, grants: FolderGrant[]) => void;
  moveBotToEmployee: (botId: string, employeeId: string) => void;
  markRead: (botId: string) => void;
  bumpUnread: (botId: string) => void;
  createDepartment: (name: string) => Department;
  createEmployee: (departmentId: string, displayName: string) => Employee;
  setCompanyRootShared: (shared: boolean) => void;
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
  applyVfs: (mut: (vfs: Vfs) => Vfs) => void;
  writeBotFile: (
    botId: string,
    path: string,
    content: string,
  ) => { ok: true } | { ok: false; error: string };
  readBotFile: (
    botId: string,
    path: string,
  ) => { ok: true; content: string } | { ok: false; error: string };
  listBotDir: (
    botId: string,
    path: string,
  ) => { ok: true; listing: string } | { ok: false; error: string };
  replaceBotFile: (
    botId: string,
    path: string,
    oldString: string,
    newString: string,
  ) => { ok: true } | { ok: false; error: string };
  deleteBotFile: (
    botId: string,
    path: string,
  ) => { ok: true } | { ok: false; error: string };
  shellBot: (
    botId: string,
    command: string,
  ) =>
    | { ok: true; stdout: string; stderr: string; code: number }
    | { ok: false; error: string };
  handoffTask: (
    fromBotId: string,
    toBotName: string,
    task: string,
  ) => { ok: true; toBotId: string; path: string } | { ok: false; error: string };
  updateSettings: (patch: Partial<Settings>) => void;
  setRuntimeReady: (ready: boolean) => void;
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

export const useLocalBot = create<LocalBotState>()(
  persist(
    (set, get) => ({
      ...emptySnapshot(),
      ui: DEFAULT_UI,
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
      setUi: (patch) => set({ ui: { ...get().ui, ...patch } }),
      resetAll: () => set({ ...emptySnapshot(), ui: { ...DEFAULT_UI }, hydrated: true }),

      setHardware: (h) => set({ hardware: h }),
      setDownload: (job) => set({ download: job }),

      completeDownload: async (catalogId) => {
        const model = getCatalogModel(catalogId);
        if (!model) throw new Error("Unknown model");
        const blob = ggufBlob({
          id: model.id,
          filename: model.filename,
          sizeBytes: model.sizeBytes,
          sha256: model.sha256,
        });
        const digest = await checksumBlob(blob);
        const record: DownloadedModel = {
          id: uid("mdl"),
          catalogId: model.id,
          filename: model.filename,
          path: posixJoin(get().localbotHome, "models", model.filename),
          sizeBytes: model.sizeBytes,
          sha256: digest,
          downloadedAt: nowIso(),
          source: "catalog",
        };
        set((s) => ({
          models: [...s.models.filter((m) => m.catalogId !== model.id), record],
          files: writeModelBlob(seedHome(s.files, s.localbotHome), s.localbotHome, record, blob),
          download: {
            catalogId: model.id,
            status: "done",
            progress: 1,
            startedAt: s.download?.startedAt ?? nowIso(),
          },
          runtime: { ...s.runtime, ready: true, lastHeartbeat: nowIso() },
        }));
        return record;
      },

      importGguf: async (filename, bytes) => {
        const blob = ggufBlob({
          id: `import-${filename}`,
          filename,
          sizeBytes: bytes,
          sha256: "import",
        });
        const digest = await checksumBlob(blob);
        const record: DownloadedModel = {
          id: uid("mdl"),
          catalogId: `import:${filename}`,
          filename,
          path: posixJoin(get().localbotHome, "models", filename),
          sizeBytes: bytes,
          sha256: digest,
          downloadedAt: nowIso(),
          source: "import",
        };
        set((s) => ({
          models: [...s.models, record],
          files: writeModelBlob(seedHome(s.files, s.localbotHome), s.localbotHome, record, blob),
          runtime: { ...s.runtime, ready: true, lastHeartbeat: nowIso() },
        }));
        return record;
      },

      completeOnboarding: (input) => {
        const companyName = slugName(input.companyName);
        const deptName = slugName(input.departmentName);
        const empName = slugName(input.employeeName);
        const botName = slugName(input.botName);
        const root = companyRootPath(companyName, DEFAULT_COMPANY_ROOT);
        const deptP = departmentPath(root, deptName);
        const empP = employeePath(deptP, empName);
        const bP = botPath(empP, botName);
        const now = nowIso();
        const company: Company = {
          id: uid("co"),
          name: companyName,
          root,
          defaultDepartmentId: "",
          catalogPin: CATALOG_PIN,
          createdAt: now,
        };
        const department: Department = {
          id: uid("dept"),
          companyId: company.id,
          name: deptName,
          path: deptP,
          createdAt: now,
        };
        company.defaultDepartmentId = department.id;
        const employee: Employee = {
          id: uid("emp"),
          departmentId: department.id,
          displayName: empName,
          path: empP,
          defaultModelId: input.modelId,
          createdAt: now,
        };
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
        let files: Vfs = {};
        files = seedHome(files, DEFAULT_HOME);
        files = seedCompanyTree({
          vfs: files,
          company,
          department,
          employee,
          bots: [bot],
        });
        set({
          onboarded: true,
          localbotHome: DEFAULT_HOME,
          company,
          departments: [department],
          employees: [employee],
          bots: [bot],
          files,
          sessions: { [bot.id]: sessionOf(bot.id) },
          activeEmployeeId: employee.id,
          settings: { ...get().settings, companyRootIsShared: input.sharedRoot },
          runtime: {
            ...get().runtime,
            ready: get().models.length > 0,
            lastHeartbeat: now,
          },
          ui: { ...DEFAULT_UI, selectedBotId: bot.id, showComputer: true },
        });
      },

      createBot: (input) => {
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
        set({
          bots: [...s.bots, bot],
          files: seedBotFolder(s.files, bot, department, employee),
          sessions: { ...s.sessions, [bot.id]: sessionOf(bot.id) },
          ui: { ...s.ui, selectedBotId: bot.id, newAgentOpen: false },
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
      duplicateBot: (id) => {
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
      deleteBot: (id) => {
        const s = get();
        const bot = s.bots.find((b) => b.id === id);
        const files = bot ? removeNode(s.files, bot.path) : s.files;
        const sessions = { ...s.sessions };
        delete sessions[id];
        const remaining = s.bots.filter((b) => b.id !== id);
        set({
          bots: remaining,
          files,
          sessions,
          ui: {
            ...s.ui,
            selectedBotId:
              s.ui.selectedBotId === id ? (remaining[0]?.id ?? null) : s.ui.selectedBotId,
          },
        });
      },
      setBotGrants: (id, grants) => {
        set((s) => {
          const bot = s.bots.find((b) => b.id === id);
          if (!bot) return s;
          const files = writeFile(
            s.files,
            posixJoin(bot.path, "bot.json"),
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
          );
          return { bots: s.bots.map((b) => (b.id === id ? { ...b, grants } : b)), files };
        });
      },
      moveBotToEmployee: (botId, employeeId) => {
        const s = get();
        const bot = s.bots.find((b) => b.id === botId);
        const employee = s.employees.find((e) => e.id === employeeId);
        const department = s.departments.find((d) => d.id === employee?.departmentId);
        if (!bot || !employee || !department) return;
        const dest = botPath(employee.path, bot.name);
        const files = moveTree(s.files, bot.path, dest);
        set({
          files,
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

      createDepartment: (name) => {
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
        let files = s.files;
        files = seedCompanyTree({
          vfs: files,
          company: s.company,
          department,
          employee: {
            id: "tmp",
            departmentId: department.id,
            displayName: "_",
            path: employeePath(department.path, "_"),
            defaultModelId: null,
            createdAt: nowIso(),
          },
          bots: [],
        });
        files = removeNode(files, employeePath(department.path, "_"));
        set({ departments: [...s.departments, department], files });
        return department;
      },
      createEmployee: (departmentId, displayName) => {
        const s = get();
        const department = s.departments.find((d) => d.id === departmentId);
        if (!department || !s.company) throw new Error("Missing department");
        const employee: Employee = {
          id: uid("emp"),
          departmentId,
          displayName: slugName(displayName),
          path: employeePath(department.path, slugName(displayName)),
          defaultModelId: s.models[0]?.catalogId ?? null,
          createdAt: nowIso(),
        };
        const files = seedCompanyTree({
          vfs: s.files,
          company: s.company,
          department,
          employee,
          bots: [],
        });
        set({ employees: [...s.employees, employee], files });
        return employee;
      },
      setCompanyRootShared: (shared) =>
        set((s) => ({ settings: { ...s.settings, companyRootIsShared: shared } })),
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

      applyVfs: (mut) => set((s) => ({ files: mut(s.files) })),

      writeBotFile: (botId, path, content) => {
        const ctx = resolveBot(get(), botId);
        if (!ctx) return { ok: false, error: "Unknown agent" };
        const n = normalizePath(path);
        if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) {
          return { ok: false, error: `Denied: ${n} is outside this agent's grants.` };
        }
        set((s) => ({ files: writeFile(s.files, n, content) }));
        return { ok: true };
      },
      readBotFile: (botId, path) => {
        const ctx = resolveBot(get(), botId);
        if (!ctx) return { ok: false, error: "Unknown agent" };
        const n = normalizePath(path);
        if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) {
          return { ok: false, error: `Denied: ${n} is outside this agent's grants.` };
        }
        try {
          return { ok: true, content: readFile(get().files, n) };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
      listBotDir: (botId, path) => {
        const ctx = resolveBot(get(), botId);
        if (!ctx) return { ok: false, error: "Unknown agent" };
        const n = normalizePath(path);
        if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) {
          return { ok: false, error: `Denied: ${n} is outside this agent's grants.` };
        }
        try {
          return { ok: true, listing: prettyTree(get().files, n, 80) };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
      replaceBotFile: (botId, path, oldString, newString) => {
        const ctx = resolveBot(get(), botId);
        if (!ctx) return { ok: false, error: "Unknown agent" };
        const n = normalizePath(path);
        if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) {
          return { ok: false, error: `Denied: ${n} is outside this agent's grants.` };
        }
        try {
          set((s) => ({ files: strReplace(s.files, n, oldString, newString) }));
          return { ok: true };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
      deleteBotFile: (botId, path) => {
        const ctx = resolveBot(get(), botId);
        if (!ctx) return { ok: false, error: "Unknown agent" };
        const n = normalizePath(path);
        if (!pathAllowed(n, ctx.bot, ctx.employee, ctx.department, ctx.company)) {
          return { ok: false, error: `Denied: ${n} is outside this agent's grants.` };
        }
        if (!exists(get().files, n)) return { ok: false, error: `No such file: ${n}` };
        set((s) => ({ files: removeNode(s.files, n) }));
        return { ok: true };
      },
      shellBot: (botId, command) => {
        const ctx = resolveBot(get(), botId);
        if (!ctx) return { ok: false, error: "Unknown agent" };
        const result = runVirtualShell(
          get().files,
          ctx.bot.workspacePath,
          command,
          ctx.company.root,
        );
        set({ files: result.vfs });
        return { ok: true, stdout: result.stdout, stderr: result.stderr, code: result.code };
      },

      handoffTask: (fromBotId, toBotName, task) => {
        const s = get();
        const from = resolveBot(s, fromBotId);
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
        const files = writeFile(s.files, path, body);
        const toSess = s.sessions[to.id] ?? sessionOf(to.id);
        const notice: ChatMessage = {
          id: uid("msg"),
          botId: to.id,
          role: "system",
          content: `${from.bot.name} handed you a task in shared/${filename}:\n\n${task}`,
          createdAt: nowIso(),
        };
        set({
          files,
          sessions: {
            ...s.sessions,
            [to.id]: { ...toSess, messages: [...toSess.messages, notice] },
          },
          bots: s.bots.map((b) => (b.id === to.id ? { ...b, unread: b.unread + 1 } : b)),
        });
        return { ok: true, toBotId: to.id, path };
      },

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setRuntimeReady: (ready) =>
        set((s) => ({ runtime: { ...s.runtime, ready, lastHeartbeat: nowIso() } })),
      selectBot: (id) => {
        set((s) => ({ ui: { ...s.ui, selectedBotId: id, agentsOpen: false } }));
        if (id) get().markRead(id);
      },
    }),
    {
      name: "localbot-state-v1",
      storage: createJSONStorage(() => memoryStorage),
      partialize: (s) => ({
        version: s.version,
        onboarded: s.onboarded,
        localbotHome: s.localbotHome,
        company: s.company,
        departments: s.departments,
        employees: s.employees,
        bots: s.bots,
        models: s.models,
        files: s.files,
        sessions: Object.fromEntries(
          Object.entries(s.sessions).map(([id, sess]) => [
            id,
            { ...sess, running: false, stopRequested: false },
          ]),
        ),
        hardware: s.hardware,
        download: s.download,
        settings: s.settings,
        runtime: s.runtime,
        activeEmployeeId: s.activeEmployeeId,
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

export function treeListing(s: AppSnapshot, path: string): string[] {
  return listTree(s.files, path, 120);
}

export function companyPathChecklist(s: AppSnapshot): string[] {
  if (!s.company) return [];
  const department = s.departments[0];
  const employee = s.employees[0];
  if (!department || !employee) return [];
  return expectedCompanyPaths({
    company: s.company,
    department,
    employee,
    bots: s.bots.filter((b) => b.employeeId === employee.id),
  });
}
