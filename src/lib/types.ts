import type { MascotId } from "./mascots";
import type { FoldersConfig, ScopeId } from "./fs/scope-model";
import type { GpuProbe, LlamaRuntimePreference } from "./runtime/llama-platform";

export type { MascotId };
export type { FoldersConfig, ScopeId };

export type AgentColorId =
  | "sage"
  | "steel"
  | "clay"
  | "moss"
  | "slate"
  | "pine";

export const AGENT_COLORS: Record<
  AgentColorId,
  { id: AgentColorId; label: string; hex: string }
> = {
  sage: { id: "sage", label: "Sage", hex: "#8fa394" },
  steel: { id: "steel", label: "Steel", hex: "#7a8ea3" },
  clay: { id: "clay", label: "Clay", hex: "#c17f59" },
  moss: { id: "moss", label: "Moss", hex: "#6b8f71" },
  slate: { id: "slate", label: "Slate", hex: "#9aa0b4" },
  pine: { id: "pine", label: "Pine", hex: "#5f8f86" },
};

export const AGENT_COLOR_LIST = Object.values(AGENT_COLORS);

export type ModelTier = "small" | "recommended" | "large" | "extra";

export type CatalogModel = {
  id: string;
  tier: ModelTier;
  name: string;
  family: string;
  repo: string;
  filename: string;
  sizeBytes: number;
  sizeLabel: string;
  license: string;
  gated: boolean;
  minRamGb: number;
  contextK: number;
  paramsLabel: string;
  notes: string;
  sha256: string;
  downloadable: boolean;
};

export type HardwareReport = {
  os: string;
  arch: string;
  platformLabel: string;
  totalRamGb: number;
  availableRamGb: number;
  ramSource: "deviceMemory" | "assumed-desktop" | "assumed-mobile" | "os";
  gpuName: string | null;
  vramGb: number | null;
  appleSilicon: boolean;
  cores: number;
  freeDiskGb: number;
  isMobile: boolean;
  scannedAt: string;
  /** Sidecar GPU probe (Stage 6). Absent on browser-only scans; null when nothing answered. */
  gpu?: GpuProbe | null;
};

/** A GGUF that passed size + magic + sha256 and may be loaded. Keyed by absolute path in config. */
export type VerifiedModel = {
  sha256: string;
  size: number;
  /** File mtime at verification; a later write invalidates the record. */
  mtimeMs: number;
  catalogId: string | null;
  verifiedAt: string;
};

export type ModelFit = {
  modelId: string;
  requiredGb: number;
  availableGb: number;
  fits: boolean;
  reason: string;
  recommended: boolean;
};

export type Company = {
  id: string;
  name: string;
  /** Legacy single company root. Empty for installs configured with folder scopes. */
  root: string;
  defaultDepartmentId: string;
  catalogPin: string;
  createdAt: string;
};

export type Department = {
  id: string;
  companyId: string;
  name: string;
  /** Legacy tree path. Display label only in the scoped model. */
  path: string;
  createdAt: string;
};

export type Employee = {
  id: string;
  departmentId: string;
  displayName: string;
  /** Legacy tree path. Display label only in the scoped model. */
  path: string;
  defaultModelId: string | null;
  createdAt: string;
};

export type FolderGrant =
  | "workspace"
  | "output"
  | "shared"
  | "company-shared"
  | "inbox"
  | "outbox";

export type Bot = {
  id: string;
  employeeId: string;
  name: string;
  job: string;
  color: AgentColorId;
  mascotId: MascotId;
  modelId: string;
  /** Scopes this agent may touch. `private` is always present. Agent safety, not RBAC. */
  scopes: ScopeId[];
  /** Host path of the agent's private folder. Display only; the sidecar resolves paths. */
  privatePath: string;
  standingInstructions: string;
  pinned: boolean;
  /** Local UI filter only (this browser). Not archive. */
  hidden: boolean;
  /** Mirrors `archived` in agents/{Name}/agent.json. Files stay on disk. */
  archived: boolean;
  unread: number;
  /** Stage 12: roster section (host index row). null = unsorted. */
  sectionId: string | null;
  createdAt: string;
};

/** Stage 12: a roster section heading. Mirrors `HostSection` in the host index. */
export type AgentSection = { id: string; name: string; order: number };

/** Roster rows the default UI shows: not hidden here, not archived on disk. */
export function isActiveBot(bot: Pick<Bot, "hidden" | "archived">): boolean {
  return !bot.hidden && !bot.archived;
}

