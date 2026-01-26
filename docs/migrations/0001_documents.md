# Migration 0001 — Documents + Document Bodies

Purpose: Define core document tables for Supabase aligned with `docs/database-schema-gpt-ref.md` and the active hybrid sync spec.

## Environment
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Tables
### documents
- id (uuid, pk, default `gen_random_uuid()`)
- user_id (uuid, not null, FK → `auth.users(id)`, cascade delete)
- type (text, not null)
- subtype (text, null)
- title (text, null)
- status (text, not null, default `active`)
- tags (text[], not null, default `{}`)
- frontmatter (jsonb, not null, default `{}`)
- due_at (timestamptz, null)
- priority (int, null)
- published_at (timestamptz, null)
- created_at (timestamptz, not null, default `now()`)
- updated_at (timestamptz, not null, default `now()`)

### document_bodies
- document_id (uuid, pk, FK → `documents(id)`, cascade delete)
- content (text, not null)
- updated_at (timestamptz, not null, default `now()`)

## Indexes
- documents_user_id_idx on `documents(user_id)`
- documents_type_idx on `documents(type)`
- documents_subtype_idx on `documents(subtype)`
- documents_status_idx on `documents(status)`
- documents_updated_at_idx on `documents(updated_at)`
- documents_tags_gin_idx on `documents` using GIN on `tags`

## RLS Policies
- Enable RLS on `documents` and `document_bodies`
- `documents_*_own`: `user_id = auth.uid()` for select/insert/update/delete
- `document_bodies_*_own`: join to `documents` by `document_id` and match `documents.user_id = auth.uid()` for select/insert/update/delete

## Notes
- This migration defines the tables only. Application code changes are handled in subsequent chunks.
- Optional indexes (frontmatter GIN) are deferred until query patterns need them.
