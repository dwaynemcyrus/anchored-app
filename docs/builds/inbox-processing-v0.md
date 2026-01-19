# Inbox Processing v0 (Command-to-Note Clarification)


version: 0.1
status: spec
owner: Anchored OS
principles:
- local-first
- markdown-first
- notes-only (no new doc types)
- composable scope
- behavioral guarantees over features
- inbox is a state, not a type
- quick capture remains capture-first (not search)

## 0) Context / Current State (DO NOT REBUILD)
Already built and locked:
- Editor v0 (CodeMirror 6, markdown-first)
- Documents Repo v0 (local-first, IndexedDB)
- Focus Mode Dimming (Editor v1)
- Local Search v0 (title + body)
- Trash / Archive v0 (soft delete contract)
- Quick Capture v1 (full-screen action center, capture-first)

Explicitly cancelled / out of scope:
- Typewriter Scroll / Caret Anchoring (do not depend on this)

This spec adds: a focused inbox processing wizard over captured notes, using a single `inboxAt` timestamp.

---

## 1) Goal
Provide a dedicated `/inbox` processing mode that:
- surfaces unprocessed captured notes (Inbox state)
- processes them one-at-a-time in oldest-first order
- resolves each note via single-tap exits: Keep (process), Archive, Trash
- optionally helps rename by extracting a title from the note body
- never turns into tasks/projects/tags/folders

Non-goals:
- GTD projects/contexts, tags, folders, task modeling
- reversible “send back to inbox”
- 2-minute rule wizard branching (“go do it now”)
- global search in Quick Capture
- remote sync / Supabase

---

## 2) Definitions
- Note: the only document type.
- Inbox state: a note is “in inbox” when `inboxAt` is set (non-null), and it is not archived or trashed.
- Processed: `inboxAt` is null.
- Wizard: one-at-a-time UI that advances to the next inbox item after each action.

---

## 3) Data Model Change (Minimal)
Add ONE optional field to notes:
- `inboxAt: string | number | null`
  - ISO timestamp or epoch ms, consistent with existing date strategy.

### Rules
- Notes created via Quick Capture MUST set `inboxAt = createdAt` at creation time.
- Processing a note MUST set `inboxAt = null`.
- Archive/Trash actions MUST also set `inboxAt = null` (terminal exits).

No other schema expansion is allowed in v0.

---

## 4) Behavioral Guarantees (Hard Contracts)
### G1 — Inbox is derived, not invented
- Inbox is computed from metadata; there is no “inbox document type.”

### G2 — Safe exits, no silent state drift
- Each note processed must end in exactly one of:
  - Processed (Keep): `inboxAt = null`
  - Archived: archived flag set AND `inboxAt = null`
  - Trashed: deleted flag set AND `inboxAt = null`
- Inbox list never includes archived/trashed notes even if metadata is inconsistent.

### G3 — One-at-a-time, oldest-first determinism
- The “current” note is always the oldest inbox item by `inboxAt` (tie-breakers defined below).
- After an action, the wizard advances deterministically to the next item.

### G4 — No reversibility feature in Inbox
- No “send back to inbox” UI or actions.
- Recovery from mistakes is via existing Archive/Trash views only (already implemented).

---

## 5) Inbox Query Contract
A note is in Inbox iff:
- `inboxAt != null`
- AND `deletedAt == null` (or equivalent soft delete field)
- AND `archivedAt == null` (or equivalent archive field)

### Ordering
- Primary: ascending by `inboxAt` (oldest first)
- Tie-breaker 1: ascending by `createdAt`
- Tie-breaker 2: ascending by `id` (stable)

### Date parsing
- Implement a single `parseTimestamp(value): number | null` that supports:
  - ISO strings
  - epoch ms numbers
- If `inboxAt` cannot be parsed:
  - treat as “least reliable”
  - place at the END of inbox ordering (so valid timestamps process first)

---

## 6) Routes & Navigation
### New route
- `/inbox` — full page

### Entry point
- Add a visible link/button inside `/command` to navigate to `/inbox`
  - Label: “Inbox”
  - Optional badge count: number of inbox items (recommended; if cheap)

### Exit
- Standard app back affordance returns to `/command` (or previous route per existing shell rules).

No additional navigation modes.

---

## 7) UI Spec — `/inbox` (Full Page Wizard)
### Layout (minimum)
- Header:
  - Title: “Inbox”
  - Progress indicator: “N remaining” (recommended)
- Body:
  - Current note display panel
    - Title input (editable)
    - Body preview (read-only) OR lightweight viewer
      - Must show full text; scrolling allowed
      - Do NOT depend on caret anchoring or typewriter scroll
- Footer action bar (primary controls):
  - **Keep** (process)
  - **Archive**
  - **Trash**
- Secondary actions (near title field):
  - **Use first line as title**
  - (Optional) Clear title

### Empty state
If inbox is empty:
- Show message: “Inbox is empty.”
- Show action: “Back to Command” (optional if header back exists)

