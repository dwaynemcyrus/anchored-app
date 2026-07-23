# Anchored Complete Testing Checklist

Use this as the single testing checklist for each development build, private
alpha, and future release candidate. Run destructive tests only against a
disposable vault or a verified backup. Record every failure with the build,
environment, exact steps, expected and actual results, and whether any file
bytes changed.

> **Current scope:** Anchored is a private, ad-hoc-signed Intel alpha for macOS
> 12 and later. Public distribution remains deferred until Developer ID signing
> and notarization are available. Do not use a primary vault until the full
> checklist and seven-day stability observation pass.

## Test record

- [ ] Anchored version/commit:
- [ ] Installation: development app / packaged `.app` / private DMG / future
      Developer ID package
- [ ] macOS version:
- [ ] Mac model, processor, and memory:
- [ ] Display resolution and scale:
- [ ] Test vault and approximate Markdown/asset counts:
- [ ] Backup location and verification time:
- [ ] Test start date:
- [ ] Tester:
- [ ] Diagnostic log location:

## Test setup

- [ ] Use a disposable vault or a copy that can be restored independently of
      Anchored.
- [ ] Confirm the backup opens correctly in another Markdown editor.
- [ ] Record hashes or byte-for-byte copies of representative notes containing
      front matter, Unicode, CRLF, attachments, and unsupported Obsidian syntax.
- [ ] Confirm no other Anchored development process is running.
- [ ] Test on the minimum supported macOS version.
- [ ] Test on the primary development macOS version.
- [ ] Test on the slowest supported/available Mac.
- [ ] Test at the default display scale.
- [ ] Test at a non-default display scale or smaller laptop viewport.
- [ ] Test with a representative vault backup.
- [ ] Test with a large vault: approximately 700 Markdown files and 56 root folders.
- [ ] Confirm the test vault has nested folders, aliases, wikilinks, front matter, tags, attachments, PDFs, images, audio, video, archives, code, and unknown file types.
- [ ] Keep a clean copy of the vault so destructive-flow tests can be repeated.
- [ ] Open Console/diagnostic logs before testing and record unexpected errors.
- [ ] Keep Finder and another Markdown editor available for external-change
      tests.

## Installation, launch, and recovery shell

- [ ] Run `npm run release:alpha:macos`; confirm signing, integrity,
      architecture, deployment-target, and checksum checks pass.
- [ ] Open the DMG, drag Anchored into Applications, eject it, and launch from
      Applications without a terminal.
- [ ] If macOS blocks a trusted transferred private build, record the message
      and verify explicit approval through Privacy & Security works.
- [ ] Confirm the application name and icon are correct.
- [ ] Launch with no vault selected; confirm **No vault open** and **Open vault**
      appear without an error or blank window.
- [ ] Resize to 900×600; confirm primary controls remain reachable without
      horizontal app-shell scrolling.
- [ ] Test at 200% zoom or equivalent display/text scaling.
- [ ] Quit and relaunch with no active note; confirm startup remains stable.

## Vault selection, switching, and persistence

- [ ] Choose **Open vault** and select a folder rather than an individual file.
- [ ] Open a second disposable vault and switch between remembered vaults.
- [ ] Confirm the active vault is labelled and cannot be duplicated in the
      remembered-vault list.
- [ ] Move a remembered vault in Finder; confirm it becomes unavailable rather
      than silently disappearing.
- [ ] Reopen the moved vault at its new location; confirm vault-specific history
      follows its stable vault identity.
- [ ] Forget a remembered vault; confirm its files and `.anchored` data remain
      unchanged.
- [ ] Relaunch; confirm the remembered vault and last valid note restore.
- [ ] Open an empty note, a root note, and a nested note; confirm exact source
      content and an editable empty editor.
- [ ] Switch repeatedly among three notes; confirm no stale document content.
- [ ] Try a non-UTF-8 and a larger-than-10-MiB disposable Markdown file; confirm
      recoverable refusal without alteration.

## Typography and text rendering

### Global typography

- [ ] Confirm the app uses one intentional type hierarchy for title bar, sidebar, editor, status bar, dialogs, menus, and notices.
- [ ] Confirm body text is readable at normal brightness and contrast.
- [ ] Confirm muted text is still legible and does not become too faint.
- [ ] Confirm text does not appear blurry, doubled, clipped, or incorrectly antialiased.
- [ ] Confirm font rendering is consistent between the title bar, file tree, dialogs, and editor.
- [ ] Confirm uppercase labels, button labels, and status text have consistent tracking and weight.
- [ ] Confirm headings have visibly distinct size, weight, and spacing.
- [ ] Confirm long headings wrap or truncate intentionally rather than overlapping controls.
- [ ] Confirm there are no accidental fallback fonts or missing glyph boxes.
- [ ] Test accented Latin characters: `é`, `ö`, `ñ`, `ø`, `ß`.
- [ ] Test non-Latin text relevant to the vault: Arabic, Cyrillic, Greek, CJK, and emoji.
- [ ] Confirm mixed-script text does not change line height unexpectedly.
- [ ] Confirm emoji render consistently in the editor, tree, search results, and Preview.
- [ ] Confirm symbols such as arrows, quotation marks, em dashes, ellipses, and math characters render correctly.

