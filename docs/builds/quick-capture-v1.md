# Quick Capture v1 — Full-Screen Action Center (Notes Only)
Version: 1.0  
Depends on: Documents Repo v0 + Local Search v0 + Trash/Archive v0 + Shell UI  
Purpose: A full-screen action center for instant capture and fast jumping. Capture-first. Keyboard-first on desktop.

---

## 0) Non-Goals
Do NOT build:
- Multi-type documents (notes only in v1)
- Advanced search operators, filters UI (beyond archived/trash indicators)
- Preview pane / snippets
- Bulk actions
- Supabase sync

This is: full-screen capture + short results + keyboard navigation + archive/trash awareness.

---

## 1) Route + Presentation
### Route
- `/command` (or `/shell/command` if your shell is namespaced)  
This must be a full-screen screen, not a modal.

### Open Triggers
- FAB tap opens Quick Capture screen
- Desktop shortcut:
  - Cmd+K (macOS)
  - Ctrl+K (Windows/Linux)

### Close / Exit
- Cancel button (bottom-right, next to Save)
- Escape key closes Quick Capture (from anywhere)
- Enter can also exit (when it creates/saves a new note; see Section 4)

---

## 2) Layout (Full Screen)
### Top
- Single input field pinned at the top
- Autofocus on open
- Placeholder: “Capture…”

### Middle
- Results list area

### Bottom (Pinned)
- Left: optional status text (e.g., “Enter to save”)
- Right: two buttons:
  - Save
  - Cancel

Notes:
- Save and Enter perform the same action in input mode (create note).
- Results list is title-only rows.

---

## 3) Modes (Input vs Selection)
Quick Capture has two interaction modes:

### 3.1 Input Mode (default)
- Cursor is in input field
- Enter creates a new note (fast capture-first)
- Search results display based on input length rules (Section 4)

### 3.2 Result Selection Mode (keyboard-driven on desktop)
- User can move focus from input to results:
  - Tab enters selection mode and highlights the first result (if any)
  - Arrow Up/Down moves selection through results
  - Enter opens the selected note (routes to editor) and closes Quick Capture
- Escape OR Ctrl+Tab exits selection mode and returns focus to input field
  - (Pick one as primary; implement both if easy)
- While in selection mode:
  - typing should return focus to input (optional), or require explicit Escape/Ctrl+Tab (safer)

Mobile:
- Selection mode is not required; tapping a row opens it.

---

## 4) Results Rules
Notes only. Title-only rows. No snippets.

### 4.1 Empty input
- Show “Recently edited” list (9–12 items)
- Source: documents list sorted by updatedAt DESC
- Exclude archived by default
- Exclude trashed always (but show counts; see 6)

### 4.2 Input length < 2
- No search performed
- Continue showing “Recently edited”
- Optionally show a helper line: “Type 2+ characters to search”

### 4.3 Input length ≥ 2
- Show top 9–12 search results (title match ranking from Local Search v0)
- Results exclude archived by default
- Results exclude trashed always (but counts displayed; see 6)

---

## 5) Create / Save Behavior (Capture-first)
### Save button
- Creates a new note using the input text as the first line (title seed)
- Then closes Quick Capture and routes to the new note in editor

### Enter key in Input Mode
- Same as Save button:
  - Create new note
  - Close Quick Capture
  - Route to editor

### Note creation format
When inputText is non-empty:
- body = `${inputText.trim()}\n\n`
- title remains null (derived title rule applies)

When inputText is empty:
- body = `\n`
- title remains null
- derived title becomes “Untitled”

### After create
- Clear input (not necessary because screen closes)
- Add opened/created note to recents list (optional; not required if “recent” is updatedAt-driven)

---

## 6) Archive + Trash Awareness (Counts + Toggle)
Quick Capture should remain clean, but must communicate hidden matches.

### Trashed
- Trashed notes are NEVER shown in results.
- If the current query would match trashed notes:
  - Show a subtle line above results:
    - “Trash matches: {count}”
- No “Show trash” in v1 (just count).

### Archived
- Archived notes are hidden by default.
- If the current query would match archived notes:
  - Show a subtle line above results:
    - “Archived matches: {count}  [Show]”
- Tapping “Show” toggles `includeArchived = true` for this session.
- When includeArchived is true:
  - Archived notes can appear in results list (still exclude trashed)
  - Provide a “Hide” toggle.

Empty input (recently edited):
- Still hides archived by default
- If includeArchived is true, recent list can include archived notes too.

---

## 7) Result Selection Behavior
### Tap / Click
- Opens selected note in editor route:
  - `/knowledge/notes/[id]`
- Closes Quick Capture immediately

### Keyboard
- In selection mode:
  - Enter opens selected note and closes Quick Capture
- Escape closes Quick Capture (global), unless in selection mode where:
  - First Escape returns to input field (preferred)
  - Second Escape closes screen (optional)

---

## 8) Performance Constraints
- Debounce search input: 150–250ms
- Limit results to 12
- Title-only list rows (no snippet rendering)
- Search must not block typing (async calls)
- No body reads for “recently edited” list unless required by your repo

---

## 9) State & Persistence
### Input
- Local state only (no need to persist between openings)

### includeArchived toggle
- Session-only is fine (resets on close), OR
- Persist in localStorage:
  - `anchored.quickCapture.includeArchived` = true/false

Choose session-only unless you want it sticky.

---

## 10) Accessibility & Focus
- Autofocus input on open
- Visible focus ring for selected result in keyboard mode
- ARIA roles for listbox + options (desktop)
- Ensure Tab order is deterministic:
  - Input → Results (first item) → Save → Cancel → (wrap)

---

## 11) Acceptance Criteria
- FAB opens full-screen Quick Capture
- Cmd/Ctrl+K opens on desktop
- Empty input shows 9–12 recently edited notes
- <2 chars does not search
- ≥2 chars shows 9–12 results
- Enter in input mode creates note and routes to editor
- Tab enters results selection; arrows navigate; Enter opens selection
- Escape exits selection mode back to input; Escape can close screen
- Archived matches show count + Show toggle; trashed matches show count only
- Opening a result closes Quick Capture immediately

---

## 12) Definition of Done
- Quick Capture is a fast, full-screen action center
- Capture-first behavior is consistent on mobile + desktop
- Keyboard navigation is predictable and powerful
- Archive/trash rules are enforced without cluttering the UI

END