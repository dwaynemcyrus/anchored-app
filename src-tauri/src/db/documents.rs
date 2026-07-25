//! Persistence for imported documents.
//!
//! Every function takes a `&Connection`, so a caller decides the transaction
//! boundary. A whole-vault import is one transaction; a single changed file is
//! its own.

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension};

use super::import::ImportedDocument;
use super::keys::link_target_key;
use super::map_error;
use crate::vault::VaultError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Upserted {
    pub id: i64,
    /// Whether this path gained a row it did not have. A new or removed
    /// document changes what *other* notes' links resolve to; an edit to an
    /// existing one does not.
    pub created: bool,
}

/// Writes a document and its derived alias and link rows.
///
/// A row is found by path first: the file at a path is the thing being
/// re-imported, and reusing its row keeps the identity already assigned there
/// rather than minting a second one for a note that merely changed on disk.
///
/// Failing that, a row carrying the same identity is adopted and re-pointed at
/// the new path. That is what a rename or a move looks like from here, and it
/// is why a note keeps its identity across one. Without it the insert would
/// also collide with the old row's unique identity.
pub(crate) fn upsert(
    connection: &Connection,
    document: &ImportedDocument,
) -> Result<Upserted, VaultError> {
    let mut existing: Option<(i64, String)> = connection
        .query_row(
            "SELECT id, uuid FROM documents WHERE path_key = ?1 AND deleted_at IS NULL",
            params![document.path_key],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(map_error("A document could not be looked up"))?;

    // A minted identity is fresh and cannot name an existing note, so only a
    // identity the file actually carries can claim a row this way.
    if existing.is_none() && !document.minted_identity {
        existing = connection
            .query_row(
                "SELECT id, uuid FROM documents WHERE uuid = ?1 AND deleted_at IS NULL",
                params![document.uuid],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(map_error("A document identity could not be looked up"))?;
    }

    // A freshly minted identity never displaces one already recorded for this
    // path; the file simply has not been written back yet.
    let uuid = match &existing {
        Some((_, recorded)) if document.minted_identity => recorded.clone(),
        _ => document.uuid.clone(),
    };

    let created = existing.is_none();
    let id = match existing {
        Some((id, _)) => {
            connection
                .execute(
                    "UPDATE documents SET
                        uuid = ?2, relative_path = ?3, name = ?4, name_key = ?5, parent = ?6,
                        is_markdown = ?7, frontmatter_text = ?8, body = ?9, content_hash = ?10,
                        size_bytes = ?11, status = ?12, note_type = ?13, archived_at = ?14,
                        created_at = ?15, updated_at = ?16, created_at_millis = ?17,
                        updated_at_millis = ?18, aliases_text = ?19, path_key = ?20,
                        mtime_millis = ?21, revision = revision + 1
                     WHERE id = ?1",
                    params![
                        id,
                        uuid,
                        document.relative_path,
                        document.name,
                        document.name_key,
                        document.parent,
                        document.is_markdown,
                        document.frontmatter_text,
                        document.body,
                        document.content_hash,
                        document.size_bytes as i64,
                        document.status,
                        document.note_type,
                        document.archived_at,
                        document.created_at,
                        document.updated_at,
                        document.created_at_millis,
                        document.updated_at_millis,
                        document.aliases_text(),
                        document.path_key,
                        document.mtime_millis as i64,
                    ],
                )
                .map_err(map_error("A document could not be updated"))?;
            id
        }
        None => {
            connection
                .execute(
                    "INSERT INTO documents (
                        uuid, path_key, relative_path, name, name_key, parent, is_markdown,
                        frontmatter_text, body, content_hash, size_bytes, status, note_type,
                        archived_at, created_at, updated_at, created_at_millis,
                        updated_at_millis, aliases_text, mtime_millis
                     ) VALUES (
                        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                        ?17, ?18, ?19, ?20
                     )",
                    params![
                        uuid,
                        document.path_key,
                        document.relative_path,
                        document.name,
                        document.name_key,
                        document.parent,
                        document.is_markdown,
                        document.frontmatter_text,
                        document.body,
                        document.content_hash,
                        document.size_bytes as i64,
                        document.status,
                        document.note_type,
                        document.archived_at,
                        document.created_at,
                        document.updated_at,
                        document.created_at_millis,
                        document.updated_at_millis,
                        document.aliases_text(),
                        document.mtime_millis as i64,
                    ],
                )
                .map_err(map_error("A document could not be recorded"))?;
            connection.last_insert_rowid()
        }
    };

    replace_aliases(connection, id, document)?;
    replace_links(connection, id, document)?;
    Ok(Upserted { id, created })
}

/// Resolves only the links leaving one document. Used after an edit that did
/// not add or remove any document, where no other note's links can have
/// changed meaning — a full re-resolution would rewrite the whole table on
/// every keystroke-triggered autosave.
pub(crate) fn resolve_links_from(
    connection: &Connection,
    source_document_id: i64,
) -> Result<(), VaultError> {
    connection
        .execute(RESOLVE_LINKS_SQL, params![Some(source_document_id)])
        .map(drop)
        .map_err(map_error("Document links could not be resolved"))
}

fn replace_aliases(
    connection: &Connection,
    id: i64,
    document: &ImportedDocument,
) -> Result<(), VaultError> {
    connection
        .execute("DELETE FROM aliases WHERE document_id = ?1", params![id])
        .map_err(map_error("Document aliases could not be cleared"))?;
    for (ordinal, (alias, key)) in document.alias_keys().into_iter().enumerate() {
        connection
            .execute(
                "INSERT INTO aliases (document_id, alias, alias_key, ordinal)
                 VALUES (?1, ?2, ?3, ?4)",
                params![id, alias, key, ordinal as i64],
            )
            .map_err(map_error("A document alias could not be recorded"))?;
    }
    Ok(())
}

/// Links are stored unresolved. Resolution happens in a second pass once every
/// document exists, because a note can link to one imported after it.
fn replace_links(
    connection: &Connection,
    id: i64,
    document: &ImportedDocument,
) -> Result<(), VaultError> {
    connection
        .execute(
            "DELETE FROM links WHERE source_document_id = ?1",
            params![id],
        )
        .map_err(map_error("Document links could not be cleared"))?;
    for (index, target) in document.outgoing_links.iter().enumerate() {
        connection
            .execute(
                "INSERT INTO links (
                    source_document_id, target_raw, target_key, resolution, occurrence_index
                 ) VALUES (?1, ?2, ?3, 'unresolved', ?4)",
                params![id, target, link_target_key(target), index as i64],
            )
            .map_err(map_error("A document link could not be recorded"))?;
    }
    Ok(())
}