### Editor typography

- [ ] Confirm the default editor font size is comfortable for a long writing session.
- [ ] Test every available editor font-size setting.
- [ ] Confirm changing font size updates the editor without losing focus, selection, or cursor position.
- [ ] Confirm font-size settings persist after closing and reopening the app.
- [ ] Confirm Markdown headings have the intended visual hierarchy in the source editor.
- [ ] Confirm front matter remains visually distinguishable from Markdown body text.
- [ ] Confirm code fences, inline code, links, wikilinks, tags, tasks, emphasis, highlights, math, and admonitions are distinguishable without becoming visually noisy.
- [ ] Confirm syntax colors remain readable against the editor background.
- [ ] Confirm selected text remains readable over syntax-highlighted text.
- [ ] Confirm the active line or cursor indicator does not overpower the text.
- [ ] Confirm wrapped long lines maintain consistent line height.
- [ ] Confirm blank lines, trailing spaces, tabs, and indentation are visually predictable.
- [ ] Confirm the editor does not horizontally jump when typing near the viewport edge.
- [ ] Confirm the editor does not reflow unexpectedly while typing or autosaving.
- [ ] Confirm Preview typography matches the source/editor design language.
- [ ] Confirm rendered headings, lists, quotes, tables, code blocks, math, footnotes, and callouts have readable spacing.
- [ ] Confirm links and wikilinks are visibly identifiable in Preview.
- [ ] Confirm very long unbroken URLs or code lines do not overflow the window.

### File tree and utility typography

- [ ] Confirm file and folder names use consistent size, weight, and line height.
- [ ] Confirm nested rows remain readable at every indentation level.
- [ ] Confirm long names truncate with an ellipsis and expose the full name through a title/accessible label.
- [ ] Confirm file-type labels do not collide with long filenames.
- [ ] Confirm search text, empty-state text, loading text, and error text have distinct but consistent emphasis.
- [ ] Confirm dialog descriptions are readable at the smallest supported window size.
- [ ] Confirm button labels never clip or wrap awkwardly.
- [ ] Confirm success, warning, and error notices remain readable in both light and dark themes.

## Visual layout and appearance

### App shell

- [ ] Confirm the first viewport is not blank and the primary action is obvious.
- [ ] Confirm title bar, workspace, file rail, editor, and status bar align cleanly.
- [ ] Confirm there is no horizontal scrollbar caused by the app shell.
- [ ] Confirm the sidebar opens and closes without layout jumps or content overlap.
- [ ] Confirm the sidebar width is usable for long filenames and does not starve the editor.
- [ ] Confirm resizing the window preserves the intended minimum widths.
- [ ] Confirm controls remain visible at narrow desktop widths.
- [ ] Confirm the status bar does not cover editor content or dialogs.
- [ ] Confirm fixed, sticky, and overlay elements have the correct stacking order.
- [ ] Confirm no tooltip, menu, or dialog is clipped by the window edge.

### Icons and controls

- [ ] Confirm file-tree icons are Lucide icons with consistent stroke weight and size.
- [ ] Confirm folder, disclosure, file, image, PDF, audio, video, archive, code, and unknown-file icons are visually distinct.
- [ ] Confirm icons do not shift text alignment between file types.
- [ ] Confirm icon-only controls have visible hover, focus, pressed, and disabled states.
- [ ] Confirm icon-only controls have meaningful accessible labels/tooltips.
- [ ] Confirm disabled controls have sufficient contrast and a clear disabled appearance.
- [ ] Confirm hover states do not cause layout shifts.
- [ ] Confirm active-row indicators are visible but not visually dominant.
- [ ] Confirm selection and active-document states are distinguishable.
- [ ] Confirm drag-over folder highlighting is obvious and disappears after drag cancellation.

### Themes, contrast, and states

- [ ] Test the app in every supported theme or appearance mode.
- [ ] Test macOS light mode.
- [ ] Test macOS dark mode.
- [ ] Test increased contrast if supported by the OS.
- [ ] Confirm borders remain visible without becoming heavy.
- [ ] Confirm focus rings remain visible in both light and dark modes.
- [ ] Confirm text, icons, borders, backgrounds, and selected rows meet the intended contrast level.
- [ ] Confirm error states are not communicated by color alone.
- [ ] Confirm success states are not communicated by color alone.
- [ ] Confirm loading states are visible but do not flicker.
- [ ] Confirm empty states explain what to do next.
- [ ] Confirm no-vault, vault-loading, vault-open, no-results, and error states all look intentional.

## File tree usage tests

### Collections and Files views

