import type { Bot, Company, Department, Employee, FolderGrant, ToolKind } from "./types.ts";
import { grantPathFor } from "./fs/company.ts";
import { normalizePath } from "./fs/vfs.ts";
import { isUnder } from "./utils.ts";

export type ToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type PermissionClass = {
  kind: ToolKind;
  alwaysAsk: boolean;
  path?: string;
  summary: string;
  detail: string;
  allowedByGrant: boolean;
};

const SHELL_NAMES = new Set(["run_command", "shell", "bash"]);
const NET_NAMES = new Set(["web_search", "fetch_url", "browser"]);
const DELETE_NAMES = new Set(["delete_file", "rm"]);
const WRITE_NAMES = new Set(["write_file", "str_replace", "edit_file"]);
const READ_NAMES = new Set(["read_file", "list_dir"]);

export function toolKind(name: string): ToolKind {
  if (SHELL_NAMES.has(name)) return "shell";
  if (NET_NAMES.has(name)) return "network";
  if (name === "browser") return "browser";
  if (DELETE_NAMES.has(name)) return "delete";
  if (WRITE_NAMES.has(name)) return name === "str_replace" ? "edit" : "write";
  if (READ_NAMES.has(name)) return "read";
  return "shell";
}

export function grantedRoots(
  bot: Bot,
  employee: Employee,
  department: Department,
  company: Company,
): { grant: FolderGrant; path: string }[] {
  return bot.grants.map((g) => ({
    grant: g,
    path: grantPathFor(bot, employee, department, company, g),
  }));
}

export function pathAllowed(
  path: string,
  bot: Bot,
  employee: Employee,
  department: Department,
  company: Company,
): boolean {
  const n = normalizePath(path);
  return grantedRoots(bot, employee, department, company).some((g) =>
    isUnder(n, g.path),
  );
}

export function classifyToolCall(
  call: ToolCall,
  ctx: {
    bot: Bot;
    employee: Employee;
    department: Department;
    company: Company;
    webSearchEnabled: boolean;
    controlThisComputer: boolean;
  },
): PermissionClass {
  const kind = toolKind(call.name);
  const path =
    typeof call.args.path === "string"
      ? normalizePath(call.args.path)
      : undefined;
  const command =
    typeof call.args.command === "string" ? call.args.command : undefined;
  const query =
    typeof call.args.query === "string" ? call.args.query : undefined;

  const inWorkspace = path ? isUnder(path, ctx.bot.workspacePath) : false;
  const inOutput = path ? isUnder(path, ctx.bot.outputPath) : false;
  const inShared =
    path && ctx.bot.grants.includes("shared")
      ? isUnder(
          path,
          grantPathFor(ctx.bot, ctx.employee, ctx.department, ctx.company, "shared"),
        )
      : false;
  const inCompanyShared =
    path && ctx.bot.grants.includes("company-shared")
      ? isUnder(
          path,
          grantPathFor(
            ctx.bot,
            ctx.employee,
            ctx.department,
            ctx.company,
            "company-shared",
          ),
        )
      : false;
  const inOutbox =
    path && ctx.bot.grants.includes("outbox")
      ? isUnder(
          path,
          grantPathFor(ctx.bot, ctx.employee, ctx.department, ctx.company, "outbox"),
        )
      : false;
  const quietWrite =
    inWorkspace || inOutput || inShared || inCompanyShared || inOutbox;
  const allowed = path
    ? pathAllowed(path, ctx.bot, ctx.employee, ctx.department, ctx.company)
    : kind === "shell" || kind === "network" || kind === "browser";
  const leavesCompany =
    path && ctx.company ? !isUnder(path, ctx.company.root) : false;

  if (kind === "network" || kind === "browser") {
    return {
      kind,
      alwaysAsk: true,
      summary: kind === "browser" ? "Browser" : "Network",
      detail: query ?? JSON.stringify(call.args),
      allowedByGrant: ctx.webSearchEnabled,
    };
  }

  if (kind === "shell") {
    return {
      kind: "shell",
      alwaysAsk: !ctx.controlThisComputer,
      path,
      summary: "Terminal",
      detail: command ?? JSON.stringify(call.args),
      allowedByGrant: true,
    };
  }

  if (kind === "delete") {
    return {
      kind: "delete",
      alwaysAsk: true,
      path,
      summary: "Delete",
      detail: path ?? "unknown path",
      allowedByGrant: allowed && !leavesCompany,
    };
  }

  if (kind === "write" || kind === "edit") {
    return {
      kind,
      alwaysAsk: !quietWrite || leavesCompany,
      path,
      summary: kind === "edit" ? "Editing" : "Writing",
      detail: path ?? "unknown path",
      allowedByGrant: allowed && !leavesCompany,
    };
  }

  return {
    kind: "read",
    alwaysAsk: !allowed || Boolean(leavesCompany),
    path,
    summary: call.name === "list_dir" ? "Listing" : "Reading",
    detail: path ?? JSON.stringify(call.args),
    allowedByGrant: allowed && !leavesCompany,
  };
}

export function denyMessage(cls: PermissionClass): string {
  if (!cls.allowedByGrant) {
    return `Denied: ${cls.detail} is outside this agent's grants.`;
  }
  return `Denied by the user: ${cls.summary} — ${cls.detail}`;
}

export function grantKey(cls: PermissionClass): string {
  return `${cls.kind}:${cls.path ?? cls.detail}`;
}
