# Build Spec — Document Type Frontmatter Registry v0 (Pre-Sync)

Purpose:
Create a single canonical module that declares:
1) the **Base Document frontmatter contract** (system-level)
2) a **registry of known `type` values** with allowed/required frontmatter keys (advisory in v0)

This is a schema declaration layer only. It must NOT introduce sync, tombstones, stable-ID generation, migrations, or behavior branching.

---

## 0) Scope / Non-Goals

### In scope
- Add a **Document Frontmatter** domain module
- Define **Base frontmatter schema** (system keys)
- Define **Document Type Registry** for known types (capture, note, reference, source, journal, daily, essay)
- Implement **normalize + diff** helpers:
  - compute warnings/errors (non-blocking)
  - list missing required keys (after aliasing)
  - list unknown keys
- Add unit tests

### Not in scope
- No UUID generation (Stable IDs spec owns that)
- No Tombstone logic/storage (Tombstones spec owns that)
- No save-time enforcement (warn-only)
- No UI changes
- No Supabase/sync work
- No per-type behavior branching

---

## 1) Locked Terms

- System primitive: **Document**
- Canonical identity key: `uuid` (documentId)
- Registry key: `type` (semantic classification)
- `id` is treated as a legacy alias for `uuid` in this registry layer only (warn-only)

---

## 2) Module Layout

Create:

- `src/domain/documents/frontmatter/`
  - `types.ts`         (TS types/interfaces)
  - `base.ts`          (base parse + alias handling)
  - `registry.ts`      (DOCUMENT_TYPE_REGISTRY + aliases)
  - `normalize.ts`     (normalizeFrontmatter + schema diff)
  - `__tests__/frontmatter.test.ts`

---

## 3) Base Frontmatter Schema (System-Level)

### Canonical base keys
These are the system-level keys the app will ultimately rely on:

- `uuid: string` (documentId; canonical)
- `createdAt: string` (ISO)
- `updatedAt?: string` (ISO)
- `type: string` (registry type)
- optional (advisory in v0):
  - `status?: "active" | "deleted"`
  - `slug?: string`

### Legacy aliasing (v0)
- Accept `id` as a legacy alias for `uuid`
- In normalization:
  - if `uuid` is missing but `id` exists → set `normalized.uuid = id`
  - emit warning: `frontmatter.id is legacy; use uuid`
- Do not write changes back to disk

### v0 constraints
- Do not generate UUIDs
- Do not validate UUID format as blocking (warn only)
- Do not mutate files

Deliverable: `parseBaseFrontmatter(raw)` returning:
- `base: BaseFrontmatter | null`
- `normalized: Record<string, any>` (raw + derived uuid)
- `warnings: string[]`
- `errors: string[]`

---

## 4) Registry Types + Data Structures

Create these types:

```ts
export type DocumentTypeSpec = {
  type: string;
  label: string;
  allowedKeys: string[];   // includes base + legacy + type-specific keys
  requiredKeys: string[];  // advisory in v0
  description?: string;
};

export type DocumentTypeRegistry = Record<string, DocumentTypeSpec>;

export const FRONTMATTER_KEY_ALIASES: Record<string, string> = {
  id: "uuid",
};
```

Rules:

* allowedKeys should be deduped (input may contain duplicates like subtype)
* Registry is advisory:

  * missing required keys → warning
  * unknown keys → warning
  * unknown type → warning
* Nothing blocks saving in this phase.
---

## 5) Document Type Registry (Updated Initial Set)

Implement DOCUMENT_TYPE_REGISTRY exactly with these type entries.

Important:

* Include uuid in allowedKeys for every type (canonical), even if user list uses id
* Include id in allowedKeys for every type (legacy alias)
* Deduplicate any duplicate keys (note has subtype twice)

### type: capture

* label: “Capture”
* keys: [id, createdAt, updatedAt, deletedAt, visibility, title, type]
* required: [id, createdAt, type]
* allowedKeys (deduped, plus uuid):

  * id, uuid, createdAt, updatedAt, deletedAt, visibility, title, type

### type: note

* label: “Note”
* keys: [id, createdAt, updatedAt, deletedAt, archivedAt, visibility, title, type, subtype, tags, source, chains, subtype]
* required: [id, createdAt, type]
* allowedKeys:

  * id, uuid, createdAt, updatedAt, deletedAt, archivedAt, visibility, title, type, subtype, tags, source, chains

### type: reference

