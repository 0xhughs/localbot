/**
 * Pure (no Node fs) description of the four folder scopes. Safe to import from
 * the browser. Host-path resolution lives in scopes.ts on the server.
 */

export const SCOPE_IDS = [
  "private",
  "employee-shared",
  "department-shared",
  "company-shared",
] as const;

export type ScopeId = (typeof SCOPE_IDS)[number];

export type FoldersConfig = {
  /** Required. LocalBot creates `agents/{AgentName}/private` inside it. */
  employeeRoot: string;
  employeeShared: string | null;
  departmentShared: string | null;
  companyShared: string | null;
};

export type FolderKey = keyof FoldersConfig;

export const SCOPE_META: Record<
  ScopeId,
  { key: FolderKey; label: string; short: string; required: boolean; blurb: string }
> = {
  private: {
    key: "employeeRoot",
    label: "My agents folder",
    short: "Private",
    required: true,
    blurb:
      "Each agent gets agents/{Name}/private inside this folder. Bare filenames land there.",
  },
  "employee-shared": {
    key: "employeeShared",
    label: "Employee shared",
    short: "My agents",
    required: false,
    blurb: "One folder all of your agents can read and write. @Name handoffs go here.",
  },
  "department-shared": {
    key: "departmentShared",
    label: "Department shared",
    short: "Department",
    required: false,
    blurb: "Your department's existing shared folder (NAS, mapped drive, or local).",
  },
  "company-shared": {
    key: "companyShared",
    label: "Company shared",
    short: "Company",
    required: false,
    blurb: "The company-wide shared folder.",
  },
};

export function isScopeId(v: unknown): v is ScopeId {
  return typeof v === "string" && (SCOPE_IDS as readonly string[]).includes(v);
}

export function folderFor(folders: FoldersConfig, scope: ScopeId): string | null {
  return folders[SCOPE_META[scope].key];
}

/** Scopes that have a folder configured (non-null). */
export function configuredScopes(folders: FoldersConfig | null): ScopeId[] {
  if (!folders) return [];
  return SCOPE_IDS.filter((s) => Boolean(folderFor(folders, s)));
}

/**
 * Split a model-supplied path into scope + relative path.
 * `employee-shared/notes.md` → employee-shared, `notes.md`.
 * Bare names and `private/x` → private. Leading slashes are stripped so a
 * model that writes `/private/x` still lands in the right scope; a genuinely
 * absolute host path is rejected later by the server resolver.
 */
export function parseScopedPath(input: string): { scope: ScopeId; relPath: string } {
  const cleaned = input.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const first = cleaned.split("/")[0] ?? "";
  if (isScopeId(first)) {
    return { scope: first, relPath: cleaned.slice(first.length).replace(/^\/+/, "") };
  }
  return { scope: "private", relPath: cleaned };
}

export function displayPath(scope: ScopeId, relPath: string): string {
  const rel = relPath.replace(/^\/+/, "");
  return rel ? `${scope}/${rel}` : `${scope}/`;
}

/** Where an @Name handoff file goes. Never invents a folder. */
export function handoffScope(
  folders: FoldersConfig | null,
): "employee-shared" | "department-shared" | null {
  if (!folders) return null;
  if (folders.employeeShared) return "employee-shared";
  if (folders.departmentShared) return "department-shared";
  return null;
}

/**
 * Filesystem-safe agent folder name. The one cleaner for agent names in the
 * browser store and on the sidecar (`assertAgentName` in scopes.ts rejects
 * anything this would change).
 */
export function agentSlug(name: string): string {
  const s = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\.+$/g, "")
    .replace(/\s+/g, " ");
  return s || "Untitled";
}
