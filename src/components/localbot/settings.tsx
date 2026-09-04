import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { CATALOG } from "@/lib/catalog";
import {
  configuredScopes,
  folderFor,
  SCOPE_IDS,
  SCOPE_META,
  type FoldersConfig,
  type ScopeId,
} from "@/lib/fs/scope-model";
import {
  modelDownloadStart,
  modelEngineStatus,
  modelImport,
  modelList,
  modelOllamaList,
  modelRuntimeOptions,
  modelSetHostedDemo,
  modelSetOllama,
  modelSetOllamaModel,
  modelSetRuntime,
} from "@/lib/runtime/model-server";
import { useLocalBot } from "@/lib/store";
import { AGENT_COLOR_LIST } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FoldersForm } from "./folder-picker";

const TABS = [
  ["general", "General"],
  ["models", "Models"],
  ["folders", "Folders"],
  ["company", "Agents"],
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
          {tab === "folders" && <FoldersPane />}
          {tab === "company" && <AgentsPane />}
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
          Chat uses a local GGUF via llama.cpp on this machine. Work files live in
          the folders you connected under Settings → Folders. Hosted models stay off
          unless you turn on the explicit demo switch.
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

type DiskModel = Awaited<ReturnType<typeof modelList>>["models"][number];
type RuntimeOptions = Awaited<ReturnType<typeof modelRuntimeOptions>>;
type EngineStatus = Awaited<ReturnType<typeof modelEngineStatus>>;

function ModelsPane() {
  const selectedCatalogId = useLocalBot((s) => s.selectedCatalogId);
  const noteCatalog = useLocalBot((s) => s.noteCatalog);
  const [modelsDir, setModelsDir] = useState("");
  const [onDisk, setOnDisk] = useState<DiskModel[]>([]);
  const [importPath, setImportPath] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [runtimes, setRuntimes] = useState<RuntimeOptions | null>(null);

  const refresh = async () => {
    const [r, e, rt] = await Promise.all([modelList(), modelEngineStatus(), modelRuntimeOptions()]);
    setModelsDir(r.modelsDir);
    setOnDisk(r.models);
    setEngine(e);
    setRuntimes(rt);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const byFile = (filename: string) => onDisk.find((m) => m.filename === filename);

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-muted">
        Local GGUF files. Every file is verified (size, GGUF magic, sha256) before
        it can be loaded; a mismatch is refused. Each agent picks its own file
        under Agents; one llama-server restarts onto the selected agent's file.
      </p>
      <Field label="Models folder">
        <p className="font-mono text-xs break-all text-muted">{modelsDir || "—"}</p>
      </Field>
      {engine && (
        <div className="rounded-md bg-raised p-3 text-xs shadow-[0_0_0_1px_var(--color-border)]">
          <p>
            <span className="text-muted">Default file: </span>
            <span className="font-mono">{engine.ggufPath ? engine.ggufPath.split(/[\\/]/).pop() : "none verified"}</span>
            {engine.sha256 && <span className="font-mono text-subtle"> · sha256 {engine.sha256.slice(0, 12)}…</span>}
          </p>
          {engine.error && <p className="mt-1 text-danger">{engine.error}</p>}
          {selectedCatalogId && (
            <p className="mt-1 font-mono text-[11px] text-muted">New agents start on: {selectedCatalogId}</p>
          )}
        </div>
      )}
      <h2 className="text-sm font-medium">Catalog</h2>
      <ul className="space-y-2">
        {CATALOG.map((m) => {
          const disk = byFile(m.filename);
          return (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-md px-3 py-2 shadow-[0_0_0_1px_var(--color-border)]"
            >
              <div>
                <p className="text-sm">{m.name}</p>
                <p className="text-[11px] text-muted">
                  {m.sizeLabel} · {m.license} · {m.tier}
                  {m.sha256 ? <span className="font-mono text-subtle"> · sha256 {m.sha256.slice(0, 12)}…</span> : <span className="text-danger"> · no sha256</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-subtle" data-testid={`catalog-${m.id}`}>
                  {disk ? (disk.verified ? "Verified" : "On disk · unverified") : m.downloadable ? "Hub" : "Listed"}
                </span>
                {m.downloadable && !disk && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      noteCatalog(m.id);
                      void modelDownloadStart({ data: { catalogId: m.id } }).then((st) =>
                        setMsg(st.error ? st.error : "Download started. Watch Runtime / this list."),
                      );
                    }}
                  >
                    Download
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {onDisk.some((m) => !m.catalogId) && (
        <>
          <h2 className="text-sm font-medium">Imported files</h2>
          <ul className="space-y-2">
            {onDisk
              .filter((m) => !m.catalogId)
              .map((m) => (
                <li key={m.path} className="flex items-center justify-between gap-3 rounded-md px-3 py-2 shadow-[0_0_0_1px_var(--color-border)]">
                  <div>
                    <p className="font-mono text-sm">{m.filename}</p>
                    <p className="text-[11px] text-muted">
                      {(m.size / 1024 ** 3).toFixed(2)} GB
                      {m.sha256 && <span className="font-mono text-subtle"> · sha256 {m.sha256.slice(0, 12)}…</span>}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-subtle">{m.verified ? "Verified" : "Unverified"}</span>
                </li>
              ))}
          </ul>
        </>
      )}
      <Field label="Import GGUF (absolute path)">
        <Input
          className="font-mono text-xs"
          value={importPath}
          onChange={(e) => setImportPath(e.target.value)}
        />
      </Field>
      <Button
        variant="secondary"
        size="sm"
        disabled={!importPath.trim()}
        onClick={async () => {
          const r = await modelImport({ data: { absolutePath: importPath } });
          if (r.ok) {
            noteCatalog(r.modelId);
            setMsg(`Imported ${r.path} as ${r.modelId} · sha256 ${r.sha256.slice(0, 12)}…`);
          } else {
            setMsg(r.error);
          }
          await refresh();
        }}
      >
        Import this file
      </Button>
      {msg && <p className="font-mono text-xs text-muted">{msg}</p>}

      <h2 className="text-sm font-medium">llama.cpp build</h2>
      {runtimes && (
        <div className="space-y-2 text-xs">
          <p className="text-muted">
            Release {runtimes.release} · {runtimes.target ?? "unsupported target"} · GPU probe:{" "}
            <span className="font-mono">
              {runtimes.probe.name ?? "none detected"}
              {runtimes.probe.vramGb ? ` · ${runtimes.probe.vramGb} GB` : ""}
              {` · cuda=${runtimes.probe.cuda} vulkan=${runtimes.probe.vulkan} metal=${runtimes.probe.metal}`}
            </span>
          </p>
          {runtimes.probe.evidence.length > 0 && (
            <p className="font-mono text-[11px] text-subtle">{runtimes.probe.evidence.join(" · ")}</p>
          )}
          <label className="flex items-center gap-2">
            <span className="text-muted">Build</span>
            <select
              className="rounded-md bg-bg px-2 py-1 font-mono text-xs shadow-[0_0_0_1px_var(--color-border)]"
              value={runtimes.preference}
              data-testid="runtime-select"
              onChange={async (e) => {
                const st = await modelSetRuntime({ data: { runtime: e.target.value } });
                setEngine(st);
                setRuntimes(await modelRuntimeOptions());
                setMsg("Build preference saved. It applies the next time llama-server starts.");
              }}
            >
              <option value="auto">
                auto{runtimes.auto ? ` → ${runtimes.auto.label}` : ""}
              </option>
              {runtimes.options.map((o) => (
                <option key={o.runtime} value={o.runtime}>
                  {o.label} ({o.runtime}){o.gpu ? " · GPU" : ""}
                </option>
              ))}
            </select>
          </label>
          {engine?.runtime && (
            <p className="text-muted" data-testid="runtime-choice">
              Selected: <span className="font-mono">{engine.runtime.label}</span> · --n-gpu-layers{" "}
              <span className="font-mono">{engine.runtime.gpuLayers}</span> · {engine.runtime.reason}
            </p>
          )}
          {runtimes.target === "darwin-x64" && (
            <p className="text-muted">Intel Mac: no official GPU build exists for b10749 — GPU is NOT BUILT here.</p>
          )}
        </div>
      )}
    </div>
  );
}

function FoldersPane() {
  const folders = useLocalBot((s) => s.folders);
  const meta = useLocalBot((s) => s.foldersMeta);
  const company = useLocalBot((s) => s.company);
  const departments = useLocalBot((s) => s.departments);
  const employees = useLocalBot((s) => s.employees);
  const preview = useLocalBot((s) => s.previewWritesToProjectData);
  const applyFolders = useLocalBot((s) => s.applyFolders);
  const refreshFolders = useLocalBot((s) => s.refreshFolders);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ previous: FoldersConfig | null; current: FoldersConfig } | null>(null);

  useEffect(() => {
    void refreshFolders();
  }, [refreshFolders]);

  const changed = saved
    ? SCOPE_IDS.filter((sc) => {
        const before = saved.previous ? folderFor(saved.previous, sc) : null;
        return before && before !== folderFor(saved.current, sc);
      })
    : [];

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-muted">
        Four scopes, each a real folder on this computer or a mounted share. The
        local sidecar stores them in localbot-config.json and resolves every agent
        path from them. {meta.isElectron ? "Use Choose… to open the OS folder dialog." : "This is the browser preview: type a path; the OS dialog is only in the desktop app."}
      </p>
      <FoldersForm
        initial={folders}
        names={{
          company: company?.name ?? "Studio",
          department: departments[0]?.name ?? "Operations",
          employee: employees[0]?.displayName ?? "You",
        }}
        submitLabel="Save folders"
        busy={busy}
        error={error}
        onSubmit={async (f, create) => {
          setBusy(true);
          setError(null);
          setSaved(null);
          const r = await applyFolders(f, create);
          setBusy(false);
          if (!r.ok) {
            setError(r.error);
            return;
          }
          setSaved({ previous: r.previous, current: r.folders });
        }}
      />
      {saved && (
        <div className="rounded-md bg-raised p-3 text-xs leading-relaxed text-muted shadow-[0_0_0_1px_var(--color-border)]">
          <p className="text-fg">Saved.</p>
          {changed.length > 0 ? (
            <>
              <p className="mt-1">
                Changing a folder does not move old files. They are still where they
                were:
              </p>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
                {changed.map((sc) => (
                  <li key={sc} className="break-all">
                    {sc}: {folderFor(saved.previous!, sc)} → {folderFor(saved.current, sc)}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1">No folder location changed.</p>
          )}
        </div>
      )}
      {meta.legacyCompanyRoot && (
        <div className="rounded-md bg-raised p-3 text-xs leading-relaxed text-muted shadow-[0_0_0_1px_var(--color-border)]">
          <p className="text-fg">Migrated from a single company root.</p>
          <p className="mt-1 break-all font-mono text-[11px]">{meta.legacyCompanyRoot}</p>
          <p className="mt-1">
            Old agent files under …/bots/&#123;Name&#125;/workspace were not moved or
            deleted. New agent folders are agents/&#123;Name&#125;/private inside your
            agents folder.
          </p>
        </div>
      )}
      {preview && (
        <p className="text-xs text-muted">This preview writes to the project data folder.</p>
      )}
    </div>
  );
}

/** Files on disk an agent may run on (verified GGUFs only). */
export function AgentModelSelect({
  value,
  onChange,
  disabled,
  models,
  testId,
}: {
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  models: DiskModel[];
  testId?: string;
}) {
  const verified = models.filter((m) => m.verified);
  const known = verified.some((m) => m.modelId === value);
  return (
    <select
      className="max-w-full rounded-md bg-bg px-2 py-1 font-mono text-xs shadow-[0_0_0_1px_var(--color-border)]"
      value={known ? value : ""}
      disabled={disabled || verified.length === 0}
      data-testid={testId}
      onChange={(e) => onChange(e.target.value)}
    >
      {!known && (
        <option value="" disabled>
          {value ? `${value} (not on disk)` : verified.length === 0 ? "no verified GGUF on disk" : "pick a model"}
        </option>
      )}
      {verified.map((m) => (
        <option key={m.path} value={m.modelId}>
          {m.name}
          {m.catalogId ? "" : " (imported)"}
        </option>
      ))}
    </select>
  );
}

function AgentsPane() {
  const bots = useLocalBot((s) => s.bots);
  const folders = useLocalBot((s) => s.folders);
  const setBotScopes = useLocalBot((s) => s.setBotScopes);
  const setBotModel = useLocalBot((s) => s.setBotModel);
  const createBot = useLocalBot((s) => s.createBot);
  const selectedCatalogId = useLocalBot((s) => s.selectedCatalogId);
  const useOllama = useLocalBot((s) => s.settings.useExistingOllama);
  const [msg, setMsg] = useState<string | null>(null);
  const [models, setModels] = useState<DiskModel[]>([]);
  const connected = configuredScopes(folders);

  useEffect(() => {
    void modelList().then((r) => setModels(r.models));
  }, []);

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-muted">
        Each agent may touch only the scopes ticked here. Private is always on.
        Greyed scopes have no folder connected — pick one under Folders. The
        model is written to agents/&#123;Name&#125;/agent.json and applies from that
        agent's next message; selecting an agent whose file differs restarts the
        one llama-server onto it.
        {useOllama && " Use existing Ollama is on: every agent uses the Ollama model picked under Safety until it is off."}
      </p>
      {bots.map((bot) => (
        <div
          key={bot.id}
          className="rounded-md bg-raised p-3 shadow-[0_0_0_1px_var(--color-border)]"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {bot.name}
              {bot.archived && (
                <span className="ml-2 rounded-full bg-bg px-2 py-0.5 text-[10px] font-normal text-muted">
                  archived
                </span>
              )}
            </p>
            <p className="max-w-[60%] truncate font-mono text-[10px] text-subtle" title={bot.privatePath}>
              {bot.privatePath || "—"}
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-muted">Model</span>
            <AgentModelSelect
              value={bot.modelId}
              models={models}
              disabled={useOllama}
              testId={`agent-model-${bot.name}`}
              onChange={async (id) => {
                const r = await setBotModel(bot.id, id);
                setMsg(r.ok ? `${bot.name} now runs on ${id} from its next message.` : r.error);
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {SCOPE_IDS.map((sc: ScopeId) => {
              const on = bot.scopes.includes(sc);
              const available = sc === "private" || connected.includes(sc);
              return (
                <button
                  key={sc}
                  type="button"
                  disabled={sc === "private" || !available}
                  title={!available ? `${SCOPE_META[sc].label} is not connected` : undefined}
                  onClick={async () => {
                    const next = on ? bot.scopes.filter((x) => x !== sc) : [...bot.scopes, sc];
                    const r = await setBotScopes(bot.id, next);
                    setMsg(r.ok ? null : r.error);
                  }}
                  className={`rounded-full px-2.5 py-1 text-[11px] ${
                    on ? "bg-accent/15 text-accent" : "bg-bg text-muted"
                  } ${!available ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  {sc}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {msg && <p className="font-mono text-xs text-danger">{msg}</p>}
      <Button
        size="sm"
        onClick={() =>
          void createBot({
            name: `Agent ${bots.length + 1}`,
            job: "Generalist",
            color: AGENT_COLOR_LIST[bots.length % AGENT_COLOR_LIST.length]!.id,
            modelId: selectedCatalogId ?? "qwen25-05b-q4",
          }).catch((err: unknown) => setMsg(err instanceof Error ? err.message : String(err)))
        }
      >
        New agent
      </Button>
    </div>
  );
}

function RuntimePane() {
  const runtime = useLocalBot((s) => s.runtime);
  const folders = useLocalBot((s) => s.folders);
  const [engine, setEngine] = useState(runtime);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  useEffect(() => {
    void modelEngineStatus().then((s) => {
      setStatus(s);
      setEngine({
        ...runtime,
        engine: s.engine,
        model: s.model,
        aiAvailable: s.ready,
        ggufPath: s.ggufPath,
        loopback: s.loopback,
        ramEstimate: s.ramEstimate,
        badge: s.badge,
      });
    });
  }, [runtime]);
  return (
    <div className="space-y-4">
      <Row k="Engine" v={engine.engine || runtime.engine} />
      <Row k="Default model" v={engine.model || runtime.model || "—"} />
      <Row k="Status" v={engine.badge || runtime.badge} />
      <Row k="Default GGUF" v={engine.ggufPath || runtime.ggufPath || "—"} />
      <Row k="sha256" v={status?.sha256 ?? "—"} />
      <Row k="RAM estimate" v={engine.ramEstimate || "—"} />
      <Row k="Loopback" v={engine.loopback || runtime.loopback || "—"} />
      <Row
        k="llama.cpp build"
        v={status?.runtime ? `${status.runtime.label} (${status.runtime.id}) · --n-gpu-layers ${status.runtime.gpuLayers}` : "—"}
      />
      <Row k="Build reason" v={status?.runtime?.reason ?? "—"} />
      <Row
        k="GPU probe"
        v={
          status
            ? `${status.gpu.name ?? "none detected"}${status.gpu.vramGb ? ` · ${status.gpu.vramGb} GB` : ""} · cuda=${status.gpu.cuda} vulkan=${status.gpu.vulkan} metal=${status.gpu.metal}`
            : "—"
        }
      />
      <Row
        k="llama-server now"
        v={
          status?.loaded
            ? `${status.loaded.modelPath.split(/[\\/]/).pop()} · ${status.loaded.runtime} · gpu layers ${status.loaded.gpuLayers} · pid ${status.loaded.pid ?? "?"}`
            : "not started by this sidecar"
        }
      />
      {SCOPE_IDS.map((sc) => (
        <Row
          k={SCOPE_META[sc].label}
          key={sc}
          v={folders ? (folderFor(folders, sc) ?? "not connected") : "—"}
        />
      ))}
      <p className="text-sm leading-relaxed text-muted">
        llama-server binds 127.0.0.1 only. Chat does not call a hosted API unless
        you turn on Allow hosted demo (breaks policy).
      </p>
    </div>
  );
}

type OllamaList = Awaited<ReturnType<typeof modelOllamaList>>;

/** Stage 6: with the switch on, list what 127.0.0.1:11434 serves and pick one. Errors are shown, never swallowed. */
function OllamaPicker() {
  const [state, setState] = useState<OllamaList | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    setState(await modelOllamaList());
    setBusy(false);
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="ml-7 space-y-2 rounded-md bg-raised p-3 text-xs shadow-[0_0_0_1px_var(--color-border)]" data-testid="ollama-picker">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted">Models on 127.0.0.1:11434</span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void load()}>
          {busy ? "Looking…" : "Refresh"}
        </Button>
      </div>
      {state && !state.ok && (
        <p className="text-danger" data-testid="ollama-error">
          {state.error} Chat is refused while this switch is on and nothing is picked — it does not fall back to llama.cpp or a hosted model.
        </p>
      )}
      {state?.ok && (
        <label className="flex items-center gap-2">
          <span className="text-muted">Use</span>
          <select
            className="rounded-md bg-bg px-2 py-1 font-mono text-xs shadow-[0_0_0_1px_var(--color-border)]"
            value={state.chosen && state.models.some((m) => m.name === state.chosen) ? state.chosen : ""}
            data-testid="ollama-select"
            onChange={async (e) => {
              await modelSetOllamaModel({ data: { name: e.target.value || null } });
              await load();
            }}
          >
            <option value="" disabled>
              pick a model ({state.models.length} found)
            </option>
            {state.models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
                {m.parameterSize ? ` · ${m.parameterSize}` : ""}
                {m.quantization ? ` ${m.quantization}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {state?.ok && !state.chosen && (
        <p className="text-danger">No model picked yet — chat is refused until one is chosen.</p>
      )}
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
          onChange={(e) => {
            updateSettings({ useExistingOllama: e.target.checked });
            void modelSetOllama({ data: { use: e.target.checked } });
          }}
        />
        <span>
          <span className="block text-sm">Use existing Ollama</span>
          <span className="text-xs text-muted">
            Off by default. Only if something is already serving on this machine’s
            Ollama port. Not required. On: the Harness route points at Ollama’s /v1
            with the model you pick here; discovery failures are shown, not skipped.
          </span>
        </span>
      </label>
      {settings.useExistingOllama && <OllamaPicker />}
      <div className="rounded-md bg-danger/10 p-3 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-danger)_40%,transparent)]">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-danger"
            checked={settings.allowHostedDemo}
            onChange={(e) => {
              updateSettings({ allowHostedDemo: e.target.checked });
              void modelSetHostedDemo({ data: { allow: e.target.checked } });
            }}
          />
          <span>
            <span className="block text-sm text-danger">Allow hosted demo (breaks policy)</span>
            <span className="text-xs text-muted">
              Off. Default chat is the local GGUF. Turning this on sends turns to a
              hosted model instead.
            </span>
          </span>
        </label>
      </div>
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
              scoped to the agent's private folder.
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
