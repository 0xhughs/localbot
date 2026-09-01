import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderLock,
  HardDrive,
  Pause,
  Play,
  Shield,
} from "lucide-react";
import { onboardingCards } from "@/lib/catalog";
import { fsGetCompanyRoot } from "@/lib/fs/server";
import { scanBrowserHardware } from "@/lib/hardware";
import {
  fsScanServerHardware,
  modelDownloadPause,
  modelDownloadResume,
  modelDownloadStart,
  modelDownloadStatus,
  modelImport,
  modelList,
  modelVerify,
} from "@/lib/runtime/model-server";
import { useLocalBot } from "@/lib/store";
import { AGENT_COLOR_LIST, type AgentColorId, type CatalogModel } from "@/lib/types";
import { MASCOT_IDS, MASCOT_META, type MascotId } from "@/lib/mascots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorSwatch } from "./avatar";
import { Wordmark } from "./logo";
import { MascotMark } from "./mascots";

const TEMPLATES: { name: string; job: string; color: AgentColorId; mascotId: MascotId }[] = [
  { name: "Writer", job: "Turn notes into drafts, briefs, and outbox deliverables.", color: "sage", mascotId: "writer" },
  { name: "Researcher", job: "Gather sources into the department shared folder.", color: "clay", mascotId: "researcher" },
  { name: "Ops", job: "Keep the workspace organized and file the finished work.", color: "slate", mascotId: "ops" },
];

type Step = "hello" | "stay" | "grants" | "scan" | "models" | "download" | "agent";

const WELCOME: { id: Step; title: string; body: string }[] = [
  {
    id: "hello",
    title: "Your agents, on this computer.",
    body: "LocalBot is a chat of named agents. Each one has its own workspace folder on this machine.",
  },
  {
    id: "stay",
    title: "Chat is a local model file.",
    body: "No account. No API key on the default path. The model is a GGUF on this machine. Work files go on disk under the company root.",
  },
  {
    id: "grants",
    title: "Agents only touch folders you grant.",
    body: "The company root is a real directory. Two people share work only if they point at the same real folder on this machine.",
  },
];

