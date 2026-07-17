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

8. [x] **Chunk: Add reliable Markdown editing**
   - Files: editor/files features, Rust write commands, CodeMirror setup, tests
   - Change: Create/open/edit/save/save-as/autosave with visible state, atomic
     writes, external-change detection, and recoverable errors. Autosave runs
     after one second of idle time; Command-S saves immediately. Preserve local
     edits and show a conflict when the file changes externally.
   - Verify: Empty, large, malformed, concurrent, interrupted, and external-edit
     cases on fixtures; keyboard and visible state checks; all quality gates.
   - Risk/rollback: Data loss is the primary risk; require atomic fixture tests
     and a disposable vault before any manual verification.
   - Commits: `4141080 feat(files): save markdown atomically`,
     `afbb539 feat(editor): add markdown editing`,
     `23ede3b feat(files): create notes safely`,
     `2795bb8 feat(editor): add safe save as`

9. [x] **Chunk: Add portable metadata**
   - Files: front-matter parser, stable-ID service, fixtures, tests, docs
   - Change: Parse and preserve YAML, add stable IDs safely, and avoid rewriting
     unsupported or ambiguous documents.
   - Verify: Round-trip, malformed YAML, duplicate ID, Unicode, line-ending,
     and unsupported syntax tests.
   - Risk/rollback: Broad rewrites can damage notes; require an explicit
     reviewed batch, recheck each file before an atomic write, and preserve
     byte-level fixtures where possible.
   - Commits: `3e13379 docs(notes): define identity policy`,
     `b61e41a feat(notes): add identity parser`,
     `79d44ad feat(notes): identify new files`,
     `53308ab feat(editor): adopt generated identity`,
     `f295236 feat(notes): baseline vault identities`,
     `aa6a3b1 feat(app): report identity indexing`,
     `cd27166 feat(notes): refresh Finder additions`,
     `28727ee feat(notes): preview ID migration`,
     `4fd333b feat(notes): wire ID migration`,
     `cc8f863 feat(app): review ID migration`, and
     `d173413 fix(editor): show canonical sample ID`

10. [x] **Chunk: Add links and rename updates**
    - Files: link parser/registry/resolver, backlinks, rename transaction, tests
    - Change: Support wikilinks and aliases, ambiguity handling, backlinks, and
      atomic cross-file reference updates triggered only by filename changes.
    - Verify: Alias, heading, duplicate name, case, Unicode, relative path,
      front-matter title, rollback, and multi-file fixture tests.
    - Risk/rollback: Partial multi-file updates could corrupt references; plan
      the complete change set first, back up affected content, and roll back the
      entire transaction on any failure.
    - Commits: `f7b9ad2 feat(links): plan rename updates`,
      `065ca81 feat(files): transact note renames`,
      `57be496 feat(files): recover rename crashes`, and
      `41e5a16 feat(app): rename identified notes`; follow-up verification and
      usability fixes: `27f095e`, `8700583`, `6f64203`, `ba79d3b`, and
      `200afc1`

10B. [x] **Chunk: Complete wikilink authoring**
    - Files: link candidate and recent-activity modules, CodeMirror editor,
      app composition, styles, tests, changelog
    - Change: Generate the shortest unique Obsidian-compatible target by
      default, offer filename and alias completion after `[[`, surface known
      unresolved placeholders without creating files immediately, and rank an
      empty picker by unified opened, edited, created, and first-seen activity.
      The same candidate and recency contracts will support Quick Open in
      chunk 11. Existing links are not bulk-normalized.
    - Verify: Unique and duplicate filenames, aliases, unresolved targets,
      headings, quoted front-matter links, Unicode, Finder additions, stale
      recent entries, keyboard and pointer selection, focus return, empty and
      large candidate sets, desktop and narrow layouts, and typing latency.
    - Risk/rollback: A filename-only target can become ambiguous after a new
      duplicate appears. New candidates must be bounded and precomputed rather
      than rescanning note bodies on each keystroke; ambiguous links remain
      unopened unless their prior target can be proven. Revert focused commits
      without changing existing Markdown content.
    - Approved decisions: Use shortest unique stored targets rather than Live
      Preview hiding; selecting an unresolved candidate inserts the placeholder
      only and creates no file; recency uses one local history of opened,
      edited, created, and first-seen notes rather than filesystem birth dates.
    - Commits: `46e3116 docs(plan): add link authoring`,
      `b866b59 feat(links): rank link candidates`,
      `fca6d43 feat(notes): remember recent activity`,
      `cafba02 feat(links): complete link queries`,
      `e9c1308 feat(links): complete link authoring`,
      `82e915a fix(app): survive blocked activity storage`, and
      `b17813a fix(app): support older WebKit regex`

