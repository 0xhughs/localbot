import { posixBasename, posixDirname, posixJoin } from "../utils.ts";
import {
  exists,
  isDir,
  isFile,
  listDir,
  normalizePath,
  readFile,
  removeNode,
  type Vfs,
  writeFile,
  ensureDir,
} from "./vfs.ts";

export type ShellResult = {
  stdout: string;
  stderr: string;
  code: number;
  vfs: Vfs;
};

function fail(vfs: Vfs, msg: string): ShellResult {
  return { stdout: "", stderr: msg, code: 1, vfs };
}

function ok(vfs: Vfs, stdout: string): ShellResult {
  return { stdout, stderr: "", code: 0, vfs };
}

function tokenize(command: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
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

export function runVirtualShell(
  vfs: Vfs,
  cwd: string,
  command: string,
  sandboxRoot: string,
): ShellResult {
  const tokens = tokenize(command.trim());
  if (tokens.length === 0) return ok(vfs, "");
  const [cmd, ...args] = tokens;
  const resolve = (p: string) => {
    const abs = p.startsWith("/") ? normalizePath(p) : posixJoin(cwd, p);
    if (!abs.startsWith(normalizePath(sandboxRoot))) {
      throw new Error(`Refusing path outside sandbox: ${abs}`);
    }
    return abs;
  };

  try {
    switch (cmd) {
      case "pwd":
        return ok(vfs, cwd);
      case "ls": {
        const flagLong = args.includes("-l") || args.includes("-la") || args.includes("-al");
        const target = args.find((a) => !a.startsWith("-")) ?? ".";
        const path = resolve(target);
        if (!exists(vfs, path)) return fail(vfs, `ls: ${target}: no such file`);
        if (isFile(vfs, path)) return ok(vfs, posixBasename(path));
        const entries = listDir(vfs, path);
        if (!flagLong) {
          return ok(
            vfs,
            entries.map((e) => posixBasename(e.path) + (e.kind === "dir" ? "/" : "")).join("\n"),
          );
        }
        return ok(
          vfs,
          entries
            .map((e) =>
              `${e.kind === "dir" ? "d" : "-"}  ${String(e.size).padStart(6)}  ${posixBasename(e.path)}`,
            )
            .join("\n"),
        );
      }
      case "cat": {
        if (!args[0]) return fail(vfs, "cat: missing file");
        const path = resolve(args[0]);
        if (!isFile(vfs, path)) return fail(vfs, `cat: ${args[0]}: not a file`);
        return ok(vfs, readFile(vfs, path));
      }
      case "mkdir": {
        const p = args.filter((a) => a !== "-p")[0];
        if (!p) return fail(vfs, "mkdir: missing operand");
        return ok(ensureDir(vfs, resolve(p)), "");
      }
      case "touch": {
        if (!args[0]) return fail(vfs, "touch: missing file");
        const path = resolve(args[0]);
        if (exists(vfs, path) && isFile(vfs, path)) {
          return ok(writeFile(vfs, path, readFile(vfs, path)), "");
        }
        return ok(writeFile(vfs, path, ""), "");
      }
      case "rm": {
        const recursive = args.includes("-r") || args.includes("-rf") || args.includes("-fr");
        const target = args.find((a) => !a.startsWith("-"));
        if (!target) return fail(vfs, "rm: missing operand");
        const path = resolve(target);
        if (!exists(vfs, path)) return fail(vfs, `rm: ${target}: no such file`);
        if (isDir(vfs, path) && !recursive) return fail(vfs, `rm: ${target}: is a directory`);
        return ok(removeNode(vfs, path), "");
      }
      case "echo": {
        const redir = args.indexOf(">");
        const append = args.indexOf(">>");
        if (redir >= 0 && args[redir + 1]) {
          const text = args.slice(0, redir).join(" ") + "\n";
          return ok(writeFile(vfs, resolve(args[redir + 1]!), text), "");
        }
        if (append >= 0 && args[append + 1]) {
          const path = resolve(args[append + 1]!);
          const prev = isFile(vfs, path) ? readFile(vfs, path) : "";
          const text = args.slice(0, append).join(" ") + "\n";
          return ok(writeFile(vfs, path, prev + text), "");
        }
        return ok(vfs, args.join(" "));
      }
      case "mv":
      case "cp": {
        if (args.length < 2) return fail(vfs, `${cmd}: missing operand`);
        const src = resolve(args[0]!);
        const dst = resolve(args[1]!);
        if (!isFile(vfs, src)) return fail(vfs, `${cmd}: ${args[0]}: not a file`);
        let next = writeFile(vfs, dst, readFile(vfs, src));
        if (cmd === "mv") next = removeNode(next, src);
        return ok(next, "");
      }
      case "head": {
        const file = args.find((a) => !a.startsWith("-"));
        if (!file) return fail(vfs, "head: missing file");
        const path = resolve(file);
        const nFlag = args.find((a) => a.startsWith("-n"));
        const n = nFlag ? Number(nFlag.replace("-n", "") || args[args.indexOf(nFlag) + 1]) : 10;
        const lines = readFile(vfs, path).split("\n").slice(0, Number.isFinite(n) ? n : 10);
        return ok(vfs, lines.join("\n"));
      }
      default:
        return fail(
          vfs,
          `${cmd}: command not available in the workspace shell. Use read_file / write_file / list_dir.`,
        );
    }
  } catch (err) {
    return fail(vfs, err instanceof Error ? err.message : String(err));
  }
}

export function shellCwdHint(cwd: string): string {
  return posixDirname(cwd) === "/" ? cwd : cwd;
}
