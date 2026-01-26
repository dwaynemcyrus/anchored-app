-- Documents + document bodies (core)
-- Aligns with docs/database-schema-gpt-ref.md and hybrid-sync spec

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  subtype text null,
  title text null,
  status text not null default 'active',
  tags text[] not null default '{}',
  frontmatter jsonb not null default '{}'::jsonb,
  due_at timestamptz null,
  priority int null,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_bodies (
  document_id uuid primary key references public.documents(id) on delete cascade,
  content text not null,
  updated_at timestamptz not null default now()
);

create index if not exists documents_user_id_idx on public.documents (user_id);
create index if not exists documents_type_idx on public.documents (type);
create index if not exists documents_subtype_idx on public.documents (subtype);
create index if not exists documents_status_idx on public.documents (status);
create index if not exists documents_updated_at_idx on public.documents (updated_at);
create index if not exists documents_tags_gin_idx on public.documents using gin (tags);

alter table public.documents enable row level security;
alter table public.document_bodies enable row level security;

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

create policy documents_delete_own
  on public.documents
  for delete
  using (user_id = auth.uid());

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

create policy document_bodies_delete_own
  on public.document_bodies
  for delete
  using (
    exists (
      select 1
      from public.documents
      where public.documents.id = public.document_bodies.document_id
        and public.documents.user_id = auth.uid()
    )
  );
