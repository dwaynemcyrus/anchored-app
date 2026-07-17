# Anchored

Anchored is a minimal local-first Markdown editor for macOS. It opens a folder
as a vault, edits the Markdown files directly, and maintains Obsidian-style
wikilinks, aliases, backlinks, and permanent note identities.

Anchored is still under development. Use a backed-up or disposable vault until
the release candidate and seven-day stability observation are complete.

## Run the development app

Install dependencies once:

```sh
npm ci
```

Then launch the native macOS app:

```sh
npm run tauri dev
```

The launch preflight uses port `1420`. If a stale Anchored interface server is
holding that port, it is stopped automatically. If another application owns
the port, the terminal identifies that process so it can be closed safely.

Only run one `npm run tauri dev` command at a time. Close the Anchored window
and stop its terminal with Control-C when testing is finished.

## Smoke-test vault

A reusable disposable vault is included at:

```text
/Users/cyrus/Code/anchored-app-macos/fixtures/smoke-vault
```

After Anchored opens:

1. Choose **Open vault**.
2. Select `fixtures/smoke-vault`.
3. Open any note in the file explorer. The exact Markdown becomes editable.
4. Follow the complete checklist in
   [`fixtures/SMOKE_TEST.md`](fixtures/SMOKE_TEST.md).

The fixture contains aliases, body and front-matter wikilinks, unresolved
placeholders, duplicate filenames in different folders, Unicode search text,
and an empty Markdown file.

## Retrieval shortcuts

| Action | Shortcut |
|---|---|
| Quick Open by filename or alias | Command-P |
| Search Markdown across the vault | Command-Shift-F |
| Find inside the active note | Command-F |
| Save the active note | Command-S |
| Save As | Command-Shift-S |
| Create a note | Command-N |

## Quality checks

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Project documents

- [`docs/FEATURES.md`](docs/FEATURES.md) — current feature and limitation
  reference
- [`docs/PUBLIC_TEST_CHECKLIST.md`](docs/PUBLIC_TEST_CHECKLIST.md) — repeatable
  pre-release and public-testing checklist
- [`OVERVIEW.md`](OVERVIEW.md) — approved product intent
- [`PROJECT.md`](PROJECT.md) — technical contract and commands
- [`PLANS.md`](PLANS.md) — staged implementation and verification plan
- [`CHANGELOG.md`](CHANGELOG.md) — notable unreleased changes
- [`AGENTS.md`](AGENTS.md) — contribution and verification rules
