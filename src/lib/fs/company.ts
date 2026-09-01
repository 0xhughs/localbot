import type {
  Bot,
  Company,
  Department,
  DownloadedModel,
  Employee,
  FolderGrant,
} from "../types.ts";
import { posixJoin } from "../utils.ts";
import {
  ensureDir,
  type Vfs,
  writeFile,
  writeJson,
} from "./vfs.ts";

export const DEFAULT_HOME = "/LocalBot";
export const DEFAULT_COMPANY_ROOT = "/Documents/LocalBot";

export function companyRootPath(companyName: string, rootBase = DEFAULT_COMPANY_ROOT): string {
  const slug = companyName.trim() || "Studio";
  return posixJoin(rootBase, slug);
}

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

export function seedHome(vfs: Vfs, home = DEFAULT_HOME): Vfs {
  let next = vfs;
  for (const p of [
    home,
    posixJoin(home, "models"),
    posixJoin(home, "sessions"),
    posixJoin(home, "logs"),
  ]) {
    next = ensureDir(next, p);
  }
  return next;
}

export function seedCompanyTree(args: {
  vfs: Vfs;
  company: Company;
  department: Department;
  employee: Employee;
  bots: Bot[];
}): Vfs {
  const { company, department, employee, bots } = args;
  let vfs = args.vfs;
  vfs = ensureDir(vfs, company.root);
  vfs = writeJson(vfs, posixJoin(company.root, "company.json"), {
    name: company.name,
    catalogPin: company.catalogPin,
    defaultDepartment: department.name,
  });
  vfs = ensureDir(vfs, posixJoin(company.root, "shared"));
  vfs = ensureDir(vfs, posixJoin(company.root, "departments"));
  vfs = ensureDir(vfs, department.path);
  vfs = writeJson(vfs, posixJoin(department.path, "department.json"), {
    name: department.name,
  });
  vfs = ensureDir(vfs, posixJoin(department.path, "shared"));
  vfs = ensureDir(vfs, posixJoin(department.path, "people"));
  vfs = ensureDir(vfs, employee.path);
  vfs = writeJson(vfs, posixJoin(employee.path, "employee.json"), {
    displayName: employee.displayName,
    department: department.name,
    defaultModel: employee.defaultModelId,
  });
  vfs = ensureDir(vfs, posixJoin(employee.path, "inbox"));
  vfs = ensureDir(vfs, posixJoin(employee.path, "outbox"));
  vfs = ensureDir(vfs, posixJoin(employee.path, "bots"));

  for (const bot of bots) {
    vfs = seedBotFolder(vfs, bot, department, employee);
  }
  return vfs;
}

export function seedBotFolder(
  vfs: Vfs,
  bot: Bot,
  department: Department,
  employee: Employee,
): Vfs {
  let next = vfs;
  next = ensureDir(next, bot.path);
  next = ensureDir(next, posixJoin(bot.path, "memory"));
  next = ensureDir(next, posixJoin(bot.path, "workspace"));
  next = ensureDir(next, posixJoin(bot.path, "output"));
  next = writeJson(next, posixJoin(bot.path, "bot.json"), {
    name: bot.name,
    job: bot.job,
    modelId: bot.modelId,
    color: bot.color,
    grants: bot.grants,
    createdAt: bot.createdAt,
  });
  next = writeFile(
    next,
    posixJoin(bot.path, "AGENTS.md"),
    `# ${bot.name}\n\n${bot.job}\n\n${bot.standingInstructions}\n`,
  );
  next = writeFile(
    next,
    posixJoin(bot.path, "memory", "notes.md"),
    `# Memory\n\nStanding context for ${bot.name}.\n`,
  );
  next = writeFile(
    next,
    posixJoin(department.path, "shared", ".keep"),
    `Department shared folder for ${department.name}.\nAny granted bot may read and write here.\n`,
  );
  next = writeFile(
    next,
    posixJoin(employee.path, "outbox", ".keep"),
    `Finished deliverables for ${employee.displayName} land here.\n`,
  );
  return next;
}

export function writeModelBlob(
  vfs: Vfs,
  home: string,
  model: DownloadedModel,
  blob: string,
): Vfs {
  const dir = posixJoin(home, "models");
  let next = ensureDir(vfs, dir);
  next = writeFile(next, model.path, blob);
  next = writeJson(next, posixJoin(dir, `${model.catalogId}.json`), {
    id: model.catalogId,
    filename: model.filename,
    sha256: model.sha256,
    sizeBytes: model.sizeBytes,
    downloadedAt: model.downloadedAt,
  });
  return next;
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
