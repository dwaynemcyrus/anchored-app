use std::{fmt, ops::Range};

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LifecycleMutationError {
    InvalidStatus,
    InvalidTimestamp,
    UnsafeFrontMatter,
}

impl fmt::Display for LifecycleMutationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::InvalidStatus => "the requested note status is not supported",
            Self::InvalidTimestamp => "the lifecycle timestamp is not canonical RFC 3339",
            Self::UnsafeFrontMatter => "the note front matter cannot be changed safely",
        };
        formatter.write_str(message)
    }
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WikilinkOccurrence {
    pub has_display_label: bool,
    pub target: String,
    pub target_range: Range<usize>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct NoteProperties {
    pub archived_at: Option<String>,
    pub created_at: Option<String>,
    pub note_type: Option<String>,
    pub status: Option<String>,
    pub updated_at: Option<String>,
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

pub fn inspect_note_aliases(content: &str) -> Vec<String> {
    let bounds = match front_matter_bounds(content) {
        Ok(Some(bounds)) => bounds,
        Ok(None) | Err(()) => return Vec::new(),
    };
    let yaml = &content[bounds.body_start..bounds.body_end];
    if count_top_level_keys(yaml, "aliases") != 1 {
        return Vec::new();
    }
    let Ok(documents) = YamlLoader::load_from_str(yaml) else {
        return Vec::new();
    };
    let Some(Yaml::Hash(mapping)) = documents.first() else {
        return Vec::new();
    };
    let Some(value) = mapping.get(&Yaml::String("aliases".to_owned())) else {
        return Vec::new();
    };

    let aliases = match value {
        Yaml::String(alias) => vec![alias.clone()],
        Yaml::Array(values) if values.iter().all(|value| matches!(value, Yaml::String(_))) => {
            values
                .iter()
                .filter_map(|value| match value {
                    Yaml::String(alias) => Some(alias.clone()),
                    _ => None,
                })
                .collect()
        }
        _ => return Vec::new(),
    };

    let mut unique = Vec::new();
    for alias in aliases {
        if !alias.is_empty() && !unique.contains(&alias) {
            unique.push(alias);
        }
    }
    unique
}

pub fn inspect_note_properties(content: &str) -> NoteProperties {
    let bounds = match front_matter_bounds(content) {
        Ok(Some(bounds)) => bounds,
        Ok(None) | Err(()) => return NoteProperties::default(),
    };
    let yaml = &content[bounds.body_start..bounds.body_end];
    let Ok(documents) = YamlLoader::load_from_str(yaml) else {
        return NoteProperties::default();
    };
    let Some(Yaml::Hash(mapping)) = documents.first() else {
        return NoteProperties::default();
    };

    NoteProperties {
        archived_at: unique_string_property(mapping, yaml, "archived_at", false),
        created_at: unique_string_property(mapping, yaml, "created_at", false),
        note_type: unique_string_property(mapping, yaml, "type", false),
        status: unique_string_property(mapping, yaml, "status", true),
        updated_at: unique_string_property(mapping, yaml, "updated_at", false),
    }
}

pub fn split_note_source(content: &str) -> Option<(&str, &str)> {
    let bounds = match front_matter_bounds(content) {
        Ok(Some(bounds)) => bounds,
        Ok(None) => return Some(("", content)),
        Err(()) => return None,
    };
    let closing = &content[bounds.body_end..];
    let body_start = closing
        .find('\n')
        .map_or(content.len(), |line_end| bounds.body_end + line_end + 1);
    Some((&content[..body_start], &content[body_start..]))
}

pub fn stamp_note_created_at(
    content: &str,
    timestamp: &str,
) -> Result<String, LifecycleMutationError> {
    validate_lifecycle_timestamp(timestamp)?;
    mutate_lifecycle_properties(content, &[("created_at", Some(timestamp))])
}

pub fn stamp_note_updated_at(
    content: &str,
    timestamp: &str,
) -> Result<String, LifecycleMutationError> {
    validate_lifecycle_timestamp(timestamp)?;
    mutate_lifecycle_properties(content, &[("updated_at", Some(timestamp))])
}

pub fn backfill_local_lifecycle_timestamps(
    content: &str,
) -> Result<Option<String>, LifecycleMutationError> {
    let properties = inspect_note_properties(content);
    let mut changes = Vec::new();
    for (key, value) in [
        ("created_at", properties.created_at),
        ("updated_at", properties.updated_at),
        ("archived_at", properties.archived_at),
    ] {
        let Some(value) = value else { continue };
        let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(&value) else {
            continue;
        };
        if value != parsed.format("%Y-%m-%dT%H:%M:%SZ").to_string() {
            continue;
        }
        changes.push((
            key,
            parsed
                .with_timezone(&chrono::Local)
                .format("%Y-%m-%dT%H:%M:%S%:z")
                .to_string(),
        ));
    }
    if changes.is_empty() {
        return Ok(None);
    }
    let changes = changes
        .iter()
        .map(|(key, value)| (*key, Some(value.as_str())))
        .collect::<Vec<_>>();
    mutate_lifecycle_properties(content, &changes).map(Some)
}

pub fn archive_note(content: &str, timestamp: &str) -> Result<String, LifecycleMutationError> {
    validate_lifecycle_timestamp(timestamp)?;
    mutate_lifecycle_properties(
        content,
        &[
            ("status", Some("archived")),
            ("archived_at", Some(timestamp)),
        ],
    )
}

pub fn archive_note_with_type(
    content: &str,
    timestamp: &str,
    note_type: Option<&str>,
) -> Result<String, LifecycleMutationError> {
    validate_lifecycle_timestamp(timestamp)?;
    mutate_lifecycle_properties(
        content,
        &[
            ("status", Some("archived")),
            ("archived_at", Some(timestamp)),
            ("type", note_type),
        ],
    )
}

pub fn restore_note(
    content: &str,
    destination_status: &str,
) -> Result<String, LifecycleMutationError> {
    if !matches!(destination_status, "inbox" | "active") {
        return Err(LifecycleMutationError::InvalidStatus);
    }
    mutate_lifecycle_properties(
        content,
        &[("status", Some(destination_status)), ("archived_at", None)],
    )
}

pub fn restore_note_with_type(
    content: &str,
    destination_status: &str,
    note_type: Option<&str>,
) -> Result<String, LifecycleMutationError> {
    if !matches!(destination_status, "inbox" | "active") {
        return Err(LifecycleMutationError::InvalidStatus);
    }
    mutate_lifecycle_properties(
        content,
        &[
            ("status", Some(destination_status)),
            ("archived_at", None),
            ("type", note_type),
        ],
    )
}

fn validate_lifecycle_timestamp(timestamp: &str) -> Result<(), LifecycleMutationError> {
    let parsed = chrono::DateTime::parse_from_rfc3339(timestamp)
        .map_err(|_| LifecycleMutationError::InvalidTimestamp)?;
    let is_canonical = timestamp == parsed.format("%Y-%m-%dT%H:%M:%SZ").to_string()
        || timestamp == parsed.format("%Y-%m-%dT%H:%M:%S%:z").to_string();
    if !is_canonical {
        return Err(LifecycleMutationError::InvalidTimestamp);
    }
    Ok(())
}

fn mutate_lifecycle_properties(
    content: &str,
    changes: &[(&str, Option<&str>)],
) -> Result<String, LifecycleMutationError> {
    let bounds = match front_matter_bounds(content) {
        Ok(Some(bounds)) => bounds,
        Ok(None) => return Ok(add_new_lifecycle_front_matter(content, changes)),
        Err(()) => return Err(LifecycleMutationError::UnsafeFrontMatter),
    };
    let yaml = &content[bounds.body_start..bounds.body_end];
    let documents =
        YamlLoader::load_from_str(yaml).map_err(|_| LifecycleMutationError::UnsafeFrontMatter)?;
    if documents
        .first()
        .is_some_and(|document| !matches!(document, Yaml::Hash(_) | Yaml::Null))
    {
        return Err(LifecycleMutationError::UnsafeFrontMatter);
    }

    let mut edits: Vec<(Range<usize>, String)> = Vec::new();
    let mut missing_lines = String::new();
    for (key, value) in changes {
        if count_top_level_keys(yaml, key) > 1 {
            return Err(LifecycleMutationError::UnsafeFrontMatter);
        }
        let existing = find_top_level_property_line(yaml, key);
        match (existing, value) {
            (Some(line), Some(value)) => {
                let replacement = quoted_property_value(value, line.quote);
                edits.push((
                    (bounds.body_start + line.value.start)..(bounds.body_start + line.value.end),
                    replacement,
                ));
            }
            (Some(line), None) => edits.push((
                (bounds.body_start + line.full.start)..(bounds.body_start + line.full.end),
                String::new(),
            )),
            (None, Some(value)) => {
                missing_lines.push_str(key);
                missing_lines.push_str(": ");
                missing_lines.push_str(value);
                missing_lines.push_str(bounds.newline);
            }
            (None, None) => {}
        }
    }
    if !missing_lines.is_empty() {
        edits.push((bounds.opening_end..bounds.opening_end, missing_lines));
    }
    edits.sort_by_key(|edit| std::cmp::Reverse(edit.0.start));
    let mut updated = content.to_owned();
    for (range, replacement) in edits {
        updated.replace_range(range, &replacement);
    }
    Ok(updated)
}

#[derive(Debug)]
struct PropertyLine {
    full: Range<usize>,
    quote: Option<char>,
    value: Range<usize>,
}

fn find_top_level_property_line(yaml: &str, expected: &str) -> Option<PropertyLine> {
    let mut offset = 0;
    for line in yaml.split_inclusive('\n') {
        let line_without_ending = line.trim_end_matches(['\r', '\n']);
        if !line_without_ending.starts_with(char::is_whitespace) {
            if let Some((key, raw_value)) = line_without_ending.split_once(':') {
                if matches_property_key(key.trim(), expected) {
                    let raw_start = line_without_ending.len() - raw_value.len();
                    let leading = raw_value.len() - raw_value.trim_start().len();
                    let value_start = raw_start + leading;
                    let value_text = &line_without_ending[value_start..];
                    let value_end = value_start + property_value_length(value_text);
                    let trimmed = line_without_ending[value_start..value_end].trim_end();
                    let value_end = value_start + trimmed.len();
                    let quote = trimmed.chars().next().filter(|quote| {
                        (*quote == '\'' || *quote == '"') && trimmed.ends_with(*quote)
                    });
                    return Some(PropertyLine {
                        full: offset..offset + line.len(),
                        quote,
                        value: offset + value_start..offset + value_end,
                    });
                }
            }
        }
        offset += line.len();
    }
    None
}

fn matches_property_key(key: &str, expected: &str) -> bool {
    key == expected || key == format!("'{expected}'") || key == format!("\"{expected}\"")
}

fn property_value_length(value: &str) -> usize {
    let mut quote: Option<char> = None;
    let mut escaped = false;
    for (index, character) in value.char_indices() {
        match quote {
            Some('"') if escaped => escaped = false,
            Some('"') if character == '\\' => escaped = true,
            Some(active) if character == active => quote = None,
            None if character == '\'' || character == '"' => quote = Some(character),
            None if character == '#' => return index,
            _ => {}
        }
    }
    value.len()
}

fn quoted_property_value(value: &str, quote: Option<char>) -> String {
    match quote {
        Some('\'') => format!("'{}'", value.replace('\'', "''")),
        Some('"') => format!("\"{}\"", value.replace('"', "\\\"")),
        _ => value.to_owned(),
    }
}

fn add_new_lifecycle_front_matter(content: &str, changes: &[(&str, Option<&str>)]) -> String {
    let (bom, body) = content
        .strip_prefix(UTF8_BOM)
        .map_or(("", content), |body| (UTF8_BOM, body));
    let newline = preferred_newline(body);
    let separator = newline;
    let properties = changes
        .iter()
        .filter_map(|(key, value)| value.map(|value| format!("{key}: {value}{newline}")))
        .collect::<String>();

    format!("{bom}---{newline}{properties}---{newline}{separator}{body}")
}

fn unique_string_property(
    mapping: &yaml_rust2::yaml::Hash,
    yaml: &str,
    key: &str,
    lowercase: bool,
) -> Option<String> {
    if count_top_level_keys(yaml, key) != 1 {
        return None;
    }
    let Yaml::String(value) = mapping.get(&Yaml::String(key.to_owned()))? else {
        return None;
    };
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    Some(if lowercase {
        value.to_lowercase()
    } else {
        value.to_owned()
    })
}

pub fn inspect_wikilinks(content: &str) -> Vec<String> {
    let mut links = Vec::new();
    for occurrence in inspect_wikilink_occurrences(content) {
        if !links.contains(&occurrence.target) {
            links.push(occurrence.target);
        }
    }
    links
}

pub fn inspect_wikilink_occurrences(content: &str) -> Vec<WikilinkOccurrence> {
    let mut occurrences = Vec::new();
    let body_start = match front_matter_bounds(content) {
        Ok(Some(bounds)) => {
            let yaml = &content[bounds.body_start..bounds.body_end];
            let Ok(documents) = YamlLoader::load_from_str(yaml) else {
                return Vec::new();
            };
            if documents
                .first()
                .is_some_and(|document| !matches!(document, Yaml::Hash(_)))
            {
                return Vec::new();
            }
            inspect_quoted_property_wikilinks(yaml, bounds.body_start, &mut occurrences);
            let closing = &content[bounds.body_end..];
            closing
                .find('\n')
                .map_or(content.len(), |line_end| bounds.body_end + line_end + 1)
        }
        Ok(None) => 0,
        Err(()) => return Vec::new(),
    };
    let mut fence: Option<(u8, usize)> = None;
    let mut line_offset = body_start;

    for line_with_ending in content[body_start..].split_inclusive('\n') {
        let line = line_with_ending.trim_end_matches(['\r', '\n']);
        if line.starts_with("    ") || line.starts_with('\t') {
            line_offset += line_with_ending.len();
            continue;
        }
        if let Some(marker) = fence_marker(line) {
            if fence.is_some_and(|open| open.0 == marker.0 && marker.1 >= open.1) {
                fence = None;
            } else if fence.is_none() {
                fence = Some(marker);
            }
            line_offset += line_with_ending.len();
            continue;
        }
        if fence.is_none() {
            inspect_inline_wikilink_occurrences(line, line_offset, &mut occurrences);
        }
        line_offset += line_with_ending.len();
    }
    occurrences
}

pub fn rewrite_wikilink_targets(
    content: &str,
    replacements: &[(Range<usize>, String)],
) -> Option<String> {
    let mut ordered = replacements.iter().collect::<Vec<_>>();
    ordered.sort_by_key(|(range, _)| range.start);
    let mut rewritten = String::with_capacity(content.len());
    let mut cursor = 0;
    for (range, replacement) in ordered {
        if range.start < cursor || range.start > range.end || range.end > content.len() {
            return None;
        }
        rewritten.push_str(content.get(cursor..range.start)?);
        rewritten.push_str(replacement);
        cursor = range.end;
    }
    rewritten.push_str(content.get(cursor..)?);
    Some(rewritten)
}

fn inspect_quoted_property_wikilinks(
    yaml: &str,
    yaml_offset: usize,
    occurrences: &mut Vec<WikilinkOccurrence>,
) {
    let bytes = yaml.as_bytes();
    let mut index = 0;
    let mut quote: Option<u8> = None;
    while index < bytes.len() {
        let byte = bytes[index];
        let Some(active_quote) = quote else {
            if byte == b'#' {
                index = bytes[index..]
                    .iter()
                    .position(|byte| *byte == b'\n')
                    .map_or(bytes.len(), |line_end| index + line_end + 1);
                continue;
            }
            if byte == b'\'' || byte == b'"' {
                quote = Some(byte);
            }
            index += 1;
            continue;
        };
        if active_quote == b'"' && byte == b'\\' {
            index = (index + 2).min(bytes.len());
            continue;
        }
        if active_quote == b'\'' && byte == b'\'' && bytes.get(index + 1) == Some(&b'\'') {
            index += 2;
            continue;
        }
        if byte == active_quote {
            quote = None;
            index += 1;
            continue;
        }
        if bytes[index..].starts_with(b"[[") {
            let target_start = index + 2;
            let mut target_end = target_start;
            while target_end + 1 < bytes.len()
                && !bytes[target_end..].starts_with(b"]]")
                && bytes[target_end] != active_quote
            {
                target_end += 1;
            }
            if target_end + 1 < bytes.len() && bytes[target_end..].starts_with(b"]]") {
                push_wikilink_occurrence(yaml, yaml_offset, target_start, target_end, occurrences);
                index = target_end + 2;
                continue;
            }
        }
        index += 1;
    }
}

fn fence_marker(line: &str) -> Option<(u8, usize)> {
    let indentation = line.bytes().take_while(|byte| *byte == b' ').count();
    if indentation > 3 {
        return None;
    }
    let remaining = &line.as_bytes()[indentation..];
    let marker = *remaining.first()?;
    if marker != b'`' {
        return None;
    }
    let length = remaining.iter().take_while(|byte| **byte == marker).count();
    (length >= 3).then_some((marker, length))
}

fn inspect_inline_wikilink_occurrences(
    line: &str,
    line_offset: usize,
    occurrences: &mut Vec<WikilinkOccurrence>,
) {
    let bytes = line.as_bytes();
    let mut index = 0;
    let mut inline_code_delimiter = 0;

    while index < bytes.len() {
        if bytes[index] == b'`' && !is_escaped(bytes, index) {
            let length = bytes[index..]
                .iter()
                .take_while(|byte| **byte == b'`')
                .count();
            if inline_code_delimiter == 0 {
                inline_code_delimiter = length;
            } else if inline_code_delimiter == length {
                inline_code_delimiter = 0;
            }
            index += length;
            continue;
        }
        if inline_code_delimiter == 0
            && bytes[index..].starts_with(b"[[")
            && !is_escaped(bytes, index)
        {
            let target_start = index + 2;
            let mut target_end = target_start;
            while target_end + 1 < bytes.len() && !bytes[target_end..].starts_with(b"]]") {
                target_end += 1;
            }
            if target_end + 1 < bytes.len() {
                push_wikilink_occurrence(line, line_offset, target_start, target_end, occurrences);
                index = target_end + 2;
                continue;
            }
        }
        index += 1;
    }
}

fn push_wikilink_occurrence(
    source: &str,
    source_offset: usize,
    value_start: usize,
    value_end: usize,
    occurrences: &mut Vec<WikilinkOccurrence>,
) {
    let value = &source[value_start..value_end];
    let target_value = value.split('|').next().unwrap_or_default();
    let leading_whitespace = target_value.len() - target_value.trim_start().len();
    let target = target_value.trim();
    if !target.is_empty() {
        let target_start = source_offset + value_start + leading_whitespace;
        occurrences.push(WikilinkOccurrence {
            has_display_label: value.contains('|'),
            target: target.to_owned(),
            target_range: target_start..target_start + target.len(),
        });
    }
}

fn is_escaped(bytes: &[u8], index: usize) -> bool {
    let backslashes = bytes[..index]
        .iter()
        .rev()
        .take_while(|byte| **byte == b'\\')
        .count();
    backslashes % 2 == 1
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

fn count_top_level_keys(yaml: &str, expected: &str) -> usize {
    yaml.lines()
        .filter(|line| {
            if line.starts_with(char::is_whitespace) || line.trim_start().starts_with('#') {
                return false;
            }
            let Some((key, _)) = line.split_once(':') else {
                return false;
            };
            let key = key.trim();
            key == expected || key == format!("'{expected}'") || key == format!("\"{expected}\"")
        })
        .count()
}

fn count_top_level_id_keys(yaml: &str) -> usize {
    count_top_level_keys(yaml, "id")
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
        add_note_identity, archive_note, assign_new_note_identity,
        backfill_local_lifecycle_timestamps, generate_note_id, inspect_note_aliases,
        inspect_note_identity, inspect_note_properties, inspect_wikilink_occurrences,
        inspect_wikilinks, restore_note, rewrite_wikilink_targets, split_note_source,
        stamp_note_created_at, stamp_note_updated_at, IdentityMutationError,
        LifecycleMutationError, NoteIdentityStatus,
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
    fn reads_obsidian_alias_lists_without_rewriting_yaml() {
        let content = "---\naliases: [Leading Well, 'Zürich Notes', Leading Well]\n---\nBody\n";

        assert_eq!(
            inspect_note_aliases(content),
            vec!["Leading Well".to_owned(), "Zürich Notes".to_owned()]
        );
        assert_eq!(
            inspect_note_aliases("---\naliases: One alias\n---\n"),
            vec!["One alias".to_owned()]
        );
    }

    #[test]
    fn reads_lifecycle_properties_without_treating_blank_values_as_metadata() {
        let properties = inspect_note_properties(
            "---\nstatus: ACTIVE\ntype: Project\ncreated_at: 2026-11-28T15:48:32Z\narchived_at: ''\n---\n",
        );

        assert_eq!(properties.status.as_deref(), Some("active"));
        assert_eq!(properties.note_type.as_deref(), Some("Project"));
        assert_eq!(
            properties.created_at.as_deref(),
            Some("2026-11-28T15:48:32Z")
        );
        assert_eq!(properties.archived_at, None);
        assert_eq!(
            inspect_note_properties("---\nstatus: one\nstatus: two\n---\n").status,
            None
        );
    }

    #[test]
    fn stamps_creation_time_without_changing_the_markdown_body() {
        let original = "\u{feff}# Zürich\r\n\r\nBody\r\n";
        let updated =
            stamp_note_created_at(original, "2026-11-28T15:48:32Z").expect("stamp creation time");

        assert_eq!(
            updated,
            concat!(
                "\u{feff}---\r\n",
                "created_at: 2026-11-28T15:48:32Z\r\n",
                "---\r\n\r\n",
                "# Zürich\r\n\r\nBody\r\n",
            )
        );
        assert_eq!(
            archive_note("---\n---\nBody\n", "2026-11-28T15:48:32Z")
                .expect("archive with empty front matter"),
            concat!(
                "---\n",
                "status: archived\n",
                "archived_at: 2026-11-28T15:48:32Z\n",
                "---\n",
                "Body\n",
            )
        );
    }

    #[test]
    fn stamps_authored_updates_without_reformatting_front_matter() {
        let original = "---\ntitle: Note # keep\nupdated_at: '2026-01-01T00:00:00Z'\n---\nBody\n";
        let updated =
            stamp_note_updated_at(original, "2026-11-28T15:48:32Z").expect("stamp authored update");

        assert_eq!(
            updated,
            "---\ntitle: Note # keep\nupdated_at: '2026-11-28T15:48:32Z'\n---\nBody\n"
        );
        assert_eq!(
            inspect_note_properties(&updated).updated_at.as_deref(),
            Some("2026-11-28T15:48:32Z")
        );
    }

    #[test]
    fn preserves_front_matter_order_quotes_and_comments_during_lifecycle_changes() {
        let original = concat!(
            "---\n",
            "title: 'Quoted title'\n",
            "status: \"active\" # workflow\n",
            "created_at: '2025-01-02T03:04:05Z'\n",
            "# keep this comment\n",
            "---\n",
            "Body\n",
        );
        let created =
            stamp_note_created_at(original, "2026-11-28T15:48:32Z").expect("replace creation time");
        let archived = archive_note(&created, "2026-11-29T16:49:33Z").expect("archive note");

        assert_eq!(
            archived,
            concat!(
                "---\n",
                "archived_at: 2026-11-29T16:49:33Z\n",
                "title: 'Quoted title'\n",
                "status: \"archived\" # workflow\n",
                "created_at: '2026-11-28T15:48:32Z'\n",
                "# keep this comment\n",
                "---\n",
                "Body\n",
            )
        );

        let restored = restore_note(&archived, "inbox").expect("restore note");
        assert_eq!(
            restored,
            concat!(
                "---\n",
                "title: 'Quoted title'\n",
                "status: \"inbox\" # workflow\n",
                "created_at: '2026-11-28T15:48:32Z'\n",
                "# keep this comment\n",
                "---\n",
                "Body\n",
            )
        );
    }

    #[test]
    fn splits_note_front_matter_without_rewriting_source() {
        let source = "\u{feff}---\r\ntype: scratchpad\r\nstatus: inbox\r\n---\r\nBody\r\n";

        let (prefix, body) = split_note_source(source).expect("split safe front matter");

        assert_eq!(
            prefix,
            "\u{feff}---\r\ntype: scratchpad\r\nstatus: inbox\r\n---\r\n"
        );
        assert_eq!(body, "Body\r\n");
        assert_eq!(format!("{prefix}{body}"), source);
        assert_eq!(split_note_source("Body\n"), Some(("", "Body\n")));
        assert_eq!(split_note_source("---\ntype: [broken\n"), None);
    }

    #[test]
    fn refuses_ambiguous_lifecycle_metadata_and_invalid_values() {
        let duplicate = "---\nstatus: active\nstatus: draft\n---\n";
        let malformed = "---\ntags: [one\n---\n";

        assert_eq!(
            archive_note(duplicate, "2026-11-28T15:48:32Z"),
            Err(LifecycleMutationError::UnsafeFrontMatter)
        );
        assert_eq!(
            stamp_note_created_at(malformed, "2026-11-28T15:48:32Z"),
            Err(LifecycleMutationError::UnsafeFrontMatter)
        );
        assert_eq!(
            stamp_note_created_at("Body", "2026-11-28T15:48:32"),
            Err(LifecycleMutationError::InvalidTimestamp)
        );
        assert_eq!(
            stamp_note_created_at("Body", "2026-11-28T15:48:32.123+01:00"),
            Err(LifecycleMutationError::InvalidTimestamp)
        );
        assert_eq!(
            restore_note("Body", "draft"),
            Err(LifecycleMutationError::InvalidStatus)
        );
    }

    #[test]
    fn accepts_local_offset_lifecycle_timestamps() {
        let timestamp = "2026-11-28T15:48:32+01:00";

        let updated = stamp_note_created_at("Body", timestamp).expect("stamp local time");

        assert!(updated.contains("created_at: 2026-11-28T15:48:32+01:00"));
    }

    #[test]
    fn backfills_utc_lifecycle_timestamps_without_changing_their_instant() {
        let original = concat!(
            "---\n",
            "title: Note # keep\n",
            "created_at: '2026-01-02T03:04:05Z'\n",
            "updated_at: 2026-01-02T04:05:06Z # keep\n",
            "---\n",
            "Body\n",
        );

        let updated = backfill_local_lifecycle_timestamps(original)
            .expect("backfill timestamps")
            .expect("timestamps should change");

        for (before, after) in [
            ("2026-01-02T03:04:05Z", "created_at"),
            ("2026-01-02T04:05:06Z", "updated_at"),
        ] {
            let before = chrono::DateTime::parse_from_rfc3339(before).expect("parse UTC");
            let line = updated
                .lines()
                .find(|line| line.starts_with(&format!("{after}:")))
                .expect("find backfilled property");
            let value = line
                .split_once(':')
                .expect("property separator")
                .1
                .trim()
                .split(" #")
                .next()
                .expect("property value")
                .trim_matches('\'');
            let after = chrono::DateTime::parse_from_rfc3339(value).expect("parse local time");
            assert_eq!(before, after);
        }
        assert!(updated.contains("title: Note # keep"));
        assert!(updated.contains(" # keep"));
    }

    #[test]
    fn ignores_ambiguous_or_invalid_alias_properties() {
        assert!(inspect_note_aliases("---\naliases: [one\n---\n").is_empty());
        assert!(inspect_note_aliases("---\naliases: one\naliases: two\n---\n").is_empty());
        assert!(inspect_note_aliases("---\naliases: [valid, 2]\n---\n").is_empty());
    }

    #[test]
    fn indexes_unique_wikilinks_from_properties_and_markdown_body() {
        let content = concat!(
            "---\nrelated: '[[Front matter|Shown]]'\n",
            "references:\n  - \"[[List note]]\"\n  - plain text\n",
            "mixed: [2, '[[Inline list]]']\n---\n",
            "See [[Notes/Leadership#Habits|Leading habits]] and ![[Zürich]].\n",
            "Again [[Zürich]].\n",
        );

        assert_eq!(
            inspect_wikilinks(content),
            vec![
                "Front matter",
                "List note",
                "Inline list",
                "Notes/Leadership#Habits",
                "Zürich"
            ]
        );
    }

    #[test]
    fn rewrites_only_exact_wikilink_target_ranges() {
        let content = concat!(
            "---\r\nrelated: \"[[Old Name#Heading|Shown]]\"\r\n---\r\n",
            "Body [[ Old Name |Label]] and [[Other]].\r\n",
        );
        let occurrences = inspect_wikilink_occurrences(content);

        assert_eq!(
            occurrences
                .iter()
                .map(|occurrence| (
                    occurrence.target.as_str(),
                    &content[occurrence.target_range.clone()]
                ))
                .collect::<Vec<_>>(),
            vec![
                ("Old Name#Heading", "Old Name#Heading"),
                ("Old Name", "Old Name"),
                ("Other", "Other")
            ]
        );
        let replacements = occurrences[..2]
            .iter()
            .map(|occurrence| {
                let suffix = occurrence
                    .target
                    .find('#')
                    .map_or("", |index| &occurrence.target[index..]);
                (occurrence.target_range.clone(), format!("New Name{suffix}"))
            })
            .collect::<Vec<_>>();

        assert_eq!(
            rewrite_wikilink_targets(content, &replacements).as_deref(),
            Some(concat!(
                "---\r\nrelated: \"[[New Name#Heading|Shown]]\"\r\n---\r\n",
                "Body [[ New Name |Label]] and [[Other]].\r\n",
            ))
        );
    }

    #[test]
    fn ignores_wikilink_text_in_code_or_escaped_markdown() {
        let content = concat!(
            "\\[[Escaped]] and `[[Inline code]]`\n",
            "```md\n[[Fenced code]]\n```\n",
            "~~~md\n[[Tilde text]]\n~~~\n",
            "    [[Indented code]]\n",
            "[[Real note]]\n",
        );

        assert_eq!(inspect_wikilinks(content), vec!["Tilde text", "Real note"]);
        assert!(inspect_wikilinks("---\ntags: [broken\n---\n[[Unsafe]]").is_empty());
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
