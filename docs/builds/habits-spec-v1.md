# Build Spec — Habits v1

Purpose:
Define habit definition + logging tables. Habits are not documents.

Builds on:
- `docs/database-schema-gpt-ref.md`
- `docs/builds/supabase-setup-migrations-spec-v1.md`

---

## 0) Scope / Non-Goals

### In scope
- `habits` table (definitions)
- `habit_logs` table (daily/period logs)
- RLS policies and indexes

### Not in scope
- Streak calculation logic
- Habit templates or coaching logic
- Cross-user sharing

---

## 1) Data Model

### `habits`

Fields:
- `id` uuid PK default `gen_random_uuid()`
- `user_id` uuid not null references `auth.users(id)`
- `name` text not null
- `status` text default 'active'
- `cadence` text not null (e.g., daily, weekly)
- `target` int null
- `schedule` jsonb default '{}'::jsonb
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Indexes:
- `habits_user_id_idx` on `user_id`
- `habits_status_idx` on `status`

### `habit_logs`

Fields:
- `habit_id` uuid not null references `habits(id)` on delete cascade
- `date` date not null
- `value` int null
- `is_complete` boolean default false
- `note` text null
- `created_at` timestamptz default now()

Primary key:
- composite PK (`habit_id`, `date`)

Indexes:
- `habit_logs_habit_id_idx` on `habit_id`
- `habit_logs_date_idx` on `date`

---

## 2) RLS Policies

Enable RLS for both tables.

Policies:
- `habits_*_own`: `user_id = auth.uid()`
- `habit_logs_*_own`: join `habits` on `habit_id` and check `user_id`

---

## 3) Acceptance Criteria

- [ ] Habits can be created and queried per user
- [ ] Logs enforce owner-only access via join
- [ ] Logs are unique per habit per date
- [ ] Cascade deletes remove habit logs

---

## 4) Decisions Log

| Question | Decision |
| --- | --- |
| Habits as documents | No (separate tables) |
| Log granularity | Date-based primary key |

---

END SPEC
