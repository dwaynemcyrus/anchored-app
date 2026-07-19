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
     `2795bb8 feat(editor): add safe save as`, and
     `b780238 fix(editor): preserve draft identity`, and
     `3ffc334 feat(editor): style markdown source`, and
     `a53660e fix(editor): cover markdown syntax`

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

15. [x] **Chunk: Fix close and notification regressions**
    - Issues: [#1](https://github.com/dwaynemcyrus/anchored-app/issues/1),
      [#3](https://github.com/dwaynemcyrus/anchored-app/issues/3), and
      [#4](https://github.com/dwaynemcyrus/anchored-app/issues/4)
    - Files: app composition and tests, status bar, notification UI/styles,
      native untitled-file creation, `CHANGELOG.md`, and `PLANS.md`
    - Change: Leave the native macOS red close control completely
      unintercepted. Start saving every new note immediately, including a blank
      note, at the vault root using collision-safe numbered Untitled filenames.
      Remove the routine Markdown-file count from immediate and
      history notifications, and show the live vault count quietly in the
      status bar. Automatically dismiss non-critical, non-actionable notices
      after 12 seconds while keeping errors, conflicts, and action-required
      messages visible.
    - Verify: Native red-close smoke test with no warning; tests for immediate
      blank-note saving and minor-notice expiry; numbered-filename Rust test;
      status-bar count updates after vault scans; notification history excludes
      routine count events; keyboard and narrow-window checks; Prettier,
      ESLint, TypeScript, Vitest, Vite build, Rust format, Clippy, and Rust
      tests.
    - Risk/rollback: A failed first save could leave a just-created draft only
      in memory, and overly broad timers could hide actionable failures. Begin
      the first save during note creation, never replace occupied filenames,
      and preserve all critical notices. Revert the focused commit without
      touching vault Markdown files.
    - Assumption: The status bar is the appropriate quiet location for the
      Markdown-file count; it should display the active vault's current count.
    - Verification result: The final native macOS app exited cleanly when its
      red close control was pressed, with no prompt. Immediate blank-note save,
      collision-safe numbering, 12-second notice expiry, persistent actionable
      notices, and status-bar counts pass automated coverage. All 81 frontend
      and 60 Rust tests pass with formatting, lint, type-check, production
      build, Rust formatting, and Clippy. Rendered QA passed at 1280×720 with
      the expected interaction state and no console warnings or errors.
    - Commit: current implementation chunk

16. [x] **Chunk: Create vaults at user-selected locations**
    - Issues: [#8](https://github.com/dwaynemcyrus/anchored-app/issues/8)
    - Files: native vault commands and tests, typed frontend bridge, vault
      selector UI, app composition, `CHANGELOG.md`, and `PLANS.md`
    - Change: Add a native-owned create-vault flow that lets the user enter a
      vault name, choose a parent folder, create the new vault directory
      safely, initialize Anchored metadata, remember the vault, and open it
      immediately without exposing arbitrary filesystem paths to the interface.
    - Verify: Empty-name, duplicate-name, invalid-name, canceled-selection,
      nested-parent, hidden-internal-path, remembered-vault registration, and
      immediate-open tests; frontend and Rust quality gates; native disposable-
      vault smoke test.
    - Risk/rollback: Folder creation mutates the filesystem. Validate names,
      refuse reserved or occupied destinations, create only one directory
      inside the chosen parent, and revert the focused chunk without touching
      existing vault Markdown.
    - Verification result: New native coverage validates vault-name safety,
      occupied destinations, and successful folder creation. The frontend bridge
      and app tests cover dialog launch from the no-vault screen, naming, and
      immediate activation of the created vault. Frontend formatting, lint,
      type-checking, tests, production build, Rust formatting, Clippy, and
      Rust tests pass. Rendered QA on Friday, July 17, 2026 confirmed the
      no-vault screen opens the create-vault dialog at `http://127.0.0.1:1420/`
      with no relevant console warnings or errors.
    - Commit: current implementation chunk

17. [x] **Chunk: Add safe reload continuity**
    - Issues: [#13](https://github.com/dwaynemcyrus/anchored-app/issues/13)
    - Files: startup boundary and app session state, new settings UI and tests,
      typed frontend bridge if needed, `CHANGELOG.md`, and `PLANS.md`
    - Change: Add a settings modal with a danger-scoped reload action that
      saves pending note changes first, reloads Anchored, and restores the
      current remembered vault plus the currently open note after startup. This
      chunk does not introduce future tab-session scope before tabs exist.
    - Verify: Saved and unsaved current-note reloads, blocked conflict/error
      cases, no-vault reload, startup-boundary reload, restored active note,
      keyboard/focus behavior, frontend quality gates, and rendered QA.
    - Risk/rollback: A mistaken reload flow can interrupt writing or restore
      stale state. Persist only the minimum current session state, save before
      reload, and refuse automatic reload when save conflicts or failures need
      human action.
    - Verification result: Session-state parsing tests plus saved-note, no-vault,
      conflict-block, and startup-restore app tests pass. Formatting, lint,
      type-checking, the full 89-test frontend suite, and the production build
      pass. Rendered QA on Saturday, July 18, 2026 confirmed the Settings modal
      opens from the no-vault shell at `http://127.0.0.1:1421/`, the reload
      action returns to the no-vault state, and the console stays free of
      relevant warnings and errors.
    - Commit: current implementation chunk

18. [x] **Chunk: Add folder creation and note moves**
    - Files: native folder and note-move commands and tests, typed frontend
      bridge, file-rail and app state, targeted UI for folder creation and note
      moves, `CHANGELOG.md`, and `PLANS.md`
    - Change: Add safe creation of root folders and subfolders plus note moves
      between folders inside the selected vault. Preserve permanent note IDs,
      update affected links through the existing rename transaction path, and
      refresh the visible folder tree without exposing arbitrary paths.
    - Verify: Root and nested folder creation, invalid names, occupied
      destinations, note moves across folders, unchanged-content collision
      refusal, link-update coverage, keyboard flows, frontend and Rust quality
      gates, and disposable-vault UI checks.
    - Risk/rollback: Moving notes is a cross-file mutation. Reuse the existing
      rename transaction safety model, refuse occupied destinations, and avoid
      folder deletes or folder renames in this chunk.
    - Verification result: Root-folder, subfolder, move-dialog, and drag-to-
      folder app tests pass alongside the full 95-test frontend suite,
      formatting, lint, type-checking, production build, Rust formatting,
      strict Clippy, and all 67 Rust tests. Rendered smoke QA on Saturday,
      July 18, 2026 at `http://127.0.0.1:1422/` confirmed the no-vault shell
      renders without an overlay, the console stays free of relevant warnings
      and errors, and the Create vault modal opens with the expected fields
      and controls. Native folder creation and note-move execution remain
      covered by the automated vault and app tests because plain browser mode
      does not expose Tauri filesystem mutations.
    - Commit: current implementation chunk

19. [x] **Chunk: Add folder rename and empty delete**
    - Files: native folder rename and delete commands and tests, typed frontend
      bridge, file-rail folder actions, shared folder dialogs, app state,
      `CHANGELOG.md`, and `PLANS.md`
    - Change: Add folder rename from the file rail for vault folders that
      contain only Markdown notes and subfolders, and allow direct deletion of
      empty folders. Reuse the existing note-rename safety model for Markdown
      path updates and refuse broader destructive folder removal.
    - Verify: Root and nested folder rename coverage, link updates for moved
      note paths, refusal for folders containing non-Markdown files, empty-
      folder deletion, non-empty delete refusal, frontend and Rust quality
      gates, and rendered UI smoke checks where the browser surface can reach
      them.
    - Risk/rollback: Folder rename spans many note paths, while folder delete
      is destructive by definition. Keep rename limited to Markdown-only folder
      trees, refuse non-empty delete requests, and avoid recursive content
      deletion in this chunk.
    - Verification result: Folder-rename and empty-delete app tests pass,
      bridge tests pass, and Rust unit coverage now includes rename-safe nested
      folder moves plus empty and non-empty delete behavior. Formatting, lint,
      type-checking, the full frontend test suite, production build, Rust
      formatting, strict Clippy, and all Rust tests pass on Saturday, July 18,
      2026. Browser-only rendered validation remains limited by the native
      vault boundary, so the folder-action execution path is proven primarily
      through automated app and Rust tests.
    - Commit: current implementation chunk

20. [ ] **Epic: Implement Anchored Markdown Specification v1**
    - Outcome: Make the Markdown implementation CommonMark-compliant,
      GFM-compatible, source-preserving, and complete for every required and
      optional feature in the supplied Anchored Markdown Specification v1.
      The source editor remains CodeMirror 6 and Markdown remains the only
      authored-content source of truth. Version 1 gets an explicit, on-demand
      rendered document surface; it does not add live preview while typing.
    - Package decision: Use `markdown-it` with focused extension packages as
      the runtime Markdown parser and HTML pipeline. It runs directly in the
      existing Tauri WebView and exposes the required linkify and typographer
      toggles without a cross-origin-isolated WASI runtime. Keep `yaml-rust2`
      and the existing Rust metadata layer for typed YAML validation, stable
      IDs, aliases, and formatting-preserving mutations. Sätteri was evaluated
      as the suggested alternative, but its browser fallback requires
      `SharedArrayBuffer` and cross-origin isolation while its native binding
      is not a direct WebView dependency. Keep the parser adapter boundary so
      this decision can be revisited without changing Markdown persistence.
    - Preservation rule: Parse for indexing, rendering, diagnostics, and
      navigation, but never serialize the entire AST back to disk on ordinary
      save. Preserve unknown syntax, key order, spacing, comments, attachments,
      and unsupported Obsidian content byte-for-byte unless a deliberate,
      reviewed mutation is being applied. Read LF and CRLF for compatibility;
      new files use LF, and existing CRLF files are normalized only on an
      intentional save with an observable notice and regression coverage.
    - Feature matrix:
      - Markdown-it core and extension packages: CommonMark, GFM tables and
        alignment, backtick fences, footnotes, strikethrough, task-list
        syntax, GFM autolinks, `$...$` and `$$...$$` math, definition lists,
        `~subscript~`, `^superscript^`, emoji, highlighting, and smart
        typography.
      - Anchored plugins or adapters: YAML front matter detection, heading
        IDs via `{#id}`, wikilinks, standard admonition blockquotes with
        the twelve named types and custom titles, `==highlight==`, emoji
        shortcodes, Mermaid code fences, permanent-ID
        resolution, safe internal-link rendering, configurable bare-URL
        linking, and the backtick-only fence policy.
      - Settings: automatic URL linking defaults on and is toggleable;
        smart typography defaults on and is toggleable by quotes, dashes, and
        ellipses; highlighting, emoji, and Mermaid are enabled in Version 1
        while preserving their original source syntax. Render-only transforms
        must never rewrite the editor's Markdown.
    - Compatibility decisions: With subscript enabled, single-tilde spans are
      subscript and only double tildes are strikethrough. Tilde fences are
      treated as ordinary Markdown text, never code fences. Standard
      admonition types are closed to the documented list; custom titles are
      accepted, but custom admonition types are not. Existing stable IDs and
      filename-triggered link updates remain authoritative and are not
      replaced by display-name or heading-ID resolution.

20A. [x] **Chunk: Establish the parser contract and corpus**
    - Files: `docs/MARKDOWN_SPEC.md`, `docs/FEATURES.md`, `PLANS.md`,
      `src/app/markdown/`, `fixtures/markdown/`, parser tests, package
      manifests and lockfile
    - Change: Record the supplied specification as the versioned product
      contract, define typed parse/render/settings results, and create one
      corpus covering every syntax example, malformed input, unsupported
      syntax, Unicode, LF/CRLF, nested constructs, and the existing Obsidian
      vault cases. Add an explicit compatibility table for Sätteri output and
      Anchored adapters before application wiring.
    - Verify: The corpus has at least one positive and negative fixture for
      every feature; the contract maps every requirement to a test owner;
      unsupported content is asserted to survive unchanged.
    - Risk/rollback: An incomplete corpus can create false confidence. Keep
      this documentation and fixture-only chunk reversible and do not change
      save behavior yet.
    - Expected changelog: None unless the specification becomes user-visible
      in the shipped build. Version remains `0.1.0-alpha`.
    - Verification result: Added the versioned Markdown contract and renderer
      corpus for front matter, CommonMark/GFM, extended syntax, admonitions,
      math, wikilinks, Mermaid, unsafe HTML, URL policy, and tilde-fence
      rejection. Source-preservation assertions pass.

20B. [x] **Chunk: Integrate and qualify the browser parser**
    - Files: `package.json`, `package-lock.json`, `src/app/markdown/parser.ts`,
      `src/app/markdown/parser.test.ts`, `vite.config.ts` only if required,
      and build-size notes in `PLANS.md`
    - Change: Add a browser-safe `markdown-it` pipeline with focused extension
      packages and an internal renderer adapter. The adapter handles front
      matter boundaries, heading IDs, wikilinks, admonitions, math, Mermaid
      fences, syntax highlighting, and safe HTML output without exposing
      third-party token types to the rest of the app.
    - Verify: The renderer and settings tests pass, TypeScript and ESLint pass,
      and the existing App suite remains green. Sätteri was evaluated but not
      installed because its documented browser fallback requires cross-origin
      isolation that the current Tauri WebView does not provide.
    - Risk/rollback: Markdown-it extensions are independently versioned. Keep
      the adapter boundary and fixture corpus so any extension can be replaced
      without touching Markdown persistence.
    - Expected changelog: None for an internal parser adapter.

20C. [x] **Chunk: Complete source-preserving metadata and policies**
    - Files: `src-tauri/src/metadata.rs`, `src-tauri/src/links.rs`,
      `src-tauri/src/vault.rs`, `src/app/documents.ts`, `src/app/markdown/`,
      Rust/TypeScript tests, and migration/fixture documentation
    - Change: Unify front-matter detection with the parser contract while
      retaining line-based, key-order-preserving YAML mutations for IDs,
      aliases, tags, created, and updated fields. Enforce UTF-8, LF output on
      intentional writes, stable internal IDs, `.md` portability, and
      preservation of unknown front matter and unsupported Obsidian syntax.
      Add the tilde-fence rejection policy and ensure parser offsets exclude
      front matter, inline code, fenced code, and indented code where the
      existing link/index rules require it.
    - Verify: Byte-level round trips, malformed YAML, duplicate keys, comments,
      quoted values, multiline values, BOMs, CRLF normalization, missing and
      conflicting IDs, tilde fences, attachments, raw HTML, and external edit
      conflicts. Rename and Save As must preserve IDs and update only the
      existing supported filename/path references.
    - Risk/rollback: Serialization and line-ending changes can damage a vault.
      Require preflight plans, atomic writes, re-read-before-write checks,
      rollback tests, explicit notices, and disposable-vault verification.
    - Expected changelog: Document portable Markdown compatibility and any
      visible LF-normalization notice. Version remains `0.1.0-alpha`.
    - Verification result: Added render/source front-matter boundaries,
      backtick-only fence policy across frontend and native link scanners,
      source-preserving tests, and intentional-save LF normalization with a
      visible notice.

20D. [x] **Chunk: Build the safe rendered Markdown surface**
    - Files: `src/app/markdown/renderer.ts`, renderer adapters and tests,
      `src/app/components/MarkdownPreview.tsx`, `src/styles/global.css`,
      lazy-loaded rendering dependencies, and app composition
    - Change: Render the adapter output on explicit Preview/open-rendered-note
      actions, never on every editor keystroke. Implement theme-aware
      headings, paragraphs, lists, tables with alignment, task markers,
      footnotes, code blocks with language highlighting, math with KaTeX,
      wikilinks with stable-ID navigation, definition lists, sub/superscript,
      heading IDs, smart typography, admonitions, highlights, emoji, and
      Mermaid diagrams. Preserve source text as the editable representation.
    - Security rules: Sanitize rendered HTML with an explicit allow-list;
      block scripts, event handlers, executable URLs, frames, and unsafe raw
      HTML. Mermaid is dynamically loaded, rendered locally with strict
      security settings, has no click callbacks or remote resources, and
      falls back to the original fenced source plus an accessible error when
      parsing fails. Code highlighting never executes code.
    - Verify: Render every positive corpus fixture, compare expected semantic
      HTML and accessible names, exercise broken math/code/diagram inputs,
      verify keyboard navigation for links and footnotes, check reduced motion
      and forced colors, and run security fixtures for HTML, URLs, Mermaid,
      heading IDs, and DOM clobbering. Test desktop, 900x600, narrow, 200%
      zoom, and large-note scroll performance.
    - Risk/rollback: HTML injection, expensive optional dependencies, and
      broken WebKit rendering are material risks. Lazy-load Preview, KaTeX,
      Mermaid, and highlighter code; keep a plain-text fallback; and retain
      the existing source editor if Preview fails.
    - Expected changelog: Add an on-demand rendered Markdown view with the
      documented syntax support. Version remains `0.1.0-alpha`.
    - Verification result: Added lazy Preview rendering with sanitized HTML,
      KaTeX math, highlight.js code output, strict Mermaid fallback, stable
      wikilink navigation, and coverage for the rendered app flow.

20E. [x] **Chunk: Extend CodeMirror editing and keyboard behavior**
    - Files: `src/app/components/MarkdownEditor.tsx`, CodeMirror extension
      modules under `src/app/markdown/`, editor styles, settings controls,
      and editor/app tests
    - Change: Keep source-first editing and add syntax-aware highlighting or
      decorations for wikilinks, admonition markers, math, heading IDs,
      definition-list markers, task boxes, highlights, emoji shortcodes, and
      fenced language labels without hiding source text. Preserve the existing
      wikilink completion/navigation, Command-S, Save As, Find, undo/redo, and
      focus behavior. Add keyboard commands for Preview and return focus to the
      editor after closing it.
    - Verify: Type, paste, delete, undo, redo, select, and navigate every
      construct; confirm no decoration changes document bytes; test keyboard
      only, screen-reader labels, composition/Unicode input, large documents,
      and the macOS 12 WebKit compatibility boundary.
    - Risk/rollback: Heavy decorations or reparsing on every transaction can
      introduce typing latency. Use CodeMirror state fields and incremental
      ranges, defer full parsing, avoid React state on every keystroke, and
      retain plain CodeMirror highlighting as the safe fallback.
    - Expected changelog: Add syntax-aware editing affordances and Preview
      keyboard access. Version remains `0.1.0-alpha`.
    - Verification result: Added viewport-bounded CodeMirror decorations for
      supported source constructs and `Command-Shift-P` Preview navigation;
      source text remains the CodeMirror document.

20F. [x] **Chunk: Add Markdown settings and persistence**
    - Files: `src/app/components/SettingsModal.tsx`, versioned settings state
      module and tests, `src/app/App.tsx`, renderer/editor composition, styles,
      `CHANGELOG.md`, and `PLANS.md`
    - Change: Add accessible Markdown settings for automatic URL linking,
      smart quotes, en/em dashes, ellipses, syntax highlighting, emoji,
      Mermaid, and rendered-preview behavior. Defaults match the specification
      and are stored as versioned local settings scoped to the app, never in
      user Markdown. Invalid or blocked storage falls back safely to defaults.
    - Verify: Defaults, each toggle, granular typography options, migration
      from absent/unknown settings, blocked and malformed storage, reset
      behavior, keyboard/focus/Escape, narrow layout, and immediate renderer
      refresh without source mutation.
    - Risk/rollback: Settings must not silently alter authored text or become
      required for opening a note. Keep settings render-only, schema-versioned,
      optional, and independently recoverable.
    - Expected changelog: Add configurable automatic URL linking and smart
      typography plus Version 1 optional rendering features.
    - Verification result: Added versioned, storage-safe settings with five
      accessible toggles, immediate Preview refresh, malformed/blocked storage
      fallback, and no source mutation.

20G. [x] **Chunk: Reconcile links, IDs, and document navigation**
    - Files: `src/app/links.ts`, `src/app/documents.ts`, link candidate and
      backlink modules, Rust link metadata/rewrite code, preview/editor
      components, and cross-feature tests
    - Change: Make wikilinks first-class in the shared parsed document model,
      including aliases, headings, colon-qualified targets, rendered link
      labels, unresolved states, and permanent internal-ID resolution. Ensure
      filename and folder renames continue to update supported references while
      YAML title changes do not. Heading IDs resolve only within the current
      document and never replace object identity.
    - Verify: Exact path, shortest unique target, alias, colon target,
      heading, duplicate, Unicode, unresolved, backlink, front-matter, code,
      and rename transaction fixtures in both source editor and rendered view.
      Confirm ambiguous links never open or rewrite arbitrary notes.
    - Risk/rollback: Mixing heading IDs and object IDs could break links or
      rewrite unrelated content. Keep separate typed resolution kinds and
      reuse the existing atomic rename transaction.
    - Expected changelog: None beyond the rendered wikilink behavior already
      recorded in Chunk 20D unless user-visible link behavior changes.
    - Verification result: Reused the stable-ID/path/name/alias resolver for
      rendered wikilinks, kept heading IDs separate from object IDs, and
      verified Preview navigation plus backtick-only source indexing.

20H. [ ] **Chunk: Full specification verification and release gate**
    - Files: all Markdown feature tests, fixture vaults, `docs/FEATURES.md`,
      `CHANGELOG.md`, `PROJECT.md`, `PLANS.md`, and packaging/QA notes
    - Change: Run the complete Markdown corpus and the full application flow
      against a disposable representative vault. Add a traceability matrix
      from every specification bullet to a test or native QA checkpoint,
      record bundle-size and baseline-machine timing, and document supported
      syntax, rendering security, settings, portability, and known limits.
    - Verify: `npm run format:check`, `npm run lint`, `npm run typecheck`,
      `npm test`, `npm run build`, `cargo fmt --check`, strict Clippy, all Rust
      tests, Tauri build/package checks, Browser/IAB rendered checks where
      available, native macOS 12/Intel smoke checks, keyboard and accessibility
      checks, and a seven-day stability observation on a backed-up vault copy.
      No test may require network access or expose vault contents in logs.
    - Risk/rollback: A green parser test suite is not enough if the native
      bundle is slow, unsafe, or incompatible with real vault files. Make the
      disposable-vault run, security checks, bundle budget, and source-byte
      diff review release blockers.
    - Expected changelog: Finalize the complete Markdown v1 support entry;
      no version change without an explicit release request.

21. [ ] **Epic: Build fast virtual collections and Scratchpad**
    - Outcome: Replace the physical file tree as the default navigation model
      with fast Inbox, Workbench, Archive, and Assets collections while keeping
      Files as a secondary physical-vault view. Retire active note-ID behavior,
      make archived notes read-only, add UTC lifecycle timestamps, and provide
      a lightweight local Scratchpad capture window without regressing writing,
      scrolling, or file safety.
    - Priority rule: Performance and stability are release-blocking product
      requirements. New collection UI does not begin until the large-vault link
      and tree interaction budgets pass. A feature that misses those budgets is
      reduced or deferred instead of shipping with known stalls.
    - Superseded behavior: Existing note `id` fields remain byte-preserved as
      ordinary user metadata, but Anchored stops generating, migrating,
      validating, repairing, warning about, protecting, or depending on note
      IDs. Stable vault IDs and Trash entry IDs remain because they do not
      require rewriting authored notes. This epic supersedes the note-ID parts
      of chunks 9, 10, 20C, 20D, and 20G without removing their historical
      record.
    - Collection rules:
      - Inbox: Markdown notes whose normalized `status` is missing, blank,
        null, unusable, or `inbox`.
      - Workbench: Markdown notes with any nonblank normalized `status` other
        than `inbox` or `archived`.
      - Archive: Markdown notes whose normalized `status` is `archived`.
      - Assets: every indexed non-Markdown file, regardless of its physical
        vault folder.
      - Files: the existing physical folder structure, exposed by a persisted
        Collections/Files toggle rather than as the default view.
      - Each item appears in exactly one top-level collection. Workbench groups
        by normalized front-matter `type`; Untyped appears first and every
        actual type value follows alphabetically. Assets group by file type and
        sort alphabetically within groups, with an optional flat alphabetical
        view.
    - Sidebar rules: Inbox, Workbench, every expanded Workbench type, Archive,
      and Assets display counts. System collections cannot be renamed,
      deleted, or treated as physical drag destinations. Physical folder
      actions remain available only in Files view through an opaque right-click
      menu; inline folder action icons are removed.
    - Timestamp rules: App-created Markdown files receive `created_at` in UTC,
      ISO 8601, second precision, with no fractional seconds, for example
      `2026-11-28T15:48:32Z`. Transitioning to Archive writes
      `status: archived` and a fresh `archived_at` in the same format.
      Transitioning out removes `archived_at` and writes either
      `status: inbox` or `status: active`. Existing and externally imported
      Markdown files are never backfilled automatically.
    - Archive rules: Archived notes open directly in the sanitized rendered
      read view. The editor and every ordinary save path reject archived notes.
      Dedicated Restore to Inbox and Restore to Workbench actions perform the
      only supported transition back to an editable state.
    - Scratchpad rules: Each capture is a separate Markdown note with
      `type: scratchpad`, `status: inbox`, and `created_at`. A reusable,
      lightweight floating window focuses immediately, creates the file only
      after the first non-whitespace input, autosaves atomically, flushes on
      close, discards a blank capture, and supports wikilink completion through
      the shared cached link index. `Command-Option-N` opens a new capture and
      `Command-Option-P` opens the most recent non-archived Scratchpad note.
      System-wide shortcuts remain deferred to GitHub issue #41.
    - Deferred asset import: Current non-Markdown files are indexed in place.
      Copying explicitly imported assets into a physical asset folder while
      preserving originals remains deferred to GitHub issue #40.
    - Performance budgets for the generated 700-note, 56-folder fixture:
      - Selection feedback paints within 50 ms.
      - A warm Markdown note up to 1 MiB becomes editable within 200 ms at p95;
        a cold open completes within 500 ms at p95 on the baseline machine.
      - Link topology and backlinks rebuild in no more than 100 ms for 700
        notes and 3,500 links, with no quadratic full-array scan per link.
      - Rapid top-to-bottom and direction-reversing file-tree scrolling shows
        no black gaps, missed input, or main-thread task longer than 50 ms.
      - A focus refresh never blocks editing or scrolling and reads note bodies
        only for new or signature-changed files.
      - The warm Scratchpad window focuses within 250 ms and remains responsive
        while wikilink suggestions and autosave run.
      - Measurements must be recorded on current development hardware and the
        2015 MacBook Pro baseline before the epic closes. If hardware evidence
        requires adjusting a numeric threshold, record the measurement and
        obtain human approval rather than silently weakening the gate.
    - Version impact: This is unreleased alpha behavior and does not change the
      version. A later release request may classify the collection/Scratchpad
      work as a minor release; no version, tag, package, or hosted release is
      authorized by this plan.

21A. [x] **Chunk: Establish contracts and performance harness**
    - Expected files: `OVERVIEW.md`, `PROJECT.md`, `PLANS.md`, generated
      large-vault fixture helpers, focused performance tests, and the manual QA
      checklist.
    - Change: Lock the collection, timestamp, archive, Scratchpad, note-ID
      retirement, and deferred-feature rules. Add deterministic fixture
      generation for 700 notes, 56 physical folders, realistic aliases and
      3,500 links, non-Markdown assets, duplicate filenames, missing/invalid
      metadata, and archived notes. Capture the current note-open, link-build,
      focus-refresh, and rapid-scroll baselines before changing behavior.
    - Verify: Fixture generation is deterministic and contains no private vault
      content. Measurements distinguish native scan time, IPC read time, React
      derivation, editor mount, and tree paint rather than reporting only total
      elapsed time.
    - Risk/rollback: Synthetic data can hide real-world costs. Calibrate file
      sizes and link density against aggregate counts from a representative
      backed-up vault without logging note names or content. Documentation and
      test harnesses are independently reversible.
    - Expected changelog: None; this chunk changes contracts and tests only.
    - Verification result: Added a deterministic native 700-note, 56-folder,
      3,500-link fixture that measures cold metadata reads, a zero-body-read
      warm refresh, one-file invalidation, and the existing 1,000-note search
      budget without using private vault content.

21B. [x] **Chunk: Retire active note-ID behavior safely**
    - Expected files: `src-tauri/src/metadata.rs`, `src-tauri/src/vault.rs`,
      `src-tauri/src/lib.rs`, `src/lib/tauri/vault.ts`, `src/app/App.tsx`,
      identity migration components/tests, `PROJECT.md`, and `CHANGELOG.md`.
    - Change: Remove note-ID generation from new files and Save As, identity
      baselines and reconciliation, migration commands/panels, identity save
      guards, conflict warnings, and recurring identity notifications. Use a
      runtime key derived from normalized relative path for document state and
      keep path-based safe rename/link rewriting. Do not delete or rewrite
      existing `id` properties or app-data baseline files; simply stop reading
      and using them. Keep `.anchored/vault.json` and Trash IDs unchanged.
    - Verify: Notes with missing, valid, duplicate, malformed, or multiple `id`
      fields all open, edit, save, rename, and move without identity-specific
      errors. Ordinary saves preserve untouched front matter; direct user edits
      to `id` behave like edits to any unknown property. No identity notice or
      migration action appears after repeated focus refreshes.
    - Risk/rollback: Frontend state currently uses IDs as keys and link rename
      code has identity-preferred paths. Replace each dependency atomically and
      test duplicate filenames and rename continuity before removing parsers.
      Rollback restores behavior without touching existing note contents.
    - Expected changelog: Note IDs are deferred; existing IDs remain preserved
      but no longer affect normal use.
    - Verification result: Native scans, creation, saves, rename/link rewrites,
      frontend document keys, recent activity, drag/move/rename/Trash actions,
      and notifications no longer inspect or require note IDs. Existing `id`
      frontmatter is preserved on untouched saves and behaves like any other
      user-editable property.

21C. [x] **Chunk: Build one incremental native vault index**
    - Expected files: a focused native index module, `src-tauri/src/vault.rs`,
      Tauri command registration, typed frontend snapshot contracts, and Rust
      tests.
    - Change: Replace repeated full-content passes with one rebuildable index
      keyed by canonical relative path plus size and modification time. Store
      only derived metadata in native app data: aliases, outgoing links,
      normalized status/type, created/archive timestamps, asset type, and file
      signature. Return cached snapshots immediately, refresh on a blocking
      worker, and read bodies only for new or changed Markdown files. Debounce
      focus refreshes and merge deltas rather than replacing the entire
      frontend document collection when nothing changed.
    - Verify: Initial build, warm reopen, Finder add/change/remove, rename,
      malformed cache, missing cache, external edits, same-size timestamp
      changes, symlinks, Unicode, oversized files, and cache rebuild. A warm
      focus refresh performs no Markdown body reads when signatures are
      unchanged and cannot block editor input.
    - Risk/rollback: A stale derived index could hide external changes. The
      filesystem remains authoritative; validate cache version and vault ID,
      replace cache atomically, expose refresh errors, and provide a full
      rebuild path. Never store note contents in the cache.
    - Expected changelog: Vault refresh and large-vault navigation become
      incremental and non-blocking.
    - Verification result: Added a versioned app-data cache keyed by vault ID,
      relative path, size, and modification time. Cached aliases, links,
      lifecycle properties, and type values are reused for unchanged notes;
      stale entries are dropped, malformed caches rebuild, changed notes alone
      are reread, and focus refresh runs on a blocking worker after a debounce.

21D. [x] **Chunk: Replace quadratic link and backlink work**
    - Expected files: `src/app/links.ts`, `src/app/linkCandidates.ts`, a new
      link-index module, retrieval/editor consumers, and focused tests.
    - Change: Build path, filename, alias, outgoing-link, and reverse-backlink
      maps once in linear time. Resolve supported links through map lookups,
      preserve ambiguity, and recompute only changed graph nodes. Separate
      candidate topology from recent-activity ranking so selecting a note does
      not rebuild all candidates. Calculate Quick Open and completion results
      only while their interfaces are open; reuse the same read-only index in
      Scratchpad.
    - Verify: Existing path/name/alias/heading/Unicode/ambiguity fixtures,
      incremental add/change/remove, rename transactions, 700-note performance,
      rapid note switching, and picker-open/closed render counts. Results must
      match the current supported resolver while meeting the 100 ms graph
      budget.
    - Risk/rollback: Faster indexing must not resolve an ambiguous link to an
      arbitrary note. Keep normalized keys mapped to sets, retain conservative
      unresolved states, and compare old/new resolver outputs on the complete
      fixture corpus before switching consumers.
    - Expected changelog: Note opening, backlinks, Quick Open, and wikilink
      suggestions no longer stall large vaults.
    - Verification result: Path, filename, alias, duplicate-name, and reverse
      backlink maps are built once and shared by backlinks, candidate creation,
      and Quick Open. The deterministic 700-note/3,500-link topology test
      completes under the 100 ms budget without resolving ambiguous links.

21E. [x] **Chunk: Stabilize the physical Files tree**
    - Expected files: `src/app/components/FileRail.tsx`, focused tree-model and
      row components/tests, `src/styles/global.css`, and `CHANGELOG.md`.
    - Change: Isolate tree rendering from editor and link state, use stable row
      callbacks and a gap-free scrolling strategy measured against the large
      fixture. Prefer rendering the complete simple row list up to a measured
      threshold with `content-visibility`; retain windowing only above that
      threshold if it passes direction-reversal tests. Remove inline folder
      action icons and keep actions in the right-click menu. Define and use
      opaque menu background/border tokens, clamp menus to the viewport, and
      retain keyboard/context-menu accessibility.
    - Verify: Slow and momentum scrolling, immediate direction reversals,
      selection during scroll, expand/collapse, filter, keyboard Home/End and
      arrows, right-click at every edge, 200% zoom, narrow/desktop windows, and
      700/2,000/10,000-row performance. No black gaps or multi-second stalls.
    - Risk/rollback: Rendering every row can increase mount cost while fragile
      windowing can expose blank regions. Select the simplest strategy that
      meets both mount and scroll budgets and preserve the old tree behind one
      focused revert until native QA passes.
    - Expected changelog: The Files tree scrolls reliably, folder actions move
      to an opaque context menu, and inline folder action icons are removed.
    - Verification result: The Files view now renders its complete lightweight
      row model with browser-native scrolling and per-row paint containment,
      removing the scroll-position state that could expose black gaps during
      rapid reversals. Folder actions are context-menu-only, menus use opaque
      tokens and viewport clamping, and focused App tests plus TypeScript pass.

21F. [x] **Chunk: Add virtual collection navigation**
    - Expected files: collection classification/model modules, sidebar
      components and tests, `src/app/App.tsx`, settings persistence, styles,
      and `CHANGELOG.md`.
    - Change: Make Collections the default sidebar mode and add a persisted
      Collections/Files toggle. Render Inbox, Workbench, Archive, and Assets
      with counts; group Workbench by type and Assets by file type; support
      collapsed groups and grouped/flat Assets sorting. Keep selection stable
      across views and show disambiguating relative paths only when filenames
      collide. System collections have no rename/delete controls.
    - Verify: Every status/type combination, malformed metadata, dynamic type
      values, assets without extensions, duplicate filenames, empty states,
      count updates after external changes, selection continuity, keyboard
      navigation, toggling, persistence, 200% zoom, and large-vault rendering.
    - Risk/rollback: A classification bug can hide a note. Assert that every
      indexed Markdown note belongs to exactly one lifecycle collection and
      that Files always exposes the physical source. Collection state is
      derived and can be reverted without changing vault contents.
    - Expected changelog: Add default Inbox, Workbench, Archive, and Assets
      navigation with counts and retain Files as a secondary view.
    - Verification result: Collections is now the persisted default and shows
      live Inbox, Workbench, Archive, and Assets counts without mutating vault
      files. Workbench renders Untyped first and every actual type in locale-
      aware alphabetical order; Assets supports grouped and A–Z lists. Tests
      cover lifecycle classification, ordering, persistence failures,
      duplicate-path labels, cross-view selection, and a 700-note model under
      the 100 ms classification budget.

21G. [ ] **Chunk: Add lifecycle timestamps and read-only Archive**
    - Expected files: `src-tauri/src/metadata.rs`, lifecycle mutation commands
      and tests, typed bridge, Archive/read-view components, `App.tsx`, and
      `CHANGELOG.md`.
    - Change: Add source-preserving atomic mutations for `created_at`, `status`,
      and `archived_at`. Stamp every Anchored-created Markdown file, including
      Save As and Scratchpad, with current UTC time. Archive and restore through
      dedicated commands with expected-content checks. Open archived notes in
      sanitized Preview, disable editor/save/autosave, and expose Restore to
      Inbox and Restore to Workbench. Remove `archived_at` on restore and write
      a new value on every later archive transition.
    - Verify: UTC formatting around second/minute/day/year boundaries, existing
      front matter comments/order/quotes, no-front-matter notes, CRLF/BOM,
      malformed or duplicate lifecycle fields, external conflicts, repeated
      archive/restore, Save As, Finder-import preservation, keyboard actions,
      rendered links, and native write refusal for archived notes.
    - Risk/rollback: Lifecycle transitions mutate authored Markdown. Re-read
      before write, refuse malformed/ambiguous fields, preserve unknown YAML,
      write atomically, and test only on synthetic or backed-up vaults first.
    - Expected changelog: New notes receive UTC creation timestamps; archived
      notes receive archive timestamps and remain read-only until restored.

21H. [ ] **Chunk: Add the lightweight local Scratchpad**
    - Expected files: a separate Scratchpad frontend entry and minimal styles,
      Tauri window/command configuration, shared wikilink picker adapter,
      lifecycle/native creation commands, shortcut wiring, and tests.
    - Change: Create one reusable small floating window that loads a minimal
      textarea-based Markdown capture surface rather than the full App or
      CodeMirror bundle. `Command-Option-N` resets it for a new separate note;
      `Command-Option-P` opens the newest non-archived Scratchpad note. Focus
      immediately, create on first non-whitespace input, autosave after a short
      idle interval, flush before hide/close, show save state, and offer bounded
      wikilink completion backed by the cached index. Use collision-safe UTC
      filenames and never trigger a full vault refresh from typing.
    - Verify: First and repeated open latency, new/previous shortcuts, rapid
      repeated invocation, blank close, Unicode/composition, paste, wikilink
      insertion, autosave and close flush, external edit conflict, no selected
      vault, archived previous captures, filename collision, app quit, window
      reuse, reduced motion, keyboard-only flow, and baseline-machine timing.
    - Risk/rollback: A second WebView can duplicate heavy bundles or race saves.
      Give Scratchpad a separate minimal entry, share data through narrow native
      commands, serialize writes, keep local drafts on conflict, and hide rather
      than destroy the warm window. Disable the shortcuts and window as one
      reversible feature if latency or safety gates fail.
    - Expected changelog: Add fast separate Scratchpad captures with Inbox
      metadata, local shortcuts, autosave, previous-capture access, and
      wikilinks. Global shortcuts remain deferred to issue #41.

21I. [ ] **Chunk: Complete performance, safety, and native QA**
    - Expected files: automated performance suites, manual QA checklist,
      `docs/FEATURES.md`, `PROJECT.md`, `PLANS.md`, and `CHANGELOG.md`.
    - Change: Run the complete Collections/Files, lifecycle, Archive, Assets,
      Scratchpad, links, typing, and filesystem journey against generated and
      representative backed-up vaults. Record before/after timings, final
      bundle impact, memory use, and baseline-hardware results. Remove stale
      identity documentation and confirm issues #40 and #41 remain deferred.
    - Verify: All configured formatting, lint, type-check, frontend/Rust tests,
      strict Clippy, production frontend and Tauri builds, disposable-vault
      byte-diff checks, native keyboard/accessibility checks, rapid scrolling,
      note switching, focus refresh, archived write refusal, Scratchpad close
      recovery, and every epic performance budget. Restart the seven-day
      stability observation after this epic lands.
    - Risk/rollback: Passing unit tests cannot prove native WebKit smoothness or
      vault safety. Treat failed native interaction budgets, unexplained file
      diffs, stale-cache behavior, or lost Scratchpad drafts as release
      blockers and revert the responsible focused chunk.
    - Expected changelog: Reconcile all user-visible entries from chunks 21B
      through 21H under `[Unreleased]`; do not change version without an
      explicit release request.

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
- 2026-07-18: The source editor now always applies CodeMirror Markdown syntax
  highlighting, with GFM enabled for the supported inline and block surface.
  Front matter is parsed separately and receives custom styling for YAML keys,
  values, list markers, comments, and delimiters. Typography settings expose
  persisted 12px, 14px, and 16px source-editor sizes. Frontend and Rust tests,
  quality gates, and the optimized macOS app bundle pass.
- 2026-07-19: Began the file-tree workspace pass. The tree will gain a
  normalized visible-row model, selection separate from expansion, keyboard
  navigation, context actions, type-aware file icons, and recoverable
  recursive folder deletion with typed confirmation. Large-vault rendering
  will be measured against a 700-file fixture before the chunk is complete.

- 2026-07-19: Completed the first file-tree workspace pass. Virtualized rows,
  separated selection and expansion, keyboard navigation, context actions,
  type-aware Lucide icons, non-empty-folder confirmation, recoverable folder
  Trash, and non-Markdown asset scanning are implemented and covered by the
  frontend and Rust checks. A representative 700-file interactive timing pass
  remains a follow-up for desktop hardware.
- 2026-07-19: Decoupled normal vault operations from note identity metadata.
  Rename and move link planning now falls back to a unique relative path when
  a note has no usable ID, identity warnings are informational, duplicate IDs
  can be repaired by the migration flow, and saves restore a valid existing ID
  when an editor draft omits it. Valid IDs remain protected from accidental
  changes, while malformed front matter and ambiguous references remain
  conservative safety stops.
- 2026-07-19: Approved Epic 21 as the next implementation sequence. The plan
  makes measured large-vault performance the release gate, retires note-ID
  behavior before building the cached index, then adds virtual lifecycle
  collections, archive timestamps and read-only behavior, and a lightweight
  Scratchpad. No Epic 21 implementation has started.
- 2026-07-19: Completed Epic 21B. Active note-ID generation, migration,
  validation, save guards, warnings, and runtime keys were removed without
  rewriting existing notes. Vault and Trash identities remain unchanged.
- 2026-07-19: Completed Epic 21A and 21C. A deterministic representative
  fixture now protects the large-vault path, and a persisted native metadata
  index reduces an unchanged focus refresh from 700 Markdown body reads to
  zero while refreshing changed notes individually off the UI thread.
- 2026-07-19: Completed Epic 21D. Shared map indexes replace repeated
  document-array scans for supported link resolution, backlinks, candidate
  creation, and Quick Open, and the representative topology passes its 100 ms
  automated budget.

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
