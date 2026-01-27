-- Add optimistic concurrency version column

begin;

alter table public.documents
  add column if not exists version int not null default 1;

commit;