export function Onboarding() {
  const [step, setStep] = useState<Step>("hello");
  const hardware = useLocalBot((s) => s.hardware);
  const setHardware = useLocalBot((s) => s.setHardware);
  const noteCatalog = useLocalBot((s) => s.noteCatalog);
  const completeOnboarding = useLocalBot((s) => s.completeOnboarding);

  const [scanning, setScanning] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [company, setCompany] = useState("Studio");
  const [department, setDepartment] = useState("Operations");
  const [employee, setEmployee] = useState("You");
  const [shared, setShared] = useState(false);
  const [botName, setBotName] = useState("Writer");
  const [botJob, setBotJob] = useState(TEMPLATES[0]!.job);
  const [color, setColor] = useState<AgentColorId>("sage");
  const [mascotId, setMascotId] = useState<MascotId>("writer");
  const [companyRoot, setCompanyRoot] = useState("");
  const [rootTouched, setRootTouched] = useState(false);
  const [previewData, setPreviewData] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browserGuess, setBrowserGuess] = useState<string | null>(null);

  const cards = useMemo(
    () => (hardware ? onboardingCards(hardware) : null),
    [hardware],
  );

  useEffect(() => {
    void fsGetCompanyRoot().then((cfg) => {
      setPreviewData(cfg.previewWritesToProjectData);
      if (!rootTouched) setCompanyRoot(cfg.defaultRoot);
    });
  }, [rootTouched]);

  useEffect(() => {
    if (rootTouched) return;
    void fsGetCompanyRoot().then((cfg) => {
      const base = cfg.defaultRoot.replace(/[/\\][^/\\]+$/, "");
      setCompanyRoot(`${base}/${company.trim() || "Studio"}`);
    });
  }, [company, rootTouched]);

  useEffect(() => {
    if (step !== "scan") return;
    setScanning(true);
    const guess = scanBrowserHardware();
    setBrowserGuess(
      `${guess.totalRamGb} GB (browser guess, source ${guess.ramSource})`,
    );
    void fsScanServerHardware()
      .then((hw) => {
        setHardware(hw);
        setScanning(false);
      })
      .catch(() => {
        setHardware(guess);
        setScanning(false);
      });
  }, [step, setHardware]);

  const pickModel = (id: string) => {
    setPicked(id);
    noteCatalog(id);
    setStep("download");
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="flex items-center justify-between px-5 py-4 md:px-8">
        <Wordmark />
        <span className="font-mono text-[11px] tracking-wide text-subtle uppercase">
          First run
        </span>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-y-auto px-5 pb-10 md:px-8">
        {WELCOME.some((w) => w.id === step) && (
          <Welcome
            step={step}
            onNext={() => {
              const idx = WELCOME.findIndex((w) => w.id === step);
              const next = WELCOME[idx + 1];
              setStep(next ? next.id : "scan");
            }}
            onBack={() => {
              const idx = WELCOME.findIndex((w) => w.id === step);
              if (idx > 0) setStep(WELCOME[idx - 1]!.id);
            }}
          />
        )}
        {step === "scan" && (
          <ScanStep
            scanning={scanning}
            browserGuess={browserGuess}
            onContinue={() => setStep("models")}
            onBack={() => setStep("grants")}
          />
        )}
        {step === "models" && cards && hardware && (
          <ModelStep
            cards={cards}
            onPick={pickModel}
            onBack={() => setStep("scan")}
          />
        )}
        {step === "download" && picked && (
          <DownloadStep
            catalogId={picked}
            onBack={() => setStep("models")}
            onReady={() => setStep("agent")}
          />
        )}
        {step === "agent" && (
          <AgentStep
            company={company}
            setCompany={setCompany}
            department={department}
            setDepartment={setDepartment}
            employee={employee}
            setEmployee={setEmployee}
            shared={shared}
            setShared={setShared}
            botName={botName}
            setBotName={setBotName}
            botJob={botJob}
            setBotJob={setBotJob}
            color={color}
            setColor={setColor}
            mascotId={mascotId}
            setMascotId={setMascotId}
            companyRoot={companyRoot}
            setCompanyRoot={(v) => {
              setRootTouched(true);
              setCompanyRoot(v);
            }}
            previewData={previewData}
            busy={busy}
            error={error}
            onTemplate={(t) => {
              setBotName(t.name);
              setBotJob(t.job);
              setColor(t.color);
              setMascotId(t.mascotId);
            }}
            onBack={() => setStep("download")}
            onFinish={async () => {
              setBusy(true);
              setError(null);
              const modelId = picked ?? "qwen25-05b-q4";
              const result = await completeOnboarding({
                companyName: company,
                departmentName: department,
                employeeName: employee,
                botName,
                botJob,
                color,
                mascotId,
                modelId,
                sharedRoot: shared,
                companyRoot,
              });
              setBusy(false);
              if (!result.ok) setError(result.error);
            }}
          />
        )}
      </main>
    </div>
  );
}

function Welcome({
  step,
  onNext,
  onBack,
}: {
  step: Step;
  onNext: () => void;
  onBack: () => void;
}) {
  const screen = WELCOME.find((w) => w.id === step)!;
  const idx = WELCOME.findIndex((w) => w.id === step);
  const Icon = [HardDrive, Shield, FolderLock][idx] ?? HardDrive;
  return (
    <section className="stagger-in flex flex-1 flex-col justify-center py-4">
      <p className="mb-6 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase">
        {idx + 1} / 3
      </p>
      <div className="mb-6 flex size-12 items-center justify-center rounded-lg bg-raised text-accent shadow-[0_0_0_1px_var(--color-border)]">
        <Icon className="size-5" strokeWidth={1.6} />
      </div>
      <h1 className="max-w-xl text-3xl leading-tight font-medium tracking-tight md:text-4xl">
        {screen.title}
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
        {screen.body}
      </p>
      <div className="mt-10 flex gap-3">
        {idx > 0 && (
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        )}
        <Button onClick={onNext}>
          Continue
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </section>
  );
}

