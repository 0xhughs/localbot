import { isUnder, posixBasename, posixDirname, posixJoin } from "../utils.ts";
import type { FsNode } from "../types.ts";

export type Vfs = Record<string, FsNode>;

export function normalizePath(path: string): string {
  if (!path) return "/";
  const prefixed = path.startsWith("/") ? path : `/${path}`;
  return posixJoin(prefixed);
}

export function ensureDir(vfs: Vfs, path: string, mtime = Date.now()): Vfs {
  const n = normalizePath(path);
  if (n === "/") {
    if (!vfs["/"]) {
      return {
        ...vfs,
        "/": { path: "/", kind: "dir", content: "", mtime, size: 0 },
      };
    }
    return vfs;
  }
  let next = vfs;
  const parts = n.split("/").filter(Boolean);
  let cur = "";
  next = ensureDir(next, "/", mtime);
  for (const part of parts) {
    cur = `${cur}/${part}`;
    if (!next[cur] || next[cur]!.kind !== "dir") {
      next = {
        ...next,
        [cur]: { path: cur, kind: "dir", content: "", mtime, size: 0 },
      };
    }
  }
  return next;
}

export function writeFile(
  vfs: Vfs,
  path: string,
  content: string,
  mtime = Date.now(),
): Vfs {
  const n = normalizePath(path);
  if (n === "/") throw new Error("Cannot write file at /");
  const parent = posixDirname(n);
  let next = ensureDir(vfs, parent, mtime);
  const existing = next[n];
  if (existing?.kind === "dir") {
    throw new Error(`Cannot overwrite directory: ${n}`);
  }
  next = {
    ...next,
    [n]: {
      path: n,
      kind: "file",
      content,
      mtime,
      size: new TextEncoder().encode(content).length,
    },
  };
  return next;
}

export function readFile(vfs: Vfs, path: string): string {
  const n = normalizePath(path);
  const node = vfs[n];
  if (!node) throw new Error(`No such file: ${n}`);
  if (node.kind !== "file") throw new Error(`Not a file: ${n}`);
  return node.content;
}

export function exists(vfs: Vfs, path: string): boolean {
  return Boolean(vfs[normalizePath(path)]);
}

export function isDir(vfs: Vfs, path: string): boolean {
  return vfs[normalizePath(path)]?.kind === "dir";
}

export function isFile(vfs: Vfs, path: string): boolean {
  return vfs[normalizePath(path)]?.kind === "file";
}

export function listDir(vfs: Vfs, path: string): FsNode[] {
  const n = normalizePath(path);
  const dir = vfs[n];
  if (!dir || dir.kind !== "dir") throw new Error(`Not a directory: ${n}`);
  const prefix = n === "/" ? "/" : n + "/";
  return Object.values(vfs)
    .filter((node) => {
      if (node.path === n) return false;
      if (!node.path.startsWith(prefix)) return false;
      const rest = node.path.slice(prefix.length);
      return rest.length > 0 && !rest.includes("/");
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
}

export function listTree(vfs: Vfs, path: string, max = 200): string[] {
  const n = normalizePath(path);
  const out: string[] = [];
  const prefix = n === "/" ? "/" : n + "/";
  const nodes = Object.values(vfs)
    .filter((node) => node.path === n || node.path.startsWith(prefix))
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const node of nodes) {
    if (out.length >= max) {
      out.push("…");
      break;
    }
    const rel = node.path === n ? "." : node.path.slice(prefix.length);
    out.push(node.kind === "dir" ? `${rel}/` : rel);
  }
  return out;
}

export function removeNode(vfs: Vfs, path: string): Vfs {
  const n = normalizePath(path);
  if (n === "/") throw new Error("Cannot delete /");
  const next = { ...vfs };
  const prefix = n + "/";
  for (const key of Object.keys(next)) {
    if (key === n || key.startsWith(prefix)) delete next[key];
  }
  return next;
}

export function moveTree(vfs: Vfs, from: string, to: string): Vfs {
  const src = normalizePath(from);
  const dst = normalizePath(to);
  if (src === dst) return vfs;
  if (isUnder(dst, src) && dst !== src) {
    throw new Error("Cannot move a folder into itself");
  }
  const prefix = src + "/";
  let next = { ...vfs };
  const moving = Object.values(vfs).filter(
    (n) => n.path === src || n.path.startsWith(prefix),
  );
  if (moving.length === 0) throw new Error(`Nothing to move: ${src}`);
  next = ensureDir(next, posixDirname(dst));
  for (const node of moving) {
    const rel = node.path === src ? "" : node.path.slice(prefix.length);
    const np = rel ? `${dst}/${rel}` : dst;
    next[np] = { ...node, path: np };
  }
  for (const node of moving) {
    delete next[node.path];
  }
  return next;
}

export function strReplace(
  vfs: Vfs,
  path: string,
  oldString: string,
  newString: string,
): Vfs {
  const current = readFile(vfs, path);
  if (!current.includes(oldString)) {
    throw new Error(`Pattern not found in ${normalizePath(path)}`);
  }
  const next = current.replace(oldString, newString);
  return writeFile(vfs, path, next);
}

export function writeJson(vfs: Vfs, path: string, value: unknown): Vfs {
  return writeFile(vfs, path, JSON.stringify(value, null, 2) + "\n");
}

export function readJson<T>(vfs: Vfs, path: string): T {
  return JSON.parse(readFile(vfs, path)) as T;
}

export function touchDir(vfs: Vfs, path: string): Vfs {
  return ensureDir(vfs, path);
}

export function prettyTree(vfs: Vfs, root: string, max = 80): string {
  const n = normalizePath(root);
  const prefix = n === "/" ? "/" : n + "/";
  const nodes = Object.values(vfs)
    .filter((node) => node.path === n || node.path.startsWith(prefix))
    .sort((a, b) => a.path.localeCompare(b.path));
  const lines: string[] = [];
  for (const node of nodes) {
    if (lines.length >= max) {
      lines.push("  …");
      break;
    }
    const rel = node.path === n ? posixBasename(n) || "/" : node.path.slice(prefix.length);
    const depth = rel === posixBasename(n) || rel === "/" ? 0 : rel.split("/").length;
    const name = posixBasename(node.path) + (node.kind === "dir" ? "/" : "");
    lines.push(`${"  ".repeat(Math.max(0, depth - (node.path === n ? 0 : 0)))}${name}`);
  }
  // Better indent from relative depth
  const better: string[] = [];
  for (const node of nodes.slice(0, max)) {
    const rel = node.path === n ? "" : node.path.slice(prefix.length);
    const depth = rel === "" ? 0 : rel.split("/").length;
    const name =
      (rel === "" ? posixBasename(n) || node.path : posixBasename(node.path)) +
      (node.kind === "dir" ? "/" : "");
    better.push(`${"  ".repeat(depth)}${name}`);
  }
  if (nodes.length > max) better.push("  …");
  return better.join("\n");
}

export function filePreview(vfs: Vfs, path: string, max = 4000): string {
  const n = normalizePath(path);
  const node = vfs[n];
  if (!node) return "";
  if (node.kind === "dir") return "";
  if (node.content.length <= max) return node.content;
  return node.content.slice(0, max) + "\n…";
}