- [ ] Confirm Collections is the default after a clean launch.
- [ ] Toggle between Collections and Files and confirm the choice persists after relaunch.
- [ ] Confirm Inbox, Workbench, Archive, and Assets show accurate live counts.
- [ ] On first use, confirm Workbench starts expanded as a flat list sorted by Last Edited, newest first.
- [ ] Switch Workbench between Flat and Group by Type and confirm the preference persists after relaunch.
- [ ] Sort flat Workbench by Name A–Z and Z–A.
- [ ] Sort flat Workbench by Last Edited newest/oldest.
- [ ] Sort flat Workbench by Created newest/oldest.
- [ ] Confirm notes missing `created_at` remain last in both Created directions.
- [ ] Confirm equal timestamps use a deterministic vault-relative-path tie-breaker.
- [ ] Confirm Workbench view/sort commands are available from both a visible menu and its right-click menu.
- [ ] Confirm every Markdown note appears in exactly one top-level lifecycle collection.
- [ ] Confirm missing, blank, malformed, and `inbox` status values appear in Inbox.
- [ ] Confirm nonblank statuses other than `inbox` and `archived` appear in Workbench.
- [ ] Confirm Workbench displays Untyped first and every actual type alphabetically after it.
- [ ] Confirm Workbench type groups and their note counts expand and collapse independently.
- [ ] Confirm `status: archived` notes appear only in Archive.
- [ ] Confirm all non-Markdown files appear in Assets regardless of physical folder.
- [ ] Toggle Assets between grouped-by-type and A–Z modes.
- [ ] Confirm duplicate filenames show enough relative path to distinguish them.
- [ ] Confirm selection remains stable when switching between Collections and Files.
- [ ] Confirm system collections have no rename, delete, drag-destination, or physical-folder actions.

### Navigation and selection

- [ ] Open a vault and confirm the tree loads without stalling.
- [ ] Click a file and confirm it becomes selected and opens in the editor.
- [ ] Click a folder row and confirm selection does not unexpectedly expand it.
- [ ] Click the disclosure control and confirm only expansion changes.
- [ ] Confirm selection remains stable after expanding or collapsing folders.
- [ ] Confirm the active document indicator is distinct from ordinary selection.
- [ ] Confirm selection survives a harmless rescan.
- [ ] Confirm selection clears or moves safely when the selected file/folder is deleted or renamed.
- [ ] Confirm sorting is deterministic for mixed-case names, numeric names, folders, and files.
- [ ] Confirm root files appear at the root and nested files appear under the correct folders.
- [ ] Confirm folder nesting and indentation remain correct after renaming a parent folder.

### Keyboard navigation

- [ ] Focus the file tree without using the mouse.
- [ ] Use Arrow Up and Arrow Down to move selection.
- [ ] Use Home and End to move to the first and last visible tree item.
- [ ] Use Arrow Right to expand a collapsed folder.
- [ ] Use Arrow Left to collapse an expanded folder.
- [ ] Use Arrow Left on a collapsed nested folder to move to its parent.
- [ ] Use Enter to open a file or toggle a folder.
- [ ] Use Space and confirm it does not insert or remove characters from the filter input.
- [ ] Use Escape to close an open context menu.
- [ ] Use Shift+F10 or the keyboard Context Menu key to open item actions.
- [ ] Confirm keyboard focus is never lost after a tree action.
- [ ] Confirm keyboard navigation works after filtering.

### Search and filtering

- [ ] Filter by an exact filename.
- [ ] Filter by a partial filename.
- [ ] Filter by an alias.
- [ ] Filter by a file type such as `pdf`, `image`, or `audio`.
- [ ] Filter with mixed case.
- [ ] Filter with leading and trailing spaces.
- [ ] Filter with spaces inside an alias or filename.
- [ ] Confirm folders containing matching descendants remain visible.
- [ ] Confirm unrelated folders disappear.
- [ ] Clear the filter and confirm the prior tree state is restored.
- [ ] Confirm no-results text is clear and correctly styled.
- [ ] Confirm filtering a large vault remains responsive while typing.

### Context menus and actions

- [ ] Right-click a Markdown file.
- [ ] Right-click a non-Markdown file.
- [ ] Right-click a folder.
- [ ] Confirm the menu opens at the pointer and remains inside the window.
- [ ] Confirm clicking outside closes the menu.
- [ ] Confirm Escape closes the menu.
- [ ] Confirm only actions relevant to the selected item are shown.
- [ ] Open a file from its context menu.
- [ ] Rename a file from its context menu.
- [ ] Move a file to Trash from its context menu.
- [ ] Create a subfolder from a folder context menu.
- [ ] Rename a folder from a folder context menu.
- [ ] Delete a folder from a folder context menu.
- [ ] Confirm an action closes the menu and opens the correct dialog or state.
- [ ] Confirm folder menus contain New Note, New Subfolder, Move Folder To…, Search in Folder, Rename, and Delete.
- [ ] Confirm Markdown menus contain Open, Preview, Move To…, Search in Note, Rename, Archive/Restore, and Delete as applicable.
- [ ] Confirm Asset menus contain Reveal in Finder, Move To…, Rename, and Delete.
- [ ] Confirm unsafe, unsaved, archived, or unsupported actions are disabled with an explanation.

