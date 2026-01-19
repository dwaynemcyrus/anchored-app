# Backup & Restore v0 (Local Vault Portability)
version: 0.1
status: spec
owner: Anchored OS
principles:
- local-first
- markdown-first
- user-controlled data movement
- safety over cleverness
- never silently destroy or overwrite user data

## 0) Context / Current State (DO NOT REBUILD)
Already built and stable:
- Editor v0 (CodeMirror 6, markdown-first)
- Documents Repo v0 (local-first, IndexedDB)
- Focus Mode Dimming (Editor v1)
- Local Search v0 (title + body)
- Trash / Archive v0 (soft delete contract)
- Quick Capture v1 (full-screen action center, capture-first)

Explicitly cancelled / out of scope:
- Typewriter Scroll / Caret Anchoring

This spec adds: portable export/import with strong safety guarantees, no remote sync.

---

## 1) Goal
Provide a reliable, manual, user-driven way to:
- Export all notes from local IndexedDB to portable files
- Restore notes from those files back into IndexedDB
- Prevent silent data loss by default
- Enable future migrations/debugging without adding schema complexity

Non-goals:
- Sync, accounts, Supabase, background backups
- Encryption/password-protected backups (future spec)
- New document types (notes only)

---

## 2) Definitions
- "Note": the only document type for now.
- "Repo": existing Documents Repo v0 backed by IndexedDB.
- "Backup JSON": a single `.anchored-backup.json` file representing an exact snapshot.
- "MD Bundle": a zip file containing one `.md` per note plus a manifest (optional but recommended).

---

## 3) User Stories
1) As a user, I can export my entire vault so I can store it elsewhere.
2) As a user, I can restore from a backup after reinstalling, clearing data, or switching devices.
3) As a user, I can import without risking overwriting my existing notes (merge is default).
4) As a user, I can resolve conflicts without losing either version.

---

## 4) Behavioral Guarantees (Hard Contracts)
### G1 — Export Portability
- Export must produce a human-inspectable format (Markdown) and a machine-perfect format (Backup JSON).

### G2 — Safe-by-Default Import
- Default import mode is MERGE.
- MERGE never deletes local notes.
- Conflicts never silently overwrite; both copies must exist after import.

### G3 — Explicit Destruction Only
- REPLACE ALL is allowed but must be clearly gated and requires explicit confirmation.

### G4 — Stable Identity
- Notes must preserve a stable `id` across export/import when available.
- Filenames must not be relied on as identity; identity is from metadata.

---

## 5) Scope
### In Scope
- Settings > Data screen with:
  - Export All (Backup JSON)
  - Export All (Markdown Bundle)
  - Import (accept Backup JSON or Markdown Bundle)
  - Danger Zone: Replace All (restore exact snapshot)
- Export implementations:
  - Backup JSON format v1
  - Markdown Bundle (zip) with per-note `.md` and optional `manifest.json`
- Import implementations:
  - Parse Backup JSON v1
  - Parse Markdown Bundle, best-effort:
    - Prefer per-note frontmatter `id`
    - Otherwise generate a new id and import as new note
- Dry-run preview before committing:
  - counts: add / update / skip / conflicts
- Conflict strategy:
  - store both copies
  - mark conflict metadata so user can later resolve manually

### Out of Scope
- Auto backups, schedules, background workers
- Encryption, password prompts
- Partial export/import
- Tagging, folders, backlinks, inbox workflows
- Any remote storage integration

---

## 6) Data Model Assumptions (Minimal)
Notes (existing in repo) assumed to have at least:
- id: string (stable)
- title: string
- body: string (markdown)
- createdAt: ISO string or epoch ms
- updatedAt: ISO string or epoch ms
- deletedAt?: (for Trash soft delete contract)
- archivedAt?: (if applicable)
If your actual repo uses different field names, implement mapping inside backup layer only.

---

## 7) Export Formats
### 7.1 Backup JSON (Perfect Restore)
**Filename:** `anchored-backup-YYYYMMDD-HHMMSS.json` (local time)
**MIME type:** `application/json`
**Extension:** `.anchored-backup.json` (recommended) OR `.json` acceptable.

