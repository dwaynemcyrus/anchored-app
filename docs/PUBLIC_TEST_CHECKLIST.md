# Anchored public testing checklist

Use this checklist for each release-candidate build. Record failures with the
build version, macOS version, vault size, exact steps, expected result, actual
result, and whether any file bytes changed.

> **Do not start public vault testing while a release blocker in
> [FEATURES.md](FEATURES.md#release-blockers) remains open.** Until then, this
> checklist is suitable only for developers and informed private testers using
> disposable data.

## Test record

- [ ] Anchored version/commit:
- [ ] macOS version and Mac model:
- [ ] Installation type: development / unsigned package / signed package
- [ ] Test vault name and approximate Markdown-file count:
- [ ] Backup location and time verified:
- [ ] Start date:
- [ ] Tester:

## 1. Safety preflight

- [ ] Use a disposable vault or a copy that can be restored independently of
  Anchored.
- [ ] Confirm the backup opens in another Markdown editor.
- [ ] Record hashes or byte-for-byte copies of several representative notes,
  including front matter, Unicode, CRLF, attachments, and unsupported Obsidian
  syntax.
- [ ] Confirm no other Anchored development process is running.
- [ ] Confirm the test build opens with a black interface and readable white
  text, not a blank window.
- [ ] Confirm the build identifies itself as Anchored with the expected icon.
- [ ] Keep Finder or another Markdown editor available for external-change
  tests.

## 2. Install, launch, and recovery shell

- [ ] Install or open the build using its documented procedure.
- [ ] Confirm macOS does not report an unexplained or misleading publisher.
- [ ] Launch with no vault selected; expect **No vault open** and an **Open
  vault** action.
- [ ] Confirm there are no startup error messages or empty white/black window.
- [ ] Resize to 900×600; all primary controls remain visible and the page has no
  horizontal scroll.
- [ ] Increase macOS display/text scaling or browser zoom equivalent to 200%;
  core controls remain keyboard reachable.
- [ ] Quit and relaunch with no active note; startup remains stable.

## 3. Open and remember vaults

- [ ] Choose **Open vault** and select a folder, not an individual `.md` file.
- [ ] Confirm nested Markdown files appear in stable folder groups.
- [ ] Confirm non-Markdown files do not appear as notes.
- [ ] Confirm the hidden `.anchored` folder does not appear.
- [ ] Collapse and expand several folders.
- [ ] Filter by full filename, partial filename, and alias.
- [ ] Clear the filter and confirm all notes return.
- [ ] Open a second disposable vault.
- [ ] Use the vault selector to switch between remembered vaults.
- [ ] Confirm the current vault is labelled and cannot be reopened as another
  entry.
- [ ] Temporarily move a remembered vault in Finder; expect it to appear as
  unavailable rather than disappear.
- [ ] Reopen the moved vault from its new location; expect its vault-specific
  history to follow it.
- [ ] Forget a remembered vault; confirm its files and `.anchored` folder are
  unchanged.

## 4. Open and navigate notes

- [ ] Open a nested Markdown note; expect exact source text in the editor.
- [ ] Open a root-level note.
- [ ] Open an empty note; expect an editable empty editor.
- [ ] Switch repeatedly among three notes; each opens without stale content.
- [ ] Close the active note; expect the vault to remain open.
- [ ] Reopen the closed note from the explorer.
- [ ] Try a non-UTF-8 or larger-than-10-MiB disposable `.md` file; expect a
  recoverable refusal without alteration.

## 5. Create, edit, save, and relaunch

- [ ] With a vault open, create a note from the top bar.
- [ ] Type multiple paragraphs, headings, Unicode, links, and front matter.
- [ ] Confirm the top bar changes from Unsaved to the correct save states.
- [ ] Use Command-S; on first save, choose a new `.md` path inside the vault.
- [ ] Confirm the saved file contains the typed content and one canonical
  unprefixed 26-character `id`.
- [ ] Edit the saved note, wait more than one second, close and reopen it;
  expect the edit to persist through autosave.
- [ ] Use Command-Shift-S to save a copy; expect a fresh note identity in the
  copy while the source identity remains unchanged.
- [ ] Try Save As over an existing note; expect refusal and no overwrite.
- [ ] Try to choose a destination outside the vault; expect refusal.
- [ ] Close a note with unfinished edits; expect Anchored to keep it open and
  explain what must be saved.
- [ ] Create a new unsaved note, try to close the window, and then quit the app;
  expect an explicit save/discard/cancel guard. **This currently fails and is a
  release blocker.**
- [ ] Relaunch and reopen saved notes; content and identities are intact.

## 6. External changes and Finder indexing

- [ ] Open and edit a saved note in Anchored without allowing autosave to
  complete.
- [ ] Change that same file externally, then save in Anchored; expect Conflict,
  the local text retained in the editor, and the external file not overwritten.
- [ ] Resolve the conflict deliberately and confirm the notification can be
  marked resolved.
- [ ] Add a new `.md` file in Finder while Anchored is open.
- [ ] Return focus to Anchored; expect the file to appear without restarting.
- [ ] On a previously baselined vault, confirm a genuinely new safe note gains
  one ID and its original content otherwise remains intact.
- [ ] Rename an older ID-less note in Finder; confirm it is not mistaken for a
  newly created note and rewritten automatically.
- [ ] Add malformed or duplicate front-matter IDs; expect a visible identity
  conflict and no silent rewrite.

## 7. Existing-note identity migration

- [ ] Open a copy of a vault containing ID-less legacy notes.
- [ ] Open the identity migration preview.
- [ ] Confirm eligible notes and unsafe notes are listed separately.
- [ ] Close the preview without applying; confirm no note changes.
- [ ] Reopen and apply the preview.
- [ ] Confirm eligible notes receive one canonical unprefixed ID.
- [ ] Confirm comments, Unicode, BOM, line endings, headings, and body text are
  otherwise byte-for-byte preserved.
- [ ] Change a note externally after preview but before apply; expect that note
  to be skipped.
- [ ] Confirm malformed, duplicate, and invalid front matter remains untouched.

## 8. Wikilink resolution

Prepare unique notes, duplicate filenames in separate folders, aliases,
headings, body links, quoted YAML links, embeds, and missing links.

- [ ] Command-click `[[Unique Note]]`; expect the unique filename match.
- [ ] Command-Enter with the cursor in the same link; expect the same result.
- [ ] Open `[[Folder/Note]]` and `[[Folder/Note.md]]`.
- [ ] Open `[[Note#Heading]]`; expect the note to open with the target preserved.
- [ ] Open `[[Note|Visible label]]`; expect the target note.
- [ ] Open `![[Note]]`; expect the target note.
- [ ] Open a unique alias using different letter case.
- [ ] Open a supported link inside a quoted top-level YAML text/list value.
- [ ] Confirm `[[#Heading]]` resolves to the current note.
- [ ] Confirm duplicate filename and duplicate alias links report ambiguity and
  do not open an arbitrary note.
- [ ] Confirm a missing link reports no match and creates no file.
- [ ] Confirm escaped links and links inside inline, fenced, or indented code do
  not navigate or create backlinks.

## 9. Wikilink completion and placeholders

- [ ] Type `[[`; expect recent notes, excluding the active note.
- [ ] Use Arrow Up/Down and Return to insert a candidate.
- [ ] Confirm a unique filename inserts as `[[Name]]` rather than a long path.
- [ ] Confirm duplicate filenames insert vault-relative paths.
- [ ] Search by alias; expect insertion as `[[target|alias]]`.
- [ ] Type part of a filename, folder, and alias; relevant matches move ahead of
  unrelated recent notes.
- [ ] Confirm no more than 24 options are displayed.
- [ ] Confirm existing unresolved links appear as **Uncreated** with reference
  counts.
- [ ] Type a new safe name; expect a new unresolved link option without file
  creation.
- [ ] Test completion inside supported quoted YAML text.
- [ ] Confirm completion does not activate inside code, comments, malformed
  links, or unsupported YAML values.

## 10. Backlinks

- [ ] Open a note referenced by one body wikilink; expect one backlink.
- [ ] Add a second body link from another note; expect both sources.
- [ ] Add a supported front-matter wikilink; expect it in backlinks.
- [ ] Click each backlink; expect the correct source note.
- [ ] Add an ambiguous or missing source link; expect no false backlink.
- [ ] Edit a link without saving; expect the live backlink view to update.

## 11. Rename and move with reference updates

Use a disposable target note with a permanent ID, a unique filename, an alias,
a heading, and references from several notes and quoted YAML values.

- [ ] Select the saved target and confirm **Rename** is visible in its header.
- [ ] Rename only its filename; expect the note ID and content to remain intact.
- [ ] Confirm unique filename links update to the new filename.
- [ ] Confirm path links, `.md` extension style, headings, and display labels are
  preserved while their target changes.
- [ ] Confirm alias-only links retain visible alias text using a display label
  when needed.
- [ ] Move the note into another vault folder through Rename; expect references
  to remain valid.
- [ ] Confirm backlinks still resolve after rename/move.
- [ ] Change only the note's YAML `title`; confirm no references rewrite.
- [ ] Confirm ambiguous filename or alias links remain unchanged.
- [ ] Confirm unrelated notes remain byte-for-byte unchanged.
- [ ] Try rename while any affected note has unfinished edits; expect refusal.
- [ ] Try rename over an existing note; expect refusal and no partial changes.
- [ ] After success or refusal, confirm no `.tmp`, `.backup`, or rename journal
  remains in the vault.
- [ ] Force-quit only in a disposable transaction-recovery test; reopening the
  vault must restore the old state or complete the new state, never a mixture.

## 12. Quick Open, vault search, and Find

- [ ] Use Command-P; expect recent notes by default.
- [ ] Search Quick Open by filename, path, and alias.
- [ ] Navigate results with Arrow keys and open with Return.
- [ ] Confirm the active note is excluded from default recent suggestions.
- [ ] Delete or move a note externally; confirm stale Quick Open results are
  removed after refresh.
- [ ] Use Command-Shift-F and search Unicode body text.
- [ ] Confirm each result shows path, line number, and a useful snippet.
- [ ] Open a result and confirm the correct note.
- [ ] Search text with more than 100 matches; expect a visible limited result
  state instead of interface failure.
- [ ] Confirm safely skipped files are reported in the result footer.
- [ ] Trigger a recoverable search error, close the palette, and search again.
- [ ] Use Command-F in the active note; confirm CodeMirror's find interface
  searches only that note and Escape closes it.

## 13. Notifications and history

- [ ] Trigger multiple status messages; expect a centered stack below the note
  header, with the newest first and note actions still usable.
- [ ] Dismiss each message independently.
- [ ] Repeat an identical event; expect deduplication rather than an unbounded
  stack.
- [ ] Open the bell; expect timestamped history for the current vault.
- [ ] Confirm vault, identity, link, rename, Trash, conflict, and error records
  use clear labels.
- [ ] Confirm routine successful autosaves do not flood history.
- [ ] Delete an ordinary record and clear resolved records.
- [ ] Confirm an active conflict cannot be deleted as ordinary history but can
  be marked resolved.
- [ ] Switch vaults; confirm the badge count and records change to that vault.
- [ ] Return to the first vault; confirm its count and records return.
- [ ] Confirm Escape and Close dismiss the panel and restore focus.
- [ ] Keyboard-tab through the panel; focus must not move into obscured app
  controls. **This requires correction before public testing.**

## 14. Reversible Trash

- [ ] Select a saved note and choose **Trash**.
- [ ] Confirm the note disappears from files, Quick Open, search, wikilinks,
  aliases, and backlinks.
- [ ] Confirm references in other notes are not rewritten.
- [ ] Open Trash; expect name, original path, and timestamp.
- [ ] Restore the note; expect the same bytes, path, ID, links, and backlinks.
- [ ] Trash a note from a nested folder, remove the now-empty folder externally,
  and restore; expect safe folder recreation.
- [ ] Put another file at the original path and try restore; expect refusal with
  both files unchanged.
- [ ] Switch vaults; each vault shows only its own Trash.
- [ ] Confirm there is no permanent-delete action.
- [ ] Confirm Escape and Close dismiss Trash and restore focus.

## 15. Accessibility and keyboard

- [ ] Complete create, open, edit, save, search, link, rename, Trash, restore,
  notification, and vault-switch flows without a pointer.
- [ ] Confirm every icon button has a meaningful accessible name.
- [ ] Confirm focus is visible on every interactive control.
- [ ] Confirm Quick Open and Search move focus into their inputs and return it
  on close.
- [ ] Confirm every dialog or side panel closes with Escape.
- [ ] Confirm focus remains inside every modal surface while it is open.
- [ ] Enable Reduce Motion; no required information depends on animation.
- [ ] Check the black/white and muted-gray contrast in normal, focused,
  disabled, conflict, and error states.
- [ ] Run a macOS VoiceOver pass over the title bar, file explorer, editor,
  backlinks, palettes, notification history, vault switcher, and Trash.

## 16. Privacy, integrity, and portability

- [ ] Disconnect networking; all implemented core features still work.
- [ ] Confirm no account, login, analytics, or network request is required.
- [ ] Inspect representative edited files in another Markdown editor.
- [ ] Confirm unsupported Obsidian syntax, tags, comments, and attachment links
  remain present.
- [ ] Confirm Anchored does not render, index, or open attachments as though
  that feature were supported.
- [ ] Confirm `.anchored` contains only bounded vault identity, Trash, and
  recovery metadata expected by the feature reference.
- [ ] Confirm no absolute vault paths or note contents appear in notification
  or recent-note interface storage.

## 17. Performance and endurance

- [ ] On the 2015 MacBook Pro baseline, record cold launch time.
- [ ] Record time from selecting a representative vault to usable navigation.
- [ ] Record time to open the first note and to switch among warm notes.
- [ ] Type continuously for five minutes; expect no dropped input or visible
  completion lag.
- [ ] Exercise `[[` completion in a representative large vault.
- [ ] Run Quick Open and content search repeatedly without memory growth that
  makes the app unusable.
- [ ] Rename a heavily linked note; expect responsive progress and completion,
  not an interface freeze.
- [ ] Leave the app open for at least four hours with normal edits and vault
  switching; expect stable memory and save behavior.

## 18. Seven-day stability observation

Repeat the core journey on a backed-up representative vault for seven
consecutive days. Any content loss, corruption, unresolved supported-link
breakage, or unsafe overwrite resets the observation after the fix.

| Day | Launch/open | Write/autosave | Links/rename | Search | Relaunch/recovery | Result/issues |
|---|---|---|---|---|---|---|
| 1 | [ ] | [ ] | [ ] | [ ] | [ ] | |
| 2 | [ ] | [ ] | [ ] | [ ] | [ ] | |
| 3 | [ ] | [ ] | [ ] | [ ] | [ ] | |
| 4 | [ ] | [ ] | [ ] | [ ] | [ ] | |
| 5 | [ ] | [ ] | [ ] | [ ] | [ ] | |
| 6 | [ ] | [ ] | [ ] | [ ] | [ ] | |
| 7 | [ ] | [ ] | [ ] | [ ] | [ ] | |

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