### Hidden paths and expansion controls

- [ ] Confirm root dotfiles do not appear anywhere in Anchored.
- [ ] Confirm every file below `.obsidian`, `.git`, and another nested dot-prefixed folder is excluded.
- [ ] Confirm a visible `schema.json` appears in Assets while the same file inside a hidden folder does not.
- [ ] Confirm hidden paths are excluded from Collections, Assets, Files, counts, search, Quick Open, links, and backlinks.
- [ ] Confirm moving or deleting a visible parent containing hidden descendants is refused without moving any bytes.
- [ ] Use the Lucide expand-all control in Collections and confirm every collection and type group expands.
- [ ] Use collapse-all in Collections and confirm every collection and type group collapses.
- [ ] Repeat expand/collapse-all in Files for every physical folder.
- [ ] Filter while groups are collapsed, confirm matches remain visible, then clear the filter and confirm prior expansion state returns.

### Drag and drop

- [ ] Drag a saved Markdown file onto a root folder.
- [ ] Drag a saved Markdown file onto a nested folder.
- [ ] Confirm the destination folder highlights during drag-over.
- [ ] Confirm dropping on an invalid target does not move the file.
- [ ] Confirm cancelling a drag clears the highlight.
- [ ] Confirm the moved file appears in the new location.
- [ ] Confirm supported links and backlinks remain correct after the move.
- [ ] Confirm unsaved, conflicted, or draft files cannot be dragged as saved vault files.

## Folder deletion and Trash tests

- [ ] Delete an empty folder.
- [ ] Confirm the empty-folder dialog supports Cancel.
- [ ] Confirm cancelling leaves the folder unchanged.
- [ ] Delete a folder containing a file.
- [ ] Confirm the warning shows the file and subfolder counts.
- [ ] Confirm the first action is Continue, not immediate deletion.
- [ ] Confirm the confirmation input is visible only after Continue.
- [ ] Enter the wrong phrase and confirm the destructive action remains disabled.
- [ ] Enter `delete folder` exactly and confirm the destructive action enables.
- [ ] Confirm capitalization or extra text does not satisfy the exact phrase requirement.
- [ ] Confirm proceeding moves the complete folder hierarchy to Trash.
- [ ] Confirm the folder disappears from the tree after the operation.
- [ ] Confirm the Trash count updates.
- [ ] Open Trash and confirm the folder is represented as one recoverable entry.
- [ ] Restore the folder and confirm all nested files and subfolders return.
- [ ] Confirm a restore conflict is reported without overwriting existing data.
- [ ] Confirm cancelling at every dialog stage leaves the folder unchanged.
- [ ] Confirm a failed delete leaves the source folder and its contents intact.

### Note Trash and restoration

- [ ] Trash a saved note; confirm it disappears from Collections, Files, Quick
      Open, search, wikilink candidates, aliases, and backlinks.
- [ ] Confirm references in other notes are not rewritten when the target is
      moved to Trash.
- [ ] Open Trash; confirm the note's name, original path, and timestamp.
- [ ] Restore the note; confirm identical bytes, path, front matter, links, and
      backlinks.
- [ ] Trash a nested note, remove its empty parent folder externally, and
      restore; confirm safe parent-folder recreation.
- [ ] Put another file at the original path and attempt restore; confirm refusal
      with both files unchanged.
- [ ] Switch vaults; confirm Trash contents remain vault-specific.
- [ ] Confirm there is no permanent-delete action.
- [ ] Close Trash with Escape and the visible control; confirm focus returns to
      the invoking control.

## Markdown editing and cursor behavior

- [ ] Open a short Markdown note and type at the beginning, middle, and end.
- [ ] Type continuously while the first load/save is still in progress.
- [ ] Type immediately after opening a note.
- [ ] Type immediately after creating a new note.
- [ ] Confirm every keystroke appears once and in the correct order.
- [ ] Confirm the cursor does not jump to the beginning or end while typing.
- [ ] Confirm the cursor remains on the intended line after autosave.
- [ ] Confirm selection remains selected during non-destructive background updates.
- [ ] Replace selected text and confirm only the selection changes.
- [ ] Test Shift+Arrow selection.
- [ ] Test Option/Alt+Arrow movement.
- [ ] Test Command/Ctrl+A, C, X, V, Z, and Shift+Z.
- [ ] Test typing with an active selection across multiple lines.
- [ ] Test typing before and after a wikilink, tag, code span, and front matter block.
- [ ] Test typing at the end of a very long line.
- [ ] Test typing while the editor scrolls vertically.
- [ ] Confirm selection and cursor survive opening and closing Preview.
- [ ] Confirm selection and cursor survive changing editor font size.
- [ ] Confirm selection and cursor survive a harmless vault rescan.
- [ ] Confirm the editor does not duplicate input during autosave or background indexing.
- [ ] Confirm IME/composition input is not interrupted if applicable.
- [ ] Confirm undo and redo preserve cursor and selection behavior.

