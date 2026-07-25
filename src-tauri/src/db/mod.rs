//! Canonical store. Every function here takes a `&Connection` rather than an
//! `AppHandle` so the whole module is unit-testable against a temporary file,
//! following the same split `scan_vault_paths_patch` already uses in `vault`.

mod schema;

use std::path::Path;

use rusqlite::Connection;

use crate::vault::VaultError;

pub(crate) const DATABASE_NAME: &str = "vault.db";

fn map_error(context: &'static str) -> impl FnOnce(rusqlite::Error) -> VaultError {
    move |error| VaultError::state(format!("{context}: {error}"))
}

/// Creates or migrates the database for a vault root, without holding the
/// connection open. Callers that need to read or write take their own.
pub(crate) fn ensure_vault_database(root: &Path) -> Result<(), VaultError> {
    open(&database_path(root)).map(drop)
}

pub(crate) fn database_path(root: &Path) -> std::path::PathBuf {
    root.join(crate::continuity::INTERNAL_DIRECTORY_NAME)
        .join(DATABASE_NAME)
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

        super::ensure_vault_database(vault.path()).expect("create database");

        assert!(vault.path().join(".anchored").join("vault.db").is_file());
        super::ensure_vault_database(vault.path()).expect("reopen an existing database");
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
