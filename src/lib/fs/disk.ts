import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  defaultRuntimeFor,
  isLlamaRuntimeId,
  llamaTarget,
  type LlamaRuntimeId,
  type LlamaRuntimePreference,
} from "../runtime/llama-platform.ts";
import type { DiskConfig, DiskEntry, FoldersConfig, VerifiedModel } from "../types.ts";

export function isElectronRuntime(): boolean {
  return process.env.LOCALBOT_ELECTRON === "1";
}

export function dataDir(): string {
  if (process.env.LOCALBOT_DATA_DIR) {
    return path.resolve(process.env.LOCALBOT_DATA_DIR);
  }
  return path.resolve(process.cwd(), "data");
}

export function configPath(): string {
  return path.join(dataDir(), "localbot-config.json");
}

export function slugName(name: string): string {
  const s = name.trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ");
  return s || "Untitled";
}

export function defaultCompanyRoot(companyName = "Studio"): string {
  const name = slugName(companyName) || "Studio";
  if (process.env.LOCALBOT_DOCUMENTS_DIR) {
    return path.join(process.env.LOCALBOT_DOCUMENTS_DIR, "LocalBot", name);
  }
  return path.join(dataDir(), "LocalBot", name);
}

export function isUnderDir(root: string, target: string): boolean {
  const r = path.resolve(root);
  const t = path.resolve(target);
  if (t === r) return true;
  const rel = path.relative(r, t);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function isUnderProjectData(p: string): boolean {
  return isUnderDir(dataDir(), p) || path.resolve(p) === dataDir();
}

export function defaultModelsDir(): string {
  if (isElectronRuntime()) return path.join(dataDir(), "models");
  return path.join(dataDir(), "LocalBot", "models");
}

export function llamaBinRoot(): string {
  if (isElectronRuntime()) return path.join(dataDir(), "bin");
  return path.join(dataDir(), "LocalBot", "bin");
}

export function llamaServerName(): string {
  return process.platform === "win32" ? "llama-server.exe" : "llama-server";
}

/**
 * Where one llama.cpp runtime lives: `bin/{target}/{runtime}/` (Stage 6), so
 * the CPU tree and a GPU tree coexist. Installs from before Stage 6 unpacked
 * the CPU build straight into `bin/{target}/`; that folder is still accepted
 * for the target's default runtime so nothing is re-downloaded.
 */
export function llamaBinDir(runtime: LlamaRuntimeId = defaultRuntimeForHost()): string {
  const root = llamaBinRoot();
  const target = llamaTarget();
  const key = target ?? `${process.platform}-${process.arch}`;
  const preferred = path.join(root, key, runtime);
  const name = llamaServerName();
  const candidates = [preferred];
  if (target && runtime === defaultRuntimeFor(target)) {
    candidates.push(path.join(root, key), path.join(root, "llama-b10749"), root);
  }
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, name))) return dir;
  }
  return preferred;
}

export function defaultRuntimeForHost(): LlamaRuntimeId {
  const t = llamaTarget();
  return t ? defaultRuntimeFor(t) : "cpu";
}

const DEFAULT_CFG_FIELDS = {
  activeModelId: null as string | null,
  activeModelPath: null as string | null,
  allowHostedDemo: false,
  useExistingOllama: false,
  ollamaModel: null as string | null,
  llamaRuntime: "auto" as LlamaRuntimePreference,
  verifiedModels: {} as Record<string, VerifiedModel>,
};

function normalizeVerified(raw: unknown): Record<string, VerifiedModel> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, VerifiedModel> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const r = v as Partial<VerifiedModel>;
    if (typeof r.sha256 !== "string" || r.sha256.length !== 64 || typeof r.size !== "number" || typeof r.mtimeMs !== "number") continue;
    out[path.resolve(k)] = {
      sha256: r.sha256,
      size: r.size,
      mtimeMs: r.mtimeMs,
      catalogId: typeof r.catalogId === "string" ? r.catalogId : null,
      verifiedAt: typeof r.verifiedAt === "string" ? r.verifiedAt : "",
    };
  }
  return out;
}

function normalizeRuntimePref(raw: unknown): LlamaRuntimePreference {
  return raw === "auto" || isLlamaRuntimeId(raw) ? raw : "auto";
}

export const CONFIG_VERSION = 2;

/**
 * Default "Create my folders" layout. A suggestion for the pickers, not a
 * required company layout — the four scopes may live anywhere.
 */
