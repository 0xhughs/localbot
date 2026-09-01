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
import { scanBrowserHardware } from "@/lib/hardware";
import { useLocalBot } from "@/lib/store";
import { AGENT_COLOR_LIST, type AgentColorId, type CatalogModel, type DownloadJob } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorSwatch } from "./avatar";
import { Wordmark } from "./logo";

const TEMPLATES: { name: string; job: string; color: AgentColorId }[] = [
  { name: "Writer", job: "Turn notes into drafts, briefs, and outbox deliverables.", color: "sage" },
  { name: "Researcher", job: "Gather sources into the department shared folder.", color: "steel" },
  { name: "Ops", job: "Keep the workspace organized and file the finished work.", color: "pine" },
];

type Step =
  | "hello"
  | "stay"
  | "grants"
  | "scan"
  | "models"
  | "download"
  | "agent";

const WELCOME: { id: Step; title: string; body: string }[] = [
  {
    id: "hello",
    title: "Your agents, on this computer.",
    body: "LocalBot is a personal workspace. You pick a local model, create named agents, and talk to them like contacts. Each one has its own memory and its own folder.",
  },
  {
    id: "stay",
    title: "Work stays here.",
    body: "There is no cloud account and no key on the default path. The model is a file on disk. Sessions, logs, and memory live in your LocalBot home.",
  },
  {
    id: "grants",
    title: "Agents only touch folders you grant.",
    body: "The default computer is the agent’s workspace — not your whole home directory. Shell, deletes, network, and anything outside the company root always ask first.",
  },
];

