# Anchored

Anchored is a minimal local-first Markdown editor for macOS. It opens a folder
as a vault, edits the Markdown files directly, and maintains Obsidian-style
wikilinks, aliases, backlinks, and permanent note identities.

Anchored `0.1.0-alpha` is available as a private Intel Mac alpha for in-house
testing.
Use a backed-up or disposable vault until the seven-day stability observation
is complete. This package is not yet intended for public website downloads.

## Install the private macOS alpha

The current package supports Intel Macs running macOS 12 Monterey or later.
Build the verified ad-hoc-signed DMG from the repository:

```sh
npm ci
npm run release:alpha:macos
```

The command creates the DMG and a SHA-256 checksum in:

```text
src-tauri/target/release/bundle/dmg/
```

Open `Anchored_0.1.0-alpha_x64.dmg`, drag **Anchored** into **Applications**, eject
the disk image, and open Anchored from Applications. No terminal is required
after installation. A copy built locally on this Mac should open normally.
If macOS blocks an ad-hoc-signed copy after it has been transferred or
downloaded, use the explicit approval shown in **System Settings > Privacy &
Security** only when you trust the package and verified its checksum.

The packaging command verifies the app and DMG signatures, disk-image
integrity, Intel architecture, macOS 12 minimum version, and checksum before it
reports success.

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

## Synthetic test vault

A reusable fictional vault is included at:

```text
fixtures/test-vault
```

After Anchored opens:

1. Choose **Open vault**.
2. Select `fixtures/test-vault`.
3. Open any note in the file explorer. The exact Markdown becomes editable.
4. Use only as disposable test data; it contains no personal writing.

The fixture contains fictional aliases, body and front-matter wikilinks,
unresolved placeholders, duplicate filenames in different folders, and an empty
Markdown file.

## License

Anchored is open source under the [MIT License](LICENSE).

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
- [`docs/TEST_CHECKLIST.md`](docs/TEST_CHECKLIST.md) — complete feature,
  safety, accessibility, performance, and release checklist
- [`docs/ALPHA_STABILITY_LOG.md`](docs/ALPHA_STABILITY_LOG.md) — seven-day
  in-house stability record
- [`OVERVIEW.md`](OVERVIEW.md) — approved product intent
- [`PROJECT.md`](PROJECT.md) — technical contract and commands
- [`PLANS.md`](PLANS.md) — staged implementation and verification plan
- [`CHANGELOG.md`](CHANGELOG.md) — notable unreleased changes
- [`AGENTS.md`](AGENTS.md) — contribution and verification rules
