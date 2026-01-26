# Build Spec — Supabase Setup + Migrations v1

Purpose:
Define Supabase project setup and the initial migration plan for `documents` and `document_bodies`, aligned with `docs/database-schema-gpt-ref.md`.

Builds on:
- `docs/database-schema-gpt-ref.md`
- `docs/builds/hybrid-sync-conflict-spec-v1.md`

---

## 0) Scope / Non-Goals

### In scope
- Supabase project initialization steps
- Environment variable configuration
- SQL migrations for core document tables + indexes
- RLS policies and owner-only access

### Not in scope
- Application code changes
- Data backfill or migration from existing local data
- Full auth UI flows
- Search implementation (FTS/tsvector)

---

## 1) Prerequisites

- Supabase account + project created
- Supabase CLI installed
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` available
- Decide on `user_id` vs `owner_id` column naming (this spec uses `user_id`)

---

## 2) Project Setup

1. Initialize Supabase locally (if using CLI):
   - `npx supabase init`
2. Link project:
   - `npx supabase link --project-ref <project_ref>`
3. Create local migration directory (if not already present):
   - `supabase/migrations`
4. Add env variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 3) Migration: Core Tables

Create a migration file, e.g.:
- `supabase/migrations/0001_documents.sql`

### `documents` table

Fields (minimum):
- `id` uuid PK default `gen_random_uuid()`
- `user_id` uuid not null references `auth.users(id)`
- `type` text not null
- `subtype` text null
- `title` text null
- `status` text default 'active'
- `tags` text[] default '{}'
- `frontmatter` jsonb default '{}'::jsonb
- promoted fields (nullable):
  - `due_at` timestamptz
  - `priority` int
  - `published_at` timestamptz
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

### `document_bodies` table

Fields:
- `document_id` uuid PK references `documents(id)` on delete cascade
- `content` text not null
- `updated_at` timestamptz default now()

---

## 4) Indexes

Create indexes:
- `documents_user_id_idx` on `documents(user_id)`
- `documents_type_idx` on `documents(type)`
- `documents_subtype_idx` on `documents(subtype)`
- `documents_status_idx` on `documents(status)`
- `documents_updated_at_idx` on `documents(updated_at)`
- `documents_tags_gin_idx` using GIN on `documents(tags)`
- Optional: GIN on `frontmatter` if querying frequently

---

## 5) RLS Policies

Enable RLS:
- `alter table documents enable row level security;`
- `alter table document_bodies enable row level security;`

Policies (owner-only):
- `documents_select_own`: `user_id = auth.uid()`
- `documents_insert_own`: `user_id = auth.uid()`
- `documents_update_own`: `user_id = auth.uid()`
- `documents_delete_own`: `user_id = auth.uid()`
- `document_bodies_select_own`: join `documents` by `document_id` and match `user_id`
- `document_bodies_insert_own`: same join check
- `document_bodies_update_own`: same join check
- `document_bodies_delete_own`: same join check

---

## 6) Verification

Manual verification (Supabase SQL editor):
- Can insert/select documents for current user
- Cross-user access is blocked
- Cascade deletes remove `document_bodies`

---

## 7) Acceptance Criteria

- [ ] Supabase project is linked and env vars are set
- [ ] `documents` and `document_bodies` exist with correct columns
- [ ] Indexes are created
- [ ] RLS policies enforce owner-only access
- [ ] Migration files committed

---

## 8) Decisions Log

| Question | Decision |
| --- | --- |
| Column naming | `user_id` (aligns with schema reference) |
| Body storage | `document_bodies` split |
| Flexible props | `frontmatter` jsonb |

---

END SPEC
