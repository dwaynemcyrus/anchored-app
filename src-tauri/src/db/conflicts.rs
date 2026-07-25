//! Preserving both sides of a note that changed in two places at once.
//!
//! The rule is that Anchored never picks a winner. When a note's stored copy
//! and its file have both moved on since they last agreed, both are written
//! into `.anchored/conflicts/` before anything else happens, and the note is
//! left exactly as it is on disk. Resolution is the user's decision.
//!
//! Copies live under `.anchored/` rather than beside the note so a conflict
//! never litters the vault the user browses.

use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::Serialize;

use super::map_error;
use crate::continuity::{CONFLICTS_DIRECTORY_NAME, INTERNAL_DIRECTORY_NAME};
use crate::vault::VaultError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultConflict {
    pub uuid: String,
    pub relative_path: String,
    pub name: String,
    /// Vault-relative path to the copy holding what Anchored had stored.
    pub database_copy_path: String,
    /// Vault-relative path to the copy holding what was on disk.
    pub file_copy_path: String,
    pub detected_millis: i64,
}

pub(crate) fn conflicts_directory(root: &Path) -> PathBuf {
    root.join(INTERNAL_DIRECTORY_NAME)
        .join(CONFLICTS_DIRECTORY_NAME)
}

/// Writes both sides of a conflict where the user can reach them.
///
/// Named by the note's identity rather than its filename, so a note renamed
/// while conflicted does not orphan its own preserved copies. Re-detecting the
/// same conflict overwrites them rather than accumulating.
pub(crate) fn preserve(
    root: &Path,
    uuid: &str,
    database_content: &str,
    file_content: &str,
) -> Result<(), VaultError> {
    let directory = conflicts_directory(root);
    std::fs::create_dir_all(&directory)
        .map_err(|error| VaultError::io("The conflicts directory could not be created", error))?;

    for (suffix, content) in [("database", database_content), ("file", file_content)] {
        let path = directory.join(format!("{uuid}_{suffix}.md"));
        std::fs::write(&path, content)
            .map_err(|error| VaultError::io("A conflicting copy could not be preserved", error))?;
    }
    Ok(())
}

/// Every note currently in conflict, newest first.
pub(crate) fn list(connection: &Connection) -> Result<Vec<VaultConflict>, VaultError> {
    let mut statement = connection
        .prepare(
            "SELECT documents.uuid, documents.relative_path, documents.name,
                    sync_records.updated_millis
             FROM sync_records
             JOIN documents ON documents.id = sync_records.document_id
             WHERE sync_records.state = 'conflict' AND documents.deleted_at IS NULL
             ORDER BY sync_records.updated_millis DESC",
        )
        .map_err(map_error("Vault conflicts could not be prepared"))?;
    let rows = statement
        .query_map([], |row| {
            let uuid: String = row.get(0)?;
            let internal = format!("{INTERNAL_DIRECTORY_NAME}/{CONFLICTS_DIRECTORY_NAME}");
            Ok(VaultConflict {
                database_copy_path: format!("{internal}/{uuid}_database.md"),
                file_copy_path: format!("{internal}/{uuid}_file.md"),
                uuid,
                relative_path: row.get(1)?,
                name: row.get(2)?,
                detected_millis: row.get(3)?,
            })
        })
        .map_err(map_error("Vault conflicts could not be read"))?;

    rows.collect::<Result<_, _>>()
        .map_err(map_error("Vault conflicts could not be read"))
}

/// One earlier copy of a note, newest first when listed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteVersion {
    pub revision: i64,
    pub content: String,
    /// `anchored` for a change Anchored made, `external_file` for one that
    /// arrived from another program or a Git checkout.
    pub origin: String,
    pub created_millis: i64,
}

