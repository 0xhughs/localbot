import type { Company, Department, Employee, FolderGrant, LegacyBot as Bot } from "../types.ts";
import { isUnder, normalizePath, posixJoin } from "../utils.ts";

export function departmentPath(companyRoot: string, deptName: string): string {
  return posixJoin(companyRoot, "departments", deptName);
}

export function employeePath(deptPath: string, employeeName: string): string {
  return posixJoin(deptPath, "people", employeeName);
}

export function botPath(empPath: string, botName: string): string {
  return posixJoin(empPath, "bots", botName);
}

export function grantPathFor(
  bot: Bot,
  employee: Employee,
  department: Department,
  company: Company,
  grant: FolderGrant,
): string {
  switch (grant) {
    case "workspace":
      return posixJoin(bot.path, "workspace");
    case "output":
      return posixJoin(bot.path, "output");
    case "shared":
      return posixJoin(department.path, "shared");
    case "company-shared":
      return posixJoin(company.root, "shared");
    case "inbox":
      return posixJoin(employee.path, "inbox");
    case "outbox":
      return posixJoin(employee.path, "outbox");
  }
}

export function allowedRootsFor(
  bot: Bot,
  employee: Employee,
  department: Department,
  company: Company,
): string[] {
  return bot.grants.map((g) => grantPathFor(bot, employee, department, company, g));
}

export function expectedCompanyPaths(args: {
  company: Company;
  department: Department;
  employee: Employee;
  bots: Bot[];
}): string[] {
  const { company, department, employee, bots } = args;
  const paths = [
    posixJoin(company.root, "company.json"),
    posixJoin(company.root, "shared"),
    posixJoin(department.path, "department.json"),
    posixJoin(department.path, "shared"),
    posixJoin(employee.path, "employee.json"),
    posixJoin(employee.path, "inbox"),
    posixJoin(employee.path, "outbox"),
    posixJoin(employee.path, "bots"),
  ];
  for (const bot of bots) {
    paths.push(
      posixJoin(bot.path, "bot.json"),
      posixJoin(bot.path, "AGENTS.md"),
      posixJoin(bot.path, "memory"),
      posixJoin(bot.path, "workspace"),
      posixJoin(bot.path, "output"),
    );
  }
  return paths;
}

/** Map a model-supplied path onto the company tree. Bare names land in workspace. */
export function resolveAgentFilePath(
  requested: string,
  bot: Bot,
  employee: Employee,
  department: Department,
  company: Company,
): string {
  const n = normalizePath(requested);
  const root = normalizePath(company.root);
  if (n === root || isUnder(n, root)) return n;
  const rel = n.replace(/^\//, "");
  if (rel === "workspace" || rel.startsWith("workspace/")) {
    return posixJoin(bot.path, rel);
  }
  if (rel === "output" || rel.startsWith("output/")) {
    return posixJoin(bot.path, rel);
  }
  if (rel === "memory" || rel.startsWith("memory/")) {
    return posixJoin(bot.path, rel);
  }
  if (rel === "shared" || rel.startsWith("shared/")) {
    return posixJoin(department.path, rel);
  }
  if (rel === "outbox" || rel.startsWith("outbox/")) {
    return posixJoin(employee.path, rel);
  }
  if (rel === "inbox" || rel.startsWith("inbox/")) {
    return posixJoin(employee.path, rel);
  }
  return posixJoin(bot.workspacePath, rel);
}

export function remapUnderRoot(oldRoot: string, newRoot: string, target: string): string {
  const o = normalizePath(oldRoot);
  const n = normalizePath(target);
  if (n === o) return normalizePath(newRoot);
  if (n.startsWith(o + "/")) return posixJoin(newRoot, n.slice(o.length));
  return n;
}