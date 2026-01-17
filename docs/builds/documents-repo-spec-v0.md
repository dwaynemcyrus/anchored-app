# Documents Repo v0 — Local-First Persistence Spine
To continue this session, run `codex resume 019bcb8d-fffb-71c0-ae8f-5fdff56fb174`

Version: 0.1  
Purpose: Replace ad-hoc localStorage notes with a scalable, swappable, local-first persistence layer.

This spec defines the **document contract**, **storage architecture**, and **repo interface** that all future features depend on.

---

## 0. Explicit Non-Goals
Do NOT build:
- Supabase or remote sync
- Collaboration or multi-device conflict resolution
- Full-text search UI
- Task logic, dependencies, habits
- Version history beyond updatedAt
- Encryption (can be layered later)

This spec exists to make documents real, durable, and future-proof.

---

## 1. Documents Contract (Canonical Shape)
All written artifacts are documents.

### Document type
- id: string (uuid)
- type: string  
  - initial allowed values: `"note"`
  - reserved for future: `"journal"`, `"task"`, `"essay"`, `"log"`
- title: string | null
- body: string (markdown)
- meta: Record<string, any>
- createdAt: number (epoch ms)
- updatedAt: number (epoch ms)
- deletedAt?: number | null (optional; null = active)

### Title derivation rule
- If `title` is null or empty:
  - derive from first non-empty line of `body`
  - trim whitespace
  - fallback: `"Untitled"`

No separate title input is required in v0.

---

## 2. Storage Architecture (IndexedDB)
Use IndexedDB as the primary store.

### Database
- name: `anchored_db`
- version: 1

### Object stores
#### `documents`
- keyPath: `id`
- indexes:
  - `type`
  - `updatedAt`
  - `deletedAt`

Bodies are stored here.

#### Optional: `documents_meta`
- Not required in v0
- Can be introduced later for denormalized search/indexing

---

## 3. Migration Strategy (from localStorage)
### Source
- localStorage key: `anchored.notes.v0`

### Process
1. On app init:
   - Check `anchored.schema.version`
2. If not present or `< 1`:
   - Read localStorage notes blob
   - For each note:
     - Map to Document shape:
       - type = `"note"`
       - meta = {}
   - Insert into IndexedDB
3. After successful migration:
   - Backup localStorage blob to:
     - `anchored.notes.v0.backup`
   - Remove original key
4. Set:
   - `anchored.schema.version = 1`

### Failure handling
- If migration fails:
  - Do NOT delete localStorage data
  - Log error
  - Continue using localStorage fallback (read-only acceptable)

---

## 4. Repo Interface (Single Source of Truth)
All UI code talks to the repo, never directly to IndexedDB.

### Interface: `DocumentsRepo`
- `list(options?)`
  - params:
    - type?: string
    - limit?: number
    - offset?: number
  - returns:
    - Array<{ id, type, title, updatedAt }>
  - NOTE: body must NOT be loaded here

- `get(id)`
  - returns full Document (including body)

- `create(input)`
  - input:
    - type
    - body
    - meta?
  - behavior:
    - generate id
    - set createdAt/updatedAt
    - persist
  - returns created Document

- `update(id, patch)`
  - patch may include:
    - body
    - title
    - meta
  - behavior:
    - update updatedAt
    - partial update only
  - returns updated Document

- `delete(id)`
  - v0: hard delete acceptable
  - optional soft delete using `deletedAt`

---

## 5. Performance Rules
- Notes list must never load document bodies
- Editor loads body on demand via `get(id)`
- Writes are debounced at UI layer (300–800ms)
- Repo methods are async and non-blocking
- No long-running transactions on the main thread

---

## 6. Error & Edge Handling
- Missing document:
  - return null
  - UI decides how to handle
- Corrupt DB:
  - surface error
  - do not auto-wipe
- Duplicate IDs:
  - reject write

---

## 7. Swapability Contract (Future-Proofing)
The UI must depend only on:
- `DocumentsRepo` interface

Future implementations:
- `IndexedDbDocumentsRepo` (this spec)
- `SupabaseDocumentsRepo`
- `HybridSyncDocumentsRepo`

No UI changes should be required when swapping repos.

---

## 8. Suggested File Structure
lib/
  db/
    indexedDb.ts
    migrations.ts
  repo/
    DocumentsRepo.ts        # interface
    IndexedDbDocumentsRepo.ts
types/
  Document.ts

---

## 9. Definition of Done
- Notes created in editor persist via IndexedDB
- Reload preserves documents
- List view loads quickly with many documents
- Editor loads full body correctly
- Migration runs once and is idempotent
- No UI component touches IndexedDB directly

END
