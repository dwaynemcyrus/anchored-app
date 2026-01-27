-- Add owner_id + deleted_at and update RLS

begin;

-- Add owner_id columns
alter table public.documents
  add column if not exists owner_id uuid;

alter table public.document_bodies
  add column if not exists owner_id uuid;

-- Backfill owner_id from user_id
update public.documents
set owner_id = user_id
where owner_id is null;

update public.document_bodies b
set owner_id = d.user_id
from public.documents d
where b.owner_id is null
  and b.document_id = d.id;

-- Enforce owner_id not null
alter table public.documents
  alter column owner_id set not null;

alter table public.document_bodies
  alter column owner_id set not null;

-- Add deleted_at tombstone
alter table public.documents
  add column if not exists deleted_at timestamptz;

-- Indexes
create index if not exists documents_owner_updated_idx
  on public.documents (owner_id, updated_at);

create index if not exists documents_owner_deleted_idx
  on public.documents (owner_id, deleted_at);

create index if not exists document_bodies_owner_idx
  on public.document_bodies (owner_id);

-- Replace policies to use owner_id
alter table public.documents enable row level security;
alter table public.document_bodies enable row level security;

drop policy if exists documents_select_own on public.documents;
drop policy if exists documents_insert_own on public.documents;
drop policy if exists documents_update_own on public.documents;
drop policy if exists documents_delete_own on public.documents;

drop policy if exists document_bodies_select_own on public.document_bodies;
drop policy if exists document_bodies_insert_own on public.document_bodies;
drop policy if exists document_bodies_update_own on public.document_bodies;
drop policy if exists document_bodies_delete_own on public.document_bodies;

create policy documents_select_own
  on public.documents
  for select
  using (owner_id = auth.uid());

create policy documents_insert_own
  on public.documents
  for insert
  with check (owner_id = auth.uid());

create policy documents_update_own
  on public.documents
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- No delete policy: disallow hard deletes

create policy document_bodies_select_own
  on public.document_bodies
  for select
  using (owner_id = auth.uid());

create policy document_bodies_insert_own
  on public.document_bodies
  for insert
  with check (owner_id = auth.uid());

create policy document_bodies_update_own
  on public.document_bodies
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- No delete policy: disallow hard deletes

commit;
