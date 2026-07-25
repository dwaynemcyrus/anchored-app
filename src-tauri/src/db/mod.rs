//! Canonical store. Every function here takes a `&Connection` rather than an
//! `AppHandle` so the whole module is unit-testable against a temporary file,
//! following the same split `scan_vault_paths_patch` already uses in `vault`.

mod conflicts;
mod documents;
mod import;
mod keys;
mod projection;
mod schema;
mod search;

pub(crate) use conflicts::{NoteVersion, VaultConflict};

use std::path::Path;

use rusqlite::{params, Connection};

use crate::vault::VaultError;

pub(crate) const DATABASE_NAME: &str = "vault.db";

fn map_error(context: &'static str) -> impl FnOnce(rusqlite::Error) -> VaultError {
    move |error| VaultError::state(format!("{context}: {error}"))
}

/// The one place a vault root becomes a database path.
///
/// The root is canonicalized first because two spellings of the same directory
/// — `/var/…` and `/private/var/…`, or a path reached through a symlink —
/// would otherwise each get their own database, silently splitting the index
/// in two. Commands already canonicalize before they get here; this makes the
/// guarantee independent of them.
pub(crate) fn database_path(root: &Path) -> std::path::PathBuf {
    std::fs::canonicalize(root)
        .unwrap_or_else(|_| root.to_path_buf())
        .join(crate::continuity::INTERNAL_DIRECTORY_NAME)
        .join(DATABASE_NAME)
}

/// Imports every file in the vault in one transaction, then resolves links and
/// drops rows for files that are no longer there.
///
/// Files remain canonical at this stage: nothing reads back from these rows.
/// The import is idempotent, so running it repeatedly converges on whatever is
/// on disk rather than accumulating.
pub(crate) fn import_vault(
    connection: &mut Connection,
    root: &Path,
    markdown_paths: &[String],
    asset_paths: &[String],
) -> Result<usize, VaultError> {
    let transaction = connection
        .transaction()
        .map_err(map_error("The vault import could not be started"))?;

    let indexed = documents::indexed_signatures(&transaction)?;
    let mut present = Vec::with_capacity(markdown_paths.len() + asset_paths.len());
    for (paths, is_markdown) in [(markdown_paths, true), (asset_paths, false)] {
        for relative_path in paths {
            let path = root.join(relative_path);
            // A file that vanished between the scan and the read is skipped
            // rather than failing the import; the next pass will settle it.
            let Ok(metadata) = std::fs::metadata(&path) else {
                continue;
            };
            let signature = file_signature(&metadata);
            let path_key = keys::path_key(relative_path);

            // Reading a file only to discover it is unchanged is the cost this
            // avoids: on a warm vault almost nothing needs opening.
            if indexed.get(&path_key) == Some(&signature) {
                present.push(path_key);
                continue;
            }

            let Ok(bytes) = std::fs::read(&path) else {
                continue;
            };
            let mut document = if is_markdown {
                import::import_note(relative_path, &bytes)
            } else {
                import::import_asset(relative_path, &bytes)
            };
            document.mtime_millis = signature.1;
            documents::upsert(&transaction, &document)?;
            present.push(document.path_key);
        }
    }

    documents::resolve_links(&transaction)?;
    documents::delete_missing(&transaction, &present)?;
    transaction
        .commit()
        .map_err(map_error("The vault import could not be committed"))?;
    Ok(present.len())
}

