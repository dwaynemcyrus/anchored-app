# PLANS.md — Anchored MVP Build Plan

## Outcome

An installable Tauri 2 macOS application that safely opens a backup copy of
Dwayne's Obsidian vault, supports reliable Markdown writing and navigation,
and preserves link integrity across filename changes.

## Context

- **Why now:** `OVERVIEW.md` was approved on 2026-07-16 and authorizes project
  bootstrap and implementation.
- **Overview requirements covered:** The complete initial Markdown-editor MVP,
  with emphasis on the main journey, local-first storage, rename-safe links,
  macOS 12 support, accessibility, and the seven-day stability criterion.
- **In scope:** Tauri/React scaffold, minimal editor shell, safe vault access,
  Markdown editing, autosave, front matter, stable IDs, wikilinks and aliases,
  filename-triggered link updates, backlinks, search, recent files, packaging,
  tests, and documentation.
- **Out of scope:** Every non-goal in `OVERVIEW.md`, including sync, accounts,
  tasks, habits, Qur'an features, Reader, AI, graph view, mobile, and plugins.
- **Assumptions:** Development begins against synthetic fixtures and a
  disposable vault copy. Numeric performance budgets will be established from
  a representative vault before release.

## Acceptance criteria

- [ ] Tauri 2 development and packaged builds succeed on macOS 12.
- [ ] The app opens and navigates a selected vault with keyboard controls.
- [ ] Create, open, edit, save, save-as, and autosave are safe and observable.
- [ ] Markdown, YAML front matter, attachments, and unsupported syntax remain
  portable and undamaged.
- [ ] Stable IDs, wikilinks, aliases, backlinks, and filename rename updates
  pass unit and disposable-vault integration tests.
- [ ] External modifications and ambiguous links surface recoverable states.
- [ ] The minimal white-on-black interface meets the accessibility target at
  supported window sizes and 200% zoom.
- [ ] Format, lint, type-check, tests, frontend build, Rust checks, and Tauri
  build pass.
- [ ] `CHANGELOG.md` accurately covers every notable change included in a
  release, and its version section matches the approved release version.
- [ ] A representative vault copy completes seven consecutive days of normal
  use without data loss, corruption, or broken supported links.

## Plan

1. [x] **Chunk: Approve product overview**
   - Files: `OVERVIEW.md`, `anchor-stuff.md`
   - Change: Preserve the source brief and approve a complete product overview.
   - Verify: Readiness checklist and Markdown diff checks.
   - Risk/rollback: Documentation only; revert focused commits.
   - Commits: `389a049`, `20f06b8`, `e36644b`, `9729a1f`, `e8f7f4e`

2. [x] **Chunk: Define technical contract**
   - Files: `PROJECT.md`
   - Change: Record stack, boundaries, commands, data safety, active guides,
     delivery, risks, and durable decisions.
   - Verify: Placeholder scan, Markdown diff check, source cross-check.
   - Risk/rollback: Incorrect contract could guide later work; review against
     the approved overview and revert the focused commit if needed.
   - Commit: `e766c4d docs: define project contract`

3. [x] **Chunk: Establish build plan**
   - Files: `PLANS.md`
   - Change: Stage the MVP into independently verifiable, reversible chunks.
   - Verify: Every overview requirement maps to a chunk and acceptance check.
   - Risk/rollback: Planning only; update as discoveries change sequencing.
   - Commit: `61d1b3d docs: plan anchored mvp`

4. [x] **Chunk: Set visual reference**
   - Files: `docs/design/anchored-editor-concept.png`,
     `docs/design/editor-design.md`
   - Change: Generate and inspect the complete primary editor screen, then
     extract exact tokens, typography, layout, states, icons, and copy.
   - Verify: Inspect the image at native size and review it against the approved
     minimal white-on-black requirements.
   - Risk/rollback: Concept could add visual scope; reject anything not required
     by the editor journey and regenerate before code uses it.
   - Commit: `9fe787b docs(design): define editor direction`

5. [x] **Chunk: Scaffold verified app**
   - Files: `package.json`, lockfile, Vite/TypeScript/ESLint/Prettier configs,
     `index.html`, `src/`, `src-tauri/`, `.gitignore`
   - Change: Install Rust, scaffold Tauri 2 with React and TypeScript, configure
     macOS 12, add deterministic quality scripts, and replace demo content with
     the smallest Anchored entry point.
   - Verify: Format, lint, type-check, unit test, frontend build, `cargo check`,
     and Tauri configuration inspection.
   - Risk/rollback: Toolchain or dependency incompatibility; keep the scaffold
     isolated in one commit and pin successful lockfiles.
   - Commit: `1b80cb8 chore(app): scaffold tauri project`