11. [x] **Chunk: Add retrieval and continuity**
    - Files: search and recent-file features, settings persistence, tests
    - Change: Add global Markdown search, file-local find, recent files, quick
      open, and required keyboard shortcuts without a database.
    - Verify: Large fixture vault, stale recent entries, Unicode, keyboard,
      focus, empty/error states, and performance measurement.
    - Risk/rollback: Unbounded scanning can stall the editor; isolate indexing
      work and establish budgets from the representative fixture.
    - Implemented limits: Search work runs outside the interface thread with a
      200-character query limit, 100-result limit, 10 MiB per-note limit, and
      64 MiB total-content budget. Results report skipped or limited scans.
    - Native verification: Dwayne confirmed editing, Quick Open, full-vault
      search, note-local Find, aliases, and keyboard and pointer flows work in
      a disposable synthetic vault on 2026-07-17.
    - Commits: `bb99fd4 feat(search): rank recent notes`,
      `df6500f feat(search): add quick open`,
      `e75d641 feat(search): scan vault content`,
      `9331135 feat(search): add vault search UI`,
      `2bb0682 feat(search): add note-local find`, and
      `7df3875 test(search): cover retrieval states`. Native-QA corrections:
      `9f7daa3 fix(app): remove static sample notes`,
      `5670240 test(vault): add retrieval smoke vault`, and
      `09d1d16 fix(dev): recover stale app server`.

11C. [x] **Chunk: Add notification history**
    - Files: notification history model and tests, notification-center UI,
      app composition, title-bar icon, styles, `CHANGELOG.md`, `PLANS.md`
    - Change: Keep the existing immediate notification stack and add a local,
      timestamped history for meaningful vault, identity, link, rename, save,
      conflict, and error outcomes. Retain resolved entries for 28 days, keep
      unresolved conflicts until resolved, cap storage, and provide individual
      delete and Clear all actions.
    - Verify: Malformed and blocked storage, expiration, unresolved conflict,
      deduplication, bounded history, keyboard focus, Escape, empty state,
      individual delete, Clear all, desktop and narrow layouts, and no routine
      autosave or repeated clean scan noise.
    - Risk/rollback: A noisy or privacy-heavy log would distract from writing.
      Store no note contents or absolute paths, record only selected outcomes,
      keep persistence optional, and revert the focused chunk without touching
      Markdown files.
    - Approved decisions: Local-only storage, 28-day default retention,
      unresolved conflicts exempt from expiration, and immediate messages
      remain independently dismissible from their history records.
    - Expected changelog: Add a user-visible notification center with local
      timestamps, cleanup, and bounded retention. Version remains `0.1.0`
      until an explicit release request.
    - Verification result: Storage validation, expiration, active-conflict,
      deduplication, bounds, blocked-storage, focus, Escape, empty, delete,
      clear, and integration tests pass. Rendered checks pass at 1280×720 and
      400×800 with no console warnings, clipping, or horizontal overflow.
    - Commits: `eda76a5 docs(plan): add notification history`,
      `45875e5 feat(app): persist notification history`, and
      `009bb3e feat(app): add notification center`.

