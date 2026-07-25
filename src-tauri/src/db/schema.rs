//! Ordered schema migrations. Each entry is applied exactly once, in order,
//! and `PRAGMA user_version` records how many have run. Never edit a shipped
//! migration; append a new one instead.

pub(super) const MIGRATIONS: &[&str] = &[INITIAL_SCHEMA];

/// Internal foreign keys use the rowid alias so `links` rows cost 8 bytes per
/// reference instead of 36, and so external-content FTS5 has a stable rowid to
/// join against. Only `uuid` ever crosses the Tauri boundary.
const INITIAL_SCHEMA: &str = r#"
CREATE TABLE documents (
    id                 INTEGER PRIMARY KEY,
    uuid               TEXT    NOT NULL UNIQUE,
    -- NFC-normalized, case-folded, '/'-separated. APFS is
    -- case-insensitive-but-preserving and Finder hands back NFD, so matching
    -- on the observed path would let one file resolve to two rows.
    path_key           TEXT    NOT NULL,
    relative_path      TEXT    NOT NULL,
    name               TEXT    NOT NULL,
    name_key           TEXT    NOT NULL,
    parent             TEXT    NOT NULL DEFAULT '',
    is_markdown        INTEGER NOT NULL DEFAULT 1,
    -- Stored verbatim, including delimiters, so projection can replace byte
    -- ranges rather than re-serializing YAML and losing comments or ordering.
    frontmatter_text   TEXT    NOT NULL DEFAULT '',
    body               TEXT    NOT NULL DEFAULT '',
    content_hash       TEXT    NOT NULL,
    size_bytes         INTEGER NOT NULL DEFAULT 0,
    status             TEXT,
    note_type          TEXT,
    archived_at        TEXT,
    created_at         TEXT,
    updated_at         TEXT,
    -- Timestamps are kept twice: verbatim for round-trip (they carry a local
    -- offset) and as UTC millis, because sorting the strings is wrong across
    -- offset and daylight-saving changes.
    created_at_millis  INTEGER,
    updated_at_millis  INTEGER,
    -- Derived index over front-matter keys Anchored does not manage. Rebuilt
    -- from frontmatter_text; never a write source.
    frontmatter_json   TEXT,
    -- Denormalized for FTS5, which cannot reach into the aliases table.
    aliases_text       TEXT    NOT NULL DEFAULT '',
    revision           INTEGER NOT NULL DEFAULT 1,
    deleted_at         INTEGER,
    trash_entry_id     TEXT
) STRICT;

CREATE UNIQUE INDEX idx_documents_path_key
    ON documents(path_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_status
    ON documents(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_note_type
    ON documents(note_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_name_key
    ON documents(name_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_deleted
    ON documents(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_documents_updated ON documents(updated_at_millis DESC);

-- Kept out of documents because it churns on every save while body does not,
-- and SQLite rewrites the whole row for any column update.
CREATE TABLE sync_records (
    document_id            INTEGER PRIMARY KEY
                           REFERENCES documents(id) ON DELETE CASCADE,
    state                  TEXT    NOT NULL,
    -- The durable record of what Anchored last wrote. This is what makes a
    -- crash mid-projection recoverable as ordinary startup reconciliation
    -- rather than an unanswerable question.
    projected_hash         TEXT,
    projected_size         INTEGER,
    projected_mtime_millis INTEGER,
    projected_revision     INTEGER,
    observed_hash          TEXT,
    observed_mtime_millis  INTEGER,
    last_error             TEXT,
    updated_millis         INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_sync_records_state
    ON sync_records(state) WHERE state <> 'synced';

CREATE TABLE document_versions (
    id             INTEGER PRIMARY KEY,
    document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    revision       INTEGER NOT NULL,
    content        TEXT    NOT NULL,
    content_hash   TEXT    NOT NULL,
    origin         TEXT    NOT NULL,
    created_millis INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_document_versions_doc
    ON document_versions(document_id, revision DESC);

CREATE TABLE links (
    source_document_id INTEGER NOT NULL
                       REFERENCES documents(id) ON DELETE CASCADE,
    target_document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
    target_raw         TEXT    NOT NULL,
    target_key         TEXT    NOT NULL,
    resolution         TEXT    NOT NULL,
    occurrence_index   INTEGER NOT NULL,
    PRIMARY KEY (source_document_id, occurrence_index)
) STRICT;

CREATE INDEX idx_links_target ON links(target_document_id);
CREATE INDEX idx_links_target_key ON links(target_key);

CREATE TABLE aliases (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    alias       TEXT    NOT NULL,
    alias_key   TEXT    NOT NULL,
    PRIMARY KEY (document_id, alias_key)
) STRICT;

CREATE INDEX idx_aliases_key ON aliases(alias_key);

CREATE TABLE tags (
    id      INTEGER PRIMARY KEY,
    tag     TEXT NOT NULL,
    tag_key TEXT NOT NULL UNIQUE
) STRICT;

CREATE TABLE document_tags (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    source      TEXT    NOT NULL,
    PRIMARY KEY (document_id, tag_id)
) STRICT;

CREATE INDEX idx_document_tags_tag ON document_tags(tag_id);

CREATE TABLE attachments (
    id            INTEGER PRIMARY KEY,
    uuid          TEXT    NOT NULL UNIQUE,
    path_key      TEXT    NOT NULL UNIQUE,
    relative_path TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    parent        TEXT    NOT NULL DEFAULT '',
    size_bytes    INTEGER NOT NULL,
    mtime_millis  INTEGER NOT NULL,
    content_hash  TEXT
) STRICT;

CREATE TABLE saved_searches (
    id             INTEGER PRIMARY KEY,
    uuid           TEXT    NOT NULL UNIQUE,
    name           TEXT    NOT NULL,
    query          TEXT    NOT NULL,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    created_millis INTEGER NOT NULL
) STRICT;

CREATE TABLE settings (
    key            TEXT PRIMARY KEY,
    value          TEXT NOT NULL,
    updated_millis INTEGER NOT NULL
) STRICT;

-- External content, not contentless: search results carry a snippet, and a
-- contentless table stores no text to build one from.
CREATE VIRTUAL TABLE documents_fts USING fts5(
    name,
    aliases_text,
    body,
    content='documents',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER documents_fts_insert AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, name, aliases_text, body)
    VALUES (new.id, new.name, new.aliases_text, new.body);
END;

-- The 'delete' command must be handed the OLD column values verbatim. Passing
-- anything else corrupts the index silently, with no error at write time.
CREATE TRIGGER documents_fts_delete AFTER DELETE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, name, aliases_text, body)
    VALUES ('delete', old.id, old.name, old.aliases_text, old.body);
END;

-- Restricted to the indexed columns so revision and sync churn does not
-- rewrite the index on every save.
CREATE TRIGGER documents_fts_update
AFTER UPDATE OF name, aliases_text, body ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, name, aliases_text, body)
    VALUES ('delete', old.id, old.name, old.aliases_text, old.body);
    INSERT INTO documents_fts(rowid, name, aliases_text, body)
    VALUES (new.id, new.name, new.aliases_text, new.body);
END;
"#;
