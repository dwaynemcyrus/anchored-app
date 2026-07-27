# UI prototypes

Self-contained HTML prototypes used to agree on interface design before any
React work starts. They are design artifacts, not application code: nothing here
is imported by `src/`, and nothing here ships in the Tauri bundle.

Each prototype is a single file with no build step and no network access. Open
it by double-clicking, or serve it with `npm run dev` and visit
`/docs/prototypes/<file>.html`.

## `four-pane-shell.html`

The minimal four-pane shell — **navigation · list · editor · inspector** — with
drag-resizable panes, plus the no-vault empty state.

Colour, type, spacing, and the anchor-line motif follow
[`../design/editor-design.md`](../design/editor-design.md). The `:root` tokens
are copied verbatim from `src/styles/global.css` so the two cannot drift.

### What is live

- **Resizing.** Drag any of the three handles. The visible rule stays one pixel;
  the drag target is nine. Limits: nav 180–320, list 220–480, inspector 200–420.
  The editor never goes below 400px — when the window cannot honour that, side
  panes give way from the outside in (inspector, then nav, then list) and
  collapse outright if shrinking is not enough. They reopen on their own when
  the window widens, because collapse-under-pressure is derived rather than
  stored.
- **Double-click** a handle to reset that pane to its default width.
- **Keyboard.** Tab reaches every handle. `←`/`→` resize by 16px, `Shift` with
  them by 64px, `Home`/`End` jump to the limits, `Enter` collapses and restores.
  Focus widens the rule to the anchor line's two pixels.
- **`⌘1` / `⌘2` / `⌘3`** (or `Ctrl`) collapse and restore nav, list, and
  inspector. The editor never collapses.
- **Widths persist** across reloads under `anchored.panes.v1`, mirroring the
  storage shape of `src/app/fileRailPreferences.ts`.
- **Navigation.** The Collections / Files toggle switches the nav pane between
  the five collections and the folder tree. Selecting either repopulates the
  list pane; selecting a row in the list pane repopulates the editor and the
  inspector.
- **List density.** The settings gear opens a menu with a two-line (default) or
  one-line excerpt choice. It is a preference, not a per-view control, so it
  lives in Settings rather than the list header, and it persists with the pane
  widths.
- **The `⋯` menu** and the Preview toggle open and close. `Escape` or a click
  outside closes either menu, and opening one closes the other.
- **State switch.** The dashed `prototype` chip in the bottom-right corner is
  not part of the design. It toggles between the vault-open and no-vault states
  and resets pane widths.

### What is faked

- No file I/O and no vault. Note content is a fixed array in the file, using
  real names from `fixtures/dev-vault/` so list-row density is judged against
  realistic titles rather than lorem ipsum.
- The editor is static markup, not CodeMirror. The caret and cursor line are
  decoration.
- Search, sort, trash, and the `⋯` menu items are inert.
- **The inspector is a deliberate placeholder.** It shows backlinks only.
  Outline, frontmatter, and tags are a later decision, but the pane, its
  splitter, and its toggle are real so the layout can be judged now.

### Settled

The questions this prototype existed to answer, and the answers:

1. **List-row density** — title, excerpt, and a `date · folder` line. Two
   excerpt lines by default, with a one-line option in Settings.
2. **Nav pane** — keeps the Collections / Files segmented toggle. The two do
   not merge into a single scroll.
3. **Editor header** — nothing in the `⋯` menu needs promoting. Preview stays
   as the only visible action beside it.

### Still open

- What the inspector holds beyond backlinks. Outline, frontmatter, and tags are
  the candidates; the pane, splitter, and toggle are already real.
