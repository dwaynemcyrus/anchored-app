# Anchored feature reference

This document records what Anchored `0.1.0-alpha` currently implements. It is a
pre-release reference for testers, not a promise of full Obsidian parity.
The inventory was checked against the application source, automated tests, and
rendered interface on 2026-07-19.

> **Testing status:** The ad-hoc-signed Intel build is ready for Dwayne's
> private in-house alpha on a disposable or verified backup vault. It is not
> ready for a primary vault or broad public distribution. See the
> [testing checklist](PUBLIC_TEST_CHECKLIST.md) and
> [stability log](ALPHA_STABILITY_LOG.md).

## Product and platform

- Native macOS application wrapped with Tauri 2.
- Supports macOS 12 Monterey and later.
- Current private-alpha DMG targets Intel (`x86_64`) Macs and is ad-hoc signed.
- Local-first and usable offline.
- No account, cloud service, analytics, advertising, or telemetry.
- True-black, white-text, keyboard-first interface.
- Opens a folder as a vault. It does not open an individual Markdown file as
  the starting point.
- Markdown remains the source of truth and stays editable in other tools.

## Vaults and file navigation

- Select a local folder containing Markdown files.
- Default to virtual Inbox, Scratchpad, Workbench, Archive, and Assets views
  with live counts. Each Markdown note appears in one lifecycle collection;
  Scratchpad is an Inbox-only saved view.
- Start Workbench expanded as a Last Edited/newest flat list. It can group by
  front-matter `type`, with Untyped first, or sort in both directions by name,
  filesystem modification time, and `created_at`.
- Group non-Markdown Assets by recognized file type or show one alphabetical
  list.
- Retain the physical folder tree as a secondary persisted Files view with
  stable native scrolling, keyboard navigation, and opaque context menus.
- Filter navigation by filename or front-matter alias.
- Detect Markdown files added in Finder when Anchored regains focus.
- Remember up to 50 opened vaults for quick switching.
- Mark remembered vaults whose folders are unavailable.
- Forget a vault from the switcher without changing that vault's files.
- Keep notification history separate for each vault, even after the vault
  folder is moved and opened again.
- Reserve the vault-local `.anchored` folder for Anchored metadata and Trash;
  it is excluded from ordinary files, search, links, and backlinks.
- Exclude every dot-prefixed path component and refuse folder moves/deletes
  that would carry hidden application data as an invisible side effect.

## Markdown editing and saving

- Open and edit exact UTF-8 Markdown source in CodeMirror 6.
- Open an empty Markdown file, including one at the vault root.
- Create an in-memory untitled draft and save it as a new `.md` file inside the
  selected vault.
- Save manually with Command-S.
- Save a copy or choose a new location with Command-Shift-S or **Save as**.
- Autosave an already saved note after one second without edits.
- Show Saved, Unsaved, Saving, Conflict, and Save failed states.
- Write through a sibling temporary file, flush it, and atomically replace the
  destination.
- Refuse to overwrite a file that changed outside Anchored; local edits remain
  visible as a conflict.
- Refuse to create or rename over an existing Markdown file.
- Add second-precision UTC `created_at` metadata to notes created by Anchored
  without backfilling externally imported notes.
- Add second-precision UTC `updated_at` only after successful authored saves;
  display stored timestamps in local time and use cached filesystem metadata
  for Last Edited without writing `modified_at`.
- Archive through a dedicated atomic transition that writes `status: archived`
  and `archived_at`; archived notes open in read-only Preview until restored.
- Close a note without closing its vault. A note with unfinished edits is
  kept open and reported instead of being silently discarded.
- Protect unfinished drafts, unsaved edits, conflicts, and failed saves when a
  native window is closed or the app is quit. The user must save, discard, or
  cancel explicitly.
- Keep new-note actions unavailable until a vault is selected.
- Normalize CRLF and legacy CR source to Unix LF on an intentional save and
  show a visible notice when that conversion occurs.

### Markdown rendering and Preview

- Open an explicit, on-demand Preview without changing the editable source.
- Render CommonMark and GFM tables, alignment, backtick code fences, syntax
  highlighting, footnotes, strikethrough, task lists, and automatic URL links.
- Render heading IDs, definition lists, subscript, superscript, highlights,
  emoji shortcodes, LaTeX math, Mermaid diagrams, and the twelve standard
  admonition types with custom titles.
