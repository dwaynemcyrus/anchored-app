# OVERVIEW.md — Project Overview

This document defines what should be built and why. It is derived from
`anchor-stuff.md`, which remains the preserved source brief. This overview
does not authorize technical setup or implementation.

## Status and sources

- **Status:** approved
- **Owner:** Dwayne Cyrus
- **Last reviewed:** 2026-07-19
- **Source documents or links:** `anchor-stuff.md`

## 1. Project

- **Working name:** Anchored
- **One-sentence description:** A calm, local-first, keyboard-first personal
  application for thinking, writing, studying, reflecting, learning, and
  acting.
- **Why should this exist?** To give Dwayne one fast, minimal system that
  connects personal knowledge and action without sacrificing file ownership,
  portability, offline access, or simplicity.
- **Project stage:** idea

## 2. Users and problem

- **Primary user:** Dwayne Cyrus, using Anchored as a personal application.
- **Problem:** Writing, reading, reflection, learning, and life-management
  activities are spread across separate tools. Their useful connections are
  difficult to preserve in one coherent, portable system.
- **Current alternative or workaround:** An existing Obsidian vault is used
  for Markdown writing and knowledge navigation. The source brief also draws
  on workflows from ZenNotes, Bear, iA Writer, Apple Notes, Apple Reminders,
  Notability, Goodnotes, TickTick, Things 3, and Readwise Reader.
- **Outcome needed:** Reliably write Markdown and navigate the existing
  Obsidian vault every day in a fast, pleasant macOS application, while the
  files remain portable and owned by Dwayne.

## 3. Main user journey

1. Launch Anchored on macOS and open the existing Obsidian vault or a Markdown
   file without requiring an internet connection.
2. Navigate folders and recent files, search, and follow wikilinks or aliases
   to find the intended Markdown document.
3. Create or edit a Markdown document with keyboard-first controls, then save
   manually or rely on autosave without losing or corrupting content.
4. Return on later days and continue working with the same portable files,
   recent-file context, front matter, virtual collections, wikilinks, and
   aliases.

## 4. First-version requirements

The first useful release is the installable macOS Markdown editor described
as the initial MVP in the source brief. It must include:

- An installable macOS application that works offline and remains lightweight
  enough for a 2015 MacBook Pro.
- Opening an existing Obsidian vault and navigating its folders and Markdown
  files.
- Creating, opening, editing, saving, and saving-as Markdown files.
- Reliable autosave with a visible unsaved state.
- A basic file explorer and recent-files list.
- Find or search for Markdown content.
- Keyboard shortcuts for core actions.
- YAML front matter parsing without making the Markdown body less portable.
- Wikilink parsing, navigation, and aliases.
- Default virtual collections for Inbox, Workbench, Archive, and Assets, with
  the physical vault tree retained as a secondary Files view.
- A lightweight Scratchpad capture window that creates separate Inbox notes
  and supports wikilink authoring without loading the full editor surface.
- Existing note `id` fields remain preserved as ordinary front matter, but
  note-ID generation, migration, validation, warnings, and runtime dependency
  are deferred until a future database-backed phase.
- Rename-safe links: changing a file name must not break wikilinks, aliases,
  backlinks, or other references to that item.
- References in linked files and areas must remain correct and update when a
  linked file name changes, matching the intended behavior of Obsidian's
  automatic internal-link updates. Changing a `title` value in YAML front
  matter does not trigger those reference updates.
- Safe file handling: existing Markdown content must not be lost, corrupted,
  or made dependent on Anchored to remain readable.
- Speed and editing reliability take priority over advanced formatting.

## 5. Non-goals

The following are explicitly outside the initial MVP:

- Habits, tasks, projects, and journal-specific workflows.
- Qur'an reader and Qur'an reflection features.
- PDF or EPUB reading, read-later workflows, highlights, and annotations;
  non-Markdown files are listed only as Assets in this phase.
- Cloud sync, browser companion, mobile applications, or collaboration.
- User accounts, payments, browser extensions, and hosted services.
- AI features, knowledge graph, handwriting, OCR, audio-linked notes,
  publishing, and a plugin system.
- Full replication of Obsidian or any other reference application.
- Advanced formatting at the expense of editor speed or reliability.
- Database-backed object identities, Supabase integration, global macOS
  Scratchpad shortcuts, and copying imported assets into a physical asset
  folder.

These ideas remain part of the long-term source brief, not the first release.

## 6. Product behavior

- **User accounts:** No for the initial local, single-user MVP.
- **Stored data:** Yes. Human-authored content remains in the user's existing
  Markdown files with YAML front matter. The application may store local
  recent-file information, settings, and rebuildable indexes, but those
  mechanisms must not replace the Markdown files as the source of truth for
  authored content.
- **Payments:** No.
- **External services:** None for the initial MVP.
- **Notifications or email:** None.
- **Administrative tools:** None.
- **Offline behavior:** All first-version writing and navigation workflows
  must work without an internet connection.
- **File ownership:** Dwayne retains direct ownership of Markdown files and
  can read or edit them with other compatible tools.

## 7. Platform and design

- **Product type:** Native desktop application; a browser companion is a
  later possibility and not part of the initial MVP.
- **Required devices or operating systems:** macOS 12 Monterey or later. A
  2015 MacBook Pro is the stated performance baseline.
- **Input model:** Keyboard-first but not Vim-first. Vim mode is optional and
  not required for the initial MVP.
- **Visual direction:** Calm, fast, minimal, focused, and lightweight, using
  white text on a black background. The interface should support writing
  without visual clutter or unnecessary decoration.