11D. [x] **Chunk: Scope vault continuity and trash**
    - Files: native vault identity, registry, trash commands and tests; typed
      frontend bridge; notification persistence; vault switcher and Trash UI;
      app composition, styles, tests, `CHANGELOG.md`, `PROJECT.md`, `PLANS.md`
    - Change: Create `.anchored/vault.json` with an opaque vault ID, keep
      canonical remembered-vault paths only in native app data, scope local
      notifications by vault ID, and expose remembered vaults through the
      existing selector. Move saved notes into `.anchored/trash/` without link
      rewrites, exclude the entire internal directory from normal indexing,
      and provide safe restore to the original location without permanent
      deletion.
    - Verify: Initial and repeated registration, moved and unavailable vaults,
      malformed metadata and registry, duplicate names, hidden-folder scan and
      path refusal, trash rollback, restore conflicts, missing original
      folders, symlinks, unfinished edits, notification isolation and v1
      migration, keyboard focus, Escape, empty/error/success states, quick
      switching, desktop and narrow layouts, and disposable-vault native QA.
    - Risk/rollback: Trash and restore move authored files. Use same-filesystem
      renames, atomic metadata replacement, rollback on metadata failure,
      destination no-overwrite checks, symlink refusal, and synthetic vaults
      first. Reverting the feature leaves `.anchored` data intact and ordinary
      Markdown untouched; manually restoring files remains possible from the
      hidden trash directory and index.
    - Approved decisions: Use `.anchored/trash/`; exclude trashed notes from
      files, search, links, aliases, and backlinks; preserve note bytes and
      links; include Restore but no permanent delete; stop safely on restore
      name conflicts; show remembered vaults with quick switch and Forget;
      keep registry paths native-only; use vault identity for notification
      scope across a moved vault after it is selected again.
    - Expected changelog: Add vault-specific notification history, remembered
      vault switching, and reversible soft deletion. Version remains `0.1.0`
      until an explicit release request.
    - Verification result: Vault metadata, registry recovery, hidden-path
      exclusion, exact-byte Trash moves, crash recovery, restore conflicts,
      recreated folders, symlink refusal, scoped-history migration, quick
      switching, Forget, Trash/restore flows, focus, Escape, loading, empty,
      and error states pass automated checks. Rendered checks pass at 1280×720
      and 400×800 without console warnings or overflow. The debug native build
      and final disposable-vault UI test pass.
    - Commits: `1edf260 docs(plan): add vault continuity`,
      `85cbaf6 feat(vault): remember vault identity`,
      `a3c2f14 feat(vault): add reversible trash`,
      `c7eb3bc feat(notify): scope history by vault`, and
      `2f30973 feat(app): add vault continuity`.

11E. [x] **Chunk: Complete pre-package review**
    - Files: application and native source review, automated checks,
      `docs/FEATURES.md`, `docs/PUBLIC_TEST_CHECKLIST.md`, `README.md`,
      `PROJECT.md`, `PLANS.md`
    - Change: Audit the implemented editor journey and trusted filesystem
      boundary before packaging. Publish an evidence-based feature reference
      and a repeatable public-testing checklist that separates supported
      behavior, safety expectations, known limitations, and release blockers.
    - Verify: Compare every documented feature with code and tests; inspect
      permissions, persistence, recovery, limits, error states, shortcuts,
      accessibility, and release configuration; run all configured frontend
      and Rust gates plus rendered desktop and narrow smoke checks.
    - Risk/rollback: Public documentation that overstates support can expose
      testers' vaults to avoidable risk. Mark unverified behavior and known
      limitations explicitly, keep primary-vault testing out of scope, and
      revert the documentation commit without changing app or vault data.
    - Expected changelog: None for review-only documentation. Any discovered
      user-visible fix must receive its own verified implementation and
      `[Unreleased]` entry before packaging. Version remains `0.1.0` until an
      explicitly authorized release.
    - Verification result: The feature inventory was checked against source,
      77 frontend tests, 59 Rust tests, formatting, lint, type-checking, strict
      Clippy, the production frontend build, and an optimized Tauri no-bundle
      build. The rendered no-vault and unsaved-draft shell passed at the native
      900×600 minimum without page overflow, blank UI, console warnings, or
      errors. Public reference and repeatable test documents now cover the
      entire implemented journey and its bounds.
    - Release blockers found: A new first-save draft can be lost on native
      close/quit and can currently be created without an open vault; production
      CSP is unset; side-panel modality/focus containment is incomplete; the
      package uses the default Tauri icon; and public signing/notarization or
      unsigned distribution instructions remain undecided. Packaging must not
      begin until the app-level blockers are fixed and the delivery decision is
      made.
    - Non-blocking observations: `App.tsx` is oversized, the lazy editor bundle
      still triggers the 500 kB build warning, representative baseline-machine
      timing is not recorded, linked-attachment preservation needs a dedicated
      regression fixture, and the seven-day stability observation is pending.
    - Commit: `docs(review): add public test guide`