- Resolve rendered wikilinks through cached filename, path, and alias maps.
  Ambiguous or missing targets remain unopened and are reported through the
  normal vault notices.
- Keep Preview render-only: it never serializes an AST back to disk, executes
  code, loads remote diagram resources, or enables raw executable HTML.
- Configure automatic URL linking, smart typography, syntax highlighting,
  emoji, and Mermaid from Settings. All options default to enabled and are
  stored outside user Markdown.
- Return to source editing with the Preview button or `Command-Shift-P`.

## Lifecycle collections and note IDs

- Inbox contains notes with missing, blank, unusable, or `inbox` status.
- Workbench contains other non-archived statuses and supports flat or `type`
  grouped navigation. Moving there requires an existing, new, or Untyped type
  choice; Untyped removes the property.
- Archive contains `status: archived` notes and exposes explicit Restore to
  Inbox and Restore to Workbench actions.
- Existing front-matter `id` values are preserved as ordinary user metadata.
  Anchored does not generate, migrate, validate, warn about, or depend on note
  IDs in normal vault use.

## Scratchpad

- Open a reusable lightweight floating capture window from the Lucide toolbar
  action or `Control-Option-N`.
- Create the Markdown file only after the first non-whitespace input; a blank
  capture leaves no file behind.
- Give each capture `type: scratchpad`, `status: inbox`, and `created_at`.
- Autosave through serialized atomic writes, flush before hiding, and keep the
  visible draft when an external edit conflict prevents saving.
- Open the newest active Inbox capture with `Control-Option-P`, or toggle a
  newest-edited right-side list with `Control-Option-S`.
- Complete bounded wikilink suggestions from the cached vault index.
- Keep system-wide shortcuts deferred; the current shortcuts work while
  Anchored is active.

## Wikilinks, aliases, and backlinks

Supported note targets include:

- `[[Note]]`
- `[[Folder/Note]]`
- `[[Note.md]]`
- `[[Note#Heading]]`
- `[[Note|Visible label]]`
- `![[Note]]`
- A unique alias from a supported top-level `aliases` or `alias` property.
- A same-note heading such as `[[#Heading]]`.

Behavior:

- Resolve links case-insensitively by exact vault path, then filename, then
  alias.
- Open only a unique match. Missing or ambiguous links remain unopened and are
  reported instead of choosing an arbitrary note.
- Open the link under the pointer with Command-click.
- Open the link at the cursor with Command-Enter.
- Show resolved backlinks below the active note.
- Read supported links from ordinary Markdown and from quoted top-level YAML
  text or list values.
- Ignore escaped link text and link-like text in inline code, fenced code, and
  indented code.
- Preserve headings and display labels when a target is rewritten.

### Wikilink completion

- Typing `[[` opens a completion list in supported Markdown or quoted YAML
  text.
- With no query, the list shows recently active notes.
- As text is typed, it ranks filename, path, and alias matches.
- Insert the shortest unambiguous target: a filename when unique, otherwise a
  vault-relative path.
- Insert an alias as `[[target|alias]]`.
- Show known unresolved targets as **Uncreated** placeholders.
- Offer newly typed unresolved text as a link without automatically creating a
  note.
- Display at most 24 completion options.

## Rename and move

- Rename or move a saved note through the **Rename** action and a
  native save dialog.
- Update uniquely resolved references when the filename or folder changes.
- Update supported references in Markdown bodies and supported quoted YAML
  values.
- Preserve headings, `.md` extension style, display labels, whitespace,
  Unicode, and line endings.
- Preserve the visible alias by adding a display label when an alias-only link
  must be rewritten.
- Leave ambiguous and unresolved references unchanged.
- Do not rewrite links when only a YAML `title` property changes.
- Block rename while any participating note has unfinished edits or cannot be
  read safely.
- Apply the rename and all reference updates as one journaled transaction.
- Roll back handled failures and recover an interrupted transaction the next
  time the vault opens.

## Search and retrieval

- **Quick Open** with Command-P:
  - ranks recently active notes by default;
  - searches filenames, paths, and aliases;
  - excludes stale or unresolved candidates;
  - opens the selected note with Return.
- **Search vault** with Command-Shift-F:
  - searches UTF-8 Markdown content;
  - supports Unicode text;
  - shows file paths, line numbers, and snippets;
  - opens the selected result;
  - debounces typing and ignores stale responses.
