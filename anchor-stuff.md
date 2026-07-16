# Anchored — Product and Development Overview

1. Product Vision

Anchored is a local-first, keyboard-first personal knowledge, writing, reading, reflection, and life-management application.

It combines ideas from:

- ZenNotes
- Bear
- iA Writer
- Apple Notes
- Apple Reminders
- Obsidian
- Notability
- Goodnotes
- TickTick
- Things 3
- Readwise Reader

The goal is not to clone these applications. Anchored should take their strongest ideas and combine them around one coherent system:

A calm personal operating system for thinking, writing, studying, reflecting, learning, and acting.

The application should remain:

- Fast
- Minimal
- Local-first
- Keyboard-first
- Markdown-first
- Portable
- Modular
- Extensible
- Usable offline
- Lightweight enough for a 2015 MacBook Pro

  

2. Core Product Principles

2.1 Local-first

The desktop application should work without an internet connection.

The user should retain ownership of:

- Markdown notes
- Essays
- Journal entries
- Qur’an reflections
- Source files
- PDFs
- EPUBs
- Attachments

Cloud sync may be added later, but it should not become the source of truth.

2.2 Markdown-first, not Markdown-only

Markdown should store human-authored knowledge:

- Notes
- Essays
- Journal entries
- Qur’an reflections
- Book notes
- Permanent notes
- Scripts
- Project documents

Structured operational data should use SQLite:

- Habits
- Tasks
- Projects
- Reading progress
- Highlights
- Bookmarks
- Search indexes
- App state
- User settings

JSON should be reserved for lightweight configuration or import/export formats.

2.3 Universal linking

Wikilinks should work across the entire application.

Examples:

[[Leadership]]

[[Quran:40:25]]

[[Habit:Reading]]

[[Book:Invisible Ink]]

[[Project:Website]]

[[Task:Write Video Script]]

Links should be able to point to:

- Markdown files
- Qur’an verses
- Habits
- Tasks
- Projects
- Books
- Reader documents
- Highlights
- Journal entries
- Other structured objects

The user should not need to know whether the linked object is stored in Markdown, SQLite, JSON, or another file format.

2.4 Permanent object identities

Every object should have a stable internal ID.

Example:

note_01JZQ7K8P4

verse_40_25

habit_01JZQ8V9A2

book_01JZQ93YRK

The visible link remains readable:

[[Leadership]]

Internally, Anchored resolves it to the correct object ID.

This allows titles, filenames, and locations to change without breaking relationships.

2.5 Front matter for structured note metadata

Markdown files should support YAML front matter.

Example:

---

id: note_01JZQ7K8P4

type: quran-reflection

title: Pharaoh's Fear of Losing Power

quran:

  - "40:25"

tags:

  - leadership

  - fear

  - oppression

created: 2026-07-16

updated: 2026-07-16

status: active

---

  

# Pharaoh's Fear of Losing Power

  

[[Quran:40:25]]

  

My reflection…

Front matter should be used for information the application needs to:

- Identify
- Sort
- Filter
- Group
- Automate
- Index

The main body should remain focused on human-readable writing.

2.6 Keyboard-first

Anchored should be usable almost entirely without a mouse.

Core interactions:

⌘P     Quick Open

⌘K     Command Palette

⌘N     New Note

⌘S     Save

⌘⇧F    Search Everything

⌘1     Notes

⌘2     Qur’an

⌘3     Journal

⌘4     Habits

Vim mode should be optional.

The application should be keyboard-first, but not Vim-first.

  

3. Recommended Technical Architecture

Desktop

- Tauri 2
- React
- TypeScript
- Vite
- CodeMirror 6
- Rust for native filesystem and operating-system integration
- SQLite for structured data
- Markdown-it, Marked, or a comparable Markdown parser

Tauri is preferable to Electron because it should use less memory, start faster, and produce a smaller application.

Browser

The same React interface could later run in a browser.

Shared features could include:

