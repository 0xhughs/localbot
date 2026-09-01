import { createServerFn } from "@tanstack/react-start";
import type { Bot, Company, Department, DiskConfig, DiskEntry, Employee } from "../types.ts";
import {
  seedBotFolderOnDisk,
  seedCompanyTreeOnDisk,
  seedDepartmentOnDisk,
  seedEmployeeOnDisk,
} from "./company-disk.ts";
import {
  defaultCompanyRoot,
  diskDelete,
  diskExists,
  diskList,
  diskMkdir,
  diskMove,
  diskPrettyTree,
  diskRead,
  diskReplace,
  diskShell,
  diskStat,
  diskWrite,
  loadConfig,
  saveConfig,
  type DiskShellResult,
} from "./disk.ts";

export type FsArgs = {
  path: string;
  companyRoot?: string;
  allowedRoots?: string[];
};

function rootOf(companyRoot?: string): string {
  return companyRoot?.trim() ? companyRoot : loadConfig().companyRoot;
}

export const fsGetCompanyRoot = createServerFn({ method: "POST" }).handler(
  async (): Promise<DiskConfig & { defaultRoot: string }> => {
    const cfg = loadConfig();
    return { ...cfg, defaultRoot: defaultCompanyRoot() };
  },
);

export const fsSetCompanyRoot = createServerFn({ method: "POST" })
  .validator((input: { absolutePath: string }) => input)
  .handler(async ({ data }): Promise<DiskConfig> => {
    return saveConfig(data.absolutePath);
  },
);

export const fsList = createServerFn({ method: "POST" })
  .validator((input: FsArgs) => input)
  .handler(async ({ data }): Promise<{ ok: true; entries: DiskEntry[] } | { ok: false; error: string }> => {
    try {
      return {
        ok: true,
        entries: diskList(rootOf(data.companyRoot), data.path, data.allowedRoots),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const fsRead = createServerFn({ method: "POST" })
  .validator((input: FsArgs) => input)
  .handler(async ({ data }): Promise<{ ok: true; content: string } | { ok: false; error: string }> => {
    try {
      return {
        ok: true,
        content: diskRead(rootOf(data.companyRoot), data.path, data.allowedRoots),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const fsWrite = createServerFn({ method: "POST" })
  .validator((input: FsArgs & { content: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      diskWrite(rootOf(data.companyRoot), data.path, data.content, data.allowedRoots);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const fsMkdir = createServerFn({ method: "POST" })
  .validator((input: FsArgs) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      diskMkdir(rootOf(data.companyRoot), data.path, data.allowedRoots);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const fsDelete = createServerFn({ method: "POST" })
  .validator((input: FsArgs) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      diskDelete(rootOf(data.companyRoot), data.path, data.allowedRoots);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const fsExists = createServerFn({ method: "POST" })
  .validator((input: FsArgs) => input)
  .handler(async ({ data }): Promise<{ ok: true; exists: boolean } | { ok: false; error: string }> => {
    try {
      return {
        ok: true,
        exists: diskExists(rootOf(data.companyRoot), data.path, data.allowedRoots),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const fsStat = createServerFn({ method: "POST" })
  .validator((input: FsArgs) => input)
  .handler(async ({ data }): Promise<{ ok: true; entry: DiskEntry | null } | { ok: false; error: string }> => {
    try {
      return {
        ok: true,
        entry: diskStat(rootOf(data.companyRoot), data.path, data.allowedRoots),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const fsReplace = createServerFn({ method: "POST" })
  .validator((input: FsArgs & { oldString: string; newString: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      diskReplace(
        rootOf(data.companyRoot),
        data.path,
        data.oldString,
        data.newString,
        data.allowedRoots,
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const fsMove = createServerFn({ method: "POST" })
  .validator((input: { from: string; to: string; companyRoot?: string; allowedRoots?: string[] }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      diskMove(rootOf(data.companyRoot), data.from, data.to, data.allowedRoots);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const fsTree = createServerFn({ method: "POST" })
  .validator((input: FsArgs & { max?: number }) => input)
  .handler(async ({ data }): Promise<{ ok: true; listing: string } | { ok: false; error: string }> => {
    try {
      return {
        ok: true,
        listing: diskPrettyTree(
          rootOf(data.companyRoot),
          data.path,
          data.max ?? 80,
          data.allowedRoots,
        ),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const fsRunCommand = createServerFn({ method: "POST" })
  .validator(
    (input: {
      command: string;
      cwd: string;
      companyRoot?: string;
      allowedRoots?: string[];
    }) => input,
  )
  .handler(async ({ data }): Promise<({ ok: true } & DiskShellResult) | { ok: false; error: string }> => {
    try {
      const result = diskShell(
        rootOf(data.companyRoot),
        data.cwd,
        data.command,
        data.allowedRoots,
      );
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

export type SeedInput = {
  companyRoot: string;
  company: Company;
  department: Department;
  employee: Employee;
  bots: Bot[];
};

export const fsSeedCompanyTree = createServerFn({ method: "POST" })
  .validator((input: SeedInput) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      saveConfig(data.companyRoot);
      seedCompanyTreeOnDisk({
        companyRoot: data.companyRoot,
        company: { ...data.company, root: data.companyRoot },
        department: data.department,
        employee: data.employee,
        bots: data.bots,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const fsSeedBot = createServerFn({ method: "POST" })
  .validator(
    (input: {
      companyRoot: string;
      bot: Bot;
      department: Department;
      employee: Employee;
    }) => input,
  )
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      seedBotFolderOnDisk(data.companyRoot, data.bot, data.department, data.employee);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const fsSeedDepartment = createServerFn({ method: "POST" })
  .validator((input: { companyRoot: string; department: Department }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      seedDepartmentOnDisk(data.companyRoot, data.department);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const fsSeedEmployee = createServerFn({ method: "POST" })
  .validator(
    (input: { companyRoot: string; department: Department; employee: Employee }) => input,
  )
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      seedEmployeeOnDisk(data.companyRoot, data.department, data.employee);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
