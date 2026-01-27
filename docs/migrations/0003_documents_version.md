# Migration 0003 — Documents Version Column

Purpose: Add `documents.version` for optimistic concurrency control during sync.

## Changes
- Add `documents.version` (int, not null, default 1)

## Notes
- Clients should send `version` with updates and only update when versions match.
- On successful update, server should increment version and client should store the new value.