- Markdown editing
- Qur’an reading
- Wikilinks
- Backlinks
- Search
- Front matter
- Habits
- Tasks
- Reader
- Reflections

The primary limitation is filesystem access.

The desktop version can work naturally with real folders and Markdown files. A browser version would need one of the following:

- Supabase
- IndexedDB
- Origin Private File System
- A manually selected local folder
- A synchronization layer

The desktop application should remain the primary version. The browser version should initially be a companion.

  

4. Storage Model

|   |   |
|---|---|
|Content|Recommended storage|
|Notes|Markdown|
|Essays|Markdown|
|Journal entries|Markdown|
|Qur’an reflections|Markdown|
|Book notes|Markdown|
|Permanent notes|Markdown|
|Scripts|Markdown|
|Front matter|YAML|
|Qur’an text|SQLite or structured JSON|
|Habits|SQLite|
|Habit entries|SQLite|
|Tasks|SQLite|
|Projects|SQLite|
|Reading sessions|SQLite|
|Reading progress|SQLite|
|Highlights|SQLite|
|Bookmarks|SQLite|
|Search index|SQLite|
|Settings|SQLite or JSON|
|App configuration|JSON|
|PDFs|Local files|
|EPUBs|Local files|
|Saved article content|HTML, Markdown, or JSON|

  

5. Major Application Modules

5.1 Markdown Editor

The Markdown editor is the foundation.

Core features:

- Create files
- Open files
- Edit files
- Save files
- Autosave
- Search
- Replace
- Recent files
- File explorer
- Front matter support
- Wikilink autocomplete
- Tag autocomplete
- Backlinks
- Quick Open
- Command Palette
- Focus mode
- Optional Vim mode

The first version should prioritize speed and reliability over advanced formatting.

5.2 Object Registry and Link Resolver

This is one of the most important architectural systems.

The resolver should understand:

[[Leadership]]

[[Quran:40:25]]

[[Habit:Reading]]

[[Book:Invisible Ink]]

It should:

- Detect object type
- Resolve the visible title to an internal ID
- Open the correct application view
- Generate backlinks
- Preserve links across renames
- Detect ambiguous titles
- Support autocomplete
- Support future object types

This should be treated as a foundational system, not added as an afterthought.

5.3 Qur’an Reader

The Qur’an text should not be stored as thousands of Markdown files.

It should be stored as structured reference data.

Example:

{

  "surah": 40,

  "ayah": 25,

  "arabic": "…",

  "translation": "…",

  "page": 470

}

Core features:

- Navigate by surah
- Navigate by verse
- Search
- Arabic text
- Translation
- Bookmarks
- Reading history
- Copy verse reference
- Open linked notes
- Create reflection
- View backlinks

5.4 Qur’an Reflections

Two reflection types are required.

One reflection per verse

Example file:

/quran-notes/040-025.md

---

id: note_01JZQ7K8P4

type: quran-reflection

quran:

  - "40:25"

---

  

# Quran 40:25

  

[[Quran:40:25]]

  

## Reflection

  

My reflection…

One reflection covering multiple verses

---

id: note_01JZQ91T3A

type: quran-reflection

quran:

  - "40:24-27"

  - "28:4"

---

  

# Moses and Fear

  

[[Quran:40:24-27]]

[[Quran:28:4]]

  

My reflection…

When a verse is open, Anchored should show all Markdown notes that reference it.

5.5 Universal Backlinks

Every linkable object should expose backlinks.

Opening Qur’an 40:25 might show:

Referenced by

  

- Pharaoh's Fear of Losing Power

- Emotional Freeze

- Leadership

- Journal — July 16, 2026

- YouTube Script 12

Opening a habit might show:

Referenced by

  

- Daily Journal

- Reading Reflection

- Weekly Review

Backlinks should work regardless of storage type.

5.6 Journal

Journal entries should be Markdown files.

Possible structure:

/journal/2026/07/2026-07-16.md

Features:

- Daily note
- Templates
- Front matter
- Wikilinks
- Links to habits
- Links to Qur’an verses
- Links to books
- Links to projects
- Calendar navigation

