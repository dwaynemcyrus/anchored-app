//! Turns a note's bytes into the row shape the database stores.
//!
//! Deliberately pure: it takes bytes and a relative path, never a filesystem
//! root or an `AppHandle`, so every branch is reachable from a unit test.
//!
//! Metadata is read through the same `metadata` functions the scan path uses,
//! so a row and a scan of the same file cannot disagree about status, type,
//! aliases, or links.

use chrono::DateTime;

use super::keys::{alias_key, name_key, path_key};
use crate::metadata::{
    generate_note_id, inspect_note_aliases, inspect_note_identity, inspect_note_properties,
    inspect_wikilinks, split_note_source, NoteIdentityStatus,
};

/// Matches the scan path's ceiling. A file past it is recorded as a document
/// but not read for metadata, exactly as `read_cached_note_metadata` does.
const MAX_MARKDOWN_FILE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ImportedDocument {
    pub uuid: String,
    /// True when `uuid` was minted here because the file carried no usable
    /// identity. The projection writes it back on the next save; until then
    /// the row holds an identity the file does not yet have.
    pub minted_identity: bool,
    pub path_key: String,
    pub relative_path: String,
    pub name: String,
    pub name_key: String,
    pub parent: String,
    pub is_markdown: bool,
    pub frontmatter_text: String,
    pub body: String,
    pub content_hash: String,
    pub size_bytes: u64,
    /// Filled in by the caller from the file's metadata. Together with
    /// `size_bytes` this is what lets an import skip an unchanged file.
    pub mtime_millis: u64,
    /// Where the change came from. Defaults to a change Anchored did not
    /// make, because that is what reaching the importer means; a save sets it
    /// to `Anchored` before writing.
    pub origin: super::documents::ChangeOrigin,
    pub status: Option<String>,
    pub note_type: Option<String>,
    pub archived_at: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub created_at_millis: Option<i64>,
    pub updated_at_millis: Option<i64>,
    pub aliases: Vec<String>,
    pub outgoing_links: Vec<String>,
}

impl ImportedDocument {
    /// Denormalized onto the row so the full-text triggers can index aliases
    /// without reaching into another table.
    pub fn aliases_text(&self) -> String {
        self.aliases.join(" ")
    }

    pub fn alias_keys(&self) -> Vec<(String, String)> {
        let mut seen = Vec::new();
        for alias in &self.aliases {
            let key = alias_key(alias);
            if !key.is_empty() && !seen.iter().any(|(_, existing)| existing == &key) {
                seen.push((alias.clone(), key));
            }
        }
        seen
    }
}

pub(crate) fn content_hash(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}

/// Builds a row from a file's bytes.
///
/// A note whose `id` is missing, malformed, duplicated, or not a canonical
/// UUIDv7 is given a freshly minted identity rather than being skipped, so
/// every document in the vault is addressable from the moment it is imported.
pub(crate) fn import_note(relative_path: &str, bytes: &[u8]) -> ImportedDocument {
    let size_bytes = bytes.len() as u64;
    let name = file_name(relative_path);
    let mut document = ImportedDocument {
        uuid: String::new(),
        minted_identity: false,
        path_key: path_key(relative_path),
        relative_path: relative_path.to_owned(),
        name_key: name_key(&name),
        name,
        parent: parent_path(relative_path),
        is_markdown: true,
        frontmatter_text: String::new(),
        body: String::new(),
        content_hash: content_hash(bytes),
        size_bytes,
        mtime_millis: 0,
        origin: super::documents::ChangeOrigin::ExternalFile,
        status: None,
        note_type: None,
        archived_at: None,
        created_at: None,
        updated_at: None,
        created_at_millis: None,
        updated_at_millis: None,
        aliases: Vec::new(),
        outgoing_links: Vec::new(),
    };

    // Oversized or non-UTF-8 files still get a row and a hash so the sync
    // engine can see them, but their contents are not interpreted.
    let content = match std::str::from_utf8(bytes) {
        Ok(content) if size_bytes <= MAX_MARKDOWN_FILE_BYTES => content,
        _ => {
            document.uuid = generate_note_id();
            document.minted_identity = true;
            return document;
        }
    };

    match inspect_note_identity(content) {
        NoteIdentityStatus::Present(id) => document.uuid = id,
        NoteIdentityStatus::Missing
        | NoteIdentityStatus::Invalid
        | NoteIdentityStatus::Duplicate
        | NoteIdentityStatus::MalformedFrontMatter => {
            document.uuid = generate_note_id();
            document.minted_identity = true;
        }
    }

    if let Some((frontmatter, body)) = split_note_source(content) {
        document.frontmatter_text = frontmatter.to_owned();
        document.body = body.to_owned();
    } else {
        // Front matter that cannot be delimited safely is left whole in the
        // body rather than guessed at, so no byte is lost.
        document.body = content.to_owned();
    }

    let properties = inspect_note_properties(content);
    document.created_at_millis = properties.created_at.as_deref().and_then(timestamp_millis);
    document.updated_at_millis = properties.updated_at.as_deref().and_then(timestamp_millis);
    document.archived_at = properties.archived_at;
    document.created_at = properties.created_at;
    document.note_type = properties.note_type;
    document.status = properties.status;
    document.updated_at = properties.updated_at;
    document.aliases = inspect_note_aliases(content);
    document.outgoing_links = inspect_wikilinks(content);
    document
}

