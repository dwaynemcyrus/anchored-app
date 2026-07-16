# OVERVIEW.md — Project Overview

This document defines what should be built and why. A human and AI should
complete it together before technical planning or implementation.

## Instructions for the AI interviewer

- Read the entire document and any source material first.
- Ask no more than three focused questions at a time.
- Use plain language and explain why a decision matters.
- Recommend a sensible default when useful, including its trade-off.
- Write confirmed answers into this document as the interview progresses.
- Mark unsupported assumptions as `[ASSUMPTION]`.
- Mark important unanswered items as `[NEEDS DECISION]`.
- Do not invent users, requirements, claims, integrations, or constraints.
- Do not begin implementation until the human approves the overview.

## Status and sources

- **Status:** [draft | approved]
- **Owner:** [REQUIRED]
- **Last reviewed:** [YYYY-MM-DD]
- **Source documents or links:** [none | paths or links]

## 1. Project

- **Working name:** [REQUIRED]
- **One-sentence description:** [REQUIRED]
- **Why should this exist?** [REQUIRED]
- **Project stage:** [idea | prototype | MVP | existing product]

## 2. Users and problem

- **Primary users:** [REQUIRED]
- **Problem they have:** [REQUIRED]
- **Current alternative or workaround:** [REQUIRED or unknown]
- **Outcome they need:** [REQUIRED]

## 3. Main user journey

Describe the most important path through the product:

1. [REQUIRED]
2. [REQUIRED]
3. [REQUIRED]

## 4. First-version requirements

List only what the first useful version must include:

- [REQUIRED]

## 5. Non-goals

List what must not be built yet:

- [REQUIRED]

## 6. Product behavior

- **User accounts:** [yes | no | unknown]
- **Stored data:** [yes | no | unknown; describe if yes]
- **Payments:** [yes | no | unknown]
- **External services:** [none | known services | unknown]
- **Notifications or email:** [none | describe | unknown]
- **Administrative tools:** [none | describe | unknown]

Use `[NEEDS DECISION]` when an answer affects scope but is not known.

## 7. Platform and design

- **Product type:** [website | web app | mobile | API | desktop | other]
- **Required devices or browsers:** [REQUIRED]
- **Visual direction:** [REQUIRED]
- **Brand/design references:** [none | paths or links]
- **Accessibility needs:** [REQUIRED or ask AI to recommend]
- **Content or assets already available:** [none | paths or links]

## 8. Constraints and risks

- **Deadline or milestones:** [none | REQUIRED]
- **Budget or service limits:** [none | REQUIRED]
- **Required technologies:** [none | REQUIRED]
- **Forbidden technologies:** [none | REQUIRED]
- **Privacy, legal, or compliance needs:** [none known | REQUIRED]
- **Security concerns:** [none known | REQUIRED]

## 9. Success and acceptance

The first version is successful when:

- [REQUIRED measurable outcome]

It is ready for handoff or release when:

- [REQUIRED observable acceptance criterion]

## 10. Assumptions and open decisions

### Assumptions

- None, or: `[ASSUMPTION] Describe the assumption.`

### Needs a decision

- None, or: `[NEEDS DECISION] Describe the decision.`

## Overview readiness check

Before changing the status to `approved`, confirm:

- [ ] The primary user, problem, and outcome are clear.
- [ ] The main user journey is understandable.
- [ ] First-version requirements and non-goals are separated.
- [ ] Accounts, data, payments, and integrations are addressed.
- [ ] Platform, design, and important constraints are addressed.
- [ ] Success and acceptance criteria are observable.
- [ ] Assumptions are visible.
- [ ] No blocking `[NEEDS DECISION]` items remain.
- [ ] The human explicitly approved this overview.
