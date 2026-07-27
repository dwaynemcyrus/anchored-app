# Changelog

This file records notable changes to Anchored rather than duplicating every
Git commit. The format follows [Keep a Changelog], and releases follow
[Semantic Versioning].

## [Unreleased]

### Added

- An interactive design prototype for a minimal four-pane shell — navigation,
  note list, editor, and inspector — with drag-resizable panes and a no-vault
  state that shows a wordmark, settings, and a call to action rather than
  disabled controls. It lives at `docs/prototypes/four-pane-shell.html` and is
  a design artifact only: the application interface is unchanged. Note-list
  rows show a two-line excerpt by default, with a one-line option in Settings.
  A two-finger swipe over the editor closes and reopens the two left panes one
  at a time — navigation first, then the list, reopening in reverse — and the
  position is remembered. The inspector is toggled by a button instead. The
  editor area holds tabs and nested, resizable splits, with the same document
  free to appear in any number of them; a tab's context menu can pin the tab,
  pin the note as a reference in the inspector, or open it in a floating
  window.
- A reference list of interface capabilities Anchored lacks against the
  applications named in the overview, at `docs/design/ui-gaps.md`.

## [0.1.6-alpha] - 2026-07-26

### Fixed

- Moving a note or folder to Trash could fail with "The Anchored trash index
  is invalid" in a vault that had trashed items from before Trash identities
  moved to UUIDv7. Those older entries are now re-minted automatically
  instead of blocking every Trash action.
- Removed a stray light gutter bar along the left edge of the note editor,
  left over from the frontmatter linter's default light-theme styling.

## [0.1.5-alpha] - 2026-07-26

### Added

- Each vault now carries a SQLite database at `.anchored/vault.db`, created
  and migrated when the vault is opened. Nothing reads from it yet; this is
  the foundation for the database-first storage work. Opening a vault also
  creates `.anchored/template/` for note templates, `.anchored/conflicts/`
  for preserved conflicting copies, and a `.anchored/.gitignore` so a vault
  kept in Git does not commit database bytes.
- Opening or rescanning a vault now also indexes it into that database,
  including each note's front matter, body, aliases, wikilinks, and
  lifecycle timestamps. Files remain the source of truth and nothing reads
  back from the index yet, so there is no visible change in behavior. Notes
  are matched by a normalized path so a name spelled differently by Finder
  and by Anchored — different Unicode composition, or a different letter
  case — is recognized as one note rather than two.

- A Recovery panel, reached from the bottom of the file rail, shows notes
  that changed both in Anchored and on disk, and the earlier copies kept of
  whichever note is open. Each version can be expanded to read in full, and
  the list keeps up as you save. Conflicting copies are named by their
  location rather than opened, because they live in the vault's hidden
  folder. Comparing a version against the note, and restoring one, are not
  built yet.

### Changed

- Notes that had no `id` in their front matter can now be given one, written
  into the file itself so the note keeps its identity when it is renamed or
  moved in Finder or another editor. Front matter is edited in place, so
  comments, key order, quote style, and spacing are left exactly as written,
  and a note whose front matter is malformed is never rewritten. This is off
  by default in this release.
- A note sent to the Trash now keeps its history and its identity while it is
  there, so restoring it brings back the same note rather than a fresh copy of
  it, with its earlier versions and backlinks intact.
- Anchored no longer keeps a separate JSON metadata cache beside the vault.
  The vault index replaced it, and holding two stores in step with each other
  was a source of disagreement rather than speed. Existing cache files are
  simply left unused.
- Saving a note now records it and writes the file as a single operation,
  instead of writing the file and then reading it back to catch up. A save
  that cannot be written leaves nothing behind, and a save is no longer
  mistaken for an edit made in another program.
- Anchored now keeps the previous copy of a note whenever its contents are
  replaced, whether the change arrived from another editor, a Git checkout,
  or Anchored itself. Up to twenty versions are kept per note, each recording
  where the change came from. Nothing surfaces this yet.
