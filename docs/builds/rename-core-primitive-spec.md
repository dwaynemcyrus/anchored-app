# Build Spec — Rename “Note” Core Primitive to “Document” (Pre-IDs/Pre-Tombstones)

Goal: eliminate semantic collision where “note” means both:
1) the system-level primitive (everything), and
2) a frontmatter document type (`type: note`).

This rename must be completed BEFORE Stable IDs + Tombstones v1 is implemented.

---

## 0) Scope / Non-Goals

### In scope
- Rename core domain language in code from **Note** → **Document**
- Rename identifiers from **noteId** → **documentId** where the identifier refers to the system-level primitive identity
- Rename stores, services, hooks, types, and modules accordingly
- Update routes, query params, and internal event names if they use “note” to mean the system primitive
- Update tests and fixtures
- Add backward-compatible aliases ONLY where required for a short transition

### Not in scope
- No Stable IDs (UUID) work
- No Tombstones work
- No Supabase sync work
- No behavior changes (this is a naming refactor)
- No UI copy changes unless UI uses “note” to mean the system primitive in developer-facing debug screens

---

## 1) Terminology Contract (Lock This In)

### System-level primitive (code)
- **Document** is the canonical term for the thing stored, edited, linked, searched, backed up.

### User-facing type (frontmatter)
- Frontmatter will contain `type: "note"` (and other types later).
- “note” is a **document type**, not the base model.

### Rule
- Code must NOT use “note” to refer to the system primitive.
- The only place “note” appears is:
  - content type values (`type: note`) or
  - UI copy meant for end users (“New Note”) if desired.

---

## 2) Work Plan (Order Matters)

### Phase A — Inventory and map usages
1. Ripgrep for:
   - `Note`, `note`, `notes`, `noteId`, `NOTE_`, `isNote`, `useNote`, `NoteStore`, `notesStore`, etc.
2. Categorize each hit:
   - A1: system primitive (must become Document)
   - A2: document type literal (`type: note`) (must stay)
   - A3: UI copy (optional; generally can stay)
   - A4: legacy external interface (route params, exported APIs) (may need alias)

Deliverable: a short mapping list in the PR description:
- “Renamed X → Y; kept Z because it’s doc type”.

---

## 3) Rename Targets (Canonical)

### Types / Interfaces
- `Note` → `Document`
- `NoteMeta` → `DocumentMeta`
- `NoteFrontmatter` → `DocumentFrontmatter`
- `NoteRef` → `DocumentRef`
- `NoteLink` → `DocumentLink` (only if it means linking documents; if it means wiki-link token, rename to `WikiLinkToken` instead)

### IDs / Keys
- `noteId` → `documentId` (system identity)
- `noteSlug` can become `slug` or `documentSlug` depending on usage:
  - If it’s *the* slug field: rename to `slug`
  - If it’s only used in document context: rename to `documentSlug`

### Stores / Services / Hooks
- `NoteStore` → `DocumentStore`
- `NotesRepository` → `DocumentsRepository`
- `useNotes()` → `useDocuments()`
- `useNote()` → `useDocument()`
- `notesIndex` → `documentsIndex`
- `searchNotes` → `searchDocuments`

### Events / Actions
- `NOTE_CREATED` → `DOCUMENT_CREATED`
- `NOTE_UPDATED` → `DOCUMENT_UPDATED`
- `NOTE_DELETED` → `DOCUMENT_DELETED` (hard delete may exist today; keep behavior but rename event)

### File / Directory names
Rename modules and folders where “note(s)” refers to the system primitive:
- `src/notes/*` → `src/documents/*`
- `notes.store.ts` → `documents.store.ts`
- etc.

Do NOT rename folders that are explicitly about frontmatter `type: note` templates (rare).

---

## 4) Backwards Compatibility Rules (Keep it tight)

If there are public/internal APIs already used by the app (routes, persisted storage keys), we must avoid breaking old data.

### Storage keys
- If local storage / IndexedDB keys use “notes”:
  - Keep the stored key name for now (to avoid migration), but wrap access in a `DocumentStore` adapter.
  - Example:
    - stored: `notes` (unchanged)
    - code: `documents` (new)
  - Add a TODO marker: `// legacy storage key: notes`

### Routes
- If routes are `/note/:slug` etc:
  - Routes may stay as-is for user semantics.
  - Internal code should still call it a `DocumentRoute` or `DocumentPage` if it represents the system primitive.
  - Only rename route segments if it’s strictly internal and safe. Prefer not changing URLs in this refactor.

### Exported types
- If `Note` type is exported and used widely:
  - Provide a temporary alias for one release cycle:
    - `export type Note = Document; // @deprecated`
  - Add a lint rule or comment to prevent new usage.

---

## 5) Frontmatter Handling (Do Not Break Type: note)

### Requirement
If you have frontmatter parsing that currently maps `type` or uses `note` internally:
- Ensure `frontmatter.type` remains a string like `"note"`.
- Ensure any logic that checks `type === "note"` continues to work.

### Explicit rule
- `type: note` is NOT renamed.
- Only the system primitive is renamed.

---

## 6) UI Language (Minimal)

- UI labels like “New Note”, “Notes”, “All Notes” can remain.
- Developer-facing labels can be updated optionally:
  - Debug panels: “Documents loaded: N”
- Do NOT change UI flows.

---

## 7) Implementation Checklist (Concrete)

### Code refactor
- [ ] Rename core type `Note` → `Document`
- [ ] Rename `noteId` variables/fields to `documentId` (system identity)
- [ ] Rename store/service/hook names
- [ ] Rename internal events/actions
- [ ] Rename folders/files/modules where appropriate
- [ ] Update imports/exports everywhere

### Tests
- [ ] Update unit tests to use Document naming
- [ ] Update fixtures and helpers
- [ ] Ensure tests still pass with no behavior change

### Build/CI
- [ ] Run typecheck
- [ ] Run lint
- [ ] Run full test suite
- [ ] Run app locally and smoke test:
  - create doc
  - edit doc
  - search
  - wiki-link insert/autocomplete
  - graph load (if present)
  - backup/restore (basic)

---

## 8) Acceptance Criteria

1. No behavioral changes; only naming.
2. No remaining usages of “Note” that refer to the system primitive (except deprecated alias if required).
3. Frontmatter `type: note` still works.
4. All existing data still loads (no forced migrations).
5. Build passes: lint, typecheck, tests.
6. Manual smoke test passes:
   - create/edit/search/link still works.

---

## 9) “Do Not” List (Guardrails)

- Do NOT introduce Stable IDs/UUIDs in this PR.
- Do NOT introduce tombstones.
- Do NOT change on-disk markdown format beyond what is required for parsing compatibility.
- Do NOT change URLs unless purely internal and proven safe.
- Do NOT rename `type: note` (content semantics).

---

## 10) Suggested Commit Strategy

Either:
- Single PR, multiple commits:
  - `refactor(domain): rename Note primitive to Document`
  - `refactor(store): rename notes store to documents store`
  - `test: update naming`
Or a single squashed commit if you prefer clean history.

---

## 11) Deliverable

A PR that:
- completes the rename,
- maintains behavior,
- keeps `type: note` intact,
- and unblocks the Stable IDs + Tombstones build.

End of spec.