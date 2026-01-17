# Changelog

## Unreleased
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