- Opening a vault now records how each note's file and its stored copy stand
  relative to each other. A note changed in both places has both versions
  preserved under `.anchored/conflicts/` before anything else touches it, and
  the note itself is left exactly as found. Nothing is resolved automatically:
  Anchored never picks a winner. Preserved copies are cleared once a note
  agrees with itself again. No interface surfaces these yet.
- Only one copy of Anchored can now run at a time. A second launch raises the
  existing window instead of opening a rival window that would fight the first
  one over the same vault.
- Opening or rescanning a vault no longer reads every note to collect its
  metadata. Aliases, links, status, type, and lifecycle timestamps are read
  from the index instead, and a note whose size and modification time are
  unchanged is not opened at all. Folders with no notes in them still appear,
  and if the index cannot answer for any note the previous file-reading path
  is used instead.
- Search now runs against the vault index instead of reading every file on
  every query, and results are ranked by relevance rather than returned in
  path order. Matches that ranking cannot express — text in the middle of a
  word, punctuation, or an exact phrase — are still found: a direct scan of
  the indexed text runs whenever ranking turns up nothing. Front matter
  remains searchable and line numbers still count from the top of the file.
  Search is no longer capped at 64 MB of files read per query.
- The vault index is now kept up to date continuously rather than only on a
  full scan. Saving, creating, archiving, restoring, renaming, and moving a
  note all update it directly, and edits made in another program are picked
  up through the existing watcher. A note keeps its identity when it is
  renamed or moved, so anything attached to that identity follows it.
- Note, vault, and trash identities are now UUIDv7 instead of ULID, in
  preparation for the database-backed storage phase. A vault written by an
  earlier build still opens: its identity file is quietly re-minted in the
  new format on first use, and remembered-vault entries that can no longer
  be resolved are dropped from the recent list rather than making the whole
  list unreadable. Notes keep whatever `id` they already have; existing ULID
  values are treated as unrecognised metadata and left untouched.

## [0.1.4-alpha] - 2026-07-25

### Added

- Frontmatter is now validated live as you type, with problems surfaced as
  inline editor diagnostics, a debounced Notification Center entry, and an
  issue-count badge in the editor header. Coverage includes structural
  problems (malformed YAML, duplicate top-level keys, bad delimiters),
  invalid values for known properties (`status`, `type`, `created_at`,
  `updated_at`, `archived_at`, aliases), and list hygiene (duplicate or empty
  entries in any list-shaped property). Warnings never block saving, and the
  feature can be turned off in Settings.
- Notes now keep a stable identity across renames, whether renamed in
  Anchored or in Finder, so version history and notification history entries
  stay attached to the right note instead of orphaning. An id is assigned
  quietly the first time a note without one is saved, created, or
  archived/restored; notes with missing, invalid, or duplicate id metadata
  simply fall back to the previous path-based behavior.

### Changed

- A newly-created folder reported by the native watcher is now scanned
  directly and merged into the file tree, instead of always falling back to
  a full vault rescan. A subtree that is itself too deep or too large still
  falls back to a full rescan.

## [0.1.3-alpha] - 2026-07-25

### Added

- Settings now lets users choose the Markdown source editor line length as
  48, 56, 64, or 72 characters, with a 64-character default.
- Scratchpad now uses the full Markdown editor, including CodeMirror editing,
  wikilink completion and navigation, Markdown behavior, search, autosave,
  and live updates for external file changes.
- Anchored now watches the complete selected vault with a debounced native
  filesystem watcher. External creates, edits, deletes, and renames refresh
  the vault without polling; clean open notes reload automatically, while
  dirty notes remain protected by conflict recovery and explicit merge
  actions.
- External-edit conflicts now retain base, local, and filesystem versions,
  persist bounded local recovery snapshots, offer conservative three-way
  merging for disjoint edits, and keep the filesystem version protected until
  the user applies a result.