function ScanStep({
  scanning,
  browserGuess,
  onContinue,
  onBack,
}: {
  scanning: boolean;
  browserGuess: string | null;
  onContinue: () => void;
  onBack: () => void;
}) {
  const hardware = useLocalBot((s) => s.hardware);
  return (
    <section className="stagger-in flex flex-1 flex-col justify-center py-4">
      <p className="mb-3 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase">
        Hardware
      </p>
      <h1 className="text-3xl font-medium tracking-tight">This machine</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Server RAM and disk from Node. Catalog recommendations use these numbers,
        not the browser guess.
      </p>
      <div className="mt-8 overflow-hidden rounded-xl bg-surface p-1 shadow-[0_0_0_1px_var(--color-border)]">
        <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {(
            [
              ["OS", scanning ? "…" : hardware?.platformLabel],
              ["CPU cores", scanning ? "…" : String(hardware?.cores ?? "—")],
              [
                "RAM",
                scanning
                  ? "…"
                  : hardware
                    ? `${hardware.totalRamGb.toFixed(1)} GB total · ${hardware.availableRamGb.toFixed(1)} GB free (${hardware.ramSource})`
                    : "—",
              ],
              ["GPU / CPU", scanning ? "…" : hardware?.gpuName ?? "None detected"],
              [
                "Apple Silicon",
                scanning ? "…" : hardware?.appleSilicon ? "Yes" : "No",
              ],
              [
                "Free disk",
                scanning ? "…" : hardware ? `${hardware.freeDiskGb.toFixed(0)} GB` : "—",
              ],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="px-4 py-3">
              <dt className="font-mono text-[10px] tracking-wider text-subtle uppercase">
                {k}
              </dt>
              <dd className="mt-1 text-sm text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      {browserGuess && (
        <p className="mt-3 font-mono text-[11px] text-subtle">
          Browser guess: {browserGuess}
        </p>
      )}
      <div className="mt-8 flex gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button onClick={onContinue} disabled={scanning || !hardware}>
          See catalog
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </section>
  );
}

function ModelStep({
  cards,
  onPick,
  onBack,
}: {
  cards: ReturnType<typeof onboardingCards>;
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  const items: { key: "small" | "recommended" | "large"; title: string; model: CatalogModel | null }[] = [
    { key: "small", title: "Small", model: cards.small },
    { key: "recommended", title: "Recommended", model: cards.recommended },
    { key: "large", title: "Large", model: cards.large },
  ];
  return (
    <section className="stagger-in flex flex-1 flex-col py-6">
      <p className="mb-3 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase">
        Catalog
      </p>
      <h1 className="text-3xl font-medium tracking-tight">Choose a local model</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Grey cards need more RAM than this server has, or are not downloadable.
        Small is the default for this machine.
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {items.map(({ key, title, model }) => {
          if (!model) return null;
          const fit = cards.fits[model.id];
          const enabled = Boolean(fit?.fits && model.downloadable);
          const rec = key === "recommended";
          return (
            <button
              key={key}
              type="button"
              disabled={!enabled}
              onClick={() => enabled && onPick(model.id)}
              className={`flex flex-col rounded-xl bg-surface p-4 text-left shadow-[0_0_0_1px_var(--color-border)] transition-[transform,background-color] duration-150 ${
                enabled ? "hover:bg-raised" : "cursor-not-allowed opacity-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-wider text-subtle uppercase">
                  {title}
                </span>
                {rec && enabled && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                    Fits
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-base font-medium">{model.name}</h2>
              <p className="mt-1 font-mono text-xs text-muted">
                {model.sizeLabel} · {model.license}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                {enabled
                  ? fit?.reason
                  : fit && !fit.fits
                    ? fit.reason
                    : "Not downloadable in this build."}
              </p>
            </button>
          );
        })}
      </div>
      <div className="mt-8">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>
    </section>
  );
}

function DownloadStep({
  catalogId,
  onBack,
  onReady,
}: {
  catalogId: string;
  onBack: () => void;
  onReady: () => void;
}) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof modelDownloadStatus>> | null>(null);
  const [importPath, setImportPath] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const s = await modelDownloadStatus();
      if (stop) return;
      setStatus(s);
      if (s.status === "done") {
        const v = await modelVerify({ data: { catalogId } });
        if (v.ok) setReady(true);
      }
    };
    void (async () => {
      const listed = await modelList();
      const hit = listed.models.find((m) => m.catalogId === catalogId);
      if (hit) {
        const v = await modelVerify({ data: { catalogId } });
        if (v.ok) {
          setReady(true);
          setMsg(`Already on disk · ${hit.path}`);
          return;
        }
      }
      await modelDownloadStart({ data: { catalogId } });
      await tick();
    })();
    const id = window.setInterval(() => void tick(), 500);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [catalogId]);

  const pct =
    status && status.bytesTotal > 0
      ? Math.min(100, Math.round((status.bytesDone / status.bytesTotal) * 100))
      : 0;

  return (
    <section className="stagger-in flex flex-1 flex-col py-6">
      <p className="mb-3 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase">
        Download
      </p>
      <h1 className="text-3xl font-medium tracking-tight">Get the GGUF</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Real bytes from Hugging Face into the models folder. Pause uses HTTP
        Range. You can also import a .gguf already on this machine.
      </p>
      <div className="mt-6 rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--color-border)]">
        <div className="h-2 overflow-hidden rounded-full bg-raised">
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: `${ready ? 100 : pct}%` }}
          />
        </div>
        <p className="mt-3 font-mono text-xs text-muted">
          {ready
            ? "Verified on disk."
            : status
              ? `${(status.bytesDone / 1024 ** 2).toFixed(1)} / ${(status.bytesTotal / 1024 ** 2).toFixed(1)} MB · ${status.status}`
              : "Starting…"}
        </p>
        {status?.error && <p className="mt-2 text-sm text-danger">{status.error}</p>}
        {msg && <p className="mt-2 font-mono text-xs break-all text-muted">{msg}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void modelDownloadPause()}
            disabled={status?.status !== "running"}
          >
            <Pause className="size-3.5" />
            Pause
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void modelDownloadResume()}
            disabled={status?.status !== "paused"}
          >
            <Play className="size-3.5" />
            Resume
          </Button>
        </div>
      </div>
      <label className="mt-5 block text-xs font-medium text-muted">
        Import GGUF (absolute path on this server)
        <Input
          className="mt-1.5 font-mono text-xs"
          value={importPath}
          onChange={(e) => setImportPath(e.target.value)}
          placeholder="/path/to/model.gguf"
        />
      </label>
      <div className="mt-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!importPath.trim()}
          onClick={async () => {
            const r = await modelImport({ data: { absolutePath: importPath, catalogId } });
            if (r.ok) {
              setReady(true);
              setMsg(`Imported ${r.path}`);
            } else {
              setMsg(r.error ?? "Import failed");
            }
          }}
        >
          Import this file
        </Button>
      </div>
      <div className="mt-8 flex gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button onClick={onReady} disabled={!ready}>
          Continue
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </section>
  );
}

function AgentStep(props: {
  company: string;
  setCompany: (v: string) => void;
  department: string;
  setDepartment: (v: string) => void;
  employee: string;
  setEmployee: (v: string) => void;
  shared: boolean;
  setShared: (v: boolean) => void;
  botName: string;
  setBotName: (v: string) => void;
  botJob: string;
  setBotJob: (v: string) => void;
  color: AgentColorId;
  setColor: (v: AgentColorId) => void;
  mascotId: MascotId;
  setMascotId: (v: MascotId) => void;
  companyRoot: string;
  setCompanyRoot: (v: string) => void;
  previewData: boolean;
  busy: boolean;
  error: string | null;
  onTemplate: (t: (typeof TEMPLATES)[number]) => void;
  onBack: () => void;
  onFinish: () => void | Promise<void>;
}) {
  return (
    <section className="stagger-in flex flex-1 flex-col py-6">
      <p className="mb-3 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase">
        Company
      </p>
      <h1 className="text-3xl font-medium tracking-tight">Create your first agent</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        This writes the company tree on disk. Chat uses the local GGUF you just
        verified.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="block text-xs font-medium text-muted">
          Company
          <Input className="mt-1.5" value={props.company} onChange={(e) => props.setCompany(e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-muted">
          Department
          <Input className="mt-1.5" value={props.department} onChange={(e) => props.setDepartment(e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-muted">
          Your name
          <Input className="mt-1.5" value={props.employee} onChange={(e) => props.setEmployee(e.target.value)} />
        </label>
        <label className="flex items-end gap-2 pb-1 text-sm text-fg">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={props.shared}
            onChange={(e) => props.setShared(e.target.checked)}
          />
          This path is a shared drive
        </label>
      </div>

      <label className="mt-4 block text-xs font-medium text-muted">
        Company root (absolute path)
        <Input
          className="mt-1.5 font-mono text-xs"
          value={props.companyRoot}
          onChange={(e) => props.setCompanyRoot(e.target.value)}
        />
      </label>
      {props.previewData ? (
        <p className="mt-2 text-xs text-muted">
          This preview writes to the project data folder.
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">
          Shared departments require a shared folder path.
        </p>
      )}

      <div className="mt-6">
        <p className="text-xs font-medium text-muted">Template</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => props.onTemplate(t)}
              className="inline-flex items-center gap-2 rounded-md bg-raised px-3 py-1.5 text-sm text-fg shadow-[0_0_0_1px_var(--color-border)] hover:bg-hover"
            >
              <span className="size-6 overflow-hidden rounded-full">
                <MascotMark id={t.mascotId} />
              </span>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-xs font-medium text-muted">
          Agent name
          <Input className="mt-1.5" value={props.botName} onChange={(e) => props.setBotName(e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-muted">
          Job
          <Input className="mt-1.5" value={props.botJob} onChange={(e) => props.setBotJob(e.target.value)} />
        </label>
      </div>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted">Mascot</p>
          <div className="mt-2 flex gap-2">
            {MASCOT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => props.setMascotId(id)}
                className={`flex size-11 items-center justify-center overflow-hidden rounded-full ${
                  props.mascotId === id ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : ""
                }`}
                aria-label={MASCOT_META[id].label}
              >
                <MascotMark id={id} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-muted">Color</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {AGENT_COLOR_LIST.map((c) => (
              <ColorSwatch
                key={c.id}
                hex={c.hex}
                selected={props.color === c.id}
                onClick={() => props.setColor(c.id)}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="mt-5 font-mono text-[11px] leading-relaxed text-subtle break-all">
        {`${props.companyRoot || "(set a path)"}/departments/${props.department || "Operations"}/people/${props.employee || "You"}/bots/${props.botName || "Writer"}/`}
      </p>
      {props.error && <p className="mt-2 text-sm text-danger">{props.error}</p>}

      <div className="mt-8 flex gap-3">
        <Button variant="ghost" onClick={props.onBack} disabled={props.busy}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button onClick={() => void props.onFinish()} disabled={!props.botName.trim() || !props.companyRoot.trim() || props.busy}>
          <Check className="size-4" />
          {props.busy ? "Creating folders…" : "Open chat"}
        </Button>
      </div>
    </section>
  );
}
