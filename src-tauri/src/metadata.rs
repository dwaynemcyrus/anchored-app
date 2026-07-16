use std::fmt;

use ulid::Ulid;
use yaml_rust2::{Yaml, YamlLoader};

const UTF8_BOM: &str = "\u{feff}";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NoteIdentityStatus {
    Present(String),
    Missing,
    Invalid,
    Duplicate,
    MalformedFrontMatter,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdentityMutationError {
    ExistingIdentity,
    InvalidIdentity,
    UnsafeFrontMatter,
}

impl fmt::Display for IdentityMutationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::ExistingIdentity => "the note already has a different identity",
            Self::InvalidIdentity => "the proposed note identity is not a canonical ULID",
            Self::UnsafeFrontMatter => "the note front matter cannot be changed safely",
        };
        formatter.write_str(message)
    }
}

#[derive(Debug, Clone, Copy)]
struct FrontMatterBounds {
    body_start: usize,
    body_end: usize,
    opening_end: usize,
    newline: &'static str,
}

pub fn generate_note_id() -> String {
    Ulid::new().to_string()
}

pub fn inspect_note_identity(content: &str) -> NoteIdentityStatus {
    let front_matter = match front_matter_bounds(content) {
        Ok(Some(bounds)) => bounds,
        Ok(None) => return NoteIdentityStatus::Missing,
        Err(()) => return NoteIdentityStatus::MalformedFrontMatter,
    };
    let yaml = &content[front_matter.body_start..front_matter.body_end];
    if count_top_level_id_keys(yaml) > 1 {
        return NoteIdentityStatus::Duplicate;
    }
    let documents = match YamlLoader::load_from_str(yaml) {
        Ok(documents) => documents,
        Err(_) => return NoteIdentityStatus::MalformedFrontMatter,
    };
    let Some(document) = documents.first() else {
        return NoteIdentityStatus::Missing;
    };
    let Yaml::Hash(mapping) = document else {
        return NoteIdentityStatus::MalformedFrontMatter;
    };

    let Some(value) = mapping.get(&Yaml::String("id".to_owned())) else {
        return NoteIdentityStatus::Missing;
    };
    let Yaml::String(id) = value else {
        return NoteIdentityStatus::Invalid;
    };
    let Ok(parsed) = Ulid::from_string(id) else {
        return NoteIdentityStatus::Invalid;
    };
    if parsed.to_string() != *id {
        return NoteIdentityStatus::Invalid;
    }

    NoteIdentityStatus::Present(id.clone())
}

pub fn add_note_identity(content: &str, id: &str) -> Result<String, IdentityMutationError> {
    let parsed = Ulid::from_string(id).map_err(|_| IdentityMutationError::InvalidIdentity)?;
    if parsed.to_string() != id {
        return Err(IdentityMutationError::InvalidIdentity);
    }

    match inspect_note_identity(content) {
        NoteIdentityStatus::Present(existing) if existing == id => return Ok(content.to_owned()),
        NoteIdentityStatus::Present(_) => return Err(IdentityMutationError::ExistingIdentity),
        NoteIdentityStatus::Invalid
        | NoteIdentityStatus::Duplicate
        | NoteIdentityStatus::MalformedFrontMatter => {
            return Err(IdentityMutationError::UnsafeFrontMatter)
        }
        NoteIdentityStatus::Missing => {}
    }

    match front_matter_bounds(content) {
        Ok(Some(bounds)) => {
            let mut updated = String::with_capacity(content.len() + id.len() + 5);
            updated.push_str(&content[..bounds.opening_end]);
            updated.push_str("id: ");
            updated.push_str(id);
            updated.push_str(bounds.newline);
            updated.push_str(&content[bounds.opening_end..]);
            Ok(updated)
        }
        Ok(None) => Ok(add_new_front_matter(content, id)),
        Err(()) => Err(IdentityMutationError::UnsafeFrontMatter),
    }
}

