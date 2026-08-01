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

use std::collections::HashSet;
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
///
/// A note whose size and modification time still match what the row recorded is
/// classified from that alone, without opening it. Every path that writes a
/// note — `save`, `write_projection`, and the importer — moves the row's
/// signature with the file, so a matching signature already means a matching
/// hash everywhere else in this module; reading all of them again to prove it
/// was what made opening a large vault take minutes.
///
/// The whole pass runs in one transaction, and a note whose classification has
/// not changed is not written at all. On a vault nothing has touched, this
/// therefore costs one `stat` per note and no writes.
pub(crate) fn reconcile(
    root: &Path,
    connection: &mut Connection,
) -> Result<Reconciliation, VaultError> {
    let mut summary = Reconciliation::default();
    // Asked once, rather than two filesystem calls per note that almost always
    // delete nothing.
    let preserved = conflicts::preserved_identities(root);
    let transaction = connection
        .transaction()
        .map_err(map_error("The vault could not be reconciled"))?;

    let mut statement = transaction
        .prepare(
            "SELECT documents.id, documents.uuid, documents.relative_path,
                    documents.content_hash, documents.revision,
                    documents.size_bytes, documents.mtime_millis,
                    sync_records.projected_hash, sync_records.projected_revision,
                    sync_records.state
             FROM documents
             LEFT JOIN sync_records ON sync_records.document_id = documents.id
             WHERE documents.is_markdown = 1 AND documents.deleted_at IS NULL",
        )
        .map_err(map_error("The vault could not be reconciled"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(DocumentToReconcile {
                id: row.get(0)?,
                uuid: row.get(1)?,
                relative_path: row.get(2)?,
                row_hash: row.get(3)?,
                revision: row.get(4)?,
                row_size: row.get::<_, i64>(5)? as u64,
                row_mtime: row.get::<_, i64>(6)? as u64,
                projected_hash: row.get(7)?,
                projected_revision: row.get(8)?,
                state: row.get(9)?,
            })
        })
        .map_err(map_error("The vault could not be reconciled"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_error("The vault could not be reconciled"))?;
    drop(statement);

    for note in rows {
        let path = root.join(&note.relative_path);
        let Ok(metadata) = std::fs::metadata(&path) else {
            summary.missing_files += 1;
            continue;
        };

        // The file has not been touched since the row last recorded it, so
        // there is nothing to learn by opening it.
        if super::file_signature(&metadata) == (note.row_size, note.row_mtime) {
            summary.synced += 1;
            settle(&transaction, root, &preserved, &note)?;
            continue;
        }

        let Ok(bytes) = std::fs::read(&path) else {
            summary.missing_files += 1;
            continue;
        };
        let file_hash = import::content_hash(&bytes);

        // The file is what the row says it is, or is exactly what Anchored
        // last wrote — including the case where it died before recording it.
        if file_hash == note.row_hash || Some(&file_hash) == note.projected_hash.as_ref() {
            summary.synced += 1;
            settle(&transaction, root, &preserved, &note)?;
            continue;
        }

        // The file moved on. Whether that is a conflict depends on whether the
        // row also moved on since the last agreement.
        let database_moved_on = note
            .projected_revision
            .is_some_and(|projected| note.revision != projected);
        if !database_moved_on {
            summary.file_changed += 1;
            record_state(&transaction, &note, documents::SyncState::FileChanged)?;
            continue;
        }

        // Both sides changed. Preserve them before anything else can touch
        // either, so a later mistake cannot lose the version the user wanted.
        summary.conflicts += 1;
        let stored = stored_content(&transaction, note.id)?;
        let on_disk = String::from_utf8_lossy(&bytes).into_owned();
        conflicts::preserve(root, &note.uuid, &stored, &on_disk)?;
        record_state(&transaction, &note, documents::SyncState::Conflict)?;
    }

    transaction
        .commit()
        .map_err(map_error("The vault could not be reconciled"))?;
    Ok(summary)
}

/// What reconciliation needs to know about one note before it looks at the file.
struct DocumentToReconcile {
    id: i64,
    uuid: String,
    relative_path: String,
    row_hash: String,
    revision: i64,
    row_size: u64,
    row_mtime: u64,
    projected_hash: Option<String>,
    projected_revision: Option<i64>,
    /// The classification recorded last time, so an unchanged one is not
    /// written again. `None` for a note that has never been reconciled.
    state: Option<String>,
}

/// Marks a note as agreeing with its file, and clears the copies preserved for
/// it if it had any. A note that never conflicted has none to clear, which is
/// almost all of them.
fn settle(
    connection: &Connection,
    root: &Path,
    preserved: &HashSet<String>,
    note: &DocumentToReconcile,
) -> Result<(), VaultError> {
    if preserved.contains(&note.uuid) {
        conflicts::discard(root, &note.uuid);
    }
    record_state(connection, note, documents::SyncState::Synced)
}

/// Records a note's classification, and only when it has actually changed.
///
/// Rewriting a row to the state it already holds is what made reconciling a
/// large vault thousands of writes rather than none.
fn record_state(
    connection: &Connection,
    note: &DocumentToReconcile,
    state: documents::SyncState,
) -> Result<(), VaultError> {
    if note.state.as_deref() == Some(state.as_str()) {
        return Ok(());
    }
    documents::set_sync_state(connection, note.id, state)
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Reconciliation {
    pub synced: usize,
    pub file_changed: usize,
    pub conflicts: usize,
    pub missing_files: usize,
}

/// Commits a note's new contents and writes the file, as one operation.
///
/// The row is updated first and the file written inside the same transaction,
/// so a failed write rolls the row back and neither side moves alone. That
/// replaces writing the file and then reading it back in to re-index it: the
/// content is already known, so there is nothing to discover by re-reading.
///
/// The resulting size and time are recorded on the row before returning, which
/// is what stops the watcher's report of this write from looking like an edit
/// made somewhere else.
pub(crate) fn save(
    connection: &mut Connection,
    root: &Path,
    relative_path: &str,
    content: &str,
) -> Result<(), VaultError> {
    let transaction = connection
        .transaction()
        .map_err(map_error("The note could not be saved"))?;

    let mut document = import::import_note(relative_path, content.as_bytes());
    // This is Anchored saving, not a change arriving from elsewhere, and the
    // version kept below has to say so.
    document.origin = documents::ChangeOrigin::Anchored;
    let upserted = documents::upsert(&transaction, &document)?;

    let path = root.join(relative_path);
    crate::vault::write_markdown_atomically(&path, content)?;

    let metadata = std::fs::metadata(&path)
        .map_err(|error| VaultError::io("The saved note could not be inspected", error))?;
    let (size_bytes, mtime_millis) = super::file_signature(&metadata);
    document.mtime_millis = mtime_millis;
    transaction
        .execute(
            "UPDATE documents SET mtime_millis = ?2, size_bytes = ?3 WHERE id = ?1",
            params![upserted.id, mtime_millis as i64, size_bytes as i64],
        )
        .map_err(map_error("The saved note could not be recorded"))?;
    // Read back rather than assumed: `upsert` increments the revision, and the
    // sync record has to name the revision that was actually projected or
    // reconciliation would read a stale one as a conflict.
    let revision: i64 = transaction
        .query_row(
            "SELECT revision FROM documents WHERE id = ?1",
            params![upserted.id],
            |row| row.get(0),
        )
        .map_err(map_error("The saved note could not be read back"))?;
    documents::record_synced(
        &transaction,
        upserted.id,
        &document.content_hash,
        size_bytes,
        mtime_millis,
        revision,
    )?;

    // A new note changes what other notes' links resolve to; an edit in place
    // only changes its own.
    if upserted.created {
        documents::resolve_links(&transaction)?;
    } else {
        documents::resolve_links_from(&transaction, upserted.id)?;
    }

    transaction
        .commit()
        .map_err(map_error("The note could not be saved"))
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

        write_projection(
            connection,
            root,
            &path,
            &updated,
            note.id,
            &note.uuid,
            note.revision,
        )?;
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
    root: &Path,
    path: &Path,
    content: &str,
    document_id: i64,
    document_uuid: &str,
    revision: i64,
) -> Result<(), VaultError> {
    // Kept before the file is touched, not after. Writing an identity is a
    // small change, but it is still Anchored changing a file the user did not
    // ask it to change, and the version before it must stay recoverable.
    let previous = std::fs::read_to_string(path)
        .map_err(|error| VaultError::io("The note identity could not be read", error))?;
    documents::record_version(
        connection,
        document_id,
        revision,
        &previous,
        &import::content_hash(previous.as_bytes()),
        documents::ChangeOrigin::Anchored,
    )?;

    // An external editor can save after the identity transform above and
    // before the atomic replacement below. Re-read at the last possible
    // moment: a mismatch is a conflict to preserve, never a reason to
    // overwrite a newer file with a stale projection.
    let current = std::fs::read_to_string(path)
        .map_err(|error| VaultError::io("The note identity could not be re-read", error))?;
    if current != previous {
        conflicts::preserve(root, document_uuid, &previous, &current)?;
        documents::set_sync_state(connection, document_id, documents::SyncState::Conflict)?;
        return Err(VaultError::state(
            "The note changed outside Anchored while its identity was being projected.",
        ));
    }

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
        let (directory, mut connection) = vault(&[("Harbor.md", "# Harbor\n")]);

        let summary = super::reconcile(directory.path(), &mut connection).expect("reconcile");

        assert_eq!(
            summary,
            super::Reconciliation {
                synced: 1,
                ..Default::default()
            }
        );
    }

    /// Records the file's real size and modification time on the row, which is
    /// what the importer does and what the fixture's bare `upsert` does not.
    fn record_signature(
        connection: &rusqlite::Connection,
        root: &std::path::Path,
        relative_path: &str,
    ) {
        let metadata = std::fs::metadata(root.join(relative_path)).expect("inspect note");
        let (size, mtime) = crate::db::file_signature(&metadata);
        connection
            .execute(
                "UPDATE documents SET size_bytes = ?2, mtime_millis = ?3
                 WHERE relative_path = ?1",
                rusqlite::params![relative_path, size as i64, mtime as i64],
            )
            .expect("record the file signature");
    }

    /// The whole point of recording size and time: reconciling an untouched
    /// vault must not open a single note. Proven by making the row's hash a lie
    /// — reaching it at all would report a change that is not there.
    #[test]
    fn classifies_an_unchanged_note_without_opening_it() {
        let (directory, mut connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        record_signature(&connection, directory.path(), "Harbor.md");
        connection
            .execute("UPDATE documents SET content_hash = 'never read'", [])
            .expect("make the recorded hash unusable");

        let summary = super::reconcile(directory.path(), &mut connection).expect("reconcile");

        assert_eq!(summary.synced, 1);
        assert_eq!(summary.file_changed, 0);
    }

    /// A note whose classification has not moved must not be written again, or
    /// opening a vault costs a write per note for no new information.
    #[test]
    fn leaves_an_unchanged_classification_alone() {
        let (directory, mut connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        record_signature(&connection, directory.path(), "Harbor.md");
        super::reconcile(directory.path(), &mut connection).expect("reconcile once");
        let first: i64 = connection
            .query_row("SELECT updated_millis FROM sync_records", [], |row| {
                row.get(0)
            })
            .expect("read when the state was recorded");
        connection
            .execute("UPDATE sync_records SET updated_millis = -1", [])
            .expect("mark the row so a rewrite is visible");

        super::reconcile(directory.path(), &mut connection).expect("reconcile again");

        let second: i64 = connection
            .query_row("SELECT updated_millis FROM sync_records", [], |row| {
                row.get(0)
            })
            .expect("read when the state was recorded");
        assert_eq!(second, -1, "an unchanged note must not be written again");
        assert!(first >= 0, "the first pass does record the state");
    }

    /// The fast path must not swallow a real edit. An editor that saves changes
    /// the file's size and time, which is exactly what it keys on.
    #[test]
    fn still_sees_an_external_edit_after_the_signature_was_recorded() {
        let (directory, mut connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        record_signature(&connection, directory.path(), "Harbor.md");
        std::fs::write(
            directory.path().join("Harbor.md"),
            "# Harbor\n\nEdited elsewhere\n",
        )
        .expect("edit the note outside Anchored");

        let summary = super::reconcile(directory.path(), &mut connection).expect("reconcile");

        assert_eq!(summary.file_changed, 1);
        assert_eq!(summary.synced, 0);
    }

    #[test]
    fn reconciles_an_edit_made_outside_anchored_as_a_file_change() {
        let (directory, mut connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        std::fs::write(
            directory.path().join("Harbor.md"),
            "# Harbor\n\nEdited elsewhere\n",
        )
        .expect("edit the note outside Anchored");

        let summary = super::reconcile(directory.path(), &mut connection).expect("reconcile");

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
        let (directory, mut connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        project_pending_identities(directory.path(), &connection).expect("project");
        // The row still describes the pre-projection bytes, as it would if the
        // process had died before updating itself: the signature it recorded is
        // stale too, which is what sends this down the hashing path at all.
        connection
            .execute(
                "UPDATE documents SET content_hash = 'stale', mtime_millis = 0, size_bytes = 0",
                [],
            )
            .expect("simulate a crash after writing but before recording");

        let summary = super::reconcile(directory.path(), &mut connection).expect("reconcile");

        assert_eq!(
            summary.synced, 1,
            "the file is what Anchored meant to write"
        );
        assert_eq!(summary.conflicts, 0);
    }

    #[test]
    fn saving_writes_the_file_and_the_row_together() {
        let (directory, connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        let mut connection = connection;

        super::save(
            &mut connection,
            directory.path(),
            "Harbor.md",
            "# Harbor edited\n",
        )
        .expect("save");

        assert_eq!(
            std::fs::read_to_string(directory.path().join("Harbor.md")).expect("read note"),
            "# Harbor edited\n"
        );
        let (body, state): (String, String) = connection
            .query_row(
                "SELECT documents.body, sync_records.state
                 FROM documents JOIN sync_records ON sync_records.document_id = documents.id",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read the row and its sync state");
        assert_eq!(body, "# Harbor edited\n");
        assert_eq!(state, "synced", "the file and the row agree immediately");
    }

    /// A save must not come back around as an edit made somewhere else, or
    /// every save would be re-imported and counted as an external change.
    #[test]
    fn a_saved_note_is_not_re_imported_as_an_external_edit() {
        // A real vault layout, because this exercises the same lookup the
        // watcher-driven re-import uses.
        let directory = TempDir::new().expect("create fixture vault");
        crate::continuity::ensure_vault_identity(directory.path()).expect("create identity");
        std::fs::write(directory.path().join("Harbor.md"), "# Harbor\n").expect("write note");
        let mut connection =
            open(&crate::db::database_path(directory.path())).expect("create database");

        super::save(
            &mut connection,
            directory.path(),
            "Harbor.md",
            "# Harbor edited\n",
        )
        .expect("save");
        let revision: i64 = connection
            .query_row("SELECT revision FROM documents", [], |row| row.get(0))
            .expect("read revision");
        drop(connection);

        // Exactly what the watcher reports moments after a save.
        crate::db::import_paths(directory.path(), &["Harbor.md".to_owned()])
            .expect("re-import the saved path");

        let connection = open(&crate::db::database_path(directory.path())).expect("reopen");
        let after: i64 = connection
            .query_row("SELECT revision FROM documents", [], |row| row.get(0))
            .expect("read revision");
        assert_eq!(after, revision, "a save must not count as a change twice");
    }

    /// A save is Anchored changing the note, and its kept version has to say
    /// so. Labelling it as a change from elsewhere would tell the reader their
    /// own typing arrived from another program.
    #[test]
    fn a_saved_version_is_recorded_as_anchored_own_change() {
        let (directory, connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        let mut connection = connection;

        super::save(
            &mut connection,
            directory.path(),
            "Harbor.md",
            "# Harbor edited\n",
        )
        .expect("save");

        let origin: String = connection
            .query_row("SELECT origin FROM document_versions", [], |row| row.get(0))
            .expect("a version should be recorded");
        assert_eq!(origin, "anchored");
    }

    /// An edit arriving through the importer is not Anchored's own, and must
    /// stay distinguishable from one that is.
    #[test]
    fn an_imported_change_is_still_recorded_as_external() {
        let (_directory, connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        documents::upsert(
            &connection,
            &import_note("Harbor.md", b"# Changed elsewhere\n"),
        )
        .expect("import an outside change");

        let origin: String = connection
            .query_row("SELECT origin FROM document_versions", [], |row| row.get(0))
            .expect("a version should be recorded");
        assert_eq!(origin, "external_file");
    }

    #[test]
    fn saving_keeps_what_the_note_held_before() {
        let (directory, connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        let mut connection = connection;

        super::save(
            &mut connection,
            directory.path(),
            "Harbor.md",
            "# Rewritten\n",
        )
        .expect("save");

        let kept: String = connection
            .query_row("SELECT content FROM document_versions", [], |row| {
                row.get(0)
            })
            .expect("a version should be kept");
        assert_eq!(kept, "# Harbor\n");
    }

    /// A note saved into a folder that does not exist cannot be written, and
    /// the row must not be left claiming a change the file never received.
    #[test]
    fn a_failed_write_leaves_the_row_unchanged() {
        let (directory, connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        let mut connection = connection;

        let result = super::save(
            &mut connection,
            directory.path(),
            "Missing Folder/Harbor.md",
            "# Never written\n",
        );

        assert!(result.is_err(), "writing into a missing folder should fail");
        let rows: i64 = connection
            .query_row("SELECT count(*) FROM documents", [], |row| row.get(0))
            .expect("count documents");
        assert_eq!(rows, 1, "the failed save must not leave a row behind");
    }

    /// The guarantee that matters: when both sides changed, neither is lost.
    #[test]
    fn preserves_both_sides_of_a_conflict_and_lists_it() {
        let (directory, mut connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        project_pending_identities(directory.path(), &connection).expect("project");
        connection
            .execute(
                "UPDATE documents SET body = '# Written in Anchored\n', revision = revision + 5",
                [],
            )
            .expect("simulate a change in the app");
        std::fs::write(directory.path().join("Harbor.md"), "# Written on disk\n")
            .expect("simulate a change on disk");

        super::reconcile(directory.path(), &mut connection).expect("reconcile");

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
        let (directory, mut connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        project_pending_identities(directory.path(), &connection).expect("project");
        let uuid: String = connection
            .query_row("SELECT uuid FROM documents", [], |row| row.get(0))
            .expect("read identity");
        crate::db::conflicts::preserve(directory.path(), &uuid, "stored\n", "disk\n")
            .expect("preserve a conflict");

        // The note now matches what Anchored last wrote, so it is settled.
        super::reconcile(directory.path(), &mut connection).expect("reconcile");

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
        let (directory, mut connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        std::fs::remove_file(directory.path().join("Harbor.md")).expect("delete the note");

        let summary = super::reconcile(directory.path(), &mut connection).expect("reconcile");

        assert_eq!(summary.missing_files, 1);
        assert_eq!(summary.synced, 0);
    }

    /// Both sides moved since the last agreement. Nothing is resolved
    /// automatically — the note is flagged and left exactly as it is.
    #[test]
    fn flags_a_conflict_without_touching_either_version() {
        let (directory, mut connection) = vault(&[("Harbor.md", "# Harbor\n")]);
        project_pending_identities(directory.path(), &connection).expect("project");
        connection
            .execute(
                "UPDATE documents SET body = 'changed in the app', revision = revision + 5",
                [],
            )
            .expect("simulate a change in the database");
        std::fs::write(directory.path().join("Harbor.md"), "# Changed on disk\n")
            .expect("simulate a change on disk");

        let summary = super::reconcile(directory.path(), &mut connection).expect("reconcile");

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
