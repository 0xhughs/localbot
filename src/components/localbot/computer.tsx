import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Inbox,
  Share2,
} from "lucide-react";
import { grantPathFor } from "@/lib/fs/company";
import { fsList, fsRead } from "@/lib/fs/server";
import { resolveBot, useLocalBot } from "@/lib/store";
import type { DiskEntry } from "@/lib/types";
import { posixBasename } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ComputerPane() {
  const selected = useLocalBot((s) => s.ui.selectedBotId);
  const bots = useLocalBot((s) => s.bots);
  const bot = bots.find((b) => b.id === selected) ?? null;
  const previewPath = useLocalBot((s) => s.ui.previewPath);
  const company = useLocalBot((s) => s.company);
  const employees = useLocalBot((s) => s.employees);
  const departments = useLocalBot((s) => s.departments);
  const show = useLocalBot((s) => s.ui.showComputer);
  const diskEpoch = useLocalBot((s) => s.diskEpoch);

  const ctx =
    bot && company
      ? resolveBot({ bots, employees, departments, company }, bot.id)
      : null;

  if (!show) return null;
  if (!bot || !ctx || !company) {
    return (
      <aside className="hidden h-full w-[280px] shrink-0 border-l border-border bg-surface lg:block" />
    );
  }

  const shared = bot.grants.includes("shared")
    ? grantPathFor(bot, ctx.employee, ctx.department, ctx.company, "shared")
    : null;
  const outbox = grantPathFor(bot, ctx.employee, ctx.department, ctx.company, "outbox");

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      /* ignore */
    }
  };

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-t border-border bg-surface md:w-[300px] md:border-t-0 md:border-l">
      <div className="flex h-12 items-center justify-between px-3">
        <p className="font-mono text-[10px] tracking-wider text-subtle uppercase">
          Computer
        </p>
        <Button variant="ghost" size="sm" onClick={() => void copyPath(outbox)}>
          <Inbox className="size-3.5" />
          Outbox
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
        <TreeSection
          title="workspace"
          root={bot.workspacePath}
          companyRoot={company.root}
          epoch={diskEpoch}
          icon={<FolderOpen className="size-3.5" />}
        />
        <TreeSection
          title="output"
          root={bot.outputPath}
          companyRoot={company.root}
          epoch={diskEpoch}
          icon={<FileText className="size-3.5" />}
        />
        {shared && (
          <TreeSection
            title="shared"
            root={shared}
            companyRoot={company.root}
            epoch={diskEpoch}
            icon={<Share2 className="size-3.5" />}
          />
        )}
        <TreeSection
          title="outbox"
          root={outbox}
          companyRoot={company.root}
          epoch={diskEpoch}
          icon={<Inbox className="size-3.5" />}
        />
        {previewPath && (
          <DiskPreview path={previewPath} companyRoot={company.root} epoch={diskEpoch} />
        )}
      </div>
      <div className="border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={() => void copyPath(bot.workspacePath)}
          className="w-full text-left font-mono text-[10px] leading-relaxed text-subtle hover:text-muted"
        >
          Reveal path — copies the workspace location
        </button>
      </div>
    </aside>
  );
}

function TreeSection({
  title,
  root,
  companyRoot,
  epoch,
  icon,
}: {
  title: string;
  root: string;
  companyRoot: string;
  epoch: number;
  icon: ReactNode;
}) {
  return (
    <div className="mb-3">
      <p className="mb-1 flex items-center gap-1.5 px-1 font-mono text-[10px] tracking-wider text-subtle uppercase">
        {icon}
        {title}
      </p>
      <FileTree path={root} companyRoot={companyRoot} epoch={epoch} depth={0} />
    </div>
  );
}

function FileTree({
  path,
  companyRoot,
  epoch,
  depth,
}: {
  path: string;
  companyRoot: string;
  epoch: number;
  depth: number;
}) {
  const setUi = useLocalBot((s) => s.setUi);
  const preview = useLocalBot((s) => s.ui.previewPath);
  const [open, setOpen] = useState(depth < 1);
  const [children, setChildren] = useState<DiskEntry[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [isFile, setIsFile] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fsList({ data: { path, companyRoot } }).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setChildren(r.entries);
        setIsFile(false);
        setMissing(false);
        return;
      }
      if (/Not a directory/i.test(r.error)) {
        setIsFile(true);
        setMissing(false);
        setChildren([]);
        return;
      }
      setMissing(true);
      setChildren([]);
    });
    return () => {
      cancelled = true;
    };
  }, [path, companyRoot, epoch]);

  if (missing) {
    return (
      <p className="px-2 py-1 text-[11px] text-subtle">Folder not created yet.</p>
    );
  }

  if (isFile) {
    const active = preview === path;
    return (
      <button
        type="button"
        onClick={() => setUi({ previewPath: path })}
        className={`flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[12px] ${
          active ? "bg-raised text-fg" : "text-muted hover:bg-hover hover:text-fg"
        }`}
        style={{ paddingLeft: 8 + depth * 10 }}
      >
        <FileText className="size-3 shrink-0" />
        <span className="truncate">{posixBasename(path)}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 rounded-sm px-2 py-1 text-left text-[12px] text-muted hover:bg-hover hover:text-fg"
        style={{ paddingLeft: 8 + depth * 10 }}
      >
        <ChevronRight
          className={`size-3 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        />
        {open ? <FolderOpen className="size-3" /> : <Folder className="size-3" />}
        <span className="truncate">{posixBasename(path)}</span>
      </button>
      {open &&
        (children ?? []).map((c) =>
          c.kind === "file" ? (
            <button
              key={c.path}
              type="button"
              onClick={() => setUi({ previewPath: c.path })}
              className={`flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[12px] ${
                preview === c.path
                  ? "bg-raised text-fg"
                  : "text-muted hover:bg-hover hover:text-fg"
              }`}
              style={{ paddingLeft: 8 + (depth + 1) * 10 }}
            >
              <FileText className="size-3 shrink-0" />
              <span className="truncate">{c.name}</span>
            </button>
          ) : (
            <FileTree
              key={c.path}
              path={c.path}
              companyRoot={companyRoot}
              epoch={epoch}
              depth={depth + 1}
            />
          ),
        )}
    </div>
  );
}

function DiskPreview({
  path,
  companyRoot,
  epoch,
}: {
  path: string;
  companyRoot: string;
  epoch: number;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    let cancelled = false;
    void fsRead({ data: { path, companyRoot } }).then((r) => {
      if (cancelled) return;
      setText(r.ok ? r.content.slice(0, 2500) : "");
    });
    return () => {
      cancelled = true;
    };
  }, [path, companyRoot, epoch]);
  if (!text) return null;
  return (
    <div className="mt-3 rounded-md bg-bg p-2 shadow-[0_0_0_1px_var(--color-border)]">
      <p className="mb-1 truncate font-mono text-[10px] text-subtle">
        {posixBasename(path)}
      </p>
      <pre className="max-h-48 overflow-auto font-mono text-[11px] leading-relaxed text-muted whitespace-pre-wrap">
        {text}
      </pre>
    </div>
  );
}