- **Find in note** with Command-F uses CodeMirror's local find interface.

## Notifications

- Show persistent, individually dismissible status messages in a centered
  stack that does not cover note actions.
- Deduplicate repeated identical messages.
- Keep a timestamped notification history behind the top-bar bell.
- Record meaningful vault, link, rename, Trash, conflict, and error
  events without recording every successful autosave.
- Retain ordinary records for 28 days and at most 250 records per vault.
- Keep unresolved conflicts beyond 28 days until they are resolved.
- Delete ordinary records individually, mark conflicts resolved, or clear all
  resolved records for the current vault.
- Keep older unscoped records in a separate General scope.

## Reversible Trash

- Move a saved note to a hidden vault-specific `.anchored/trash` folder.
- Remove trashed notes from navigation, search, links, aliases, and backlinks.
- Preserve the note's exact bytes and do not rewrite links when trashing it.
- Restore a note to its original folder and filename, recreating missing normal
  folders when safe.
- Stop without overwriting when another file occupies the restore destination.
- Recover interrupted Trash and restore operations from the vault-local index.
- Provide no permanent-delete action in the current version.

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| New note | Command-N |
| New Scratchpad capture | Control-Option-N |
| Previous Scratchpad capture | Control-Option-P |
| Toggle Scratchpad notes | Control-Option-S |
| Quick Open | Command-P |
| Search all note content | Command-Shift-F |
| Find in the active note | Command-F |
| Save | Command-S |
| Save As | Command-Shift-S |
| Open wikilink at cursor | Command-Enter |
| Open wikilink under pointer | Command-click |
| Close an open panel or palette | Escape |

## Safety boundaries and limits

- Vault scan limit: 50,000 filesystem entries and 64 folder levels.
- Markdown open/edit limit: 10 MiB per file.
- Search query limit: 200 characters.
- Content search limit: 100 results and 64 MiB scanned per request. Files that
  cannot be safely searched are counted as skipped.
- Only valid UTF-8 Markdown is opened or searched.
- Symlinks are skipped during scans and refused for file mutations.
- Relative-path traversal and writes outside the selected vault are refused.
- The frontend receives relative paths, not unrestricted filesystem access.
- Rename, Trash, restore, vault-registry, and cache metadata use bounded,
  validated, crash-aware formats.

## Preserved but not interpreted

Anchored edits Markdown as source, so unsupported text normally remains intact.
The following are not active features:

- Obsidian plugins, Canvas, Dataview, graph view, or plugin APIs.
- Rendered embeds or attachment preview/opening. Markdown attachment syntax is
  preserved as text; attachment files are indexed as read-only Assets.
- Standard Markdown-link navigation such as `[label](file.md)`.
- Heading/block autocomplete or heading/block existence validation.
- Automatic creation of a note from an unresolved wikilink.
- Rich-text or live-preview editing while typing. Preview is explicit and
  source-first.
- Permanent deletion from Trash.
- Accounts, sync, collaboration, mobile apps, publishing, AI, PDFs, or EPUBs.

## Distribution status

The app-level blockers found during the pre-package review are resolved:
native quit protection, vault-gated note creation, restrictive production CSP,
modal focus containment, and Anchored bundle artwork are implemented and
verified. The current private package is ad-hoc signed with a hardened runtime
and no exception entitlements.

Broad public website distribution remains deferred. A future public macOS
package needs a paid Apple Developer Program membership, Developer ID
Application signing, Apple notarization, ticket stapling, and Gatekeeper
verification. Apple Silicon/universal and Linux packages also require separate
build and verification work. These are external or future-scope prerequisites,
not blockers for Dwayne's private Intel alpha.

## Remaining private-alpha observations

- The main React application module is large and should be separated by feature
  before further expansion.
- The editor production chunk is about 554 kB minified and triggers the build
  size warning. The editor is already loaded lazily, but startup and first-note
  latency still need measurement on the 2015 MacBook Pro baseline.
- Attachment syntax preservation is covered by the source-editing design, but
  a dedicated attachment fixture and byte-for-byte regression test are still
  needed before claiming the full attachment acceptance criterion.
- The required seven consecutive days of representative stability testing are
  pending in [`ALPHA_STABILITY_LOG.md`](ALPHA_STABILITY_LOG.md).
