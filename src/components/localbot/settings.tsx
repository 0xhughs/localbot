import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { CATALOG, getCatalogModel, onboardingCards } from "@/lib/catalog";
import { scanBrowserHardware } from "@/lib/hardware";
import { useLocalBot } from "@/lib/store";
import { AGENT_COLOR_LIST, type FolderGrant } from "@/lib/types";
import { describeBind } from "@/runtime/loopback";
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
      <Field label="LocalBot home">
        <p className="font-mono text-xs text-muted">
          ~/.localbot · app config, models, sessions, logs
        </p>
      </Field>
      <p className="text-sm leading-relaxed text-muted">
        Uninstalling LocalBot does not delete the company root. Your files stay
        on disk.
      </p>
      <Button variant="danger" onClick={() => resetAll()}>
        Reset this workspace
      </Button>
    </div>
  );
}

function ModelsPane() {
  const models = useLocalBot((s) => s.models);
  const hardware = useLocalBot((s) => s.hardware);
  const setHardware = useLocalBot((s) => s.setHardware);
  const completeDownload = useLocalBot((s) => s.completeDownload);
  const importGguf = useLocalBot((s) => s.importGguf);
  const updateBot = useLocalBot((s) => s.updateBot);
  const selected = useLocalBot((s) => s.ui.selectedBotId);
  const fileRef = useRef<HTMLInputElement>(null);
  const report = hardware ?? scanBrowserHardware();
  const cards = onboardingCards(report);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Downloaded</h2>
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
          Import GGUF
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".gguf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importGguf(f.name, f.size);
            e.target.value = "";
          }}
        />
      </div>
      {models.length === 0 && <p className="text-sm text-muted">No models yet.</p>}
      <ul className="space-y-2">
        {models.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded-md bg-raised px-3 py-2 shadow-[0_0_0_1px_var(--color-border)]"
          >
            <div>
              <p className="text-sm">{getCatalogModel(m.catalogId)?.name ?? m.filename}</p>
              <p className="font-mono text-[11px] text-subtle">{m.filename}</p>
            </div>
            {selected && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => updateBot(selected, { modelId: m.catalogId })}
              >
                Use on agent
              </Button>
            )}
          </li>
        ))}
      </ul>
      <h2 className="text-sm font-medium">Catalog</h2>
      <ul className="space-y-2">
        {CATALOG.map((m) => {
          const fit = cards.fits[m.id];
          const have = models.some((d) => d.catalogId === m.id);
          return (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-md px-3 py-2 shadow-[0_0_0_1px_var(--color-border)]"
            >
              <div>
                <p className="text-sm">{m.name}</p>
                <p className="text-[11px] text-muted">{fit?.reason}</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={!fit?.fits || have}
                onClick={() => void completeDownload(m.id)}
              >
                {have ? "Ready" : fit?.fits ? "Download" : "Won't fit"}
              </Button>
            </li>
          );
        })}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setHardware(scanBrowserHardware())}
      >
        Re-scan hardware
      </Button>
      <p className="text-xs text-muted">
        Ollama is not required. If it is already running on a desktop install,
        Settings can attach to it as an advanced option.
      </p>
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
  const models = useLocalBot((s) => s.models);

  return (
    <div className="space-y-5">
      <Field label="Company root">
        <p className="font-mono text-xs leading-relaxed text-muted">
          {company?.root ?? "—"}
        </p>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-accent"
          checked={settings.companyRootIsShared}
          onChange={(e) => setCompanyRootShared(e.target.checked)}
        />
        This path is a shared drive
      </label>
      {!settings.companyRootIsShared && (
        <p className="text-xs text-muted">
          Shared departments require a shared folder path. Employee Two on
          another laptop will not see Employee One until both installs point at
          the same company root.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => createDepartment("Research")}
        >
          Add department
        </Button>
        {departments[0] && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => createEmployee(departments[0]!.id, "Teammate")}
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
              onChange={(e) => moveBotToEmployee(bot.id, e.target.value)}
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
                      setBotGrants(bot.id, next);
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
          createBot({
            name: `Agent ${bots.length + 1}`,
            job: "Generalist",
            color: AGENT_COLOR_LIST[bots.length % AGENT_COLOR_LIST.length]!.id,
            modelId: models[0]?.catalogId ?? "gemma4-e2b-q4",
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
  const bind = describeBind(runtime.bindHost, runtime.bindPort);
  const models = useLocalBot((s) => s.models);
  return (
    <div className="space-y-4">
      <Row k="Engine" v={runtime.engine} />
      <Row k="Mode" v={runtime.mode} />
      <Row k="Bind" v={`${bind.host}:${bind.port}`} />
      <Row k="Loopback only" v={bind.loopbackOnly ? "Yes" : "NO — blocked"} />
      <Row k="LAN bind" v={bind.lanBind ? "Yes" : "No"} />
      <Row k="OpenAI base" v={bind.url} />
      <Row k="Status" v={runtime.ready || models.length > 0 ? "Ready" : "Waiting for a model"} />
      <Row k="Provider keys" v="None on the default path" />
      <p className="text-sm leading-relaxed text-muted">
        UI talks to the LocalBot runtime. The runtime talks to the harness
        adapter. The adapter talks to the local OpenAI-compatible endpoint. The
        UI never calls the model directly.
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
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-accent"
          checked={settings.useExistingOllama}
          onChange={(e) => updateSettings({ useExistingOllama: e.target.checked })}
        />
        <span>
          <span className="block text-sm">Use existing Ollama</span>
          <span className="text-xs text-muted">
            Advanced. Not the default, and not required.
          </span>
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
              Off. Turns off permission cards for shell. Full host control is
              not the default profile.
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
      <span className="font-mono text-xs text-fg">{v}</span>
    </div>
  );
}
