# Build Spec — Time Tracking v1

Purpose:
Define time tracking tables aligned with the reference schema. Time entries log behavior over time.

Builds on:
- `docs/database-schema-gpt-ref.md`
- `docs/builds/supabase-setup-migrations-spec-v1.md`

---

## 0) Scope / Non-Goals

### In scope
- `time_entries` table
- Optional `activities` table
- RLS policies and indexes
- One running timer constraint per user (v1)

### Not in scope
- Timer UI or start/stop logic
- Time summaries or reports
- Billing or invoicing

---

## 1) Data Model

### `time_entries`

Fields:
- `id` uuid PK default `gen_random_uuid()`
- `user_id` uuid not null references `auth.users(id)`
- `entity_id` uuid not null (references `documents.id` or `activities.id`)
- `entity_type` text not null (e.g., task, project, habit, activity)
- `started_at` timestamptz not null
- `ended_at` timestamptz null
- `duration_ms` int null
- `note` text null
- `source` text null
- `created_at` timestamptz default now()

Indexes:
- `time_entries_user_id_idx` on `user_id`
- `time_entries_entity_idx` on (`entity_type`, `entity_id`)
- `time_entries_started_at_idx` on `started_at`

Constraint:
- Unique partial index for running timer:
  - `unique (user_id) where ended_at is null`

### `activities` (optional)

Fields:
- `id` uuid PK default `gen_random_uuid()`
- `user_id` uuid not null references `auth.users(id)`
- `name` text not null
- `status` text default 'active'
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Indexes:
- `activities_user_id_idx` on `user_id`
- `activities_status_idx` on `status`

---

## 2) RLS Policies

Enable RLS for all time tracking tables.

Policies:
- `time_entries_*_own`: `user_id = auth.uid()`
- `activities_*_own`: `user_id = auth.uid()`

---

## 3) Acceptance Criteria

- [ ] Time entries can be created per user
- [ ] Only one running timer per user is allowed
- [ ] Entity links are queryable by type/id
- [ ] Owner-only access enforced via RLS

---

## 4) Decisions Log

| Question | Decision |
| --- | --- |
| Time entries model | Append-only log |
| Running timer | Unique partial index |
| Activities table | Optional but specified |

---

END SPEC
