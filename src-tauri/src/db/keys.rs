//! Lookup keys for matching paths, filenames, and aliases.
//!
//! APFS is case-insensitive but case-preserving, and a filename created
//! through Finder comes back decomposed (NFD) while the same name typed in
//! Anchored is composed (NFC). Matching on the observed string would let one
//! file on disk resolve to two different rows, which then mint two identities
//! for the same note. Every comparison therefore goes through a key: composed,
//! lowercased, and `/`-separated.
//!
//! Keys are for matching only. The observed spelling is stored alongside them
//! and is what the interface displays.

use unicode_normalization::UnicodeNormalization;

/// Key for a vault-relative path. Separators are normalized so a key never
/// depends on how the path was assembled.
pub(crate) fn path_key(relative_path: &str) -> String {
    fold(&relative_path.replace('\\', "/"))
}

/// Key for a note name. The `.md` extension is dropped because wikilinks
/// address notes without it.
pub(crate) fn name_key(name: &str) -> String {
    let base = name
        .strip_suffix(".md")
        .or_else(|| name.strip_suffix(".MD"))
        .unwrap_or_else(|| match name.rfind('.') {
            Some(index) if name[index..].eq_ignore_ascii_case(".md") => &name[..index],
            _ => name,
        });
    fold(base)
}

/// Key for an alias.
pub(crate) fn alias_key(alias: &str) -> String {
    fold(alias.trim())
}

/// Key for a wikilink target. A heading or block anchor addresses a place
/// inside a note, not a different note, so it is dropped before matching —
/// mirroring `resolveWikilink` in the interface, which splits on `#` too.
pub(crate) fn link_target_key(target: &str) -> String {
    fold(target.split('#').next().unwrap_or(target).trim())
}

fn fold(value: &str) -> String {
    value.nfc().collect::<String>().to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::{alias_key, name_key, path_key};

    #[test]
    fn matches_decomposed_and_composed_spellings() {
        // "Zürich" written with a combining diaeresis, as Finder returns it,
        // against the precomposed form Anchored writes.
        let decomposed = "Notes/Zu\u{0308}rich.md";
        let composed = "Notes/Z\u{00fc}rich.md";
        assert_ne!(decomposed, composed);

        assert_eq!(path_key(decomposed), path_key(composed));
    }

    #[test]
    fn matches_case_only_differences() {
        assert_eq!(path_key("Notes/Harbor.md"), path_key("notes/harbor.MD"));
        assert_eq!(name_key("Harbor.md"), name_key("HARBOR"));
        assert_eq!(alias_key(" Safe Harbor "), alias_key("safe harbor"));
    }

    #[test]
    fn drops_only_a_markdown_extension_from_a_name() {
        assert_eq!(name_key("Harbor.md"), "harbor");
        assert_eq!(name_key("Harbor.MD"), "harbor");
        assert_eq!(name_key("Notes.2026.md"), "notes.2026");
        assert_eq!(name_key("diagram.png"), "diagram.png");
        assert_eq!(name_key("Harbor"), "harbor");
    }

    #[test]
    fn resolves_a_link_past_its_heading_or_block_anchor() {
        use super::link_target_key;

        assert_eq!(link_target_key("Markdown Guide#Frontmatter"), "markdown guide");
        assert_eq!(link_target_key("Notes/Harbor#^block-id"), "notes/harbor");
        assert_eq!(link_target_key("  Harbor  "), "harbor");
        assert_eq!(link_target_key("Harbor"), "harbor");
    }

    #[test]
    fn keeps_distinct_notes_distinct() {
        assert_ne!(path_key("Notes/Harbor.md"), path_key("Archive/Harbor.md"));
        assert_ne!(name_key("Harbor.md"), name_key("Harbour.md"));
    }
}