/// Re-imports a named set of paths in one transaction, dropping the row for
/// any that is no longer on disk.
///
/// Used after Anchored changes files itself, so the index does not depend on
/// a filesystem event making the round trip back to the app.
pub(crate) fn import_paths(root: &Path, relative_paths: &[String]) -> Result<(), VaultError> {
    if relative_paths.is_empty() {
        return Ok(());
    }

    let mut connection = open(&database_path(root))?;
    let transaction = connection
        .transaction()
        .map_err(map_error("The vault index could not be updated"))?;

    let indexed = documents::indexed_signatures(&transaction)?;
    let mut touched = Vec::with_capacity(relative_paths.len());
    let mut document_set_changed = false;
    for relative_path in relative_paths {
        let path = root.join(relative_path);

        // Anchored's own writes record the resulting size and time on the row
        // before the watcher can report them, so a file matching what was
        // recorded is a write of ours coming back around, not an external edit.
        // Skipping it is what stops a projection from re-importing itself.
        if let Ok(metadata) = std::fs::metadata(&path) {
            if indexed.get(&keys::path_key(relative_path)) == Some(&file_signature(&metadata)) {
                continue;
            }
        }

        match std::fs::read(&path) {
            Ok(bytes) => {
                let mut document = if is_markdown_path(relative_path) {
                    import::import_note(relative_path, &bytes)
                } else {
                    import::import_asset(relative_path, &bytes)
                };
                document.mtime_millis = std::fs::metadata(&path)
                    .map(|metadata| file_signature(&metadata).1)
                    .unwrap_or_default();
                let upserted = documents::upsert(&transaction, &document)?;
                document_set_changed |= upserted.created;
                touched.push(upserted.id);
            }
            Err(_) => {
                documents::delete_by_path(&transaction, relative_path)?;
                document_set_changed = true;
            }
        }
    }

    // Adding or removing a document changes what *other* notes' links point
    // at, so everything is re-resolved. An edit in place can only change the
    // links leaving that one note, and re-resolving the whole table on every
    // autosave would scale with vault size instead of with the change.
    if document_set_changed {
        documents::resolve_links(&transaction)?;
    } else {
        for id in touched {
            documents::resolve_links_from(&transaction, id)?;
        }
    }

    transaction
        .commit()
        .map_err(map_error("The vault index could not be committed"))
}

/// Size paired with modification time, the same staleness signal the JSON
/// metadata cache used. Not a content hash: this only decides whether a file
/// is worth opening.
fn file_signature(metadata: &std::fs::Metadata) -> (u64, u64) {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|elapsed| elapsed.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or_default();
    (metadata.len(), modified)
}

/// Reads every note's indexed metadata, for filling in a snapshot without
/// opening files. `Ok(None)` means the caller should read files instead.
pub(crate) fn indexed_metadata(
    root: &Path,
) -> Result<Option<std::collections::HashMap<String, documents::IndexedMetadata>>, VaultError> {
    let Ok(connection) = open(&database_path(root)) else {
        return Ok(None);
    };
    if read_source(&connection) == ReadSource::Scan {
        return Ok(None);
    }
    documents::indexed_metadata(&connection).map(Some)
}

