-- Drop tags column from documents (tags now live in frontmatter)

begin;

-- Remove index if it exists
 drop index if exists public.documents_tags_gin_idx;

-- Drop tags column
 alter table public.documents drop column if exists tags;

commit;
