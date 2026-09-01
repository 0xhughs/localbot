import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Inbox,
  Share2,
} from "lucide-react";
import { grantPathFor } from "@/lib/fs/company";
import { filePreview, listDir, normalizePath } from "@/lib/fs/vfs";
import { resolveBot, useLocalBot } from "@/lib/store";
import { posixBasename } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ComputerPane() {
  const selected = useLocalBot((s) => s.ui.selectedBotId);
  const files = useLocalBot((s) => s.files);
  const bots = useLocalBot((s) => s.bots);
  const bot = bots.find((b) => b.id === selected) ?? null;
  const previewPath = useLocalBot((s) => s.ui.previewPath);
  const company = useLocalBot((s) => s.company);
  const employees = useLocalBot((s) => s.employees);
  const departments = useLocalBot((s) => s.departments);
  const show = useLocalBot((s) => s.ui.showComputer);

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
          icon={<FolderOpen className="size-3.5" />}
        />
        <TreeSection
          title="output"
          root={bot.outputPath}
          icon={<FileText className="size-3.5" />}
        />
        {shared && (
          <TreeSection
            title="shared"
            root={shared}
            icon={<Share2 className="size-3.5" />}
          />
        )}
        <TreeSection
          title="outbox"
          root={outbox}
          icon={<Inbox className="size-3.5" />}
        />
        {previewPath && files[normalizePath(previewPath)]?.kind === "file" && (
          <div className="mt-3 rounded-md bg-bg p-2 shadow-[0_0_0_1px_var(--color-border)]">
            <p className="mb-1 truncate font-mono text-[10px] text-subtle">
              {posixBasename(previewPath)}
            </p>
            <pre className="max-h-48 overflow-auto font-mono text-[11px] leading-relaxed text-muted whitespace-pre-wrap">
              {filePreview(files, previewPath, 2500)}
            </pre>
          </div>
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
  icon,
}: {
  title: string;
  root: string;
  icon: ReactNode;
}) {
  return (
    <div className="mb-3">
      <p className="mb-1 flex items-center gap-1.5 px-1 font-mono text-[10px] tracking-wider text-subtle uppercase">
        {icon}
        {title}
      </p>
      <FileTree path={root} depth={0} />
    </div>
  );
}

function FileTree({ path, depth }: { path: string; depth: number }) {
  const files = useLocalBot((s) => s.files);
  const setUi = useLocalBot((s) => s.setUi);
  const preview = useLocalBot((s) => s.ui.previewPath);
  const [open, setOpen] = useState(depth < 2);
  const n = normalizePath(path);
  const node = files[n];
  const children = useMemo(() => {
    try {
      return node?.kind === "dir" ? listDir(files, n) : [];
    } catch {
      return [];
    }
  }, [files, n, node?.kind]);

  if (!node) {
    return (
      <p className="px-2 py-1 text-[11px] text-subtle">Folder not created yet.</p>
    );
  }

  if (node.kind === "file") {
    const active = preview === n;
    return (
      <button
        type="button"
        onClick={() => setUi({ previewPath: n })}
        className={`flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[12px] ${
          active ? "bg-raised text-fg" : "text-muted hover:bg-hover hover:text-fg"
        }`}
        style={{ paddingLeft: 8 + depth * 10 }}
      >
        <FileText className="size-3 shrink-0" />
        <span className="truncate">{posixBasename(n)}</span>
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
        <span className="truncate">{posixBasename(n)}</span>
      </button>
      {open &&
        children.map((c) => (
          <FileTree key={c.path} path={c.path} depth={depth + 1} />
        ))}
    </div>
  );
}