- Added a development-only 48-file fixture vault that opens automatically for
  browser and desktop testing, covering representative Markdown, metadata,
  links, collections, and assets without touching real vaults.
- Restored the Settings option to hide file extensions throughout the
  interface, including the file rail, search results, backlinks, status bar,
  editor breadcrumb, and inline rename field. Hidden extensions remain intact
  on disk when renaming notes.
- Note filenames can now be edited directly from the editor breadcrumb.
  Enter or blur submits the requested name, Escape cancels, and the existing
  atomic rename transaction continues to update supported links safely.
- Inline filename editing now treats blank or unchanged input as a cancel and
  reliably restores the original name when Escape is pressed.
- Anchored now watches the selected vault tree while open, so Finder-created,
  renamed, moved, and deleted folders and files refresh the physical Files
  view automatically without requiring focus or another app action.
- Open notes moved in Finder now remain open and keep their selection. Their
  supported wikilinks are updated in both YAML front matter and Markdown
  bodies, and the first folder beneath the vault root can derive `type` when
  the new Settings option is enabled (on by default).
- Reversible Trash now uses the reserved vault-root `trash/` system folder;
  existing `.anchored/trash/` data is migrated when Trash is first accessed.
- Lifecycle moves now route Inbox notes into a lower-case folder derived from
  their `type` front matter, create that folder when needed, and return notes
  to the physical `inbox` folder when moved back to Inbox. Untyped notes use
  `inbox`; Archive ↔ Workbench transitions remain in place and only change
  lifecycle status.
- Added persisted color themes for Anchored, Ayu, Dracula, Catppuccin, Nord,
  and a black-on-white Light palette. Themes apply to the application shell,
  source syntax highlighting, Markdown Preview code, decorations, and Mermaid
  diagrams.
- The file rail now handles large vaults with stable browser-native scrolling,
  keeps selection separate from folder expansion, supports keyboard navigation
  and context menus, shows Lucide file-type icons, and recognizes common
  non-Markdown assets such as PDFs, images, audio, video, archives, and code.
- The sidebar now defaults to derived Inbox, Scratchpad, Workbench, Archive,
  and Assets views with live counts. Workbench starts expanded as a flat list
  sorted by Last Edited, supports grouped/type and bidirectional date/name
  sorting, and persists those choices; Files preserves physical navigation.
- Anchored-created notes now receive second-precision local-offset `created_at`
  metadata. Archiving writes `status: archived` and `archived_at`, opens the
  note in sanitized read-only Preview, and offers explicit restore actions for
  Inbox or Workbench.
- Opening a simple unresolved wikilink with Command-click or Command-Enter
  now offers to create a blank note in the physical `inbox/` folder and opens
  it after creation. Existing links are preserved and are not created merely
  by typing completion text.
- A lightweight floating Scratchpad now creates separate Inbox notes after the
  first nonblank input, autosaves atomically, preserves drafts on conflicts,
  completes wikilinks, and browses active captures in a newest-edited side list
  without loading the main editor. Control-Option-N/P/S handle New, Previous,
  and Notes while Anchored is active; system-wide shortcuts remain deferred.
- Non-empty folder deletion now warns before proceeding and requires typing
  `delete folder`; confirmed folders move as one recoverable Trash entry.
- Added a preview-first Settings migration for timestamp-valued front matter.
  Exact RFC 3339 instants are normalized to local numeric offsets in existing
  notes and during future authored saves; date-only and ambiguous values remain
  unchanged and are reported.

- Anchored now supports the Markdown v1 rendering pipeline, including
  CommonMark, GFM tables, footnotes, task lists, definition lists, math,
  wikilinks, admonitions, heading IDs, subscript, superscript, highlighting,
  emoji, Mermaid diagrams, and an explicit sanitized Preview view. URL
  autolinking, smart typography, code highlighting, emoji, and Mermaid can be
  configured in Settings without changing Markdown source.
