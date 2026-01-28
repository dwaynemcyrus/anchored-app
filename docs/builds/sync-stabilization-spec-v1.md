# Sync Stabilization Spec v1

## Overview
Stabilize sync across devices by enforcing a single write path, reliable queue processing, and consistent merge rules. This spec focuses on observable sync health, durable local cache behavior, and predictable Supabase updates.

## Goals
- Consistent data across devices (desktop + iOS PWA) with deterministic conflict rules.
- Single write path: all edits go local-first then queue to Supabase.
- No silent failures: clear health metrics + actionable errors in Settings.
- Prevent invalid local-only records (non-UUID IDs) from hitting Supabase.
- Local cache (IndexedDB) and Supabase schemas aligned and enforced.
- Use polling (every 60s) instead of realtime subscriptions.

## Non-goals
- Advanced background sync / service worker queueing.
- Full multi-user or sharing features.
- Schema evolution beyond required sync fields.

## Current System Map (Reviewed)
**Local cache**
- IndexedDB stores: `documents`, `document_bodies`, `syncQueue`, `syncMeta` in `src/lib/db/indexedDb.js`.
- Local repo abstraction: `src/lib/repo/IndexedDbDocumentsRepo.js` + `getDocumentsRepo`.
- Body storage split: `src/lib/db/documentBodies.js`.
- Zustand caches and hydration: `src/store/documentsStore.js`.

**Sync engine**
- Core write/sync logic: `src/lib/sync/syncManager.js`.
- Queue: `src/lib/sync/syncQueue.js`.
- Initial sync: `src/lib/sync/initialSync.js`.
- Realtime sync: `src/lib/sync/realtimeSync.js`.

**Supabase API**
- Client: `src/lib/supabase/client.js`.
- Documents API: `src/lib/supabase/documents.js`.

## Known Risk Areas
- Mixed timestamp sources (`updatedAt` vs `updated_at`) across local cache + Supabase.
- Local store writes bypassing sync queue.
- Queue retries with limited observability.
- Non-UUID local documents (templates) causing Supabase errors.
- Divergent merge logic between initial sync, realtime sync, and manual edits.

## Stabilization Plan

### Phase 1 — Observability & Controls (Settings)
**Goal**: Make sync state visible and actionable.

Tasks:
1. Expand Sync Integrity panel to include: last successful sync time, pending queue count, last error (full error details), current user_id + client_id.
2. Add manual controls: “Sync Now” (process queue + initial sync) and “Reset last sync” (force full pull).
3. Ensure errors and retry attempts are visible in UI.

Affected files:
- `src/app/settings/page.js`
- `src/store/syncStore.js`
- `src/lib/sync/initialSync.js`
- `src/lib/sync/syncManager.js`

Acceptance:
- User can see status, counts, IDs, last error.
- Manual sync reliably triggers a pull/push pass.

### Phase 2 — Single Write Path (Local-first)
**Goal**: All edits go local-first, then queue.

Tasks:
1. Ensure all UI edits call `saveDocument` / `saveDocumentBody` only.
2. Block direct repo writes from UI components.
3. Normalize to ISO timestamps on write and store `synced_at` consistently.

Affected files:
- `src/lib/sync/syncManager.js`
- `src/store/documentsStore.js`
- `src/components/notes/NoteEditor.js`

Acceptance:
- Every edit produces a queue operation.
- No Supabase call is invoked directly from UI.

### Phase 3 — Queue Reliability
**Goal**: Queue is the only outbound path.

Tasks:
1. Route outbound sync through `processSyncQueue()` only (no direct upserts except when queue processing).
2. Add backoff + retry metadata and show attempts in the Sync Integrity panel.
3. Add hard limit + alert when retries exceed max.

Affected files:
- `src/lib/sync/syncQueue.js`
- `src/lib/sync/syncManager.js`
- `src/app/settings/page.js`

Acceptance:
- Queue does not stall silently.
- Failed operations show in UI with attempts count.

### Phase 4 — Consistent Merge Rules
**Goal**: Align merge behavior across initial sync, realtime, and queue-based sync.

Rules:
- If local record is dirty (synced_at is null) and remote updated_at is newer, create a conflict copy.
- If local record is clean and remote updated_at is newer, accept remote.
- Polling sync uses the same merge rules as initial sync.

Affected files:
- `src/lib/sync/initialSync.js`
- `src/lib/sync/syncManager.js`

Acceptance:
- Same outcome for identical updates regardless of entry path.

### Phase 5 — Supabase Alignment & Validation
**Goal**: Prevent schema mismatch / invalid payloads.

Tasks:
1. Enforce `owner_id`, `user_id`, `client_id`, `synced_at`, `deleted_at` in outgoing payloads.
2. Validate IDs are UUIDs before sending.
3. Filter non-UUID IDs in all Supabase queries.

Affected files:
- `src/lib/supabase/documents.js`
- `src/lib/sync/syncManager.js`
- `src/lib/sync/initialSync.js`

Acceptance:
- No 400 errors from invalid IDs.
- All inserts/updates include required fields.

## Validation Checklist
- Create note offline → go online → note appears in Supabase.
- Edit title/body on device A → device B receives update.
- Delete note → removed in Supabase and on all devices.
- Create conflict scenario → conflict copy created locally.
- Initial sync on a fresh device pulls all data without errors.

## Notes
- Realtime subscriptions are out of scope for stabilization; polling (60s) plus manual “Sync Now” is the source of truth.
- Local cache hygiene depends on IndexedDB migrations (`DB_VERSION`) and body store consistency.
- Build/verify steps: `npm run build`, `npm run lint`.
