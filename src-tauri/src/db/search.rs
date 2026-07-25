//! Vault search over the index.
//!
//! Two passes, because neither alone does the job:
//!
//! 1. **FTS5** ranks documents by relevance, and scales — it does not read
//!    every note to answer a query. But it matches whole tokens, so `chore`
//!    cannot find `anchored`, and a multi-word query matches documents holding
//!    the words anywhere rather than a phrase.
//! 2. **Substring scan** reproduces exactly what the file-scanning search did:
//!    a case-insensitive match anywhere in a line, mid-word included.
//!
//! The scan runs whenever the ranked pass produced no usable line, so a query
//! FTS5 cannot express still finds what the user meant. Both passes read note
//! text from the database, so neither is bounded by a total-bytes read cap the
//! way the filesystem search was.

use rusqlite::{params, Connection};

use super::map_error;
use crate::vault::{VaultError, VaultSearchMatch, VaultSearchResult};

const MAX_SEARCH_RESULTS: usize = 100;
const MAX_SEARCH_QUERY_CHARS: usize = 200;
/// How many ranked documents to pull before extracting lines. Generous enough
/// that the result cap is reached from ranked candidates in practice.
const MAX_RANKED_CANDIDATES: usize = 400;

pub(crate) fn search(
    connection: &Connection,
    query: &str,
) -> Result<VaultSearchResult, VaultError> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(empty_result());
    }
    if query.chars().count() > MAX_SEARCH_QUERY_CHARS {
        return Err(VaultError::invalid_file(format!(
            "Search text must be {MAX_SEARCH_QUERY_CHARS} characters or fewer."
        )));
    }

    let ranked = ranked_candidates(connection, query)?;
    let outcome = extract_matches(connection, query, &ranked)?;
    if !outcome.matches.is_empty() {
        return Ok(outcome);
    }

    // Nothing survived line extraction: either FTS5 matched no document, or it
    // matched documents whose text does not contain the query as written (a
    // multi-word query that is not a phrase). Fall back to a full scan.
    extract_matches(connection, query, &[])
}

fn empty_result() -> VaultSearchResult {
    VaultSearchResult {
        matches: Vec::new(),
        searched_files: 0,
        skipped_files: 0,
        truncated: false,
    }
}

/// Rewrites a user's query into an FTS5 expression.
///
/// Every token is quoted so that FTS5 operators the user did not intend —
/// `AND`, `OR`, `NOT`, `NEAR`, `-`, `*`, `:`, `^`, parentheses — are treated as
/// text. A trailing `*` makes each token a prefix match, so `ancho` still finds
/// `anchored`. Tokens are implicitly ANDed.
fn fts_expression(query: &str) -> Option<String> {
    let tokens: Vec<String> = query
        .split(|character: char| !character.is_alphanumeric() && character != '_')
        .filter(|token| !token.is_empty())
        .map(|token| format!("\"{token}\"*"))
        .collect();

    if tokens.is_empty() {
        None
    } else {
        Some(tokens.join(" "))
    }
}

fn ranked_candidates(connection: &Connection, query: &str) -> Result<Vec<i64>, VaultError> {
    let Some(expression) = fts_expression(query) else {
        return Ok(Vec::new());
    };

    let mut statement = connection
        .prepare(
            "SELECT rowid FROM documents_fts
             WHERE documents_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2",
        )
        .map_err(map_error("The vault search could not be prepared"))?;

    // A malformed expression is a query the user typed, not a fault: fall
    // through to the substring scan rather than surfacing a syntax error.
    let Ok(rows) = statement.query_map(params![expression, MAX_RANKED_CANDIDATES as i64], |row| {
        row.get::<_, i64>(0)
    }) else {
        return Ok(Vec::new());
    };

    Ok(rows.filter_map(Result::ok).collect())
}