/// The kept versions of one note, newest first.
pub(crate) fn versions_for(
    connection: &Connection,
    relative_path: &str,
) -> Result<Vec<NoteVersion>, VaultError> {
    let mut statement = connection
        .prepare(
            "SELECT document_versions.revision, document_versions.content,
                    document_versions.origin, document_versions.created_millis
             FROM document_versions
             JOIN documents ON documents.id = document_versions.document_id
             WHERE documents.path_key = ?1
             ORDER BY document_versions.created_millis DESC, document_versions.id DESC",
        )
        .map_err(map_error("Note versions could not be prepared"))?;
    let rows = statement
        .query_map(
            rusqlite::params![super::keys::path_key(relative_path)],
            |row| {
                Ok(NoteVersion {
                    revision: row.get(0)?,
                    content: row.get(1)?,
                    origin: row.get(2)?,
                    created_millis: row.get(3)?,
                })
            },
        )
        .map_err(map_error("Note versions could not be read"))?;

    rows.collect::<Result<_, _>>()
        .map_err(map_error("Note versions could not be read"))
}

/// Clears the preserved copies for a note once it is no longer in conflict.
pub(crate) fn discard(root: &Path, uuid: &str) {
    let directory = conflicts_directory(root);
    for suffix in ["database", "file"] {
        let _ = std::fs::remove_file(directory.join(format!("{uuid}_{suffix}.md")));
    }
}

#[cfg(test)]
mod tests {
    use tempfile::TempDir;

    use super::{conflicts_directory, discard, list, preserve};
    use crate::db::{documents, import::import_note, open};

    const ID: &str = "019f989c-2dc0-7a01-8b2c-4d5e6f708192";

    #[test]
    fn preserves_both_sides_where_the_user_can_reach_them() {
        let vault = TempDir::new().expect("create fixture vault");

        preserve(vault.path(), ID, "stored version\n", "version on disk\n")
            .expect("preserve both sides");

        let directory = conflicts_directory(vault.path());
        assert_eq!(
            std::fs::read_to_string(directory.join(format!("{ID}_database.md")))
                .expect("read the stored copy"),
            "stored version\n"
        );
        assert_eq!(
            std::fs::read_to_string(directory.join(format!("{ID}_file.md")))
                .expect("read the disk copy"),
            "version on disk\n"
        );
    }

    #[test]
    fn re_detecting_a_conflict_replaces_rather_than_accumulates() {
        let vault = TempDir::new().expect("create fixture vault");
        preserve(vault.path(), ID, "first\n", "first disk\n").expect("preserve");

        preserve(vault.path(), ID, "second\n", "second disk\n").expect("preserve again");

        let entries = std::fs::read_dir(conflicts_directory(vault.path()))
            .expect("read the conflicts directory")
            .count();
        assert_eq!(entries, 2, "a conflict has exactly two preserved copies");
    }

    #[test]
    fn lists_only_notes_that_are_actually_in_conflict() {
        let directory = TempDir::new().expect("create fixture directory");
        let connection = open(&directory.path().join("vault.db")).expect("create database");
        let conflicted = documents::upsert(
            &connection,
            &import_note(
                "Notes/Harbor.md",
                format!("---\nid: {ID}\n---\n").as_bytes(),
            ),
        )
        .expect("index a note");
        let settled = documents::upsert(&connection, &import_note("Notes/Calm.md", b"# Calm\n"))
            .expect("index another note");
        documents::set_sync_state(&connection, conflicted.id, documents::SyncState::Conflict)
            .expect("flag a conflict");
        documents::set_sync_state(&connection, settled.id, documents::SyncState::Synced)
            .expect("settle the other");

        let listed = list(&connection).expect("list conflicts");

        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].uuid, ID);
        assert_eq!(listed[0].relative_path, "Notes/Harbor.md");
        assert_eq!(
            listed[0].database_copy_path,
            format!(".anchored/conflicts/{ID}_database.md")
        );
    }

    #[test]
    fn discards_preserved_copies_once_a_conflict_is_gone() {
        let vault = TempDir::new().expect("create fixture vault");
        preserve(vault.path(), ID, "stored\n", "disk\n").expect("preserve");

        discard(vault.path(), ID);

        assert_eq!(
            std::fs::read_dir(conflicts_directory(vault.path()))
                .expect("read the conflicts directory")
                .count(),
            0
        );
        // Discarding again is harmless, which matters because reconciliation
        // runs on every open.
        discard(vault.path(), ID);
    }
}
