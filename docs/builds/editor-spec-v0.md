# Editor Build Spec — v0 (Codex-Ready Build Spec) 
Scope: Knowledge → Notes → Editor  
Objective: Ship the smallest *complete* loop: list → open → write → autosave → back → list reflects update.

---

## 0. Explicit Non-Goals (do not build)
- Search, filters, tags, folders, pinning
- Sorting UI (hardcode one sort)
- Multi-select / bulk actions
- Markdown preview / split view
- Tasks, habits, backlinks, graph, references
- Supabase, auth, sync, collaboration
- Version history beyond updatedAt

This slice exists to validate **typing feel + navigation loop + local persistence**.

---

## 1. Data Model (local-only)
Implement a minimal notes store using:
- Zustand (preferred)

### Note shape
- id: string (uuid)
- title: string | null
- body: string (markdown)
- createdAt: number (epoch ms)
- updatedAt: number (epoch ms)

### Title rule (iA-style)
- If `title` is null or empty:
  - derive from first non-empty line of `body`
  - trim whitespace
  - fallback: `"Untitled"`
- No separate title input in v0.

### Sorting
- Notes list sorted by `updatedAt DESC`.

### Persistence
- Persist entire notes array/object to localStorage
- Key: `anchored.notes.v0`
- Hydrate store on app load
- Debounce writes (300–800ms)

---

## 2. Routes
Assuming Next.js App Router.

- `/knowledge/notes` → Notes List
- `/knowledge/notes/[id]` → Editor

Add a temporary testing link in the global left menu:
- Label: “Notes (v0)”

---

## 3. Notes List (/knowledge/notes)
Purpose: select or create a note.

### UI
- Header:
  - Title: “Notes”
  - Action: “New”
- List items:
  - Derived title
  - Simple updated time (no relative math required)
- Empty state:
  - Text: “No notes yet”
  - Primary action: “Create your first note”

### Behavior
- Tap note → navigate to editor route
- Tap New:
  - Create note with:
    - id = uuid
    - title = null
    - body = ""
    - createdAt / updatedAt = now
  - Persist
  - Immediately navigate to editor

---

## 4. Editor (/knowledge/notes/[id])
Purpose: write markdown with zero friction.

### 4.1 Core Engine
- CodeMirror 6
- Line wrapping ON
- Markdown language support (syntax highlighting only)
- Mobile-friendly (iOS Safari/WebView)

### 4.2 Layout
- Minimal header:
  - Back button → `/knowledge/notes`
  - Optional center: derived title (read-only)
  - Optional right: save status (“Saving…”, “Saved”),  
- Editor fills remaining viewport

### 4.3 Behavior
- Load note by id from store
- If not found:
  - Show “Note not found” + Back action
- Editing updates `body`
- Update `updatedAt` on change (debounced)
- Autosave to localStorage (debounced)
- Do NOT remount editor on every keystroke

### 4.4 iA-like Features (v0 limits)
- Required:
  - Stable cursor
  - Smooth scrolling
- Optional if cheap:
  - Typewriter scroll (caret near vertical center)
- Explicitly skip:
  - Focus mode dimming (can come v1)

---

## 5. Implementation Constraints
- No Tailwind
- No shadcn/ui
- CSS Modules only (descriptive names)
- Radix primitives only if absolutely necessary
- Keep components small and boring

---

## 6. Acceptance Criteria
- Notes list loads from menu
- New note creates + opens editor
- Typing feels stable (no cursor jumps)
- Back returns to list
- List reflects updated title / time
- Refresh preserves notes
- Works on iPhone without keyboard glitches

---

## 7. Suggested Structure
app/
  knowledge/
    notes/
      page.tsx
      [id]/
        page.tsx
components/
  notes/
    NotesList.tsx
    NoteListItem.tsx
    NoteEditor.tsx
store/
  notesStore.ts
lib/
  notesPersistence.ts
styles/
  notesList.module.css
  noteEditor.module.css

---

## 8. CM6 Guardrails
- Instantiate EditorView once
- Use transactions, not re-mounts
- Avoid binding editor value directly to React state per keystroke
- Debounce persistence
- Ensure focus on mount; do not steal focus on back navigation

END