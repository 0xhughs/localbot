import { useEffect, useState, type ReactNode } from "react";
import {
  Building2,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Lock,
  Share2,
  Users,
  X,
} from "lucide-react";
import { browseList, browseRead } from "@/lib/fs/server";
import {
  configuredScopes,
  folderFor,
  SCOPE_META,
  type ScopeId,
} from "@/lib/fs/scope-model";
import { useLocalBot } from "@/lib/store";
import type { ScopedEntry } from "@/lib/types";
import { Button } from "@/components/ui/button";

const ICONS: Record<ScopeId, ReactNode> = {
  private: <Lock className="size-3.5" />,
  "employee-shared": <Users className="size-3.5" />,
  "department-shared": <Share2 className="size-3.5" />,
  "company-shared": <Building2 className="size-3.5" />,
};

/** `scope:relPath` — the preview key. Never a host path. */
function previewKey(scope: ScopeId, relPath: string): string {
  return `${scope}:${relPath}`;
}

function splitPreview(key: string | null): { scope: ScopeId; relPath: string } | null {
  if (!key) return null;
  const i = key.indexOf(":");
  if (i < 0) return null;
  return { scope: key.slice(0, i) as ScopeId, relPath: key.slice(i + 1) };
}

export function ComputerPane() {
  const selected = useLocalBot((s) => s.ui.selectedBotId);
  const bots = useLocalBot((s) => s.bots);
  const bot = bots.find((b) => b.id === selected) ?? null;
  const previewPath = useLocalBot((s) => s.ui.previewPath);
  const folders = useLocalBot((s) => s.folders);
  const show = useLocalBot((s) => s.ui.showComputer);
  const setUi = useLocalBot((s) => s.setUi);
  const diskEpoch = useLocalBot((s) => s.diskEpoch);

  if (!show) return null;
  if (!bot || !folders) {
    return (
      <aside className="hidden h-full w-[280px] shrink-0 border-l border-border bg-surface lg:block">
        {!folders && (
          <p className="p-3 text-[11px] text-subtle">
            No folders connected. Open Settings → Folders.
          </p>
        )}
      </aside>
    );
  }

  const scopes = configuredScopes(folders);
  const preview = splitPreview(previewPath);

  const copyPath = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-t border-border bg-surface shadow-[0_0_0_1px_var(--color-border),-16px_0_40px_rgb(0_0_0/0.35)] md:border-t-0 md:border-l">
      <div className="flex h-12 items-center justify-between px-3">
        <p className="font-mono text-[10px] tracking-wider text-subtle uppercase">
          Computer
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close computer"
          onClick={() => setUi({ showComputer: false })}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
        {scopes.map((scope) => (
          <ScopeSection
            key={scope}
            scope={scope}
            agentName={bot.name}
            granted={bot.scopes.includes(scope)}
            hostPath={scope === "private" ? bot.privatePath : folderFor(folders, scope) ?? ""}
            epoch={diskEpoch}
            onCopy={copyPath}
          />
        ))}
        {preview && (
          <ScopedPreview
            scope={preview.scope}
            relPath={preview.relPath}
            agentName={bot.name}
            epoch={diskEpoch}
          />
        )}
      </div>
      <div className="border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={() => void copyPath(bot.privatePath)}
          className="w-full text-left font-mono text-[10px] leading-relaxed text-subtle hover:text-muted"
          title={bot.privatePath}
        >
          Reveal path — copies this agent's private folder location
        </button>
      </div>
    </aside>
  );
}

function ScopeSection({
  scope,
  agentName,
  granted,
  hostPath,
  epoch,
  onCopy,
}: {
  scope: ScopeId;
  agentName: string;
  granted: boolean;
  hostPath: string;
  epoch: number;
  onCopy: (text: string) => void;
}) {
  return (
    <div className="mb-3" data-scope={scope}>
      <div className="mb-1 flex items-center justify-between px-1">
        <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-subtle uppercase">
          {ICONS[scope]}
          {SCOPE_META[scope].short}
        </p>
        <div className="flex items-center gap-1">
          {!granted && (
            <span
              className="rounded-full bg-raised px-1.5 py-0.5 font-mono text-[9px] text-subtle"
              title={`${agentName} is not granted ${scope}. You can still browse it.`}
            >
              not granted
            </span>
          )}
          <button
            type="button"
            className="font-mono text-[9px] text-subtle hover:text-muted"
            title={hostPath}
            onClick={() => onCopy(hostPath)}
          >
            copy path
          </button>
        </div>
      </div>
      <FileTree scope={scope} relPath="" agentName={agentName} epoch={epoch} depth={0} />
    </div>
  );
}

function FileTree({
  scope,
  relPath,
  agentName,
  epoch,
  depth,
}: {
  scope: ScopeId;
  relPath: string;
  agentName: string;
  epoch: number;
  depth: number;
}) {
  const setUi = useLocalBot((s) => s.setUi);
  const preview = useLocalBot((s) => s.ui.previewPath);
  const [open, setOpen] = useState(depth < 1);
  const [children, setChildren] = useState<ScopedEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void browseList({ data: { scope, relPath, agentName } }).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setChildren(r.entries);
        setError(null);
        return;
      }
      setChildren([]);
      setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [scope, relPath, agentName, epoch]);

  if (error) {
    return (
      <p className="px-2 py-1 text-[11px] text-subtle">
        {/No such directory/i.test(error) ? "Folder not created yet." : error}
      </p>
    );
  }

  const label = relPath ? relPath.split("/").pop() : `${scope}/`;

  return (
    <div>
      {depth > 0 && (
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
          <span className="truncate">{label}</span>
        </button>
      )}
      {open && children && children.length === 0 && depth === 0 && (
        <p className="px-2 py-1 text-[11px] text-subtle">Empty.</p>
      )}
      {open &&
        (children ?? []).map((c) =>
          c.kind === "file" ? (
            <button
              key={c.relPath}
              type="button"
              onClick={() => setUi({ previewPath: previewKey(scope, c.relPath) })}
              className={`flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[12px] ${
                preview === previewKey(scope, c.relPath)
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
              key={c.relPath}
              scope={scope}
              relPath={c.relPath}
              agentName={agentName}
              epoch={epoch}
              depth={depth + 1}
            />
          ),
        )}
    </div>
  );
}

function ScopedPreview({
  scope,
  relPath,
  agentName,
  epoch,
}: {
  scope: ScopeId;
  relPath: string;
  agentName: string;
  epoch: number;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    let cancelled = false;
    void browseRead({ data: { scope, relPath, agentName } }).then((r) => {
      if (cancelled) return;
      setText(r.ok ? r.content.slice(0, 2500) : "");
    });
    return () => {
      cancelled = true;
    };
  }, [scope, relPath, agentName, epoch]);
  if (!text) return null;
  return (
    <div className="mt-3 rounded-md bg-bg p-2 shadow-[0_0_0_1px_var(--color-border)]">
      <p className="mb-1 truncate font-mono text-[10px] text-subtle">
        {scope}/{relPath}
      </p>
      <pre className="max-h-48 overflow-auto font-mono text-[11px] leading-relaxed text-muted whitespace-pre-wrap">
        {text}
      </pre>
    </div>
  );
}