/// Assets carry no front matter, so they get a row with a hash and nothing to
/// interpret.
pub(crate) fn import_asset(relative_path: &str, bytes: &[u8]) -> ImportedDocument {
    let name = file_name(relative_path);
    ImportedDocument {
        uuid: generate_note_id(),
        minted_identity: true,
        path_key: path_key(relative_path),
        relative_path: relative_path.to_owned(),
        name_key: name_key(&name),
        name,
        parent: parent_path(relative_path),
        is_markdown: false,
        frontmatter_text: String::new(),
        body: String::new(),
        content_hash: content_hash(bytes),
        size_bytes: bytes.len() as u64,
        mtime_millis: 0,
        origin: super::documents::ChangeOrigin::ExternalFile,
        status: None,
        note_type: None,
        archived_at: None,
        created_at: None,
        updated_at: None,
        created_at_millis: None,
        updated_at_millis: None,
        aliases: Vec::new(),
        outgoing_links: Vec::new(),
    }
}

/// Lifecycle timestamps carry a local offset, so they are stored verbatim for
/// round-trip and as UTC millis for ordering. Date-only values have no instant
/// and are left without one rather than being assumed to mean midnight.
fn timestamp_millis(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|parsed| parsed.timestamp_millis())
}

fn file_name(relative_path: &str) -> String {
    relative_path
        .rsplit('/')
        .next()
        .unwrap_or(relative_path)
        .to_owned()
}

