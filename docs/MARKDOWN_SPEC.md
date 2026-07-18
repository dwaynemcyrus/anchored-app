# Anchored Markdown Specification v1

This is the implementation contract for Markdown throughout Anchored. Markdown
source remains the primary, portable representation of human-authored content.
The editor never requires Anchored-specific rendering to keep a document
readable in another text editor.

## Standards and source rules

- CommonMark is the base standard.
- GFM support includes tables and alignment, backtick-fenced code blocks,
  language-aware syntax highlighting, footnotes, strikethrough, task lists,
  and automatic URL linking.
- Automatic bare-URL linking is on by default and can be disabled in Settings.
  Explicit Markdown links remain links when the setting is disabled.
- Files use UTF-8, LF line endings, and the `.md` extension. Existing CRLF
  files remain readable and are normalized only during an intentional save.
- Front matter is optional YAML between opening and closing `---` lines. Its
  key order, comments, spacing, and unknown values are preserved whenever
  Anchored mutates an existing document.
- The source editor is CodeMirror 6. Preview is explicit and on demand; live
  rendering while typing is not part of Version 1.

## Extended syntax

Anchored also supports:

- Explicit heading IDs such as `## Leadership {#leadership}` and generated
  stable heading anchors for headings without an explicit ID.
- Definition lists using `Term` followed by `: Definition` lines.
- `H~2~O` subscript and `x^2^` superscript.
- `==highlighted text==` highlighting.
- Wikilinks: `[[Leadership]]`, `[[Quran:40:25]]`,
  `[[Habit:Reading]]`, and `[[Project:Anchored]]`, with optional display
  labels such as `[[Leadership|the note]]`.
- Standard admonitions: Note, Abstract, Info, Tip, Success, Question,
  Warning, Failure, Danger, Bug, Example, and Quote. A custom title may
  follow the type, for example `> [!TIP] Writing Advice`. Custom admonition
  types are not part of Version 1.
- LaTeX inline math with `$...$` and display math with `$$...$$`.
- Smart quotes, en dashes, em dashes, and ellipses. Smart typography is on
  by default and can be disabled in Settings. It changes rendering only.
- Emoji shortcodes such as `:warning:` and Mermaid diagrams in `mermaid`
  fenced blocks. These are rendered locally without changing source syntax.

Only backtick fences are code fences. Tilde fences are rendered as ordinary
Markdown text. Tasks remain Markdown syntax; task management is outside this
specification.

## Identity and portability

Every linkable object has a permanent internal ID in YAML front matter. Visible
names and filenames resolve to that ID. Filename or folder renames update
supported references transactionally; changing only a YAML `title` does not.
Unknown Markdown, front matter, Obsidian syntax, and linked attachments are
preserved without interpretation or silent removal.

## Rendering safety

Rendered HTML is sanitized before insertion into the application. Scripts,
event handlers, executable URLs, frames, and unsafe raw HTML are rejected.
Code is highlighted but never executed. Mermaid runs locally with strict
security settings, no click callbacks, and an accessible source fallback when
diagram parsing fails. KaTeX renders invalid expressions as readable source.

## Implementation ownership

- `markdown-it` and its focused extension plugins provide the browser-safe
  CommonMark/GFM pipeline.
- Rust remains responsible for safe file boundaries, YAML validation, stable
  IDs, and atomic rename/link transactions.
- CodeMirror remains responsible for keyboard-first source editing.
- The rendered HTML adapter is an internal boundary; third-party token types
  must not leak into the rest of the application.
