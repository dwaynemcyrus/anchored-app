# Editor v1.1 — Typewriter Scroll (Caret Anchoring)
Version: 1.1
Depends on: Editor v0 + Documents Repo v0
Purpose: Implement iA-style typewriter scrolling without jitter, without fighting user scroll, and without breaking iOS keyboard behavior.

---

## 0) Explicit Non-Goals
Do NOT build:
- Focus mode dimming
- Markdown preview/split view
- Search
- Settings screens
This spec is only: caret anchoring while typing.

---

## 1) Feature Definition
Typewriter scroll keeps the caret near a target vertical position while typing.

### Target
- targetRatio: 0.45 (45% down from top of editor viewport)
- deadZonePx: 24 (no scroll if caret is within ±24px)

### Trigger
Run on:
- input transactions (insert, delete, enter, paste)
Do NOT run on:
- selection-only changes (arrow keys, tap-to-place) until next input

---

## 2) Core Algorithm
### Inputs
- CM6 view
- current selection head position

### Steps
1) Get caret coords:
   - caretRect = view.coordsAtPos(selection.head)
2) Compute targetY:
   - targetY = viewportTop + viewportHeight * targetRatio
3) delta = caretRect.top - targetY
4) If |delta| > deadZonePx:
   - scroll editor container by delta (in the correct direction)
5) Batch scroll:
   - ensure at most 1 scroll adjustment per animation frame (requestAnimationFrame)

### Scroll method
Prefer deterministic behavior:
- container.scrollTop += delta
Avoid smooth animations in v1.1 (stability first).

---

## 3) Manual Scroll Override (Don’t Fight the User)
### Detect manual scroll
- Listen to container scroll events
- If scroll event occurs without an immediately preceding programmatic scroll:
  - suspend typewriter behavior

### Suspension rules
- suspendForMs: 1200
- extend suspension if user keeps scrolling
- re-engage only after:
  - suspension window ends AND user types again

---

## 4) iOS Keyboard & Viewport Resizes
### Requirements
- Use visualViewport if available
- On visualViewport resize:
  - recompute viewportHeight and targetY
  - do NOT force-scroll immediately
  - wait 150ms settle timer OR next input, then snap caret into dead zone if needed

---

## 5) Toggle & Persistence
### Toggle
- Header icon toggle: Typewriter ON/OFF

### Default
- OFF (safer for v1.1) unless you explicitly want iA behavior by default.

### Persistence
- localStorage:
  - key: anchored.editor.typewriter.enabled
  - value: "true" | "false"

---

## 6) Performance Constraints
- At most 1 scroll adjustment per animation frame
- Avoid repeated layout reads per keystroke
- Do not re-instantiate EditorView
- No React re-render loop per keystroke (CM6 owns the text)

---

## 7) Edge Cases
Must handle:
- top of doc (clamp at 0)
- bottom of doc (clamp at max)
- long paste events (snap afterward)
- holding backspace (continuous input)
- tapping to reposition caret:
  - do NOT auto-snap until next input
- route focus changes / returning from back navigation:
  - no sudden jump unless user types

---

## 8) Acceptance Criteria
- Typing keeps caret near target position, no jitter
- Manual scrolling is respected (no tug-of-war)
- iOS keyboard appearance doesn’t break anchoring
- Works on 10k+ word docs without lag

---

## 9) Definition of Done
- Typewriter mode feels “invisible” when ON
- Toggle works and persists
- No regressions to saving, loading, list navigation

END