fn is_markdown_path(relative_path: &str) -> bool {
    std::path::Path::new(relative_path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
}

/// Writes identities the index holds back into the notes that lack them.
///
/// Returns how many files changed. Projection is off unless explicitly
/// enabled, because this is the first thing in this work that modifies a
/// user's notes rather than only reading them.
pub(crate) fn project_vault(root: &Path) -> Result<usize, VaultError> {
    let connection = open(&database_path(root))?;
    if !projection_enabled(&connection) {
        return Ok(0);
    }
    projection::project_pending_identities(root, &connection)
}

/// Records that a note has gone to the trash, keeping its row, identity and
/// history so a restore returns the same note rather than a copy of it.
pub(crate) fn trash_note(root: &Path, relative_path: &str, trash_entry_id: &str) {
    let Ok(connection) = open(&database_path(root)) else {
        return;
    };
    if let Err(error) = documents::soft_delete(&connection, relative_path, trash_entry_id) {
        eprintln!("The trashed note could not be recorded: {}", error.message);
    }
}

/// Re-attaches a restored note to its row.
pub(crate) fn restore_note(root: &Path, trash_entry_id: &str, relative_path: &str) {
    let Ok(connection) = open(&database_path(root)) else {
        return;
    };
    if let Err(error) = documents::restore_from_trash(&connection, trash_entry_id, relative_path) {
        eprintln!("The restored note could not be recorded: {}", error.message);
    }
}

/// Saves a note: commits the contents and writes the file together.
///
/// `Ok(false)` means the index could not be opened and the caller should write
/// the file the old way. Saving must never be the thing that fails.
pub(crate) fn save_note(
    root: &Path,
    relative_path: &str,
    content: &str,
) -> Result<bool, VaultError> {
    let Ok(mut connection) = open(&database_path(root)) else {
        return Ok(false);
    };
    if read_source(&connection) == ReadSource::Scan {
        return Ok(false);
    }
    projection::save(&mut connection, root, relative_path, content).map(|()| true)
}

/// The kept earlier copies of one note, newest first.
pub(crate) fn note_versions(
    root: &Path,
    relative_path: &str,
) -> Result<Vec<conflicts::NoteVersion>, VaultError> {
    let Ok(connection) = open(&database_path(root)) else {
        return Ok(Vec::new());
    };
    conflicts::versions_for(&connection, relative_path)
}

/// Every note currently changed in two places at once. Both versions of each
/// are preserved under `.anchored/conflicts/` and readable from there.
pub(crate) fn list_conflicts(root: &Path) -> Result<Vec<conflicts::VaultConflict>, VaultError> {
    let Ok(connection) = open(&database_path(root)) else {
        return Ok(Vec::new());
    };
    conflicts::list(&connection)
}

/// Classifies how every note's row and file stand, without changing either.
/// Runs when a vault opens, after the import has caught the index up.
pub(crate) fn reconcile_vault(root: &Path) -> Result<projection::Reconciliation, VaultError> {
    let connection = open(&database_path(root))?;
    projection::reconcile(root, &connection)
}

pub(crate) const PROJECTION_SETTING: &str = "writes.projection";
const PROJECTION_ENV: &str = "ANCHORED_PROJECTION";

/// Off by default. A vault is only written to when the setting or the
/// environment variable turns it on, so the projection can be stopped without
/// shipping a new build.
fn projection_enabled(connection: &Connection) -> bool {
    if let Ok(value) = std::env::var(PROJECTION_ENV) {
        return is_enabled(&value);
    }
    connection
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![PROJECTION_SETTING],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .is_some_and(|value| is_enabled(&value))
}

fn is_enabled(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "on" | "true" | "yes"
    )
}

#[cfg(test)]
pub(crate) fn set_setting(
    connection: &Connection,
    key: &str,
    value: &str,
) -> Result<(), VaultError> {
    connection
        .execute(
            "INSERT INTO settings (key, value, updated_millis) VALUES (?1, ?2, 0)
             ON CONFLICT(key) DO UPDATE SET value = ?2",
            params![key, value],
        )
        .map(drop)
        .map_err(map_error("The setting could not be recorded"))
}

/// Searches the vault through the index.
///
/// `Ok(None)` means the caller should fall back to scanning files, either
/// because reads are switched to the scan path or because the index is not
/// usable. Search must not be the thing that makes a vault unopenable.
pub(crate) fn search_vault(
    root: &Path,
    query: &str,
) -> Result<Option<crate::vault::VaultSearchResult>, VaultError> {
    let Ok(connection) = open(&database_path(root)) else {
        return Ok(None);
    };
    if read_source(&connection) == ReadSource::Scan {
        return Ok(None);
    }
    search::search(&connection, query).map(Some)
}

/// Where the interface's reads are served from.
///
/// Serving reads from the index is the first change in this work that a user
/// can see go wrong, so the file-scanning path stays compiled and reachable
/// until it has proven itself. The environment variable is checked first so a
/// vault whose database is the problem can still be opened.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ReadSource {
    Database,
    Scan,
}

pub(crate) const READ_SOURCE_SETTING: &str = "reads.source";
const READ_SOURCE_ENV: &str = "ANCHORED_READS";

pub(crate) fn read_source(connection: &Connection) -> ReadSource {
    if let Ok(value) = std::env::var(READ_SOURCE_ENV) {
        return parse_read_source(&value);
    }
    connection
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![READ_SOURCE_SETTING],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .map_or(ReadSource::Database, |value| parse_read_source(&value))
}

