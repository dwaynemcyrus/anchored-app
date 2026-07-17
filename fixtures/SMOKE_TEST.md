# Anchored smoke-test vault

In Anchored, choose **Open vault** and select this folder:

```text
fixtures/smoke-vault
```

The fixture is disposable. Reset changed notes with Git before repeating a
clean test.

## Retrieval checks

1. Open `Notes/Leadership.md` and type a short line. Wait one second, close the
   note, reopen it, and confirm the line remains.
2. Press Command-P. Search for `Leading Well`, `Practice Log`, and `Anchor
   Build`; each alias should find its note.
3. Search for `Project`. Both `Notes/Project.md` and `Archive/Project.md` should
   remain distinguishable by path.
4. Press Command-Shift-F and search for `café Zürich`. Open the returned result.
5. Press Command-F inside that note, search for `reliable`, then press Escape.
6. Type `[[` in a note. Confirm existing notes, aliases, and the uncreated
   `Future Idea` placeholder appear without creating a file.
7. Open `Empty.md`, type text, and confirm it saves normally.

