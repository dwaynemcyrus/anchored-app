# Migration 0002 — Drop documents.tags

Purpose: Remove the `tags` column from `documents`. Tags are now stored in `frontmatter` only.

## Changes
- Drop index `documents_tags_gin_idx`
- Drop column `documents.tags`

## Notes
- Ensure existing tags are preserved in `frontmatter.tags` before applying.
- Update any sync payloads to omit `tags` column writes.