6. [x] **Chunk: Build accessible app shell**
   - Files: `src/app/`, `src/styles/`, component tests
   - Change: Implement the faithful white-on-black editor shell, empty/welcome
     state, file rail, editor region, status bar, and keyboard/focus behavior.
   - Verify: All code gates, Browser/IAB workflow at 1280×800 and 900×600,
     keyboard-only navigation, 200% zoom, reduced motion, screenshot comparison,
     and `view_image` inspection against the concept.
   - Risk/rollback: Visual drift or excess chrome; compare every major region
     and remove nonessential UI.
   - Commit: `d665368 feat(app): add editor shell`

7. [x] **Chunk: Add safe vault boundary**
   - Files: `src-tauri/src/`, `src-tauri/capabilities/`, `src/lib/`, fixtures,
     Rust and TypeScript tests
   - Change: Add folder selection, read-only vault traversal, and safe Markdown
     file opening and closing through narrow, typed commands with canonical
     path, file-size, encoding, and symlink validation.
   - Verify: Permission, traversal, symlink, empty, malformed, and fixture-vault
     tests; Rust and frontend gates; manual selection of a disposable vault.
   - Risk/rollback: Private data exposure or path escape; begin read-only and
     grant no recursive mutation permission in this chunk.
   - Commits: `0919ada feat(files): add vault scan core`,
     `04faa24 feat(files): wire vault selection`,
     `41b8a99 feat(files): read markdown safely`,
     `34f8f78 feat(editor): open markdown files`; manual native dialog smoke
     test passed on the disposable vault.

8. [ ] **Chunk: Add reliable Markdown editing**
   - Files: editor/files features, Rust write commands, CodeMirror setup, tests
   - Change: Create/open/edit/save/save-as/autosave with visible state, atomic
     writes, external-change detection, and recoverable errors.
   - Verify: Empty, large, malformed, concurrent, interrupted, and external-edit
     cases on fixtures; keyboard and visible state checks; all quality gates.
   - Risk/rollback: Data loss is the primary risk; require atomic fixture tests
     and a disposable vault before any manual verification.
   - Commit: `feat(editor): save markdown safely`

9. [ ] **Chunk: Add portable metadata**
   - Files: front-matter parser, stable-ID service, fixtures, tests, docs
   - Change: Parse and preserve YAML, add stable IDs safely, and avoid rewriting
     unsupported or ambiguous documents.
   - Verify: Round-trip, malformed YAML, duplicate ID, Unicode, line-ending,
     and unsupported syntax tests.
   - Risk/rollback: Broad rewrites can damage notes; operate on one explicit
     document at a time and preserve byte-level fixtures where possible.
   - Commit: `feat(notes): add stable identities`

10. [ ] **Chunk: Add links and rename updates**
    - Files: link parser/registry/resolver, backlinks, rename transaction, tests
    - Change: Support wikilinks and aliases, ambiguity handling, backlinks, and
      atomic cross-file reference updates triggered only by filename changes.
    - Verify: Alias, heading, duplicate name, case, Unicode, relative path,
      front-matter title, rollback, and multi-file fixture tests.
    - Risk/rollback: Partial multi-file updates could corrupt references; plan
      the complete change set first, back up affected content, and roll back the
      entire transaction on any failure.
    - Commit: `feat(links): preserve renamed links`

11. [ ] **Chunk: Add retrieval and continuity**
    - Files: search and recent-file features, settings persistence, tests
    - Change: Add global Markdown search, file-local find, recent files, quick
      open, and required keyboard shortcuts without a database.
    - Verify: Large fixture vault, stale recent entries, Unicode, keyboard,
      focus, empty/error states, and performance measurement.
    - Risk/rollback: Unbounded scanning can stall the editor; isolate indexing
      work and establish budgets from the representative fixture.
    - Commit: `feat(search): add vault retrieval`

12. [ ] **Chunk: Package release candidate**
    - Files: Tauri bundle configuration, icons/assets, README, release checklist
    - Change: Produce a macOS 12-compatible local package and document install,
      backup, recovery, supported syntax, and known limitations.
    - Verify: Clean install, all quality gates, packaged main journey, keyboard,
      accessibility, baseline-machine checks, and disposable-vault smoke test.
    - Risk/rollback: Platform or signing limitations; retain local unsigned
      development packaging until signing authority is explicitly provided.
    - Commit: `chore(release): package mvp candidate`

13. [ ] **Chunk: Complete stability observation**
    - Files: `PLANS.md`, issue documentation if defects are found
    - Change: Record seven consecutive days of representative real use and fix
      any observed data, link, accessibility, or performance regressions in
      separate verified commits.
    - Verify: Daily checklist with zero unresolved loss, corruption, or broken
      supported links at completion.
    - Risk/rollback: Primary-vault risk; remain on a backed-up copy until the
      observation succeeds.
    - Commit: `docs: record stability result`

