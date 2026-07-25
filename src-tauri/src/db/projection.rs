//! Writing database state back out to Markdown.
//!
//! The projection is deliberately *surgical*. It does not render a file from
//! the row's fields — it edits the bytes that need to change and leaves every
//! other byte alone. Front matter a user hand-wrote in another editor keeps its
//! comments, key order, quote style, blank lines, and line endings, because
//! nothing re-serializes it.
//!
//! Every write is recorded in `sync_records` before the watcher can report it,
//! so the importer recognises Anchored's own writes by content hash rather than
//! treating them as external edits and looping.

use std::path::Path;

use rusqlite::{params, Connection};

use super::{conflicts, documents, import, map_error};
use crate::metadata::{add_note_identity, IdentityMutationError};
use crate::vault::VaultError;

/// Classifies every note by how its row and its file now stand, without
/// changing either.
///
/// This runs when a vault opens, because anything could have happened while
/// Anchored was closed: an editor saved, Git checked out a different branch, or
/// Anchored itself died between writing a file and recording that it had. The
/// answer is recorded, never acted on automatically — a note changed in two
/// places is a decision for the user, not something to resolve by picking a
/// winner.
pub(crate) fn reconcile(
    root: &Path,
    connection: &Connection,
) -> Result<Reconciliation, VaultError> {
    let mut summary = Reconciliation::default();

    let mut statement = connection
        .prepare(
            "SELECT documents.id, documents.uuid, documents.relative_path,
                    documents.content_hash, documents.revision,
                    sync_records.projected_hash, sync_records.projected_revision
             FROM documents
             LEFT JOIN sync_records ON sync_records.document_id = documents.id
             WHERE documents.is_markdown = 1 AND documents.deleted_at IS NULL",
        )
        .map_err(map_error("The vault could not be reconciled"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<i64>>(6)?,
            ))
        })
        .map_err(map_error("The vault could not be reconciled"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_error("The vault could not be reconciled"))?;
    drop(statement);

    for (id, uuid, relative_path, row_hash, revision, projected_hash, projected_revision) in rows {
        let Ok(bytes) = std::fs::read(root.join(&relative_path)) else {
            summary.missing_files += 1;
            continue;
        };
        let file_hash = import::content_hash(&bytes);

        // The file is what the row says it is, or is exactly what Anchored
        // last wrote — including the case where it died before recording it.
        if file_hash == row_hash || Some(&file_hash) == projected_hash.as_ref() {
            summary.synced += 1;
            documents::set_sync_state(connection, id, documents::SyncState::Synced)?;
            conflicts::discard(root, &uuid);
            continue;
        }

        // The file moved on. Whether that is a conflict depends on whether the
        // row also moved on since the last agreement.
        let database_moved_on = projected_revision.is_some_and(|projected| revision != projected);
        if !database_moved_on {
            summary.file_changed += 1;
            documents::set_sync_state(connection, id, documents::SyncState::FileChanged)?;
            continue;
        }

        // Both sides changed. Preserve them before anything else can touch
        // either, so a later mistake cannot lose the version the user wanted.
        summary.conflicts += 1;
        let stored = stored_content(connection, id)?;
        let on_disk = String::from_utf8_lossy(&bytes).into_owned();
        conflicts::preserve(root, &uuid, &stored, &on_disk)?;
        documents::set_sync_state(connection, id, documents::SyncState::Conflict)?;
    }

    Ok(summary)
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Reconciliation {
    pub synced: usize,
    pub file_changed: usize,
    pub conflicts: usize,
    pub missing_files: usize,
}

/// The note exactly as Anchored has it stored, reassembled from the two
/// columns it is kept in.
fn stored_content(connection: &Connection, document_id: i64) -> Result<String, VaultError> {
    connection
        .query_row(
            "SELECT frontmatter_text || body FROM documents WHERE id = ?1",
            params![document_id],
            |row| row.get(0),
        )
        .map_err(map_error("The stored note could not be read"))
}

/// A note whose row holds an identity its file does not carry yet.
struct PendingIdentity {
    id: i64,
    uuid: String,
    relative_path: String,
    revision: i64,
}

/// Writes minted identities into the notes that lack them.
///
/// Until this runs, a note's identity lives only in the database, so renaming
/// it in Finder loses the connection to its row — the file carries nothing to
/// recognise it by. This is what makes identity durable rather than incidental.
///
/// Returns how many files were changed. A note whose front matter cannot be
/// edited safely is left exactly as it is and reported, never guessed at.
pub(crate) fn project_pending_identities(
    root: &Path,
    connection: &Connection,
) -> Result<usize, VaultError> {
    let pending = pending_identities(connection)?;
    let mut written = 0;

    for note in pending {
        let path = root.join(&note.relative_path);
        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };
        let Ok(content) = String::from_utf8(bytes) else {
            continue;
        };

        let updated = match add_note_identity(&content, &note.uuid) {
            Ok(updated) => updated,
            // Front matter that is malformed, or already carries a different
            // identity, is not something to resolve by overwriting. The note
            // keeps whatever it has and the flag stays clear, so a later pass
            // can try again once the user has fixed it.
            Err(IdentityMutationError::ExistingIdentity)
            | Err(IdentityMutationError::UnsafeFrontMatter)
            | Err(IdentityMutationError::InvalidIdentity) => continue,
        };

        if updated == content {
            // The file already carried it; only the flag was out of date.
            mark_identity_in_file(connection, note.id)?;
            continue;
        }

        write_projection(connection, &path, &updated, note.id, note.revision)?;
        mark_identity_in_file(connection, note.id)?;
        written += 1;
    }

    Ok(written)
}