- Backslashes at the ends of Markdown lines now render as configurable hard
  line breaks and receive matching source-editor syntax highlighting outside
  code.
- Markdown source editing now decorates supported wikilinks, heading IDs,
  admonitions, math, tasks, highlights, emoji, and fenced code markers while
  keeping the underlying source unchanged. Intentional saves normalize CRLF
  and legacy CR endings to LF and show a visible notice.
- New vaults can now be created from the no-vault screen or vault switcher.
  Anchored asks for a vault name, lets the user choose a parent folder
  natively, creates the new vault safely, remembers it, and opens it
  immediately.
- Vault folders can now be created safely at the root or inside other vault
  folders. Saved notes can also be moved between vault folders from the editor
  or by dragging them onto a folder in the file rail, and existing rename-safe
  link updates still apply to those moves.
- Vault folders can now be renamed or moved from the file rail with their
  visible notes, assets, and subfolders. Anchored updates supported note links
  for moved paths, and empty folders can be deleted directly from the rail.
- A new Settings modal now includes a danger-scoped reload action. Anchored
  saves the current note first, reloads the window safely, and restores the
  remembered vault plus the previously open note on startup when both are
  still available.
- Anchored now detects changes to the active Markdown file while it is open,
  reloads clean external edits, serializes overlapping saves, and preserves
  dirty local edits in a visible same-folder recovery copy when a conflict
  occurs. Recovery copies are labeled and kept out of the active link graph.

### Changed

- Anchored now supports signed in-app updates from GitHub Releases.
- Markdown source editing now auto-closes wikilinks, bold, strikethrough,
  and inline-code marks, keeps the caret inside the pair, and keeps the
  wikilink candidate picker open for keyboard-first filtering and selection.
- Default New note drafts and Scratchpad captures are now physically created
  in the vault's `inbox/` folder. Explicit folder creation and Save As keep
  their user-selected destinations.
- Wikilink completion now remains available while an unclosed link is being
  edited, including during typing pauses, and closes on the expected link and
  editor boundaries.
- Wikilink completion suggestions now remain open when autosave synchronizes
  lifecycle metadata back into the editor.
- Newly created notes now include a blank line after YAML front matter so the
  editor can place the caret at the first writing line.
- Creating a note now keeps it selected through filesystem refreshes and puts
  focus at the first writing line immediately.
- Settings now labels the window reload action as “Restart Anchored,” clarifies
  that it is a recovery action, and keeps long Settings content inside a
  scrollable viewport instead of allowing the modal to extend below the
  window.
- The physical Files tree now uses browser-native scrolling with contained
  lightweight rows, removing the blank regions and stalls caused by its
  previous JavaScript scroll window. Folder actions now live only in an opaque,
  viewport-clamped right-click menu.
- Every dot-prefixed file or folder component is pruned from indexing, search,
  links, counts, and navigation. Folder move/delete refuses visible parents
  containing hidden descendants so application-specific data is not moved.
- Physical file and folder menus now expose creation, preview, move, scoped
  filter/search, rename, lifecycle, and deletion actions as applicable, with a
  shared Lucide expand/collapse-all control in Collections and Files.
- Successful authored saves now maintain source-preserving local-offset
  `updated_at` metadata, while lifecycle/type changes and filesystem moves do not. Cached
  filesystem modification times drive Last Edited, and timestamps display in
  the Mac's local timezone.
- New lifecycle timestamps are now written in the Mac's local timezone with a
  numeric RFC 3339 offset instead of `Z` UTC notation. Existing UTC timestamps
  remain readable and can be converted through the explicit timestamp migration
  in Settings.
- Vault refresh now reuses a versioned native metadata index keyed by relative
  path, size, and modification time. Unchanged notes are not reread, malformed
  caches rebuild automatically, and focus refresh runs off the UI thread.
