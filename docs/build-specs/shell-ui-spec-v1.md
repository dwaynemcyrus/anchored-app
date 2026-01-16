# Shell UI Build Spec — v1 (Personal OS PWA)

## Purpose
Build the **foundational UI shell** for a Personal OS PWA (iOS-first), with:
- consistent floating UI overlay (header + FAB)
- core navigation between root pages
- functional quick capture modal
- functional FAB long-press drag-to-navigate mode switch

This spec is **UI-only**. No editor implementation in v1.

## Governing Docs
- Project scope: `SCOPE.md`
- This spec: `docs/shell-ui-spec-v1.md`

## Platforms
Primary: iOS (phone-first)  
Secondary: tablet, desktop

## Routes (App Router)
- `/` — Home (aka Now page; content later)
- `/command` — Command root
- `/knowledge` — Knowledge root
- `/strategy` — Strategy root

## Page Content (v1)
Each page is blank scaffold content with:
- a visible title (e.g. “Home”, “Command”, “Knowledge”, “Strategy”)
- placeholder body area (empty or minimal spacing block)

No additional feature UI.

---

# Global UI Shell

## Principle: Content is Primary
The UI must float above content. Content scrolls underneath.  
Avoid permanent chrome that consumes vertical space.

## Global Shell Elements (all routes)
1. Floating Header (top overlay)
2. Floating FAB (bottom overlay)
3. Modal layer for Quick Capture (when opened)

These elements must be consistent across `/`, `/command`, `/knowledge`, `/strategy`.

---

# Floating Header (Top Overlay)

## Placement
- Overlays content at the top
- Content scrolls underneath
- Header remains visible while content scrolls

## Left Header Button Behavior
- On `/`:
  - show a **menu icon** as a placeholder (no action required in v1)
- On `/command`, `/knowledge`, `/strategy`:
  - show a **back button**
  - back navigates to `/` (Home)

## Title / Context
- Display the current page title in the header area (simple text is fine in v1)
- Keep it visually lightweight

## Accessibility
- Buttons must be keyboard-focusable
- Provide aria-labels for icon-only buttons

---

# Floating Action Button (FAB)

## Placement
- Overlays content near bottom (safe-area aware on iOS)
- Remains visible while content scrolls

## Interactions Summary
- Tap: opens Quick Capture modal
- Long-press (300ms): activates drag-to-target mode switch

---

# Quick Capture Modal (FAB Tap)

## Trigger
- FAB tap opens modal

## Modal Contents
- Single text field (multiline optional; single line acceptable)
- Buttons:
  - **Save**
  - **Cancel**

## Save/Cancel Rules
- Save:
  - Only enabled/allowed when text field contains non-whitespace text
  - ENTER key triggers Save (when text is non-empty)
  - On Save:
    - store text **in-memory only** (no persistence required)
    - close modal
    - clear input after close (or on next open)
- Cancel:
  - closes modal
  - discards input

## Backdrop Tap Rules
- Tapping outside modal:
  - if input is empty (or whitespace): cancel + close
  - if input contains text: do NOT close (user must Save or Cancel)

## Scroll Lock
While modal is open:
- background scroll must be locked
- focus should be placed into the text field

## Accessibility
- aria-modal semantics (native dialog or accessible equivalent)
- Escape key closes only when input is empty (optional but preferred); otherwise no-op

---

# Long-Press Drag-to-Navigate Mode Switch (FAB Hold)

## Trigger
- Press and hold FAB for **300ms**
- After 300ms:
  - show three visual target fields
  - FAB enters “drag mode”
  - dragging FAB over a target and releasing triggers navigation

## Targets (positions relative to FAB origin)
- Command: left of FAB origin
- Knowledge: right of FAB origin
- Strategy: above FAB origin

## Visual Requirements (v1)
- Targets must be clearly visible and labeled:
  - “Command”
  - “Knowledge”
  - “Strategy”
- When FAB is dragged over a target:
  - target indicates “active/selected” (highlight state)

## Selection + Navigation Rules
- User drags FAB onto a target and releases:
  - navigate immediately to the target route:
    - Command → `/command`
    - Knowledge → `/knowledge`
    - Strategy → `/strategy`
  - targets disappear
  - FAB returns to normal state at its default position

## Cancel Rules
- If user releases without dropping on a target:
  - cancel
  - targets disappear
  - FAB snaps back to its original position/state

## Gesture Rules
- Drag begins only after the 300ms hold threshold is reached
- If the user moves finger before 300ms, treat as normal drag? (v1 rule: ignore; only activate drag after threshold)
- Prevent accidental scroll during active drag mode

## Accessibility Note
This interaction is gesture-heavy. In v1:
- Provide a fallback: long-press also opens a simple list (optional)
- If no fallback is built in v1, document it as a follow-up

---

# Styling & UI Constraints (Mandatory)
- No Tailwind
- No shadcn/ui
- Use descriptive, human-readable CSS Modules (or a consistent CSS approach established in repo)
- Use icons sparingly
- Radix primitives allowed only when needed for interaction/accessibility
- Safe-area aware spacing for iOS (header and FAB)

---

# Non-Goals (Explicit)
Not part of v1:
- Editor or CodeMirror integration
- Document system
- Task engine
- Habits
- Timers
- Knowledge graph/backlinks
- Strategy planning features
- Auth / persistence / sync
- Analytics / notifications
- Visual polish beyond clarity

---

# Acceptance Criteria (v1 Done When)
1. App Router routes exist: `/`, `/command`, `/knowledge`, `/strategy`
2. Floating header overlays content and is consistent across routes
3. Header left button:
   - `/` shows menu icon placeholder
   - other routes show back button returning to `/`
4. FAB overlays content and is consistent across routes
5. FAB tap opens Quick Capture modal:
   - scroll lock works
   - Save/Cancel/outside-tap rules work
   - Enter saves when text is non-empty
   - in-memory save occurs and modal closes
6. FAB long-press (300ms) activates mode targets:
   - drag-to-target + release navigates immediately
   - release without target cancels and snaps back
7. Styling constraints are respected (no Tailwind/shadcn)
8. UI sits above content; content remains primary and scrolls beneath