export function suggestedFolders(input: {
  companyName?: string;
  departmentName?: string;
  employeeName?: string;
}): FoldersConfig {
  const root = defaultCompanyRoot(input.companyName || "Studio");
  const dept = slugName(input.departmentName || "Operations");
  const emp = slugName(input.employeeName || "You");
  const employeeRoot = path.join(root, "departments", dept, "employees", emp);
  return {
    employeeRoot,
    employeeShared: path.join(employeeRoot, "shared"),
    departmentShared: path.join(root, "departments", dept, "shared"),
    companyShared: path.join(root, "company-shared"),
  };
}

function normalizeFolders(raw: unknown): FoldersConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const employeeRoot = typeof r.employeeRoot === "string" ? r.employeeRoot.trim() : "";
  if (!employeeRoot) return null;
  const opt = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? path.resolve(v.trim()) : null;
  return {
    employeeRoot: path.resolve(employeeRoot),
    employeeShared: opt(r.employeeShared),
    departmentShared: opt(r.departmentShared),
    companyShared: opt(r.companyShared),
  };
}

/**
 * One-time map of a pre-Stage-2 `companyRoot` onto the four scopes. The old
 * tree was `{root}/departments/{Dept}/people/{Emp}/bots/{Bot}/…`; the first
 * department/employee found become the employee root. Nothing is moved or
 * deleted — old `bots/{Name}/workspace` files stay where they are.
 */
export function migrateLegacyCompanyRoot(companyRoot: string): FoldersConfig {
  const root = path.resolve(companyRoot);
  const firstDir = (dir: string): string | null => {
    try {
      const names = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
      return names[0] ?? null;
    } catch {
      return null;
    }
  };
  const dept = firstDir(path.join(root, "departments"));
  const emp = dept ? firstDir(path.join(root, "departments", dept, "people")) : null;
  const companyShared = fs.existsSync(path.join(root, "shared"))
    ? path.join(root, "shared")
    : null;
  if (dept && emp) {
    return {
      employeeRoot: path.join(root, "departments", dept, "people", emp),
      employeeShared: null,
      departmentShared: path.join(root, "departments", dept, "shared"),
      companyShared,
    };
  }
  return {
    employeeRoot: root,
    employeeShared: null,
    departmentShared: null,
    companyShared,
  };
}

export function emptyConfig(): DiskConfig {
  return {
    version: CONFIG_VERSION,
    folders: null,
    legacyCompanyRoot: null,
    previewWritesToProjectData: true,
    modelsDir: defaultModelsDir(),
    ...DEFAULT_CFG_FIELDS,
  };
}

/**
 * Stage 7: every host-side JSON file (config, agent index, chats) is written
 * as temp file + `renameSync`, so a crash mid-write leaves either the old
 * file or the new one — never a truncated one. The previous copy is kept as
 * `{file}.bak` when it existed.
 */
export function atomicWriteJson(file: string, data: unknown): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  try {
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

function writeConfigFile(cfg: DiskConfig): void {
  atomicWriteJson(configPath(), cfg);
}

export function loadConfig(): DiskConfig {
  const fallback = emptyConfig();
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(configPath(), "utf8")) as Record<string, unknown>;
  } catch {
    return fallback;
  }
  const modelsDir =
    typeof raw.modelsDir === "string" && raw.modelsDir
      ? path.resolve(raw.modelsDir)
      : defaultModelsDir();
  let folders = normalizeFolders(raw.folders);
  let legacyCompanyRoot =
    typeof raw.legacyCompanyRoot === "string" && raw.legacyCompanyRoot
      ? path.resolve(raw.legacyCompanyRoot)
      : null;
  let migrated = false;
  const oldRoot = typeof raw.companyRoot === "string" ? raw.companyRoot.trim() : "";
  if (!folders && oldRoot) {
    folders = migrateLegacyCompanyRoot(oldRoot);
    legacyCompanyRoot = path.resolve(oldRoot);
    migrated = true;
  }
  const cfg: DiskConfig = {
    version: CONFIG_VERSION,
    folders,
    legacyCompanyRoot,
    previewWritesToProjectData: folders ? isUnderProjectData(folders.employeeRoot) : true,
    modelsDir,
    activeModelId: typeof raw.activeModelId === "string" ? raw.activeModelId : null,
    activeModelPath:
      typeof raw.activeModelPath === "string" && raw.activeModelPath
        ? path.resolve(raw.activeModelPath)
        : null,
    allowHostedDemo: Boolean(raw.allowHostedDemo),
    useExistingOllama: Boolean(raw.useExistingOllama),
    ollamaModel: typeof raw.ollamaModel === "string" && raw.ollamaModel ? raw.ollamaModel : null,
    llamaRuntime: normalizeRuntimePref(raw.llamaRuntime),
    verifiedModels: normalizeVerified(raw.verifiedModels),
  };
  if (migrated) {
    try {
      writeConfigFile(cfg);
    } catch {
      /* read-only data dir: keep the in-memory migration */
    }
  }
  return cfg;
}