/**
 * Pre-Stage-2 single-root tree shape. Used by the legacy tree helpers
 * (`fs/company.ts`, `fs/company-disk.ts`, `permissions.ts` grant classifier)
 * and their disk-grant tests. The live app uses `Bot.scopes`.
 */
export type LegacyBot = Omit<Bot, "scopes" | "privatePath" | "archived" | "sectionId"> & {
  path: string;
  workspacePath: string;
  outputPath: string;
  memoryPath: string;
  grants: FolderGrant[];
};

export type DiskEntry = {
  path: string;
  name: string;
  kind: "file" | "dir";
  size: number;
};

/** Entry inside a scope. `relPath` is relative to the scope root; no host path. */
export type ScopedEntry = {
  name: string;
  kind: "file" | "dir";
  size: number;
  relPath: string;
};

export type DiskConfig = {
  version: 2;
  /** null until onboarding picks folders. */
  folders: FoldersConfig | null;
  /** Kept after the one-time companyRoot → folders migration. Never deleted. */
  legacyCompanyRoot: string | null;
  previewWritesToProjectData: boolean;
  modelsDir: string;
  activeModelId: string | null;
  activeModelPath: string | null;
  allowHostedDemo: boolean;
  useExistingOllama: boolean;
  /** Ollama tag chosen in Settings when `useExistingOllama` is on. null = not picked yet. */
  ollamaModel: string | null;
  /** llama.cpp build preference: `auto` follows the GPU probe; a runtime id pins that row. */
  llamaRuntime: LlamaRuntimePreference;
  /** GGUFs that passed verification (size + magic + sha256), by absolute path. */
  verifiedModels: Record<string, VerifiedModel>;
};

export type ChatRole = "user" | "assistant" | "system";

export type ToolKind = "read" | "edit" | "write" | "shell" | "delete" | "network" | "browser";

export type ToolChip = {
  id: string;
  kind: ToolKind;
  label: string;
  detail: string;
  status: "running" | "ok" | "denied" | "error";
};

export type PermissionDecision = "allow-once" | "allow-chat" | "deny";

export type PermissionRequest = {
  id: string;
  botId: string;
  tool: string;
  kind: ToolKind;
  summary: string;
  detail: string;
  path?: string;
  alwaysAsk: boolean;
};

export type ChatMessage = {
  id: string;
  botId: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  chips?: ToolChip[];
  permission?: PermissionRequest;
  permissionDecision?: PermissionDecision;
  handoffTo?: string;
};

export type Session = {
  botId: string;
  messages: ChatMessage[];
  running: boolean;
  stopRequested: boolean;
  chatGrants: Record<string, true>;
  lastReadAt: string;
};

export type RuntimeStatus = {
  engine: string;
  model: string;
  aiAvailable: boolean;
  lastHeartbeat: string | null;
  ggufPath: string | null;
  loopback: string | null;
  ramEstimate: string;
  badge: string;
};

export type Settings = {
  darkMode: boolean;
  webSearchEnabled: boolean;
  controlThisComputer: boolean;
  denseUi: boolean;
  companyRootIsShared: boolean;
  allowHostedDemo: boolean;
  useExistingOllama: boolean;
};

export type UiState = {
  selectedBotId: string | null;
  showComputer: boolean;
  showSettings: boolean;
  settingsTab: "general" | "models" | "folders" | "company" | "runtime" | "safety";
  composer: string;
  commandOpen: boolean;
  agentsOpen: boolean;
  pendingPermission: PermissionRequest | null;
  previewPath: string | null;
  /** The Advanced "New agent" modal (Stage 12: no longer the default for +). */
  newAgentOpen: boolean;
  /** Stage 12: the agent whose chat is in setup mode (asks name + job before the first normal turn). */
  setupBotId: string | null;
  /** Stage 12: the agent whose Edit profile panel is open. */
  editProfileBotId: string | null;
};

export type AppSnapshot = {
  version: 2;
  onboarded: boolean;
  company: Company | null;
  departments: Department[];
  employees: Employee[];
  bots: Bot[];
  selectedCatalogId: string | null;
  sessions: Record<string, Session>;
  hardware: HardwareReport | null;
  settings: Settings;
  runtime: RuntimeStatus;
  activeEmployeeId: string | null;
  previewWritesToProjectData: boolean;
};
