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

[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
[Semantic Versioning]: https://semver.org/spec/v2.0.0.html