export function patchConfig(patch: Partial<DiskConfig>): DiskConfig {
  const cur = loadConfig();
  const modelsDir = path.resolve(patch.modelsDir ?? cur.modelsDir ?? defaultModelsDir());
  const folders =
    patch.folders !== undefined ? normalizeFolders(patch.folders) : cur.folders;
  const next: DiskConfig = {
    version: CONFIG_VERSION,
    folders,
    legacyCompanyRoot:
      patch.legacyCompanyRoot !== undefined ? patch.legacyCompanyRoot : cur.legacyCompanyRoot,
    previewWritesToProjectData: folders ? isUnderProjectData(folders.employeeRoot) : true,
    modelsDir,
    activeModelId: patch.activeModelId !== undefined ? patch.activeModelId : cur.activeModelId,
    activeModelPath:
      patch.activeModelPath !== undefined
        ? patch.activeModelPath
          ? path.resolve(patch.activeModelPath)
          : null
        : cur.activeModelPath,
    allowHostedDemo:
      patch.allowHostedDemo !== undefined ? patch.allowHostedDemo : cur.allowHostedDemo,
    useExistingOllama:
      patch.useExistingOllama !== undefined ? patch.useExistingOllama : cur.useExistingOllama,
    ollamaModel: patch.ollamaModel !== undefined ? patch.ollamaModel : cur.ollamaModel,
    llamaRuntime: patch.llamaRuntime !== undefined ? normalizeRuntimePref(patch.llamaRuntime) : cur.llamaRuntime,
    verifiedModels:
      patch.verifiedModels !== undefined ? normalizeVerified(patch.verifiedModels) : cur.verifiedModels,
  };
  fs.mkdirSync(next.modelsDir, { recursive: true });
  writeConfigFile(next);
  return next;
}

export function assertInsideRoot(companyRoot: string, target: string): string {
  const root = path.resolve(companyRoot);
  const abs = path.isAbsolute(target)
    ? path.resolve(target)
    : path.resolve(root, target);
  if (!isUnderDir(root, abs) && abs !== root) {
    throw new Error(`Denied: ${abs} is outside company root ${root}`);
  }
  return abs;
}

export function grantAllowed(target: string, allowedRoots: string[]): boolean {
  const abs = path.resolve(target);
  return allowedRoots.some((r) => {
    const root = path.resolve(r);
    return abs === root || isUnderDir(root, abs);
  });
}

export function authorize(
  companyRoot: string,
  target: string,
  allowedRoots?: string[],
): string {
  const abs = assertInsideRoot(companyRoot, target);
  if (allowedRoots && allowedRoots.length > 0 && !grantAllowed(abs, allowedRoots)) {
    throw new Error(`Denied: ${abs} is outside this agent's grants.`);
  }
  return abs;
}

export function diskExists(
  companyRoot: string,
  target: string,
  allowedRoots?: string[],
): boolean {
  const abs = authorize(companyRoot, target, allowedRoots);
  return fs.existsSync(abs);
}

export function diskMkdir(
  companyRoot: string,
  target: string,
  allowedRoots?: string[],
): void {
  const abs = authorize(companyRoot, target, allowedRoots);
  fs.mkdirSync(abs, { recursive: true });
}

