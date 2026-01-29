-- Server-authoritative sync helpers

begin;

alter table public.document_bodies
  add column if not exists version int not null default 1;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row
  execute function public.set_updated_at();

drop trigger if exists document_bodies_set_updated_at on public.document_bodies;
create trigger document_bodies_set_updated_at
  before update on public.document_bodies
  for each row
  execute function public.set_updated_at();

commit;
