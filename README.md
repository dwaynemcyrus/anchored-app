# Codex Project Templates

A small system for defining and building a coding project with Codex.

You do not need to make every technical decision yourself. Start with the
overview interview, approve the result, and let Codex prepare the technical
contract and build plan.

## The project documents

| File | Purpose | Who maintains it |
|---|---|---|
| `OVERVIEW.md` | What to build and why | Human and Codex together |
| `PROJECT.md` | Technical contract | Codex, reviewed by the human |
| `AGENTS.md` | How Codex must work | Template owner |
| `PLANS.md` | Plan for large or risky work | Codex |
| `CHANGELOG.md` | Notable unreleased and released changes | Codex |

Optional guides add specialized frontend, data, or deployment rules.
This `README.md` is the setup guide; it does not replace the new project's
own README once implementation begins.

## Step 1 — Add the templates

Put these files at the root of the new project:

```text
AGENTS.md
OVERVIEW.md
PROJECT.md
PLANS.md
CHANGELOG.md
```

Copy the optional guides into the project like this:

```text
docs/
└── ai/
    ├── frontend.md
    ├── data.md
    └── deployment.md
```

It is fine to copy all three. Codex will list only relevant guides as
active in `PROJECT.md`.

## Step 2 — Prepare Git

For a brand-new project, run:

```sh
git init -b main
git add AGENTS.md OVERVIEW.md PROJECT.md PLANS.md CHANGELOG.md docs/ai
git commit -m "chore: add project templates"
git switch -c feat/initial-build
```

If the project already uses Git, keep its current history. Create or switch
to a relevant task branch before asking Codex to edit files.

## Step 3 — Build the overview with AI

Choose the starting point that matches what you have.

### If you are starting with an idea

Open Codex in the project folder and send:

```text
Read OVERVIEW.md and help me complete it.
Ask no more than three focused questions at a time.
Explain choices in plain language and recommend sensible defaults.
Do not invent answers or begin implementation.
```

Codex will interview you and update `OVERVIEW.md`.

### If you already have a brief or overview

Put the document in the project, then send:

```text
Read [PATH TO DOCUMENT] completely and preserve it as the source brief.
Use it to complete OVERVIEW.md.
Ask no more than three focused questions at a time for missing information.
Mark unsupported assumptions and decisions. Do not begin implementation.
```

Review the finished overview. Resolve important `[NEEDS DECISION]` items,
then tell Codex that the overview is approved.

## Step 4 — Generate the project setup

Send this after approving the overview:

```text
The overview is approved.
Initialize the project from OVERVIEW.md.
Complete PROJECT.md, select the active optional guides, and create a plan
in PLANS.md when required. Report any blocking decisions. If none remain,
begin the first verified implementation chunk and continue automatically.
```

Codex will:

1. Read the approved overview and any referenced source documents.
2. Inspect the repository and existing tools.
3. Complete `PROJECT.md` without guessing missing facts.
4. Activate only the relevant optional guides.
5. Create or update `PLANS.md` when the build is large or risky.
6. Commit the approved setup documents in focused chunks.
7. Build automatically in small, tested, regularly committed chunks.

## Step 5 — Review progress

You do not need to approve every ordinary code change. Review the focused
commits regularly and answer only decisions that materially affect scope,
security, data, cost, or production systems.

Before release, confirm:

- [ ] The delivered user journey matches `OVERVIEW.md`.
- [ ] Acceptance criteria in `PROJECT.md` are met.
- [ ] Required checks pass.
- [ ] Changelog entries accurately describe the release.
- [ ] Secrets and production configuration are handled safely.
- [ ] Deployment and rollback steps are understood.

## Keep the documents current

- Update `OVERVIEW.md` when product intent or scope changes.
- Update `PROJECT.md` when architecture, commands, or constraints change.
- Use `PLANS.md` only for active large or risky work.
- Keep optional rules in `docs/ai/`; list only active guides in
  `PROJECT.md`.
- Do not place one project's product or stack rules in `AGENTS.md`.

## Changelog and versions

The root `CHANGELOG.md` follows Keep a Changelog and Semantic Versioning.
Add notable user-visible behavior, APIs, schema or data changes, security,
configuration, dependency, deprecation, removal, and operational changes to
`[Unreleased]` after each related verified chunk. Update it in the same commit
as that work.

The changelog summarizes outcomes that matter to users, integrations, and
operators; it does not duplicate every Git commit. Formatting, routine tests,
minor documentation cleanup, and internal refactors normally stay out unless
their effects are material.

When the human explicitly approves a release, move the relevant
`[Unreleased]` entries into a dated version section and leave a fresh
`[Unreleased]` section. Codex may select an appropriate patch or minor version
only during that approved release. Moving to `1.0.0`, and every later major
version increase, requires explicit human approval.

## Git rules Codex will follow

- Work happens on task branches, not the default branch.
- Each small, verified, coherent chunk receives a commit.
- Commit subjects are at most 44 characters.
- Commit body lines are at most 63 characters.
- Unrelated changes are never included in a commit.
- Pushes, merges, releases, and branch deletion require instruction.
