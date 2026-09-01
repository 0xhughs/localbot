import { getCatalogModel } from "@/lib/catalog";
import { prettyTree, readFile } from "@/lib/fs/vfs";
import type { AppSnapshot, Bot } from "@/lib/types";
import { resolveBot } from "@/lib/store";
import { grantPathFor } from "@/lib/fs/company";

export function buildSystemPrompt(s: AppSnapshot, bot: Bot): string {
  const ctx = resolveBot(s, bot.id);
  if (!ctx) return "You are a LocalBot agent.";
  const model = getCatalogModel(bot.modelId);
  const modelName = model?.name ?? bot.modelId;
  let memory = "";
  try {
    memory = readFile(s.files, `${bot.memoryPath}/notes.md`);
  } catch {
    memory = "";
  }
  let standing = "";
  try {
    standing = readFile(s.files, `${bot.path}/AGENTS.md`);
  } catch {
    standing = bot.standingInstructions;
  }
  const shared = bot.grants.includes("shared")
    ? grantPathFor(bot, ctx.employee, ctx.department, ctx.company, "shared")
    : null;
  const outbox = bot.grants.includes("outbox")
    ? grantPathFor(bot, ctx.employee, ctx.department, ctx.company, "outbox")
    : null;

  const tree = prettyTree(s.files, bot.path, 60);
  const sharedTree = shared ? prettyTree(s.files, shared, 40) : "(not granted)";

  return `You are ${bot.name}, a LocalBot agent running on the employee's computer.
Job: ${bot.job}
Local model (identity): ${modelName}
Employee: ${ctx.employee.displayName}
Department: ${ctx.department.name}
Company: ${ctx.company.name}

You do real work by calling tools. Prefer write_file / str_replace / list_dir over talking about work. When the user asks you to create something, actually write it into output/ or workspace/. Put finished deliverables in output/ AND copy a final version into the employee outbox when it is granted.

Paths you may use:
- workspace: ${bot.workspacePath}
- output: ${bot.outputPath}
- memory: ${bot.memoryPath}
${shared ? `- department shared: ${shared}` : "- department shared: not granted"}
${outbox ? `- outbox: ${outbox}` : ""}

Current workspace tree:
${tree}

Shared folder:
${sharedTree}

Standing instructions:
${standing}

Memory:
${memory}

Rules:
- Never claim you cannot write files. You can. Use tools.
- Never ask the user to paste file contents you can read yourself.
- Keep replies concise. After tools, summarize what you wrote and where.
- If another agent is mentioned with @Name, the UI will write a handoff file. You may also write a task note into the shared folder.
- Do not invent network access. Web search is ${s.settings.webSearchEnabled ? "enabled" : "disabled"}.
- Stay inside granted folders.`;
}

export function rosterBlurb(s: AppSnapshot): string {
  return s.bots
    .filter((b) => !b.hidden)
    .map((b) => `@${b.name} — ${b.job}`)
    .join("\n");
}
