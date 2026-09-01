# Folder contract

Work product lives on **disk** under the configured company root. Browser state (agents, chats, pins, grants) stays in `localStorage`. File bodies are not stored in the browser.

## Trees

Server config:

```
{cwd}/data/localbot-config.json    # chosen absolute company root
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

`employee.json` — display name, department, default model.

`bot.json` — name, job, model id, color, grants, createdAt.

## Grants

| Grant | Path | Default |
|---|---|---|
| workspace | `{bot}/workspace/` | yes |
| output | `{bot}/output/` | yes |
| outbox | `{employee}/outbox/` | yes |
| shared | `{department}/shared/` | yes for first agent |
| company-shared | `{company}/shared/` | no |
| inbox | `{employee}/inbox/` | no |

Writes outside the company root throw. Writes outside the bot’s grants return Denied.

Two installs share files only if they use the same real folder on the machine that runs the server.

`@Name` writes `shared/task-*.md` on disk and notifies the other agent in this browser.