**Schema:**
```json
{
  "backupVersion": 1,
  "exportedAt": "2026-01-18T08:00:00.000Z",
  "appVersion": "0.0.0", 
  "source": {
    "platform": "web",
    "userAgent": "string"
  },
  "stats": {
    "notesCount": 123,
    "totalChars": 456789
  },
  "notes": [
    {
      "id": "note_123",
      "title": "string",
      "body": "markdown string",
      "createdAt": "2026-01-01T10:00:00.000Z",
      "updatedAt": "2026-01-02T10:00:00.000Z",
      "deletedAt": null,
      "archivedAt": null
    }
  ]
}
```

Rules:

* backupVersion is required.
* Unknown fields must be ignored on import (forward-compatible).
* appVersion can be "unknown" if not available.

### 7.2 Markdown Bundle (Human-Readable)

Filename: anchored-md-YYYYMMDD-HHMMSS.zip

Contents:

* /notes/<safe-filename>__<id-suffix>.md
* optional /manifest.json

Per-note Markdown file structure:

* YAML frontmatter containing minimal metadata, then markdown body.

Example:

```
---
id: note_123
title: My Note
createdAt: 2026-01-01T10:00:00.000Z
updatedAt: 2026-01-02T10:00:00.000Z
deletedAt: null
archivedAt: null
---
# My Note

(note body continues...)
```

Filename rules:

* safe-filename derived from title:

  * lowercased, spaces -> hyphens
  * strip non-alphanumerics except hyphen/underscore
  * max 60 chars
  * if empty, use untitled
* append __<id-suffix> where suffix is last 6–10 chars of id to avoid collisions.

Manifest (optional but recommended):

```
{
  "bundleVersion": 1,
  "exportedAt": "ISO",
  "notes": [
    { "path": "notes/my-note__e4a9c1.md", "id": "note_123" }
  ]
}
```

---

## 8) Import Modes

### Mode A — MERGE (Default)

* For each incoming note:

  * If id matches existing:

    * If incoming updatedAt > existing updatedAt: update existing
    * Else: skip (keep local)
    * If timestamps missing/unparseable: treat as conflict (do not overwrite)
  * If id missing:

    * Import as new note with generated id
* Never delete local notes.

### Mode B — REPLACE ALL (Danger Zone)

* Wipes local repo (notes table/store) then imports incoming snapshot.
* Only allowed for Backup JSON imports (perfect restore).
* Must require explicit confirmation step (see UI gating).
---

## 9) Conflict Handling

A conflict occurs when:

* Same id exists but timestamps are missing/unparseable, OR
* Same id exists and incoming appears divergent without reliable ordering, OR
* Incoming updatedAt equals local updatedAt but bodies differ (optional check; recommended)

Conflict result:

* Keep local note unchanged.
* Import incoming as a new note with:

  * new id
  * title prefixed: CONFLICT — <original title>
  * body begins with a short header block describing origin (not a UI feature, just text)
  * metadata field conflictOf: <originalId> in frontmatter for MD or field in repo if allowed

    * If repo schema cannot change, encode conflictOf in body header instead (fallback).

Preferred (if repo supports minimal metadata extension without “schema expansion”):

* store a lightweight meta object on note record; otherwise do the body-header fallback.
---

## 10) UI / UX Spec

### Location

Settings → Data

### Actions

1. Export All (Backup JSON)

⠀
* Primary export for perfect restore.

1. Export All (Markdown Bundle)

⠀
* Secondary export for inspection / interoperability.

1. Import

⠀
* Accepts:

  * .anchored-backup.json / .json
  * .zip Markdown bundle
* Runs dry-run analysis, then confirm.

1. Danger Zone: Replace All

⠀
* Only visible after selecting a Backup JSON file (not zip).
* Requires:

  * checkbox: “I understand this will delete local notes”
  * confirm text entry: type REPLACE
  * then execute

### Dry-Run Summary Modal

Show:

* Detected format + version
* Total incoming notes
* Would Add: X
* Would Update: Y
* Would Skip: Z
* Conflicts: C

* Buttons:
* Cancel
* Import (Merge)
* Replace All (only if eligible + gated)

### Feedback

* Progress indicator for large vaults
* Completion toast/dialog:

  * “Imported: X added, Y updated, Z skipped, C conflicts”
* Provide link/button: “View conflicts” (if you have no view—invent new UI)
---

## 11) Technical Implementation Notes

### 11.1 Filesystem

Prefer File System Access API when available:

* showSaveFilePicker for export
* showOpenFilePicker for import

* Fallback:
* <input type="file"> and create downloadable Blob for export.

### 11.2 Zip Creation/Parsing

Use a small zip library (e.g. JSZip). Keep dependency minimal.

### 11.3 YAML Frontmatter

Use existing parser if present; otherwise add a small frontmatter parser.

Must tolerate:

* missing frontmatter
* malformed YAML → treat as no metadata and import as new note

### 11.4 Date Parsing

Support ISO strings and epoch milliseconds if existing repo uses that.

Create a single utility:

* parseTimestamp(value): number | null returning epoch ms or null

### 11.5 Repo Integration

Add a thin service layer that depends on existing Documents Repo v0:

* listAllNotes(): Promise<Note[]>
* getNoteById(id): Promise<Note | null>
* upsertNote(note): Promise<void>
* deleteAllNotes(): Promise<void> (required for Replace All)

* If repo lacks deleteAllNotes, implement store clear within repo.
---

## 12) API / Module Design (Suggested)

### backup/backupTypes.ts

* BackupV1, BackupNoteV1, BackupStatsV1

### backup/exporter.ts

* exportBackupJson(repo): Promise<BackupV1>
* exportMarkdownBundle(repo): Promise<Blob> (zip blob)
* downloadBlob(blob, filename)

### backup/importer.ts

* detectImportFormat(file): Promise<"backupJson" | "markdownZip" | "unknown">
* dryRunImport(file, repo): Promise<DryRunResult>
* applyImport(file, repo, mode: "merge" | "replaceAll"): Promise<ImportResult>

### backup/diff.ts

* computePlan(incomingNotes, existingNotes): ImportPlan
* classify(noteIncoming, noteExisting): "add" | "update" | "skip" | "conflict"

### backup/frontmatter.ts

* extractFrontmatter(mdString): { meta: Record<string, any>, body: string }
---

## 13) Acceptance Tests (Must Pass)

### Export

1. Export Backup JSON produces valid JSON with backupVersion: 1 and correct note count.
2. Export Markdown Bundle contains one .md per note, with id in frontmatter when available.
3. Export does not mutate the repo.

⠀
### Import — Merge

1. Import Backup JSON (merge) into empty repo results in identical note count and content.
2. Import Backup JSON (merge) into non-empty repo:

   * older incoming note does not overwrite newer local note
3. Import Markdown Bundle with valid ids:

   * updates/skip follow timestamp rules
4. Import Markdown Bundle without ids:

   * imports as new notes (no overwrites)
5. Dry-run counts match the actual applied results.

⠀
### Conflicts

1. When conflict detected, local note remains unchanged and an additional “CONFLICT — …” note is created.
2. Conflicts are never silently merged.

⠀
### Replace All

1. Replace All is only possible for Backup JSON.
2. Replace All wipes local notes and restores exactly the incoming snapshot.
3. Replace All cannot proceed without required confirmation gate.

⠀
### Resilience

1. Malformed JSON shows an error and performs no repo writes.
2. Malformed zip / unreadable files show an error and perform no repo writes.
3. Unknown backupVersion prompts an error (“unsupported backup version”) and performs no repo writes.

⠀
---

## 14) Telemetry / Logging (Local Only)

* Keep lightweight console logging behind a dev flag.
* No remote analytics.
---

## 15) Rollout Notes

* This is v0: manual only, no automation.
* Keep UI minimal. Do not add “backup schedules” or “sync hints.”
* After this ships, next planned spec: Inbox Processing v0.

END