fn parse_read_source(value: &str) -> ReadSource {
    if value.trim().eq_ignore_ascii_case("scan") {
        ReadSource::Scan
    } else {
        ReadSource::Database
    }
}

#[cfg(test)]
pub(crate) fn set_read_source(connection: &Connection, value: &str) -> Result<(), VaultError> {
    connection
        .execute(
            "INSERT INTO settings (key, value, updated_millis) VALUES (?1, ?2, 0)
             ON CONFLICT(key) DO UPDATE SET value = ?2",
            params![READ_SOURCE_SETTING, value],
        )
        .map(drop)
        .map_err(map_error("The read source could not be recorded"))
}

/// Opens the vault database, applying pragmas and any pending migrations.
pub(crate) fn open(path: &Path) -> Result<Connection, VaultError> {
    let connection =
        Connection::open(path).map_err(map_error("The vault database could not be opened"))?;
    configure(&connection)?;
    migrate(&connection)?;
    Ok(connection)
}

/// `foreign_keys` is per-connection rather than persistent, so it has to be set
/// every time a connection is opened, not once at creation.
fn configure(connection: &Connection) -> Result<(), VaultError> {
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(map_error(
            "The vault database journal could not be configured",
        ))?;
    for (pragma, value) in [
        ("synchronous", "NORMAL"),
        ("foreign_keys", "ON"),
        ("busy_timeout", "5000"),
        ("journal_size_limit", "6291456"),
    ] {
        connection
            .pragma_update(None, pragma, value)
            .map_err(map_error("The vault database could not be configured"))?;
    }
    Ok(())
}

