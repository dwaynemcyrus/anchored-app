-- Add time entry lease fields for multi-device timers

begin;

alter table public.time_entries
  add column if not exists client_id text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists lease_token uuid;

create index if not exists time_entries_running_idx
  on public.time_entries (user_id, ended_at, lease_expires_at);

commit;
