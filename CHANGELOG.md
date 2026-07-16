# Changelog

This file records notable changes to Anchored rather than duplicating every
Git commit. The format follows [Keep a Changelog], and releases follow
[Semantic Versioning].

## [Unreleased]

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
- Identified notes can be renamed or moved from the editor. Anchored updates
  uniquely resolved filename, path, alias, heading, display-label, and quoted
  property links as one recoverable transaction; ambiguous links remain
  unchanged, and unfinished edits block the operation.
- Vault status and save notices form a persistent top-center stack clear of
  note-header controls. Each message can be dismissed independently, and
  repeated identical messages are deduplicated.

### Fixed

- Opening the native Rename dialog no longer blocks Anchored's main interface
  thread.

[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
[Semantic Versioning]: https://semver.org/spec/v2.0.0.html
