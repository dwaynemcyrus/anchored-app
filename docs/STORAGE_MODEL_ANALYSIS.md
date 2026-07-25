# Storage Model Analysis: Markdown-on-Disk vs. Bear-style SQLite

**Status:** draft analysis, not a decision. Nothing in this document changes
`PROJECT.md`, `OVERVIEW.md`, or `anchor-stuff.md`; it exists to inform a future
decision recorded in those files if one is made.

**Scope:** this document evaluates storage models for *authored notes* only —
the content type `anchor-stuff.md` §4 already recommends keeping in Markdown
(notes, essays, journal entries, book notes, permanent notes, scripts). It
does not revisit the already-approved use of SQLite for *structured
operational data* (habits, tasks, projects, reading progress, highlights,
search index, app state) — see `anchor-stuff.md` §2.2/§4 and `OVERVIEW.md`
§10. That boundary is settled; this document does not reopen it.

**Trigger:** a conversation about whether Anchored has to store notes as
`.md` files, prompted by comparison to Bear, which stores notes in a Core
Data (SQLite-backed) database rather than plain files on disk.

---

## 0. Three models, defined precisely

- **Model A — current.** `.md` files on disk in the vault are the canonical,
  live working store. `src-tauri/src/watcher.rs` watches the vault folder and
  reconciles external edits made by other programs. YAML front matter inside
  each file carries identity and lifecycle metadata. There is no database.
- **Model B — Bear-style.** SQLite is the canonical, live working store.
  `.md` files, if they exist on disk at all, are a generated/materialized
  export artifact derived from the database — not the thing Anchored reads
  from or writes to during normal use.
