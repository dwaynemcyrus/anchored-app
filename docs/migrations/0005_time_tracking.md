# Migration 0005 — Time Tracking Tables

Purpose: Add time tracking tables aligned with docs/builds/time-tracking-spec-v1.md.

## Tables
### time_entries
- id (uuid, pk, default `gen_random_uuid()`)
- user_id (uuid, not null, FK → `auth.users(id)`, cascade delete)
- entity_id (uuid, not null) -- references `documents.id` or `activities.id`
- entity_type (text, not null) -- task, project, habit, note, activity
- started_at (timestamptz, not null)
- ended_at (timestamptz, null)
- duration_ms (int, null)
- note (text, null)
- source (text, null)
- created_at (timestamptz, not null, default `now()`)

### activities
- id (uuid, pk, default `gen_random_uuid()`)
- user_id (uuid, not null, FK → `auth.users(id)`, cascade delete)
- name (text, not null)
- status (text, not null, default `active`)
- created_at (timestamptz, not null, default `now()`)
- updated_at (timestamptz, not null, default `now()`)

## Indexes
- time_entries_user_id_idx on `time_entries(user_id)`
- time_entries_entity_idx on `time_entries(entity_type, entity_id)`
- time_entries_started_at_idx on `time_entries(started_at)`
- activities_user_id_idx on `activities(user_id)`
- activities_status_idx on `activities(status)`

## Constraints
- Unique partial index to ensure one running timer per user:
  - `unique (user_id) where ended_at is null`

## RLS Policies
- Enable RLS on `time_entries` and `activities`
- `time_entries_*_own`: `user_id = auth.uid()` for select/insert/update/delete
- `activities_*_own`: `user_id = auth.uid()` for select/insert/update/delete

## Notes
- No UI changes in this migration; app logic uses Supabase client helpers.
