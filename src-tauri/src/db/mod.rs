//! Canonical store. Every function here takes a `&Connection` rather than an
//! `AppHandle` so the whole module is unit-testable against a temporary file,
//! following the same split `scan_vault_paths_patch` already uses in `vault`.

mod documents;
mod import;
mod keys;
mod schema;

use std::path::Path;

use rusqlite::Connection;

use crate::vault::VaultError;

pub(crate) const DATABASE_NAME: &str = "vault.db";

fn map_error(context: &'static str) -> impl FnOnce(rusqlite::Error) -> VaultError {
    move |error| VaultError::state(format!("{context}: {error}"))
}

pub(crate) fn database_path(root: &Path) -> std::path::PathBuf {
    root.join(crate::continuity::INTERNAL_DIRECTORY_NAME)
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

    let mut present = Vec::with_capacity(markdown_paths.len() + asset_paths.len());
    for (paths, is_markdown) in [(markdown_paths, true), (asset_paths, false)] {
        for relative_path in paths {
            // A file that vanished between the scan and the read is skipped
            // rather than failing the import; the next pass will settle it.
            let Ok(bytes) = std::fs::read(root.join(relative_path)) else {
                continue;
            };
            let document = if is_markdown {
                import::import_note(relative_path, &bytes)
            } else {
                import::import_asset(relative_path, &bytes)
            };
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
