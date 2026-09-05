/**
 * Stage 14 — Plugins screen. DSH / Cordis plugins for LocalBot's isolated
 * `DSH_HOME` (`{dataDir}/dsh-home`), profile `acp`. Not a store: the Catalog
 * tab is the checked-in `catalog/dsh-plugins.json`; the Installed tab is what
 * `profiles/acp/package.json` + the profile user layer + a real
 * `dsh --dump-config` say. Add / Remove / Enable / Disable go through the
 * `plugins*` server functions, which spawn the pinned dsh; their exit code
 * and stderr are shown verbatim (including dsh's own "pnpm not found").
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Puzzle, RefreshCw, Search, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { filterCatalog, filterInstalled, packageNameOfSpec, type CatalogRisk, type InstalledPlugin } from "@/lib/plugins-model";
import {
  pluginsAdd,
  pluginsCatalog,
  pluginsInstalled,
  pluginsRemove,
  pluginsSetEnabled,
  type PluginsCatalogResult,
  type PluginsInstalledResult,
} from "@/lib/runtime/plugins";
import { useLocalBot } from "@/lib/store";
import { Button } from "@/components/ui/button";

const TABS = [
  ["catalog", "Catalog"],
  ["installed", "Installed"],
] as const;

/** A double-click on "Add anyway…" must not also count as the confirmation. */
export const ARM_DELAY_MS = 800;

type Outcome = {
  tone: "ok" | "warn" | "error";
  title: string;
  lines: string[];
  command?: string;
};