11F. [x] **Chunk: Harden the private-alpha candidate**
    - Files: close-protection and modal components, app composition and tests,
      title bar and file explorer controls, global styles, Tauri capabilities
      and security configuration, macOS bundle assets and release scripts,
      `README.md`, `docs/FEATURES.md`, `docs/PUBLIC_TEST_CHECKLIST.md`,
      `CHANGELOG.md`, `PROJECT.md`, `PLANS.md`
    - Change: Prevent loss of first-save drafts on native close or quit, prevent
      note creation without a selected vault, provide complete modal focus
      containment, install a restrictive production CSP, replace the default
      Tauri artwork, and configure direct macOS distribution for Developer ID
      signing, hardened runtime, Apple notarization, stapling, and Gatekeeper
      verification without storing credentials in the repository.
    - Verify: Multiple unsaved and conflict states, cancel and explicit discard
      paths, no-vault mouse and keyboard creation, focus entry/loop/return and
      Escape for every dialog, CSP startup and editor interaction, least-
      privilege capability generation, complete icon set, unsigned local build
      isolation, signed/notarized release preflight, all frontend and Rust
      gates, optimized Tauri build, and rendered desktop/minimum-window QA.
    - Risk/rollback: Close interception and CSP mistakes can trap users or stop
      the app from loading, while signing configuration can leak credentials or
      produce packages Gatekeeper rejects. Keep one explicit discard escape,
      retain a visible startup boundary, use environment-only secrets, fail a
      public release before building when prerequisites are absent, and revert
      this focused chunk without changing vault data.
    - Decisions: The current package is a private, ad-hoc-signed Intel alpha
      distributed only to Dwayne for in-house testing. It uses the hardened
      runtime and no exception entitlements. Developer ID signing,
      notarization, ticket stapling, website distribution, Apple Silicon or
      universal packaging, and Linux packaging are deferred until explicitly
      requested. The approved alpha icon is a minimal white `A` on black and
      can be replaced without changing application behavior.
    - External prerequisite: A paid Apple Developer membership, installed
      Developer ID Application certificate, Team ID, and notarization
      credentials will be required before a future public macOS download can
      pass Gatekeeper without the private-alpha manual approval flow. This does
      not block the private alpha.
    - Expected changelog: Add quit protection, vault-gated note creation,
      complete modal keyboard behavior, production CSP, branded bundle assets,
      and private-alpha packaging safeguards. Version remains `0.1.0` until an
      explicit release request.
    - Verification result: Close protection, vault-gated creation, modal focus
      containment, restrictive production and development CSP, least-privilege
      capability generation, hardened runtime, complete icon assets, startup,
      and editor interaction pass automated and native installed-app checks.
    - Commits: `91c7200 fix(safety): guard unsaved app close`, `79a1b0a
      fix(editor): require an open vault`, `da81866 fix(a11y): contain modal
      focus`, `805eb5d docs(plan): target private alpha`, `067aa75
      fix(security): harden desktop policy`, and `165de3d chore(brand): add
      Anchored app icon`.

