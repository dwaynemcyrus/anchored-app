# Build Spec — Task Structure v1

Purpose:
Define task-only structure tables for checklists and task dependencies. Tasks and projects remain `documents`.

Builds on:
- `docs/database-schema-gpt-ref.md`
- `docs/builds/supabase-setup-migrations-spec-v1.md`

---

## 0) Scope / Non-Goals

### In scope
- `checklist_items` table (task subtasks)
- `task_dependencies` table (blocked-by relationships)
- RLS policies and indexes

### Not in scope
- Task UI or workflow changes
- Task scheduling logic or reminders
- Cross-user assignment

---

## 1) Data Model

### `checklist_items`

Fields:
- `id` uuid PK default `gen_random_uuid()`
- `user_id` uuid not null references `auth.users(id)`
- `task_id` uuid not null references `documents(id)` on delete cascade
- `text` text not null
- `is_done` boolean default false
- `sort_order` int default 0
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Indexes:
- `checklist_items_user_id_idx` on `user_id`
- `checklist_items_task_id_idx` on `task_id`
- `checklist_items_sort_idx` on (`task_id`, `sort_order`)

### `task_dependencies`

Fields:
- `task_id` uuid not null references `documents(id)` on delete cascade
- `depends_on_task_id` uuid not null references `documents(id)` on delete cascade
- `user_id` uuid not null references `auth.users(id)`
- `type` text null
- `created_at` timestamptz default now()

Primary key:
- composite PK (`task_id`, `depends_on_task_id`)

Indexes:
- `task_dependencies_user_id_idx` on `user_id`
- `task_dependencies_task_id_idx` on `task_id`
- `task_dependencies_depends_on_idx` on `depends_on_task_id`

---

## 2) RLS Policies

Enable RLS for both tables.

Policies:
- `checklist_items_*_own`: `user_id = auth.uid()`
- `task_dependencies_*_own`: `user_id = auth.uid()`

---

## 3) Acceptance Criteria

- [ ] Checklist items can be created and queried per task
- [ ] Dependency relationships enforce owner-only access
- [ ] Cascade deletes remove related checklist/dependency rows
- [ ] Indexes exist for task-centric queries

---

## 4) Decisions Log

| Question | Decision |
| --- | --- |
| Tasks & projects location | remain `documents` |
| Dependency direction | `task_id` depends on `depends_on_task_id` |

---

END SPEC
