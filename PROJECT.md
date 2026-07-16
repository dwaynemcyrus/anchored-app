# PROJECT.md — Project Contract

This contract translates the approved product overview into technical rules.
Product scope remains governed by `OVERVIEW.md`.

## Source and status

- **Overview:** `OVERVIEW.md`
- **Overview status:** approved on 2026-07-16
- **Additional source documents:** `anchor-stuff.md`
- **Contract last reviewed:** 2026-07-16
- **Blocking decisions:** none

## Identity

- **Name:** Anchored
- **One-sentence purpose:** A fast, local-first macOS Markdown editor that can
  safely navigate Dwayne Cyrus's existing Obsidian vault and preserve links
  across filename changes.
- **Stage:** MVP
- **Owner:** Dwayne Cyrus

## Users and outcomes

- **Primary user:** Dwayne Cyrus
- **Problem:** Personal writing and connected knowledge are fragmented across
  tools, while the existing Obsidian vault needs a calmer, lighter interface
  without losing portability or link integrity.
- **Successful outcome:** Seven consecutive days of stable Markdown writing
  and vault navigation with no data loss, corruption, or broken supported
  links after filename changes.
- **Primary user journey:** Open a local vault, navigate or search its Markdown
  files, follow wikilinks or aliases, edit with keyboard-first controls, and
  save or autosave safely.

## Scope

### Goals

- Ship an installable, offline macOS 12+ application using Tauri 2.
- Open and navigate a selected Obsidian vault without taking ownership away
  from the filesystem.
- Create, open, edit, save, save-as, and autosave Markdown files safely.
- Parse YAML front matter and preserve unsupported content verbatim.
- Resolve wikilinks and aliases through stable item IDs.
- Update affected references when a filename changes; changing only the YAML
  `title` must not rewrite references.
- Provide file exploration, recent files, search, visible unsaved state, and
  keyboard-first core actions.
- Remain responsive on a 2015 MacBook Pro.

### Non-goals

- Accounts, cloud sync, analytics, payments, or hosted services.
- Habits, tasks, projects, journal workflows, Qur'an features, or Reader.
- PDFs, EPUBs, AI, graph view, handwriting, OCR, collaboration, publishing,
  mobile apps, browser extensions, or plugins.
- Executing or interpreting Obsidian plugins, Canvas, Dataview, or other
  unsupported Obsidian-specific features.
- Full Obsidian feature parity.

### Acceptance criteria

- A signed or local development build launches on macOS 12 or later.
- A representative backup copy of the existing vault can be selected and
  navigated by folder, recent file, search, wikilink, and alias.
- Markdown files can be created and edited; manual save, save-as, and autosave
  preserve exact user content and visibly report unsaved state.
- Every supported linkable item has a stable ID without making its Markdown
  unreadable in other tools.
- Renaming a file updates affected supported references and backlinks without
  changing references merely because YAML `title` changed.
- Front matter, tags, linked attachments, and unsupported Obsidian syntax are
  preserved without silent damage.
- All configured checks pass, and the core workflow remains stable for seven
  consecutive days on the target vault copy before primary-vault use.

## Stack

- **Languages:** TypeScript 5 for the interface; Rust stable for native logic
- **Desktop runtime:** Tauri 2
- **Frontend:** React 19 with Vite 7
- **Editor:** CodeMirror 6
- **Package manager:** npm, using the committed lockfile
- **Persistence:** Markdown and attachments in the selected vault; local JSON
  or platform preferences only for lightweight app settings and recent files
- **Database:** none for the initial Markdown-editor MVP
- **Hosting:** local desktop application only
- **External services:** none

Dependencies must have a clear MVP purpose. Paid services require human
approval. The generated lockfiles currently resolve React 19.2, Vite 7.3,
Tauri CLI 2.11, Tauri 2.11, TypeScript 5.8, and Rust 1.97. Update this contract
when a major-version change is intentionally adopted.

## Repository structure