## Saving, conflicts, and data safety

- [ ] Create a new note and confirm it becomes editable immediately.
- [ ] Create a default New note and confirm its persisted path is
      `inbox/Untitled.md` (or the next collision-safe Inbox filename).
- [ ] Type into a new note before its first save completes.
- [ ] Confirm save state visibly changes through unsaved, saving, and saved.
- [ ] Use manual Save.
- [ ] Use autosave.
- [ ] Use Save As.
- [ ] Rename a saved note and confirm supported links update.
- [ ] Click the filename in the editor breadcrumb, confirm the inline field
      receives focus and selects the current name, then rename with Enter.
- [ ] Rename from the breadcrumb with blur, cancel with Escape, and confirm an
      empty or invalid filename shows a recoverable notice without changing
      the original file.
- [ ] Change only YAML `title` and confirm links do not rewrite.
- [ ] Edit the same file externally and confirm the app shows a conflict instead of overwriting silently.
- [ ] Resolve or recover from a conflict without losing the newer content.
- [ ] Change a clean open file externally and confirm Anchored reloads it
      without creating a conflict or recovery copy.
- [ ] Change a dirty open file externally and confirm Anchored stops autosave,
      keeps the local draft, leaves the external file unchanged, and creates
      one visible same-folder `Anchored conflict` recovery copy.
- [ ] Trigger repeated external changes and confirm the same unresolved
      conflict does not create duplicate recovery copies; a later conflict gets
      a unique filename.
- [ ] Open the recovery copy from the conflict notice and reload the external
      version from the explicit conflict actions.
- [ ] Resolve disjoint local and external line edits with the proposed
      three-way result, then confirm the file is written only after an
      expected-content recheck.
- [ ] Resolve overlapping edits manually, cancel the dialog, and confirm both
      the external file and local recovery copy remain intact.
- [ ] Press Command-S while autosave is pending and confirm only one serialized
      save is issued and the newest local edit remains available.
- [ ] Close and reopen the app after saving.
- [ ] Quit during or immediately after a save and verify the saved content.
- [ ] Confirm CRLF/legacy line endings are normalized only on intentional save.
- [ ] Confirm unsupported front matter and Obsidian syntax remain intact.
- [ ] Confirm attachments are not deleted or rewritten by Markdown edits.
- [ ] Confirm `.anchored` metadata is additive and does not expose vault content in logs.
- [ ] Save As over an existing note and outside the vault; confirm both are
      refused without overwriting anything.
- [ ] Close a note with unfinished edits; confirm Anchored keeps it open and
      clearly explains the required action.
- [ ] Create an unsaved note, close the window, then quit; confirm an explicit
      save/discard/cancel guard protects the draft.
- [ ] Confirm app-created notes receive `created_at`, while Finder-added notes
      are indexed without automatic metadata writes.
- [ ] Add malformed or duplicate legacy IDs; confirm they remain inert user
      metadata and do not generate recurring identity notifications.
- [ ] Add, rename, move, and delete files externally; return focus and confirm
      the index refreshes without rewriting unrelated files.
- [ ] Move an open note in Finder from the vault root into a nested folder and
      confirm it stays open, keeps its selection, and derives `type` from the
      first folder beneath the vault root.
- [ ] Move an open note in Finder into the vault root or `inbox/` and confirm
      the derived `type` is removed; disable the setting and verify path
      tracking and link maintenance still work without changing metadata.
- [ ] Confirm external moves update wikilinks in both YAML front matter and
      Markdown bodies, while Archive preserves `type` and sets archived status
      through its existing action.
- [ ] Run Git checkout, pull, merge, rebase, and reset operations in a
      disposable vault and confirm Anchored refreshes without reload loops.
- [ ] Exercise atomic replacement and temporary-file sync behavior with
      iCloud, Dropbox, or a local replacement script; confirm duplicate events
      do not create duplicate recovery copies.

## Lifecycle and Archive

- [ ] Create a note and confirm `created_at` uses second-precision RFC 3339 with
      the Mac's local numeric offset, such as `+02:00` in Basel summer time.
- [ ] Confirm existing notes are not bulk-rewritten automatically on vault open.
- [ ] In Settings, preview timestamp migration on a backed-up vault and confirm
      the candidate file/value counts and skipped-value reasons are visible.
- [ ] Apply the migration and confirm exact timestamp-valued properties change
      to local offsets without changing their represented instants.
- [ ] Confirm date-only, fractional, malformed, ambiguous, and unsupported
      frontmatter values remain unchanged and are reported.
- [ ] Change a candidate externally between preview and apply; confirm it is
      reported as a conflict and is not overwritten.
