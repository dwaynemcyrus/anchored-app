# OVERVIEW.md — Project Overview

This document defines what should be built and why. It is derived from
`anchor-stuff.md`, which remains the preserved source brief. This overview
does not authorize technical setup or implementation.

## Status and sources

- **Status:** draft
- **Owner:** Dwayne Cyrus
- **Last reviewed:** 2026-07-16
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
2. Navigate folders and recent files, search, and follow basic wikilinks to
   find the intended Markdown document.
3. Create or edit a Markdown document with keyboard-first controls, then save
   manually or rely on autosave without losing or corrupting content.
4. Return on later days and continue working with the same portable files,
   recent-file context, front matter, wikilinks, and stable note identities.

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
- Basic wikilink parsing and navigation.
- Stable internal note IDs so renames can eventually preserve relationships.
- Safe file handling: existing Markdown content must not be lost, corrupted,
  or made dependent on Anchored to remain readable.
- Speed and editing reliability take priority over advanced formatting.

## 5. Non-goals

The following are explicitly outside the initial MVP:

- Habits, tasks, projects, and journal-specific workflows.
- Qur'an reader and Qur'an reflection features.
- Reader or read-later workflows, PDFs, EPUBs, highlights, and annotations.
- Cloud sync, browser companion, mobile applications, or collaboration.
- User accounts, payments, browser extensions, and hosted services.
- AI features, knowledge graph, handwriting, OCR, audio-linked notes,
  publishing, and a plugin system.
- Full replication of Obsidian or any other reference application.
- Advanced formatting at the expense of editor speed or reliability.

These ideas remain part of the long-term source brief, not the first release.

## 6. Product behavior

- **User accounts:** No for the initial local, single-user MVP.
- **Stored data:** Yes. Human-authored content remains in the user's existing
  Markdown files with YAML front matter. The application may store local
  recent-file information, settings, indexes, and stable identity metadata,
  but those mechanisms must not replace the Markdown files as the source of
  truth for authored content.
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
- **Required devices or operating systems:** macOS on a 2015 MacBook Pro is
  the stated performance baseline. `[NEEDS DECISION]` Define the oldest macOS
  version that must be supported.
- **Input model:** Keyboard-first but not Vim-first. Vim mode is optional and
  not required for the initial MVP.
- **Visual direction:** Calm, fast, minimal, focused, and lightweight. The
  interface should support writing without visual clutter.
- **Brand/design references:** ZenNotes, Bear, iA Writer, Apple Notes, Apple
  Reminders, Obsidian, Notability, Goodnotes, TickTick, Things 3, and Readwise
  Reader. These are inspiration, not cloning requirements.
- **Accessibility needs:** `[NEEDS DECISION]` Confirm an accessibility target.
  Recommended default: keyboard-complete operation, visible focus, semantic
  controls, sufficient contrast, reduced-motion support, and compatibility
  with macOS assistive technologies, targeting WCAG 2.2 AA where applicable.
- **Content or assets already available:** Dwayne's existing Obsidian vault.
  `[NEEDS DECISION]` Identify the vault features and Markdown conventions that
  must remain compatible in the MVP.

## 8. Constraints and risks

- **Deadline or milestones:** No deadline is stated. The first milestone is
  the installable Markdown editor MVP.
- **Budget or service limits:** No paid or hosted services are required for
  the initial MVP. `[NEEDS DECISION]` Confirm whether there are any development
  budget constraints beyond avoiding unnecessary services.
- **Required technologies:** `[ASSUMPTION]` The source brief recommends Tauri
  2, React, TypeScript, Vite, CodeMirror 6, Rust, and local storage. These are
  recommendations to evaluate during technical planning after approval, not
  approved requirements of this overview.
- **Forbidden technologies:** None explicitly stated. The source brief prefers
  Tauri over Electron for memory use, startup speed, and application size.
- **Privacy, legal, or compliance needs:** Local-first and offline operation;
  authored files remain user-owned. No cloud upload, account, analytics, or
  third-party data transfer is required for the MVP.
- **Security concerns:** The application will access an existing personal
  vault. It must avoid data loss, unintended overwrites, path errors, and
  corruption. Recovery and backup expectations remain to be defined during
  technical planning.
- **Performance constraint:** Core writing and navigation must remain usable
  on a 2015 MacBook Pro.
- **Product risk:** “Basic Obsidian compatibility” is not yet defined. Vault
  plugins, embeds, attachments, aliases, tags, non-Markdown files, and
  Obsidian-specific syntax could materially expand the first-version scope.

## 9. Success and acceptance

The first version is successful when:

- Dwayne can use it daily to write Markdown and navigate the existing
  Obsidian vault.
- Core file operations and autosave are reliable, with no observed content
  loss or corruption during the agreed evaluation period.
- Markdown files remain readable and editable outside Anchored.
- The application feels fast enough for normal writing and navigation on the
  2015 MacBook Pro baseline.
- `[NEEDS DECISION]` Define the daily-use evaluation period and any concrete
  startup, search, open, or save performance thresholds.

It is ready for handoff or release when:

- It can be installed and launched on the supported macOS version.
- Dwayne can open a representative copy of the existing Obsidian vault,
  navigate folders and Markdown files, create and edit a note, use search and
  a basic wikilink, save and autosave, relaunch, and recover the expected
  content without corruption.
- Front matter and existing Markdown remain portable after editing.
- The agreed supported vault conventions behave as documented; unsupported
  Obsidian features are identified without silently damaging their source.
- All acceptance checks are performed on a backup or disposable copy of the
  vault before the application is trusted with the primary vault.

## 10. Product principles that future phases must preserve

- Local-first: cloud sync may be added later but must not become the sole
  source of truth.
- Markdown-first, not Markdown-only: human-authored knowledge belongs in
  Markdown; future structured operational data may use SQLite.
- Universal linking: future linkable objects should be navigable through one
  coherent wikilink and backlink system regardless of storage type.
- Permanent identities: linkable objects should have stable internal IDs so
  visible titles, filenames, and locations can change safely.
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
- `[ASSUMPTION]` Opening an Obsidian vault means selecting and navigating its
  existing folder of Markdown files; it does not yet imply support for every
  Obsidian feature or community plugin.
- `[ASSUMPTION]` Stable note IDs may add or maintain front matter, but must not
  make notes unreadable or unusable in other Markdown tools.
- `[ASSUMPTION]` Technical choices in the source brief are recommendations
  until the overview is approved and technical planning begins.

### Needs a decision

- `[NEEDS DECISION]` Define the supported Obsidian vault conventions and which
  Obsidian-specific features may be ignored, preserved without interpretation,
  or actively supported in the MVP.
- `[NEEDS DECISION]` Define the minimum supported macOS version.
- `[NEEDS DECISION]` Confirm the accessibility target.
- `[NEEDS DECISION]` Define the daily-use evaluation period and concrete
  reliability or performance thresholds.
- `[NEEDS DECISION]` Confirm whether any development budget constraints apply.

## Overview readiness check

Before changing the status to `approved`, confirm:

- [x] The primary user, problem, and outcome are clear.
- [x] The main user journey is understandable.
- [x] First-version requirements and non-goals are separated.
- [x] Accounts, data, payments, and integrations are addressed.
- [ ] Platform, design, and important constraints are fully addressed.
- [ ] Success and acceptance criteria are fully observable.
- [x] Assumptions are visible.
- [ ] No blocking `[NEEDS DECISION]` items remain.
- [ ] The human explicitly approved this overview.