5.7 Habit Tracker

Habits should use SQLite.

Example tables:

habits

  

id

name

unit

target

frequency

created_at

archived_at

habit_entries

  

id

habit_id

date

value

completed

note

created_at

The database should power several interface views:

- Today checklist
- Weekly calendar
- Table view
- Streaks
- Statistics
- Progress charts
- Habit details
- Linked notes

Optional journal reflections can remain in Markdown.

5.8 Tasks and Projects

Tasks and projects should use structured database records.

Potential views:

- Inbox
- Today
- Upcoming
- Someday
- Projects
- Areas
- Completed
- Calendar

Influences:

- Things 3 for clarity
- Apple Reminders for flexibility
- TickTick for recurring tasks and scheduling

Tasks and projects should remain linkable:

[[Task:Write Website Copy]]

[[Project:Anchored MVP]]

5.9 Reader and Read-Later

The Reader module should eventually support:

- Web articles
- PDFs
- EPUBs
- Markdown
- Plain text
- Newsletters
- YouTube transcripts
- Saved email content

Core workflow:

Save

→ Read

→ Highlight

→ Annotate

→ Convert into note

→ Link to knowledge

→ Use in writing or projects

Potential sections:

- Inbox
- Reading
- Archive
- Favourites
- Highlights
- Books
- Documents
- Recently Read
- Review Queue

A saved document record could contain:

id

title

author

source_url

content_path

content_type

status

progress

saved_at

last_read_at

5.10 Highlights and Permanent Notes

Highlights should be structured records.

A highlight can later be converted into a Markdown permanent note.

Example:

---

id: note_01JZQA02MV

type: permanent-note

source: "[[Reader:Why Men Freeze]]"

highlight_id: hl_0192

---

  

# Freeze protects before it imprisons

  

The nervous system initially uses shutdown as protection.

  

Related:

  

[[Emotional Freeze]]

[[Quran:94:5-6]]

[[Project:Freeze Diagnostic]]

5.11 Search

Search should eventually cover:

- Markdown text
- Front matter
- Qur’an verses
- Tasks
- Projects
- Habits
- Books
- Reader documents
- Highlights
- Tags
- Backlinks

The search index can live in SQLite.

5.12 Knowledge Graph

The knowledge graph should come later.

It should visualize relationships between:

- Notes
- Qur’an verses
- Books
- Highlights
- Projects
- Tasks
- Habits
- Concepts
- Journal entries

It should not be part of the initial MVP.

  

6. Suggested Development Phases

Phase 0 — Product Foundation

Before production coding:

- Define product vision
- Define principles
- Define MVP
- Define non-goals
- Define application architecture
- Define storage strategy
- Define object identity strategy
- Define wikilink grammar
- Define front matter conventions
- Define coding standards
- Define Git workflow

Deliverables:

/docs/Vision.md

/docs/Architecture.md

/docs/Roadmap.md

/docs/UI-Principles.md

/docs/Coding-Standards.md

/docs/adr/

Phase 1 — Installable Markdown Editor

Goal:

Open a Markdown file and begin writing immediately.

Features:

- Tauri desktop shell
- React interface
- CodeMirror editor
- Create file
- Open file
- Save
- Save As
- Autosave
- Unsaved indicator
- Recent files
- Basic file explorer
- Find
- Keyboard shortcuts
- macOS application packaging

This should be the first usable release.

Phase 2 — Markdown Knowledge Foundation

Features:

- YAML front matter
- Wikilink parsing
- Wikilink autocomplete
- Create linked note
- Backlinks
- Tags
- Quick Open
- Global search
- Command Palette
- Stable internal IDs
- Object registry
- Rename handling

This phase turns the editor into a knowledge system.

Phase 3 — Qur’an Reader

Features:

- Import provided Qur’an text
- Surah navigation
- Verse navigation
- Verse search
- Arabic and translation display
- Bookmarks
- Reading history
- Copy reference
- Open verse by wikilink

