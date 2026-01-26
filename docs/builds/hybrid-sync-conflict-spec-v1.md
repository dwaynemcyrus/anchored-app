# Build Spec — Hybrid Sync + Conflict Copies v1

Purpose:
Introduce hybrid local-first sync with Supabase as canonical storage, prioritize durability, and always create a conflict copy document on divergence.

Builds on:
- database schema reference: `docs/database-schema-gpt-ref.md`
- current local-first IndexedDB repo + search index

---

## 0) Scope / Non-Goals

### In scope
- Hybrid sync model (local cache + server source of truth)
- Supabase-backed persistence for `documents` and `document_bodies`
- Conflict detection and **conflict copy document** creation
- Sync queue with retries and durability guarantees
- Minimal UI sync state indicators

### Not in scope
- Real-time collaboration
- Complex field-level merges (beyond conflict copy)
- Multi-user sharing or permissions beyond owner-only
- Offline-first for *all* features (only document CRUD must work)
- Data migrations for legacy users (spec includes a plan, not execution)

---

## 1) Data Model Alignment (Canonical)

Use the data model principles in `docs/database-schema-gpt-ref.md`.

### Core tables (server)
- `documents` (metadata)
  - `id`, `user_id`, `type`, `subtype`, `title`, `status`, `tags`
  - promoted fields as columns (e.g., `due_at`, `priority`, `published_at`)
  - `frontmatter` (jsonb) for flexible properties
  - `created_at`, `updated_at`
- `document_bodies` (content)
  - `document_id`, `content`, `updated_at`

### Local cache (client)
- IndexedDB stores full documents (metadata + body) for fast list + search
- In-memory search index built from cached docs

---

## 2) Sync Model

### Canonical source
Supabase is canonical. Local cache mirrors server state.

### Write path
1. User edits locally (instant UI)
2. Mutation is queued locally with an operation record
3. Attempt server write immediately if online
4. On success: update local cache + clear queue item
5. On failure/offline: retain in queue with retry/backoff

### Read path
- On app load: hydrate local cache first
- Then pull from server by `updated_at > last_synced_at`
- Apply changes to local cache and rebuild search index

### Sync queue requirements
- FIFO order per document
- Retries with exponential backoff
- Queue persists across reloads
- Visible "syncing" status in UI

---

## 3) Conflict Handling (Mandatory)

Conflict occurs when:
- Local update is based on a stale server version, OR
- Server has newer `updated_at` for the same document id at push time

### Conflict resolution policy
Always create a **conflict copy document**.

#### Conflict copy rules
- Create a new document record with a new `id`
- Preserve the *local* version as the conflict copy
- Conflict copy metadata:
  - `type` and `subtype` preserved
  - `title` becomes: `"<original title> (Conflict copy)"`
  - `status` preserved
  - `tags` preserved + add `"conflict"` tag
  - `frontmatter` merged with:
    - `conflictOf: <original_id>`
    - `conflictAt: <timestamp>`
    - `conflictReason: "server-newer" | "version-mismatch"`
- Body: local body content
- The canonical (server) document remains unchanged

#### UI behavior
- User sees a non-blocking toast: "Conflict detected. Created a conflict copy."
- Conflict copies appear in search and lists

---

## 4) Search & Quick Capture

### Local search
- Remains primary for instant UX (existing in-memory search index)
- Rebuild after any sync pull or local write

### Server search (optional)
- Not required for v1
- If added later, results should merge into local list without blocking

---

## 5) Durability Guarantees

### Must-have guarantees
- Every user write is either:
  - persisted to server, OR
  - stored in a local queue for retry
- No silent data loss:
  - failed sync must surface an error state
  - user can view unsynced changes

### Sync status states
- `synced` (no pending operations)
- `syncing` (queue in progress)
- `offline` (no network, queue pending)
- `error` (retries exceeded or server rejected)

---

## 6) API / Storage Integration (Supabase)

### Minimum operations
- `documents`: insert, update, select by `updated_at`
- `document_bodies`: insert, update, select by `document_id`

### Expected indexes
- `documents.user_id`, `documents.type`, `documents.subtype`, `documents.status`
- `documents.tags` (GIN if array)
- `documents.updated_at`

---

## 7) Implementation Chunks

### Chunk 1: Supabase schema + RLS (docs + migration plan)
- Define tables + indexes aligned with schema reference
- RLS: owner-only access (`user_id = auth.uid()`)

### Chunk 2: Sync queue + durability
- Local queue persistence
- Retry/backoff + status reporting

### Chunk 3: Push/Pull sync
- Push mutations to Supabase
- Pull deltas by `updated_at`
- Update IndexedDB cache

### Chunk 4: Conflict copy creation
- Detect conflicts on push
- Create conflict copy document
- Surface UI feedback

### Chunk 5: UI sync status
- Minimal status indicator in shell
- Surface error state and retry action

---

## 8) Acceptance Criteria

- [ ] Supabase tables match `docs/database-schema-gpt-ref.md` document model
- [ ] Local edits are immediately visible
- [ ] All writes are persisted or queued
- [ ] Queue survives reloads and resumes
- [ ] Conflicts always create a conflict copy document
- [ ] Conflict copies are discoverable in search and lists
- [ ] Sync status is visible and accurate
- [ ] No data loss on offline edits + reconnect

---

## 9) Decisions Log

| Question | Decision |
| --- | --- |
| Canonical source | Supabase |
| Conflict strategy | Always create conflict copy |
| Search priority | Local search is primary |
| Body storage | `document_bodies` split from `documents` |

---

END SPEC
