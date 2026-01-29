-- Remove owner_id usage and revert RLS to user_id

begin;

-- Replace policies to use user_id
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

-- Drop owner_id indexes
drop index if exists documents_owner_updated_idx;
drop index if exists documents_owner_deleted_idx;
drop index if exists documents_owner_synced_idx;
drop index if exists document_bodies_owner_idx;
drop index if exists document_bodies_owner_synced_idx;

-- Drop owner_id columns
alter table public.document_bodies
  drop column if exists owner_id;

alter table public.documents
  drop column if exists owner_id;

-- Add user_id composite indexes for common access patterns
create index if not exists documents_user_updated_idx
  on public.documents (user_id, updated_at);

create index if not exists documents_user_deleted_idx
  on public.documents (user_id, deleted_at);

create index if not exists documents_user_synced_idx
  on public.documents (user_id, synced_at);

create policy documents_select_own
  on public.documents
  for select
  using (user_id = auth.uid());

create policy documents_insert_own
  on public.documents
  for insert
  with check (user_id = auth.uid());

create policy documents_update_own
  on public.documents
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No delete policy: disallow hard deletes

create policy document_bodies_select_own
  on public.document_bodies
  for select
  using (
    exists (
      select 1
      from public.documents
      where public.documents.id = public.document_bodies.document_id
        and public.documents.user_id = auth.uid()
    )
  );

create policy document_bodies_insert_own
  on public.document_bodies
  for insert
  with check (
    exists (
      select 1
      from public.documents
      where public.documents.id = public.document_bodies.document_id
        and public.documents.user_id = auth.uid()
    )
  );

create policy document_bodies_update_own
  on public.document_bodies
  for update
  using (
    exists (
      select 1
      from public.documents
      where public.documents.id = public.document_bodies.document_id
        and public.documents.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.documents
      where public.documents.id = public.document_bodies.document_id
        and public.documents.user_id = auth.uid()
    )
  );

-- No delete policy: disallow hard deletes

commit;
