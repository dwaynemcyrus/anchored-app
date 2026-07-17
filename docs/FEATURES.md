# Anchored feature reference

This document records what Anchored `0.1.0` currently implements. It is a
pre-release reference for testers, not a promise of full Obsidian parity.
The inventory was checked against the application source, automated tests, and
rendered interface on 2026-07-17.

> **Testing status:** Anchored is not ready for a primary vault or broad public
> distribution yet. Use a disposable vault or a verified backup copy. See
> [Public testing checklist](PUBLIC_TEST_CHECKLIST.md) and
> [Release blockers](#release-blockers).

## Product and platform

- Native macOS application wrapped with Tauri 2.
- Supports macOS 12 Monterey and later.
- Local-first and usable offline.
- No account, cloud service, analytics, advertising, or telemetry.
- True-black, white-text, keyboard-first interface.
- Opens a folder as a vault. It does not open an individual Markdown file as
  the starting point.
- Markdown remains the source of truth and stays editable in other tools.

## Vaults and file navigation

- Select a local folder containing Markdown files.
- Discover nested `.md` files and show them in a folder-based file explorer.
- Expand and collapse folders.
- Filter the explorer by filename or front-matter alias.
- Detect Markdown files added in Finder when Anchored regains focus.
- Remember up to 50 opened vaults for quick switching.
- Mark remembered vaults whose folders are unavailable.
- Forget a vault from the switcher without changing that vault's files.
- Keep notification history separate for each vault, even after the vault
  folder is moved and opened again.
- Reserve the vault-local `.anchored` folder for Anchored metadata and Trash;
  it is excluded from ordinary files, search, links, and backlinks.

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
- Preserve the established permanent note ID during later saves.
- Close a note without closing its vault. A note with unfinished edits is
  kept open and reported instead of being silently discarded.

Anchored currently edits Markdown source only. It does not provide rendered
Markdown preview or rich-text editing.

## Permanent note identities

- Use a canonical, unprefixed 26-character ULID in top-level YAML front matter:

  ```yaml
  ---
  id: 01JZQ7K8P4A6F2M9V3C5T7X1BY
  ---
  ```

- Give every note created through Anchored a fresh ID on first save.
- Establish a read-only baseline the first time an existing vault is opened.
- On later scans, add an ID to a genuinely new Finder-added note when its front
  matter can be changed safely.
- Treat likely Finder renames as existing notes instead of automatically
  assigning a new identity.
- Offer a preview before adding IDs to existing ID-less notes.
- Skip malformed, duplicate, invalid, changed, or otherwise unsafe notes
  instead of reformatting their front matter.
- Preserve comments, Unicode, UTF-8 BOMs, and LF or CRLF line endings when an ID
  is inserted.

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

- Rename or move an identified, saved note through the **Rename** action and a
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
- Record meaningful vault, identity, link, rename, Trash, conflict, and error
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
- Rename, Trash, restore, registry, and identity metadata use bounded,
  validated, crash-aware formats.

## Preserved but not interpreted

Anchored edits Markdown as source, so unsupported text normally remains intact.
The following are not active features:

- Obsidian plugins, Canvas, Dataview, graph view, or plugin APIs.
- Rendered embeds or attachment preview/opening. Markdown attachment syntax is
  preserved as text, but attachments are not indexed or navigated by Anchored.
- Standard Markdown-link navigation such as `[label](file.md)`.
- Heading/block autocomplete or heading/block existence validation.
- Automatic creation of a note from an unresolved wikilink.
- Rich-text or live-preview editing.
- Permanent deletion from Trash.
- Accounts, sync, collaboration, mobile apps, publishing, AI, PDFs, or EPUBs.

## Release blockers

These findings must be resolved before Anchored is presented as ready for
public vault testing:

1. **Unsaved first-save drafts can be lost on app quit.** A new note exists only
   in memory until Save As succeeds. The native window currently has no
   close/quit guard for that state.
2. **New note is available before a vault is open.** This allows a draft that
   has nowhere valid to save and compounds the quit-loss risk.
3. **The production content security policy is unset.** A restrictive Tauri
   policy should be established and verified before distributing a build that
   reads personal vaults.
4. **Several side panels are incomplete modal dialogs.** They restore focus and
   close with Escape, but do not consistently declare modality or constrain
   keyboard focus to the open panel.
5. **The app still uses the default Tauri icon.** Public test packages need an
   Anchored application icon so testers can identify the app and its dialogs.
6. **[NEEDS DECISION] Signing and notarization are undecided.** Public testers
   need either a signed/notarized package or explicit, accurate instructions
   for an unsigned test build.

## Review observations that do not currently block a private smoke test

- The main React application module is large and should be separated by feature
  before further expansion.
- The editor production chunk is about 554 kB minified and triggers the build
  size warning. The editor is already loaded lazily, but startup and first-note
  latency still need measurement on the 2015 MacBook Pro baseline.
- Attachment syntax preservation is covered by the source-editing design, but
  a dedicated attachment fixture and byte-for-byte regression test are still
  needed before claiming the full attachment acceptance criterion.
- The required seven consecutive days of representative stability testing have
  not begun.