At this stage:

Anchored

├── Notes

└── Qur’an

Phase 4 — Qur’an Reflection System

Features:

- Create reflection for one verse
- Create reflection for a passage
- Automatically generate front matter
- Automatically insert Qur’an wikilinks
- Show linked notes beside verses
- Show backlinks
- Open reflections from the reader
- Search reflections by verse, surah, tag, or date

This phase connects Qur’an study to the knowledge system.

Phase 5 — Journal

Features:

- Daily notes
- Calendar navigation
- Templates
- Links to verses
- Links to notes
- Links to habits
- Links to books
- Links to projects
- Daily review

Phase 6 — Habits

Features:

- Create habits
- Log habit entries
- Daily checklist
- Weekly calendar
- Targets
- Units
- Streaks
- Statistics
- Linked Markdown reflections
- Universal wikilinks

Phase 7 — Tasks and Projects

Features:

- Inbox
- Today
- Upcoming
- Recurring tasks
- Projects
- Areas
- Deadlines
- Notes
- Wikilinks
- Backlinks
- Command Palette actions

Phase 8 — Reader MVP

Start with local content:

- Import Markdown
- Import plain text
- Open PDF
- Import HTML
- Reading progress
- Bookmarks
- Highlights
- Notes
- Archive

Do not begin with browser capture.

Phase 9 — Read-Later Capture

Features:

- Save URL
- Article extraction
- Reader mode
- Browser extension
- Share sheet
- Newsletter ingestion
- YouTube transcript import
- Source metadata
- Duplicate detection

Phase 10 — Learning and Review

Features:

- Highlight review
- Daily resurfacing
- Spaced repetition
- Flashcards
- Review queue
- Reading statistics
- Knowledge resurfacing

Phase 11 — Browser Companion

Features:

- Sign in
- Read Qur’an
- Access synced notes
- Add reflections
- View tasks
- Log habits
- Read saved documents
- Edit synced Markdown

Desktop remains the primary source of truth.

Phase 12 — Sync

Possible synchronization targets:

- Supabase
- Cloudflare
- Git
- iCloud-compatible folder
- Custom sync service

Requirements:

- Conflict handling
- Offline queue
- Version history
- Encryption strategy
- File and database synchronization
- Safe migrations

Phase 13 — Advanced Features

Only after the core system is stable:

- Knowledge graph
- PDF annotations
- EPUB annotations
- Handwriting
- OCR
- Audio-linked notes
- AI assistant
- Publishing
- Collaboration
- Mobile applications
- Plugin system

  

7. Recommended Initial MVP

The initial MVP should contain only:

- Installable macOS application
- Markdown editor
- Open files
- Create files
- Save
- Autosave
- File explorer
- Recent files
- Search
- Keyboard shortcuts
- Front matter parsing
- Basic wikilinks
- Stable note IDs

Do not include in the first MVP:

- Habits
- Tasks
- Reader
- PDFs
- Sync
- AI
- Graph view
- Handwriting
- Browser extension
- Collaboration

The MVP should prove:

1. The app is fast.
2. Markdown files remain portable.
3. The editor is pleasant to use.
4. The application can safely manage files.
5. The linking foundation works.

  

6. Development Agent Structure

The agents should operate from Markdown documents stored in the repository.

Architect Agent

Responsibilities:

- Architecture
- Storage decisions
- Object model
- Interfaces
- ADRs
- Technical constraints

Should not casually write production features.

Product Owner Agent

Responsibilities:

- Protect the current milestone
- Reject scope creep
- Maintain priorities
- Move nonessential ideas to the backlog
- Define what is out of scope

Planner Agent

Responsibilities:

- Convert milestones into epics
- Convert epics into small issues
- Define dependencies
- Write acceptance criteria
- Ensure each issue is independently testable

Builder Agent

Responsibilities:

- Implement one issue at a time
- Avoid unrelated changes
- Write tests
- Keep commits small
- Keep the application runnable

