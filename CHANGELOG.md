# Changelog

This file records notable changes to Anchored rather than duplicating every
Git commit. The format follows [Keep a Changelog], and releases follow
[Semantic Versioning].

## [Unreleased]

### Added

- Anchored now watches the selected vault tree while open, so Finder-created,
  renamed, moved, and deleted folders and files refresh the physical Files
  view automatically without requiring focus or another app action.
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
- Anchored-created notes now receive second-precision UTC `created_at`
  metadata. Archiving writes `status: archived` and `archived_at`, opens the
  note in sanitized read-only Preview, and offers explicit restore actions for
  Inbox or Workbench.
- A lightweight floating Scratchpad now creates separate Inbox notes after the
  first nonblank input, autosaves atomically, preserves drafts on conflicts,
  completes wikilinks, and browses active captures in a newest-edited side list
  without loading the main editor. Control-Option-N/P/S handle New, Previous,
  and Notes while Anchored is active; system-wide shortcuts remain deferred.
- Non-empty folder deletion now warns before proceeding and requires typing
  `delete folder`; confirmed folders move as one recoverable Trash entry.

- Anchored now supports the Markdown v1 rendering pipeline, including
  CommonMark, GFM tables, footnotes, task lists, definition lists, math,
  wikilinks, admonitions, heading IDs, subscript, superscript, highlighting,
  emoji, Mermaid diagrams, and an explicit sanitized Preview view. URL
  autolinking, smart typography, code highlighting, emoji, and Mermaid can be
  configured in Settings without changing Markdown source.
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

- Wikilink completion now remains available while an unclosed link is being
  edited, including during typing pauses, and closes on the expected link and
  editor boundaries.
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
  remain readable.
- When a vault is selected or reopened, existing canonical UTC lifecycle
  timestamps across its Markdown documents are backfilled to local offsets
  without changing the represented date and time.
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

### Fixed

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
- Opening the native Rename dialog no longer blocks Anchored's main interface
  thread.
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
