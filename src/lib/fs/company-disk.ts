import path from "node:path";
import type { Company, Department, Employee, LegacyBot as Bot } from "../types.ts";
import { diskMkdir, diskWrite } from "./disk.ts";

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

export function seedCompanyTreeOnDisk(args: {
  companyRoot: string;
  company: Company;
  department: Department;
  employee: Employee;
  bots: Bot[];
}): void {
  const { companyRoot, company, department, employee, bots } = args;
  diskMkdir(companyRoot, company.root);
  diskWrite(
    companyRoot,
    path.join(company.root, "company.json"),
    json({
      name: company.name,
      catalogPin: company.catalogPin,
      defaultDepartment: department.name,
    }),
  );
  diskMkdir(companyRoot, path.join(company.root, "shared"));
  diskMkdir(companyRoot, path.join(company.root, "departments"));
  seedDepartmentOnDisk(companyRoot, department);
  seedEmployeeOnDisk(companyRoot, department, employee);
  for (const bot of bots) {
    seedBotFolderOnDisk(companyRoot, bot, department, employee);
  }
}

export function seedDepartmentOnDisk(companyRoot: string, department: Department): void {
  diskMkdir(companyRoot, department.path);
  diskWrite(
    companyRoot,
    path.join(department.path, "department.json"),
    json({ name: department.name }),
  );
  diskMkdir(companyRoot, path.join(department.path, "shared"));
  diskMkdir(companyRoot, path.join(department.path, "people"));
}

export function seedEmployeeOnDisk(
  companyRoot: string,
  department: Department,
  employee: Employee,
): void {
  diskMkdir(companyRoot, employee.path);
  diskWrite(
    companyRoot,
    path.join(employee.path, "employee.json"),
    json({
      displayName: employee.displayName,
      department: department.name,
      defaultModel: employee.defaultModelId,
    }),
  );
  diskMkdir(companyRoot, path.join(employee.path, "inbox"));
  diskMkdir(companyRoot, path.join(employee.path, "outbox"));
  diskMkdir(companyRoot, path.join(employee.path, "bots"));
  diskWrite(
    companyRoot,
    path.join(employee.path, "outbox", ".keep"),
    `Finished deliverables for ${employee.displayName} land here.\n`,
  );
  diskWrite(
    companyRoot,
    path.join(department.path, "shared", ".keep"),
    `Department shared folder for ${department.name}.\nAny granted bot may read and write here.\n`,
  );
}

export function seedBotFolderOnDisk(
  companyRoot: string,
  bot: Bot,
  department: Department,
  employee: Employee,
): void {
  diskMkdir(companyRoot, bot.path);
  diskMkdir(companyRoot, path.join(bot.path, "memory"));
  diskMkdir(companyRoot, path.join(bot.path, "workspace"));
  diskMkdir(companyRoot, path.join(bot.path, "output"));
  diskWrite(
    companyRoot,
    path.join(bot.path, "bot.json"),
    json({
      name: bot.name,
      job: bot.job,
      modelId: bot.modelId,
      color: bot.color,
      mascotId: bot.mascotId,
      grants: bot.grants,
      createdAt: bot.createdAt,
    }),
  );
  diskWrite(
    companyRoot,
    path.join(bot.path, "AGENTS.md"),
    `# ${bot.name}\n\n${bot.job}\n\n${bot.standingInstructions}\n`,
  );
  diskWrite(
    companyRoot,
    path.join(bot.path, "memory", "notes.md"),
    `# Memory\n\nStanding context for ${bot.name}.\n`,
  );
  void department;
  void employee;
}
