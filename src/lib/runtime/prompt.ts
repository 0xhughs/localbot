import { getCatalogModel } from "@/lib/catalog";
import { folderFor, SCOPE_META, type FoldersConfig, type ScopeId } from "@/lib/fs/scope-model";
import type { AppSnapshot, Bot } from "@/lib/types";
import { resolveBot } from "@/lib/store";

export type ScopeTrees = Partial<Record<ScopeId, string>>;

function scopeLine(bot: Bot, folders: FoldersConfig | null, scope: ScopeId): string {
  const meta = SCOPE_META[scope];
  if (scope === "private") {
    return `- private/ — your own folder (${meta.blurb}) Memory lives in private/memory/notes.md, deliverables in private/output/.`;
  }
  const connected = Boolean(folders && folderFor(folders, scope));
  if (!connected) return `- ${scope}/ — not connected on this computer.`;
  if (!bot.scopes.includes(scope)) return `- ${scope}/ — connected, but not granted to you.`;
  return `- ${scope}/ — ${meta.blurb}`;
}

export function buildSystemPrompt(
  s: AppSnapshot & { folders: FoldersConfig | null },
  bot: Bot,
  extras: {
    memory: string;
    standing: string;
    trees: ScopeTrees;
  },
): string {
  const ctx = resolveBot(s, bot.id);
  if (!ctx) return "You are a LocalBot agent.";
  const model = getCatalogModel(bot.modelId);
  const modelName = model?.name ?? bot.modelId;

  const scopeLines = (["private", "employee-shared", "department-shared", "company-shared"] as ScopeId[])
    .map((sc) => scopeLine(bot, s.folders, sc))
    .join("\n");

  const treeBlocks = Object.entries(extras.trees)
    .map(([scope, tree]) => `${scope}/ tree:\n${tree}`)
    .join("\n\n");

  return `You are ${bot.name}, a LocalBot agent in a desktop app.
Job: ${bot.job}
Chat model: local GGUF (${modelName})
Employee: ${ctx.employee.displayName}
Department: ${ctx.department.name}
Company: ${ctx.company.name}

You do real work by calling tools. Prefer write_file / str_replace / list_dir over talking about work. When the user asks you to create something, actually write it.

Folders. Every tool path starts with one of these four names; a bare filename like hello.md means private/hello.md:
${scopeLines}

Never use absolute paths, drive letters, or "..". You will not see where these folders live on disk; that is by design.

${treeBlocks}

Standing instructions:
${extras.standing}

Memory:
${extras.memory}

Rules:
- Never claim you cannot write files. You can. Use tools.
- Put finished deliverables in private/output/. Put work for other people in a shared folder that is connected and granted.
- Never ask the user to paste file contents you can read yourself.
- Keep replies concise. After tools, summarize what you wrote and where, using the scope/ path.
- If another agent is mentioned with @Name, the UI writes a handoff task file into a shared folder. You may also write a task note there yourself.
- Do not invent network access. Web search is ${s.settings.webSearchEnabled ? "enabled" : "disabled"}.
- Stay inside your granted folders.`;
}

export function rosterBlurb(s: AppSnapshot): string {
  return s.bots
    .filter((b) => !b.hidden && !b.archived)
    .map((b) => `@${b.name} — ${b.job}`)
    .join("\n");
}
