# UI gap analysis against the reference applications

A running reference list of interface capabilities Anchored does not have,
drawn from the applications named in `OVERVIEW.md` §7: ZenNotes, Bear, iA
Writer, Apple Notes, Apple Reminders, Obsidian, Notability, Goodnotes,
TickTick, Things 3, and Readwise Reader.

This is a menu, not a plan. Nothing here is committed work. Each entry says
which application it comes from, what it buys, and whether `OVERVIEW.md`
already places it inside or outside the first release.

- **Status:** reference
- **Last reviewed:** 2026-07-27
- **Measured against:** `docs/prototypes/four-pane-shell.html`, `src/app/App.tsx`

## How to read the scope column

| Mark | Meaning |
| --- | --- |
| **MVP** | Serves a first-version requirement in `OVERVIEW.md` §4 |
| **Near** | Not required for the MVP, but no stated non-goal blocks it |
| **Later** | Named as a non-goal in `OVERVIEW.md` §5 — do not re-propose without changing the overview first |

## A. Workspace: tabs, splits, and windows

The largest single gap. Anchored holds exactly one open document
(`activeDocument` in `src/app/App.tsx`), and closing it empties the editor.
Every reference application that is used for sustained work lets you hold more
than one document at a time.

| # | Capability | From | Why it matters | Scope |
| --- | --- | --- | --- | --- |
| A1 | **Tabs** — several documents open in one pane, reorderable, with a new-tab affordance | Obsidian | Following a wikilink currently costs you the note you were reading. Tabs are what make link-following non-destructive. | **MVP** |
| A2 | **Splits** — divide the editor into panes, horizontally or vertically, each with its own tab strip, each resizable | Obsidian | Writing while reading a source is the core two-document task. Today it is impossible. | **MVP** |
| A3 | **The same document in more than one tab or split**, with no imposed limit | Obsidian | Comparing two parts of one long note; editing the top while reading the bottom. Both views must stay in sync on every keystroke. | **Near** |
| A4 | **Tab overflow list** — a chevron listing open tabs when the strip runs out of width | Obsidian | Without it, a wide session hides its own tabs. | **Near** |
| A5 | **Pop-out window** — drag a tab out into its own OS window | Obsidian | Multi-monitor work, and keeping one reference visible over other applications. Tauri multi-window plumbing already exists: `openScratchpadWindow` in `src/app/App.tsx` opens a second window today. | **Near** |
| A6 | **Pinned tab** — resists being replaced by a navigation and survives close-others | Obsidian | The cheap version of "keep this open". | **Near** |
| A7 | **Per-pane back / forward history** | Obsidian, Bear | After following three wikilinks there is no way back. `recentDocuments.ts` records recency but nothing exposes a history stack. | **MVP** |
| A8 | **Linked panes** — one pane follows the other's scroll or selection | Obsidian | Source-and-translation, outline-and-body. Narrow but powerful. | **Near** |
| A9 | **Stacked tabs** — the card-deck tab mode | Obsidian | Handsome, rarely load-bearing. Recommend skipping. | **Near** |

## B. Keeping a document at hand

| # | Capability | From | Why it matters | Scope |
| --- | --- | --- | --- | --- |
| B1 | **Pin as reference** — a document you are consulting stays reachable no matter where you navigate | ZenNotes | Distinct from a pinned tab (A6). A pinned tab is a tab that will not close; a pinned *reference* is a document promoted above the workspace entirely, so it survives closing every tab and switching collections. The natural home is the inspector or a dedicated strip. | **Near** |
| B2 | **Pinned notes section at the top of the list pane** | Bear | Bear's sidebar carries a first-class `Pinned` item. Cheap, and it makes the list pane feel owned rather than generated. | **Near** |

## C. List pane

| # | Capability | From | Why it matters | Scope |
| --- | --- | --- | --- | --- |
| C1 | **Real sort control** — modified, created, title, manual | Bear, Things 3 | The prototype's `Recent ⌄` is inert. `WorkbenchSort` in `src/app/fileRailPreferences.ts` already models six orders but only applies to the Workbench collection. Generalising it is mostly wiring. | **MVP** |
| C2 | **Date grouping** — Today / Yesterday / Previous 7 days headers | Bear, Apple Notes | Turns a long flat list into something scannable without a search. | **Near** |
| C3 | **Multi-select with batch archive, move, trash** | Apple Notes, Things 3 | Every bulk operation is currently one note at a time. | **Near** |
| C4 | **Row swipe actions** | Apple Notes, Things 3 | Trackpad-native archive and trash. Note the same SC 2.5.1 caveat as the pane swipe. | **Near** |

