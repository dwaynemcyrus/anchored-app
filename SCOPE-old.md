# SCOPE.md — Personal OS (Binding Project Scope)

## Project Definition
This repository is a **brand-new Personal Operating System (OS)** built as a **PWA**.

Primary platform:
- iOS (phone-first)

Secondary platforms:
- Tablet
- Desktop

The system is designed to support:
- thinking
- writing
- planning
- command execution
- long-term knowledge and personal operations

This is not a single feature project.
It is a **foundational OS** that will evolve over time.

---

## Core Principles
- Writing-first
- Clarity over cleverness
- Minimal UI, maximal intent
- Modular features built on a stable shell
- Mobile-first constraints, desktop-capable expansion

---

## In Scope (Project-Level)
- Establishing a foundational UI shell
- Building modular feature areas (e.g. shell, editor, command, knowledge)
- Creating interaction patterns that work across mobile, tablet, and desktop
- Using dummy or placeholder data during early phases
- Incremental feature development via build specs in `/docs/build-specs`

---

## Explicitly Out of Scope (for now)
- Feature completeness
- Performance tuning beyond obvious regressions
- Offline sync guarantees
- Collaboration / multi-user features
- Notifications
- Payments
- Analytics
- Production hardening
- Platform-specific native APIs (beyond PWA requirements)

These may enter scope later via explicit scope updates.

---

## Architecture Constraints
- PWA-first architecture
- Frontend-led development
- Backend services (e.g. Supabase) are optional and must be explicitly activated
- No assumption of auth, persistence, or sync unless stated in a build spec

---

## Allowed Areas
- app/**
- pages/**
- src/**
- components/**
- styles/**
- public/**
- docs/**
- configuration required for PWA and frontend bootstrapping

---

## Disallowed Areas
- Production secrets
- Billing or account configuration
- Infrastructure not directly required for the PWA
- Premature backend schema design

---

## Feature Development Rule
All feature work must be driven by a **single active build spec** located in `/docs/`.

Examples:
- shell-ui-spec.md
- editor-alpha-spec.md
- command-mode-spec.md

At any moment:
- One build spec is active
- All other specs are treated as inactive references

---

## Acceptance Criteria (Project-Level)
- Application boots without errors
- UI patterns remain consistent across features
- Mobile experience is first-class
- Git history remains readable and incremental
- No feature silently expands scope

---

## Scope Evolution Rule
This scope may be updated **only when**:
- the project enters a new phase
- a new system capability is intentionally introduced

Ad-hoc expansion is not allowed.

---

## Conflict Rule
If:
- a build spec conflicts with this scope, or
- an instruction conflicts with this scope

The agent must:
1. Stop
2. Report the conflict
3. Ask for clarification before proceeding