12. [x] **Chunk: Package private alpha candidate**
    - Files: Tauri bundle configuration, icons/assets, README, release checklist
    - Change: Produce an ad-hoc-signed Intel macOS 12-compatible local package
      and document install, first-launch approval, backup, recovery, supported
      syntax, and known limitations.
    - Verify: Clean install, all quality gates, packaged main journey, keyboard,
      accessibility, baseline-machine checks, and disposable-vault smoke test.
    - Risk/rollback: Platform or signing limitations; retain the development
      workflow and previous private alpha package as rollback options.
    - Verification result: `Anchored_0.1.0_x64.dmg` and its SHA-256 checksum
      were produced, ad-hoc signed, integrity checked, mounted, and inspected.
      The contained and installed apps verify as `x86_64` with a macOS 12.0
      minimum. Native QA selected a seven-note disposable vault, dismissed a
      notification, opened and edited a note, observed autosave, quit and
      relaunched, reopened the remembered vault, and confirmed the saved marker
      persisted. All configured frontend and Rust gates pass.
    - Commit: `fdb2d9c chore(release): build private alpha`

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

15. [ ] **Chunk: Fix close and notification regressions**
    - Issues: [#1](https://github.com/dwaynemcyrus/anchored-app/issues/1),
      [#3](https://github.com/dwaynemcyrus/anchored-app/issues/3), and
      [#4](https://github.com/dwaynemcyrus/anchored-app/issues/4)
    - Files: `src/app/closeProtection.ts`, `src/app/closeProtection.test.tsx`,
      `src/app/App.tsx`, `src/app/App.test.tsx`,
      `src/app/components/StatusBar.tsx`, `src/styles/global.css`, and
      `CHANGELOG.md`
    - Change: Reproduce and correct the native macOS window-close behavior;
      retain explicit protection only when unsaved work exists. Remove the
      routine Markdown-file count from immediate and history notifications,
      and show the live vault count quietly in the status bar. Automatically
      dismiss non-critical, non-actionable notices after 12 seconds while
      preserving manual dismissal and keeping errors, conflicts, and
      action-required messages visible.
    - Verify: Native close-control smoke test with clean and unfinished drafts;
      fake-timer tests for notice expiry and cleanup; tests proving critical
      notices persist; status-bar count updates after vault scans; notification
      history excludes routine count events; keyboard and narrow-window checks;
      Prettier, ESLint, TypeScript, Vitest, Vite build, Rust format, Clippy,
      and Rust tests.
    - Risk/rollback: Incorrect close handling could lose edits, and overly
      broad timers could hide actionable failures. Treat clean-close and
      draft-protection paths separately, clear timers on dismissal or unmount,
      and preserve all critical notices. Revert the focused commit without
      touching vault Markdown files.
    - Assumption: The status bar is the appropriate quiet location for the
      Markdown-file count; it should display the active vault's current count.

## Requirements for future large plans

Every future large plan must identify:

- expected notable entries for `[Unreleased]`
- version impact when the plan prepares a release
- changelog verification in release acceptance criteria

## Progress notes

- 2026-07-17: The private `0.1.0-alpha` Intel alpha is installed in Applications and
  passed native package QA with screen and accessibility inspection. The final
  DMG, app, and checksum verify; the no-vault shell, seven-note disposable
  vault, notification dismissal, Markdown editing/autosave, clean quit,
  remembered-vault quick reopen, and persisted content all work. All 80
  frontend tests, 59 Rust tests, formatting, lint, type-checking, strict
  Clippy, and production builds pass. Chunk 13's real seven-day observation is
  now the only unfinished acceptance phase.
- 2026-07-17: Prepared the `v0.1.0-alpha` source release with aligned desktop,
  npm, Rust, lockfile, and documentation versions. The public repository uses
  the MIT License and retains only a wholly fictional test vault; no personal
  smoke-vault content is part of the release.
- 2026-07-17: Completed the pre-package release review and published the
  verified feature reference and comprehensive public-testing checklist. All
  configured frontend and native gates and the optimized application build
  pass. Packaging is held for unsaved-draft quit protection, no-vault draft
  prevention, CSP hardening, modal focus containment, an Anchored app icon, and
  the `[NEEDS DECISION]` public distribution/signing choice.
- 2026-07-17: Dwayne confirmed all three Chunk 11D native checkpoints pass:
  vault switching and scoped history, reversible Trash and restore, and a
  conflict-safe restore refusal. Chunk 11D is complete.
- 2026-07-17: Chunk 11D implementation and automated verification completed.
  Anchored now keeps a stable hidden vault identity, native-only remembered
  paths, vault-scoped notifications, quick switching with Forget, and exact-
  byte reversible Trash with conflict-safe restore. Two disposable vaults and
  the verified debug app are ready for final native UI confirmation.
- 2026-07-17: Dwayne approved Chunk 11D. Anchored will own one hidden
  `.anchored` directory per vault for stable vault identity and reversible
  trash, while remembered absolute paths remain private to native app data.
  Trashed notes keep exact bytes and existing links but leave the active graph
  until restored; no permanent delete is included.
- 2026-07-17: Chunk 11C adds an optional local notification history behind a
  top-bar bell. Meaningful events are timestamped, deduplicated, capped at 250,
  and retained for 28 days; active conflicts persist until automatic or manual
  resolution. Routine autosaves and clean rescans do not create history noise.
- 2026-07-17: Dwayne confirmed all Chunk 11 retrieval and editing flows work in
  the native smoke vault. Chunk 11 is complete. Notification history was then
  approved as Chunk 11C before packaging, using local 28-day retention while
  preserving unresolved conflicts until they are resolved.
- 2026-07-17: Chunk 11 retrieval implementation completed automated checks for
  Quick Open, bounded background vault-content search, file-local Find, stale
  activity cleanup, Unicode matching, focus, keyboard, empty/error, and a
  1,000-file performance fixture before its successful native smoke test.
- 2026-07-17: Native QA exposed two non-product failures: a stale Vite process
  caused the generic `beforeDevCommand` error, and hard-coded startup samples
  appeared to be notes despite having no editable vault source. Anchored now
  starts in an explicit no-vault state, its launch hook safely replaces only a
  stale server from this project, and the fictional `fixtures/test-vault`
  provides six validated Markdown files for repeatable retrieval and editing
  tests.

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
- 2026-07-16: Dwayne confirmed a one-second idle autosave and conflict-first
  external-change behavior: local edits remain available instead of reloading
  an externally changed file.
- 2026-07-16: Added the first editing slice: CodeMirror Markdown editing for
  opened vault notes, Command-S, one-second idle autosave, atomic save calls,
  and visible conflict feedback. Native write verification on a disposable
  vault and create/save-as remain before chunk 8 can close.
- 2026-07-16: The native disposable-vault autosave test passed. Dwayne added
  text to `Notes/Write Test.md`; it remained after the note was closed and
  reopened.
- 2026-07-16: Added safe new-file creation and Save As. New files are limited
  to `.md` paths inside the selected vault, cannot replace an existing file,
  and are created atomically. Draft content and per-note save/conflict state
  survive note switching. Native Save As verification remains for chunk 8.
- 2026-07-16: The native disposable-vault Save As test passed. Dwayne created,
  saved, closed, and reopened a new Markdown note with its content intact.
  Chunk 8 is complete.
- 2026-07-16: Dwayne selected full 26-character ULIDs without a `note_`
  prefix, stored in YAML front matter while wikilinks remain filename- and
  alias-based. Initial vault scans are read-only baselines; later Finder-added
  notes may receive IDs automatically after stability and safety checks.
- 2026-07-16: Added the conservative identity parser and insertion core. It
  validates YAML without reserializing it, preserves comments, Unicode, BOMs,
  and LF/CRLF endings, and refuses malformed, duplicate, or noncanonical IDs.
- 2026-07-16: Connected identity insertion to atomic new-note creation. New
  Anchored notes receive a full ULID, the editor adopts the returned front
  matter, and subsequent saves cannot silently remove or replace that ID.
- 2026-07-16: Added persistent, app-local vault baselines and reconciliation.
  Initial scans do not rewrite legacy notes; later new files receive collision-
  checked IDs, likely legacy renames stay unchanged, and unsafe files remain
  pending for a safe retry after repair.
- 2026-07-16: Added focus-triggered vault rescanning without continuous polling.
  Finder-added notes appear when Anchored regains focus, while local drafts and
  dirty missing files are preserved and Save As operations suppress race-prone
  rescans.
- 2026-07-16: The native Finder-import identity test passed. The initial scan
  left `Legacy.md` byte-for-byte unchanged and reported it as needing an ID;
  a later `Finder Added.md` appeared on focus, received one unprefixed ULID,
  and preserved its original heading and body.
- 2026-07-16: Added an explicit migration preview for legacy ID-less notes.
  Anchored lists eligible and unsafe files before confirmation, retains the
  plan inside the native boundary, rechecks every file before writing, and
  skips notes changed or removed after preview.
- 2026-07-16: Dwayne confirmed the native previewed migration passed on the
  disposable vault. `Legacy.md` received one canonical unprefixed ULID while
  its original heading and body remained intact. Chunk 9 is complete.
- 2026-07-16: Began chunk 10 with read-only link metadata indexing. Vault
  snapshots expose safe Obsidian aliases and only unique canonical IDs; the
  interface keys identified notes by those IDs so local editor state follows a
  Finder rename or move. Link parsing and navigation remain next.
- 2026-07-16: Added deterministic wikilink parsing and navigation for exact
  relative paths, filenames, aliases, headings, display labels, and embeds.
  Command-click resolves only a unique match; missing and ambiguous targets
  remain unopened and are reported. Rendered alias navigation passed with no
  console errors. Backlinks and transactional rename updates remain.
- 2026-07-16: Added a read-only native outgoing-link index and resolved
  backlinks, including live unsaved drafts without front matter. Escaped body
  links, inline code, fenced code, and indented code are excluded. The compact
  backlink section passed rendered mouse navigation, semantic inspection, and
  console checks; keyboard activation is covered by the component flow test.
  Transactional filename rename updates remain.
- 2026-07-16: Corrected front-matter compatibility before rename work. Valid
  quoted internal links in top-level YAML text and list properties now enter
  the same navigation, outgoing-link, and backlink graph as body links.
  Malformed YAML and non-string property values remain excluded.
- 2026-07-16: Added the read-only rename planner foundation. Native scanning
  now returns exact target ranges for body and quoted-property links, and the
  planner rewrites only links that uniquely resolve to the renamed note.
  Headings, display labels, whitespace, comments, Unicode, and line endings are
  preserved. Ambiguous links remain unchanged; alias links gain a display label
  so their visible text survives.
- 2026-07-16: Added identified-note rename and move support. The native layer
  preloads and rechecks every Markdown source, prepares the complete rewrite,
  backs up all affected notes, and rolls the entire set back on any handled
  failure. A durable, path-validated journal restores an interrupted rename or
  finishes cleanup when the vault is reopened after a process crash. The
  editor exposes one minimal Rename action, blocks unfinished disk-backed
  edits, then reloads the renamed note and clears stale reference buffers.
  Forty-two Rust tests, 29 frontend tests, lint, type-check, production build,
  and rendered checks at desktop and 400×800 pass. A native disposable-vault
  rename test and remaining filename/path edge fixtures are still required to
  close chunk 10.
- 2026-07-16: Native rename QA exposed two test-delivery and interface issues.
  Manual testing now uses a self-contained debug app instead of a transient
  development server. Following manual feedback, vault and save notices now
  form a persistent top-center stack below the note header. Newest messages
  appear first, identical messages are deduplicated, every message has its own
  Dismiss control, and a bounded scroll area prevents a long stack from taking
  over the editor. Thirty frontend tests plus rendered desktop and 400×800
  interaction checks pass; native rename QA remains open.
- 2026-07-16: A process stack sample identified the rename stall before any
  vault mutation: the synchronous Tauri command parked the macOS main thread
  inside the blocking save dialog. The command now runs asynchronously, like
  the existing Open Vault and Save As commands, while retaining the exclusive
  rename lock. All disposable files were hash-verified unchanged after the
  stall, and all 46 Rust tests plus strict Clippy pass. Native rename QA must be
  rerun with the rebuilt self-contained app.
- 2026-07-16: The native disposable-vault rename test passed in the
  self-contained app. `Notes/Old Name.md` moved to `Writing/New Name.md`; its
  permanent ID and content remained intact; the filename, alias-property, and
  path-plus-heading links in `Reference.md` all updated exactly; the unrelated
  note remained unchanged; and no temporary, backup, or journal files remained.
  Chunk 10 is complete.
- 2026-07-16: Dwayne approved a link-authoring bridge before retrieval work.
  Anchored will default to the shortest unique stored wikilink target, insert
  unresolved placeholders without creating files, and use one local
  opened/edited/created/first-seen history. Chunk 10B will establish the shared
  candidates and ranking that Quick Open can reuse in chunk 11.
- 2026-07-16: Implemented the Chunk 10B authoring flow. Typing `[[` opens a
  bounded picker for recent notes, filename and alias matches, and known or
  newly typed unresolved placeholders; completion inserts the shortest unique
  Obsidian-compatible target and creates no file. Activity is stored only for
  stable note IDs and edit refreshes are throttled to protect typing latency.
  All automated frontend gates and 44 tests pass. Native rendered verification
  remains before the chunk is marked complete because the local browser QA
  surface refused the preview address.
- 2026-07-16: Native blank-window investigation reproduced an uncaught WebKit
  `SecurityError` when optional activity storage is unavailable. Anchored now
  falls back to an empty activity history so storage denial cannot prevent the
  editor shell from rendering. All 45 frontend tests and configured gates pass;
  native visual confirmation remains.
- 2026-07-17: The startup boundary exposed the remaining native failure as an
  unsupported regular-expression lookbehind in the wikilink parser. Replaced
  both expressions with an explicit line scanner that preserves LF, CRLF,
  trailing lines, and link offsets on the macOS 12 WebView. Startup failures
  now render an actionable local error instead of an empty window. All 46
  frontend tests and configured gates pass; native UI confirmation remains.
- 2026-07-17: Dwayne confirmed Anchored reloads to the normal native interface
  after the WebKit compatibility fix. Chunk 10B is complete; the shared bounded
  candidate and activity contracts are ready for Quick Open in chunk 11.

## Completion

- **Checks run:** Documentation diff checks; Prettier check; ESLint;
  TypeScript; 80 Vitest tests; Vite production build; Cargo format, strict
  Clippy, and 59 Rust tests; optimized Tauri and DMG builds; codesign and DMG
  integrity checks; architecture and deployment-target inspection; installed
  native no-vault, vault-open, edit/autosave, quit/relaunch, remembered-vault,
  and content-persistence checks. Browser-only preview startup reaches the
  expected Tauri IPC boundary and is not an authoritative desktop test.
- **Commits:** Verified implementation commits are recorded with each completed
  chunk above.
- **Remaining risks:** The CodeMirror production chunk still triggers the 500
  kB build warning; baseline timings and attachment-preservation regression
  coverage remain desirable; public Developer ID/notarized, Apple Silicon, and
  Linux packages are deferred; and the seven-day observation is incomplete.
- **Follow-up:** Complete Chunk 13 using `docs/ALPHA_STABILITY_LOG.md` on a
  backed-up representative vault copy before primary-vault use.
