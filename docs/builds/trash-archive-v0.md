# Trash / Archive v0 — Soft Delete Contract + Minimal UI Hooks
Version: 0.1  
Depends on: Documents Contract v0 + Documents Repo v0 + Local Search v0  
Purpose: Add a safety net so deletion is reversible. This is a **contract upgrade**, not a full trash system.

---

Be sure to review existing code, so you do not repeat or duplicate, or write over features that already exist.

## 0) Explicit Non-Goals
Do NOT build:
- Supabase sync or remote deletion consistency
- Retention policies (e.g., auto-delete after 30 days)
- Bulk actions
- A full Trash screen (optional later)
- Complex archive taxonomies, folders, tags

This spec is only:
- soft delete + archive flags
- repo methods
- default filtering rules
- minimal affordances to trigger/undo

---

## 1) Document Contract Changes
Extend Document shape with two optional fields:

- deletedAt?: number | null
  - null or undefined = active
  - timestamp (epoch ms) = trashed

- archivedAt?: number | null
  - null or undefined = not archived
  - timestamp (epoch ms) = archived

### Invariants
- A document can be:
  - Active: deletedAt == null AND archivedAt == null
  - Archived: deletedAt == null AND archivedAt != null
  - Trashed: deletedAt != null (archivedAt value irrelevant; treat as trashed)
- Trashed documents are excluded everywhere by default.

---

## 2) Repo Interface Additions
Extend `DocumentsRepo` with:

- `trash(id): Promise<void>`
  - sets deletedAt = now
- `restore(id): Promise<void>`
  - sets deletedAt = null
- `archive(id): Promise<void>`
  - sets archivedAt = now (only if not trashed)
- `unarchive(id): Promise<void>`
  - sets archivedAt = null (only if not trashed)

### List / Search Filters
Update existing methods to accept filters:

- `list(options?)`
  - options:
    - type?
    - includeArchived?: boolean (default false)
    - includeTrashed?: boolean (default false)
  - default behavior:
    - includeArchived = false
    - includeTrashed = false
  - returns index rows only (no bodies)

- `search(query, options?)` (if search is its own layer, apply the same filter logic)
  - defaults exclude trashed + exclude archived

### Get behavior
- `get(id)` returns the document regardless of status
- UI decides whether to allow editing/opening if trashed

---

## 3) Storage / Migration Notes (IndexedDB)
If using IndexedDB (Documents Repo v0):
- Add indexes (if not already):
  - `deletedAt`
  - `archivedAt`

Migration:
- existing docs should default to:
  - deletedAt = null
  - archivedAt = null
No data rewrite required beyond schema version bump if needed.

---

## 4) UI Hooks (Minimal)
No full Trash screen required in v0.

### Notes List
- Add per-note overflow menu (or a simple action affordance) with:
  - “Archive” (if active)
  - “Unarchive” (if archived view is enabled)
  - “Trash” (if not trashed)

### Undo (Optional but Recommended)
After “Trash” action:
- show a lightweight inline/temporary affordance:
  - “Trashed — Undo” (for ~5 seconds)
- Undo calls `restore(id)`

### Archived visibility
- Add a simple toggle in Notes List header:
  - “Show Archived” (boolean)
When ON:
- list includes archived notes (but still excludes trashed)

---

## 5) Default App Rules
- All primary lists exclude trashed.
- Search excludes trashed by default.
- Archived docs are hidden by default but discoverable via “Show Archived.”

Editor rules:
- If opening a trashed doc:
  - show a “This note is in Trash” banner
  - provide actions:
    - Restore
    - (optional) Delete permanently — NOT in v0
  - editing is disabled until restored (recommended)

---

## 6) Acceptance Criteria
- Trashing a note removes it from default list/search
- Restore brings it back with content intact
- Archive hides from default list/search but is visible when “Show Archived” enabled
- Trashed status overrides archived status
- No regressions to editor saving or search performance

---

## 7) Definition of Done
- Soft delete and archive are part of the canonical document contract
- Repo exposes trash/restore/archive/unarchive
- Default filtering keeps the system clean and safe
- Minimal UI affordances exist to use the feature

END