fn parent_path(relative_path: &str) -> String {
    match relative_path.rfind('/') {
        Some(index) => relative_path[..index].to_owned(),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::{content_hash, import_asset, import_note};
    use crate::metadata::is_canonical_note_id;

    const ID: &str = "019f989c-2dc0-7a01-8b2c-4d5e6f708192";

    #[test]
    fn keeps_an_existing_canonical_identity() {
        let source = format!("---\nid: {ID}\n---\n# Harbor\n");

        let document = import_note("Notes/Harbor.md", source.as_bytes());

        assert_eq!(document.uuid, ID);
        assert!(!document.minted_identity);
    }

    #[test]
    fn mints_an_identity_for_every_unusable_id() {
        let cases = [
            ("no front matter", "# Harbor\n".to_owned()),
            ("no id key", "---\ntitle: Harbor\n---\n".to_owned()),
            (
                "a superseded ULID",
                "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\n---\n".to_owned(),
            ),
            (
                "a non-v7 UUID",
                "---\nid: f47ac10b-58cc-4372-a567-0e02b2c3d479\n---\n".to_owned(),
            ),
            ("a duplicated id", format!("---\nid: {ID}\nid: {ID}\n---\n")),
            ("malformed front matter", "---\nid: [\n---\n".to_owned()),
        ];

        for (label, source) in cases {
            let document = import_note("Notes/Harbor.md", source.as_bytes());

            assert!(document.minted_identity, "{label} should mint an identity");
            assert!(
                is_canonical_note_id(&document.uuid),
                "{label} should mint a canonical UUIDv7"
            );
        }
    }

    #[test]
    fn splits_front_matter_from_body_without_losing_bytes() {
        let source = "---\nid: 019f989c-2dc0-7a01-8b2c-4d5e6f708192\ntitle: Harbor # keep\n---\n# Harbor\n\nBody\n";

        let document = import_note("Notes/Harbor.md", source.as_bytes());

        assert_eq!(
            format!("{}{}", document.frontmatter_text, document.body),
            source
        );
        assert!(document.frontmatter_text.contains("# keep"));
        assert_eq!(document.body, "# Harbor\n\nBody\n");
    }

    #[test]
    fn keeps_every_byte_when_front_matter_cannot_be_delimited() {
        let source = "---\nid: [\nunclosed\n";

        let document = import_note("Notes/Broken.md", source.as_bytes());

        assert_eq!(
            format!("{}{}", document.frontmatter_text, document.body),
            source
        );
    }

    #[test]
    fn derives_path_name_and_parent() {
        let document = import_note("Projects/Deep Work/Harbor.md", b"# Harbor\n");

        assert_eq!(document.name, "Harbor.md");
        assert_eq!(document.name_key, "harbor");
        assert_eq!(document.parent, "Projects/Deep Work");
        assert_eq!(document.path_key, "projects/deep work/harbor.md");

        let root = import_note("Harbor.md", b"# Harbor\n");
        assert_eq!(root.parent, "");
    }

    #[test]
    fn reads_lifecycle_properties_and_orderable_timestamps() {
        let source = "---\nstatus: archived\ntype: project\ncreated_at: 2026-07-25T09:30:00+02:00\nupdated_at: 2026-07-25T11:00:00+02:00\narchived_at: 2026-07-25T12:00:00+02:00\naliases: [Safe Harbor, North Star]\n---\n[[Field Notes]]\n";

        let document = import_note("Notes/Harbor.md", source.as_bytes());

        assert_eq!(document.status.as_deref(), Some("archived"));
        assert_eq!(document.note_type.as_deref(), Some("project"));
        assert_eq!(
            document.created_at.as_deref(),
            Some("2026-07-25T09:30:00+02:00")
        );
        // 09:30+02:00 is 07:30 UTC: the offset is honoured, not discarded.
        assert_eq!(document.created_at_millis, Some(1_784_964_600_000));
        assert!(document.updated_at_millis > document.created_at_millis);
        assert_eq!(document.aliases, vec!["Safe Harbor", "North Star"]);
        assert_eq!(document.outgoing_links, vec!["Field Notes"]);
        assert_eq!(document.aliases_text(), "Safe Harbor North Star");
    }

    #[test]
    fn leaves_a_date_only_timestamp_without_an_instant() {
        let source = "---\ncreated_at: 2026-07-25\n---\n";

        let document = import_note("Notes/Harbor.md", source.as_bytes());

        assert_eq!(document.created_at.as_deref(), Some("2026-07-25"));
        assert_eq!(document.created_at_millis, None);
    }

    #[test]
    fn records_unreadable_files_without_interpreting_them() {
        let document = import_note("Notes/Binary.md", &[0xff, 0xfe, 0x00]);

        assert!(document.minted_identity);
        assert_eq!(document.body, "");
        assert_eq!(document.size_bytes, 3);
        assert!(!document.content_hash.is_empty());
    }

    #[test]
    fn hashes_bytes_not_parsed_content() {
        // The projection compares the hash of what it wrote against the bytes
        // on disk, so line endings must change the hash.
        assert_ne!(content_hash(b"a\nb\n"), content_hash(b"a\r\nb\r\n"));
        assert_eq!(content_hash(b"same"), content_hash(b"same"));
    }

    #[test]
    fn imports_an_asset_without_front_matter() {
        let document = import_asset("Attachments/diagram.png", &[0x89, 0x50, 0x4e, 0x47]);

        assert!(!document.is_markdown);
        assert_eq!(document.name_key, "diagram.png");
        assert_eq!(document.parent, "Attachments");
        assert!(document.aliases.is_empty());
    }

    /// Every note must survive front-matter/body splitting byte-for-byte,
    /// because the projection reassembles a file from these two columns. A
    /// case that loses or duplicates a byte here corrupts the file on write.
    #[test]
    fn round_trips_every_front_matter_shape_without_losing_a_byte() {
        let cases: [&str; 14] = [
            "",
            "# Body only\n",
            "---\n---\n",
            "---\n---\n# Body\n",
            "---\nid: 019f989c-2dc0-7a01-8b2c-4d5e6f708192\n---\n# Body\n",
            "---\r\ntitle: CRLF\r\n---\r\n# Body\r\n",
            "\u{feff}---\ntitle: BOM\n---\n# Body\n",
            "---\ntitle: No trailing newline\n---\n# Body",
            "---\n# comment only\n---\n",
            "---\ntitle: Trailing spaces   \n---\n",
            "---\nlist:\n  - one\n  - two\n---\nBody\n",
            "---\nnested:\n  key: value\n---\nBody\n",
            // Front matter is never opened, so the delimiter is body text.
            "Body first\n---\nnot: front matter\n---\n",
            "---\nunterminated: true\n",
        ];

        for source in cases {
            let document = import_note("Notes/Case.md", source.as_bytes());

            assert_eq!(
                format!("{}{}", document.frontmatter_text, document.body),
                source,
                "front matter and body must reassemble exactly: {source:?}"
            );
        }
    }

    #[test]
    fn deduplicates_alias_keys_while_keeping_spellings() {
        let source = "---\naliases: [Safe Harbor, safe harbor, North Star]\n---\n";

        let document = import_note("Notes/Harbor.md", source.as_bytes());

        let keys = document.alias_keys();
        assert_eq!(keys.len(), 2);
        assert_eq!(
            keys[0],
            ("Safe Harbor".to_owned(), "safe harbor".to_owned())
        );
    }
}
