use std::path::Path;

use crate::metadata::{inspect_wikilink_occurrences, rewrite_wikilink_targets};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkNote {
    pub aliases: Vec<String>,
    pub identity: Option<String>,
    pub relative_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkSource {
    pub content: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedLinkRewrite {
    pub content: String,
    pub relative_path: String,
    pub replacement_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MatchKind {
    Path,
    Filename,
    Alias,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ResolvedLink {
    index: usize,
    kind: MatchKind,
}

pub fn plan_rename_link_rewrites(
    notes: &[LinkNote],
    sources: &[LinkSource],
    target_identity: &str,
    new_relative_path: &str,
) -> Vec<PlannedLinkRewrite> {
    let Some(target_index) = notes
        .iter()
        .position(|note| note.identity.as_deref() == Some(target_identity))
    else {
        return Vec::new();
    };
    plan_rename_link_rewrites_for_target(notes, sources, target_index, new_relative_path)
}

pub fn plan_rename_link_rewrites_by_path(
    notes: &[LinkNote],
    sources: &[LinkSource],
    target_path: &str,
    new_relative_path: &str,
) -> Vec<PlannedLinkRewrite> {
    let Some(target_index) = notes
        .iter()
        .position(|note| note.relative_path == target_path)
    else {
        return Vec::new();
    };
    plan_rename_link_rewrites_for_target(notes, sources, target_index, new_relative_path)
}

fn plan_rename_link_rewrites_for_target(
    notes: &[LinkNote],
    sources: &[LinkSource],
    target_index: usize,
    new_relative_path: &str,
) -> Vec<PlannedLinkRewrite> {
    let new_stem = markdown_stem(new_relative_path);
    let new_filename_is_ambiguous = notes.iter().enumerate().any(|(index, note)| {
        index != target_index
            && normalized(&markdown_stem(&note.relative_path)) == normalized(&new_stem)
    });

    sources
        .iter()
        .filter_map(|source| {
            let current_index = notes
                .iter()
                .position(|note| note.relative_path == source.relative_path)?;
            let mut replacements = Vec::new();
            for occurrence in inspect_wikilink_occurrences(&source.content) {
                let Some(resolved) = resolve_link(&occurrence.target, notes, current_index) else {
                    continue;
                };
                if resolved.index != target_index || occurrence.target.starts_with('#') {
                    continue;
                }
                let replacement = rename_target(
                    &occurrence.target,
                    occurrence.has_display_label,
                    resolved.kind,
                    new_relative_path,
                    &new_stem,
                    new_filename_is_ambiguous,
                );
                if replacement != occurrence.target {
                    replacements.push((occurrence.target_range, replacement));
                }
            }
            if replacements.is_empty() {
                return None;
            }
            Some(PlannedLinkRewrite {
                content: rewrite_wikilink_targets(&source.content, &replacements)?,
                relative_path: source.relative_path.clone(),
                replacement_count: replacements.len(),
            })
        })
        .collect()
}

fn resolve_link(
    raw_target: &str,
    notes: &[LinkNote],
    current_index: usize,
) -> Option<ResolvedLink> {
    let target = raw_target.trim();
    if target.starts_with('#') {
        return Some(ResolvedLink {
            index: current_index,
            kind: MatchKind::Filename,
        });
    }
    let note_target = target.split('#').next()?.trim();
    if note_target.is_empty() {
        return None;
    }
    let normalized_target = normalized(&without_markdown_extension(note_target));
    let normalized_path = normalized_target
        .strip_prefix("./")
        .unwrap_or(&normalized_target);

    let path_matches = notes
        .iter()
        .enumerate()
        .filter(|(_, note)| {
            normalized(&without_markdown_extension(&note.relative_path)) == normalized_path
        })
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    if !path_matches.is_empty() {
        return unique_resolution(path_matches, MatchKind::Path);
    }

    let filename_matches = notes
        .iter()
        .enumerate()
        .filter(|(_, note)| normalized(&markdown_stem(&note.relative_path)) == normalized_target)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    if !filename_matches.is_empty() {
        return unique_resolution(filename_matches, MatchKind::Filename);
    }

    let alias_matches = notes
        .iter()
        .enumerate()
        .filter(|(_, note)| {
            note.aliases
                .iter()
                .any(|alias| normalized(alias) == normalized_target)
        })
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    unique_resolution(alias_matches, MatchKind::Alias)
}

fn unique_resolution(matches: Vec<usize>, kind: MatchKind) -> Option<ResolvedLink> {
    if matches.len() != 1 {
        return None;
    }
    Some(ResolvedLink {
        index: matches[0],
        kind,
    })
}

fn rename_target(
    original_target: &str,
    has_display_label: bool,
    kind: MatchKind,
    new_relative_path: &str,
    new_stem: &str,
    new_filename_is_ambiguous: bool,
) -> String {
    let (original_base, fragment) = original_target
        .split_once('#')
        .map_or((original_target, ""), |(base, _)| {
            (base, &original_target[base.len()..])
        });
    let included_extension = original_base.to_lowercase().ends_with(".md");
    let use_path = kind == MatchKind::Path || new_filename_is_ambiguous;
    let mut new_base = if use_path {
        without_markdown_extension(new_relative_path)
    } else {
        new_stem.to_owned()
    };
    if included_extension {
        new_base.push_str(".md");
    }
    let mut replacement = format!("{new_base}{fragment}");
    if kind == MatchKind::Alias && !has_display_label {
        let visible_alias = original_base.trim();
        replacement.push('|');
        replacement.push_str(visible_alias);
    }
    replacement
}

fn normalized(value: &str) -> String {
    value.trim().to_lowercase()
}

fn without_markdown_extension(value: &str) -> String {
    value
        .get(..value.len().saturating_sub(3))
        .filter(|_| {
            value
                .get(value.len().saturating_sub(3)..)
                .is_some_and(|extension| extension.eq_ignore_ascii_case(".md"))
        })
        .unwrap_or(value)
        .to_owned()
}

fn markdown_stem(relative_path: &str) -> String {
    let filename = Path::new(relative_path)
        .file_name()
        .and_then(|filename| filename.to_str())
        .unwrap_or(relative_path);
    without_markdown_extension(filename)
}

#[cfg(test)]
mod tests {
    use super::{
        plan_rename_link_rewrites, plan_rename_link_rewrites_by_path, LinkNote, LinkSource,
    };

    const TARGET_ID: &str = "01JZQ7K8P4A6F2M9V3C5T7X1BY";

    fn note(path: &str, identity: Option<&str>, aliases: &[&str]) -> LinkNote {
        LinkNote {
            aliases: aliases.iter().map(|alias| (*alias).to_owned()).collect(),
            identity: identity.map(str::to_owned),
            relative_path: path.to_owned(),
        }
    }

    #[test]
    fn plans_body_and_property_updates_without_changing_labels_or_headings() {
        let notes = vec![
            note("Notes/Old Name.md", Some(TARGET_ID), &["Legacy"]),
            note("Sources.md", Some("01JZQ91T3AA6F2M9V3C5T7X1BZ"), &[]),
            note("Archive/New Name.md", None, &[]),
        ];
        let source = LinkSource {
            content: concat!(
                "---\nrelated: \"[[Legacy]]\"\n---\n",
                "[[Old Name]] [[Notes/Old Name.md#Part|Shown]] [[Missing]]\n",
            )
            .to_owned(),
            relative_path: "Sources.md".to_owned(),
        };

        let rewrites = plan_rename_link_rewrites(&notes, &[source], TARGET_ID, "Notes/New Name.md");

        assert_eq!(rewrites.len(), 1);
        assert_eq!(rewrites[0].replacement_count, 3);
        assert_eq!(
            rewrites[0].content,
            concat!(
                "---\nrelated: \"[[Notes/New Name|Legacy]]\"\n---\n",
                "[[Notes/New Name]] [[Notes/New Name.md#Part|Shown]] [[Missing]]\n",
            )
        );
    }

    #[test]
    fn leaves_ambiguous_filename_links_unchanged() {
        let notes = vec![
            note("Notes/Old Name.md", Some(TARGET_ID), &[]),
            note("Archive/Old Name.md", None, &[]),
            note("Sources.md", None, &[]),
        ];
        let source = LinkSource {
            content: "[[Old Name]] [[Notes/Old Name]]\n".to_owned(),
            relative_path: "Sources.md".to_owned(),
        };

        let rewrites = plan_rename_link_rewrites(&notes, &[source], TARGET_ID, "Notes/New Name.md");

        assert_eq!(rewrites[0].replacement_count, 1);
        assert_eq!(rewrites[0].content, "[[Old Name]] [[Notes/New Name]]\n");
    }

    #[test]
    fn preserves_unicode_headings_and_extension_style_across_a_move() {
        let notes = vec![
            note("Notes/Über.md", Some(TARGET_ID), &[]),
            note("Sources.md", None, &[]),
        ];
        let source = LinkSource {
            content: "[[notes/über.md#Résumé|Shown]] [[ÜBER#Résumé]]\r\n".to_owned(),
            relative_path: "Sources.md".to_owned(),
        };

        let rewrites =
            plan_rename_link_rewrites(&notes, &[source], TARGET_ID, "Archive/Überblick.md");

        assert_eq!(rewrites[0].replacement_count, 2);
        assert_eq!(
            rewrites[0].content,
            "[[Archive/Überblick.md#Résumé|Shown]] [[Überblick#Résumé]]\r\n"
        );
    }

    #[test]
    fn rewrites_links_by_path_when_the_target_has_no_identity() {
        let notes = vec![
            note("Notes/Old Name.md", None, &["Legacy"]),
            note("Sources.md", None, &[]),
        ];
        let source = LinkSource {
            content: "[[Old Name]] [[Legacy]] [[Notes/Old Name.md]]\n".to_owned(),
            relative_path: "Sources.md".to_owned(),
        };

        let rewrites = plan_rename_link_rewrites_by_path(
            &notes,
            &[source],
            "Notes/Old Name.md",
            "Archive/New Name.md",
        );

        assert_eq!(rewrites[0].replacement_count, 3);
        assert_eq!(
            rewrites[0].content,
            "[[New Name]] [[New Name|Legacy]] [[Archive/New Name.md]]\n"
        );
    }
}