/// Pulls matching lines out of note text.
///
/// `candidates` empty means scan every document. Text is reassembled from the
/// front matter and body columns so line numbers count from the top of the
/// file, matching what the editor shows and what the previous
/// file-scanning search reported.
fn extract_matches(
    connection: &Connection,
    query: &str,
    candidates: &[i64],
) -> Result<VaultSearchResult, VaultError> {
    let needle = query.to_lowercase();
    let mut result = empty_result();

    let documents: Vec<(String, String, i64)> = if candidates.is_empty() {
        let mut statement = connection
            .prepare(
                "SELECT relative_path, frontmatter_text || body, size_bytes
                 FROM documents
                 WHERE is_markdown = 1 AND deleted_at IS NULL
                 ORDER BY relative_path",
            )
            .map_err(map_error("The vault search could not be prepared"))?;
        let rows = statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .map_err(map_error("The vault could not be searched"))?;
        rows.collect::<Result<_, _>>()
            .map_err(map_error("The vault could not be searched"))?
    } else {
        let mut statement = connection
            .prepare(
                "SELECT relative_path, frontmatter_text || body, size_bytes
                 FROM documents
                 WHERE id = ?1 AND is_markdown = 1 AND deleted_at IS NULL",
            )
            .map_err(map_error("The vault search could not be prepared"))?;
        let mut ordered = Vec::with_capacity(candidates.len());
        for id in candidates {
            // Ranked order is preserved by querying one candidate at a time;
            // an `IN` clause would come back in rowid order instead.
            let row = statement
                .query_row(params![id], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })
                .ok();
            if let Some(row) = row {
                ordered.push(row);
            }
        }
        ordered
    };

    for (relative_path, content, size_bytes) in documents {
        // An oversized note is recorded with a hash but never read, so there
        // is no text here to search.
        if content.is_empty() && size_bytes > 0 {
            result.skipped_files += 1;
            continue;
        }
        result.searched_files += 1;

        for (line_index, line) in content.lines().enumerate() {
            let Some(match_byte_index) = line.to_lowercase().find(&needle) else {
                continue;
            };
            let match_character_index = line.to_lowercase()[..match_byte_index].chars().count();
            result.matches.push(VaultSearchMatch {
                line: line_index + 1,
                relative_path: relative_path.clone(),
                snippet: snippet(line, match_character_index),
            });
            if result.matches.len() == MAX_SEARCH_RESULTS {
                result.truncated = true;
                return Ok(result);
            }
        }
    }

    Ok(result)
}

