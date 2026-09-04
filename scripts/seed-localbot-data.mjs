/**
 * Seed a LocalBot data dir the way Stages 2 + 7 leave it after onboarding, so
 * a proof script can start an instance that goes straight to the roster:
 *   {dataDir}/localbot-config.json   v2, four folders
 *   {dataDir}/localbot-agents.json   v1 host index, onboarded, one row per agent
 *   {employeeRoot}/agents/{Name}/agent.json + AGENTS.md + private/
 * Nothing here touches models or the browser.
 */
import fs from "node:fs";
import path from "node:path";

const now = () => new Date().toISOString();

/**
 * @param {{
 *   dataDir: string,
 *   folders: { employeeRoot: string, employeeShared: string|null, departmentShared: string|null, companyShared: string|null },
 *   agents?: { name: string, job?: string, mascotId?: string, color?: string, scopes?: string[] }[],
 *   labels?: { company?: string, department?: string, employee?: string },
 *   idPrefix?: string,
 * }} opts
 */
export function seedLocalBotData({ dataDir, folders, agents = [], labels = {}, idPrefix = "seed" }) {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const p of Object.values(folders)) if (p) fs.mkdirSync(p, { recursive: true });

  const config = {
    version: 2,
    folders,
    legacyCompanyRoot: null,
    previewWritesToProjectData: false,
    modelsDir: path.join(dataDir, "models"),
    activeModelId: null,
    activeModelPath: null,
    allowHostedDemo: false,
    useExistingOllama: false,
    ollamaModel: null,
    llamaRuntime: "auto",
    verifiedModels: {},
  };
  fs.writeFileSync(path.join(dataDir, "localbot-config.json"), JSON.stringify(config, null, 2) + "\n");

  const rows = [];
  agents.forEach((a, i) => {
    const dir = path.join(folders.employeeRoot, "agents", a.name);
    fs.mkdirSync(path.join(dir, "private", "memory"), { recursive: true });
    fs.mkdirSync(path.join(dir, "private", "output"), { recursive: true });
    const record = {
      name: a.name,
      job: a.job ?? `${a.name} for the two-process share test`,
      modelId: "",
      color: a.color ?? "#7c9cff",
      mascotId: a.mascotId ?? "writer",
      scopes: a.scopes ?? ["private", "employee-shared", "department-shared"],
      createdAt: now(),
      archived: false,
    };
    fs.writeFileSync(path.join(dir, "agent.json"), JSON.stringify(record, null, 2) + "\n");
    fs.writeFileSync(path.join(dir, "AGENTS.md"), `# ${a.name}\n\n${record.job}\n`);
    if (!fs.existsSync(path.join(dir, "private", "memory", "notes.md"))) {
      fs.writeFileSync(path.join(dir, "private", "memory", "notes.md"), `# ${a.name} notes\n`);
    }
    rows.push({
      id: `bot_${idPrefix}_${i + 1}`,
      name: a.name,
      pinned: false,
      hidden: false,
      unread: 0,
      sessionId: null,
      sessionCwd: null,
      createdAt: now(),
    });
  });

  const index = {
    version: 1,
    onboarded: true,
    company: { id: `co_${idPrefix}`, name: labels.company ?? "Acme", createdAt: now() },
    department: { id: `dept_${idPrefix}`, name: labels.department ?? "Ops", createdAt: now() },
    employee: { id: `emp_${idPrefix}`, name: labels.employee ?? "Sam", createdAt: now() },
    selectedCatalogId: null,
    migratedFrom: null,
    updatedAt: now(),
    agents: rows,
  };
  fs.writeFileSync(path.join(dataDir, "localbot-agents.json"), JSON.stringify(index, null, 2) + "\n");
  return { config, index };
}
