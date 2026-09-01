import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { CATALOG } from "@/lib/catalog";
import { fsGetCompanyRoot } from "@/lib/fs/server";
import { useLocalBot } from "@/lib/store";
import { AGENT_COLOR_LIST, type FolderGrant } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TABS = [
  ["general", "General"],
  ["models", "Models"],
  ["company", "Company"],
  ["runtime", "Runtime"],
  ["safety", "Safety"],
] as const;

export function SettingsDialog() {
  const open = useLocalBot((s) => s.ui.showSettings);
  const tab = useLocalBot((s) => s.ui.settingsTab);
  const setUi = useLocalBot((s) => s.setUi);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-bg/70 p-3 pt-[8vh] backdrop-blur-[2px] md:p-6">
      <div className="flex max-h-[84dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--color-border),0_16px_40px_rgb(0_0_0/0.45)]">
        <div className="flex items-center justify-between border-b border-border px-4">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setUi({ settingsTab: id })}
                className={`h-12 shrink-0 px-3 text-sm ${
                  tab === id ? "text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {label}
                {tab === id && (
                  <span className="mt-1 block h-0.5 rounded-full bg-accent" />
                )}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close settings"
            onClick={() => setUi({ showSettings: false })}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
          {tab === "general" && <GeneralPane />}
          {tab === "models" && <ModelsPane />}
          {tab === "company" && <CompanyPane />}
          {tab === "runtime" && <RuntimePane />}
          {tab === "safety" && <SafetyPane />}
        </div>
      </div>
    </div>
  );
}

function GeneralPane() {
  const company = useLocalBot((s) => s.company);
  const employee = useLocalBot((s) => s.employees[0]);
  const renameCompany = useLocalBot((s) => s.renameCompany);
  const resetAll = useLocalBot((s) => s.resetAll);
  const preview = useLocalBot((s) => s.previewWritesToProjectData);
  return (
    <div className="space-y-5">
      <Field label="Company name">
        <Input
          defaultValue={company?.name ?? ""}
          onBlur={(e) => renameCompany(e.target.value)}
        />
      </Field>
      <Field label="Employee">
        <p className="text-sm text-fg">{employee?.displayName ?? "—"}</p>
      </Field>
      <Field label="This build">
        <p className="text-sm leading-relaxed text-muted">
          Browser app. Chat uses hosted grok-4.5. Work files live on disk at the
          company root. There is no local GGUF and no desktop installer.
        </p>
      </Field>
      {preview && (
        <p className="text-xs leading-relaxed text-muted">
          This preview writes to the project data folder.
        </p>
      )}
      <Button variant="danger" onClick={() => resetAll()}>
        Reset this workspace
      </Button>
    </div>
  );
}

function ModelsPane() {
  const selectedCatalogId = useLocalBot((s) => s.selectedCatalogId);
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-muted">
        Planned local models. Not wired in this build. Chat ignores this list and
        uses hosted grok-4.5. No GGUF is downloaded.
      </p>
      {selectedCatalogId && (
        <p className="font-mono text-xs text-muted">
          Catalog noted: {selectedCatalogId}
        </p>
      )}
      <h2 className="text-sm font-medium">Catalog</h2>
      <ul className="space-y-2">
        {CATALOG.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between gap-3 rounded-md px-3 py-2 opacity-70 shadow-[0_0_0_1px_var(--color-border)]"
          >
            <div>
              <p className="text-sm">{m.name}</p>
              <p className="text-[11px] text-muted">
                {m.sizeLabel} · {m.license} · {m.tier}
              </p>
            </div>
            <span className="font-mono text-[10px] text-subtle">Not wired</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompanyPane() {
  const departments = useLocalBot((s) => s.departments);
  const employees = useLocalBot((s) => s.employees);
  const bots = useLocalBot((s) => s.bots);
  const settings = useLocalBot((s) => s.settings);
  const company = useLocalBot((s) => s.company);
  const setCompanyRootShared = useLocalBot((s) => s.setCompanyRootShared);
  const setBotGrants = useLocalBot((s) => s.setBotGrants);
  const createBot = useLocalBot((s) => s.createBot);
  const createDepartment = useLocalBot((s) => s.createDepartment);
  const createEmployee = useLocalBot((s) => s.createEmployee);
  const moveBotToEmployee = useLocalBot((s) => s.moveBotToEmployee);
  const applyCompanyRoot = useLocalBot((s) => s.applyCompanyRoot);
  const seedFoldersHere = useLocalBot((s) => s.seedFoldersHere);
  const selectedCatalogId = useLocalBot((s) => s.selectedCatalogId);
  const preview = useLocalBot((s) => s.previewWritesToProjectData);
  const [path, setPath] = useState(company?.root ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setPath(company?.root ?? "");
    void fsGetCompanyRoot().then((cfg) => {
      if (!company?.root) setPath(cfg.companyRoot);
    });
  }, [company?.root]);

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(path);
      setMsg("Path copied.");
    } catch {
      setMsg(path);
    }
  };

  return (
    <div className="space-y-5">
      <Field label="Company root (absolute path)">
        <Input
          className="font-mono text-xs"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            const r = await applyCompanyRoot(path);
            setMsg(r.ok ? `Using ${r.root}` : r.error);
          }}
        >
          Use this path
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            const r = await seedFoldersHere();
            setMsg(r.ok ? "Folders created on disk." : r.error);
          }}
        >
          Create folders here
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void copyPath()}>
          Reveal path
        </Button>
      </div>
      {preview && (
        <p className="text-xs text-muted">
          This preview writes to the project data folder.
        </p>
      )}
      {msg && <p className="font-mono text-xs text-muted">{msg}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-accent"
          checked={settings.companyRootIsShared}
          onChange={(e) => setCompanyRootShared(e.target.checked)}
        />
        This path is a shared drive
      </label>
      <p className="text-xs text-muted">
        Two people see the same files only if this process and theirs point at
        the same real folder (NAS / Drive / shared disk) on the machine running
        the server. This checkbox only changes the copy.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void createDepartment("Research")}
        >
          Add department
        </Button>
        {departments[0] && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void createEmployee(departments[0]!.id, "Teammate")}
          >
            Add employee
          </Button>
        )}
      </div>
      <h2 className="text-sm font-medium">Agents & grants</h2>
      {bots.map((bot) => (
        <div
          key={bot.id}
          className="rounded-md bg-raised p-3 shadow-[0_0_0_1px_var(--color-border)]"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{bot.name}</p>
            <select
              className="h-8 rounded-sm bg-bg px-2 text-xs text-fg shadow-[0_0_0_1px_var(--color-border)]"
              value={bot.employeeId}
              onChange={(e) => void moveBotToEmployee(bot.id, e.target.value)}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["workspace", "output", "shared", "outbox", "company-shared"] as FolderGrant[]).map(
              (g) => {
                const on = bot.grants.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      const next = on
                        ? bot.grants.filter((x) => x !== g)
                        : [...bot.grants, g];
                      void setBotGrants(bot.id, next);
                    }}
                    className={`rounded-full px-2.5 py-1 text-[11px] ${
                      on ? "bg-accent/15 text-accent" : "bg-bg text-muted"
                    }`}
                  >
                    {g}
                  </button>
                );
              },
            )}
          </div>
        </div>
      ))}
      <Button
        size="sm"
        onClick={() =>
          void createBot({
            name: `Agent ${bots.length + 1}`,
            job: "Generalist",
            color: AGENT_COLOR_LIST[bots.length % AGENT_COLOR_LIST.length]!.id,
            modelId: selectedCatalogId ?? "gemma4-e2b-q4",
          })
        }
      >
        New agent
      </Button>
    </div>
  );
}

function RuntimePane() {
  const runtime = useLocalBot((s) => s.runtime);
  const company = useLocalBot((s) => s.company);
  return (
    <div className="space-y-4">
      <Row k="Engine" v={runtime.engine} />
      <Row k="Chat model" v={runtime.model} />
      <Row k="AI status" v={runtime.aiAvailable ? "Hosted grok-4.5" : "AI unavailable"} />
      <Row k="Company root" v={company?.root ?? "—"} />
      <p className="text-sm leading-relaxed text-muted">
        This is a browser app. Agents think with hosted grok-4.5 when the server
        has an API key. There is no local llama.cpp process and no GGUF download.
        File tools write to the company root on the machine running this server.
      </p>
    </div>
  );
}

function SafetyPane() {
  const settings = useLocalBot((s) => s.settings);
  const updateSettings = useLocalBot((s) => s.updateSettings);
  return (
    <div className="space-y-5">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-accent"
          checked={settings.webSearchEnabled}
          onChange={(e) => updateSettings({ webSearchEnabled: e.target.checked })}
        />
        <span>
          <span className="block text-sm">Web search</span>
          <span className="text-xs text-muted">Off by default. Network always asks.</span>
        </span>
      </label>
      <div className="rounded-md bg-danger/10 p-3 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_40%,transparent)]">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-danger"
            checked={settings.controlThisComputer}
            onChange={(e) =>
              updateSettings({ controlThisComputer: e.target.checked })
            }
          />
          <span>
            <span className="block text-sm text-danger">Control this computer</span>
            <span className="text-xs text-muted">
              Off. Turns off permission cards for the workspace shell. Still
              scoped to the company root.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2">
      <span className="text-xs text-muted">{k}</span>
      <span className="max-w-[70%] text-right font-mono text-xs break-all text-fg">{v}</span>
    </div>
  );
}