export function Onboarding() {
  const [step, setStep] = useState<Step>("hello");
  const hardware = useLocalBot((s) => s.hardware);
  const setHardware = useLocalBot((s) => s.setHardware);
  const setDownload = useLocalBot((s) => s.setDownload);
  const download = useLocalBot((s) => s.download);
  const completeDownload = useLocalBot((s) => s.completeDownload);
  const completeOnboarding = useLocalBot((s) => s.completeOnboarding);
  const models = useLocalBot((s) => s.models);

  const [scanning, setScanning] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [company, setCompany] = useState("Studio");
  const [department, setDepartment] = useState("Operations");
  const [employee, setEmployee] = useState("You");
  const [shared, setShared] = useState(false);
  const [botName, setBotName] = useState("Writer");
  const [botJob, setBotJob] = useState(TEMPLATES[0]!.job);
  const [color, setColor] = useState<AgentColorId>("sage");

  const cards = useMemo(
    () => (hardware ? onboardingCards(hardware) : null),
    [hardware],
  );

  useEffect(() => {
    if (step !== "scan") return;
    setScanning(true);
    const t = window.setTimeout(() => {
      setHardware(scanBrowserHardware());
      setScanning(false);
    }, 1100);
    return () => window.clearTimeout(t);
  }, [step, setHardware]);

  const goDownload = (id: string) => {
    setPicked(id);
    setDownload({
      catalogId: id,
      status: "running",
      progress: 0,
      startedAt: new Date().toISOString(),
    });
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

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-10 md:px-8">
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
            onContinue={() => setStep("models")}
            onBack={() => setStep("grants")}
          />
        )}
        {step === "models" && cards && hardware && (
          <ModelStep
            cards={cards}
            onPick={goDownload}
            onBack={() => setStep("scan")}
          />
        )}
        {step === "download" && picked && (
          <DownloadStep
            catalogId={picked}
            job={download}
            setJob={setDownload}
            onDone={async () => {
              if (!models.some((m) => m.catalogId === picked)) {
                await completeDownload(picked);
              }
              setStep("agent");
            }}
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
            onTemplate={(t) => {
              setBotName(t.name);
              setBotJob(t.job);
              setColor(t.color);
            }}
            onBack={() => setStep("models")}
            onFinish={() => {
              const modelId =
                picked ??
                useLocalBot.getState().models[0]?.catalogId ??
                "gemma4-e2b-q4";
              completeOnboarding({
                companyName: company,
                departmentName: department,
                employeeName: employee,
                botName,
                botJob,
                color,
                modelId,
                sharedRoot: shared,
              });
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
    <section className="stagger-in flex flex-1 flex-col justify-center py-8">
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
  onContinue,
  onBack,
}: {
  scanning: boolean;
  onContinue: () => void;
  onBack: () => void;
}) {
  const hardware = useLocalBot((s) => s.hardware);
  return (
    <section className="stagger-in flex flex-1 flex-col justify-center py-8">
      <p className="mb-3 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase">
        Hardware
      </p>
      <h1 className="text-3xl font-medium tracking-tight">This machine</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        LocalBot sizes the model catalog from RAM, GPU, and disk — never by
        asking you to guess.
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
                    ? `${hardware.totalRamGb} GB total · ${hardware.availableRamGb.toFixed(1)} GB free`
                    : "—",
              ],
              [
                "GPU",
                scanning
                  ? "…"
                  : hardware?.gpuName ??
                    (hardware?.appleSilicon ? "Apple Silicon (unified)" : "None detected"),
              ],
              [
                "Apple Silicon",
                scanning ? "…" : hardware?.appleSilicon ? "Yes" : "No",
              ],
              [
                "Free disk",
                scanning ? "…" : hardware ? `${hardware.freeDiskGb} GB` : "—",
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
      {hardware?.ramSource === "assumed-desktop" && (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Browsers cap reported RAM at 8 GB. This looks like a desktop, so
          LocalBot treats it as a 16 GB class machine for recommendations.
        </p>
      )}
      <div className="mt-8 flex gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button onClick={onContinue} disabled={scanning || !hardware}>
          See models
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
      <h1 className="text-3xl font-medium tracking-tight">Pick a model</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Ungated GGUF files only. Grey cards will not load on this machine.
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {items.map(({ key, title, model }) => {
          if (!model) return null;
          const fit = cards.fits[model.id];
          const disabled = !fit?.fits;
          const rec = key === "recommended";
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onPick(model.id)}
              className="flex flex-col rounded-xl bg-surface p-4 text-left shadow-[0_0_0_1px_var(--color-border)] transition-[transform,background-color] duration-150 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-wider text-subtle uppercase">
                  {title}
                </span>
                {rec && fit?.fits && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                    Best fit
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-base font-medium">{model.name}</h2>
              <p className="mt-1 font-mono text-xs text-muted">
                {model.sizeLabel} · {model.license}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted">{fit?.reason}</p>
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
  job,
  setJob,
  onDone,
}: {
  catalogId: string;
  job: DownloadJob | null;
  setJob: (j: DownloadJob | null) => void;
  onDone: () => void | Promise<void>;
}) {
  const paused = job?.status === "paused";
  useEffect(() => {
    let p = useLocalBot.getState().download?.progress ?? 0;
    let finished = false;
    const tick = window.setInterval(() => {
      if (finished) return;
      const cur = useLocalBot.getState().download;
      if (!cur || cur.catalogId !== catalogId) return;
      if (cur.status === "paused") return;
      if (cur.status === "done" || cur.status === "verifying") return;
      p = Math.min(1, p + 0.04 + Math.random() * 0.025);
      if (p >= 1) {
        finished = true;
        window.clearInterval(tick);
        setJob({ ...cur, status: "verifying", progress: 1 });
        window.setTimeout(() => {
          void onDone();
        }, 400);
        return;
      }
      setJob({ ...cur, status: "running", progress: p });
    }, 80);
    return () => window.clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogId]);

  const pct = Math.round((job?.progress ?? 0) * 100);
  return (
    <section className="stagger-in flex flex-1 flex-col justify-center py-8">
      <p className="mb-3 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase">
        Models
      </p>
      <h1 className="text-3xl font-medium tracking-tight">Downloading GGUF</h1>
      <p className="mt-2 text-sm text-muted">
        Saved under LocalBot home / models. Checksum verified before the file is
        marked ready.
      </p>
      <div className="mt-8 rounded-xl bg-surface p-5 shadow-[0_0_0_1px_var(--color-border)]">
        <div className="flex items-center justify-between text-sm">
          <span className="font-mono text-xs text-muted">{catalogId}</span>
          <span className="tabular-nums text-fg">{pct}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-raised">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          {job?.status === "verifying"
            ? "Verifying checksum…"
            : paused
              ? "Paused"
              : "Writing into ~/.localbot/models"}
        </p>
        <div className="mt-4">
          {paused ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => job && setJob({ ...job, status: "running" })}
            >
              <Play className="size-3.5" />
              Resume
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={job?.status === "verifying"}
              onClick={() => job && setJob({ ...job, status: "paused" })}
            >
              <Pause className="size-3.5" />
              Pause
            </Button>
          )}
        </div>
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
  onTemplate: (t: (typeof TEMPLATES)[number]) => void;
  onBack: () => void;
  onFinish: () => void;
}) {
  return (
    <section className="stagger-in flex flex-1 flex-col py-6">
      <p className="mb-3 font-mono text-[11px] tracking-[0.18em] text-subtle uppercase">
        Company
      </p>
      <h1 className="text-3xl font-medium tracking-tight">Create your first agent</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        This writes the company tree on disk. The agent’s computer is its
        workspace folder.
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
          Company root is a shared drive
        </label>
      </div>
      {props.shared ? (
        <p className="mt-2 text-xs text-muted">
          Point both installs at the same folder. LocalBot does not sync on its
          own — the folder is the bus.
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
              className="rounded-md bg-raised px-3 py-1.5 text-sm text-fg shadow-[0_0_0_1px_var(--color-border)] hover:bg-hover"
            >
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
      <div className="mt-4">
        <p className="text-xs font-medium text-muted">Color</p>
        <div className="mt-2 flex gap-2">
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

      <p className="mt-5 font-mono text-[11px] leading-relaxed text-subtle">
        {`/Documents/LocalBot/${props.company || "Studio"}/departments/${props.department || "Operations"}/people/${props.employee || "You"}/bots/${props.botName || "Writer"}/`}
      </p>

      <div className="mt-8 flex gap-3">
        <Button variant="ghost" onClick={props.onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button onClick={props.onFinish} disabled={!props.botName.trim()}>
          <Check className="size-4" />
          Open chat
        </Button>
      </div>
    </section>
  );
}
