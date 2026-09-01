import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = "id"): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(2) : gb.toFixed(1)} GB`;
}

export function formatRelative(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const d = Math.max(0, now - t);
  const s = Math.floor(d / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "B";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function posixJoin(...parts: string[]): string {
  const raw = parts
    .flatMap((p) => p.split("/"))
    .filter((p) => p.length > 0 && p !== ".");
  const out: string[] = [];
  for (const p of raw) {
    if (p === "..") out.pop();
    else out.push(p);
  }
  return "/" + out.join("/");
}

export function posixDirname(path: string): string {
  const n = posixJoin(path);
  const i = n.lastIndexOf("/");
  if (i <= 0) return "/";
  return n.slice(0, i) || "/";
}

export function posixBasename(path: string): string {
  const n = posixJoin(path);
  const i = n.lastIndexOf("/");
  return i < 0 ? n : n.slice(i + 1);
}

export function isUnder(path: string, root: string): boolean {
  const p = posixJoin(path);
  const r = posixJoin(root);
  if (p === r) return true;
  return p.startsWith(r.endsWith("/") ? r : r + "/");
}
