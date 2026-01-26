# Changelog

## 0.15.0 - 2026-01-26
- Add Supabase schema migration and docs for `documents` + `document_bodies`.
- Introduce Supabase client + document API helpers for sync operations.
- Persist a durable sync queue in IndexedDB with retry metadata and status store.
- Add hybrid sync manager with push/pull flows and conflict copy creation.
- Surface sync status in the shell header and show conflict toast notifications.

## 0.15.1 - 2026-01-26
- Add Supabase auth helpers and a dedicated login page.
- Gate the app behind authentication with a lightweight session check.
- Document a manual hybrid sync test checklist.

## 0.15.2 - 2026-01-26
- Add an env debug page to verify production Supabase env vars.
- Allow env debug route to bypass auth gate for diagnostics.
- Fix Supabase client env access for Next.js client builds.
- Add `.env.example` for local setup guidance.

## 0.14.2 - 2026-01-23
- Expand frontmatter parsing/serialization to support multiline values and nested structures.
- Align template insertion with shared frontmatter parsing logic.
- Document single-block template scaffold expectations in the templates spec.

## 0.14.1 - 2026-01-23
- Fix processed inbox items not appearing in notes list until page refresh.
- Remove archive option from inbox processing (now only Keep and Trash).

## 0.14.0 - 2026-01-23
- Add new `staged` document type for inbox items awaiting further triage.
- Inbox "Keep" action now creates `type: staged` with `status: backlog` in meta.
- Staged documents appear in the notes list and are searchable alongside notes.
- Fix processed inbox items appearing in Quick Capture "Recently edited" list.
- Add `processedFromInboxAt` timestamp to track inbox-to-staged transitions.
- Update repository `list()` and `getSearchableDocs()` to support filtering by multiple types.

## 0.13.0 - 2026-01-23
- Redesign inbox system to use `type: inbox` instead of `inboxAt` timestamp filtering.
- Quick Capture now creates documents with `type: inbox` that only appear in the Inbox.
- Inbox processing "Keep" action converts documents from `type: inbox` to `type: note`.
- Add `/logbook` page for viewing, restoring, and permanently deleting trashed items.
- Expand Quick Capture search to query all document types (excludes non-trashed inbox items).
- Add trashed items toggle in Quick Capture search with "T" badge indicator.
- Fix rapid capture mode not keeping input open after save.
- Add real-time inbox count updates when capturing from the inbox processing screen.

## 0.12.0 - 2026-01-22
- Add Manage Templates page at `/settings/templates` with edit, reset, and delete actions.
- Add Create Template flow with scaffold generation and navigation to editor.
- Add insert mode to Template Picker for inserting templates into existing documents.
- Implement frontmatter merge logic with additive merge and array deduplication.
- Add Cmd/Ctrl+Shift+T keyboard shortcut in editor to insert template at cursor.

## 0.11.0 - 2026-01-22
- Add a document frontmatter domain module with base schema parsing and alias handling.
- Define a registry of known document types with allowed/required keys (advisory).
- Introduce normalize + diff helpers for warnings, missing keys, and unknown keys/types.
- Add unit tests covering registry contents, deduping, aliases, and warnings.

## 0.10.1 - 2026-01-21
- Rename the core domain primitive from Note to Document across types, stores, and events.
- Rename system identity fields from noteId to documentId while keeping data behavior unchanged.
- Preserve frontmatter `type: note` semantics and legacy storage keys where required.

## 0.10.0 - 2026-01-20
- Add Search v1.5 ranking with tiered matches, fuzzy fallback, and body snippets.
- Build and maintain an in-memory search index with incremental updates.
- Add Cmd/Ctrl+K quick search shortcut with updated modal behaviors.
- Show up to 9 recent notes in Quick Capture and enable snippet toggles.
- Highlight search matches in notes list and document picker results.
- Mark archived matches in Quick Capture search results.

## 0.9.1 - 2026-01-20
- Fix wiki-link autocomplete not appearing due to closeBrackets conflict.
- Fix archive/trash actions not updating notes list UI without refresh.
- Fix inbox count on Now View not updating when Quick Capture adds items.
- Fix "Show archived" toggle displaying all notes instead of only archived.
- Fix back button on note editor routing to home instead of notes list.
- Exclude inbox items from Workbench picker, Quick Capture, and wiki-link autocomplete.

## 0.9.0 - 2026-01-20
- Add wiki-link support with `[[TARGET]]` syntax and autocomplete.
- Typing `[[` opens autocomplete menu with ranked document suggestions.
- Search by title and slug with prefix/substring matching and status tie-breakers.
- Show "Create" option when no exact match exists; creates note without navigating.
- Render wiki-links as styled clickable links with dimmed brackets.
- Click navigates to existing doc or creates and opens new doc.
- Add repository methods for link resolution and doc creation from title.
- Add IndexedDB slug index for fast lookup (schema version 4).

## 0.8.0 - 2026-01-20
- Replace home with Now View including Today, Inbox, and Workbench sections.
- Add Today Note find-or-create flow using daily slug and Zurich-local date.
- Update inbox count on Now View to exclude daily and inactive documents.
- Introduce Workbench pinning with max 5 items, replace flow, and unpin actions.
- Persist Workbench pins in settings with safe cleanup of missing documents.

## 0.7.0 - 2026-01-19
- Add inbox processing wizard at `/inbox` for one-at-a-time note triage.
- Extend notes with `inboxAt` field and DB index (schema version 3).
- Set `inboxAt` on Quick Capture saves; clear on process/archive/trash.
- Add title extraction from note body with markdown marker stripping.
- Show inbox count badge on Command page with link to processing wizard.
- Add Inbox to shell navigation menu.

## 0.6.0 - 2026-01-18
- Add Settings > Data exports for backup JSON and Markdown bundle.
- Add import flow with dry-run summary, merge defaults, and conflict handling.
- Add Replace All restore option for backup JSON with explicit confirmation gating.

## 0.5.0 - 2026-01-18
- Add trash/archive actions and filtering defaults to the documents repo.
- Expose archive/trash actions with undo and archived toggle in the notes list.
- Show trashed-note banner with restore action and read-only body view.
- Align search results with archived/trashed visibility rules.

## 0.4.0 - 2026-01-18
- Rebuild Quick Capture as a full-screen action center with 2-line input and top actions.
- Create notes from capture input and route directly to the editor.
- Add recent notes (3) and debounced search results with title-only rows.
- Add keyboard selection mode with listbox semantics and quick open.
- Add archive/trash match counts with session archive toggle.
- Extend documents with `archivedAt` and IndexedDB support (schema + index).
- Fix FAB touch warning from passive listeners.

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
