# Changelog

## 0.3.0 - 2026-01-18
- Add local search in Notes list with URL-persisted queries.
- Rank results by title/body matches with generated snippets.
- Keep list hydration lightweight while scanning bodies on demand.

## 0.2.4 - 2026-01-18
- Rework the shell layout into a single internal scroller with overlay header/FAB.
- Add VisualViewport-based keyboard inset handling and safer focus scrolling.
- Adjust note editor focus behavior to avoid iOS header jumps on long notes.
- Add editor-only keyboard-safe bottom padding for caret visibility.
- Center the FAB with safe-area offsets and stack header actions into two rows.

## 0.2.3 - 2026-01-18
- Set New Atten as the default UI font with full weight/italic support.
- Update editor typography to use New Atten for content and gutters.
- Simplify editor chrome and gutter presentation (padding/border/background).
- Adjust CodeMirror line number sizing, spacing, and focus outline styling.

## 0.2.2 - 2026-01-17
- Add editor focus mode and font size toggles with local persistence.
- Implement paragraph focus dimming and typewriter scroll behavior.
- Refine editor typography, width, and save-status timing.
- Prevent iOS focus zoom by enforcing a 16px minimum editor font size.
- Document fixed typewriter scroll offset limitation.

## 0.2.1 - 2026-01-17
- Add documents contract helpers, IndexedDB bootstrap, and repo interface.
- Implement IndexedDB documents repo with legacy localStorage migration.
- Refactor notes store/UI to use repo-backed persistence and on-demand loading.
- Remove legacy localStorage persistence module.
- Avoid flashing new notes in the list before navigation.
- Move note title and save status into the shell header.
- Remove the content-level back link from the note editor.
- Refine shell header sizing and spacing for mobile tap targets.

## 0.2.0 - 2026-01-16
- Add local notes store with debounced localStorage persistence and derived title rules.
- Ship Notes list with empty state and new-note flow at `/knowledge/notes`.
- Introduce CodeMirror-based editor at `/knowledge/notes/[id]` with autosave status and not-found state.
- Add a temporary “Notes (v0)” link in the home menu overlay.

## 0.1.0 - 2026-01-16
- Add App Router scaffolding for Home, Command, Knowledge, and Strategy with placeholder content.
- Introduce a floating shell with overlay header, FAB, and back/menu behavior across routes.
- Implement Quick Capture as a mobile bottom sheet and desktop modal with save/cancel rules, scroll lock, and in-memory capture.
- Add Rapid capture toggle to keep focus and auto-save on Enter without closing.
- Build FAB long-press drag-to-navigate targets with touch/pointer handling and safe-area styling.
- Document known limitations (iOS keyboard viewport shift, no drag fallback menu).
