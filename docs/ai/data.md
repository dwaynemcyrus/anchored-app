# Data Guide

Activate this guide when the project stores persistent data.

## Before changing data

- Inspect the current schema, migrations, access rules, and query paths.
- Identify the source of truth and every reader/writer affected.
- Describe the schema change, compatibility impact, and rollback.
- Never infer production data shape from application types alone.

## Schema and migrations

- Make schema changes through versioned migrations.
- Prefer backward-compatible, staged changes for live systems.
- Separate destructive cleanup from the compatibility release.
- Add constraints for invariants the database must enforce.
- Add indexes only for demonstrated access patterns.
- Keep application types, validation, fixtures, and docs synchronized.
- Make migrations safe to retry when the platform supports it.
- Never edit an already-applied migration to change production history.

Ask before migrations that may delete, rewrite, expose, or irreversibly
transform stored data.

## Access and privacy

- Deny access by default and grant the minimum required permissions.
- Enforce ownership and tenant boundaries in the trusted data layer.
- Treat authorization checks as server-side requirements.
- Do not log secrets, tokens, or personal record contents.
- Document retention, deletion, backup, and restoration requirements.
- Use synthetic or anonymized data in development and tests.

## Queries and consistency

- Avoid unbounded reads and repeated per-record queries.
- Use transactions where operations must succeed or fail together.
- Define concurrency and conflict behavior explicitly.
- Validate external input before persistence.
- Return only fields the caller needs.

## Verification

- run migrations against a disposable or approved local database
- test upgrade and rollback paths when rollback is supported
- test constraints, permissions, ownership, and tenant isolation
- test empty, duplicate, concurrent, and invalid inputs
- inspect important query plans when performance is material
- run configured application checks and affected integration tests

Never run a data-changing command against production without explicit
authorization and a verified recovery plan.