/// Points links at the document they name, preferring an exact path, then a
/// unique filename, then a unique alias — the same precedence
/// `resolveWikilink` applies in the interface. A name shared by more than one
/// document stays ambiguous rather than resolving arbitrarily.
///
/// A NULL parameter resolves every link; a document id resolves only the links
/// leaving that document.
const RESOLVE_LINKS_SQL: &str = "
UPDATE links SET
    target_document_id = COALESCE(
        (SELECT id FROM documents
         WHERE path_key = links.target_key
            OR path_key = links.target_key || '.md'
         LIMIT 1),
        CASE WHEN (SELECT count(*) FROM documents WHERE name_key = links.target_key) = 1
             THEN (SELECT id FROM documents WHERE name_key = links.target_key) END,
        CASE WHEN (SELECT count(*) FROM documents WHERE name_key = links.target_key) = 0
              AND (SELECT count(*) FROM aliases WHERE alias_key = links.target_key) = 1
             THEN (SELECT document_id FROM aliases WHERE alias_key = links.target_key) END
    ),
    resolution = CASE
        WHEN EXISTS (SELECT 1 FROM documents
                     WHERE path_key = links.target_key
                        OR path_key = links.target_key || '.md') THEN 'path'
        WHEN (SELECT count(*) FROM documents WHERE name_key = links.target_key) = 1
            THEN 'filename'
        WHEN (SELECT count(*) FROM documents WHERE name_key = links.target_key) > 1
            THEN 'ambiguous'
        WHEN (SELECT count(*) FROM aliases WHERE alias_key = links.target_key) = 1
            THEN 'alias'
        ELSE 'unresolved'
    END
WHERE ?1 IS NULL OR source_document_id = ?1";

