-- Add client_id + synced_at for sync tracking

begin;

alter table public.documents
  add column if not exists client_id text,
  add column if not exists synced_at timestamptz;

alter table public.document_bodies
  add column if not exists client_id text,
  add column if not exists synced_at timestamptz;

create index if not exists documents_owner_synced_idx
  on public.documents (owner_id, synced_at);

create index if not exists document_bodies_owner_synced_idx
  on public.document_bodies (owner_id, synced_at);

commit;