/// Applies migrations the database has not seen yet. `user_version` counts how
/// many have run, so re-running is a no-op and a database from a newer build is
/// refused rather than downgraded.
fn migrate(connection: &Connection) -> Result<(), VaultError> {
    let transaction = connection
        .unchecked_transaction()
        .map_err(map_error("The vault database could not be migrated"))?;
    let applied: usize = transaction
        .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
        .map_err(map_error("The vault database version could not be read"))?
        .try_into()
        .map_err(|_| VaultError::state("The vault database version is invalid."))?;

    if applied > schema::MIGRATIONS.len() {
        return Err(VaultError::state(
            "This vault database was written by a newer version of Anchored.",
        ));
    }

    for statements in &schema::MIGRATIONS[applied..] {
        transaction
            .execute_batch(statements)
            .map_err(map_error("The vault database could not be migrated"))?;
    }

    // PRAGMA does not accept a bound parameter, and the value is a literal
    // array length rather than anything reaching this from outside.
    transaction
        .pragma_update(None, "user_version", schema::MIGRATIONS.len() as i64)
        .map_err(map_error(
            "The vault database version could not be recorded",
        ))?;
    transaction.commit().map_err(map_error(
        "The vault database migration could not be committed",
    ))
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use tempfile::tempdir;

    use super::{migrate, open, schema::MIGRATIONS};

    fn user_version(connection: &Connection) -> i64 {
        connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read user_version")
    }

    /// Guards the scoped-resolution rule: re-resolving every link on each
    /// autosave would make a save cost grow with vault size.
    ///
    /// Deliberately a comparison rather than a wall-clock budget. An absolute
    /// millisecond limit fails intermittently whenever the suite runs in
    /// parallel on a busy machine, whereas both halves of a ratio feel the
    /// same load.
    #[test]
    fn an_edit_in_place_does_not_scale_with_vault_size() {
        fn time_one_save(note_count: usize) -> std::time::Duration {
            let vault = tempdir().expect("create fixture vault");
            crate::continuity::ensure_vault_identity(vault.path()).expect("create identity");
            let mut connection =
                open(&super::database_path(vault.path())).expect("create database");
            let mut paths = Vec::new();
            for index in 0..note_count {
                let name = format!("Note {index:04}.md");
                let body = format!(
                    "# Note {index}\n[[Note {:04}]]\n[[Note {:04}]]\n",
                    (index + 1) % note_count,
                    (index + 7) % note_count
                );
                std::fs::write(vault.path().join(&name), body).expect("write note");
                paths.push(name);
            }
            super::import_vault(&mut connection, vault.path(), &paths, &[]).expect("seed");
            drop(connection);

            let edited = vec![paths[note_count / 2].clone()];
            for _ in 0..3 {
                super::import_paths(vault.path(), &edited).expect("warm");
            }
            let start = std::time::Instant::now();
            for _ in 0..20 {
                super::import_paths(vault.path(), &edited).expect("index one save");
            }
            start.elapsed() / 20
        }

        let small = time_one_save(20);
        let large = time_one_save(600);

        // Thirty times the notes. Resolving only the edited note's links keeps
        // this nearly flat; re-resolving the whole table would not.
        assert!(
            large < small * 4,
            "one save cost {large:?} over 600 notes against {small:?} over 20"
        );
    }

    #[test]
    fn compiles_sqlite_with_fts5_available() {
        let connection = Connection::open_in_memory().expect("open in-memory database");

        connection
            .execute_batch("CREATE VIRTUAL TABLE probe USING fts5(body)")
            .expect("FTS5 must be compiled into the bundled SQLite");
    }

    #[test]
    fn applies_every_migration_once() {
        let directory = tempdir().expect("create fixture directory");
        let path = directory.path().join("vault.db");

        let connection = open(&path).expect("open new database");

        assert_eq!(user_version(&connection), MIGRATIONS.len() as i64);
        assert_eq!(
            connection
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'documents'",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .expect("look up documents table"),
            1
        );
    }

    #[test]
    fn migrating_twice_changes_nothing() {
        let directory = tempdir().expect("create fixture directory");
        let path = directory.path().join("vault.db");
        let connection = open(&path).expect("open new database");

        migrate(&connection).expect("re-run migrations");

        assert_eq!(user_version(&connection), MIGRATIONS.len() as i64);
    }

    #[test]
    fn keeps_pragmas_applied_across_reopen() {
        let directory = tempdir().expect("create fixture directory");
        let path = directory.path().join("vault.db");
        drop(open(&path).expect("create database"));

        let connection = open(&path).expect("reopen database");

        assert_eq!(
            connection
                .query_row("PRAGMA journal_mode", [], |row| row.get::<_, String>(0))
                .expect("read journal_mode"),
            "wal"
        );
        assert_eq!(
            connection
                .query_row("PRAGMA foreign_keys", [], |row| row.get::<_, i64>(0))
                .expect("read foreign_keys"),
            1
        );
    }

    #[test]
    fn refuses_a_database_from_a_newer_build() {
        let directory = tempdir().expect("create fixture directory");
        let path = directory.path().join("vault.db");
        let connection = open(&path).expect("create database");
        connection
            .pragma_update(None, "user_version", MIGRATIONS.len() as i64 + 1)
            .expect("simulate a newer build");

        let error = migrate(&connection).expect_err("refuse a newer database");

        assert_eq!(error.code, "vaultStateError");
    }

    #[test]
    fn creates_the_database_inside_the_vaults_hidden_directory() {
        let vault = tempdir().expect("create fixture vault");
        crate::continuity::ensure_vault_identity(vault.path()).expect("create identity");
        let path = super::database_path(vault.path());

        drop(open(&path).expect("create database"));

        assert!(vault.path().join(".anchored").join("vault.db").is_file());
        drop(open(&path).expect("reopen an existing database"));
    }

    #[test]
    fn imports_a_whole_vault_idempotently() {
        let vault = tempdir().expect("create fixture vault");
        crate::continuity::ensure_vault_identity(vault.path()).expect("create identity");
        std::fs::write(vault.path().join("Harbor.md"), "# Harbor\n[[Planning]]\n")
            .expect("write note");
        std::fs::write(vault.path().join("Planning.md"), "# Planning\n").expect("write note");
        let markdown = vec!["Harbor.md".to_owned(), "Planning.md".to_owned()];
        let mut connection = open(&super::database_path(vault.path())).expect("create database");

        let first =
            super::import_vault(&mut connection, vault.path(), &markdown, &[]).expect("import");
        let identities: Vec<String> = document_uuids(&connection);
        let second =
            super::import_vault(&mut connection, vault.path(), &markdown, &[]).expect("re-import");

        assert_eq!((first, second), (2, 2));
        assert_eq!(
            identities,
            document_uuids(&connection),
            "re-importing must not mint new identities"
        );
        // A root-level note is addressable as a path, which outranks the
        // filename rule; what matters here is that it stayed resolved.
        let (resolution, target): (String, Option<i64>) = connection
            .query_row(
                "SELECT resolution, target_document_id FROM links WHERE target_raw = 'Planning'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read link");
        assert_eq!(resolution, "path");
        assert!(
            target.is_some(),
            "re-import must not orphan a resolved link"
        );
    }

    /// The whole point of recording size and modification time: a second
    /// import of an unchanged vault must not open any file again.
    #[test]
    fn skips_reading_files_that_have_not_changed() {
        let vault = tempdir().expect("create fixture vault");
        crate::continuity::ensure_vault_identity(vault.path()).expect("create identity");
        std::fs::write(vault.path().join("Harbor.md"), "# Harbor\n").expect("write note");
        std::fs::write(vault.path().join("Planning.md"), "# Planning\n").expect("write note");
        let markdown = vec!["Harbor.md".to_owned(), "Planning.md".to_owned()];
        let mut connection = open(&super::database_path(vault.path())).expect("create database");
        super::import_vault(&mut connection, vault.path(), &markdown, &[]).expect("first import");
        fn revisions(connection: &Connection) -> Vec<i64> {
            connection
                .prepare("SELECT revision FROM documents ORDER BY path_key")
                .expect("prepare")
                .query_map([], |row| row.get(0))
                .expect("query")
                .collect::<Result<_, _>>()
                .expect("collect")
        }
        let before = revisions(&connection);

        super::import_vault(&mut connection, vault.path(), &markdown, &[]).expect("second import");

        assert_eq!(
            revisions(&connection),
            before,
            "an unchanged file must not be re-read and rewritten"
        );

        std::fs::write(vault.path().join("Harbor.md"), "# Harbor edited\n").expect("edit note");
        super::import_vault(&mut connection, vault.path(), &markdown, &[]).expect("third import");

        let after = revisions(&connection);
        assert_eq!(after[1], before[1], "the untouched note is left alone");
        assert_eq!(after[0], before[0] + 1, "the edited note is re-read");
    }

    /// The loop this has to avoid: projection writes a file, the watcher
    /// reports it, the importer treats it as an external edit and re-imports
    /// it, which marks the row changed and invites another projection.
    #[test]
    fn does_not_re_import_its_own_projected_write() {
        let vault = tempdir().expect("create fixture vault");
        let root = vault.path();
        crate::continuity::ensure_vault_identity(root).expect("create identity");
        std::fs::write(root.join("Harbor.md"), "# Harbor\n").expect("write note");
        let paths = vec!["Harbor.md".to_owned()];
        let mut connection = open(&super::database_path(root)).expect("create database");
        super::import_vault(&mut connection, root, &paths, &[]).expect("index the note");
        super::set_setting(&connection, super::PROJECTION_SETTING, "on")
            .expect("enable projection");
        drop(connection);

        assert_eq!(super::project_vault(root).expect("project"), 1);
        let connection = open(&super::database_path(root)).expect("reopen database");
        let after_projection: i64 = connection
            .query_row("SELECT revision FROM documents", [], |row| row.get(0))
            .expect("read revision");
        drop(connection);

        // Exactly what the watcher would trigger moments after the write.
        super::import_paths(root, &paths).expect("re-import the projected path");

        let connection = open(&super::database_path(root)).expect("reopen database");
        let (revision, state): (i64, String) = connection
            .query_row(
                "SELECT documents.revision, sync_records.state
                 FROM documents JOIN sync_records ON sync_records.document_id = documents.id",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read revision and sync state");
        assert_eq!(
            revision, after_projection,
            "Anchored's own write must not count as a change"
        );
        assert_eq!(state, "synced");
    }

    #[test]
    fn still_imports_a_genuine_external_edit_after_projecting() {
        let vault = tempdir().expect("create fixture vault");
        let root = vault.path();
        crate::continuity::ensure_vault_identity(root).expect("create identity");
        std::fs::write(root.join("Harbor.md"), "# Harbor\n").expect("write note");
        let paths = vec!["Harbor.md".to_owned()];
        let mut connection = open(&super::database_path(root)).expect("create database");
        super::import_vault(&mut connection, root, &paths, &[]).expect("index the note");
        super::set_setting(&connection, super::PROJECTION_SETTING, "on")
            .expect("enable projection");
        drop(connection);
        super::project_vault(root).expect("project");

        let projected =
            std::fs::read_to_string(root.join("Harbor.md")).expect("read the projected note");
        std::fs::write(
            root.join("Harbor.md"),
            format!("{projected}\nEdited elsewhere\n"),
        )
        .expect("edit the note outside Anchored");
        super::import_paths(root, &paths).expect("import the external edit");

        let connection = open(&super::database_path(root)).expect("reopen database");
        let body: String = connection
            .query_row("SELECT body FROM documents", [], |row| row.get(0))
            .expect("read body");
        assert!(
            body.contains("Edited elsewhere"),
            "a real external edit must still be imported"
        );
    }

    /// Mirrors what opening a vault actually does — import, reconcile,
    /// project — and does it twice. The second open must change nothing on
    /// disk. Verifying this against the development fixture is impossible
    /// because that vault is deleted and re-copied on every launch.
    #[test]
    fn opening_a_vault_twice_leaves_every_file_byte_identical() {
        let vault = tempdir().expect("create fixture vault");
        let root = vault.path();
        crate::continuity::ensure_vault_identity(root).expect("create identity");
        let notes = [
            ("Plain.md", "# Plain\n\nBody\n"),
            (
                "Stamped.md",
                "---\nid: 019f989c-2dc0-7a01-8b2c-4d5e6f708192\n---\n# Stamped\n",
            ),
            (
                "Hand Written.md",
                "---\n# comment\ntitle: 'Kept'\n---\nBody\n",
            ),
            ("Broken.md", "---\nid: [\n---\n# Broken\n"),
        ];
        for (name, content) in notes {
            std::fs::write(root.join(name), content).expect("write note");
        }
        let paths: Vec<String> = notes.iter().map(|(name, _)| (*name).to_owned()).collect();
        let connection = open(&super::database_path(root)).expect("create database");
        super::set_setting(&connection, super::PROJECTION_SETTING, "on")
            .expect("enable projection");
        drop(connection);

        let open_vault = || {
            let mut connection = open(&super::database_path(root)).expect("open database");
            super::import_vault(&mut connection, root, &paths, &[]).expect("import");
            drop(connection);
            super::reconcile_vault(root).expect("reconcile");
            super::project_vault(root).expect("project")
        };
        let read_all = || -> Vec<(String, String)> {
            paths
                .iter()
                .map(|name| {
                    (
                        name.clone(),
                        std::fs::read_to_string(root.join(name)).expect("read note"),
                    )
                })
                .collect()
        };

        // Plain and Hand Written gain one; Stamped already has one and Broken
        // cannot be edited safely.
        assert_eq!(
            open_vault(),
            2,
            "only the notes that can take one are written"
        );
        let after_first = read_all();

        assert_eq!(open_vault(), 0, "a second open must write nothing");
        assert_eq!(read_all(), after_first, "no file may change on reopen");

        let summary = super::reconcile_vault(root).expect("reconcile");
        assert_eq!(summary.conflicts, 0);
        assert_eq!(summary.file_changed, 0);
        assert_eq!(
            std::fs::read_to_string(root.join("Broken.md")).expect("read note"),
            "---\nid: [\n---\n# Broken\n",
            "a note with unusable front matter is never rewritten"
        );
    }

    #[test]
    fn does_not_write_to_the_vault_unless_projection_is_turned_on() {
        let vault = tempdir().expect("create fixture vault");
        let root = vault.path();
        crate::continuity::ensure_vault_identity(root).expect("create identity");
        std::fs::write(root.join("Harbor.md"), "# Harbor\n").expect("write note");
        let mut connection = open(&super::database_path(root)).expect("create database");
        super::import_vault(&mut connection, root, &["Harbor.md".to_owned()], &[])
            .expect("index the note");
        drop(connection);

        assert_eq!(super::project_vault(root).expect("project"), 0);
        assert_eq!(
            std::fs::read_to_string(root.join("Harbor.md")).expect("read note"),
            "# Harbor\n",
            "a note must not be touched while projection is off"
        );
    }

    #[test]
    fn drops_rows_for_files_removed_from_the_vault() {
        let vault = tempdir().expect("create fixture vault");
        crate::continuity::ensure_vault_identity(vault.path()).expect("create identity");
        std::fs::write(vault.path().join("Harbor.md"), "# Harbor\n").expect("write note");
        std::fs::write(vault.path().join("Gone.md"), "# Gone\n").expect("write note");
        let mut connection = open(&super::database_path(vault.path())).expect("create database");
        super::import_vault(
            &mut connection,
            vault.path(),
            &["Harbor.md".to_owned(), "Gone.md".to_owned()],
            &[],
        )
        .expect("first import");

        std::fs::remove_file(vault.path().join("Gone.md")).expect("delete note");
        super::import_vault(
            &mut connection,
            vault.path(),
            &["Harbor.md".to_owned()],
            &[],
        )
        .expect("second import");

        let remaining: Vec<String> = connection
            .prepare("SELECT relative_path FROM documents ORDER BY relative_path")
            .expect("prepare")
            .query_map([], |row| row.get(0))
            .expect("query")
            .collect::<Result<_, _>>()
            .expect("collect");
        assert_eq!(remaining, vec!["Harbor.md".to_owned()]);
    }

    fn document_uuids(connection: &Connection) -> Vec<String> {
        connection
            .prepare("SELECT uuid FROM documents ORDER BY path_key")
            .expect("prepare")
            .query_map([], |row| row.get(0))
            .expect("query")
            .collect::<Result<_, _>>()
            .expect("collect")
    }

    #[test]
    fn keeps_the_full_text_index_consistent_with_documents() {
        let directory = tempdir().expect("create fixture directory");
        let connection = open(&directory.path().join("vault.db")).expect("create database");
        connection
            .execute(
                "INSERT INTO documents (uuid, path_key, relative_path, name, name_key, content_hash, body)
                 VALUES ('019f989c-2dc0-7a01-8b2c-4d5e6f708192', 'notes/harbor.md', 'Notes/Harbor.md',
                         'Harbor.md', 'harbor', 'hash', 'A quiet harbour at dusk')",
                [],
            )
            .expect("insert document");

        connection
            .execute(
                "UPDATE documents SET body = 'A loud harbour at dawn' WHERE name_key = 'harbor'",
                [],
            )
            .expect("update body");
        connection
            .execute_batch("INSERT INTO documents_fts(documents_fts) VALUES('integrity-check')")
            .expect("full-text index must stay consistent after an update");

        assert_eq!(
            connection
                .query_row(
                    "SELECT count(*) FROM documents_fts WHERE documents_fts MATCH 'dawn'",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .expect("search updated body"),
            1
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT count(*) FROM documents_fts WHERE documents_fts MATCH 'dusk'",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .expect("search replaced body"),
            0
        );
    }
}