```text
.
├── src/                    React interface
│   ├── app/                App shell and composition
│   ├── features/           Files, editor, links, search, and settings
│   ├── lib/                Typed Tauri bridge and shared utilities
│   └── styles/             Global styles and design tokens
├── src-tauri/              Tauri configuration and trusted Rust boundary
│   ├── capabilities/       Explicit desktop permissions
│   └── src/                Commands and filesystem operations
├── tests/                  Cross-feature and integration tests
├── docs/design/            Approved visual concepts and design notes
├── docs/ai/                Optional project guides
├── OVERVIEW.md             Approved product intent
├── PROJECT.md              This technical contract
└── PLANS.md                Active staged build plan
```

Feature folders own their UI, state, types, and targeted tests. Shared code
moves into `lib` only after it has more than one genuine consumer.

## Commands

These scripts must exist in `package.json` after the scaffold chunk.

| Purpose | Command |
|---|---|
| Install | `npm ci` |
| Develop frontend | `npm run dev` |
| Develop desktop app | `npm run tauri dev` |
| Format/check | `npm run format:check` |
| Lint | `npm run lint` |
| Type-check | `npm run typecheck` |
| Test | `npm test` |
| Build frontend | `npm run build` |
| Build desktop app | `npm run tauri build` |

## Architecture and boundaries

- **Entry points:** `src/main.tsx` for React and `src-tauri/src/lib.rs` for
  Tauri.
- **Main modules:** app shell, vault/files, Markdown editor, link registry and
  resolver, search, settings/recent files, and the typed Tauri bridge.
- **Source of truth:** Files in the user-selected vault are authoritative for
  authored content. Anchored metadata must remain additive and portable.
- **Trusted boundary:** React never receives unrestricted filesystem access.
  Rust commands validate and canonicalize paths, constrain operations to the
  selected vault, and perform filesystem mutations.
- **Public contracts:** Typed Tauri command request/response types and the
  documented front-matter/link grammar.
- **Patterns to follow:** Small feature modules; explicit types at boundaries;
  atomic file writes; dependency injection for filesystem tests; immutable
  state updates; direct imports; accessible native controls; narrow Tauri
  capabilities.
- **Patterns to avoid:** Direct filesystem access from arbitrary components;
  path strings trusted from the UI; broad Tauri permissions; destructive
  rewrites; hidden format conversion; giant components; barrel imports; and
  abstractions created for a single use.

## Data and security

- **Stored data:** User Markdown, YAML front matter, attachments, lightweight
  local settings, recent-file references, and derived indexes when introduced.
- **Sensitive data:** The personal vault may contain private writing and
  attachments. Its content must not be logged, uploaded, or exposed to third
  parties.
- **Authentication/authorization:** none; local single-user application.
- **Validation boundaries:** Canonicalize every path in Rust; reject traversal,
  symlink escapes, unsupported mutation targets, invalid filenames, and writes
  outside the selected vault. Validate front matter and command payloads before
  mutation.
- **Write safety:** Write to a sibling temporary file, flush where supported,
  and atomically replace the destination. Preserve original content when a
  parse or rewrite cannot be proven safe.
- **Concurrency:** Detect external modification before overwriting and surface
  a recoverable conflict instead of silently choosing a version.
- **Backup/migration approach:** Develop and verify only against a disposable
  or backed-up vault copy. Stable-ID insertion and bulk link rewrites require
  preview, recoverability, targeted tests, and a separate verified plan chunk.
- **Privacy or compliance needs:** Local-first and offline; no telemetry,
  analytics, cloud upload, or third-party data transfer in the MVP.

## Product and design rules

- **Supported platform:** macOS 12 Monterey and later; 2015 MacBook Pro is the
  performance baseline.
- **Viewport:** Resizable desktop window, initially optimized for 1280×800 and
  still usable at 900×600 and 200% zoom.
- **Accessibility target:** WCAG 2.2 AA where applicable, keyboard-complete
  operation, visible focus, reduced-motion support, semantic controls, and
  compatibility with macOS assistive technologies.
