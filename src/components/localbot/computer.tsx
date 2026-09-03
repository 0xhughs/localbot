import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Building2,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Lock,
  RefreshCw,
  Share2,
  Unplug,
  Users,
  X,
} from "lucide-react";
import {
  browseHostPath,
  browseList,
  browseRead,
  browseRefresh,
  scopesStatus,
} from "@/lib/fs/server";
import {
  configuredScopes,
  folderFor,
  SCOPE_META,
  type ScopeId,
} from "@/lib/fs/scope-model";
import type { ScopeStatus } from "@/lib/fs/watch";
import { canRevealPath, revealLabel, revealPath } from "@/lib/desktop-bridge";
import { useLocalBot } from "@/lib/store";
import type { ScopedEntry } from "@/lib/types";
import { Button } from "@/components/ui/button";

const ICONS: Record<ScopeId, ReactNode> = {
  private: <Lock className="size-3.5" />,
  "employee-shared": <Users className="size-3.5" />,
  "department-shared": <Share2 className="size-3.5" />,
  "company-shared": <Building2 className="size-3.5" />,
};

/** How often the pane asks the sidecar whether a watched root changed. */
const STATUS_POLL_MS = 3000;

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

type StatusMap = Partial<Record<ScopeId, ScopeStatus>>;

function toMap(list: ScopeStatus[]): StatusMap {
  const m: StatusMap = {};
  for (const s of list) m[s.scope] = s;
  return m;
}

export function ComputerPane() {
  const selected = useLocalBot((s) => s.ui.selectedBotId);
  const bots = useLocalBot((s) => s.bots);
  const bot = bots.find((b) => b.id === selected) ?? null;
  const folders = useLocalBot((s) => s.folders);
  const show = useLocalBot((s) => s.ui.showComputer);

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
  return <ComputerBody agentName={bot.name} privatePath={bot.privatePath} botScopes={bot.scopes} />;
}

function ComputerBody({
  agentName,
  privatePath,
  botScopes,
}: {
  agentName: string;
  privatePath: string;
  botScopes: ScopeId[];
}) {
  const previewPath = useLocalBot((s) => s.ui.previewPath);
  const folders = useLocalBot((s) => s.folders)!;
  const setUi = useLocalBot((s) => s.setUi);
  const diskEpoch = useLocalBot((s) => s.diskEpoch);

  const [statuses, setStatuses] = useState<StatusMap>({});
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Watch / poll: the sidecar owns the watchers; the pane only asks whether a
  // root's version moved and re-lists that section when it did.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const r = await scopesStatus().catch(() => null);
      if (cancelled || !r || !r.ok) return;
      setStatuses(toMap(r.scopes));
    };
    void tick();
    const id = window.setInterval(() => void tick(), STATUS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [folders]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setNotice(null);
    const r = await browseRefresh().catch(() => null);
    if (!alive.current) return;
    if (r && r.ok) setStatuses(toMap(r.scopes));
    else setNotice(r && !r.ok ? r.error : "Refresh failed.");
    setRefreshEpoch((n) => n + 1);
    setRefreshing(false);
  }, []);

  const scopes = configuredScopes(folders);
  const preview = splitPreview(previewPath);
  const reveal = canRevealPath();

  const copyPath = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const revealScoped = async (scope: ScopeId, relPath: string) => {
    setNotice(null);
    const r = await browseHostPath({ data: { scope, relPath, agentName } });
    if (!r.ok) {
      setNotice(r.error);
      return;
    }
    if (!r.exists) {
      setNotice("Not on disk yet.");
      return;
    }
    const shown = await revealPath(r.hostPath);
    if (!shown.ok) setNotice(shown.error ?? "Could not reveal.");
  };

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-t border-border bg-surface shadow-[0_0_0_1px_var(--color-border),-16px_0_40px_rgb(0_0_0/0.35)] md:border-t-0 md:border-l">
      <div className="flex h-12 items-center justify-between px-3">
        <p className="font-mono text-[10px] tracking-wider text-subtle uppercase">
          Computer
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh"
            title="Refresh — re-list every folder"
            disabled={refreshing}
            onClick={() => void refresh()}
            data-testid="computer-refresh"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close computer"
            onClick={() => setUi({ showComputer: false })}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      {notice && (
        <p className="mx-2 mb-2 rounded-sm bg-raised px-2 py-1 text-[11px] text-muted" role="status">
          {notice}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
        {scopes.map((scope) => {
          const st = statuses[scope];
          return (
            <ScopeSection
              key={scope}
              scope={scope}
              agentName={agentName}
              granted={botScopes.includes(scope)}
              hostPath={scope === "private" ? privatePath : folderFor(folders, scope) ?? ""}
              status={st}
              epoch={diskEpoch + refreshEpoch + (st?.version ?? 0)}
              onCopy={copyPath}
              onReveal={reveal ? () => void revealScoped(scope, "") : null}
            />
          );
        })}
        {preview && statuses[preview.scope]?.status !== "disconnected" && (
          <ScopedPreview
            scope={preview.scope}
            relPath={preview.relPath}
            agentName={agentName}
            epoch={diskEpoch + refreshEpoch + (statuses[preview.scope]?.version ?? 0)}
            onReveal={reveal ? () => void revealScoped(preview.scope, preview.relPath) : null}
          />
        )}
      </div>
      <div className="border-t border-border px-3 py-2">
        {reveal ? (
          <button
            type="button"
            onClick={() => void revealScoped("private", "")}
            className="w-full text-left font-mono text-[10px] leading-relaxed text-subtle hover:text-muted"
            title={privatePath}
          >
            {revealLabel()} — this agent's private folder
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void copyPath(privatePath)}
            className="w-full text-left font-mono text-[10px] leading-relaxed text-subtle hover:text-muted"
            title={privatePath}
          >
            Copy path — this agent's private folder location
          </button>
        )}
      </div>
    </aside>
  );
}

