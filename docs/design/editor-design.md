# Anchored Editor Design Reference

## Active concept

- **Image:** `docs/design/anchored-editor-concept.png`
- **Native size:** 1586 × 992
- **Role:** Complete primary editor-screen reference for the first app-shell
  implementation chunk.

The concept is a build reference, not application UI. All controls and text
must be implemented as native React/HTML, CSS, CodeMirror, and SVG—not as a
background screenshot.

## Design thesis

Anchored should feel like a black sheet of paper held by a precise file rail.
The writing is the visual focus. Interface structure comes from alignment,
typography, and one-pixel rules rather than cards, color, shadows, or ornament.

The single signature motif is the **anchor line**: a two-pixel white vertical
line at the far left of the active file row. It is also the focused-item cue;
it must not be repeated decoratively.

## Token system

### Color

| Token | Value | Use |
|---|---:|---|
| `--color-canvas` | `#000000` | Window, rail, and editor background |
| `--color-text` | `#f5f5f5` | Primary UI and document text |
| `--color-text-muted` | `#8a8a8a` | Metadata and inactive controls |
| `--color-text-subtle` | `#626262` | Secondary status information |
| `--color-rule` | `#242424` | One-pixel structural dividers |
| `--color-row-hover` | `#101010` | Hovered file row |
| `--color-row-active` | `#151515` | Active file row and cursor line |
| `--color-focus` | `#ffffff` | Focus outline and anchor line |
| `--color-danger` | `#ffb4ab` | Errors only; never decoration |

No gradients, glow, glass, shadows, cream, tinted blacks, or accent colors.
System traffic-light colors belong to native macOS chrome and are not reused.

### Typography

- **UI chrome:** `-apple-system`, `BlinkMacSystemFont`, `"SF Pro Text"`,
  `sans-serif`; 13–15px, 400–600 weight, compact line height.
- **Document body:** `ui-serif`, `"New York"`, `Charter`, `Georgia`, serif;
  20px at the reference viewport with 1.65 line height.
- **Document title:** the document serif at 48px/1.1, weight 500.
- **Metadata/code:** `"SFMono-Regular"`, `Consolas`, monospace; 14–16px with
  1.55 line height.
- Text is never used as a substitute for an icon when an icon is required.

### Spacing and geometry

- Base spacing unit: 4px.
- Top bar: 44px excluding native window chrome when Tauri uses an overlay; use
  the native title bar unless a custom title bar is required by the concept.
- File rail: 232–240px at 1280px width and 378px in the native concept.
- Search row: 12px outer margin; 36px control height.
- File rows: 40px, with 12px horizontal padding and 28px nesting increments.
- Editor content: 44px minimum left/right margin at 1280px, with a readable
  line length capped near 780px.
- Bottom status line: 24–28px with one-pixel top rule.
- Radius: 6px only for the search field and compact native controls; no cards.
- Borders: one pixel, structural only.

## Container model

```text
┌──────────────────────────────────────────────────────────┐
│ native title/chrome · vault · save state · search · new │
├───────────────┬──────────────────────────────────────────┤
│ search + new  │ breadcrumb                               │
│               │                                          │
│ folder tree   │ YAML front matter                        │
│ active file ║ │                                          │
│ file          │ document title                           │
│ folders       │ document body + wikilink                 │
│               │                                          │
├───────────────┴──────────────────────────────────────────┤
│ vault / path                          encoding · position │
└──────────────────────────────────────────────────────────┘
```

The file rail and editor are open planes separated by a rule. Do not wrap
either in a card or floating panel. There is no right inspector in the first
shell.

## Visible copy inventory

Only the following seeded copy is allowed in the initial concept-matching
state. Empty and error states may add task-specific instructions later.

- `Anchored`
- `Personal`
- `Search notes`
- `Notes`
- `Writing`
- `Journal`
- `Archive`
- `Leadership.md`
- `Reading Notes.md`
- `Weekly Review.md`
- `Notes / Leadership.md`
- `---`
- `id: 01JZQ7K8P4A6F2M9V3C5T7X1BY`
- `aliases: [Leading Well]`
- `tags: [thinking]`
- `Leadership`
- `A calm system should make connections visible without getting in the way.`
- `Related: [[Reading Notes]]`
- `Saved`
- `Markdown`
- `UTF-8`
- `Ln 12, Col 1`

## Icon inventory

All icons use 1.5px rounded outline strokes, `currentColor`, 16–18px optical
size, and a minimum 28px interactive target. Required metaphors:

- Magnifying glass: search.
- Page plus: create note.
- Folder and disclosure chevron: file tree.
- Page outline: Markdown file.
- Check inside a circle: saved state.
- Down chevron: vault selector.
- Overflow ellipsis: low-priority application actions.

Visible text labels remain wherever an icon alone would be ambiguous. Hover,
focus, pressed, selected, disabled, and error states must be defined in code.

## Component families

- `AppShell`: top bar, workspace, and status line composition only.
- `TitleBar`: app/vault identity and global actions.
- `FileRail`: search, create action, and tree navigation.
- `TreeRow`: folder/file variants plus active, expanded, hover, and focused
  states.
- `EditorSurface`: breadcrumb and editor host.
- `SaveStatus`: saved, unsaved, saving, conflict, and error variants.
- `StatusBar`: vault path, document type, encoding, and cursor position.
- `IconButton`: shared accessible icon control with tooltip and focus ring.

## Interaction and state

- Tab order follows top bar, search/create controls, tree, editor, and status
  actions. The editor is not trapped; standard shortcuts still work.
- The selected file uses the active row plus anchor line. Keyboard focus adds a
  visible one-pixel inset outline without relying on color alone.
- Search and new-note controls are operational in their implementation chunk;
  the first shell uses explicit disabled or demo state rather than inert UI.
- Save state vocabulary is fixed: `Unsaved`, `Saving…`, `Saved`, `Conflict`, or
  a specific error action.
- Motion is limited to 120–160ms opacity/background transitions and is removed
  under `prefers-reduced-motion`.

## Responsive behavior

- At 1280×800 and the concept's native 1586×992 size, show the full rail and
  editor.
- At 900×600, shrink the rail to 220px and document margins to 28px; keep all
  required actions visible.
- At 200% zoom, allow the rail to collapse behind a labeled toggle while the
  editor remains usable; do not hide file access permanently.
- There is no mobile target for the MVP, but the frontend must avoid overflow
  and remain testable in a narrow browser viewport.

## Self-critique and constraints

The concept risks resembling a generic dark editor if the execution depends
only on black and white. The design-specific correction is the disciplined
serif writing surface paired with compact system chrome and the single anchor
line. Do not add a bright accent, texture, extra toolbar, or decorative motion
to manufacture distinctiveness.

The concept also shows duplicate path information in breadcrumb and status
areas. This is intentional at full size: the breadcrumb owns document context;
the status line owns filesystem context. At constrained widths, abbreviate the
status path before hiding the breadcrumb.
