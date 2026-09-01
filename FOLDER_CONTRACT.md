# Folder contract

Work product lives on **disk** under the configured company root. Browser state (agents, chats, pins, grants) stays in `localStorage`. File bodies are not stored in the browser.

## Trees

Server config:

```
{cwd}/data/localbot-config.json    # company root, models dir, active GGUF, demo switches
```

Models (not under the company root):

```
{cwd}/data/LocalBot/models/{filename}.gguf
{cwd}/data/LocalBot/bin/llama-b10749/    # official llama.cpp CPU build
```

Company root (default `{cwd}/data/LocalBot/{CompanyName}`):

```
{CompanyRoot}/
  company.json
  shared/
  departments/
    {DepartmentName}/
      department.json
      shared/
      people/
        {EmployeeName}/
          employee.json
          inbox/
          outbox/
          bots/
            {BotName}/
              bot.json
              AGENTS.md
              memory/
              workspace/
              output/
```

## JSON

`company.json` — company name, catalog pin, default department.

`bot.json` — name, job, model id, color, grants.

`localbot-config.json` — `companyRoot`, `modelsDir`, `activeModelId`, `activeModelPath`, `allowHostedDemo`, `useExistingOllama`.

## Grants

Default first agent: `workspace`, `output`, `shared`, `outbox`. Writes outside the company root or outside grants are denied on the server.

Two people share work only if this process and theirs point at the **same real folder** on the machine running the server.