## D. Editor

| # | Capability | From | Why it matters | Scope |
| --- | --- | --- | --- | --- |
| D1 | **Focus mode and typewriter scrolling** — dim everything but the current sentence or paragraph, hold the caret line vertically centred | iA Writer | The single most on-brand missing feature. `OVERVIEW.md` §7 asks for "calm, fast, minimal, focused"; this is the feature that word describes. | **Near** |
| D2 | **Line numbers in the gutter** | Obsidian | Cheap in CodeMirror 6 — it is a built-in extension. | **Near** |
| D3 | **Formatting toolbar** | Bear | A docked bar for bold, italic, headings, lists, links, tables. Tension with keyboard-first minimalism; worth a deliberate yes or no rather than drift. | **Near** |
| D4 | **Word count, character count, reading time** | Obsidian | The status bar carries vault name, path, encoding, timestamps, and Ln/Col, but no measure of the writing itself. | **Near** |
| D5 | **Frontmatter / properties editor** — typed fields with remembered keys and values, not raw YAML | Obsidian | Anchored manages frontmatter as a core contract (`id`, `aliases`, `tags`, `status`, `noteType`). Today it is hand-edited text with a linter; only `lintFrontmatter` protects it. | **Near** |
| D6 | **Templates** — new notes from a stored skeleton | Obsidian, Bear | `.anchored/template/` is already created when a vault is opened (see the 0.1.5-alpha changelog entry) but nothing reads it. | **Near** |
| D7 | **Outline / table of contents** | Obsidian, Bear | Navigation inside a long note. Best home is the inspector. | **Near** |

## E. Inspector contents

The inspector pane exists in the prototype as a backlinks placeholder. Candidates,
roughly in order of value:

1. **Outline** (D7) — the most-used right-pane panel in Obsidian.
2. **Properties / frontmatter** (D5).
3. **Tags** on the current note, clickable to filter the list pane.
4. **Unlinked mentions** — other notes that name this one without linking. Obsidian.
5. **Spaced-repetition / review queue** — visible in the Obsidian screenshot. A plugin there, and adjacent to `OVERVIEW.md`'s "learning" purpose.
6. **Local graph** — **Later**; `OVERVIEW.md` §5 names the knowledge graph a non-goal.

Stacking several panels in one inspector, as Obsidian does, is itself a design
decision: it argues for the inspector holding a small panel switcher rather
than one fixed thing.

## F. Ruled out by the overview

Listed so they are not re-proposed. Each is a stated non-goal in
`OVERVIEW.md` §5, and changing that means changing the overview first.

- Tasks, projects, habits, Today / Upcoming / Anytime / Someday, Logbook — Things 3, TickTick, Apple Reminders. The database-first architecture leaves room; this phase does not build them.
- Qur'an reader and reflection features.
- PDF and EPUB reading, read-later, highlights, annotations — Readwise Reader. Non-Markdown files are Assets only in this phase.
- Handwriting, OCR, audio-linked notes — Notability, Goodnotes.
- Knowledge graph, AI features, publishing, plugin system.
- Cloud sync, browser companion, mobile, collaboration.

## Recommended order

Judged on what unblocks daily use against what it costs:

1. **A1 Tabs** and **A2 Splits** — the same architectural change. One open
   document becomes a tree of panes, each holding an ordered tab list with one
   active tab. Everything else in section A hangs off that model, so it is
   worth getting right once rather than retrofitting.
2. **A7 Back / forward** — nearly free once panes own their own state, and it
   removes a real daily frustration.
3. **C1 Sort** — small, and the data model already exists.
4. **B1 Pin as reference** and **A5 Pop-out window** — both build on the tab
   model; neither makes sense before it.
5. **D1 Focus mode** — the most distinctive thing on this list, and
   independent of everything above.

Sections C to E are otherwise independent and can be taken in any order.