Reviewer Agent

Responsibilities:

- Review architecture
- Review code quality
- Review accessibility
- Review performance
- Check acceptance criteria
- Identify regressions
- Prevent unnecessary complexity

Refactor Agent

Responsibilities:

- Remove duplication
- Simplify abstractions
- Address technical debt
- Improve naming
- Avoid adding new features

Documentation Agent

Responsibilities:

- README
- User documentation
- Architecture documentation
- Changelog
- Migration notes
- Setup instructions

  

9. Repository Documentation Structure

anchored/

  

docs/

    Vision.md

    Architecture.md

    Roadmap.md

    UI-Principles.md

    Coding-Standards.md

    Git-Workflow.md

  

docs/adr/

    ADR-001-Desktop-Framework.md

    ADR-002-Storage-Strategy.md

    ADR-003-Object-IDs.md

    ADR-004-Wikilinks.md

    ADR-005-Front-Matter.md

    ADR-006-Search.md

    ADR-007-Quran-Storage.md

  

specs/

    Markdown-Editor.md

    Wikilinks.md

    Backlinks.md

    Quran-Reader.md

    Quran-Reflections.md

    Journal.md

    Habits.md

    Tasks.md

    Reader.md

  

issues/

    001-Initialize-Tauri.md

    002-Add-CodeMirror.md

    003-Open-Markdown-File.md

    004-Save-Markdown-File.md

    005-Add-Autosave.md

Use:

- /docs for why the application is designed a certain way.
- /specs for what features must do.
- /issues for small implementation tasks.

  

10. Git and Commit Strategy

main should always remain runnable.

Use one branch per focused feature or issue.

Examples:

feature/markdown-editor

feature/autosave

feature/wikilinks

feature/quran-reader

fix/save-race-condition

Use frequent, focused commits.

Good commit messages:

feat(editor): add markdown autosave

  

feat(files): implement recent documents

  

feat(quran): add verse navigation

  

fix(editor): preserve cursor after save

  

refactor(links): extract wikilink resolver

  

docs(architecture): define object registry

  

test(editor): add autosave coverage

Avoid large commits containing unrelated changes.

Each issue should normally produce several commits:

1. Foundation
2. Main behavior
3. Tests
4. Cleanup
5. Documentation

  

6. Suggested Release Milestones

v0.1 — Markdown Editor

v0.2 — Front Matter and Search

v0.3 — Wikilinks and Backlinks

v0.4 — Object Registry

v0.5 — Qur’an Reader

v0.6 — Qur’an Reflections

v0.7 — Journal

v0.8 — Habits

v0.9 — Tasks and Projects

v0.10 — Reader

v0.11 — Highlights and Review

v0.12 — Browser Companion

v1.0 — Stable Integrated Release

  

12. Long-Term Product Model

Anchored should eventually connect the full cycle of knowledge and action:

Capture

    ↓

Read

    ↓

Highlight

    ↓

Reflect

    ↓

Link

    ↓

Develop permanent knowledge

    ↓

Write

    ↓

Create projects and tasks

    ↓

Act

    ↓

Review

The Qur’an should function as a first-class reference system within this network.

A verse can connect to:

- Reflections
- Journal entries
- Permanent notes
- Essays
- Videos
- Habits
- Projects
- Books
- Concepts

A saved article can become:

Article

→ Highlight

→ Permanent Note

→ Essay

→ Video Script

→ Published Work

A habit can connect to:

Habit

→ Daily entry

→ Journal reflection

→ Book

→ Project

→ Goal

The defining feature of Anchored is not the number of modules.

It is that everything can be meaningfully connected without sacrificing file ownership, portability, speed, or simplicity.

  

13. Central Constraint

Anchored should not attempt to replace every application immediately.

Every feature must satisfy at least one of these purposes:

- Improve thinking
- Improve writing
- Improve learning
- Improve reflection
- Improve action
- Improve retrieval
- Improve connection between knowledge and action

Anything else belongs in the backlog.