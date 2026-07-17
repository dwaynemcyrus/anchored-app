# Changelog

This file records notable changes to Anchored rather than duplicating every
Git commit. The format follows [Keep a Changelog], and releases follow
[Semantic Versioning].

## [Unreleased]

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