- [ ] Archive an editable saved note and confirm `status: archived` and a fresh `archived_at` are written atomically.
- [ ] Confirm archived notes open directly in sanitized Preview with no editor or ordinary save action.
- [ ] Attempt an archived native save path and confirm it is refused without changing the file.
- [ ] Restore an archived note to Inbox and confirm `status: inbox` with no `archived_at`.
- [ ] Restore an archived note to Workbench and confirm `status: active` with no `archived_at`.
- [ ] Archive the restored note again and confirm a new `archived_at` value is written.
- [ ] Confirm comments, key order, quotes, BOM, line endings, and unrelated front matter survive every transition.
- [ ] Create malformed or duplicate lifecycle fields and confirm mutation is refused safely.
- [ ] Edit the file externally before archive or restore and confirm the expected-content conflict preserves both versions.
- [ ] Move a note to Workbench and choose an existing type, a validated new type, and Untyped in separate passes.
- [ ] Confirm choosing Untyped removes or omits `type` instead of writing `type: untyped`.
- [ ] Move a note to Archive and confirm its existing type is preserved unless explicitly changed.
- [ ] Confirm restoring to Workbench asks for type while restoring to Inbox preserves the existing type.
- [ ] Confirm stored `created_at`, `updated_at`, and `archived_at` values use
      second-precision local-offset RFC 3339 while the UI displays local time.
- [ ] Create a note with initial authored content and confirm `created_at` and `updated_at` begin with the same timestamp.
- [ ] Confirm successful content edits and autosaves advance `updated_at`.
- [ ] Confirm status/type-only changes, rename, move, conflicts, failed saves, and detected external edits do not advance `updated_at`.
- [ ] Confirm no `modified_at` front-matter property is generated and Last Edited follows cached filesystem modification time.

## Scratchpad usage and safety

- [ ] Open a new Scratchpad from the Lucide toolbar button.
- [ ] Open a new Scratchpad with Control-Option-N while Anchored is active.
- [ ] Confirm a Scratchpad saved-view row with an accurate active count appears between Inbox and Workbench.
- [ ] Confirm the saved view and list contain only `type: scratchpad`, `status: inbox` notes and exclude archived captures.
- [ ] With multiple active captures, open the right-side list with Control-Option-S and select another note without loading the full editor.
- [ ] Confirm the Scratchpad list is sorted by Last Edited newest first and is keyboard accessible.
- [ ] Confirm the warm Scratchpad window focuses within 250 ms.
- [ ] Confirm the Scratchpad uses the lightweight capture surface rather than loading the full editor.
- [ ] Close a blank Scratchpad and confirm no file is created.
- [ ] Type one nonblank character and confirm a new collision-safe Markdown file is created.
- [ ] Confirm each new capture is a separate note with `type: scratchpad`, `status: inbox`, and `created_at`.
- [ ] Confirm each new capture's persisted path starts with `inbox/`.
- [ ] Confirm Scratchpad captures appear in Inbox and remain visible in Files.
- [ ] Type continuously, paste large text, and use Unicode and IME composition without dropped or partial saves.
- [ ] Confirm autosave reaches Saved after a short idle interval.
- [ ] Close immediately after typing and confirm the complete draft is flushed before the window hides.
- [ ] Trigger an external-edit conflict and confirm the Scratchpad remains visible with the local draft intact.
- [ ] Type `[[`, filter suggestions, navigate with arrow keys, insert with Return, and dismiss with Escape.
- [ ] Confirm a completed wikilink remains ordinary portable Markdown source.
- [ ] Use Control-Option-P and confirm the newest non-archived Scratchpad note opens.
- [ ] Archive the newest capture and confirm Previous skips it.
- [ ] Invoke New and Previous rapidly and confirm stale loads never replace newer typing.
- [ ] Confirm Scratchpad shortcuts explain that a vault must be opened when no vault is selected.
- [ ] Confirm system-wide shortcuts are not expected in this build.

## Search, links, and Preview

- [ ] Search by filename.
- [ ] Search by alias.
- [ ] Search Markdown content.
- [ ] Open a search result.
- [ ] Open Quick Open with Command-P; confirm recent notes appear by default.
- [ ] Search Quick Open by filename, path, and alias; navigate with Arrow keys
      and open with Return.
- [ ] Confirm the active note is excluded from default recent suggestions.
- [ ] Move or delete a note externally; confirm stale Quick Open results vanish
      after refresh.
- [ ] Use Command-Shift-F to search Unicode body text.
- [ ] Confirm search results include path, line number, and a useful snippet.
- [ ] Search text with more than 100 matches; confirm a visible limited-result
      state and safely skipped-file count rather than interface failure.
- [ ] Search with no vault open and confirm the explanation is actionable.
- [ ] Search with no matches and confirm the empty state.
- [ ] Trigger a recoverable search error, close the palette, and search again.
- [ ] Use Command-F in the active note; confirm Find searches only that note and
      Escape closes it.
- [ ] Open a valid wikilink.
- [ ] Open a wikilink by alias.
- [ ] Open `[[Folder/Note]]`, `[[Folder/Note.md]]`, `[[Note#Heading]]`,
      `[[Note|Label]]`, and `![[Note]]`.
