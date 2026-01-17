# Editor v1 — Focus + Flow (iA Writer–Inspired)
Version: 1.0  
Depends on: Editor v0, Documents Repo v0  
Purpose: Turn a functional editor into a calm, premium writing instrument.

---

## 0. Explicit Non-Goals
Do NOT build:
- Markdown preview / split view
- Search or backlinks
- Task parsing or checkboxes as first-class objects
- Collaboration, comments, suggestions
- Theme marketplace or heavy customization UI

This spec is about **feel**, not features.

---

## 1. Focus Mode
Primary feature of v1.

### Behavior
- Dim all text except the active unit:
  - Choose ONE for v1:
    - **Paragraph focus** (recommended), OR
    - Sentence focus
- Active unit determined by cursor position.
- Dimming uses opacity only (no layout shifts).

### Toggle
- On/off toggle in editor header (icon-only).
- Default: OFF (can be remembered per user or per document).

### Persistence
- Store preference in:
  - local UI state OR
  - document.meta.editor.focusMode (boolean)

---

## 2. Typewriter Scroll
Secondary feature, critical to “iA feel.”

### Behavior
- Keep caret roughly centered vertically while typing.
- Only activates during input (not when navigating with scroll).
- Disable temporarily when user manually scrolls.

### Configuration
- Offset ratio (e.g., 45–55% of viewport height).
- No UI for configuration in v1 (constants are fine).

---

## 3. Typography & Readability
Light controls, no over-engineering.

### Layout
- Max content width:
  - Mobile: full width with comfortable padding
  - Desktop: clamp (e.g., 640–760px)
- Centered column.

### Text
- Line height optimized for longform writing.
- Font size presets:
  - Small / Default / Large (optional toggle).
- Use system font stack or one chosen writing font.

### Persistence
- Font size preference stored locally (not per document).

---

## 4. Editor Chrome Polish
Small signals that build trust.

### Save Status
- Indicator in header:
  - “Saving…” during debounced write
  - “Saved” after repo confirms write
- No toast notifications.

### Back Navigation Safety
- Navigating back must NOT:
  - Drop unsaved changes
  - Blur editor before save completes
- If save is pending:
  - Allow navigation
  - Complete save in background

---

## 5. Keyboard & Mobile Ergonomics (iOS)
Must not regress mobile writing.

### Requirements
- Editor retains focus on mount.
- Keyboard appearance does not:
  - Jerk scroll position
  - Break typewriter scroll logic
- No accidental focus loss on header button taps.

---

## 6. Implementation Notes (CodeMirror 6)
- Implement Focus Mode via CM6 decorations.
- Implement Typewriter Scroll via scroll listeners + view updates.
- Do NOT re-instantiate EditorView for mode toggles.
- Avoid expensive recomputation on every keystroke.

---

## 7. Settings Scope
No global settings screen in v1.

Allowed:
- Inline toggle(s) in editor header.
- Local persistence via localStorage or repo meta.

---

## 8. Acceptance Criteria
- Focus Mode cleanly dims non-active text.
- Typing feels stable and centered.
- No cursor jumps or lag.
- Save state is clearly communicated.
- Works reliably on iPhone Safari/WebView.
- Editor still loads fast with large documents.

---

## 9. Definition of Done
- Editor feels calm, deliberate, and boring in the best way.
- Writing for 30+ minutes causes no friction.
- No new architectural debt introduced.

END