export function PluginsDialog() {
  const open = useLocalBot((s) => s.ui.showPlugins);
  const tab = useLocalBot((s) => s.ui.pluginsTab);
  const setUi = useLocalBot((s) => s.setUi);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<PluginsCatalogResult | null>(null);
  const [installed, setInstalled] = useState<PluginsInstalledResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [manual, setManual] = useState("");
  /** Dangerous catalog entries need a second, separately placed click, and not within ARM_DELAY_MS of the first. */
  const [armed, setArmedState] = useState<{ id: string; at: number } | null>(null);
  const setArmed = useCallback((id: string | null) => setArmedState(id ? { id, at: Date.now() } : null), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [c, i] = await Promise.all([pluginsCatalog(), pluginsInstalled({ data: {} })]);
    setCatalog(c);
    setInstalled(i);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const installedNames = useMemo(() => new Set(installed?.ok ? installed.report.plugins.map((p) => p.name) : []), [installed]);

  const runAdd = async (spec: string, label: string) => {
    setBusyName(label);
    setOutcome(null);
    const r = await pluginsAdd({ data: { spec } });
    setBusyName(null);
    setArmed(null);
    if (!r.ok) {
      setOutcome({ tone: "error", title: r.code === "BUSY" ? "Busy — nothing changed" : "Refused — nothing changed", lines: [r.error] });
      return;
    }
    const m = r.result;
    const lines = [
      `exit ${m.code ?? "signal"} · ${m.name}`,
      ...(m.stderr ? m.stderr.split("\n") : []),
      ...(m.stdout ? m.stdout.split("\n") : []),
    ];
    if (m.ok) {
      lines.push(
        `profiles/acp/package.json → dsh.profile.bundles: ${m.bundlesAfter.join(", ")}`,
        m.libraryOnly ? "Installed as a plain dependency (no dsh.bundle) — it adds no rows to the Harness." : "Bundle added.",
        m.guard?.checked ? "Checked with dsh --dump-config: hosted / telemetry / web / fs-sandbox still disabled." : "",
        harnessLine(m.harness),
      );
      setOutcome({ tone: m.libraryOnly ? "warn" : "ok", title: `Added ${m.name}`, lines, command: m.command });
    } else {
      if (m.guard?.rolledBack) lines.push(`dsh.profile.bundles now: ${m.bundlesAfter.join(", ")}`, harnessLine(m.harness));
      setOutcome({ tone: "error", title: m.guard && m.guard.offenders.length > 0 ? m.error ?? "Refused" : `Add failed: ${m.error ?? "see output"}`, lines, command: m.command });
    }
    await refresh();
  };

  const runRemove = async (name: string) => {
    setBusyName(name);
    setOutcome(null);
    const r = await pluginsRemove({ data: { name } });
    setBusyName(null);
    if (!r.ok) {
      setOutcome({ tone: "error", title: r.code === "BUSY" ? "Busy — nothing changed" : "Refused — nothing changed", lines: [r.error] });
      return;
    }
    const m = r.result;
    const lines = [`exit ${m.code ?? "signal"}`, ...(m.stderr ? m.stderr.split("\n") : []), ...(m.stdout ? m.stdout.split("\n") : [])];
    if (m.ok) lines.push(`dsh.profile.bundles: ${m.bundlesAfter.join(", ")}`, harnessLine(m.harness));
    setOutcome({ tone: m.ok ? "ok" : "error", title: m.ok ? `Removed ${m.name}` : `Remove failed: ${m.error ?? "see output"}`, lines, command: m.command });
    await refresh();
  };

  const runToggle = async (p: InstalledPlugin) => {
    setBusyName(p.name);
    setOutcome(null);
    const r = await pluginsSetEnabled({ data: { name: p.name, enabled: !p.enabled } });
    setBusyName(null);
    if (!r.ok) {
      setOutcome({ tone: "error", title: r.code === "BUSY" ? "Busy — nothing changed" : "Refused — nothing changed", lines: [r.error] });
      return;
    }
    const e = r.result;
    setOutcome({
      tone: e.ok ? "ok" : "error",
      title: e.ok ? `${e.enabled ? "Enabled" : "Disabled"} ${e.name}` : e.error ?? `Could not verify ${e.name} in --dump-config`,
      lines: [
        `${e.enabled ? "Removed" : "Wrote"} disabled: true for ${e.ids.join(", ")} in ${e.file}`,
        e.dumpError ? e.dumpError : `Verified with dsh --dump-config: ${e.verified ? "yes" : "no"}`,
        harnessLine(e.harness),
      ],
    });
    await refresh();
  };

  if (!open) return null;

  const catalogEntries = catalog?.ok ? filterCatalog(catalog.entries, query) : [];
  const installedEntries = installed?.ok ? filterInstalled(installed.report.plugins, query) : [];
  const report = installed?.ok ? installed.report : null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-bg/70 p-3 pt-[8vh] backdrop-blur-[2px] md:p-6" data-testid="plugins-dialog">
      <div className="flex max-h-[84dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4">
          <div className="flex items-center gap-1">
            <Puzzle className="mr-1 size-4 text-muted" />
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-testid={`plugins-tab-${id}`}
                onClick={() => setUi({ pluginsTab: id })}
                className={`h-12 shrink-0 px-3 text-sm ${tab === id ? "text-fg" : "text-muted hover:text-fg"}`}
              >
                {label}
                {id === "installed" && report && report.plugins.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-raised px-1.5 text-[10px] text-muted">{report.plugins.length}</span>
                )}
                {tab === id && <span className="mt-1 block h-0.5 rounded-full bg-accent" />}
              </button>
            ))}
          </div>
          <label className="relative block min-w-0 flex-1 max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search plugins"
              placeholder="Search catalog and installed"
              data-testid="plugins-search"
              className="h-8 w-full rounded-md bg-bg pr-2 pl-8 text-sm text-fg placeholder:text-subtle outline-none ring-1 ring-border focus:ring-accent [&::-webkit-search-cancel-button]:hidden"
            />
          </label>
          <Button variant="ghost" size="icon-sm" aria-label="Refresh plugins" title="Re-read the profile and run dsh --dump-config" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Close plugins" onClick={() => setUi({ showPlugins: false })}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
          {report && !report.pnpm.found && (
            <p className="mb-4 rounded-md bg-danger/10 p-3 text-xs leading-relaxed text-danger shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_40%,transparent)]" data-testid="plugins-pnpm-missing">
              pnpm is not on PATH. dsh manages profile plugins by forwarding to pnpm, so Add and Remove will exit 127 with dsh's own
              "pnpm not found on PATH" until pnpm is installed. This packaged LocalBot does not bundle pnpm. Enable / Disable and this list still work.
            </p>
          )}
          {tab === "catalog" && (
            <CatalogPane
              catalog={catalog}
              entries={catalogEntries}
              query={query}
              installedNames={installedNames}
              busyName={busyName}
              armed={armed}
              setArmed={setArmed}
              onAdd={(spec, label) => void runAdd(spec, label)}
            />
          )}
          {tab === "installed" && (
            <InstalledPane
              installed={installed}
              entries={installedEntries}
              query={query}
              busyName={busyName}
              onToggle={(p) => void runToggle(p)}
              onRemove={(name) => void runRemove(name)}
            />
          )}
          {outcome && <OutcomeCard outcome={outcome} onDismiss={() => setOutcome(null)} />}
        </div>

        <form
          className="flex items-center gap-2 border-t border-border p-3"
          data-testid="plugins-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            const spec = manual.trim();
            if (!spec) return;
            void runAdd(spec, spec).then(() => setManual(""));
          }}
        >
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            aria-label="Add by package name or absolute local path"
            placeholder="Add by package name (@scope/name@version) or absolute local path"
            data-testid="plugins-add-input"
            spellCheck={false}
            className="h-9 min-w-0 flex-1 rounded-md bg-bg px-3 font-mono text-xs text-fg placeholder:text-subtle outline-none ring-1 ring-border focus:ring-accent"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={!manual.trim() || busyName !== null} data-testid="plugins-add-submit">
            {busyName !== null ? "Working…" : "Add"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function harnessLine(h: "stopped" | "not-running" | null): string {
  if (h === "stopped") return "DeepSeek Harness was stopped; the next message boots the new composition (acp profile is patchReload: startup).";
  if (h === "not-running") return "DeepSeek Harness was not running; the next message boots the new composition.";
  return "";
}

function RiskBadge({ risk }: { risk: CatalogRisk }) {
  const meta: Record<CatalogRisk, { label: string; cls: string; icon: ReactNode }> = {
    safe: { label: "safe", cls: "bg-accent/15 text-accent", icon: <ShieldCheck className="size-3" /> },
    "needs-permission": { label: "needs permission", cls: "bg-raised text-muted", icon: <ShieldAlert className="size-3" /> },
    dangerous: { label: "dangerous", cls: "bg-danger/15 text-danger", icon: <AlertTriangle className="size-3" /> },
  };
  const m = meta[risk];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${m.cls}`} data-risk={risk}>
      {m.icon}
      {m.label}
    </span>
  );
}

function CatalogPane({
  catalog,
  entries,
  query,
  installedNames,
  busyName,
  armed,
  setArmed,
  onAdd,
}: {
  catalog: PluginsCatalogResult | null;
  entries: (NonNullable<Extract<PluginsCatalogResult, { ok: true }>>["entries"]);
  query: string;
  installedNames: Set<string>;
  busyName: string | null;
  armed: { id: string; at: number } | null;
  setArmed: (id: string | null) => void;
  onAdd: (spec: string, label: string) => void;
}) {
  // Re-render once the arm delay has passed so the confirm button enables.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => tick((n) => n + 1), ARM_DELAY_MS + 20);
    return () => clearTimeout(t);
  }, [armed]);
  if (!catalog) return <p className="text-sm text-muted">Reading catalog…</p>;
  if (!catalog.ok) {
    return (
      <p className="rounded-md bg-danger/10 p-3 text-xs text-danger" data-testid="plugins-catalog-error">
        Catalog could not be read: {catalog.error}
      </p>
    );
  }
  return (
    <div className="space-y-3" data-testid="plugins-catalog">
      <p className="text-sm leading-relaxed text-muted">
        Curated DeepSeek Harness plugin bundles from <span className="font-mono text-xs">catalog/dsh-plugins.json</span> — a file shipped with LocalBot, not a
        store. Adding runs <span className="font-mono text-xs">dsh plugin --profile acp add</span> in LocalBot's own DSH_HOME. LocalBot's overlays compose
        after every plugin, so hosted models, telemetry and web tools stay off and file tools stay inside your folder scopes whatever a plugin asks for.
      </p>
      {entries.length === 0 && (
        <p className="py-6 text-sm text-muted" data-testid="plugins-catalog-empty">
          {query.trim() ? `Nothing in the catalog matches “${query.trim()}”.` : "The catalog is empty."}
        </p>
      )}
      <ul className="space-y-2">
        {entries.map((e) => {
          const pkgName = e.install.kind === "npm" ? packageNameOfSpec(e.install.spec) : e.id;
          const isInstalled = installedNames.has(pkgName);
          const working = busyName === e.id || busyName === e.installSpec;
          const dangerous = e.risk === "dangerous";
          const isArmed = armed?.id === e.id;
          const armReady = isArmed && Date.now() - armed!.at >= ARM_DELAY_MS;
          return (
            <li key={e.id} className="rounded-md px-3 py-2.5 shadow-[0_0_0_1px_var(--color-border)]" data-testid="plugins-catalog-row" data-plugin-id={e.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{e.name}</span>
                    <RiskBadge risk={e.risk} />
                    <span className="font-mono text-[10px] text-subtle">{e.install.kind === "npm" ? e.install.spec : `dsh/${e.install.spec}`}</span>
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">{e.summary}</p>
                  {e.verified && <p className="mt-1 text-[11px] text-subtle">Verified: {e.verified}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {isInstalled ? (
                    <span className="font-mono text-[10px] text-subtle">Installed</span>
                  ) : dangerous ? (
                    <Button size="sm" variant="danger" disabled={busyName !== null || isArmed} onClick={() => setArmed(e.id)} data-testid="plugins-catalog-arm">
                      {working ? "Adding…" : "Add anyway…"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" disabled={busyName !== null} onClick={() => onAdd(e.installSpec, e.id)} data-testid="plugins-catalog-add">
                      {working ? "Adding…" : "Add"}
                    </Button>
                  )}
                </div>
              </div>
              {e.risk === "needs-permission" && (
                <p className="mt-2 text-[11px] text-muted">Tools this adds still run behind the Allow / Deny cards and LocalBot's folder scopes.</p>
              )}
              {dangerous && isArmed && !isInstalled && (
                // The confirmation sits below the row, not under the pointer, and only enables after ARM_DELAY_MS.
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-danger/10 px-3 py-2 text-[11px] text-danger" data-testid="plugins-catalog-confirm">
                  <span>
                    Marked dangerous. If it re-enables a hosted, telemetry, web or fs-sandbox row, LocalBot refuses and removes it again. Add {e.name}?
                  </span>
                  <span className="flex items-center gap-2">
                    <button type="button" className="text-subtle hover:text-fg" onClick={() => setArmed(null)}>
                      Cancel
                    </button>
                    <Button size="sm" variant="danger" disabled={busyName !== null || !armReady} onClick={() => onAdd(e.installSpec, e.id)} data-testid="plugins-catalog-add">
                      Yes, add it
                    </Button>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function InstalledPane({
  installed,
  entries,
  query,
  busyName,
  onToggle,
  onRemove,
}: {
  installed: PluginsInstalledResult | null;
  entries: InstalledPlugin[];
  query: string;
  busyName: string | null;
  onToggle: (p: InstalledPlugin) => void;
  onRemove: (name: string) => void;
}) {
  if (!installed) return <p className="text-sm text-muted">Reading the acp profile and running dsh --dump-config…</p>;
  if (!installed.ok) {
    return (
      <p className="rounded-md bg-danger/10 p-3 text-xs text-danger" data-testid="plugins-installed-error">
        {installed.error}
      </p>
    );
  }
  const r = installed.report;
  return (
    <div className="space-y-4" data-testid="plugins-installed">
      <div className="rounded-md bg-raised p-3 text-xs shadow-[0_0_0_1px_var(--color-border)]">
        <p className="break-all font-mono text-[11px] text-muted">{r.profileDir}</p>
        <p className="mt-1 text-muted">
          {r.manifestExists ? `Profile manifest present · bundles: ${r.bundles.join(", ")}` : "Profile not initialized yet — dsh writes it on first boot or first plugin add."}
        </p>
        <p className="mt-1 text-muted" data-testid="plugins-dump-status">
          {r.dump.ok
            ? `dsh --dump-config: ${r.dump.layers.length} layers · hosted / telemetry / web / fs-sandbox ${r.guardsHold ? "still disabled" : "NOT all disabled"}`
            : `dsh --dump-config failed: ${r.dump.error ?? "unknown"}`}
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium">Built in</h2>
        <ul className="space-y-1.5" data-testid="plugins-built-in">
          {r.builtIn.map((b) => (
            <li key={b.name} className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-xs shadow-[0_0_0_1px_var(--color-border)]">
              <span className="min-w-0">
                <span className="font-mono text-fg">{b.name}</span>
                <span className="ml-2 text-subtle">{b.kind === "bundle" ? "profile template bundle" : "LocalBot overlay (--patch, composes last)"}</span>
              </span>
              <span className="shrink-0 font-mono text-[10px] text-subtle">not removable</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium">Added plugins</h2>
        {r.plugins.length === 0 ? (
          <p className="rounded-md px-3 py-6 text-center text-sm text-muted shadow-[0_0_0_1px_var(--color-border)]" data-testid="plugins-installed-empty">
            No plugins besides LocalBot's own overlay. Add one from the Catalog or by package name below.
          </p>
        ) : entries.length === 0 ? (
          <p className="py-4 text-sm text-muted">No installed plugin matches “{query.trim()}”.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((p) => {
              const working = busyName === p.name;
              return (
                <li key={p.name} className="rounded-md px-3 py-2.5 shadow-[0_0_0_1px_var(--color-border)]" data-testid="plugins-installed-row" data-plugin-name={p.name} data-enabled={p.enabled}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-mono font-medium">{p.name}</span>
                        {p.version && <span className="font-mono text-[10px] text-subtle">v{p.version}</span>}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${p.enabled ? "bg-accent/15 text-accent" : "bg-raised text-muted"}`}>
                          {p.enabled ? "enabled" : "disabled"}
                        </span>
                        {!p.isBundle && <span className="rounded-full bg-raised px-2 py-0.5 text-[10px] text-muted">library — no dsh.bundle, adds no rows</span>}
                      </p>
                      <p className="mt-1 break-all font-mono text-[11px] text-subtle">{p.spec || "(in bundles, no dependency entry)"}</p>
                      <p className="mt-1 text-[11px] text-muted">
                        {p.isBundle
                          ? p.rowIds.length
                            ? `Inserts ${p.rowIds.length} row${p.rowIds.length === 1 ? "" : "s"}: ${p.rowIds.join(", ")}`
                            : "Patches other layers only (no rows of its own)."
                          : "Nothing composes from this package."}
                        {p.dumpRows.length > 0 && ` · in --dump-config: ${p.dumpRows.map((d) => `${d.id ?? "?"}${d.disabled ? " (disabled)" : ""}`).join(", ")}`}
                        {!p.inBundles && p.isBundle && " · not in dsh.profile.bundles"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button size="sm" variant="secondary" disabled={busyName !== null || !p.isBundle || p.rowIds.length === 0} onClick={() => onToggle(p)} data-testid="plugins-toggle" title={p.rowIds.length === 0 ? "Nothing to turn off" : undefined}>
                        {working ? "…" : p.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button size="sm" variant="danger" disabled={busyName !== null} onClick={() => onRemove(p.name)} data-testid="plugins-remove">
                        {working ? "…" : "Remove"}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function OutcomeCard({ outcome, onDismiss }: { outcome: Outcome; onDismiss: () => void }) {
  const cls =
    outcome.tone === "ok"
      ? "bg-raised text-fg shadow-[0_0_0_1px_var(--color-border)]"
      : outcome.tone === "warn"
        ? "bg-raised text-fg shadow-[0_0_0_1px_var(--color-border)]"
        : "bg-danger/10 text-danger shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_40%,transparent)]";
  return (
    <div className={`mt-4 rounded-md p-3 text-xs ${cls}`} data-testid="plugins-outcome" data-tone={outcome.tone}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{outcome.title}</p>
        <button type="button" className="shrink-0 text-subtle hover:text-fg" aria-label="Dismiss" onClick={onDismiss}>
          ×
        </button>
      </div>
      {outcome.command && <p className="mt-1 break-all font-mono text-[10px] text-subtle">$ {outcome.command}</p>}
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted scrollbar-thin">{outcome.lines.filter(Boolean).join("\n")}</pre>
    </div>
  );
}
