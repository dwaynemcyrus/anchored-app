# Migration 0006 — Time Entry Events

Purpose: Persist pause/resume timestamps for time entries across devices.

## Tables
### time_entry_events
- id (uuid, pk, default `gen_random_uuid()`)
- user_id (uuid, not null, FK → `auth.users(id)`, cascade delete)
- time_entry_id (uuid, not null, FK → `time_entries(id)`, cascade delete)
- event_type (text, not null) -- start, pause, resume, stop
- event_time (timestamptz, not null)
- created_at (timestamptz, not null, default `now()`)

## Indexes
- time_entry_events_user_id_idx on `time_entry_events(user_id)`
- time_entry_events_entry_idx on `time_entry_events(time_entry_id)`
- time_entry_events_time_idx on `time_entry_events(event_time)`

## RLS Policies
- Enable RLS on `time_entry_events`
- `time_entry_events_*_own`: `user_id = auth.uid()` for select/insert/update/delete

## Notes
- Events are append-only; updates are not expected.