pub fn assign_new_note_identity(content: &str, id: &str) -> Result<String, IdentityMutationError> {
    let parsed = Ulid::from_string(id).map_err(|_| IdentityMutationError::InvalidIdentity)?;
    if parsed.to_string() != id {
        return Err(IdentityMutationError::InvalidIdentity);
    }

    match inspect_note_identity(content) {
        NoteIdentityStatus::Missing => add_note_identity(content, id),
        NoteIdentityStatus::Present(existing) => {
            let bounds = front_matter_bounds(content)
                .map_err(|_| IdentityMutationError::UnsafeFrontMatter)?
                .ok_or(IdentityMutationError::UnsafeFrontMatter)?;
            let yaml = &content[bounds.body_start..bounds.body_end];
            let value_range = find_top_level_id_value(yaml, &existing)
                .ok_or(IdentityMutationError::UnsafeFrontMatter)?;
            let value_start = bounds.body_start + value_range.start;
            let value_end = bounds.body_start + value_range.end;
            let mut updated = String::with_capacity(content.len());
            updated.push_str(&content[..value_start]);
            updated.push_str(id);
            updated.push_str(&content[value_end..]);
            Ok(updated)
        }
        NoteIdentityStatus::Invalid
        | NoteIdentityStatus::Duplicate
        | NoteIdentityStatus::MalformedFrontMatter => Err(IdentityMutationError::UnsafeFrontMatter),
    }
}

fn add_new_front_matter(content: &str, id: &str) -> String {
    let (bom, body) = content
        .strip_prefix(UTF8_BOM)
        .map_or(("", content), |body| (UTF8_BOM, body));
    let newline = preferred_newline(body);
    let separator = if body.is_empty() { "" } else { newline };

    format!("{bom}---{newline}id: {id}{newline}---{newline}{separator}{body}")
}

fn preferred_newline(content: &str) -> &'static str {
    let Some(position) = content.find('\n') else {
        return "\n";
    };
    if position > 0 && content.as_bytes()[position - 1] == b'\r' {
        "\r\n"
    } else {
        "\n"
    }
}

fn front_matter_bounds(content: &str) -> Result<Option<FrontMatterBounds>, ()> {
    let bom_length = usize::from(content.starts_with(UTF8_BOM)) * UTF8_BOM.len();
    let body = &content[bom_length..];
    let (newline, opening_length) = if body.starts_with("---\r\n") {
        ("\r\n", 5)
    } else if body.starts_with("---\n") {
        ("\n", 4)
    } else if body.starts_with("---") {
        return Err(());
    } else {
        return Ok(None);
    };

    let opening_end = bom_length + opening_length;
    let mut line_start = opening_end;
    while line_start <= content.len() {
        let remaining = &content[line_start..];
        let line_length = remaining
            .find('\n')
            .map_or(remaining.len(), |index| index + 1);
        let line_end = line_start + line_length;
        let line = content[line_start..line_end]
            .strip_suffix('\n')
            .unwrap_or(&content[line_start..line_end])
            .strip_suffix('\r')
            .unwrap_or_else(|| {
                content[line_start..line_end]
                    .strip_suffix('\n')
                    .unwrap_or(&content[line_start..line_end])
            });

        if line == "---" || line == "..." {
            return Ok(Some(FrontMatterBounds {
                body_start: opening_end,
                body_end: line_start,
                opening_end,
                newline,
            }));
        }
        if line_end == content.len() {
            break;
        }
        line_start = line_end;
    }

    Err(())
}

fn count_top_level_id_keys(yaml: &str) -> usize {
    yaml.lines()
        .filter(|line| {
            if line.starts_with(char::is_whitespace) || line.trim_start().starts_with('#') {
                return false;
            }
            let Some((key, _)) = line.split_once(':') else {
                return false;
            };
            matches!(key.trim(), "id" | "'id'" | "\"id\"")
        })
        .count()
}

