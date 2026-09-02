import { useEffect, useState } from "react";
import { FolderOpen, FolderPlus, Check, X, AlertTriangle } from "lucide-react";
import { canPickFolder, pickFolder } from "@/lib/desktop-bridge";
import { foldersSuggest, foldersValidate } from "@/lib/fs/server";
import { SCOPE_IDS, SCOPE_META, type FoldersConfig, type ScopeId } from "@/lib/fs/scope-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Check = Awaited<ReturnType<typeof foldersValidate>>;

type FoldersDraft = Record<ScopeId, string | null>;

function draftFromConfig(cfg: FoldersConfig | null): FoldersDraft {
  return {
    private: cfg?.employeeRoot ?? "",
    "employee-shared": cfg?.employeeShared ?? null,
    "department-shared": cfg?.departmentShared ?? null,
    "company-shared": cfg?.companyShared ?? null,
  };
}

function configFromDraft(d: FoldersDraft): FoldersConfig {
  const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
  return {
    employeeRoot: (d.private ?? "").trim(),
    employeeShared: clean(d["employee-shared"]),
    departmentShared: clean(d["department-shared"]),
    companyShared: clean(d["company-shared"]),
  };
}

export function FolderField({
  scope,
  value,
  onChange,
  check,
}: {
  scope: ScopeId;
  value: string | null;
  onChange: (v: string | null) => void;
  check: Check | null;
}) {
  const meta = SCOPE_META[scope];
  const native = canPickFolder();
  const skipped = value === null;

  return (
    <div className="rounded-lg bg-surface p-3 shadow-[0_0_0_1px_var(--color-border)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-fg">
            {meta.label}
            <span className="ml-2 font-mono text-[10px] tracking-wider text-subtle uppercase">
              {meta.required ? "required" : "optional"}
            </span>
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{meta.blurb}</p>
        </div>
        {!meta.required && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(skipped ? "" : null)}
            aria-label={skipped ? `Connect ${meta.label}` : `Skip ${meta.label}`}
          >
            {skipped ? "Connect" : "Skip"}
          </Button>
        )}
      </div>
      {skipped ? (
        <p className="mt-2 font-mono text-[11px] text-subtle">Not connected. Agents will not see a {scope}/ folder.</p>
      ) : (
        <>
          <div className="mt-2 flex gap-2">
            <Input
              className="font-mono text-xs"
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={native ? "Choose a folder…" : "/absolute/path"}
              aria-label={`${meta.label} path`}
            />
            {native ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  const picked = await pickFolder({
                    title: `Choose: ${meta.label}`,
                    defaultPath: value || undefined,
                  });
                  if (picked) onChange(picked);
                }}
              >
                <FolderOpen className="size-3.5" />
                Choose…
              </Button>
            ) : (
              <span
                className="shrink-0 self-center rounded-full bg-raised px-2 py-0.5 font-mono text-[10px] text-subtle"
                title="The OS folder dialog is only available in the desktop app."
              >
                preview only
              </span>
            )}
          </div>
          {check && (
            <p
              className={`mt-1.5 flex items-center gap-1.5 font-mono text-[11px] ${
                check.ok ? (check.writable ? "text-muted" : "text-danger") : "text-subtle"
              }`}
            >
              {check.ok ? (
                check.writable ? (
                  <Check className="size-3" />
                ) : (
                  <AlertTriangle className="size-3" />
                )
              ) : (
                <X className="size-3" />
              )}
              {check.ok
                ? check.writable
                  ? "Folder exists and is writable."
                  : "Folder exists but is read-only."
                : check.error ?? "Not found."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function FoldersForm({
  initial,
  names,
  submitLabel,
  busy,
  error,
  onSubmit,
  footer,
}: {
  initial: FoldersConfig | null;
  names: { company: string; department: string; employee: string };
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (folders: FoldersConfig, create: boolean) => void | Promise<void>;
  footer?: React.ReactNode;
}) {
  const [draft, setDraft] = useState<FoldersDraft>(() => draftFromConfig(initial));
  const [create, setCreate] = useState(false);
  const [checks, setChecks] = useState<Partial<Record<ScopeId, Check | null>>>({});

  useEffect(() => {
    setDraft(draftFromConfig(initial));
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(() => {
      void Promise.all(
        SCOPE_IDS.map(async (scope) => {
          const v = draft[scope];
          if (!v || !v.trim()) return [scope, null] as const;
          const r = await foldersValidate({ data: { path: v } });
          return [scope, r] as const;
        }),
      ).then((pairs) => {
        if (cancelled) return;
        setChecks(Object.fromEntries(pairs) as Partial<Record<ScopeId, Check | null>>);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [draft]);

  const cfg = configFromDraft(draft);
  const canSubmit = Boolean(cfg.employeeRoot) && !busy;
  const missing = SCOPE_IDS.filter((s) => {
    const v = draft[s];
    return v && v.trim() && checks[s] && !checks[s]!.ok;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            const s = await foldersSuggest({
              data: {
                companyName: names.company,
                departmentName: names.department,
                employeeName: names.employee,
              },
            });
            setDraft(draftFromConfig(s));
            setCreate(true);
          }}
        >
          <FolderPlus className="size-3.5" />
          Create my folders (suggested layout)
        </Button>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            className="size-3.5 accent-accent"
            checked={create}
            onChange={(e) => setCreate(e.target.checked)}
          />
          Create missing folders
        </label>
      </div>
      {SCOPE_IDS.map((scope) => (
        <FolderField
          key={scope}
          scope={scope}
          value={draft[scope]}
          onChange={(v) => setDraft((d) => ({ ...d, [scope]: v }))}
          check={checks[scope] ?? null}
        />
      ))}
      {missing.length > 0 && !create && (
        <p className="text-xs text-muted">
          {missing.length === 1 ? "One folder does" : `${missing.length} folders do`} not exist yet.
          Tick “Create missing folders” to make {missing.length === 1 ? "it" : "them"}, or pick an
          existing folder.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!canSubmit} onClick={() => void onSubmit(cfg, create)}>
          <Check className="size-4" />
          {busy ? "Saving…" : submitLabel}
        </Button>
        {footer}
      </div>
    </div>
  );
}