function ScopeSection({
  scope,
  agentName,
  granted,
  hostPath,
  status,
  epoch,
  onCopy,
  onReveal,
}: {
  scope: ScopeId;
  agentName: string;
  granted: boolean;
  hostPath: string;
  status: ScopeStatus | undefined;
  epoch: number;
  onCopy: (text: string) => void;
  onReveal: (() => void) | null;
}) {
  const disconnected = status?.status === "disconnected";
  return (
    <div className="mb-3" data-scope={scope} data-status={status?.status ?? "unknown"}>
      <div className="mb-1 flex items-center justify-between px-1">
        <p
          className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-subtle uppercase"
          title={status ? `${status.mode === "watch" ? "OS events + safety poll" : "metadata poll"} · checked ${status.checkedAt}` : undefined}
        >
          {ICONS[scope]}
          {SCOPE_META[scope].short}
          {status && (
            <span className="rounded-full bg-raised px-1 py-px font-mono text-[8px] normal-case tracking-normal text-subtle">
              {status.mode}
            </span>
          )}
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
          {onReveal && !disconnected && (
            <button
              type="button"
              className="font-mono text-[9px] text-subtle hover:text-muted"
              title={`${revealLabel()}: ${hostPath}`}
              onClick={onReveal}
            >
              reveal
            </button>
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
      {disconnected ? (
        <div
          className="mx-1 flex items-start gap-2 rounded-sm bg-raised px-2 py-1.5 text-[11px] text-fg"
          role="alert"
          data-testid={`scope-disconnected-${scope}`}
        >
          <Unplug className="mt-0.5 size-3.5 shrink-0 text-subtle" />
          <div>
            <p className="font-medium">Disconnected</p>
            <p className="text-subtle">{status?.error ?? "Folder is not reachable."}</p>
            <p className="mt-0.5 font-mono text-[10px] break-all text-subtle" title={hostPath}>
              {hostPath}
            </p>
          </div>
        </div>
      ) : (
        <FileTree scope={scope} relPath="" agentName={agentName} epoch={epoch} depth={0} />
      )}
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
  const [error, setError] = useState<{ message: string; code: string } | null>(null);

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
      setError({ message: r.error, code: r.code });
    });
    return () => {
      cancelled = true;
    };
  }, [scope, relPath, agentName, epoch]);

  if (error) {
    if (error.code === "DISCONNECTED") {
      return (
        <p className="px-2 py-1 text-[11px] text-fg" role="alert">
          Disconnected — {error.message}
        </p>
      );
    }
    return (
      <p className="px-2 py-1 text-[11px] text-subtle">
        {/No such directory/i.test(error.message) ? "Folder not created yet." : error.message}
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
  onReveal,
}: {
  scope: ScopeId;
  relPath: string;
  agentName: string;
  epoch: number;
  onReveal: (() => void) | null;
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
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="truncate font-mono text-[10px] text-subtle">
          {scope}/{relPath}
        </p>
        {onReveal && (
          <button
            type="button"
            className="shrink-0 font-mono text-[9px] text-subtle hover:text-muted"
            onClick={onReveal}
          >
            {revealLabel().toLowerCase()}
          </button>
        )}
      </div>
      <pre className="max-h-48 overflow-auto font-mono text-[11px] leading-relaxed text-muted whitespace-pre-wrap">
        {text}
      </pre>
    </div>
  );
}