fn find_top_level_id_value(yaml: &str, id: &str) -> Option<std::ops::Range<usize>> {
    let mut offset = 0;
    for line in yaml.split_inclusive('\n') {
        let line_without_ending = line.trim_end_matches(['\r', '\n']);
        if !line_without_ending.starts_with(char::is_whitespace) {
            if let Some((key, value)) = line_without_ending.split_once(':') {
                if matches!(key.trim(), "id" | "'id'" | "\"id\"") {
                    let value_offset = line_without_ending.len() - value.len();
                    let id_offset = value.find(id)?;
                    let start = offset + value_offset + id_offset;
                    return Some(start..start + id.len());
                }
            }
        }
        offset += line.len();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{
        add_note_identity, assign_new_note_identity, generate_note_id, inspect_note_identity,
        IdentityMutationError, NoteIdentityStatus,
    };

    const ID: &str = "01JZQ7K8P4A6F2M9V3C5T7X1BY";

    #[test]
    fn generates_canonical_unprefixed_ulids() {
        let id = generate_note_id();

        assert_eq!(id.len(), 26);
        assert!(!id.starts_with("note_"));
        assert!(id.parse::<ulid::Ulid>().is_ok());
    }

    #[test]
    fn adds_front_matter_without_changing_existing_markdown() {
        let original = "# Title\n\nUnicode: Zürich and قرآن\n";

        let updated = add_note_identity(original, ID).expect("add note identity");

        assert_eq!(updated, format!("---\nid: {ID}\n---\n\n{original}"));
        assert_eq!(
            inspect_note_identity(&updated),
            NoteIdentityStatus::Present(ID.to_owned())
        );
    }

    #[test]
    fn inserts_only_the_id_line_into_existing_front_matter() {
        let original = "---\n# keep this comment\ntitle: A note\ntags:\n  - one\n---\n# Body\n";

        let updated = add_note_identity(original, ID).expect("add note identity");

        assert_eq!(
            updated,
            format!(
                "---\nid: {ID}\n# keep this comment\ntitle: A note\ntags:\n  - one\n---\n# Body\n"
            )
        );
    }

    #[test]
    fn preserves_a_bom_and_crlf_line_endings() {
        let original = "\u{feff}---\r\ntitle: A note\r\n---\r\nBody\r\n";

        let updated = add_note_identity(original, ID).expect("add note identity");

        assert_eq!(
            updated,
            format!("\u{feff}---\r\nid: {ID}\r\ntitle: A note\r\n---\r\nBody\r\n")
        );
    }

    #[test]
    fn keeps_an_existing_canonical_identity_unchanged() {
        let original = format!("---\nid: {ID}\naliases: [Example]\n---\nBody\n");

        assert_eq!(
            inspect_note_identity(&original),
            NoteIdentityStatus::Present(ID.to_owned())
        );
        assert_eq!(
            add_note_identity(&original, ID).expect("retain identity"),
            original
        );
    }

    #[test]
    fn refuses_invalid_duplicate_and_malformed_identity_data() {
        let invalid = "---\nid: short\n---\nBody\n";
        let duplicate = format!("---\nid: {ID}\nid: 01JZQ91T3AA6F2M9V3C5T7X1BZ\n---\n");
        let malformed = "---\ntags: [one\n---\nBody\n";

        assert_eq!(inspect_note_identity(invalid), NoteIdentityStatus::Invalid);
        assert_eq!(
            inspect_note_identity(&duplicate),
            NoteIdentityStatus::Duplicate
        );
        assert_eq!(
            inspect_note_identity(malformed),
            NoteIdentityStatus::MalformedFrontMatter
        );
        assert_eq!(
            add_note_identity(malformed, ID),
            Err(IdentityMutationError::UnsafeFrontMatter)
        );
    }

    #[test]
    fn refuses_to_replace_a_different_existing_identity() {
        let original = "---\nid: 01JZQ91T3AA6F2M9V3C5T7X1BZ\n---\n";

        assert_eq!(
            add_note_identity(original, ID),
            Err(IdentityMutationError::ExistingIdentity)
        );
    }

    #[test]
    fn refuses_noncanonical_lowercase_ulids() {
        assert_eq!(
            add_note_identity("# Note\n", &ID.to_lowercase()),
            Err(IdentityMutationError::InvalidIdentity)
        );
    }

    #[test]
    fn gives_a_saved_copy_a_fresh_identity_without_reformatting_yaml() {
        let replacement = "01JZQA02MVA6F2M9V3C5T7X1BW";
        let original = format!(
            "---\n# retained\nid: '{ID}' # permanent identity\naliases: [Example]\n---\nBody\n"
        );

        let updated =
            assign_new_note_identity(&original, replacement).expect("replace copied identity");

        assert_eq!(
            updated,
            format!(
                "---\n# retained\nid: '{replacement}' # permanent identity\naliases: [Example]\n---\nBody\n"
            )
        );
        assert_eq!(
            inspect_note_identity(&updated),
            NoteIdentityStatus::Present(replacement.to_owned())
        );
    }
}