- **Design system location:** `src/styles/tokens.css`, documented against the
  approved concept in `docs/design/`.
- **Visual direction:** True black background, white primary text, restrained
  grays, no decorative gradients, and minimal chrome. Precision in typography,
  spacing, and focus states carries the design.
- **Performance target:** Normal writing, file opening, and navigation must
  feel immediate on the baseline machine. Establish numeric budgets from a
  representative vault before release rather than inventing them now.
- **Critical product rules:** Keyboard-first but not Vim-first; Markdown stays
  portable; filename changes update references; front-matter title changes do
  not; unsupported syntax is preserved; no operation silently loses content.

## Environments and delivery

- **Environments:** local development and local packaged builds
- **Environment variables:** none required for the MVP
- **CI provider:** none initially; add only when a remote repository and CI
  requirement are confirmed
- **Deployment method:** local Tauri `.app`/installer build for macOS
- **Rollback method:** revert code through focused Git commits or reinstall a
  previous packaged build; restore user data only from an explicit vault
  backup, never from an assumed application cache

## Versioning and changelog

- **Current version:** `0.1.0`
- **Authoritative version source:** `src-tauri/tauri.conf.json`; the root npm
  manifest and lockfile plus the Rust manifest and lockfile mirror the app
  version and must remain consistent during a release.
- **Version policy:** Semantic Versioning
- **Changelog:** `CHANGELOG.md` at the repository root
- **Patch and minor authority:** Codex may select an appropriate patch or
  minor version only while preparing a release explicitly approved by the
  human.
- **Major authority:** `1.0.0` and every later major-version increase require
  explicit human approval. Codex must never increase the major version
  independently.
- **Release authorization:** Version preparation does not authorize a Git tag,
  push, deployment, published package, or hosted release. The human must
  authorize each action separately.

## Active guides

- `docs/ai/frontend.md`
- `docs/ai/data.md`

`docs/ai/deployment.md` is inactive because the MVP has no hosted environment.

## Known risks and constraints

- Full Xcode is not installed. The Xcode Command Line Tools satisfy Tauri's
  documented desktop-only prerequisite; iOS development remains unavailable.
- The target vault can contain symlinks, unsupported syntax, external edits,
  duplicate names, ambiguous aliases, and malformed front matter.
- Stable-ID insertion and cross-file rename updates are high-risk data changes;
  they must never be tested first against the primary vault.
- macOS 12 and the 2015 hardware baseline constrain dependency and WebKit API
  choices.
- Seven-day stability cannot be completed within a single implementation
  session; release readiness requires the later real-use observation period.

## Decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-07-16 | Use Tauri 2, not Electron | Required by the approved overview for a lightweight native wrapper |
| 2026-07-16 | Use React, TypeScript, and Vite | Matches the source brief, Tauri's supported templates, and the modular UI needs |
| 2026-07-16 | Use CodeMirror 6 | Purpose-built, extensible editor with a smaller scope than building editing behavior directly |
| 2026-07-16 | Use npm and commit its lockfile | Node and npm are installed; one package manager reduces setup ambiguity |
| 2026-07-16 | Keep the initial MVP database-free | Authored Markdown is the source of truth and structured operational modules are out of scope |
| 2026-07-16 | Put filesystem mutation behind Rust commands | Limits permissions and centralizes path and write-safety validation |
| 2026-07-16 | Use stable IDs with filename-triggered link updates | Preserves identity while matching the approved Obsidian-style rename behavior |
| 2026-07-16 | Autosave after one second of idle time | Confirmed by Dwayne; Command-S remains an immediate save |
| 2026-07-16 | Preserve local edits on external change | Confirmed by Dwayne; present a recoverable conflict instead of auto-reloading |
| 2026-07-16 | Use a minimal white-on-black design | Explicit product requirement; reduces visual chrome and prioritizes writing |
| 2026-07-16 | Use Tauri configuration as the app version source | The desktop bundle configuration defines the application version; npm and Rust manifests mirror it |
