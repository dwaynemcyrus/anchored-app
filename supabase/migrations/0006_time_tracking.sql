-- Time tracking tables (time_entries + activities)

begin;

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null,
  entity_type text not null,
  started_at timestamptz not null,
  ended_at timestamptz null,
  duration_ms int null,
  note text null,
  source text null,
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists time_entries_user_id_idx
  on public.time_entries (user_id);

create index if not exists time_entries_entity_idx
  on public.time_entries (entity_type, entity_id);

create index if not exists time_entries_started_at_idx
  on public.time_entries (started_at);

create unique index if not exists time_entries_running_unique_idx
  on public.time_entries (user_id)
  where ended_at is null;

create index if not exists activities_user_id_idx
  on public.activities (user_id);

create index if not exists activities_status_idx
  on public.activities (status);

alter table public.time_entries enable row level security;
alter table public.activities enable row level security;

-- Replace policies to ensure user_id = auth.uid()
drop policy if exists time_entries_select_own on public.time_entries;
drop policy if exists time_entries_insert_own on public.time_entries;
drop policy if exists time_entries_update_own on public.time_entries;
drop policy if exists time_entries_delete_own on public.time_entries;

create policy time_entries_select_own
  on public.time_entries
  for select
  using (user_id = auth.uid());

create policy time_entries_insert_own
  on public.time_entries
  for insert
  with check (user_id = auth.uid());

create policy time_entries_update_own
  on public.time_entries
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy time_entries_delete_own
  on public.time_entries
  for delete
  using (user_id = auth.uid());

-- Activities policies
drop policy if exists activities_select_own on public.activities;
drop policy if exists activities_insert_own on public.activities;
drop policy if exists activities_update_own on public.activities;
drop policy if exists activities_delete_own on public.activities;

create policy activities_select_own
  on public.activities
  for select
  using (user_id = auth.uid());

create policy activities_insert_own
  on public.activities
  for insert
  with check (user_id = auth.uid());

create policy activities_update_own
  on public.activities
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy activities_delete_own
  on public.activities
  for delete
  using (user_id = auth.uid());

commit;