- **Model C — hybrid (Anchored's already-stated future direction).** Files
  remain canonical. SQLite is added only as an index/cache layer — a natural
  evolution of the rebuildable `vault-indexes/*.json` metadata cache that
  already exists in `vault.rs` — to accelerate search and relational queries
  without changing what "the note" actually is.

---

## 1. What problem would a database actually solve?

Anchored's current design has real, measurable friction that a database
could address:

- **Search is a linear scan.** `search_markdown_files` in
  `src-tauri/src/vault.rs:2683` reads every matching file's bytes on every
  query, bounded by `MAX_SEARCH_TOTAL_BYTES = 64 * 1024 * 1024` (64MB) and
  `MAX_SEARCH_RESULTS = 100` (`vault.rs:40-41`). There's no ranking, no
  full-text index — just a capped scan. This is the strongest, most
  measurable case for something like SQLite FTS5.
- **External-change rescans aren't incremental.** `PROJECT.md`'s "Known
  risks" section states plainly: "The native vault watcher debounces
  individual filesystem events but still triggers a full recursive vault
  rescan for any single external change, rather than an incremental update
  scoped to the changed path... bounded by vault size, not
  file-count-per-change." That cost grows with vault size regardless of how
  small the actual change was.
- **No real backlinks table.** Link/backlink information comes from
  re-parsing wikilink occurrences out of file text (via functions like those
  in `src-tauri/src/metadata.rs`), not from querying rows. Every relational
  question about the vault currently means re-deriving structure from text.
- **Multi-file renames aren't one transaction.** A rename that touches many
  files' links (`src-tauri/src/links.rs`) is applied as N independent
  atomic single-file writes — temp file + rename per file, per `PROJECT.md`'s
  write-safety rule — not one atomic operation. A crash mid-rename could
  leave some files rewritten and others not.

**But separate two different classes of problem**, because they have very
different solutions:

1. **Query/index performance** (search speed, backlink lookups, incremental
   rescans) — solvable by Model C alone, without touching what canonical
   storage is.
2. **Storage/consistency semantics** (true multi-file transactions, a single
   source of truth that can't drift from a foreign filesystem write) — only
   solvable by Model B.

This distinction matters because it determines whether a DB-*primary* pivot
is even necessary to get most of the benefit the user might actually want.

It's also worth naming what a database does *not* buy Anchored specifically:
this is a single-user local desktop app. SQLite's core strength — safe
concurrent multi-writer access — isn't really being purchased here, because
the one "other writer" that exists (an external editor touching the same
files) is exactly the case the watcher already exists to handle, and would
still need to be handled under Model B (see §3.5).

---

## 2. Module-by-module impact

| Module | Today | Under Model B (DB-primary) | Under Model C (DB-as-index) |
|---|---|---|---|
| `vault.rs` (~6,000 lines) — file CRUD, scanning, search, lifecycle, metadata cache | Reads/writes `.md` files via `std::fs`; linear-scan search; JSON metadata cache | Replaced almost entirely: CRUD becomes DB CRUD + FTS index maintenance; search becomes SQL queries; the existing JSON cache is subsumed by DB tables (it already plays that role, just as JSON) | Mostly kept as-is; the JSON cache upgrades to SQLite tables for the same rebuildable-index role it already has; file CRUD unchanged |
| `watcher.rs` (~300 lines) — debounced `notify`-based external change detection | Detects edits made in other programs, emits `VaultChange` to reconcile | Role inverts: must now detect edits to the *materialized export* files (if the user hand-edits them) and reconcile those back into the DB — a materially harder problem, see §3.5 | Unchanged — still the primary external-edit mechanism |
| `links.rs` (~400 lines) — rename-safe wikilink rewrite planning | Pure planning functions over `LinkNote`/`LinkSource` data structs; already storage-agnostic | Logic is largely reusable; "content" becomes a DB text column instead of file bytes; applying a rewrite becomes one `UPDATE`/transaction instead of N atomic file writes — arguably simpler here | Unchanged |
| `metadata.rs` (~1,470 lines) — front-matter parsing/mutation, identity stamping, wikilink occurrence scanning | Operates on in-memory string content parsed from files | Genuine design fork: do `status`/`aliases`/identity become real DB columns (front matter becomes export-only/vestigial), or must both representations stay in permanent sync? Front matter is currently the *only* metadata mechanism; a DB makes it optional for canonical storage but likely still needed for the exported `.md` representation | Unchanged; front matter stays canonical, cache tables are derived from it |
| `continuity.rs` (~1,240 lines) — vault identity registry + reversible-trash JSON sidecar | Atomic-write-then-rename JSON sidecar pattern (`.anchored`, `trash/`) | This pattern is essentially what SQLite would formalize; trash semantics (soft-delete rows with `deleted_at`) map naturally onto DB tables | Unchanged, or could pilot-migrate independently of the notes-storage decision (lowest-risk place to try SQLite first) |

`links.rs` and the trash/registry pattern in `continuity.rs` are already
written in the most storage-agnostic way in the codebase — worth noting as
the cheapest surface to touch first if a DB migration is ever attempted,
independent of whatever else is decided here.

---

## 3. The core tension: DB-primary with continuous file materialization

This section addresses the requirement given for this analysis directly: even
under Model B, notes should still be able to leave the app as real, portable
`.md` files on disk — generated from the database, not produced only by a
manual one-time export button.

Shared vocabulary: **materialization** = the process of generating a real
`.md` file on disk from a database row's content.

### 3.1 Synchronous export-on-save

Every save writes to the DB in a transaction, then immediately regenerates
the corresponding `.md` file on disk (reusing the existing atomic
temp-file-then-rename pattern already used in `vault.rs`).

- Staleness window: near-zero.
- But: Anchored writing its own export files would re-trigger `watcher.rs`'s
  own filesystem events, which today exist specifically to detect *external*
  changes. This requires a "self-write" suppression mechanism that doesn't
  exist in the codebase today and is itself a source of subtle bugs
  (missed suppressions cause phantom "external change" prompts; over-broad
  suppression risks swallowing a genuine concurrent external edit).
- Highest risk of silently clobbering a hand-edit: if the user or another
  program edits the exported `.md` file between materializations, the next
  save-triggered export can overwrite it without warning unless a
  hash/mtime check is added before every overwrite.

### 3.2 Background/debounced export sync

DB save completes immediately for a fast UI; a background worker (similar in
spirit to the debounce loop already in `watcher.rs`) batches dirty notes and
flushes them to disk after an idle window, decoupled from the save itself.

- Better write-amplification profile than 3.1.
- But: introduces a real staleness window — edits committed to the DB aren't
  yet visible as files. That's a direct hit to git-friendliness: committing
  mid-window captures a stale file, decoupling git history from actual
  authoring history.
- Needs its own crash-recovery story: if the app is killed with pending
  un-materialized changes, disk is now *behind* the DB, inverting today's
  guarantee that the visible file always reflects the last-known-good saved
  state.

### 3.3 On-demand / explicit export

No continuous sync. DB is canonical; files only materialize when the user
explicitly triggers export (or on quit, or via a manual "sync to disk"
action). This is closest to what Bear itself actually does.

- Simplest to build and reason about.
- Weakest fit to "not just a manual export button," but included as the
  honest floor/baseline option.
- Git-friendliness degrades to "only as fresh as the last export" — real-time
  authoring is no longer reflected in git history at all.

### 3.4 Dual-write / transactional both-stores

Every save writes to both the DB and the file as part of one logical
operation, with neither treated as strictly derived from the other.

- Named mainly to be ruled out: this doesn't resolve *which* store is
  canonical — it just relocates the conflict to "what happens when the two
  writes disagree, or one succeeds and the other fails." That's arguably a
  worse position than either pure model, since now there are two sources of
  truth that can each independently be right.

### 3.5 The cross-cutting problem: reconciling hand-edits to the exported file

This is the real crux. In Model A, watcher-driven reconciliation of external
edits *is* the architecture's entire reason for existing. In any DB-primary
model, an edit made to the exported `.md` file becomes a foreign write that
must be detected, parsed, and merged back into the DB — essentially
re-deriving Anchored's own file-import path, but now running continuously in
the background instead of once at vault-open time — or the materialization
system has to declare exported files read-only/disposable.

Two sub-options:

- **One-way (DB → disk only).** Simplest. Exported files are explicitly
  documented as "not safe to hand-edit" — any edit is lost on the next
  materialization. This breaks the "edit your notes in any other program"
  promise that is core to Anchored's current identity (`OVERVIEW.md` §6:
  "Dwayne retains direct ownership of Markdown files and can read or edit
  them with other compatible tools").
- **Bidirectional (disk edits flow back to DB).** Requires rebuilding most of
  the watcher + reconciliation machinery that Model A already has — except
  now aimed at keeping two stores in sync instead of one authoritative
  store reconciling foreign writes. This raises the natural question: if
  that machinery has to exist anyway, why not just keep files canonical in
  the first place? (This is the strongest argument for Model C over Model B.)

---

## 4. Interaction with Anchored's stated principles

`OVERVIEW.md` §10 ("Product principles that future phases must preserve")
and `PROJECT.md`'s "Source of truth" line are explicit and were approved on
2026-07-16/19. Checking Model B against each:

- **Local-first / file ownership.** `OVERVIEW.md` §6: "Dwayne retains direct
  ownership of Markdown files and can read or edit them with other
  compatible tools." Weakened by default under Model B — canonical data now
  lives inside a binary SQLite file, unreadable outside Anchored without
  export. Materialization (§3) can restore *read* access, but restoring
  reliable *write-and-have-it-count* access requires solving §3.5's hardest
  case.
- **Portability / no lock-in.** Same tension. If the export format can't
  perfectly round-trip every DB field (anything not representable in front
  matter), portability becomes asymmetric: export works, faithful re-import
  doesn't. Worth flagging explicitly rather than assuming symmetry.
- **Git-friendliness.** Today, git diffs/blame/history reflect real content
  changes at save granularity. Under 3.2 or 3.3, git only sees whatever was
  last materialized — a real, likely-noticeable regression from what exists
  today.
- **Offline access.** Non-differentiator: neither model requires network
  access.
- **Watcher-driven external-edit story.** The principle most directly in
  tension with Model B; see §3.5 for the full analysis.
- **"Markdown-first, not Markdown-only"** (`OVERVIEW.md` §10;
  `anchor-stuff.md` §2.2) already anticipates *some* content living outside
  Markdown — but draws the line at *structured operational data*
  (habits, tasks, projects, search index, app state), not authored notes.
  `anchor-stuff.md` §4's storage-model table lists "Notes → Markdown" as the
  recommendation even in the full long-term vision. **Model B would cross a
  line the project has already deliberately and explicitly drawn.** Adopting
  it is not a neutral technical choice — it's a reversal of a written,
  approved product decision (`PROJECT.md` Decisions log, 2026-07-16: "Keep
  the initial MVP database-free — Authored Markdown is the source of truth
  and structured operational modules are out of scope"), and should be named
  as such if it's ever proposed, not folded quietly into an unrelated change.

---

## 5. Options comparison

| Dimension | Model A (current) | Model B (DB-primary) | Model C (DB-as-index hybrid) |
|---|---|---|---|
| Search performance at scale | Linear scan, capped | Fast (FTS5) | Fast (FTS5 over indexed content) |
| Transactional consistency (multi-file ops) | N independent atomic writes | Real transactions | Unchanged from today (still N writes, but each individually safe) |
| Backlink/relational query richness | Re-parsed from text | Native, queryable | Native, queryable (via index tables) |
| Git-friendliness | Full fidelity | Degraded (staleness window, or export-only) | Full fidelity (unchanged) |
| Portability / no lock-in | Strong | Weakened unless §3.5 solved | Strong (unchanged) |
| External-edit compatibility ("edit in any other app") | Native, works today | Requires rebuilding reconciliation machinery, or forfeited | Native, works today (unchanged) |
| Implementation cost | — | High (new storage layer + materialization + reconciliation) | Moderate (extend existing JSON cache into SQL) |
| Migration cost for existing vault | None | One-time import of every note, highest-stakes bulk mutation the app has attempted | Low — indexes are already rebuildable by design |
| Alignment with approved principles | Full | Reverses an approved decision | Full — this *is* the approved future direction |
| How much of `vault.rs`/`watcher.rs`/`links.rs`/`metadata.rs` survives unchanged | 100% | Small minority | Large majority |

**Framing, not a verdict:**

- If the primary motivation is **search or backlink query performance**,
  Model C solves it without taking on §3/§4's risk profile, and is already
  the app's stated future direction (`anchor-stuff.md` §4, "search index →
  SQLite").
- If the primary motivation is **transactional integrity or genuine
  Bear-app product parity** (single DB file, no filesystem races, real
  transactions, zero export lag), Model B is the only option that actually
  delivers that — but only by accepting §3.5's reconciliation problem, which
  should be treated as the hardest unsolved piece and prototyped first,
  before anything else is built on top of it.

The choice between B and C is ultimately about what problem is actually
being solved for; both are compared here on their merits, and the decision
is left to the user.

---

## 6. Open questions and risks (early-alpha, single-user desktop context)

- **Migration cost.** The existing dev vault and the real Obsidian-derived
  vault would need a one-time import into SQLite under Model B — the
  highest-stakes bulk mutation the app has ever performed, per
  `PROJECT.md`'s existing rule that bulk changes require preview,
  recoverability, and targeted tests before touching a real vault. What's
  the rollback story if the import is lossy or wrong?
- **Note identity fork.** ULIDs currently live in front matter
  (`metadata.rs`). Under Model B, does the DB primary key become identity
  (front-matter ID becomes vestigial/export-only), or do the two need to
  stay in permanent sync — another consistency point to maintain?
- **SQLite file lifecycle.** Does the `.sqlite` file live inside the vault
  folder (travels with the vault, but now needs `.gitignore`, and is a
  single-file corruption risk with no external editor able to help recover
  it) or in app-data (meaning the vault folder alone is no longer sufficient
  to reconstruct notes without the app)? This is decision-relevant and
  unresolved here on purpose.
- **Backup story.** Today, backup = copy the vault folder; any file manager,
  Time Machine, git, or rsync "just works," matching `PROJECT.md`'s current
  informal backup approach. Under Model B, a naive folder copy taken
  mid-write (with an open WAL/journal file) can produce a corrupt or
  inconsistent backup unless the app coordinates checkpoints — a real risk
  for a tool whose backup method today is user-driven and informal.
- **Watcher/external-edit UX regression.** Today, "edit in Obsidian while
  Anchored is closed" just works on next open. Under Model B this requires
  §3.5's reconciliation machinery to exist and be trustworthy *before*
  reaching feature parity with what Model A already does for free — a hard
  prerequisite, not a nice-to-have add-on.
- **Alpha-stage timing.** Anchored is v0.1.3-alpha, pre-public-release, with
  one real user and one real vault (`PROJECT.md`, Owner: Dwayne Cyrus). The
  cost of getting this decision wrong is unusually low right now — there are
  no other users' vaults to migrate — but that cost only grows over time. If
  Model B is ever pursued, doing so before public distribution is
  meaningfully cheaper than after.
- **Scope creep.** Pursuing Model B reopens `PROJECT.md`'s "Keep the initial
  MVP database-free" decision, which has ripple effects across the Stack and
  Decisions sections beyond just notes storage. This document is scoped to
  notes storage only; a yes on Model B would need its own follow-up review
  of those sections rather than being treated as an isolated change.

---

## 7. Appendix

### Bear / Core Data, condensed

Bear stores notes as rows (`ZSFNOTE` table) in a Core Data store, which on
macOS/iOS is backed by SQLite. Bear's markdown-like syntax is a styling
convention applied to a text field in that database — not a portable file
format Bear reads from or writes to during normal use. Bear supports manual
export to `.md`, but does not maintain live `.md` files as its working
store; there is no equivalent of Anchored's vault-folder-is-the-app model.

### Citation index

| Claim | Source |
|---|---|
| "Database: none for the initial Markdown-editor MVP" | `PROJECT.md`, Stack section |
| "Keep the initial MVP database-free — Authored Markdown is the source of truth" | `PROJECT.md`, Decisions log, 2026-07-16 |
| "Files in the user-selected vault are authoritative for authored content" | `PROJECT.md`, Architecture and boundaries |
| Full recursive rescan per external change, not incremental | `PROJECT.md`, Known risks and constraints |
| Bulk metadata/link rewrites require preview, recoverability, targeted tests | `PROJECT.md`, Data and security → Backup/migration approach |
| "Dwayne retains direct ownership of Markdown files and can read or edit them with other compatible tools" | `OVERVIEW.md` §6 |
| "Markdown-first, not Markdown-only: human-authored knowledge belongs in Markdown; future structured operational data may use SQLite" | `OVERVIEW.md` §10 |
| Storage-model table (Notes → Markdown; Habits/Tasks/Projects/Search index → SQLite) | `anchor-stuff.md` §4 |
| "Structured operational data should use SQLite" (habits, tasks, projects, search indexes, app state) | `anchor-stuff.md` §2.2 |
| `MAX_SEARCH_TOTAL_BYTES` / `MAX_SEARCH_RESULTS` constants | `src-tauri/src/vault.rs:40-41` |
| `search_markdown_files` linear-scan implementation | `src-tauri/src/vault.rs:2683` |
| Debounced `notify`-based watcher | `src-tauri/src/watcher.rs` |