- **Brand/design references:** ZenNotes, Bear, iA Writer, Apple Notes, Apple
  Reminders, Obsidian, Notability, Goodnotes, TickTick, Things 3, and Readwise
  Reader. These are inspiration, not cloning requirements.
- **Accessibility needs:** Keyboard-complete operation, visible focus,
  semantic controls, sufficient contrast, reduced-motion support, and
  compatibility with macOS assistive technologies, targeting WCAG 2.2 AA
  where applicable.
- **Content or assets already available:** Dwayne's existing Obsidian vault.
  MVP compatibility covers folders, Markdown files, YAML front matter,
  wikilinks, wikilink aliases, tags, and linked attachments. Obsidian plugins,
  Canvas, Dataview, and other Obsidian-specific features are preserved without
  interpretation and are not active MVP features.

## 8. Constraints and risks

- **Deadline or milestones:** No deadline is stated. The first milestone is
  the installable Markdown editor MVP.
- **Budget or service limits:** No development-budget constraint is stated.
  No paid or hosted services are required for the initial MVP, and unnecessary
  services should be avoided.
- **Required technologies:** Tauri 2 is the required native desktop wrapper.
  `[ASSUMPTION]` The source brief recommends React, TypeScript, Vite,
  CodeMirror 6, Rust for native integration, and local storage. Those remaining
  choices must be evaluated during technical planning.
- **Forbidden technologies:** Electron must not replace Tauri 2 as the desktop
  wrapper. The source brief selects Tauri for lower memory use, faster startup,
  and a smaller application.
- **Privacy, legal, or compliance needs:** Local-first and offline operation;
  authored files remain user-owned. No cloud upload, account, analytics, or
  third-party data transfer is required for the MVP.
- **Security concerns:** The application will access an existing personal
  vault. It must avoid data loss, unintended overwrites, path errors, and
  corruption. Recovery and backup expectations remain to be defined during
  technical planning.
- **Performance constraint:** Core writing and navigation must remain usable
  on a 2015 MacBook Pro.
- **Product risk:** Rename-safe path, alias, and link updates must work across
  file names, backlinks, and source references without corrupting the vault.
  A front-matter title change must not cause an unintended reference rewrite.
  Obsidian plugins, Canvas, Dataview, and other unsupported syntax must be
  preserved even when Anchored does not interpret them.

## 9. Success and acceptance

The first version is successful when:

- Dwayne can use it daily to write Markdown and navigate the existing
  Obsidian vault.
- Core file operations, autosave, collection classification, aliases, and link
  updates remain completely stable through seven consecutive days of normal
  use, with no observed content loss, corruption, or broken supported links.
- Markdown files remain readable and editable outside Anchored.
- The application feels fast enough for normal writing and navigation on the
  2015 MacBook Pro baseline.

It is ready for handoff or release when:

- It can be installed and launched on the supported macOS version.
- Dwayne can open a representative copy of the existing Obsidian vault,
  navigate folders and Markdown files, create and edit a note, use search,
  wikilinks, and aliases, save and autosave, relaunch, and recover the expected
  content without corruption.
- Renaming a linked file does not break link resolution, aliases, backlinks,
  or references in linked files and areas; affected references update as
  intended. Changing only its YAML front-matter `title` does not rewrite those
  references.
- Front matter and existing Markdown remain portable after editing.
- Folders, Markdown, YAML front matter, wikilinks, aliases, tags, and linked
  attachments behave as documented. Plugins, Canvas, Dataview, and other
  unsupported Obsidian features remain intact without being interpreted.
- All foundational link and update behavior remains completely stable through
  seven consecutive days of Dwayne's normal use.
- All acceptance checks are performed on a backup or disposable copy of the
  vault before the application is trusted with the primary vault.

## 10. Product principles that future phases must preserve

- Local-first: cloud sync may be added later but must not become the sole
  source of truth.
- Markdown-first, not Markdown-only: human-authored knowledge belongs in
  Markdown; future structured operational data may use SQLite.
- Universal linking: future linkable objects should be navigable through one
  coherent wikilink and backlink system regardless of storage type.
- Permanent identities: a future database-backed phase may assign stable UIDs
  to linkable objects through a reviewed migration. The current Markdown MVP
  must not depend on, generate, validate, or repair note IDs. Filename changes
  update affected references; front-matter title changes do not.
- Portable and modular: future modules must not sacrifice ownership, speed,
  offline use, or simplicity.
- Purposeful scope: a feature belongs only if it improves thinking, writing,
  learning, reflection, action, retrieval, or the connection between
  knowledge and action.

## 11. Assumptions and open decisions

### Assumptions

- `[ASSUMPTION]` The project is currently at the idea stage because no working
  product or prototype is identified in the source brief.
- `[ASSUMPTION]` The initial MVP is a local, single-user application with no
  account because it is for Dwayne personally and the source brief places
  accounts in a later browser-companion phase.
- Existing note `id` fields are inert user metadata in the current phase and
  remain untouched unless the user edits them directly.
- `[ASSUMPTION]` The source brief's technical choices other than the required
  Tauri 2 desktop wrapper remain recommendations until technical planning.

### Needs a decision

- None.

## Overview readiness check

Before changing the status to `approved`, confirm:

- [x] The primary user, problem, and outcome are clear.
- [x] The main user journey is understandable.
- [x] First-version requirements and non-goals are separated.
- [x] Accounts, data, payments, and integrations are addressed.
- [x] Platform, design, and important constraints are fully addressed.
- [x] Success and acceptance criteria are fully observable.
- [x] Assumptions are visible.
- [x] No blocking `[NEEDS DECISION]` items remain.
- [x] The human explicitly approved this overview on 2026-07-16.
