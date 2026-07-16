# PROJECT.md — Project Contract

Codex completes this technical contract from the approved `OVERVIEW.md`,
referenced source documents, and repository inspection. Delete sections
that do not apply. Do not invent values to remove placeholders.

## Source and status

- **Overview:** `OVERVIEW.md`
- **Overview status:** [approved]
- **Additional source documents:** [none | paths or links]
- **Contract last reviewed:** [YYYY-MM-DD]
- **Blocking decisions:** [none | REQUIRED]

## Identity

- **Name:** [REQUIRED]
- **One-sentence purpose:** [REQUIRED]
- **Stage:** [prototype | MVP | production | maintenance]
- **Owner:** [REQUIRED]

## Users and outcomes

- **Primary users:** [REQUIRED]
- **Problem:** [REQUIRED]
- **Successful outcome:** [REQUIRED]
- **Primary user journey:** [REQUIRED]

## Scope

### Goals

- [REQUIRED]

### Non-goals

- [REQUIRED]

### Acceptance criteria

- [REQUIRED]

## Stack

- **Language:** [REQUIRED]
- **Framework/runtime:** [REQUIRED]
- **Package manager:** [REQUIRED]
- **Database:** [none | REQUIRED]
- **Hosting:** [local only | REQUIRED]
- **External services:** [none | REQUIRED]

New dependencies or services require a clear reason. Paid services require
human approval.

## Repository structure

```text
[List important folders and what owns each responsibility.]
```

## Commands

Use commands that exist in the repository.

| Purpose | Command |
|---|---|
| Install | `[REQUIRED]` |
| Develop | `[REQUIRED]` |
| Format/check | `[REQUIRED or none]` |
| Lint | `[REQUIRED or none]` |
| Type-check | `[REQUIRED or none]` |
| Test | `[REQUIRED or none]` |
| Build | `[REQUIRED or none]` |

## Architecture and boundaries

- **Entry points:** [REQUIRED]
- **Main modules:** [REQUIRED]
- **Source of truth:** [REQUIRED]
- **Public APIs/contracts:** [none | REQUIRED]
- **Patterns to follow:** [REQUIRED]
- **Patterns to avoid:** [REQUIRED]

## Data and security

- **Stored data:** [none | REQUIRED]
- **Sensitive data:** [none | REQUIRED]
- **Authentication/authorization:** [none | REQUIRED]
- **Validation boundaries:** [REQUIRED]
- **Backup/migration approach:** [not applicable | REQUIRED]
- **Privacy or compliance needs:** [none | REQUIRED]

## Product and design rules

- **Supported platforms/viewports:** [REQUIRED]
- **Accessibility target:** [for example, WCAG 2.2 AA]
- **Design system location:** [none | REQUIRED]
- **Performance targets:** [REQUIRED]
- **Critical product rules:** [REQUIRED]

## Environments and delivery

- **Environments:** [local | staging | production]
- **Environment variable source:** [REQUIRED]
- **CI provider:** [none | REQUIRED]
- **Deployment method:** [REQUIRED]
- **Rollback method:** [REQUIRED]

## Active guides

List only guides relevant to this project. Copied guides that are not
listed here are inactive and should not be loaded:

- `docs/ai/frontend.md`
- `docs/ai/data.md`
- `docs/ai/deployment.md`

Delete irrelevant entries. Write `none` when no optional guide is active.

## Known risks and constraints

- [none | REQUIRED]

## Decisions

Record decisions that future work must preserve.

| Date | Decision | Reason |
|---|---|---|
| YYYY-MM-DD | [decision] | [source or trade-off] |
