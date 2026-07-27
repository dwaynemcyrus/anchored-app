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
- **Two-finger swipe** over the editor walks the two left panes down and up a
  three-step ladder:

  | Stage | Panes | Swipe left | Swipe right |
  | ----- | ----- | ---------- | ----------- |
  | 2 | nav + list | → 1 | — |
  | 1 | list only | → 0 | → 2 |
  | 0 | neither | — | → 1 |

  So closing goes nav-then-list, and opening goes list-then-nav. The stage is
  read back from the panes rather than stored, so it stays in step with the
  keyboard shortcuts, and it persists with the widths.

  macOS reports the swipe as `wheel` events with a dominant `deltaX` followed
  by a long momentum tail, so the handler latches: one physical swipe moves
  exactly one step no matter how long the tail runs. Vertical scrolling is
  never intercepted.
- **The inspector is a button**, not a gesture — the panel icon in the title
  bar. It is independent of the ladder.
- **Tabs and splits.** The editor area is a tree: every leaf is a tab group.
  Splits nest, resize in both directions by dragging the rule between them,
  reset on double-click, and take arrow keys when focused. A tab holds an index
  rather than a copy, so one document can sit in as many tabs and panes as you
  like.
- **Two rows per group**, following Obsidian's division of labour:
  - the **tab strip** owns the tabs — the tabs themselves, `+`, and a chevron;
  - the **document row** below owns the note — back, forward, the breadcrumb,
    reading view, and the `⋯` menu.
- **The chevron** opens the group menu: Stack tabs, Bookmark _n_ tabs…, Close
  all, then the group's open tabs with a tick on the active one. That tab list
  is also how you reach tabs once the strip has scrolled past them.
- **Back and forward** are real. Each tab keeps its own history, and navigating
  after going back drops the forward entries the way a browser does.
- **Drag a tab** to reorder it within its strip, or drop it on another group's
  strip to move it between panes. A white rule marks where it will land, and a
  group emptied by the move collapses.
- **Right-click a tab** for Close, Close Others, Close Tabs to Right, Pin Tab,
  Split Right, Split Down, Pin as Reference, and Open in Floating Window.
- **Pin as Reference** parks a document in the inspector, where it stays
  through every navigation until unpinned — unlike a pinned tab, which only
  resists being replaced within its own group.
- **Open in Floating Window** is a draggable, resizable panel here. In the
  Tauri build it would be a real second window; `openScratchpadWindow` in
  `src/app/App.tsx` already opens one today.
- **Clicking a note** replaces the active tab; `⌘`- or `⇧`-click opens it in a
  new tab. A dot on a list row means that note is already open somewhere.
- **`⌘T`** new tab, **`⌘W`** close tab, **`⌘\`** split right, **`⇧⌘\`** split
  down, **`⌥⌘→`** / **`⌥⌘←`** cycle tabs.
- **`⌘1` / `⌘2` / `⌘3`** (or `Ctrl`) collapse and restore nav, list, and
  inspector individually. The editor never collapses.
- **Motion.** Opening and closing a pane animates over 140ms; dragging never
  does. Under `prefers-reduced-motion` both are instant.
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
- **Whether the swipe needs a pointer alternative.** WCAG 2.2 SC 2.5.1 asks
  that anything driven by a multipoint gesture also work from a single pointer.
  `⌘1` / `⌘2` cover keyboard, but a pointer-only user currently has no way to
  reach the left panes. Anchored targets WCAG 2.2 AA, so this needs either a
  small toggle in the title bar or an explicit decision to accept the gap.
- **The swipe direction has not been tried on real hardware.** The handler
  assumes a leftward two-finger swipe reports a positive `deltaX`, which is the
  macOS natural-scrolling convention. `SWIPE_DIRECTION` in the source flips it
  if that reads backwards.