- [ ] Open a supported link inside a quoted top-level YAML text/list value.
- [ ] Confirm `[[#Heading]]` resolves to the current note.
- [ ] Command-click and Command-Enter a wikilink; confirm both open the same
      target.
- [ ] Confirm duplicate filename and alias links report ambiguity rather than
      opening an arbitrary note.
- [ ] Open a simple missing wikilink with Command-click and confirm a Create
      note dialog explains that the note will be created in physical Inbox.
- [ ] Cancel the missing-link dialog and confirm no file is created.
- [ ] Confirm Create note writes the target as `inbox/<target>.md`, creates the
      physical folder when needed, opens the blank note, and leaves the source
      wikilink unchanged.
- [ ] Confirm a stale or duplicate creation attempt never overwrites an
      existing note and shows a recoverable error.
- [ ] Confirm path-style unresolved targets remain reported without silently
      rewriting the source link.
- [ ] Confirm escaped links and links inside inline, fenced, and indented code
      do not navigate or create backlinks.
- [ ] Type `[[`; confirm recent notes appear, excluding the active note.
- [ ] Navigate completion with Arrow keys and Return.
- [ ] Confirm a unique filename inserts `[[Name]]`, while duplicate filenames
      insert vault-relative paths.
- [ ] Search completion by alias; confirm `[[target|alias]]` insertion.
- [ ] Confirm completion shows at most 24 options and ranks filename, folder,
      alias, and recent-note matches predictably.
- [ ] Confirm unresolved references appear as **Uncreated** with counts without
      creating a file.
- [ ] Confirm completion works in supported quoted YAML but not in code,
      comments, malformed links, or unsupported YAML values.
- [ ] Follow a wikilink from Preview.
- [ ] Confirm unresolved wikilinks remain visibly unresolved without crashing.
- [ ] Confirm body and supported front-matter backlinks appear and open the
      correct source note.
- [ ] Confirm ambiguous and missing source links do not create false backlinks.
- [ ] Edit a link without saving; confirm the live backlink view updates.
- [ ] Confirm backlinks update after a file rename.
- [ ] Confirm ambiguous links remain unchanged and are not silently redirected.
- [ ] Rename and move a heavily linked disposable note; confirm filename, path,
      `.md` style, heading fragments, display labels, aliases, and backlinks
      remain valid.
- [ ] Confirm changing only YAML `title` does not rewrite references.
- [ ] Confirm unrelated notes remain byte-for-byte unchanged after rename/move.
- [ ] Attempt rename with affected unsaved notes or an occupied destination;
      confirm refusal without a partial transaction.
- [ ] Confirm no temporary, backup, or rename-journal file remains afterward.
- [ ] In a disposable recovery test, force-quit during rename; reopening must
      restore the old state or complete the new state, never a mixture.
- [ ] Render Preview with headings, lists, tables, footnotes, math, code, emoji, admonitions, and Mermaid.
- [ ] Confirm dangerous HTML or URLs are sanitized.
- [ ] Confirm Preview errors are recoverable and do not blank the app.

## Notifications and history

- [ ] Trigger multiple messages; confirm a centered newest-first stack that
      does not obstruct note actions.
- [ ] Dismiss messages independently and confirm identical events deduplicate.
- [ ] Open the bell; confirm timestamped history is scoped to the current vault.
- [ ] Confirm vault, link, rename, Trash, conflict, lifecycle, and error events
      use clear labels while routine autosaves do not flood history.
- [ ] Delete an ordinary record and clear resolved records.
- [ ] Confirm an active conflict cannot be deleted as ordinary history but can
      be marked resolved.
- [ ] Switch vaults and back; confirm each vault restores its own badge and
      history.
- [ ] Close with Escape and the visible Close control; confirm focus returns.
- [ ] Tab through the panel; focus must not enter obscured application controls.

## Privacy, integrity, and portability

- [ ] Disconnect networking; confirm every implemented core feature continues
      to work.
- [ ] Confirm no account, login, analytics, telemetry, or network request is
      required.
- [ ] Inspect edited files in another Markdown editor; confirm portability.
- [ ] Confirm unsupported syntax, tags, comments, attachment links, BOM, and
      unrelated front matter remain present after supported operations.
- [ ] Confirm attachments are indexed as Assets and never interpreted as
      Markdown.
- [ ] Inspect `.anchored`; confirm it contains only expected vault identity,
      Trash, and recovery metadata.
- [ ] Confirm local interface storage, notifications, and recent-note data do
      not expose note contents or absolute vault paths.

## Performance and stability