/// Writes a file and records what was written, in that order, so a crash
/// between the two is recoverable: the file is on disk and reconciliation sees
/// an unrecorded change rather than silent divergence.
fn write_projection(
    connection: &Connection,
    path: &Path,
    content: &str,
    document_id: i64,
    revision: i64,
) -> Result<(), VaultError> {
    // Kept before the file is touched, not after. Writing an identity is a
    // small change, but it is still Anchored changing a file the user did not
    // ask it to change, and the version before it must stay recoverable.
    let previous = std::fs::read_to_string(path).unwrap_or_default();
    documents::record_version(
        connection,
        document_id,
        revision,
        &previous,
        &import::content_hash(previous.as_bytes()),
        documents::ChangeOrigin::Anchored,
    )?;

    crate::vault::write_markdown_atomically(path, content)?;

    let metadata = std::fs::metadata(path)
        .map_err(|error| VaultError::io("The projected note could not be inspected", error))?;
    let (size_bytes, mtime_millis) = super::file_signature(&metadata);
    documents::record_synced(
        connection,
        document_id,
        &import::content_hash(content.as_bytes()),
        size_bytes,
        mtime_millis,
        revision,
    )?;

    // The row's own view of the file has to move with it, or the next import
    // would see a size and time it does not recognise and read the file back.
    connection
        .execute(
            "UPDATE documents SET
                content_hash = ?2, size_bytes = ?3, mtime_millis = ?4
             WHERE id = ?1",
            params![
                document_id,
                import::content_hash(content.as_bytes()),
                size_bytes as i64,
                mtime_millis as i64
            ],
        )
        .map(drop)
        .map_err(map_error("The projected note could not be recorded"))
}

fn pending_identities(connection: &Connection) -> Result<Vec<PendingIdentity>, VaultError> {
    let mut statement = connection
        .prepare(
            "SELECT id, uuid, relative_path, revision
             FROM documents
             WHERE identity_in_file = 0 AND is_markdown = 1 AND deleted_at IS NULL
             ORDER BY relative_path",
        )
        .map_err(map_error("Pending identities could not be prepared"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(PendingIdentity {
                id: row.get(0)?,
                uuid: row.get(1)?,
                relative_path: row.get(2)?,
                revision: row.get(3)?,
            })
        })
        .map_err(map_error("Pending identities could not be read"))?;
    rows.collect::<Result<_, _>>()
        .map_err(map_error("Pending identities could not be read"))
}