export function diskWrite(
  companyRoot: string,
  target: string,
  content: string,
  allowedRoots?: string[],
): void {
  const abs = authorize(companyRoot, target, allowedRoots);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

export function diskRead(
  companyRoot: string,
  target: string,
  allowedRoots?: string[],
): string {
  const abs = authorize(companyRoot, target, allowedRoots);
  if (!fs.existsSync(abs)) throw new Error(`No such file: ${abs}`);
  if (fs.statSync(abs).isDirectory()) throw new Error(`Not a file: ${abs}`);
  return fs.readFileSync(abs, "utf8");
}

export function diskList(
  companyRoot: string,
  target: string,
  allowedRoots?: string[],
): DiskEntry[] {
  const abs = authorize(companyRoot, target, allowedRoots);
  if (!fs.existsSync(abs)) throw new Error(`No such directory: ${abs}`);
  if (!fs.statSync(abs).isDirectory()) throw new Error(`Not a directory: ${abs}`);
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .map((d) => {
      const p = path.join(abs, d.name);
      const kind: "file" | "dir" = d.isDirectory() ? "dir" : "file";
      let size = 0;
      try {
        size = d.isFile() ? fs.statSync(p).size : 0;
      } catch {
        size = 0;
      }
      return { path: p, name: d.name, kind, size };
    })
    .sort((a, b) =>
      a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name),
    );
}

export function diskStat(
  companyRoot: string,
  target: string,
  allowedRoots?: string[],
): DiskEntry | null {
  const abs = authorize(companyRoot, target, allowedRoots);
  if (!fs.existsSync(abs)) return null;
  const st = fs.statSync(abs);
  return {
    path: abs,
    name: path.basename(abs),
    kind: st.isDirectory() ? "dir" : "file",
    size: st.isFile() ? st.size : 0,
  };
}

export function diskDelete(
  companyRoot: string,
  target: string,
  allowedRoots?: string[],
): void {
  const abs = authorize(companyRoot, target, allowedRoots);
  if (abs === path.resolve(companyRoot)) {
    throw new Error("Denied: cannot delete the company root");
  }
  if (!fs.existsSync(abs)) throw new Error(`No such file: ${abs}`);
  fs.rmSync(abs, { recursive: true, force: true });
}

export function diskReplace(
  companyRoot: string,
  target: string,
  oldString: string,
  newString: string,
  allowedRoots?: string[],
): void {
  const current = diskRead(companyRoot, target, allowedRoots);
  if (!current.includes(oldString)) {
    throw new Error(`Pattern not found in ${target}`);
  }
  diskWrite(companyRoot, target, current.replace(oldString, newString), allowedRoots);
}

export function diskMove(
  companyRoot: string,
  from: string,
  to: string,
  allowedRoots?: string[],
): void {
  const src = authorize(companyRoot, from, allowedRoots);
  const dst = authorize(companyRoot, to, allowedRoots);
  if (!fs.existsSync(src)) throw new Error(`Nothing to move: ${src}`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.renameSync(src, dst);
}

export function diskPrettyTree(
  companyRoot: string,
  target: string,
  max = 80,
  allowedRoots?: string[],
): string {
  const abs = authorize(companyRoot, target, allowedRoots);
  const lines: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (lines.length >= max) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (lines.length >= max) {
        lines.push("  …");
        return;
      }
      lines.push(`${"  ".repeat(depth)}${e.name}${e.isDirectory() ? "/" : ""}`);
      if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
    }
  };
  if (!fs.existsSync(abs)) return "(missing)";
  const st = fs.statSync(abs);
  lines.push(path.basename(abs) + (st.isDirectory() ? "/" : ""));
  if (st.isDirectory()) walk(abs, 1);
  return lines.join("\n");
}

export type DiskShellResult = {
  stdout: string;
  stderr: string;
  code: number;
};

