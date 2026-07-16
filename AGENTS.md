# AGENTS.md — Codex Project Rules

This file defines reusable behavior. Project facts belong in `PROJECT.md`.

## Read first

Before acting, read in this order:

1. `AGENTS.md`
2. `OVERVIEW.md`
3. `PROJECT.md`
4. Any files listed under **Active guides** in `PROJECT.md`
5. `PLANS.md` when the work qualifies for a written plan

Explicit user instructions have priority. Never weaken safety, privacy,
or data-protection requirements because of a lower-priority document.

## Overview interview mode

Enter this mode when the user asks for help defining the project or when
`OVERVIEW.md` is still a draft.

1. Read `OVERVIEW.md` and all source documents named by the user.
2. Ask no more than three focused questions at a time.
3. Explain choices in plain language and recommend sensible defaults.
4. Update `OVERVIEW.md` with confirmed answers after each round.
5. Mark unsupported assumptions as `[ASSUMPTION]` and important unknowns
   as `[NEEDS DECISION]`.
6. Check the overview against its readiness checklist.
7. Do not begin technical setup or implementation until the human
   explicitly approves the overview.

If the user supplies an existing brief instead, preserve it as a source
document and use it to complete `OVERVIEW.md`. Do not replace source intent
with a technical preference.

## Project bootstrap mode

Enter this mode after the human approves `OVERVIEW.md`.

1. Record the overview status as approved and set its review date.
2. Read the approved overview and every referenced source document.
3. Inspect the repository, Git state, existing code, and available tools.
4. Complete `PROJECT.md` using confirmed facts from those sources and the
   repository. Do not copy unnecessary narrative into it.
5. Recommend technical choices when the overview permits them. Record the
   choice, reason, and any material trade-off.
6. List only relevant optional guides under **Active guides**.
7. Create or update `PLANS.md` when the planning rules require it.
8. Report assumptions and decisions that block safe implementation.
9. If no blockers remain, begin implementation and continue automatically.

Commit the approved overview, project contract, and plan as focused setup
chunks before committing implementation work.

## Working method

1. Inspect the repository, current branch, working tree, relevant files,
   and available scripts before changing anything.
2. For non-trivial work, state a short plan and continue automatically.
   Do not wait for approval between ordinary implementation chunks.
3. Make the smallest complete change that satisfies the request.
4. Keep each chunk coherent and normally limited to 1–4 related files.
5. Run the relevant quality gates after every chunk.
6. Commit every verified chunk before starting the next one.
7. Finish with a concise summary, files changed, checks run,
   assumptions, commit list, and remaining risks.

Preserve existing user changes. Do not refactor unrelated code or silently
expand scope.

## When to ask first

Proceed automatically with routine, reversible, in-scope work. Ask before:

- destructive operations or rewriting Git history
- production deployments, releases, DNS, or infrastructure changes
- migrations that may delete, transform, or expose stored data
- authentication, authorization, or security-model changes
- adding paid services or handling new secrets
- materially changing public APIs or the approved product scope

If requirements are ambiguous, inspect available context first. Ask only
when different answers would materially change the result.

## Branch workflow

- Confirm the repository boundary before editing.
- If Git is missing, stop and ask the human to complete repository setup.
- If on the default branch, create a focused task branch before changes.
- If already on a relevant task branch, continue there.
- Use `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, or `chore/` plus a
  short kebab-case name.
- Do not create redundant nested branches.
- Do not push, merge, rebase, delete branches, or open a pull request
  unless instructed.

Examples:

```text
feat/account-settings
fix/session-timeout
docs/api-setup
```

## Commit workflow

Commit frequently so every change is easy to review, revert, or
cherry-pick.

- Commit after each verified, coherent chunk.
- Stage only files belonging to that chunk.
- Never include unrelated or pre-existing user changes.
- Use Conventional Commits: `type(scope): description`.
- The complete subject line must be at most 44 characters.
- Every commit body line must be at most 63 characters.
- Use a body only when the reason, risk, or migration needs explanation.
- Do not use `--no-verify` or amend published commits unless instructed.

Before committing, inspect the staged diff and rerun the relevant checks.

## Planning

Use a short plan in the conversation for ordinary multi-step work. Use
`PLANS.md` when work:

- spans multiple subsystems or sessions
- requires a migration or staged rollout
- is expected to touch more than five files
- has meaningful security, data, or rollback risk
- is explicitly requested as a project plan

Keep the plan current while working. A plan is not an approval gate unless
the task includes a high-impact action listed above.

## Implementation standards

- Follow established repository patterns before introducing new ones.
- Prefer explicit, readable code over clever abstractions.
- Avoid new dependencies when the platform or existing stack is enough.
- Validate inputs at system boundaries.
- Keep secrets out of source, logs, tests, and client bundles.
- Update types, validation, behavior, tests, and documentation together.
- Add comments only when they explain a non-obvious decision.
- Do not invent APIs, services, credentials, or product requirements.

## Quality gates

Detect commands from the repository and `PROJECT.md`.

For every code change, run all configured gates that apply:

1. formatting or format check
2. lint
3. type-check
4. targeted tests
5. full tests when risk warrants it
6. production build for build, routing, or integration changes

For UI changes, also verify the affected flow at relevant viewport sizes,
with keyboard navigation, and for visible loading, empty, error, and
success states.

If a gate fails, diagnose and fix failures caused by the current work.
Stop only when the remaining fix is unsafe, outside scope, or needs a
material product decision. Report any pre-existing failure clearly.

Never claim a check passed unless it was run successfully.

## Definition of done

Work is complete only when:

- acceptance criteria are met
- relevant checks pass
- documentation matches changed behavior
- no debug code, secrets, or accidental files remain
- the final diff contains only intended changes
- verified chunks have focused commits
- remaining assumptions and risks are reported