fn mark_identity_in_file(connection: &Connection, document_id: i64) -> Result<(), VaultError> {
    connection
        .execute(
            "UPDATE documents SET identity_in_file = 1 WHERE id = ?1",
            params![document_id],
        )
        .map(drop)
        .map_err(map_error("The note identity could not be recorded"))
}

#[cfg(test)]
mod tests {
    use tempfile::TempDir;

    use super::project_pending_identities;
    use crate::db::{documents, import::import_note, open};
    use crate::metadata::{inspect_note_identity, NoteIdentityStatus};

    fn vault(notes: &[(&str, &str)]) -> (TempDir, rusqlite::Connection) {
        let directory = TempDir::new().expect("create fixture vault");
        let connection = open(&directory.path().join("vault.db")).expect("create database");
        for (path, content) in notes {
            std::fs::write(directory.path().join(path), content).expect("write note");
            documents::upsert(&connection, &import_note(path, content.as_bytes()))
                .expect("index note");
        }
        (directory, connection)
    }

    fn identity_of(directory: &TempDir, path: &str) -> Option<String> {
        let content = std::fs::read_to_string(directory.path().join(path)).expect("read note");
        match inspect_note_identity(&content) {
            NoteIdentityStatus::Present(id) => Some(id),
            _ => None,
        }
    }

    #[test]
    fn reconciles_an_untouched_vault_as_synced() {
        let (directory, connection) = vault(&[("Harbor.md", "# Harbor\n")]);

        let summary = super::reconcile(directory.path(), &connection).expect("reconcile");

        assert_eq!(
            summary,
            super::Reconciliation {
                synced: 1,
                ..Default::default()
            }
        );
    }

