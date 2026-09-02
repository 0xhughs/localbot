import type { MascotId } from "./mascots";
import type { FoldersConfig, ScopeId } from "./fs/scope-model";

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
  hidden: boolean;
  unread: number;
  createdAt: string;
};

/**
 * Pre-Stage-2 single-root tree shape. Used by the legacy tree helpers
 * (`fs/company.ts`, `fs/company-disk.ts`, `permissions.ts` grant classifier)
 * and their disk-grant tests. The live app uses `Bot.scopes`.
 */
export type LegacyBot = Omit<Bot, "scopes" | "privatePath"> & {
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
  newAgentOpen: boolean;
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
