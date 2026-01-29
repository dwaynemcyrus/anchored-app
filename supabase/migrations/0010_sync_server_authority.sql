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

create or replace function public.touch_document_updated_at()
returns trigger
language plpgsql
as $$
begin
  update public.documents
    set updated_at = now()
    where id = new.document_id;
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

drop trigger if exists document_bodies_touch_document on public.document_bodies;
create trigger document_bodies_touch_document
  after update on public.document_bodies
  for each row
  execute function public.touch_document_updated_at();

commit;