    #[test]
    fn reconciles_an_edit_made_outside_anchored_as_a_file_change() {
        let (directory, connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        std::fs::write(
            directory.path().join("Harbor.md"),
            "# Harbor\n\nEdited elsewhere\n",
        )
        .expect("edit the note outside Anchored");

        let summary = super::reconcile(directory.path(), &connection).expect("reconcile");

        assert_eq!(summary.file_changed, 1);
        assert_eq!(summary.conflicts, 0);
        let state: String = connection
            .query_row("SELECT state FROM sync_records", [], |row| row.get(0))
            .expect("read sync state");
        assert_eq!(state, "file_changed");
    }

    /// Anchored writes the file, then records what it wrote. Dying between the
    /// two must be recoverable: the file is exactly what was intended, so it is
    /// synced, not a conflict.
    #[test]
    fn treats_a_write_recorded_but_never_re_read_as_synced() {
        let (directory, connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        project_pending_identities(directory.path(), &connection).expect("project");
        // The row still describes the pre-projection bytes, as it would if the
        // process had died before updating itself.
        connection
            .execute("UPDATE documents SET content_hash = 'stale'", [])
            .expect("simulate a crash after writing but before recording");

        let summary = super::reconcile(directory.path(), &connection).expect("reconcile");

        assert_eq!(
            summary.synced, 1,
            "the file is what Anchored meant to write"
        );
        assert_eq!(summary.conflicts, 0);
    }

    /// The guarantee that matters: when both sides changed, neither is lost.
    #[test]
    fn preserves_both_sides_of_a_conflict_and_lists_it() {
        let (directory, connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        project_pending_identities(directory.path(), &connection).expect("project");
        connection
            .execute(
                "UPDATE documents SET body = '# Written in Anchored\n', revision = revision + 5",
                [],
            )
            .expect("simulate a change in the app");
        std::fs::write(directory.path().join("Harbor.md"), "# Written on disk\n")
            .expect("simulate a change on disk");

        super::reconcile(directory.path(), &connection).expect("reconcile");

        let listed = crate::db::conflicts::list(&connection).expect("list conflicts");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].relative_path, "Harbor.md");

        let preserved = crate::db::conflicts::conflicts_directory(directory.path());
        let stored =
            std::fs::read_to_string(preserved.join(format!("{}_database.md", listed[0].uuid)))
                .expect("read the preserved stored copy");
        let on_disk =
            std::fs::read_to_string(preserved.join(format!("{}_file.md", listed[0].uuid)))
                .expect("read the preserved disk copy");
        assert!(stored.contains("# Written in Anchored"));
        assert_eq!(on_disk, "# Written on disk\n");
        assert_eq!(
            std::fs::read_to_string(directory.path().join("Harbor.md")).expect("read the note"),
            "# Written on disk\n",
            "the note itself is left exactly as it was found"
        );
    }

    #[test]
    fn clears_preserved_copies_once_a_note_agrees_again() {
        let (directory, connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        project_pending_identities(directory.path(), &connection).expect("project");
        let uuid: String = connection
            .query_row("SELECT uuid FROM documents", [], |row| row.get(0))
            .expect("read identity");
        crate::db::conflicts::preserve(directory.path(), &uuid, "stored\n", "disk\n")
            .expect("preserve a conflict");

        // The note now matches what Anchored last wrote, so it is settled.
        super::reconcile(directory.path(), &connection).expect("reconcile");

        assert_eq!(
            std::fs::read_dir(crate::db::conflicts::conflicts_directory(directory.path()))
                .expect("read the conflicts directory")
                .count(),
            0,
            "a settled note should not leave conflicting copies behind"
        );
        assert!(crate::db::conflicts::list(&connection)
            .expect("list conflicts")
            .is_empty());
    }

    #[test]
    fn reports_a_note_whose_file_has_gone_missing() {
        let (directory, connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        std::fs::remove_file(directory.path().join("Harbor.md")).expect("delete the note");

        let summary = super::reconcile(directory.path(), &connection).expect("reconcile");

        assert_eq!(summary.missing_files, 1);
        assert_eq!(summary.synced, 0);
    }

    /// Both sides moved since the last agreement. Nothing is resolved
    /// automatically — the note is flagged and left exactly as it is.
    #[test]
    fn flags_a_conflict_without_touching_either_version() {
        let (directory, connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        project_pending_identities(directory.path(), &connection).expect("project");
        connection
            .execute(
                "UPDATE documents SET body = 'changed in the app', revision = revision + 5",
                [],
            )
            .expect("simulate a change in the database");
        std::fs::write(directory.path().join("Harbor.md"), "# Changed on disk\n")
            .expect("simulate a change on disk");

        let summary = super::reconcile(directory.path(), &connection).expect("reconcile");

        assert_eq!(summary.conflicts, 1);
        assert_eq!(
            std::fs::read_to_string(directory.path().join("Harbor.md")).expect("read note"),
            "# Changed on disk\n",
            "a conflicted file must be left untouched"
        );
        let (state, body): (String, String) = connection
            .query_row(
                "SELECT sync_records.state, documents.body
                 FROM documents JOIN sync_records ON sync_records.document_id = documents.id",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read state and body");
        assert_eq!(state, "conflict");
        assert_eq!(body, "changed in the app", "the row is left untouched too");
    }

    #[test]
    fn writes_a_minted_identity_into_the_file() {
        let (directory, connection) = vault(&[("Harbor.md", "# Harbor\n\nBody\n")]);
        let recorded: String = connection
            .query_row("SELECT uuid FROM documents", [], |row| row.get(0))
            .expect("read identity");

        let written = project_pending_identities(directory.path(), &connection).expect("project");

        assert_eq!(written, 1);
        assert_eq!(
            identity_of(&directory, "Harbor.md").as_deref(),
            Some(recorded.as_str())
        );
        assert!(
            std::fs::read_to_string(directory.path().join("Harbor.md"))
                .expect("read note")
                .contains("# Harbor\n\nBody\n"),
            "the body must be left exactly as it was"
        );
    }

    #[test]
    fn leaves_hand_written_front_matter_intact() {
        let source = "---\n# a comment the user wrote\ntitle: 'Harbor'\ntags:   [one,  two]\n\nstatus: inbox\n---\n# Harbor\n";
        let (directory, connection) = vault(&[("Harbor.md", source)]);

        project_pending_identities(directory.path(), &connection).expect("project");

        let updated =
            std::fs::read_to_string(directory.path().join("Harbor.md")).expect("read note");
        assert!(updated.contains("# a comment the user wrote"));
        assert!(updated.contains("title: 'Harbor'"), "quote style survives");
        assert!(updated.contains("tags:   [one,  two]"), "spacing survives");
        assert!(updated.contains("\n\nstatus: inbox"), "blank lines survive");
        assert!(updated.contains("# Harbor\n"));
    }

    /// Writing an identity changes a file the user did not ask to change, so
    /// what it held first has to stay recoverable.
    #[test]
    fn keeps_the_version_that_preceded_the_identity_it_wrote() {
        let source = "# Harbor\n\nBody\n";
        let (directory, connection) = vault(&[("Harbor.md", source)]);

        project_pending_identities(directory.path(), &connection).expect("project");

        let (content, origin): (String, String) = connection
            .query_row("SELECT content, origin FROM document_versions", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .expect("a version should be recorded");
        assert_eq!(content, source, "the note as it was before Anchored wrote");
        assert_eq!(origin, "anchored");
    }

    #[test]
    fn is_idempotent_and_does_not_rewrite_a_settled_note() {
        let (directory, connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        project_pending_identities(directory.path(), &connection).expect("first pass");
        let after_first =
            std::fs::read_to_string(directory.path().join("Harbor.md")).expect("read note");

        let written =
            project_pending_identities(directory.path(), &connection).expect("second pass");

        assert_eq!(written, 0, "a settled note must not be written again");
        assert_eq!(
            std::fs::read_to_string(directory.path().join("Harbor.md")).expect("read note"),
            after_first
        );
    }

    #[test]
    fn leaves_a_note_whose_front_matter_cannot_be_edited_safely() {
        let source = "---\nid: [\nbroken\n---\n# Harbor\n";
        let (directory, connection) = vault(&[("Harbor.md", source)]);

        let written = project_pending_identities(directory.path(), &connection).expect("project");

        assert_eq!(written, 0);
        assert_eq!(
            std::fs::read_to_string(directory.path().join("Harbor.md")).expect("read note"),
            source,
            "malformed front matter is never guessed at"
        );
    }

    #[test]
    fn does_not_touch_a_note_that_already_carries_its_identity() {
        let id = "019f989c-2dc0-7a01-8b2c-4d5e6f708192";
        let source = format!("---\nid: {id}\n---\n# Harbor\n");
        let (directory, connection) = vault(&[("Harbor.md", &source)]);

        let written = project_pending_identities(directory.path(), &connection).expect("project");

        assert_eq!(written, 0);
        assert_eq!(identity_of(&directory, "Harbor.md").as_deref(), Some(id));
    }

    /// The write has to be recorded before the watcher can report it, or the
    /// importer would treat Anchored's own write as an external edit.
    #[test]
    fn records_what_it_wrote_so_the_write_can_be_recognised() {
        let (directory, connection) = vault(&[("Harbor.md", "# Harbor\n")]);

        project_pending_identities(directory.path(), &connection).expect("project");

        let on_disk = std::fs::read(directory.path().join("Harbor.md")).expect("read note");
        let projected: String = connection
            .query_row("SELECT projected_hash FROM sync_records", [], |row| {
                row.get(0)
            })
            .expect("a projected hash should be recorded");
        assert_eq!(projected, crate::db::import::content_hash(&on_disk));
        let state: String = connection
            .query_row("SELECT state FROM sync_records", [], |row| row.get(0))
            .expect("read sync state");
        assert_eq!(state, "synced");
    }
}