/// A window around the match, matching the previous search's shape so the
/// interface renders results identically.
fn snippet(line: &str, match_character_index: usize) -> String {
    const MAX_SNIPPET_CHARS: usize = 180;
    const CONTEXT_BEFORE_CHARS: usize = 60;

    let characters = line.trim_end().chars().collect::<Vec<_>>();
    let start = match_character_index
        .saturating_sub(CONTEXT_BEFORE_CHARS)
        .min(characters.len());
    let end = (start + MAX_SNIPPET_CHARS).min(characters.len());
    let mut snippet = characters[start..end].iter().collect::<String>();
    if start > 0 {
        snippet.insert(0, '…');
    }
    if end < characters.len() {
        snippet.push('…');
    }
    snippet
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use tempfile::TempDir;

    use super::{fts_expression, search};
    use crate::db::{documents::upsert, import::import_note, open};

    fn vault(notes: &[(&str, &str)]) -> (TempDir, Connection) {
        let directory = TempDir::new().expect("create fixture directory");
        let connection = open(&directory.path().join("vault.db")).expect("create database");
        for (path, content) in notes {
            upsert(&connection, &import_note(path, content.as_bytes())).expect("index note");
        }
        (directory, connection)
    }

    fn paths(result: &crate::vault::VaultSearchResult) -> Vec<String> {
        result
            .matches
            .iter()
            .map(|found| found.relative_path.clone())
            .collect()
    }

    #[test]
    fn quotes_every_token_so_operators_are_treated_as_text() {
        assert_eq!(
            fts_expression("calm leadership"),
            Some(r#""calm"* "leadership"*"#.to_owned())
        );
        assert_eq!(
            fts_expression("harbor AND NOT x"),
            Some(r#""harbor"* "AND"* "NOT"* "x"*"#.to_owned())
        );
        assert_eq!(
            fts_expression(r#"a "quoted" -term"#),
            Some(r#""a"* "quoted"* "term"*"#.to_owned())
        );
        assert_eq!(fts_expression("!!!"), None);
    }

    #[test]
    fn finds_a_whole_word_through_the_ranked_pass() {
        let (_directory, connection) = vault(&[
            ("Notes/Harbor.md", "# Harbor\nA calm harbour at dusk\n"),
            ("Notes/Other.md", "# Other\nNothing relevant\n"),
        ]);

        let found = search(&connection, "calm").expect("search");

        assert_eq!(paths(&found), vec!["Notes/Harbor.md"]);
        assert_eq!(found.matches[0].line, 2);
        assert_eq!(found.matches[0].snippet, "A calm harbour at dusk");
    }

    #[test]
    fn finds_a_word_by_prefix() {
        let (_directory, connection) = vault(&[("Notes/Harbor.md", "# Harbor\nAnchored deeply\n")]);

        let found = search(&connection, "ancho").expect("search");

        assert_eq!(paths(&found), vec!["Notes/Harbor.md"]);
    }

    /// The case the ranked pass cannot express: FTS5 indexes tokens, so a
    /// match in the middle of a word is unreachable without the scan.
    #[test]
    fn falls_back_to_a_substring_scan_for_a_mid_word_match() {
        let (_directory, connection) = vault(&[("Notes/Harbor.md", "# Harbor\nAnchored deeply\n")]);

        let found = search(&connection, "chore").expect("search");

        assert_eq!(paths(&found), vec!["Notes/Harbor.md"]);
        assert_eq!(found.matches[0].line, 2);
    }

    /// FTS5 would match both words anywhere in the document; the user asked
    /// for them adjacent. The scan settles it rather than returning a document
    /// with no matching line.
    #[test]
    fn falls_back_when_ranked_documents_hold_no_matching_line() {
        let (_directory, connection) = vault(&[(
            "Notes/Harbor.md",
            "# Harbor\ncalm morning\nquiet leadership\n",
        )]);

        let found = search(&connection, "calm leadership").expect("search");

        assert!(found.matches.is_empty(), "no line holds that phrase");
    }

    #[test]
    fn searches_front_matter_as_well_as_the_body() {
        let (_directory, connection) = vault(&[(
            "Notes/Harbor.md",
            "---\nstatus: seaworthy\n---\n# Harbor\nBody\n",
        )]);

        let found = search(&connection, "seaworthy").expect("search");

        assert_eq!(paths(&found), vec!["Notes/Harbor.md"]);
        assert_eq!(
            found.matches[0].line, 2,
            "line numbers count the whole file"
        );
    }

    #[test]
    fn matches_without_regard_to_case() {
        let (_directory, connection) = vault(&[("Notes/Harbor.md", "# HARBOR\n")]);

        assert_eq!(
            paths(&search(&connection, "harbor").expect("search")).len(),
            1
        );
        assert_eq!(
            paths(&search(&connection, "HaRbOr").expect("search")).len(),
            1
        );
    }

    #[test]
    fn returns_nothing_for_an_empty_or_punctuation_only_query() {
        let (_directory, connection) = vault(&[("Notes/Harbor.md", "# Harbor\n")]);

        assert!(search(&connection, "   ")
            .expect("search")
            .matches
            .is_empty());
        assert!(search(&connection, "!!!")
            .expect("search")
            .matches
            .is_empty());
    }

    #[test]
    fn refuses_an_overlong_query_rather_than_scanning() {
        let (_directory, connection) = vault(&[("Notes/Harbor.md", "# Harbor\n")]);

        let error = search(&connection, &"x".repeat(201)).expect_err("refuse");

        assert_eq!(error.code, "invalidVaultFile");
    }

    #[test]
    fn caps_results_and_reports_truncation() {
        let body: String = (0..150)
            .map(|index| format!("harbor line {index}\n"))
            .collect();
        let (_directory, connection) = vault(&[("Notes/Harbor.md", &body)]);

        let found = search(&connection, "harbor").expect("search");

        assert_eq!(found.matches.len(), 100);
        assert!(found.truncated);
    }

    #[test]
    fn builds_an_elided_snippet_around_a_late_match() {
        let line = format!("{}NEEDLE trailing text", "a".repeat(200));
        let (_directory, connection) = vault(&[("Notes/Long.md", &line)]);

        let found = search(&connection, "needle").expect("search");

        let snippet = &found.matches[0].snippet;
        assert!(snippet.starts_with('…'), "an early cut is marked");
        assert!(snippet.contains("NEEDLE"));
        assert!(snippet.chars().count() <= 182);
    }

    #[test]
    fn ignores_a_note_that_was_too_large_to_read() {
        let (_directory, connection) = vault(&[("Notes/Harbor.md", "# Harbor\n")]);
        connection
            .execute(
                "UPDATE documents SET frontmatter_text = '', body = '', size_bytes = 20000000",
                [],
            )
            .expect("simulate an oversized note");

        let found = search(&connection, "harbor").expect("search");

        assert!(found.matches.is_empty());
        assert_eq!(found.skipped_files, 1);
        assert_eq!(found.searched_files, 0);
    }
}
