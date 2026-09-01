# Folder contract

## Trees

App home:

```
{localbotHome}/          # ~/.localbot
  models/
  sessions/{agentId}/
  logs/
```

Company root (work product — survives uninstall):

```
{CompanyRoot}/
  company.json
  shared/                      # company-wide, only if granted
  departments/
    {DepartmentName}/
      department.json
      shared/                  # any agent in this department may use this if granted
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
              workspace/       # this bot’s private working directory
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

Rules:

- Installing as Employee One creates `{CompanyRoot}/departments/{Dept}/people/{EmployeeOne}/` and at least one bot folder.
- Each bot’s default computer is its `workspace/` folder. It may write there freely after the first grant.
- A bot granted `shared/` can read and write department shared files. Two installs that share the company root can both see those files. The folder is the bus — no chat server.
- A bot may never see another employee’s private `bots/` tree unless an admin grant says so.
- `outbox/` is where finished deliverables land. The UI has Open outbox / Reveal path.
- Filesystem watch: when another agent writes into `shared/`, the file pane refreshes.

## Handoff

`@Name` in the composer writes a task file into department `shared/` and notifies the other agent. No multi-user message server.