14. [x] **Chunk: Add changelog and version management**
    - Files: `CHANGELOG.md`, `AGENTS.md`, `PROJECT.md`, `README.md`, `PLANS.md`
    - Change: Establish evidence-based changelog maintenance, Semantic
      Versioning authority, release preparation rules, and documentation for
      contributors without changing the current version.
    - Verify: Cross-document policy review, version-source comparison, full
      configured quality gates, and final diff inspection.
    - Risk/rollback: Unsupported history or inconsistent release authority;
      omit untagged historical releases and revert this focused documentation
      commit if the policy is rejected.
    - Commit: current documentation chunk

## Requirements for future large plans

Every future large plan must identify:

- expected notable entries for `[Unreleased]`
- version impact when the plan prepares a release
- changelog verification in release acceptance criteria

## Progress notes

- 2026-07-16: Overview approved; Tauri 2 and filename-triggered reference
  updates confirmed as product requirements.
- 2026-07-16: Repository contains project templates only. Node 22 and npm 11
  are installed; Rust is missing and must be installed before Tauri checks.
- 2026-07-16: Frontend and data guides activated. Hosted deployment guide is
  inactive for the local-only MVP.
- 2026-07-16: Generated and inspected the full primary editor concept at its
  native 1586×992 size. The design uses a true-black open canvas, a single file
  rail, serif document typography, compact system chrome, and one active anchor
  line as its signature.
- 2026-07-16: Installed and repaired the stable Rust 1.97 toolchain with
  rustfmt and Clippy, then generated the official Tauri 2 React/TypeScript
  scaffold. Frontend gates, Rust gates, and the optimized Tauri no-bundle build
  all pass on macOS 12.7.6.
- 2026-07-16: Implemented the accessible editor shell with local note search,
  wikilink navigation, note creation, saved/unsaved state, keyboard save, and a
  responsive file rail. Browser/IAB checks passed at 1586×992, 1280×800,
  900×600, and a 450×600 narrow/200%-zoom equivalent with no console errors or
  page overflow.
- 2026-07-16: Concept comparison fixed rail proportion, cursor-line reach, and
  compact search clipping. The remaining intentional deviations are native
  macOS window chrome outside the web surface and omission of an inert overflow
  menu.
- 2026-07-16: Began the read-only vault boundary with a Rust-owned native folder
  dialog, private selected-root state, bounded recursive Markdown discovery,
  symlink refusal, no absolute-path response, and a typed frontend bridge. The
  UI now replaces seeded filenames with the returned relative Markdown paths.
  A native-dialog smoke test against a disposable vault remains, so chunk 7 is
  still active.
- 2026-07-16: Added changelog and Semantic Versioning governance. No tags or
  reliable release history exist, so the changelog begins at `[Unreleased]`;
  the current `0.1.0` version remains unchanged.
- 2026-07-16: Began the final read-only vault work. The conservative file-open
  contract rejects traversal, symlinks, non-Markdown files, invalid UTF-8, and
  notes larger than 10 MiB; closing a note keeps its vault open.
- 2026-07-16: Implemented visible read-only file opening, exact Markdown text
  display, close, loading, and recoverable error states. Browser checks pass at
  1280×720, 900×600, and 450×600. The local native app launches, but its folder
  dialog still needs a manual disposable-vault smoke test because macOS denied
  automated assistive access to this environment.
- 2026-07-16: Retried the native smoke test after Accessibility access was
  granted. Dwayne confirmed the `anchored` window is visible. macOS automation
  can activate the app but does not expose its embedded web-view controls, so a
  manual click is required to open the native folder dialog; native window
  creation is not a blocker.
- 2026-07-16: The native disposable-vault smoke test passed. The app opened
  `Notes/Smoke Test.md` with exact content, displayed the correct empty-file
  state for root-level `Empty.md`, and closed both notes without altering them.

## Completion

- **Checks run:** Documentation diff checks; native-size visual concept
  inspection; Prettier check; ESLint; TypeScript; Vitest; Vite production
  build; Cargo format, Clippy, and tests; optimized and debug Tauri no-bundle
  builds; Browser/IAB DOM, interaction, console, responsive, screenshot, and
  concept-fidelity checks.
- **Commits:** Overview commits listed in chunk 1; `e766c4d`; `61d1b3d`;
  `9fe787b`; `107858e`; `1b80cb8`.
- **Remaining risks:** Vault data safety, cross-file rename transactions,
  packaged-app verification, and the seven-day observation period.
- **Follow-up:** Commit the verified app shell, then begin the read-only safe
  vault boundary with synthetic fixtures and narrow Tauri permissions.