- Link resolution, backlinks, Quick Open, and wikilink candidates now share
  path, filename, alias, and reverse-link maps instead of repeatedly scanning
  every note for every link.
- Note IDs are deferred. Existing `id` frontmatter remains untouched as
  ordinary user metadata, while creation, editing, moving, renaming, recent
  activity, warnings, and link maintenance now use safe vault-relative paths.
- The source editor now defaults to a compact 14px type size, with persisted
  12px, 14px, and 16px choices in Settings. Markdown and YAML front matter
  now use separate CodeMirror language parsing and dark-theme syntax styles.
- Source syntax highlighting now covers the full supported inline surface,
  including GFM emphasis and strikethrough, links, URLs, inline code,
  subscript, superscript, emoji, footnotes, and Anchored inline constructs.
- Block Markdown now has explicit coverage for headings, quotes, lists,
  separators, fenced code, and front-matter delimiters. YAML keys, values,
  list markers, and comments receive dedicated source-editor styling.
- The Files and Collections trees now keep each row's click, context-menu,
  and drag handlers stable across renders, so selecting a note or an
  unrelated app state change no longer reconstructs every visible row.
- KaTeX and highlight.js now load on demand when Preview first opens,
  matching Mermaid's existing lazy loading, instead of shipping inside the
  eagerly-loaded Preview bundle. The Preview chunk shrinks from about 624 kB
  to about 200 kB before those two libraries are fetched separately.
- A single external file change (a normal edit, create, or delete outside
  Anchored, including Anchored's own writes echoing back through the native
  watcher) now refreshes only that path instead of rescanning the whole
  vault. A watcher batch that includes a new folder still falls back to a
  full rescan.

### Fixed

- Restored native macOS builds after the inline-note merge introduced a
  duplicate filename validator in the Rust vault boundary.
- Scratchpad shortcut handling and visible key hints now consistently use
  Control-Option-N/P/S instead of showing Command-Option symbols.
- Native saves now independently refuse archived notes, and lifecycle changes
  use expected-content checks plus atomic writes so external edits are never
  overwritten.
- Removed recurring identity warnings, migrations, generated note IDs, and
  identity-conflict save failures from normal vault use.
- Markdown editing now preserves local typing, undo history, selections, and
  cursor position across parent updates and external content changes. Link
  completion collapses its selection correctly, composition input is protected
  during reconciliation, find returns focus to the editor, and the status bar
  reports the live line and column.
- Fixed the in-app updater: the endpoint pointed at the wrong GitHub
  repository, and the release workflow never built the target needed to
  produce signed update artifacts, so no release through `0.1.2-alpha` could
  ever be found or applied by an installed copy.

## [0.1.0-alpha] - 2026-07-17

### Added

- A keyboard-first macOS editor shell with note navigation, local search,
  unsaved-state feedback, and responsive layouts.
- Native vault folder selection and read-only Markdown discovery with path,
  traversal, and symlink safeguards.
- Safe, read-only Markdown file opening and closing with exact-text display,
  UTF-8 validation, and a 10 MiB per-file limit.
- A minimal Markdown editing surface with new-note creation, Save As, Command-S,
  one-second idle autosave, atomic writes, and visible conflict feedback that
  keeps local edits intact.
- Newly created notes receive a full unprefixed ULID in preserved YAML front
  matter, and saves refuse to remove or change an established identity.
- Existing vaults receive a read-only identity baseline; Markdown files found
  on later scans receive IDs safely, while likely renames and unsafe front
  matter remain untouched and are reported.
- Existing ID-less notes can be reviewed before an explicit migration. Notes
  changed after preview and notes with unsafe front matter are preserved and
  reported instead of being rewritten.
- The vault index now reads Obsidian aliases and unique permanent note IDs.
  Identified notes keep their local editor state when their file path changes.
- Command-clicking a wikilink in the Markdown editor opens a unique note by
  exact path, filename, or alias. Missing and ambiguous links are reported
  instead of opening an arbitrary match.