/// Re-resolves every link in the vault. Needed whenever a document is added or
/// removed, because that changes what other notes' links point at.
pub(crate) fn resolve_links(connection: &Connection) -> Result<(), VaultError> {
    connection
        .execute(RESOLVE_LINKS_SQL, params![None::<i64>])
        .map(drop)
        .map_err(map_error("Document links could not be resolved"))
}

/// Everything the interface needs about a note that is not already known from
/// walking the directory tree.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct IndexedMetadata {
    pub aliases: Vec<String>,
    pub archived_at: Option<String>,
    pub created_at: Option<String>,
    pub identity: Option<String>,
    pub note_type: Option<String>,
    pub outgoing_links: Vec<String>,
    pub status: Option<String>,
    pub updated_at: Option<String>,
}

/// Reads every note's metadata in three queries rather than one per note, so
/// building a snapshot does not scale in round trips with vault size.
pub(crate) fn indexed_metadata(
    connection: &Connection,
) -> Result<HashMap<String, IndexedMetadata>, VaultError> {
    let mut by_path: HashMap<String, IndexedMetadata> = HashMap::new();
    let mut ids: HashMap<i64, String> = HashMap::new();

    let mut statement = connection
        .prepare(
            "SELECT id, relative_path, uuid, status, note_type, archived_at, created_at,
                    updated_at
             FROM documents
             WHERE is_markdown = 1 AND deleted_at IS NULL",
        )
        .map_err(map_error("Indexed metadata could not be prepared"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
            ))
        })
        .map_err(map_error("Indexed metadata could not be read"))?;
    for row in rows {
        let (id, path, uuid, status, note_type, archived_at, created_at, updated_at) =
            row.map_err(map_error("Indexed metadata could not be read"))?;
        ids.insert(id, path.clone());
        by_path.insert(
            path,
            IndexedMetadata {
                identity: Some(uuid),
                status,
                note_type,
                archived_at,
                created_at,
                updated_at,
                ..IndexedMetadata::default()
            },
        );
    }

    let mut statement = connection
        .prepare("SELECT document_id, alias FROM aliases ORDER BY document_id, ordinal")
        .map_err(map_error("Indexed aliases could not be prepared"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(map_error("Indexed aliases could not be read"))?;
    for row in rows {
        let (id, alias) = row.map_err(map_error("Indexed aliases could not be read"))?;
        if let Some(entry) = ids.get(&id).and_then(|path| by_path.get_mut(path)) {
            entry.aliases.push(alias);
        }
    }

    let mut statement = connection
        .prepare(
            "SELECT source_document_id, target_raw FROM links
             ORDER BY source_document_id, occurrence_index",
        )
        .map_err(map_error("Indexed links could not be prepared"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(map_error("Indexed links could not be read"))?;
    for row in rows {
        let (id, target) = row.map_err(map_error("Indexed links could not be read"))?;
        if let Some(entry) = ids.get(&id).and_then(|path| by_path.get_mut(path)) {
            entry.outgoing_links.push(target);
        }
    }

    Ok(by_path)
}

/// The size and modification time last recorded for each path, keyed the same
/// way rows are matched.
pub(crate) fn indexed_signatures(
    connection: &Connection,
) -> Result<HashMap<String, (u64, u64)>, VaultError> {
    let mut statement = connection
        .prepare(
            "SELECT path_key, size_bytes, mtime_millis FROM documents WHERE deleted_at IS NULL",
        )
        .map_err(map_error("Indexed file signatures could not be prepared"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)? as u64,
                row.get::<_, i64>(2)? as u64,
            ))
        })
        .map_err(map_error("Indexed file signatures could not be read"))?;

    let mut signatures = HashMap::new();
    for row in rows {
        let (path_key, size, mtime) =
            row.map_err(map_error("Indexed file signatures could not be read"))?;
        signatures.insert(path_key, (size, mtime));
    }
    Ok(signatures)
}

/// Removes the row for one path, if it has one. Matching goes through the
/// normalized key so a differently-spelled but equivalent path still hits.
pub(crate) fn delete_by_path(
    connection: &Connection,
    relative_path: &str,
) -> Result<(), VaultError> {
    connection
        .execute(
            "DELETE FROM documents WHERE path_key = ?1",
            params![super::keys::path_key(relative_path)],
        )
        .map(drop)
        .map_err(map_error("A document could not be removed"))
}