- [ ] Open the 700-file/56-folder vault and time until the first usable tree appears.
- [ ] Scroll from top to bottom repeatedly.
- [ ] Expand and collapse large folders repeatedly.
- [ ] Select files rapidly while the tree is scrolling.
- [ ] Type rapidly into the tree filter.
- [ ] Open and close context menus repeatedly.
- [ ] Drag files through a large tree.
- [ ] Rescan the large vault while the tree is expanded.
- [ ] Add, rename, move, and delete files externally, then return focus to the app.
- [ ] Confirm the UI does not stall for multiple seconds during any operation.
- [ ] Confirm memory and CPU settle after scrolling and filtering.
- [ ] Leave the app open for at least 30 minutes and continue editing.
- [ ] Open and close at least 20 notes in one session.
- [ ] Confirm no gradual slowdown, growing lag, or visual corruption.
- [ ] Confirm the app remains responsive while Preview loads large content.
- [ ] Confirm a recoverable error never leaves a permanent loading state.
- [ ] Confirm a warm note up to 1 MiB is editable within 200 ms at p95.
- [ ] Confirm a cold note open completes within 500 ms at p95.
- [ ] Confirm link topology for 700 notes and 3,500 links builds within 100 ms.
- [ ] Confirm rapid Files scrolling and direction reversals show no black gaps or missed input.
- [ ] Confirm no measured main-thread interaction task exceeds 50 ms during rapid tree use.
- [ ] Confirm focus refresh reads bodies only for new or signature-changed Markdown files.
- [ ] On the 2015 MacBook Pro baseline, record cold launch, vault-to-usable,
      first-note, and warm-note-switch timings.
- [ ] Type continuously for five minutes; confirm no dropped input or visible
      completion lag.
- [ ] Exercise wikilink completion, Quick Open, and content search repeatedly;
      confirm memory growth does not make the app unusable.
- [ ] Rename a heavily linked note; confirm responsive progress rather than an
      interface freeze.
- [ ] Leave the app open for at least four hours with normal editing, searches,
      Scratchpad use, and vault switching; confirm stable memory and saving.

## Accessibility and input methods

- [ ] Navigate the primary workflow using keyboard only.
- [ ] Confirm every interactive control has an accessible name.
- [ ] Confirm focus order follows the visual order.
- [ ] Confirm focus is trapped in dialogs and restored after dialogs close.
- [ ] Confirm menus expose menu roles and keyboard behavior correctly.
- [ ] Confirm selected tree items expose selected state.
- [ ] Confirm expanded folders expose expanded state.
- [ ] Confirm screen-reader labels distinguish files with the same visible basename in different folders where necessary.
- [ ] Test with VoiceOver if available.
- [ ] Test increased text size or system accessibility settings if available.
- [ ] Test mouse, trackpad, and keyboard activation for the same actions.
- [ ] Confirm right-click alternatives exist for users who cannot use a secondary click.
- [ ] Enable Reduce Motion; confirm no required information depends on motion.
- [ ] Complete create, open, edit, save, search, link, rename, archive, Trash,
      restore, notification, and vault-switch flows without a pointer.
- [ ] Run VoiceOver through the title bar, file tree, editor, Preview,
      backlinks, palettes, notifications, vault switcher, Trash, lifecycle
      dialogs, and Scratchpad list.

## Final regression and release checks

- [ ] Start from a clean launch.
- [ ] Open a vault.
- [ ] Open a note.
- [ ] Edit and save it.
- [ ] Close and reopen the note.
- [ ] Navigate folders.
- [ ] Search and open a result.
- [ ] Follow a link.
- [ ] Open Preview.
- [ ] Create a note.
- [ ] Create, autosave, close, and reopen a Scratchpad note.
- [ ] Archive and restore a note.
- [ ] Rename a note.
- [ ] Move a note.
- [ ] Delete and restore a note.
- [ ] Delete and restore a non-empty folder.
- [ ] Close and relaunch the app.
- [ ] Confirm the remembered vault and last note restore correctly.
- [ ] Confirm no unexpected files, logs, secrets, or debug overlays were created.
- [ ] Record all failures with reproduction steps, screenshots, app version, OS version, and vault fixture details.
- [ ] Do not test destructive operations against the primary vault until the backup run is clean.

## Seven-day stability observation

Repeat the core journey on a backed-up representative vault for seven
consecutive days. Content loss, corruption, unsafe overwrite, or broken
supported links resets the observation after the defect is fixed.

| Day | Launch/open | Write/autosave | Links/rename | Search | Scratchpad | Relaunch/recovery | Result/issues |
|---|---|---|---|---|---|---|---|
| 1 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| 2 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| 3 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| 4 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| 5 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| 6 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| 7 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |

## Issue report template

```text
Anchored version/commit:
macOS version and Mac model:
Installation type:
Vault size and relevant structure:
Backup confirmed before test: yes/no

Steps to reproduce:
1.
2.
3.

Expected result:
Actual result:
Frequency: once/intermittent/every time
Any note bytes changed unexpectedly: yes/no/unknown
Recovery attempted and result:
Screenshots or exact visible message:
Relevant disposable files (never attach private vault content):
```

## Sign-off

- Tester: ____________________
- Date: ______________________
- App/build: _________________
- macOS/device: ______________
- Vault fixture: ______________
- Result: [ ] Pass  [ ] Pass with known issues  [ ] Fail
- Known issues / follow-up:

  ```text
  
  ```