- Each note now lists its resolved backlinks. Valid quoted internal links in
  YAML text and list properties participate like body links; escaped body
  text, inline code, fenced code, and indented code remain excluded.
- Typing `[[` now opens a keyboard- and pointer-accessible link picker. It
  suggests recent notes, shortest unique filename targets, aliases, and known
  uncreated placeholders without creating files automatically.
- Identified notes can be renamed or moved from the editor. Anchored updates
  uniquely resolved filename, path, alias, heading, display-label, and quoted
  property links as one recoverable transaction; ambiguous links remain
  unchanged, and unfinished edits block the operation.
- Vault status and save notices form a persistent top-center stack clear of
  note-header controls. Each message can be dismissed independently, and
  repeated identical messages are deduplicated.
- A top-bar notification center keeps timestamped records of meaningful vault,
  identity, link, rename, save, conflict, and error outcomes locally for 28
  days. Active conflicts remain until resolved; other records can be deleted
  individually or cleared together.
- Notification history and its badge are now isolated by stable vault identity,
  including after a moved vault is selected again. Older unscoped records are
  retained separately as General history.
- Opened vaults are remembered locally for quick switching and can be forgotten
  without changing their files. Unavailable vaults remain visible instead of
  being silently removed.
- Saved notes can be moved into a vault-local hidden Trash and restored to their
  original path without changing their bytes or rewriting links. Restore stops
  safely when another file already occupies the destination.
- Quick Open (`Command-P`) ranks recent notes and alias matches without stale
  file entries. Full-vault search (`Command-Shift-F`) finds Unicode Markdown
  content with line snippets through a bounded background scan, while
  note-local Find (`Command-F`) searches the active editor.
- A minimal white `A` on black now identifies Anchored in Finder, the Dock,
  dialogs, the application bundle, and the private-alpha disk image.
- A repeatable private-alpha packaging command now produces an ad-hoc-signed
  Intel DMG and SHA-256 checksum, verifies both signatures and disk-image
  integrity, and confirms the macOS 12 deployment target before handoff.

### Changed

- The desktop bundle now uses a restrictive production content security
  policy, a hardened runtime without exception entitlements, and only the
  explicit event and window permissions required by the interface.
- New-note controls remain unavailable until a vault is selected, preventing
  drafts that have no valid save boundary.
- Anchored's source is now available under the MIT License, with a fully
  fictional checked-in test vault replacing the previous private smoke data.

### Fixed

- New notes, including blank notes, now save automatically within two seconds
  using collision-safe numbered Untitled filenames. The native macOS close
  control is no longer intercepted or blocked by an unsaved-note prompt.
- Routine vault file-count notices no longer interrupt writing; the current
  Markdown-file count appears in the status bar instead.
- Minor in-app notices now dismiss themselves after 12 seconds, while errors,
  conflicts, and action-required notices remain visible.
- Startup now shows an explicit no-vault state instead of presenting static
  demonstration notes as though they were editable vault files.
- Development launches now replace only this project's stale interface server
  on port 1420 and identify unrelated port owners with an actionable error.
- Filename renaming no longer opens a blocking native save dialog; the editor
  keeps the rename interaction in the breadcrumb.
- The editor shell no longer becomes a blank window when WebKit denies access
  to optional local note-activity storage.
- Wikilink parsing no longer uses regular-expression lookbehind unsupported by
  the macOS 12 WebView. Startup failures now remain visible with a reload action
  instead of leaving an empty native window.
- Closing a window or quitting with unfinished drafts, unsaved edits, save
  failures, or conflicts now requires an explicit save, discard, or cancel
  choice instead of silently losing local text.
- Modal panels now contain keyboard focus, close with Escape, declare their
  dialog semantics, and restore focus to the control that opened them.

[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
[Semantic Versioning]: https://semver.org/spec/v2.0.0.html
