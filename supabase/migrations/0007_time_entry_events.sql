-- Time entry events table

begin;

create table if not exists public.time_entry_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  time_entry_id uuid not null references public.time_entries(id) on delete cascade,
  event_type text not null,
  event_time timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists time_entry_events_user_id_idx
  on public.time_entry_events (user_id);

create index if not exists time_entry_events_entry_idx
  on public.time_entry_events (time_entry_id);

create index if not exists time_entry_events_time_idx
  on public.time_entry_events (event_time);

alter table public.time_entry_events enable row level security;

-- Replace policies to ensure user_id = auth.uid()
drop policy if exists time_entry_events_select_own on public.time_entry_events;
drop policy if exists time_entry_events_insert_own on public.time_entry_events;
drop policy if exists time_entry_events_update_own on public.time_entry_events;
drop policy if exists time_entry_events_delete_own on public.time_entry_events;

create policy time_entry_events_select_own
  on public.time_entry_events
  for select
  using (user_id = auth.uid());

create policy time_entry_events_insert_own
  on public.time_entry_events
  for insert
  with check (user_id = auth.uid());

create policy time_entry_events_update_own
  on public.time_entry_events
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy time_entry_events_delete_own
  on public.time_entry_events
  for delete
  using (user_id = auth.uid());

commit;