function tokenize(command: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: "'" | '"' | null = null;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export function diskShell(
  companyRoot: string,
  cwd: string,
  command: string,
  allowedRoots?: string[],
  guard?: (abs: string) => void,
): DiskShellResult {
  const tokens = tokenize(command.trim());
  if (tokens.length === 0) return { stdout: "", stderr: "", code: 0 };
  const [cmd, ...args] = tokens;
  const resolve = (p: string) => {
    const abs = p.startsWith("/") ? p : path.join(cwd, p);
    const ok = authorize(companyRoot, abs, allowedRoots);
    guard?.(ok);
    return ok;
  };
  try {
    switch (cmd) {
      case "pwd":
        return { stdout: cwd, stderr: "", code: 0 };
      case "ls": {
        const target = args.find((a) => !a.startsWith("-")) ?? ".";
        const abs = resolve(target);
        if (!fs.existsSync(abs)) {
          return { stdout: "", stderr: `ls: ${target}: no such file`, code: 1 };
        }
        const st = fs.statSync(abs);
        if (st.isFile()) return { stdout: path.basename(abs), stderr: "", code: 0 };
        const flagLong = args.includes("-l") || args.includes("-la") || args.includes("-al");
        const entries = diskList(companyRoot, abs, allowedRoots);
        if (!flagLong) {
          return {
            stdout: entries.map((e) => e.name + (e.kind === "dir" ? "/" : "")).join("\n"),
            stderr: "",
            code: 0,
          };
        }
        return {
          stdout: entries
            .map(
              (e) =>
                `${e.kind === "dir" ? "d" : "-"}  ${String(e.size).padStart(6)}  ${e.name}`,
            )
            .join("\n"),
          stderr: "",
          code: 0,
        };
      }
      case "cat": {
        if (!args[0]) return { stdout: "", stderr: "cat: missing file", code: 1 };
        return { stdout: diskRead(companyRoot, resolve(args[0]), allowedRoots), stderr: "", code: 0 };
      }
      case "mkdir": {
        const p = args.filter((a) => a !== "-p")[0];
        if (!p) return { stdout: "", stderr: "mkdir: missing operand", code: 1 };
        diskMkdir(companyRoot, resolve(p), allowedRoots);
        return { stdout: "", stderr: "", code: 0 };
      }
      case "touch": {
        if (!args[0]) return { stdout: "", stderr: "touch: missing file", code: 1 };
        const abs = resolve(args[0]);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          fs.utimesSync(abs, new Date(), new Date());
        } else {
          diskWrite(companyRoot, abs, "", allowedRoots);
        }
        return { stdout: "", stderr: "", code: 0 };
      }
      case "rm": {
        const recursive = args.includes("-r") || args.includes("-rf") || args.includes("-fr");
        const target = args.find((a) => !a.startsWith("-"));
        if (!target) return { stdout: "", stderr: "rm: missing operand", code: 1 };
        const abs = resolve(target);
        if (!fs.existsSync(abs)) {
          return { stdout: "", stderr: `rm: ${target}: no such file`, code: 1 };
        }
        if (fs.statSync(abs).isDirectory() && !recursive) {
          return { stdout: "", stderr: `rm: ${target}: is a directory`, code: 1 };
        }
        diskDelete(companyRoot, abs, allowedRoots);
        return { stdout: "", stderr: "", code: 0 };
      }
      case "echo": {
        const redir = args.indexOf(">");
        const append = args.indexOf(">>");
        if (redir >= 0 && args[redir + 1]) {
          diskWrite(
            companyRoot,
            resolve(args[redir + 1]!),
            args.slice(0, redir).join(" ") + "\n",
            allowedRoots,
          );
          return { stdout: "", stderr: "", code: 0 };
        }
        if (append >= 0 && args[append + 1]) {
          const dest = resolve(args[append + 1]!);
          const prev = fs.existsSync(dest) && fs.statSync(dest).isFile()
            ? diskRead(companyRoot, dest, allowedRoots)
            : "";
          diskWrite(
            companyRoot,
            dest,
            prev + args.slice(0, append).join(" ") + "\n",
            allowedRoots,
          );
          return { stdout: "", stderr: "", code: 0 };
        }
        return { stdout: args.join(" "), stderr: "", code: 0 };
      }
      case "mv":
      case "cp": {
        if (args.length < 2) {
          return { stdout: "", stderr: `${cmd}: missing operand`, code: 1 };
        }
        const src = resolve(args[0]!);
        const dst = resolve(args[1]!);
        const body = diskRead(companyRoot, src, allowedRoots);
        diskWrite(companyRoot, dst, body, allowedRoots);
        if (cmd === "mv") diskDelete(companyRoot, src, allowedRoots);
        return { stdout: "", stderr: "", code: 0 };
      }
      case "head": {
        const file = args.find((a) => !a.startsWith("-"));
        if (!file) return { stdout: "", stderr: "head: missing file", code: 1 };
        const nFlag = args.find((a) => a.startsWith("-n"));
        const n = nFlag
          ? Number(nFlag.replace("-n", "") || args[args.indexOf(nFlag) + 1])
          : 10;
        const lines = diskRead(companyRoot, resolve(file), allowedRoots)
          .split("\n")
          .slice(0, Number.isFinite(n) ? n : 10);
        return { stdout: lines.join("\n"), stderr: "", code: 0 };
      }
      default:
        return {
          stdout: "",
          stderr: `${cmd}: command not available in the workspace shell. Use read_file / write_file / list_dir.`,
          code: 1,
        };
    }
  } catch (err) {
    return {
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
      code: 1,
    };
  }
}

export function makeTempRoot(prefix = "localbot-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