* label: “Reference”
* keys: [id, createdAt, updatedAt, deletedAt, archivedAt, visibility, title, type, tags, source, status]
* required: [id, createdAt, title, type]
* allowedKeys:

  * id, uuid, createdAt, updatedAt, deletedAt, archivedAt, visibility, title, type, tags, source, status

### type: source

* label: “Source”
* keys: [id, createdAt, updatedAt, deletedAt, archivedAt, visibility, title, subtitle, type, subtype, tags, status, url, series, seriesNumber, author, host, guests, startDate, endDate]
* required: [id, createdAt, type, subtype]
* allowedKeys:

  * id, uuid, createdAt, updatedAt, deletedAt, archivedAt, visibility, title, subtitle, type, subtype, tags, status, url, series, seriesNumber, author, host, guests, startDate, endDate

### type: journal

* label: “Journal”
* keys: [id, createdAt, updatedAt, deletedAt, archivedAt, visibility, title, type, subtype, tags, series, seriesNumber, mood]
* required: [id, createdAt, type]
* allowedKeys:

  * id, uuid, createdAt, updatedAt, deletedAt, archivedAt, visibility, title, type, subtype, tags, series, seriesNumber, mood

### type: daily

* label: “Daily”
* keys: [id, createdAt, updatedAt, deletedAt, archivedAt, visibility, title, type, tags]
* required: [id, createdAt, type]
* allowedKeys:

  * id, uuid, createdAt, updatedAt, deletedAt, archivedAt, visibility, title, type, tags

### type: essay

* label: “Essay”
* keys: [id, createdAt, updatedAt, deletedAt, archivedAt, visibility, title, subtitle, type, subtype, tags, resources]
* required: [id, createdAt, type]
* allowedKeys:

  * id, uuid, createdAt, updatedAt, deletedAt, archivedAt, visibility, title, subtitle, type, subtype, tags, resources

Deliverable: registry.ts exporting:

* DOCUMENT_TYPE_REGISTRY
* FRONTMATTER_KEY_ALIASES
---

## 6) Normalization + Schema Diff API

Implement:
```
normalizeFrontmatter(raw: Record<string, any>): NormalizedFrontmatterResult
```


Return shape:
```
export type NormalizedFrontmatterResult = {
  base: BaseFrontmatter | null;
  typeSpec: DocumentTypeSpec | null;
  normalized: Record<string, any>;
  warnings: string[];
  errors: string[];
  unknownKeys: string[];
  missingRequiredKeys: string[];
  unknownType?: string;
};
```


### Behavior

1. Parse base + alias:

   * derive uuid from id if needed
2. Determine type:

   * if missing/invalid → errors include Missing or invalid type
   * typeSpec null
3. Lookup registry by type:

   * if not found → warnings include Unknown document type: <type>
4. Compute unknownKeys:

   * allowed set = base keys + typeSpec.allowedKeys (if exists)
   * include legacy id and canonical uuid as allowed
   * keys present in raw not in allowed set → unknownKeys + warning
5. Compute missingRequiredKeys:

   * required = typeSpec.requiredKeys (if exists)
   * Apply alias satisfaction:

     * if id required → satisfied if id exists OR uuid exists
   * Missing keys → missingRequiredKeys + warning
6. Never block save; never write to disk.

⠀
---

## 7) Integration Rules (No Behavior Changes)

Allowed:

* Use this module for:

  * dev warnings/logging
  * future editor tooling (autocomplete for keys)
  * debugging

Forbidden:

* Do not branch storage/search/linking by type
* Do not enforce on write
* Do not migrate existing files

If integration would risk behavior changes, keep module isolated and tested only.

---

## 8) Tests (Required)

Add unit tests for:

1. Registry contains all types:

   * capture, note, reference, source, journal, daily, essay
2. Deduping:

   * note.allowedKeys contains subtype only once
3. Alias:

   * raw has id but no uuid → normalized.uuid exists + warning
4. Missing required keys:

   * reference missing title → missingRequiredKeys includes title
5. Unknown keys:

   * daily has randomField → unknownKeys includes randomField
6. Unknown type:

   * type: “weird” → warning unknown type, typeSpec null

⠀
No filesystem access required.

---

## 9) Acceptance Criteria

* New module exists under src/domain/documents/frontmatter/
* Registry is populated with the updated types
* normalizeFrontmatter returns warnings/errors without blocking
* id -> uuid aliasing works and warns
* No UI/behavior changes
* Tests pass
---

## 10) Deliverable

A single PR implementing this registry module + tests.

No other features added.

END SPEC