/// Removes rows for paths no longer present, so a whole-vault import converges
/// on exactly what is on disk.
pub(crate) fn delete_missing(
    connection: &Connection,
    present_path_keys: &[String],
) -> Result<usize, VaultError> {
    let mut statement = connection
        .prepare("SELECT id, path_key FROM documents WHERE deleted_at IS NULL")
        .map_err(map_error("Documents could not be listed"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(map_error("Documents could not be listed"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_error("Documents could not be listed"))?;
    drop(statement);

    let mut removed = 0;
    for (id, path_key) in rows {
        if !present_path_keys.iter().any(|present| present == &path_key) {
            connection
                .execute("DELETE FROM documents WHERE id = ?1", params![id])
                .map_err(map_error("A document could not be removed"))?;
            removed += 1;
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use tempfile::tempdir;

    use super::{delete_missing, resolve_links, upsert};
    use crate::db::import::import_note;

    const ID: &str = "019f989c-2dc0-7a01-8b2c-4d5e6f708192";

    fn database() -> (tempfile::TempDir, Connection) {
        let directory = tempdir().expect("create fixture directory");
        let connection =
            crate::db::open(&directory.path().join("vault.db")).expect("create database");
        (directory, connection)
    }

    fn resolution(connection: &Connection, target: &str) -> (String, Option<i64>) {
        connection
            .query_row(
                "SELECT resolution, target_document_id FROM links WHERE target_raw = ?1",
                [target],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read link resolution")
    }

    #[test]
    fn reuses_the_row_and_identity_for_a_repeated_path() {
        let (_directory, connection) = database();
        let first = import_note("Notes/Harbor.md", b"# Harbor\n");
        let id = upsert(&connection, &first).expect("insert document");

        let second = import_note("Notes/Harbor.md", b"# Harbor edited\n");
        let same = upsert(&connection, &second).expect("update document");

        assert_eq!(id.id, same.id);
        assert!(id.created, "the first import creates the row");
        assert!(!same.created, "the second import reuses it");
        assert_ne!(
            first.uuid, second.uuid,
            "each import mints its own candidate"
        );
        let (uuid, body, revision): (String, String, i64) = connection
            .query_row(
                "SELECT uuid, body, revision FROM documents WHERE id = ?1",
                [id.id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("read document");
        assert_eq!(uuid, first.uuid, "the first identity is kept");
        assert_eq!(body, "# Harbor edited\n");
        assert_eq!(revision, 2);
    }

    #[test]
    fn adopts_an_identity_the_file_actually_carries() {
        let (_directory, connection) = database();
        upsert(&connection, &import_note("Notes/Harbor.md", b"# Harbor\n")).expect("insert");

        let stamped = import_note(
            "Notes/Harbor.md",
            b"---\nid: 019f989c-2dc0-7a01-8b2c-4d5e6f708192\n---\n# Harbor\n",
        );
        upsert(&connection, &stamped).expect("update");

        let uuid: String = connection
            .query_row("SELECT uuid FROM documents", [], |row| row.get(0))
            .expect("read identity");
        assert_eq!(uuid, "019f989c-2dc0-7a01-8b2c-4d5e6f708192");
    }

    /// A note keeps its identity when it moves. The row is adopted by
    /// identity, not re-created, so backlinks and history stay attached — and
    /// the insert does not collide with the old row's unique identity.
    #[test]
    fn follows_a_note_that_moved_to_a_new_path() {
        let (_directory, connection) = database();
        let source = format!("---\nid: {ID}\n---\n# Harbor\n");
        let before = upsert(
            &connection,
            &import_note("Notes/Harbor.md", source.as_bytes()),
        )
        .expect("insert at the original path");

        let after = upsert(
            &connection,
            &import_note("Archive/Anchorage.md", source.as_bytes()),
        )
        .expect("import at the new path");

        assert_eq!(before.id, after.id, "the same row follows the note");
        assert!(!after.created);
        let (uuid, path, count): (String, String, i64) = connection
            .query_row(
                "SELECT uuid, relative_path, (SELECT count(*) FROM documents) FROM documents",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("read the moved document");
        assert_eq!(count, 1, "a move must not leave two rows behind");
        assert_eq!(uuid, ID);
        assert_eq!(path, "Archive/Anchorage.md");
    }

    /// Without an identity in the file there is nothing to follow, so a note
    /// arriving at a new path is a new document rather than a silent adoption
    /// of an unrelated row.
    #[test]
    fn does_not_adopt_a_row_for_a_note_without_an_identity() {
        let (_directory, connection) = database();
        upsert(&connection, &import_note("Notes/Harbor.md", b"# Harbor\n")).expect("insert first");

        upsert(&connection, &import_note("Notes/Other.md", b"# Other\n")).expect("insert second");

        let count: i64 = connection
            .query_row("SELECT count(*) FROM documents", [], |row| row.get(0))
            .expect("count documents");
        assert_eq!(count, 2);
    }

    #[test]
    fn treats_a_decomposed_path_as_the_same_document() {
        let (_directory, connection) = database();
        let composed = import_note("Notes/Z\u{00fc}rich.md", b"# One\n");
        let decomposed = import_note("Notes/Zu\u{0308}rich.md", b"# Two\n");

        upsert(&connection, &composed).expect("insert composed");
        upsert(&connection, &decomposed).expect("upsert decomposed");

        let count: i64 = connection
            .query_row("SELECT count(*) FROM documents", [], |row| row.get(0))
            .expect("count documents");
        assert_eq!(count, 1, "one file on disk must not become two rows");
    }

    #[test]
    fn replaces_aliases_and_links_rather_than_accumulating_them() {
        let (_directory, connection) = database();
        upsert(
            &connection,
            &import_note(
                "Notes/Harbor.md",
                b"---\naliases: [Safe Harbor, North Star]\n---\n[[Field Notes]]\n[[Planning]]\n",
            ),
        )
        .expect("insert");

        upsert(
            &connection,
            &import_note(
                "Notes/Harbor.md",
                b"---\naliases: [Safe Harbor]\n---\n[[Field Notes]]\n",
            ),
        )
        .expect("re-import with fewer");

        let aliases: i64 = connection
            .query_row("SELECT count(*) FROM aliases", [], |row| row.get(0))
            .expect("count aliases");
        let links: i64 = connection
            .query_row("SELECT count(*) FROM links", [], |row| row.get(0))
            .expect("count links");
        assert_eq!(aliases, 1);
        assert_eq!(links, 1);
    }

    #[test]
    fn resolves_links_by_path_filename_and_alias() {
        let (_directory, connection) = database();
        upsert(
            &connection,
            &import_note("Notes/Harbor.md", b"---\naliases: [North Star]\n---\n"),
        )
        .expect("insert target");
        let source = import_note(
            "Notes/Source.md",
            b"[[Notes/Harbor]]\n[[Harbor]]\n[[North Star]]\n[[Nowhere]]\n[[Harbor#Anchorage]]\n",
        );
        upsert(&connection, &source).expect("insert source");

        resolve_links(&connection).expect("resolve links");

        assert_eq!(resolution(&connection, "Notes/Harbor").0, "path");
        assert_eq!(resolution(&connection, "Harbor").0, "filename");
        assert_eq!(resolution(&connection, "North Star").0, "alias");
        assert_eq!(
            resolution(&connection, "Harbor#Anchorage").0,
            "filename",
            "a heading anchor addresses a place inside a note, not another note"
        );
        let (missing, target) = resolution(&connection, "Nowhere");
        assert_eq!(missing, "unresolved");
        assert_eq!(target, None);
    }

    #[test]
    fn marks_a_name_shared_by_two_notes_as_ambiguous() {
        let (_directory, connection) = database();
        upsert(&connection, &import_note("Notes/Planning.md", b"")).expect("insert first");
        upsert(&connection, &import_note("Archive/Planning.md", b"")).expect("insert second");
        upsert(
            &connection,
            &import_note("Notes/Source.md", b"[[Planning]]\n"),
        )
        .expect("insert");

        resolve_links(&connection).expect("resolve links");

        let (resolution, target) = resolution(&connection, "Planning");
        assert_eq!(resolution, "ambiguous");
        assert_eq!(target, None, "an ambiguous link must not pick a winner");
    }

    #[test]
    fn scoped_resolution_matches_full_resolution() {
        let (_directory, connection) = database();
        upsert(
            &connection,
            &import_note("Notes/Harbor.md", b"---\naliases: [North Star]\n---\n"),
        )
        .expect("insert target");
        upsert(&connection, &import_note("Notes/Planning.md", b"")).expect("insert other");
        let source = upsert(
            &connection,
            &import_note(
                "Notes/Source.md",
                b"[[Notes/Harbor]]\n[[Harbor]]\n[[North Star]]\n[[Nowhere]]\n[[Harbor#Top]]\n",
            ),
        )
        .expect("insert source");

        super::resolve_links_from(&connection, source.id).expect("resolve one document");
        let scoped = link_resolutions(&connection);
        resolve_links(&connection).expect("resolve everything");

        assert_eq!(scoped, link_resolutions(&connection));
        assert_eq!(
            scoped,
            vec![
                ("Notes/Harbor".to_owned(), "path".to_owned()),
                ("Harbor".to_owned(), "filename".to_owned()),
                ("North Star".to_owned(), "alias".to_owned()),
                ("Nowhere".to_owned(), "unresolved".to_owned()),
                ("Harbor#Top".to_owned(), "filename".to_owned()),
            ]
        );
    }

    #[test]
    fn scoped_resolution_leaves_other_documents_alone() {
        let (_directory, connection) = database();
        upsert(&connection, &import_note("Notes/Harbor.md", b"")).expect("insert target");
        let first = upsert(&connection, &import_note("Notes/First.md", b"[[Harbor]]\n"))
            .expect("insert first");
        upsert(
            &connection,
            &import_note("Notes/Second.md", b"[[Harbor]]\n"),
        )
        .expect("insert second");

        super::resolve_links_from(&connection, first.id).expect("resolve only the first");

        assert_eq!(
            link_resolutions(&connection),
            vec![
                ("Harbor".to_owned(), "filename".to_owned()),
                ("Harbor".to_owned(), "unresolved".to_owned()),
            ]
        );
    }

    fn link_resolutions(connection: &Connection) -> Vec<(String, String)> {
        connection
            .prepare(
                "SELECT target_raw, resolution FROM links
                 ORDER BY source_document_id, occurrence_index",
            )
            .expect("prepare")
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .expect("query")
            .collect::<Result<_, _>>()
            .expect("collect")
    }

    #[test]
    fn keeps_aliases_in_authored_order() {
        let (_directory, connection) = database();
        upsert(
            &connection,
            // Deliberately not alphabetical: reading these back sorted would
            // reorder what the user wrote.
            &import_note(
                "Notes/Harbor.md",
                b"---\naliases: [Safe Harbor, North Star, Anchorage]\n---\n",
            ),
        )
        .expect("insert");

        let aliases: Vec<String> = connection
            .prepare("SELECT alias FROM aliases ORDER BY ordinal")
            .expect("prepare")
            .query_map([], |row| row.get(0))
            .expect("query")
            .collect::<Result<_, _>>()
            .expect("collect");

        assert_eq!(aliases, vec!["Safe Harbor", "North Star", "Anchorage"]);
    }

    #[test]
    fn removes_rows_for_files_no_longer_on_disk() {
        let (_directory, connection) = database();
        let kept = import_note("Notes/Harbor.md", b"");
        upsert(&connection, &kept).expect("insert kept");
        upsert(&connection, &import_note("Notes/Gone.md", b"")).expect("insert gone");

        let removed = delete_missing(&connection, std::slice::from_ref(&kept.path_key))
            .expect("remove missing");

        assert_eq!(removed, 1);
        let remaining: String = connection
            .query_row("SELECT relative_path FROM documents", [], |row| row.get(0))
            .expect("read remaining document");
        assert_eq!(remaining, "Notes/Harbor.md");
    }

    #[test]
    fn cascades_aliases_and_links_when_a_document_is_removed() {
        let (_directory, connection) = database();
        upsert(
            &connection,
            &import_note(
                "Notes/Gone.md",
                b"---\naliases: [Gone]\n---\n[[Somewhere]]\n",
            ),
        )
        .expect("insert");

        delete_missing(&connection, &[]).expect("remove every document");

        for table in ["aliases", "links"] {
            let count: i64 = connection
                .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .expect("count rows");
            assert_eq!(count, 0, "{table} rows must not outlive their document");
        }
    }
}