### Loading state
- If notes are still loading, show skeleton/loader.
- Avoid blocking UI longer than necessary.

---

## 8) Title Extraction Rule (Locked)
Action: “Use first line as title”
- Find first non-empty line from the note body.
- Strip leading markdown markers:
  - headings: `#`, `##`, ... (strip `#` + following single space if present)
  - list markers: `- `, `* `, `+ `
  - numbered list: `1. `, `1) `
  - task list: `- [ ] `, `- [x] `
  - blockquote: `> `
- Trim whitespace.
- Truncate to max 80 characters.
- If result is empty after stripping: do nothing (no title change).

No AI summarization. No heuristics beyond stripping markers + truncation.

---

## 9) Actions & State Transitions
### Keep (Process)
On tap:
- Persist any edits to title (and body if editable in this view; see note below).
- Set `inboxAt = null`.
- Save note.
- Advance to next inbox item.

### Archive
On tap:
- Set archive flag per Trash/Archive v0 contract (e.g., `archivedAt = now`).
- Set `inboxAt = null`.
- Save note.
- Advance.

### Trash
On tap:
- Set soft delete per contract (e.g., `deletedAt = now`).
- Set `inboxAt = null`.
- Save note.
- Advance.

### Note about body editing in `/inbox`
v0 preference:
- Title is editable.
- Body is view-only (read context), to keep wizard fast and not become “another editor.”
If your existing editor component is trivial to embed safely, you MAY allow body edits, but do not add new editing features.
Acceptance tests must pass either way; choose one implementation and keep it consistent.

---

## 10) Wizard “Next Item” Algorithm
Maintain a local ordered list of inbox ids (computed from query contract).
On entering `/inbox`:
1) Query repo for all inbox notes using filters.
2) Sort by ordering rules.
3) Set `currentId = first`.

On each action (Keep/Archive/Trash):
1) Apply mutation to current note.
2) Optimistically remove currentId from local inbox list.
3) Set `currentId = next id in list`, or show empty state if none.
4) Optionally revalidate by re-querying repo after mutation batch completes.

Edge cases:
- If mutation fails: show error, do not advance.
- If note missing (deleted externally): remove from list and advance.

---

## 11) Repository / Service Layer Requirements
Extend Documents Repo v0 with minimal helpers (or implement via existing API):
- `listInboxNotes(): Promise<Note[]>` (or `listNotesByFilter(filter)`)
- `updateNote(notePartialWithId): Promise<void>`
- `archiveNote(id): Promise<void>` (optional helper)
- `trashNote(id): Promise<void>` (optional helper)

### Required for Quick Capture v1 integration
Ensure Quick Capture create call sets:
- `inboxAt = createdAt` (same timestamp)

---

## 12) Performance Constraints
- Must handle at least 5,000 notes total with acceptable load time.
- Inbox query should only pull inbox items, not the entire vault.
- Body preview rendering must be efficient:
  - avoid heavy markdown rendering per keystroke
  - render on demand or as plain text with minimal formatting (acceptable v0)

---

## 13) Out of Scope (Explicit)
- Reversible “Send back to Inbox”
- 2-minute rule branching
- Batch processing / multi-select
- Tags, folders, backlinks, tasks, dependencies
- Auto rules / automation / scheduling
- Remote sync / Supabase

---

## 14) Acceptance Tests (Must Pass)
### Inbox state + ordering
1) Notes created via Quick Capture have `inboxAt` set and appear in `/inbox`.
2) Archived notes do NOT appear in inbox even if `inboxAt` is accidentally non-null.
3) Trashed notes do NOT appear in inbox even if `inboxAt` is accidentally non-null.
4) Ordering is oldest-first by `inboxAt` with specified tie-breakers.

### Wizard flow
5) `/inbox` displays the first (oldest) inbox note as current.
6) Tap Keep:
   - sets `inboxAt = null`
   - persists title edits
   - advances to next note
7) Tap Archive:
   - sets archive flag
   - sets `inboxAt = null`
   - advances
8) Tap Trash:
   - sets deleted flag
   - sets `inboxAt = null`
   - advances
9) When last inbox item is processed, empty state displays.

### Title extraction
10) “Use first line as title”:
    - selects first non-empty line
    - strips markdown markers
    - truncates to 80 chars
    - does not set empty title

### Reliability
11) If repo mutation fails, wizard does not advance and shows an error.
12) If current note disappears mid-flow, wizard skips it and advances safely.

---

## 15) Implementation Notes (Codex Guidance)
- Keep `/inbox` as a small page composed of:
  - `useInboxNotes()` hook (loads + sorts + manages current index)
  - `InboxNoteViewer` (title input + body preview)
  - `InboxActions` (Keep/Archive/Trash + title extraction)
- Use optimistic UI but always reconcile with repo state after mutation bursts.
- Do not introduce new global state managers unless already present.

END