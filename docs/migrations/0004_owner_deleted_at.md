# Migration 0004 — Owner ID + Tombstones

Purpose: Add `owner_id` to all synced rows, add `deleted_at` tombstones, and enforce owner-only RLS.

## Changes
- Add `owner_id` to `documents` + `document_bodies` and backfill from `user_id`
- Add `deleted_at` (timestamptz) to `documents`
- Add indexes:
  - `documents_owner_updated_idx` on `(owner_id, updated_at)`
  - `documents_owner_deleted_idx` on `(owner_id, deleted_at)`
  - `document_bodies_owner_idx` on `(owner_id)`
- Replace RLS policies to use `owner_id = auth.uid()`
- Remove DELETE policies (soft-delete only)

## Notes
- Owner ID must match `auth.users.id` for the signed-in user.
- Hard deletes are disabled; set `deleted_at` instead.
