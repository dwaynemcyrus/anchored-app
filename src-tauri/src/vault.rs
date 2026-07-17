use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    fs::OpenOptions,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, RwLock,
    },
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::links::{plan_rename_link_rewrites, LinkNote, LinkSource};
use crate::metadata::{
    add_note_identity, assign_new_note_identity, generate_note_id, inspect_note_aliases,
    inspect_note_identity, inspect_wikilinks, NoteIdentityStatus,
};

const MAX_VAULT_ENTRIES: usize = 50_000;
const MAX_VAULT_DEPTH: usize = 64;
const MAX_MARKDOWN_FILE_BYTES: u64 = 10 * 1024 * 1024;
const MAX_SEARCH_QUERY_CHARS: usize = 200;
const MAX_SEARCH_RESULTS: usize = 100;
const MAX_SEARCH_TOTAL_BYTES: u64 = 64 * 1024 * 1024;
const RENAME_JOURNAL_NAME: &str = ".anchored-rename-journal.json";
static TEMPORARY_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Default)]
pub struct VaultState {
    migration_preview: RwLock<Option<IdentityMigrationPlan>>,
    rename_transaction: Mutex<()>,
    root: RwLock<Option<PathBuf>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFile {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub aliases: Vec<String>,
    pub outgoing_links: Vec<String>,
    pub name: String,
    pub parent: String,
    pub relative_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultWarnings {
    pub added_identities: usize,
    pub identity_conflicts: usize,
    pub needs_identity: usize,
    pub skipped_non_utf8_paths: usize,
    pub skipped_symlinks: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSnapshot {
    pub files: Vec<VaultFile>,
    pub name: String,
    pub warnings: VaultWarnings,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
struct FileSignature {
    size_bytes: u64,
    modified_millis: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BaselineEntry {
    pending_identity: bool,
    signature: FileSignature,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct IdentityBaseline {
    files: BTreeMap<String, BaselineEntry>,
    vault_root: String,
    version: u32,
}

#[derive(Debug, Default)]
struct IdentitySummary {
    added: usize,
    conflicts: usize,
    needs_identity: usize,
}

#[derive(Debug, Clone)]
struct IdentityMigrationPlan {
    entries: Vec<IdentityMigrationPlanEntry>,
    root: PathBuf,
}

#[derive(Debug, Clone)]
struct IdentityMigrationPlanEntry {
    relative_path: String,
    signature: FileSignature,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityMigrationIssue {
    reason: &'static str,
    relative_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityMigrationPreview {
    eligible_files: Vec<String>,
    issues: Vec<IdentityMigrationIssue>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityMigrationResult {
    migrated: usize,
    skipped: usize,
    snapshot: VaultSnapshot,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultDocument {
    pub content: String,
    pub relative_path: String,
    pub size_bytes: u64,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSearchMatch {
    pub line: usize,
    pub relative_path: String,
    pub snippet: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSearchResult {
    pub matches: Vec<VaultSearchMatch>,
    pub searched_files: usize,
    pub skipped_files: usize,
    pub truncated: bool,
}

#[derive(Debug)]
struct RenameTransactionEntry {
    backup_path: PathBuf,
    destination_path: PathBuf,
    original_content: String,
    original_path: PathBuf,
    temporary_path: PathBuf,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum RenameJournalPhase {
    Prepared,
    BackedUp,
    Installed,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RenameJournalEntry {
    backup_path: String,
    destination_path: String,
    original_path: String,
    temporary_path: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RenameJournal {
    entries: Vec<RenameJournalEntry>,
    phase: RenameJournalPhase,
    version: u32,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameOutcome {
    pub relative_path: String,
    pub updated_files: usize,
    pub updated_links: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultError {
    code: &'static str,
    message: String,
}

impl VaultError {
    fn io(context: &str, error: std::io::Error) -> Self {
        Self {
            code: "vaultIoError",
            message: format!("{context}: {error}"),
        }
    }

    fn invalid(message: impl Into<String>) -> Self {
        Self {
            code: "invalidVault",
            message: message.into(),
        }
    }

    fn state(message: impl Into<String>) -> Self {
        Self {
            code: "vaultStateError",
            message: message.into(),
        }
    }

    fn too_large() -> Self {
        Self {
            code: "vaultTooLarge",
            message: format!(
                "The selected vault exceeds the safe scan limit of {MAX_VAULT_ENTRIES} entries."
            ),
        }
    }

    fn invalid_file(message: impl Into<String>) -> Self {
        Self {
            code: "invalidVaultFile",
            message: message.into(),
        }
    }

    fn file_too_large() -> Self {
        Self {
            code: "vaultFileTooLarge",
            message: format!(
                "This Markdown file exceeds the safe read limit of {} MiB.",
                MAX_MARKDOWN_FILE_BYTES / 1024 / 1024
            ),
        }
    }

    fn invalid_encoding() -> Self {
        Self {
            code: "invalidMarkdownEncoding",
            message: "This Markdown file is not valid UTF-8.".to_owned(),
        }
    }

    fn conflict() -> Self {
        Self {
            code: "vaultConflict",
            message: "This Markdown file changed outside Anchored. Your local edits were kept and were not saved over the external version.".to_owned(),
        }
    }

    fn file_exists() -> Self {
        Self {
            code: "vaultFileExists",
            message: "A Markdown file already exists at that location. Choose a different name."
                .to_owned(),
        }
    }

    fn identity_conflict(message: impl Into<String>) -> Self {
        Self {
            code: "identityConflict",
            message: message.into(),
        }
    }

    fn rename_conflict(message: impl Into<String>) -> Self {
        Self {
            code: "vaultRenameConflict",
            message: message.into(),
        }
    }
}

#[tauri::command]
pub async fn select_vault(
    app: AppHandle,
    state: State<'_, VaultState>,
) -> Result<Option<VaultSnapshot>, VaultError> {
    let selected = app
        .dialog()
        .file()
        .set_title("Open an Obsidian vault")
        .blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let selected_path = selected
        .into_path()
        .map_err(|error| VaultError::invalid(format!("Unsupported vault path: {error}")))?;
    let root = canonical_vault_root(&selected_path)?;
    recover_rename_transaction(&root)?;
    let mut snapshot = scan_vault(&root)?;
    let baseline_path = identity_baseline_path(&app, &root)?;
    let summary = reconcile_vault_identities(&root, &snapshot.files, &baseline_path)?;
    snapshot.warnings.added_identities = summary.added;
    snapshot.warnings.identity_conflicts = summary.conflicts;
    snapshot.warnings.needs_identity = summary.needs_identity;
    enrich_vault_metadata(&root, &mut snapshot.files)?;

    let mut stored_root = state
        .root
        .write()
        .map_err(|_| VaultError::state("The selected vault state could not be updated."))?;
    *stored_root = Some(root);

    Ok(Some(snapshot))
}

#[tauri::command]
pub async fn rescan_vault(
    app: AppHandle,
    state: State<'_, VaultState>,
) -> Result<Option<VaultSnapshot>, VaultError> {
    let root = state
        .root
        .read()
        .map_err(|_| VaultError::state("The selected vault state could not be read."))?
        .clone();

    let Some(root) = root else {
        return Ok(None);
    };
    recover_rename_transaction(&root)?;
    let mut snapshot = scan_vault(&root)?;
    let baseline_path = identity_baseline_path(&app, &root)?;
    let summary = reconcile_vault_identities(&root, &snapshot.files, &baseline_path)?;
    snapshot.warnings.added_identities = summary.added;
    snapshot.warnings.identity_conflicts = summary.conflicts;
    snapshot.warnings.needs_identity = summary.needs_identity;
    enrich_vault_metadata(&root, &mut snapshot.files)?;
    Ok(Some(snapshot))
}

#[tauri::command]
pub async fn read_vault_file(
    state: State<'_, VaultState>,
    relative_path: String,
) -> Result<VaultDocument, VaultError> {
    let root = state
        .root
        .read()
        .map_err(|_| VaultError::state("The selected vault state could not be read."))?
        .clone()
        .ok_or_else(|| VaultError::state("Select a vault before opening a Markdown file."))?;

    read_markdown_file(&root, &relative_path)
}

#[tauri::command]
pub async fn search_vault(
    state: State<'_, VaultState>,
    query: String,
) -> Result<VaultSearchResult, VaultError> {
    let root = state
        .root
        .read()
        .map_err(|_| VaultError::state("The selected vault state could not be read."))?
        .clone()
        .ok_or_else(|| VaultError::state("Select a vault before searching Markdown files."))?;

    tauri::async_runtime::spawn_blocking(move || search_markdown_files(&root, &query))
        .await
        .map_err(|error| VaultError::state(format!("Vault search could not finish: {error}")))?
}

#[tauri::command]
pub async fn save_vault_file(
    state: State<'_, VaultState>,
    relative_path: String,
    content: String,
    expected_content: String,
) -> Result<VaultDocument, VaultError> {
    let root = state
        .root
        .read()
        .map_err(|_| VaultError::state("The selected vault state could not be read."))?
        .clone()
        .ok_or_else(|| VaultError::state("Select a vault before saving a Markdown file."))?;

    save_markdown_file(&root, &relative_path, &content, &expected_content)
}

#[tauri::command]
pub async fn create_vault_file(
    app: AppHandle,
    state: State<'_, VaultState>,
    suggested_name: String,
    content: String,
) -> Result<Option<VaultDocument>, VaultError> {
    let root = state
        .root
        .read()
        .map_err(|_| VaultError::state("The selected vault state could not be read."))?
        .clone()
        .ok_or_else(|| VaultError::state("Select a vault before creating a Markdown file."))?;

    let suggested_name = safe_suggested_markdown_name(&suggested_name);
    let selected = app
        .dialog()
        .file()
        .set_title("Save Markdown note")
        .set_directory(&root)
        .set_file_name(suggested_name)
        .add_filter("Markdown", &["md"])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let selected_path = selected
        .into_path()
        .map_err(|error| VaultError::invalid_file(format!("Unsupported save path: {error}")))?;

    create_markdown_file(&root, &selected_path, &content).map(Some)
}

#[tauri::command]
pub async fn rename_vault_file(
    app: AppHandle,
    state: State<'_, VaultState>,
    relative_path: String,
) -> Result<Option<RenameOutcome>, VaultError> {
    let _rename_guard = state
        .rename_transaction
        .lock()
        .map_err(|_| VaultError::state("The note rename lock could not be acquired."))?;
    let root = state
        .root
        .read()
        .map_err(|_| VaultError::state("The selected vault state could not be read."))?
        .clone()
        .ok_or_else(|| VaultError::state("Select a vault before renaming a Markdown file."))?;
    recover_rename_transaction(&root)?;
    let suggested_name = Path::new(&relative_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled.md");
    let selected = app
        .dialog()
        .file()
        .set_title("Rename Markdown note")
        .set_directory(&root)
        .set_file_name(suggested_name)
        .add_filter("Markdown", &["md"])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let destination = selected
        .into_path()
        .map_err(|error| VaultError::invalid_file(format!("Unsupported rename path: {error}")))?;

    rename_markdown_file(&root, &relative_path, &destination, None).map(Some)
}

#[tauri::command]
pub async fn preview_identity_migration(
    state: State<'_, VaultState>,
) -> Result<IdentityMigrationPreview, VaultError> {
    let root = state
        .root
        .read()
        .map_err(|_| VaultError::state("The selected vault state could not be read."))?
        .clone()
        .ok_or_else(|| VaultError::state("Select a vault before reviewing note identities."))?;
    let snapshot = scan_vault(&root)?;
    let (preview, plan) = build_identity_migration_preview(&root, &snapshot.files)?;
    *state
        .migration_preview
        .write()
        .map_err(|_| VaultError::state("The identity migration preview could not be stored."))? =
        Some(plan);
    Ok(preview)
}

#[tauri::command]
pub async fn apply_identity_migration(
    app: AppHandle,
    state: State<'_, VaultState>,
) -> Result<IdentityMigrationResult, VaultError> {
    let plan = state
        .migration_preview
        .write()
        .map_err(|_| VaultError::state("The identity migration preview could not be read."))?
        .take()
        .ok_or_else(|| VaultError::state("Review the identity migration before applying it."))?;
    let current_root = state
        .root
        .read()
        .map_err(|_| VaultError::state("The selected vault state could not be read."))?
        .clone()
        .ok_or_else(|| VaultError::state("Select a vault before applying note identities."))?;
    if canonical_vault_root(&current_root)? != plan.root {
        return Err(VaultError::state(
            "The selected vault changed after the identity preview.",
        ));
    }

    let (migrated, skipped) = apply_identity_migration_plan(&plan)?;
    let mut snapshot = scan_vault(&plan.root)?;
    let baseline_path = identity_baseline_path(&app, &plan.root)?;
    let summary = reconcile_vault_identities(&plan.root, &snapshot.files, &baseline_path)?;
    snapshot.warnings.added_identities = migrated + summary.added;
    snapshot.warnings.identity_conflicts = summary.conflicts;
    snapshot.warnings.needs_identity = summary.needs_identity;
    enrich_vault_metadata(&plan.root, &mut snapshot.files)?;
    Ok(IdentityMigrationResult {
        migrated,
        skipped,
        snapshot,
    })
}

fn canonical_vault_root(path: &Path) -> Result<PathBuf, VaultError> {
    let root = fs::canonicalize(path)
        .map_err(|error| VaultError::io("The selected vault could not be opened", error))?;
    let metadata = fs::metadata(&root)
        .map_err(|error| VaultError::io("The selected vault could not be inspected", error))?;

    if !metadata.is_dir() {
        return Err(VaultError::invalid(
            "The selected vault must be a directory.",
        ));
    }

    Ok(root)
}

fn scan_vault(root: &Path) -> Result<VaultSnapshot, VaultError> {
    let root = canonical_vault_root(root)?;
    let mut files = Vec::new();
    let mut stack = vec![(root.clone(), 0_usize)];
    let mut visited_entries = 0_usize;
    let mut skipped_non_utf8_paths = 0_usize;
    let mut skipped_symlinks = 0_usize;

    while let Some((directory, depth)) = stack.pop() {
        if depth > MAX_VAULT_DEPTH {
            return Err(VaultError::invalid(format!(
                "The selected vault exceeds the safe directory depth of {MAX_VAULT_DEPTH}."
            )));
        }

        let mut entries = fs::read_dir(&directory)
            .map_err(|error| VaultError::io("A vault directory could not be read", error))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| VaultError::io("A vault entry could not be read", error))?;
        entries.sort_by_key(|entry| entry.file_name());

        for entry in entries {
            visited_entries += 1;
            if visited_entries > MAX_VAULT_ENTRIES {
                return Err(VaultError::too_large());
            }

            let file_type = entry
                .file_type()
                .map_err(|error| VaultError::io("A vault entry could not be inspected", error))?;

            if file_type.is_symlink() {
                skipped_symlinks += 1;
                continue;
            }

            if file_type.is_dir() {
                stack.push((entry.path(), depth + 1));
                continue;
            }

            if !file_type.is_file() || !is_markdown(&entry.path()) {
                continue;
            }

            let canonical_file = fs::canonicalize(entry.path())
                .map_err(|error| VaultError::io("A Markdown file could not be opened", error))?;
            if !canonical_file.starts_with(&root) {
                return Err(VaultError::invalid(
                    "A vault file resolved outside the selected directory.",
                ));
            }

            let relative = canonical_file.strip_prefix(&root).map_err(|_| {
                VaultError::invalid("A vault file could not be made relative to the vault root.")
            })?;
            let Some(relative_path) = relative.to_str() else {
                skipped_non_utf8_paths += 1;
                continue;
            };
            let name = entry.file_name().to_string_lossy().into_owned();
            let parent = relative
                .parent()
                .and_then(Path::to_str)
                .unwrap_or_default()
                .to_owned();

            files.push(VaultFile {
                id: None,
                aliases: Vec::new(),
                outgoing_links: Vec::new(),
                name,
                parent,
                relative_path: relative_path.to_owned(),
            });
        }
    }

    files.sort_by(|left, right| {
        left.relative_path
            .to_lowercase()
            .cmp(&right.relative_path.to_lowercase())
    });

    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Vault")
        .to_owned();

    Ok(VaultSnapshot {
        files,
        name,
        warnings: VaultWarnings {
            added_identities: 0,
            identity_conflicts: 0,
            needs_identity: 0,
            skipped_non_utf8_paths,
            skipped_symlinks,
        },
    })
}

fn search_markdown_files(root: &Path, query: &str) -> Result<VaultSearchResult, VaultError> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(VaultSearchResult {
            matches: Vec::new(),
            searched_files: 0,
            skipped_files: 0,
            truncated: false,
        });
    }
    if query.chars().count() > MAX_SEARCH_QUERY_CHARS {
        return Err(VaultError::invalid_file(format!(
            "Search text must be {MAX_SEARCH_QUERY_CHARS} characters or fewer."
        )));
    }

    let snapshot = scan_vault(root)?;
    let normalized_query = query.to_lowercase();
    let mut matches = Vec::new();
    let mut searched_files = 0_usize;
    let mut skipped_files = 0_usize;
    let mut searched_bytes = 0_u64;
    let mut truncated = false;

    for file in snapshot.files {
        let path = resolve_vault_markdown_file(root, &file.relative_path)?;
        let metadata = fs::metadata(&path)
            .map_err(|error| VaultError::io("A Markdown file could not be inspected", error))?;
        if metadata.len() > MAX_MARKDOWN_FILE_BYTES
            || searched_bytes.saturating_add(metadata.len()) > MAX_SEARCH_TOTAL_BYTES
        {
            skipped_files += 1;
            truncated = true;
            continue;
        }

        let bytes = fs::read(path)
            .map_err(|error| VaultError::io("A Markdown file could not be searched", error))?;
        searched_bytes = searched_bytes.saturating_add(bytes.len() as u64);
        let Ok(content) = String::from_utf8(bytes) else {
            skipped_files += 1;
            continue;
        };
        searched_files += 1;

        for (line_index, line) in content.lines().enumerate() {
            let normalized_line = line.to_lowercase();
            let Some(match_byte_index) = normalized_line.find(&normalized_query) else {
                continue;
            };
            let match_character_index = normalized_line[..match_byte_index].chars().count();
            matches.push(VaultSearchMatch {
                line: line_index + 1,
                relative_path: file.relative_path.clone(),
                snippet: search_snippet(line, match_character_index),
            });
            if matches.len() == MAX_SEARCH_RESULTS {
                truncated = true;
                return Ok(VaultSearchResult {
                    matches,
                    searched_files,
                    skipped_files,
                    truncated,
                });
            }
        }
    }

    Ok(VaultSearchResult {
        matches,
        searched_files,
        skipped_files,
        truncated,
    })
}

fn search_snippet(line: &str, match_character_index: usize) -> String {
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

fn enrich_vault_metadata(root: &Path, files: &mut [VaultFile]) -> Result<(), VaultError> {
    let mut indexed = Vec::with_capacity(files.len());
    let mut identity_counts = HashMap::<String, usize>::new();

    for file in files.iter() {
        let signature = vault_file_signature(root, &file.relative_path)?;
        if signature.size_bytes > MAX_MARKDOWN_FILE_BYTES {
            indexed.push((None, Vec::new(), Vec::new()));
            continue;
        }
        let path = resolve_vault_markdown_file(root, &file.relative_path)?;
        let bytes = fs::read(path)
            .map_err(|error| VaultError::io("Note metadata could not be read", error))?;
        let Ok(content) = String::from_utf8(bytes) else {
            indexed.push((None, Vec::new(), Vec::new()));
            continue;
        };
        let id = match inspect_note_identity(&content) {
            NoteIdentityStatus::Present(id) => {
                *identity_counts.entry(id.clone()).or_default() += 1;
                Some(id)
            }
            _ => None,
        };
        indexed.push((
            id,
            inspect_note_aliases(&content),
            inspect_wikilinks(&content),
        ));
    }

    for (file, (id, aliases, outgoing_links)) in files.iter_mut().zip(indexed) {
        file.id = id.filter(|id| identity_counts[id] == 1);
        file.aliases = aliases;
        file.outgoing_links = outgoing_links;
    }
    Ok(())
}

fn identity_baseline_path(app: &AppHandle, root: &Path) -> Result<PathBuf, VaultError> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| {
            VaultError::state(format!(
                "The identity index location is unavailable: {error}"
            ))
        })?
        .join("identity-baselines");
    fs::create_dir_all(&directory).map_err(|error| {
        VaultError::io("The identity index directory could not be created", error)
    })?;
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in root.to_string_lossy().as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    Ok(directory.join(format!("{hash:016x}.json")))
}

fn reconcile_vault_identities(
    root: &Path,
    files: &[VaultFile],
    baseline_path: &Path,
) -> Result<IdentitySummary, VaultError> {
    let root = canonical_vault_root(root)?;
    let previous = load_identity_baseline(baseline_path, &root)?;
    let is_initial_baseline = previous.is_none();
    let previous_files = previous
        .as_ref()
        .map(|baseline| &baseline.files)
        .cloned()
        .unwrap_or_default();
    let current_paths = files
        .iter()
        .map(|file| file.relative_path.as_str())
        .collect::<HashSet<_>>();
    let disappeared_signatures = previous_files
        .iter()
        .filter(|(path, _)| !current_paths.contains(path.as_str()))
        .map(|(_, entry)| entry.signature)
        .collect::<HashSet<_>>();

    let mut statuses = BTreeMap::new();
    let mut signatures = BTreeMap::new();
    let mut identity_counts = HashMap::<String, usize>::new();
    for file in files {
        let signature = vault_file_signature(&root, &file.relative_path)?;
        let status = read_identity_status(&root, &file.relative_path, signature)?;
        if let NoteIdentityStatus::Present(id) = &status {
            *identity_counts.entry(id.clone()).or_default() += 1;
        }
        signatures.insert(file.relative_path.clone(), signature);
        statuses.insert(file.relative_path.clone(), status);
    }

    let mut known_identities = identity_counts.keys().cloned().collect::<HashSet<_>>();
    let mut summary = IdentitySummary::default();
    let mut next_files = BTreeMap::new();

    for file in files {
        let path = &file.relative_path;
        let original_signature = signatures[path];
        let status = statuses.get(path).expect("status collected for every file");
        let previous_entry = previous_files.get(path);
        let likely_rename =
            previous_entry.is_none() && disappeared_signatures.contains(&original_signature);
        let genuinely_new = !is_initial_baseline && previous_entry.is_none() && !likely_rename;
        let retry_pending = previous_entry.is_some_and(|entry| entry.pending_identity);
        let should_assign =
            (genuinely_new || retry_pending) && matches!(status, NoteIdentityStatus::Missing);

        let mut pending_identity = false;
        let mut final_signature = original_signature;
        if should_assign {
            let expected = read_markdown_file(&root, path)?.content;
            if vault_file_signature(&root, path)? == original_signature {
                let id = generate_unique_note_id(&known_identities);
                let updated = add_note_identity(&expected, &id).map_err(|_| {
                    VaultError::identity_conflict(
                        "A new Markdown file could not receive an identity without changing unsafe front matter.",
                    )
                })?;
                save_markdown_file(&root, path, &updated, &expected)?;
                known_identities.insert(id);
                summary.added += 1;
                final_signature = vault_file_signature(&root, path)?;
            } else {
                pending_identity = true;
                summary.needs_identity += 1;
            }
        } else {
            match status {
                NoteIdentityStatus::Missing => summary.needs_identity += 1,
                NoteIdentityStatus::Present(id) if identity_counts[id] > 1 => {
                    summary.conflicts += 1
                }
                NoteIdentityStatus::Invalid
                | NoteIdentityStatus::Duplicate
                | NoteIdentityStatus::MalformedFrontMatter => {
                    summary.conflicts += 1;
                    if genuinely_new || retry_pending {
                        pending_identity = true;
                    }
                }
                NoteIdentityStatus::Present(_) => {}
            }
            if retry_pending && matches!(status, NoteIdentityStatus::Missing) {
                pending_identity = true;
            }
        }

        next_files.insert(
            path.clone(),
            BaselineEntry {
                pending_identity,
                signature: final_signature,
            },
        );
    }

    write_identity_baseline(
        baseline_path,
        &IdentityBaseline {
            files: next_files,
            vault_root: root.to_string_lossy().into_owned(),
            version: 1,
        },
    )?;
    Ok(summary)
}

fn build_identity_migration_preview(
    root: &Path,
    files: &[VaultFile],
) -> Result<(IdentityMigrationPreview, IdentityMigrationPlan), VaultError> {
    let root = canonical_vault_root(root)?;
    let mut inspected = Vec::with_capacity(files.len());
    let mut identity_counts = HashMap::<String, usize>::new();
    for file in files {
        let signature = vault_file_signature(&root, &file.relative_path)?;
        let status = read_identity_status(&root, &file.relative_path, signature)?;
        if let NoteIdentityStatus::Present(id) = &status {
            *identity_counts.entry(id.clone()).or_default() += 1;
        }
        inspected.push((file.relative_path.clone(), signature, status));
    }

    let mut eligible_files = Vec::new();
    let mut entries = Vec::new();
    let mut issues = Vec::new();
    for (relative_path, signature, status) in inspected {
        match status {
            NoteIdentityStatus::Missing => {
                eligible_files.push(relative_path.clone());
                entries.push(IdentityMigrationPlanEntry {
                    relative_path,
                    signature,
                });
            }
            NoteIdentityStatus::Present(id) if identity_counts[&id] > 1 => {
                issues.push(IdentityMigrationIssue {
                    reason: "duplicateIdentity",
                    relative_path,
                });
            }
            NoteIdentityStatus::Invalid => issues.push(IdentityMigrationIssue {
                reason: "invalidIdentity",
                relative_path,
            }),
            NoteIdentityStatus::Duplicate => issues.push(IdentityMigrationIssue {
                reason: "duplicateIdField",
                relative_path,
            }),
            NoteIdentityStatus::MalformedFrontMatter => {
                issues.push(IdentityMigrationIssue {
                    reason: "malformedFrontMatter",
                    relative_path,
                });
            }
            NoteIdentityStatus::Present(_) => {}
        }
    }

    Ok((
        IdentityMigrationPreview {
            eligible_files,
            issues,
        },
        IdentityMigrationPlan { entries, root },
    ))
}

fn apply_identity_migration_plan(
    plan: &IdentityMigrationPlan,
) -> Result<(usize, usize), VaultError> {
    let snapshot = scan_vault(&plan.root)?;
    let mut known_identities = HashSet::new();
    for file in &snapshot.files {
        let signature = vault_file_signature(&plan.root, &file.relative_path)?;
        if let NoteIdentityStatus::Present(id) =
            read_identity_status(&plan.root, &file.relative_path, signature)?
        {
            known_identities.insert(id);
        }
    }

    let mut migrated = 0;
    let mut skipped = 0;
    for entry in &plan.entries {
        let Ok(current_signature) = vault_file_signature(&plan.root, &entry.relative_path) else {
            skipped += 1;
            continue;
        };
        if current_signature != entry.signature {
            skipped += 1;
            continue;
        }
        let expected = read_markdown_file(&plan.root, &entry.relative_path)?.content;
        if !matches!(
            inspect_note_identity(&expected),
            NoteIdentityStatus::Missing
        ) {
            skipped += 1;
            continue;
        }
        let id = generate_unique_note_id(&known_identities);
        let updated = add_note_identity(&expected, &id).map_err(|_| {
            VaultError::identity_conflict(
                "A legacy note could not receive an identity without changing unsafe front matter.",
            )
        })?;
        save_markdown_file(&plan.root, &entry.relative_path, &updated, &expected)?;
        known_identities.insert(id);
        migrated += 1;
    }
    Ok((migrated, skipped))
}

fn generate_unique_note_id(existing: &HashSet<String>) -> String {
    loop {
        let id = generate_note_id();
        if !existing.contains(&id) {
            return id;
        }
    }
}

fn vault_file_signature(root: &Path, relative_path: &str) -> Result<FileSignature, VaultError> {
    let path = resolve_vault_markdown_file(root, relative_path)?;
    let metadata = fs::metadata(path)
        .map_err(|error| VaultError::io("A Markdown file could not be inspected", error))?;
    let modified_millis = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or_default();
    Ok(FileSignature {
        modified_millis,
        size_bytes: metadata.len(),
    })
}

fn read_identity_status(
    root: &Path,
    relative_path: &str,
    signature: FileSignature,
) -> Result<NoteIdentityStatus, VaultError> {
    if signature.size_bytes > MAX_MARKDOWN_FILE_BYTES {
        return Ok(NoteIdentityStatus::Invalid);
    }
    let path = resolve_vault_markdown_file(root, relative_path)?;
    let bytes = fs::read(path)
        .map_err(|error| VaultError::io("A Markdown file could not be read", error))?;
    let Ok(content) = String::from_utf8(bytes) else {
        return Ok(NoteIdentityStatus::Invalid);
    };
    Ok(inspect_note_identity(&content))
}

fn load_identity_baseline(
    path: &Path,
    root: &Path,
) -> Result<Option<IdentityBaseline>, VaultError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(VaultError::io(
                "The identity baseline could not be read",
                error,
            ))
        }
    };
    let baseline: IdentityBaseline = serde_json::from_slice(&bytes)
        .map_err(|error| VaultError::state(format!("The identity baseline is invalid: {error}")))?;
    if baseline.version != 1 || baseline.vault_root != root.to_string_lossy() {
        return Err(VaultError::state(
            "The identity baseline does not match the selected vault.",
        ));
    }
    Ok(Some(baseline))
}

fn write_identity_baseline(path: &Path, baseline: &IdentityBaseline) -> Result<(), VaultError> {
    let bytes = serde_json::to_vec_pretty(baseline).map_err(|error| {
        VaultError::state(format!(
            "The identity baseline could not be encoded: {error}"
        ))
    })?;
    let temporary_path = path.with_extension(format!(
        "json.anchored-{}-{}.tmp",
        std::process::id(),
        TEMPORARY_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary_path)
        .map_err(|error| {
            VaultError::io("A temporary identity baseline could not be created", error)
        })?;
    use std::io::Write;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| VaultError::io("The identity baseline could not be written", error))?;
    drop(file);
    if let Err(error) = fs::rename(&temporary_path, path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(VaultError::io(
            "The identity baseline could not be replaced",
            error,
        ));
    }
    sync_parent_directory(path)
}

fn read_markdown_file(root: &Path, relative_path: &str) -> Result<VaultDocument, VaultError> {
    let canonical_file = resolve_vault_markdown_file(root, relative_path)?;
    let metadata = fs::metadata(&canonical_file)
        .map_err(|error| VaultError::io("The Markdown file could not be inspected", error))?;
    if metadata.len() > MAX_MARKDOWN_FILE_BYTES {
        return Err(VaultError::file_too_large());
    }

    let bytes = fs::read(&canonical_file)
        .map_err(|error| VaultError::io("The Markdown file could not be read", error))?;
    let content = String::from_utf8(bytes).map_err(|_| VaultError::invalid_encoding())?;

    Ok(VaultDocument {
        content,
        relative_path: relative_path.to_owned(),
        size_bytes: metadata.len(),
    })
}

fn save_markdown_file(
    root: &Path,
    relative_path: &str,
    content: &str,
    expected_content: &str,
) -> Result<VaultDocument, VaultError> {
    if content.len() as u64 > MAX_MARKDOWN_FILE_BYTES {
        return Err(VaultError::file_too_large());
    }

    let canonical_file = resolve_vault_markdown_file(root, relative_path)?;
    let current_bytes = fs::read(&canonical_file)
        .map_err(|error| VaultError::io("The Markdown file could not be read", error))?;
    let current_content =
        String::from_utf8(current_bytes).map_err(|_| VaultError::invalid_encoding())?;
    if current_content != expected_content {
        return Err(VaultError::conflict());
    }
    if let NoteIdentityStatus::Present(existing_id) = inspect_note_identity(&current_content) {
        match inspect_note_identity(content) {
            NoteIdentityStatus::Present(proposed_id) if proposed_id == existing_id => {}
            _ => {
                return Err(VaultError::identity_conflict(
                    "This save would remove or change the note's permanent identity. Your edits were kept and were not written.",
                ))
            }
        }
    }

    let metadata = fs::metadata(&canonical_file)
        .map_err(|error| VaultError::io("The Markdown file could not be inspected", error))?;
    let temporary_path = temporary_sibling_path(&canonical_file)?;
    let write_result = write_atomically(&temporary_path, &canonical_file, content, &metadata);
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    write_result?;

    Ok(VaultDocument {
        content: content.to_owned(),
        relative_path: relative_path.to_owned(),
        size_bytes: content.len() as u64,
    })
}

fn create_markdown_file(
    root: &Path,
    destination: &Path,
    content: &str,
) -> Result<VaultDocument, VaultError> {
    let content = match inspect_note_identity(content) {
        NoteIdentityStatus::Present(_) | NoteIdentityStatus::Missing => {
            assign_new_note_identity(content, &generate_note_id()).map_err(|_| {
                VaultError::identity_conflict(
                    "A permanent identity could not be added without changing unsafe front matter.",
                )
            })?
        }
        NoteIdentityStatus::Invalid
        | NoteIdentityStatus::Duplicate
        | NoteIdentityStatus::MalformedFrontMatter => {
            return Err(VaultError::identity_conflict(
                "This note has invalid or ambiguous front matter. It was not created because a permanent identity could not be added safely.",
            ))
        }
    };
    if content.len() as u64 > MAX_MARKDOWN_FILE_BYTES {
        return Err(VaultError::file_too_large());
    }

    let (destination, relative_path) = resolve_new_vault_markdown_file(root, destination)?;
    let temporary_path = temporary_sibling_path(&destination)?;
    let write_result = write_new_atomically(&temporary_path, &destination, &content);
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    write_result?;

    Ok(VaultDocument {
        content,
        relative_path,
        size_bytes: fs::metadata(&destination)
            .map_err(|error| {
                VaultError::io("The created Markdown file could not be inspected", error)
            })?
            .len(),
    })
}

fn rename_markdown_file(
    root: &Path,
    relative_path: &str,
    destination: &Path,
    fail_after_installations: Option<usize>,
) -> Result<RenameOutcome, VaultError> {
    let root = canonical_vault_root(root)?;
    let original_path = resolve_vault_markdown_file(&root, relative_path)?;
    let (destination_path, new_relative_path) =
        resolve_new_vault_markdown_file(&root, destination)?;
    if new_relative_path == relative_path {
        return Err(VaultError::rename_conflict(
            "Choose a different filename or folder for this note.",
        ));
    }
    if destination_path.exists() {
        let existing = fs::canonicalize(&destination_path).map_err(|error| {
            VaultError::io("The rename destination could not be inspected", error)
        })?;
        if existing != original_path {
            return Err(VaultError::file_exists());
        }
    }

    let mut snapshot = scan_vault(&root)?;
    enrich_vault_metadata(&root, &mut snapshot.files)?;
    let target = snapshot
        .files
        .iter()
        .find(|file| file.relative_path == relative_path)
        .ok_or_else(|| VaultError::invalid_file("The note to rename is no longer in the vault."))?;
    let target_identity = target.id.as_deref().ok_or_else(|| {
        VaultError::identity_conflict(
            "This note needs a unique permanent identity before it can be renamed safely.",
        )
    })?;

    let mut sources = Vec::with_capacity(snapshot.files.len());
    for file in &snapshot.files {
        let document = read_markdown_file(&root, &file.relative_path).map_err(|error| {
            VaultError::rename_conflict(format!(
                "Every Markdown file must be readable before links can be updated safely. {}: {}",
                file.relative_path, error.message
            ))
        })?;
        sources.push(LinkSource {
            content: document.content,
            relative_path: file.relative_path.clone(),
        });
    }
    let notes = snapshot
        .files
        .iter()
        .map(|file| LinkNote {
            aliases: file.aliases.clone(),
            identity: file.id.clone(),
            relative_path: file.relative_path.clone(),
        })
        .collect::<Vec<_>>();
    let rewrites = plan_rename_link_rewrites(&notes, &sources, target_identity, &new_relative_path);
    let updated_links = rewrites
        .iter()
        .map(|rewrite| rewrite.replacement_count)
        .sum();
    let updated_files = rewrites.len();
    let mut final_contents = rewrites
        .into_iter()
        .map(|rewrite| (rewrite.relative_path, rewrite.content))
        .collect::<BTreeMap<_, _>>();
    let target_content = sources
        .iter()
        .find(|source| source.relative_path == relative_path)
        .expect("the scanned target has loaded content")
        .content
        .clone();
    final_contents
        .entry(relative_path.to_owned())
        .or_insert(target_content);

    let mut entries: Vec<RenameTransactionEntry> = Vec::with_capacity(final_contents.len());
    for (path, content) in final_contents {
        let prepared = (|| {
            let source = sources
                .iter()
                .find(|source| source.relative_path == path)
                .expect("every rewrite source was loaded");
            let source_path = resolve_vault_markdown_file(&root, &path)?;
            let final_path = if path == relative_path {
                destination_path.clone()
            } else {
                source_path.clone()
            };
            let temporary_path = temporary_sibling_path(&final_path)?;
            let backup_path = transaction_sibling_path(&source_path, "backup")?;
            let metadata = fs::metadata(&source_path)
                .map_err(|error| VaultError::io("A Markdown file could not be inspected", error))?;
            prepare_transaction_file(&temporary_path, &content, &metadata)?;
            Ok::<_, VaultError>(RenameTransactionEntry {
                backup_path,
                destination_path: final_path,
                original_content: source.content.clone(),
                original_path: source_path,
                temporary_path,
            })
        })();
        match prepared {
            Ok(entry) => entries.push(entry),
            Err(error) => {
                cleanup_transaction_files(&entries);
                return Err(error);
            }
        }
    }

    let recheck_result = (|| {
        for entry in &entries {
            let current = fs::read(&entry.original_path)
                .map_err(|error| VaultError::io("A Markdown file could not be rechecked", error))?;
            if current != entry.original_content.as_bytes() {
                return Err(VaultError::conflict());
            }
        }
        if destination_path.exists() {
            let existing = fs::canonicalize(&destination_path).map_err(|error| {
                VaultError::io("The rename destination could not be rechecked", error)
            })?;
            if existing != original_path {
                return Err(VaultError::file_exists());
            }
        }
        Ok::<_, VaultError>(())
    })();
    if let Err(error) = recheck_result {
        cleanup_transaction_files(&entries);
        return Err(error);
    }

    commit_rename_transaction(&root, &entries, fail_after_installations)?;
    Ok(RenameOutcome {
        relative_path: new_relative_path,
        updated_files,
        updated_links,
    })
}

fn prepare_transaction_file(
    temporary_path: &Path,
    content: &str,
    source_metadata: &fs::Metadata,
) -> Result<(), VaultError> {
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(temporary_path)
        .map_err(|error| VaultError::io("A rename temporary file could not be created", error))?;
    if let Err(error) = file.set_permissions(source_metadata.permissions()) {
        drop(file);
        let _ = fs::remove_file(temporary_path);
        return Err(VaultError::io(
            "A rename temporary file could not be prepared",
            error,
        ));
    }
    use std::io::Write;
    if let Err(error) = file
        .write_all(content.as_bytes())
        .and_then(|_| file.sync_all())
    {
        drop(file);
        let _ = fs::remove_file(temporary_path);
        return Err(VaultError::io(
            "A rename temporary file could not be written",
            error,
        ));
    }
    Ok(())
}

fn commit_rename_transaction(
    root: &Path,
    entries: &[RenameTransactionEntry],
    fail_after_installations: Option<usize>,
) -> Result<(), VaultError> {
    let journal_path = root.join(RENAME_JOURNAL_NAME);
    if journal_path.exists() {
        return Err(VaultError::rename_conflict(
            "A previous note rename needs recovery before another rename can begin.",
        ));
    }
    let mut journal = build_rename_journal(root, entries)?;
    write_rename_journal(&journal_path, &journal)?;

    let mut backed_up = 0_usize;
    for entry in entries {
        if let Err(error) = fs::rename(&entry.original_path, &entry.backup_path) {
            return rollback_rename_transaction(
                entries,
                backed_up,
                0,
                &journal_path,
                VaultError::io("A Markdown backup could not be created", error),
            );
        }
        backed_up += 1;
    }
    journal.phase = RenameJournalPhase::BackedUp;
    if let Err(error) = write_rename_journal(&journal_path, &journal) {
        return rollback_rename_transaction(entries, backed_up, 0, &journal_path, error);
    }

    for (installed, entry) in entries.iter().enumerate() {
        if fail_after_installations == Some(installed) {
            return rollback_rename_transaction(
                entries,
                backed_up,
                installed,
                &journal_path,
                VaultError::state("The simulated rename interruption was triggered."),
            );
        }
        if let Err(error) = fs::rename(&entry.temporary_path, &entry.destination_path) {
            return rollback_rename_transaction(
                entries,
                backed_up,
                installed,
                &journal_path,
                VaultError::io("A renamed Markdown file could not be installed", error),
            );
        }
    }
    journal.phase = RenameJournalPhase::Installed;
    if let Err(error) = write_rename_journal(&journal_path, &journal) {
        return rollback_rename_transaction(
            entries,
            backed_up,
            entries.len(),
            &journal_path,
            error,
        );
    }

    for entry in entries {
        if let Err(error) = fs::remove_file(&entry.backup_path) {
            if error.kind() != std::io::ErrorKind::NotFound {
                return Err(VaultError::io(
                    "A completed rename backup could not be removed",
                    error,
                ));
            }
        }
        sync_parent_directory(&entry.original_path)?;
        if entry.destination_path.parent() != entry.original_path.parent() {
            sync_parent_directory(&entry.destination_path)?;
        }
    }
    fs::remove_file(&journal_path).map_err(|error| {
        VaultError::io("The completed rename journal could not be removed", error)
    })?;
    sync_parent_directory(&journal_path)?;
    Ok(())
}

fn rollback_rename_transaction(
    entries: &[RenameTransactionEntry],
    backed_up: usize,
    installed: usize,
    journal_path: &Path,
    original_error: VaultError,
) -> Result<(), VaultError> {
    let mut rollback_error = None;
    for entry in entries[..installed].iter().rev() {
        if let Err(error) = fs::remove_file(&entry.destination_path) {
            rollback_error.get_or_insert(error);
        }
    }
    for entry in entries[..backed_up].iter().rev() {
        if let Err(error) = fs::rename(&entry.backup_path, &entry.original_path) {
            rollback_error.get_or_insert(error);
        }
    }
    cleanup_transaction_files(entries);
    let journal_removal = fs::remove_file(journal_path);

    if let Some(error) = rollback_error {
        return Err(VaultError::io(
            "The rename failed and its backups could not be fully restored",
            error,
        ));
    }
    if let Err(error) = journal_removal {
        if error.kind() != std::io::ErrorKind::NotFound {
            return Err(VaultError::io(
                "The failed rename journal could not be removed",
                error,
            ));
        }
    }
    Err(original_error)
}

fn build_rename_journal(
    root: &Path,
    entries: &[RenameTransactionEntry],
) -> Result<RenameJournal, VaultError> {
    let entries = entries
        .iter()
        .map(|entry| {
            Ok(RenameJournalEntry {
                backup_path: path_for_rename_journal(root, &entry.backup_path)?,
                destination_path: path_for_rename_journal(root, &entry.destination_path)?,
                original_path: path_for_rename_journal(root, &entry.original_path)?,
                temporary_path: path_for_rename_journal(root, &entry.temporary_path)?,
            })
        })
        .collect::<Result<Vec<_>, VaultError>>()?;
    Ok(RenameJournal {
        entries,
        phase: RenameJournalPhase::Prepared,
        version: 1,
    })
}

fn path_for_rename_journal(root: &Path, path: &Path) -> Result<String, VaultError> {
    path.strip_prefix(root)
        .ok()
        .and_then(Path::to_str)
        .filter(|relative| !relative.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| VaultError::state("A rename transaction path could not be stored safely."))
}

fn write_rename_journal(path: &Path, journal: &RenameJournal) -> Result<(), VaultError> {
    let bytes = serde_json::to_vec_pretty(journal)
        .map_err(|error| VaultError::state(format!("The rename journal is invalid: {error}")))?;
    let temporary_path = temporary_sibling_path(path)?;
    let write_result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary_path)
            .map_err(|error| VaultError::io("A rename journal could not be created", error))?;
        use std::io::Write;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|error| VaultError::io("The rename journal could not be written", error))?;
        drop(file);
        fs::rename(&temporary_path, path)
            .map_err(|error| VaultError::io("The rename journal could not be installed", error))?;
        sync_parent_directory(path)
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    write_result
}

fn recover_rename_transaction(root: &Path) -> Result<(), VaultError> {
    let root = canonical_vault_root(root)?;
    let journal_path = root.join(RENAME_JOURNAL_NAME);
    let bytes = match fs::read(&journal_path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(VaultError::io(
                "The rename journal could not be read",
                error,
            ))
        }
    };
    let journal: RenameJournal = serde_json::from_slice(&bytes).map_err(|error| {
        VaultError::rename_conflict(format!(
            "A previous rename journal is invalid and was left untouched: {error}"
        ))
    })?;
    if journal.version != 1 || journal.entries.is_empty() {
        return Err(VaultError::rename_conflict(
            "A previous rename journal has an unsupported format and was left untouched.",
        ));
    }
    let entries = journal
        .entries
        .iter()
        .map(|entry| {
            Ok(RenameTransactionEntry {
                backup_path: resolve_rename_journal_path(&root, &entry.backup_path)?,
                destination_path: resolve_rename_journal_path(&root, &entry.destination_path)?,
                original_content: String::new(),
                original_path: resolve_rename_journal_path(&root, &entry.original_path)?,
                temporary_path: resolve_rename_journal_path(&root, &entry.temporary_path)?,
            })
        })
        .collect::<Result<Vec<_>, VaultError>>()?;
    validate_rename_recovery_entries(&entries)?;

    match journal.phase {
        RenameJournalPhase::Prepared | RenameJournalPhase::BackedUp => {
            restore_rename_backups(&entries)?;
        }
        RenameJournalPhase::Installed => {
            if entries
                .iter()
                .any(|entry| !entry.destination_path.is_file())
            {
                return Err(VaultError::rename_conflict(
                    "A completed rename is missing an installed file. Its recovery files were left untouched.",
                ));
            }
            for entry in &entries {
                if let Err(error) = fs::remove_file(&entry.backup_path) {
                    if error.kind() != std::io::ErrorKind::NotFound {
                        return Err(VaultError::io(
                            "A completed rename backup could not be removed",
                            error,
                        ));
                    }
                }
                let _ = fs::remove_file(&entry.temporary_path);
            }
        }
    }
    fs::remove_file(&journal_path).map_err(|error| {
        VaultError::io("The recovered rename journal could not be removed", error)
    })?;
    sync_parent_directory(&journal_path)
}

fn restore_rename_backups(entries: &[RenameTransactionEntry]) -> Result<(), VaultError> {
    for entry in entries.iter().rev() {
        if entry.backup_path.exists() {
            if entry.destination_path == entry.original_path {
                if entry.original_path.exists() {
                    fs::remove_file(&entry.original_path).map_err(|error| {
                        VaultError::io("A partial rename file could not be removed", error)
                    })?;
                }
            } else {
                if entry.original_path.exists() {
                    return Err(VaultError::rename_conflict(
                        "A rename backup conflicts with an existing original file. Recovery files were left untouched.",
                    ));
                }
                if entry.destination_path.exists() {
                    fs::remove_file(&entry.destination_path).map_err(|error| {
                        VaultError::io("A partial renamed file could not be removed", error)
                    })?;
                }
            }
            fs::rename(&entry.backup_path, &entry.original_path)
                .map_err(|error| VaultError::io("A rename backup could not be restored", error))?;
        } else if !entry.original_path.is_file() {
            return Err(VaultError::rename_conflict(
                "A rename recovery is missing both an original and its backup. Recovery files were left untouched.",
            ));
        }
        let _ = fs::remove_file(&entry.temporary_path);
    }
    Ok(())
}

fn resolve_rename_journal_path(root: &Path, relative: &str) -> Result<PathBuf, VaultError> {
    let path = Path::new(relative);
    if relative.is_empty()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(VaultError::rename_conflict(
            "A previous rename journal contains an unsafe path and was left untouched.",
        ));
    }
    Ok(root.join(path))
}

fn validate_rename_recovery_entries(entries: &[RenameTransactionEntry]) -> Result<(), VaultError> {
    let mut originals = HashSet::new();
    let mut destinations = HashSet::new();
    for entry in entries {
        let backup_name = entry
            .backup_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        let temporary_name = entry
            .temporary_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        let valid = is_markdown(&entry.original_path)
            && is_markdown(&entry.destination_path)
            && entry.backup_path.parent() == entry.original_path.parent()
            && entry.temporary_path.parent() == entry.destination_path.parent()
            && backup_name.starts_with('.')
            && backup_name.contains(".anchored-")
            && backup_name.ends_with(".backup")
            && temporary_name.starts_with('.')
            && temporary_name.contains(".anchored-")
            && temporary_name.ends_with(".tmp")
            && originals.insert(entry.original_path.clone())
            && destinations.insert(entry.destination_path.clone());
        if !valid {
            return Err(VaultError::rename_conflict(
                "A previous rename journal failed safety validation and was left untouched.",
            ));
        }
    }
    Ok(())
}

fn cleanup_transaction_files(entries: &[RenameTransactionEntry]) {
    for entry in entries {
        let _ = fs::remove_file(&entry.temporary_path);
    }
}

fn transaction_sibling_path(destination: &Path, label: &str) -> Result<PathBuf, VaultError> {
    let parent = destination.parent().ok_or_else(|| {
        VaultError::invalid_file("The Markdown file does not have a writable parent directory.")
    })?;
    let name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| VaultError::invalid_file("The Markdown file name is not valid UTF-8."))?;
    let counter = TEMPORARY_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    Ok(parent.join(format!(
        ".{name}.anchored-{}-{counter}.{label}",
        std::process::id()
    )))
}

fn safe_suggested_markdown_name(suggested_name: &str) -> &str {
    let path = Path::new(suggested_name);
    if path.components().count() == 1 && is_markdown(path) {
        suggested_name
    } else {
        "Untitled.md"
    }
}

fn resolve_new_vault_markdown_file(
    root: &Path,
    destination: &Path,
) -> Result<(PathBuf, String), VaultError> {
    let root = canonical_vault_root(root)?;
    if !destination.is_absolute() || !is_markdown(destination) {
        return Err(VaultError::invalid_file(
            "New notes must use a Markdown file path inside the selected vault.",
        ));
    }

    let parent = destination.parent().ok_or_else(|| {
        VaultError::invalid_file("The Markdown file does not have a writable parent directory.")
    })?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| VaultError::io("The save folder could not be opened", error))?;
    if !canonical_parent.starts_with(&root) {
        return Err(VaultError::invalid_file(
            "New notes must be saved inside the selected vault.",
        ));
    }

    let file_name = destination.file_name().ok_or_else(|| {
        VaultError::invalid_file(
            "New notes must use a Markdown file path inside the selected vault.",
        )
    })?;
    let candidate = canonical_parent.join(file_name);
    let relative = candidate.strip_prefix(&root).map_err(|_| {
        VaultError::invalid_file("New notes must be saved inside the selected vault.")
    })?;

    let relative_path = relative
        .to_str()
        .ok_or_else(|| VaultError::invalid_file("The Markdown path is not valid UTF-8."))?
        .to_owned();
    Ok((candidate, relative_path))
}

fn resolve_vault_markdown_file(root: &Path, relative_path: &str) -> Result<PathBuf, VaultError> {
    let root = canonical_vault_root(root)?;
    let requested = Path::new(relative_path);

    if relative_path.is_empty() || !is_markdown(requested) {
        return Err(VaultError::invalid_file(
            "Only relative Markdown file paths can be opened.",
        ));
    }

    let mut candidate = root.clone();
    for component in requested.components() {
        let Component::Normal(segment) = component else {
            return Err(VaultError::invalid_file(
                "Only relative Markdown file paths can be opened.",
            ));
        };

        candidate.push(segment);
        let metadata = fs::symlink_metadata(&candidate)
            .map_err(|error| VaultError::io("The Markdown file could not be inspected", error))?;
        if metadata.file_type().is_symlink() {
            return Err(VaultError::invalid_file(
                "Symlinked Markdown paths cannot be opened.",
            ));
        }
    }

    let canonical_file = fs::canonicalize(&candidate)
        .map_err(|error| VaultError::io("The Markdown file could not be opened", error))?;
    if !canonical_file.starts_with(&root) {
        return Err(VaultError::invalid_file(
            "The Markdown file resolved outside the selected vault.",
        ));
    }

    let metadata = fs::metadata(&canonical_file)
        .map_err(|error| VaultError::io("The Markdown file could not be inspected", error))?;
    if !metadata.is_file() {
        return Err(VaultError::invalid_file(
            "The selected Markdown path is not a file.",
        ));
    }
    Ok(canonical_file)
}

fn temporary_sibling_path(destination: &Path) -> Result<PathBuf, VaultError> {
    let parent = destination.parent().ok_or_else(|| {
        VaultError::invalid_file("The Markdown file does not have a writable parent directory.")
    })?;
    let name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| VaultError::invalid_file("The Markdown file name is not valid UTF-8."))?;
    let counter = TEMPORARY_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);

    Ok(parent.join(format!(
        ".{name}.anchored-{}-{counter}.tmp",
        std::process::id()
    )))
}

fn write_atomically(
    temporary_path: &Path,
    destination: &Path,
    content: &str,
    destination_metadata: &fs::Metadata,
) -> Result<(), VaultError> {
    let mut temporary_file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(temporary_path)
        .map_err(|error| VaultError::io("A temporary Markdown file could not be created", error))?;
    temporary_file
        .set_permissions(destination_metadata.permissions())
        .map_err(|error| {
            VaultError::io("The temporary Markdown file could not be prepared", error)
        })?;
    use std::io::Write;
    temporary_file
        .write_all(content.as_bytes())
        .map_err(|error| VaultError::io("The Markdown file could not be written", error))?;
    temporary_file
        .sync_all()
        .map_err(|error| VaultError::io("The Markdown file could not be flushed", error))?;
    drop(temporary_file);

    fs::rename(temporary_path, destination)
        .map_err(|error| VaultError::io("The Markdown file could not be replaced", error))?;
    sync_parent_directory(destination)
}

fn write_new_atomically(
    temporary_path: &Path,
    destination: &Path,
    content: &str,
) -> Result<(), VaultError> {
    let mut temporary_file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(temporary_path)
        .map_err(|error| VaultError::io("A temporary Markdown file could not be created", error))?;
    use std::io::Write;
    temporary_file
        .write_all(content.as_bytes())
        .map_err(|error| VaultError::io("The Markdown file could not be written", error))?;
    temporary_file
        .sync_all()
        .map_err(|error| VaultError::io("The Markdown file could not be flushed", error))?;
    drop(temporary_file);

    fs::hard_link(temporary_path, destination).map_err(|error| {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            VaultError::file_exists()
        } else {
            VaultError::io("The Markdown file could not be created", error)
        }
    })?;
    fs::remove_file(temporary_path).map_err(|error| {
        VaultError::io("The temporary Markdown file could not be removed", error)
    })?;
    sync_parent_directory(destination)
}

#[cfg(unix)]
fn sync_parent_directory(destination: &Path) -> Result<(), VaultError> {
    let parent = destination.parent().ok_or_else(|| {
        VaultError::invalid_file("The Markdown file does not have a writable parent directory.")
    })?;
    fs::File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| {
            VaultError::io(
                "The Markdown file replacement could not be finalized",
                error,
            )
        })
}

#[cfg(not(unix))]
fn sync_parent_directory(_destination: &Path) -> Result<(), VaultError> {
    Ok(())
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{Duration, Instant};

    use tempfile::tempdir;

    use super::{
        apply_identity_migration_plan, build_identity_migration_preview, canonical_vault_root,
        create_markdown_file, enrich_vault_metadata, inspect_note_identity, read_markdown_file,
        reconcile_vault_identities, recover_rename_transaction, rename_markdown_file,
        save_markdown_file, scan_vault, search_markdown_files, write_rename_journal,
        NoteIdentityStatus, RenameJournal, RenameJournalEntry, RenameJournalPhase, RenameOutcome,
        MAX_MARKDOWN_FILE_BYTES, MAX_SEARCH_RESULTS, RENAME_JOURNAL_NAME,
    };

    #[test]
    fn scans_nested_markdown_in_stable_order() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("Notes")).expect("create Notes folder");
        fs::write(vault.path().join("Zulu.md"), "# Zulu").expect("write root note");
        fs::write(
            vault.path().join("Notes/Alpha.MD"),
            "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\naliases: [First note]\nrelated: '[[Reading]]'\n---\n# Alpha\n[[Zulu]]",
        )
        .expect("write nested note");
        fs::write(vault.path().join("Notes/ignore.txt"), "ignored").expect("write ignored file");

        let mut snapshot = scan_vault(vault.path()).expect("scan fixture vault");
        enrich_vault_metadata(vault.path(), &mut snapshot.files).expect("index note metadata");
        let paths = snapshot
            .files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect::<Vec<_>>();

        assert_eq!(paths, vec!["Notes/Alpha.MD", "Zulu.md"]);
        assert_eq!(
            snapshot.files[0].id.as_deref(),
            Some("01JZQ7K8P4A6F2M9V3C5T7X1BY")
        );
        assert_eq!(snapshot.files[0].aliases, vec!["First note"]);
        assert_eq!(snapshot.files[0].outgoing_links, vec!["Reading", "Zulu"]);
        assert_eq!(snapshot.warnings.skipped_symlinks, 0);
    }

    #[test]
    fn indexes_the_checked_in_smoke_vault() {
        let root =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures/smoke-vault");
        let mut snapshot = scan_vault(&root).expect("scan checked-in smoke vault");
        enrich_vault_metadata(&root, &mut snapshot.files).expect("index smoke vault metadata");

        assert_eq!(snapshot.files.len(), 6);
        assert_eq!(
            snapshot
                .files
                .iter()
                .filter(|file| file.id.is_some())
                .count(),
            5
        );
        let leadership = snapshot
            .files
            .iter()
            .find(|file| file.relative_path == "Notes/Leadership.md")
            .expect("find leadership fixture");
        assert_eq!(leadership.aliases, vec!["Leading Well", "Calm Leadership"]);
        assert_eq!(
            leadership.outgoing_links,
            vec!["Daily Practice", "Reading List", "Future Idea"]
        );
    }

    #[test]
    fn searches_unicode_markdown_with_line_context() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("Notes")).expect("create Notes folder");
        fs::write(
            vault.path().join("Notes/Thoughts.md"),
            "First line\nA quiet CAFÉ for writing.\nLast line\n",
        )
        .expect("write searchable note");
        fs::write(vault.path().join("Notes/Ignore.txt"), "café").expect("write ignored text file");

        let result = search_markdown_files(vault.path(), "café").expect("search fixture vault");

        assert_eq!(result.matches.len(), 1);
        assert_eq!(result.matches[0].relative_path, "Notes/Thoughts.md");
        assert_eq!(result.matches[0].line, 2);
        assert_eq!(result.matches[0].snippet, "A quiet CAFÉ for writing.");
        assert_eq!(result.searched_files, 1);
        assert_eq!(result.skipped_files, 0);
        assert!(!result.truncated);
    }

    #[test]
    fn bounds_results_from_repeated_matches() {
        let vault = tempdir().expect("create fixture vault");
        let content = (0..(MAX_SEARCH_RESULTS + 20))
            .map(|index| format!("match {index}"))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(vault.path().join("Matches.md"), content).expect("write repeated matches");

        let result = search_markdown_files(vault.path(), "match").expect("search repeated matches");

        assert_eq!(result.matches.len(), MAX_SEARCH_RESULTS);
        assert!(result.truncated);
    }

    #[test]
    fn searches_a_large_fixture_within_the_interaction_budget() {
        let vault = tempdir().expect("create fixture vault");
        for index in 0..1_000 {
            let content = if index == 999 {
                "The final needle is here.".to_owned()
            } else {
                format!("Ordinary fixture note {index} with enough text to scan.")
            };
            fs::write(vault.path().join(format!("Note {index:04}.md")), content)
                .expect("write fixture note");
        }

        let started = Instant::now();
        let result = search_markdown_files(vault.path(), "needle").expect("search large fixture");

        assert_eq!(result.matches.len(), 1);
        assert_eq!(result.searched_files, 1_000);
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn baselines_existing_notes_then_identifies_a_new_file() {
        let vault = tempdir().expect("create fixture vault");
        let baseline = vault.path().join("baseline.json");
        let legacy = vault.path().join("Legacy.md");
        fs::write(&legacy, "# Legacy\n").expect("write legacy note");

        let initial = scan_vault(vault.path()).expect("scan initial vault");
        let initial_summary = reconcile_vault_identities(vault.path(), &initial.files, &baseline)
            .expect("create read-only baseline");

        assert_eq!(initial_summary.added, 0);
        assert_eq!(initial_summary.needs_identity, 1);
        assert_eq!(
            fs::read_to_string(&legacy).expect("read legacy note"),
            "# Legacy\n"
        );

        let imported = vault.path().join("Imported.md");
        fs::write(&imported, "# Imported\n").expect("write imported note");
        let updated = scan_vault(vault.path()).expect("scan updated vault");
        let updated_summary = reconcile_vault_identities(vault.path(), &updated.files, &baseline)
            .expect("identify imported note");
        let imported_content = fs::read_to_string(&imported).expect("read imported note");

        assert_eq!(updated_summary.added, 1);
        assert_eq!(updated_summary.needs_identity, 1);
        assert!(matches!(
            inspect_note_identity(&imported_content),
            NoteIdentityStatus::Present(_)
        ));
        assert!(imported_content.ends_with("\n# Imported\n"));
    }

    #[test]
    fn treats_a_renamed_legacy_note_as_existing() {
        let vault = tempdir().expect("create fixture vault");
        let baseline = vault.path().join("baseline.json");
        let original = vault.path().join("Original.md");
        let renamed = vault.path().join("Renamed.md");
        fs::write(&original, "# Legacy\n").expect("write legacy note");
        let initial = scan_vault(vault.path()).expect("scan initial vault");
        reconcile_vault_identities(vault.path(), &initial.files, &baseline)
            .expect("create baseline");

        fs::rename(&original, &renamed).expect("rename legacy note");
        let updated = scan_vault(vault.path()).expect("scan renamed vault");
        let summary = reconcile_vault_identities(vault.path(), &updated.files, &baseline)
            .expect("reconcile rename");

        assert_eq!(summary.added, 0);
        assert_eq!(summary.needs_identity, 1);
        assert_eq!(
            fs::read_to_string(&renamed).expect("read renamed note"),
            "# Legacy\n"
        );
    }

    #[test]
    fn retries_a_new_note_after_unsafe_front_matter_is_repaired() {
        let vault = tempdir().expect("create fixture vault");
        let baseline = vault.path().join("baseline.json");
        let initial = scan_vault(vault.path()).expect("scan empty vault");
        reconcile_vault_identities(vault.path(), &initial.files, &baseline)
            .expect("create empty baseline");

        let imported = vault.path().join("Imported.md");
        fs::write(&imported, "---\ntags: [broken\n---\nBody\n").expect("write unsafe note");
        let unsafe_scan = scan_vault(vault.path()).expect("scan unsafe note");
        let unsafe_summary =
            reconcile_vault_identities(vault.path(), &unsafe_scan.files, &baseline)
                .expect("record unsafe note");
        assert_eq!(unsafe_summary.conflicts, 1);

        fs::write(&imported, "# Repaired\n").expect("repair note");
        let repaired_scan = scan_vault(vault.path()).expect("scan repaired note");
        let repaired_summary =
            reconcile_vault_identities(vault.path(), &repaired_scan.files, &baseline)
                .expect("identify repaired note");

        assert_eq!(repaired_summary.added, 1);
        assert!(matches!(
            inspect_note_identity(
                &fs::read_to_string(&imported).expect("read identified repaired note")
            ),
            NoteIdentityStatus::Present(_)
        ));
    }

    #[test]
    fn previews_and_applies_only_safe_legacy_identity_changes() {
        let vault = tempdir().expect("create fixture vault");
        fs::write(vault.path().join("Legacy.md"), "# Legacy\n").expect("write legacy note");
        fs::write(
            vault.path().join("Unsafe.md"),
            "---\ntags: [broken\n---\nBody\n",
        )
        .expect("write unsafe note");
        let snapshot = scan_vault(vault.path()).expect("scan fixture vault");

        let (preview, plan) = build_identity_migration_preview(vault.path(), &snapshot.files)
            .expect("preview migration");

        assert_eq!(preview.eligible_files, vec!["Legacy.md"]);
        assert_eq!(preview.issues.len(), 1);
        assert_eq!(preview.issues[0].relative_path, "Unsafe.md");
        assert_eq!(preview.issues[0].reason, "malformedFrontMatter");

        let (migrated, skipped) = apply_identity_migration_plan(&plan).expect("apply migration");
        assert_eq!((migrated, skipped), (1, 0));
        assert!(matches!(
            inspect_note_identity(
                &fs::read_to_string(vault.path().join("Legacy.md")).expect("read migrated note")
            ),
            NoteIdentityStatus::Present(_)
        ));
        assert_eq!(
            fs::read_to_string(vault.path().join("Unsafe.md")).expect("read unsafe note"),
            "---\ntags: [broken\n---\nBody\n"
        );
    }

    #[test]
    fn skips_a_legacy_note_changed_after_preview() {
        let vault = tempdir().expect("create fixture vault");
        let note = vault.path().join("Legacy.md");
        fs::write(&note, "# Before\n").expect("write legacy note");
        let snapshot = scan_vault(vault.path()).expect("scan fixture vault");
        let (_, plan) = build_identity_migration_preview(vault.path(), &snapshot.files)
            .expect("preview migration");
        fs::write(&note, "# Changed after preview\n").expect("change legacy note");

        let (migrated, skipped) = apply_identity_migration_plan(&plan).expect("apply migration");

        assert_eq!((migrated, skipped), (0, 1));
        assert_eq!(
            fs::read_to_string(&note).expect("read changed note"),
            "# Changed after preview\n"
        );
    }

    #[test]
    fn rejects_a_file_as_the_vault_root() {
        let vault = tempdir().expect("create fixture vault");
        let file = vault.path().join("note.md");
        fs::write(&file, "# Note").expect("write note");

        let error = canonical_vault_root(&file).expect_err("reject file root");

        assert_eq!(error.code, "invalidVault");
    }

    #[test]
    fn reads_a_nested_markdown_file_without_changing_it() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("Notes")).expect("create Notes folder");
        let content = "---\ntitle: A note\n---\n# Hello\n\nExact text.\n";
        fs::write(vault.path().join("Notes/Hello.md"), content).expect("write note");

        let document =
            read_markdown_file(vault.path(), "Notes/Hello.md").expect("read Markdown file");

        assert_eq!(document.content, content);
        assert_eq!(document.relative_path, "Notes/Hello.md");
        assert_eq!(document.size_bytes, content.len() as u64);
        assert_eq!(
            fs::read_to_string(vault.path().join("Notes/Hello.md")).expect("reread note"),
            content
        );
    }

    #[test]
    fn reads_an_empty_markdown_file_at_the_vault_root() {
        let vault = tempdir().expect("create fixture vault");
        fs::write(vault.path().join("Empty.md"), "").expect("write empty note");

        let document = read_markdown_file(vault.path(), "Empty.md").expect("read empty note");

        assert!(document.content.is_empty());
        assert_eq!(document.relative_path, "Empty.md");
        assert_eq!(document.size_bytes, 0);
    }

    #[test]
    fn saves_markdown_atomically_when_the_original_content_matches() {
        let vault = tempdir().expect("create fixture vault");
        let note = vault.path().join("Note.md");
        fs::write(&note, "# Before\n").expect("write original note");

        let document = save_markdown_file(vault.path(), "Note.md", "# After\n", "# Before\n")
            .expect("save changed note");

        assert_eq!(document.content, "# After\n");
        assert_eq!(document.size_bytes, 8);
        assert_eq!(
            fs::read_to_string(&note).expect("read saved note"),
            "# After\n"
        );
        assert!(fs::read_dir(vault.path())
            .expect("read vault")
            .all(|entry| !entry
                .expect("read vault entry")
                .file_name()
                .to_string_lossy()
                .contains(".tmp")));
    }

    #[test]
    fn preserves_local_edits_when_the_file_changes_externally() {
        let vault = tempdir().expect("create fixture vault");
        let note = vault.path().join("Note.md");
        fs::write(&note, "# External revision\n").expect("write externally changed note");

        let error = save_markdown_file(
            vault.path(),
            "Note.md",
            "# Local revision\n",
            "# Original revision\n",
        )
        .expect_err("reject stale local revision");

        assert_eq!(error.code, "vaultConflict");
        assert_eq!(
            fs::read_to_string(&note).expect("read externally changed note"),
            "# External revision\n"
        );
    }

    #[test]
    fn creates_a_new_markdown_file_without_leaving_a_temporary_file() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("Notes")).expect("create Notes folder");
        let destination = vault.path().join("Notes/New note.md");

        let document = create_markdown_file(vault.path(), &destination, "# New note\n")
            .expect("create Markdown file");

        assert_eq!(document.relative_path, "Notes/New note.md");
        assert!(matches!(
            inspect_note_identity(&document.content),
            NoteIdentityStatus::Present(_)
        ));
        assert!(document.content.ends_with("\n# New note\n"));
        assert_eq!(document.size_bytes, document.content.len() as u64);
        assert_eq!(
            fs::read_to_string(&destination).expect("read created note"),
            document.content
        );
        assert!(fs::read_dir(vault.path().join("Notes"))
            .expect("read Notes folder")
            .all(|entry| !entry
                .expect("read Notes entry")
                .file_name()
                .to_string_lossy()
                .contains(".tmp")));
    }

    #[test]
    fn refuses_to_replace_an_existing_file_during_creation() {
        let vault = tempdir().expect("create fixture vault");
        let destination = vault.path().join("Existing.md");
        fs::write(&destination, "# Existing\n").expect("write existing note");

        let error = create_markdown_file(vault.path(), &destination, "# Replacement\n")
            .expect_err("reject existing destination");

        assert_eq!(error.code, "vaultFileExists");
        assert_eq!(
            fs::read_to_string(&destination).expect("read existing note"),
            "# Existing\n"
        );
    }

    #[test]
    fn rejects_new_notes_outside_the_selected_vault() {
        let vault = tempdir().expect("create fixture vault");
        let outside = tempdir().expect("create outside fixture");
        let destination = outside.path().join("Outside.md");

        let error = create_markdown_file(vault.path(), &destination, "# Outside\n")
            .expect_err("reject outside destination");

        assert_eq!(error.code, "invalidVaultFile");
        assert!(!destination.exists());
    }

    #[test]
    fn refuses_to_create_a_note_with_unsafe_front_matter() {
        let vault = tempdir().expect("create fixture vault");
        let destination = vault.path().join("Unsafe.md");

        let error = create_markdown_file(
            vault.path(),
            &destination,
            "---\ntags: [unfinished\n---\n# Unsafe\n",
        )
        .expect_err("reject unsafe front matter");

        assert_eq!(error.code, "identityConflict");
        assert!(!destination.exists());
    }

    #[test]
    fn gives_a_saved_copy_a_new_identity() {
        let vault = tempdir().expect("create fixture vault");
        let destination = vault.path().join("Copy.md");
        let original_id = "01JZQ7K8P4A6F2M9V3C5T7X1BY";
        let content = format!("---\nid: {original_id}\n---\n# Copy\n");

        let document = create_markdown_file(vault.path(), &destination, &content)
            .expect("create identified copy");

        let NoteIdentityStatus::Present(created_id) = inspect_note_identity(&document.content)
        else {
            panic!("created copy must have an identity");
        };
        assert_ne!(created_id, original_id);
        assert!(document.content.ends_with("---\n# Copy\n"));
    }

    #[test]
    fn refuses_to_remove_an_existing_note_identity_during_save() {
        let vault = tempdir().expect("create fixture vault");
        let note = vault.path().join("Note.md");
        let original = "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\n---\n# Before\n";
        fs::write(&note, original).expect("write identified note");

        let error = save_markdown_file(vault.path(), "Note.md", "# After\n", original)
            .expect_err("reject identity removal");

        assert_eq!(error.code, "identityConflict");
        assert_eq!(
            fs::read_to_string(&note).expect("read protected note"),
            original
        );
    }

    #[test]
    fn renames_a_note_and_updates_body_and_property_links() {
        let vault = tempdir().expect("create fixture vault");
        let original = vault.path().join("Old Name.md");
        let destination = vault.path().join("New Name.md");
        fs::write(
            &original,
            "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\naliases: [Legacy]\n---\n# Note\n",
        )
        .expect("write target note");
        fs::write(
            vault.path().join("Reference.md"),
            concat!(
                "---\nid: 01JZQ91T3AA6F2M9V3C5T7X1BZ\n",
                "related: \"[[Legacy]]\"\n---\n",
                "[[Old Name]] [[Old Name#Part|Shown]]\n",
            ),
        )
        .expect("write reference note");

        let outcome = rename_markdown_file(vault.path(), "Old Name.md", &destination, None)
            .expect("rename note");

        assert_eq!(
            outcome,
            RenameOutcome {
                relative_path: "New Name.md".to_owned(),
                updated_files: 1,
                updated_links: 3,
            }
        );
        assert!(!original.exists());
        assert!(destination.exists());
        assert_eq!(
            fs::read_to_string(vault.path().join("Reference.md")).expect("read reference note"),
            concat!(
                "---\nid: 01JZQ91T3AA6F2M9V3C5T7X1BZ\n",
                "related: \"[[New Name|Legacy]]\"\n---\n",
                "[[New Name]] [[New Name#Part|Shown]]\n",
            )
        );
    }

    #[test]
    fn supports_a_case_only_filename_change() {
        let vault = tempdir().expect("create fixture vault");
        fs::write(
            vault.path().join("Case.md"),
            "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\n---\n# Note\n",
        )
        .expect("write target note");
        fs::write(
            vault.path().join("Reference.md"),
            "---\nid: 01JZQ91T3AA6F2M9V3C5T7X1BZ\n---\n[[Case]]\n",
        )
        .expect("write reference note");

        rename_markdown_file(vault.path(), "Case.md", &vault.path().join("case.md"), None)
            .expect("rename note casing");

        assert!(vault.path().join("case.md").exists());
        assert_eq!(
            fs::read_to_string(vault.path().join("Reference.md")).expect("read reference"),
            "---\nid: 01JZQ91T3AA6F2M9V3C5T7X1BZ\n---\n[[case]]\n"
        );
    }

    #[test]
    fn refuses_to_replace_an_existing_note_during_rename() {
        let vault = tempdir().expect("create fixture vault");
        let original = "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\n---\n# Original\n";
        let occupied = "---\nid: 01JZQ91T3AA6F2M9V3C5T7X1BZ\n---\n# Occupied\n";
        fs::write(vault.path().join("Original.md"), original).expect("write original");
        fs::write(vault.path().join("Occupied.md"), occupied).expect("write occupied");

        let error = rename_markdown_file(
            vault.path(),
            "Original.md",
            &vault.path().join("Occupied.md"),
            None,
        )
        .expect_err("reject occupied destination");

        assert_eq!(error.code, "vaultFileExists");
        assert_eq!(
            fs::read_to_string(vault.path().join("Original.md")).expect("read original"),
            original
        );
        assert_eq!(
            fs::read_to_string(vault.path().join("Occupied.md")).expect("read occupied"),
            occupied
        );
    }

    #[test]
    fn blocks_rename_when_any_markdown_source_is_unreadable() {
        let vault = tempdir().expect("create fixture vault");
        let original = "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\n---\n# Original\n";
        fs::write(vault.path().join("Original.md"), original).expect("write original");
        fs::write(vault.path().join("Binary.md"), [0xff, 0xfe]).expect("write binary note");

        let error = rename_markdown_file(
            vault.path(),
            "Original.md",
            &vault.path().join("Renamed.md"),
            None,
        )
        .expect_err("block incomplete vault scan");

        assert_eq!(error.code, "vaultRenameConflict");
        assert_eq!(
            fs::read_to_string(vault.path().join("Original.md")).expect("read original"),
            original
        );
        assert!(!vault.path().join("Renamed.md").exists());
        assert!(!vault.path().join(RENAME_JOURNAL_NAME).exists());
    }

    #[test]
    fn restores_every_file_when_a_rename_is_interrupted() {
        let vault = tempdir().expect("create fixture vault");
        let target_content = "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\n---\n# Note\n";
        let reference_content = "---\nid: 01JZQ91T3AA6F2M9V3C5T7X1BZ\n---\n[[Old Name]]\n";
        fs::write(vault.path().join("Old Name.md"), target_content).expect("write target note");
        fs::write(vault.path().join("Reference.md"), reference_content)
            .expect("write reference note");

        let error = rename_markdown_file(
            vault.path(),
            "Old Name.md",
            &vault.path().join("New Name.md"),
            Some(1),
        )
        .expect_err("interrupt rename");

        assert_eq!(error.code, "vaultStateError");
        assert_eq!(
            fs::read_to_string(vault.path().join("Old Name.md")).expect("read restored target"),
            target_content
        );
        assert_eq!(
            fs::read_to_string(vault.path().join("Reference.md")).expect("read restored reference"),
            reference_content
        );
        assert!(!vault.path().join("New Name.md").exists());
        assert!(fs::read_dir(vault.path())
            .expect("read vault")
            .all(|entry| !entry
                .expect("read vault entry")
                .file_name()
                .to_string_lossy()
                .contains(".anchored-")));
    }

    #[test]
    fn recovers_backups_after_a_crash_during_installation() {
        let vault = tempdir().expect("create fixture vault");
        let old = vault.path().join("Old.md");
        let new = vault.path().join("New.md");
        let reference = vault.path().join("Reference.md");
        let old_backup = vault.path().join(".Old.md.anchored-test.backup");
        let reference_backup = vault.path().join(".Reference.md.anchored-test.backup");
        let new_temporary = vault.path().join(".New.md.anchored-test.tmp");
        let reference_temporary = vault.path().join(".Reference.md.anchored-test.tmp");
        fs::write(&old, "original target").expect("write target");
        fs::write(&reference, "[[Old]]").expect("write reference");
        fs::write(&new_temporary, "renamed target").expect("write target temporary");
        fs::write(&reference_temporary, "[[New]]").expect("write reference temporary");
        fs::rename(&old, &old_backup).expect("back up target");
        fs::rename(&reference, &reference_backup).expect("back up reference");
        fs::rename(&new_temporary, &new).expect("partially install target");
        let journal = RenameJournal {
            entries: vec![
                RenameJournalEntry {
                    backup_path: ".Old.md.anchored-test.backup".to_owned(),
                    destination_path: "New.md".to_owned(),
                    original_path: "Old.md".to_owned(),
                    temporary_path: ".New.md.anchored-test.tmp".to_owned(),
                },
                RenameJournalEntry {
                    backup_path: ".Reference.md.anchored-test.backup".to_owned(),
                    destination_path: "Reference.md".to_owned(),
                    original_path: "Reference.md".to_owned(),
                    temporary_path: ".Reference.md.anchored-test.tmp".to_owned(),
                },
            ],
            phase: RenameJournalPhase::BackedUp,
            version: 1,
        };
        write_rename_journal(&vault.path().join(RENAME_JOURNAL_NAME), &journal)
            .expect("write recovery journal");

        recover_rename_transaction(vault.path()).expect("recover rename");

        assert_eq!(
            fs::read_to_string(old).expect("read target"),
            "original target"
        );
        assert_eq!(
            fs::read_to_string(reference).expect("read reference"),
            "[[Old]]"
        );
        assert!(!new.exists());
        assert!(!reference_temporary.exists());
        assert!(!vault.path().join(RENAME_JOURNAL_NAME).exists());
    }

    #[test]
    fn finishes_cleanup_after_a_committed_rename_crashes() {
        let vault = tempdir().expect("create fixture vault");
        fs::write(vault.path().join("New.md"), "renamed target").expect("write target");
        fs::write(vault.path().join("Reference.md"), "[[New]]").expect("write reference");
        fs::write(
            vault.path().join(".Old.md.anchored-test.backup"),
            "original target",
        )
        .expect("write target backup");
        fs::write(
            vault.path().join(".Reference.md.anchored-test.backup"),
            "[[Old]]",
        )
        .expect("write reference backup");
        let journal = RenameJournal {
            entries: vec![
                RenameJournalEntry {
                    backup_path: ".Old.md.anchored-test.backup".to_owned(),
                    destination_path: "New.md".to_owned(),
                    original_path: "Old.md".to_owned(),
                    temporary_path: ".New.md.anchored-test.tmp".to_owned(),
                },
                RenameJournalEntry {
                    backup_path: ".Reference.md.anchored-test.backup".to_owned(),
                    destination_path: "Reference.md".to_owned(),
                    original_path: "Reference.md".to_owned(),
                    temporary_path: ".Reference.md.anchored-test.tmp".to_owned(),
                },
            ],
            phase: RenameJournalPhase::Installed,
            version: 1,
        };
        write_rename_journal(&vault.path().join(RENAME_JOURNAL_NAME), &journal)
            .expect("write recovery journal");

        recover_rename_transaction(vault.path()).expect("finish rename cleanup");

        assert_eq!(
            fs::read_to_string(vault.path().join("New.md")).expect("read renamed target"),
            "renamed target"
        );
        assert_eq!(
            fs::read_to_string(vault.path().join("Reference.md")).expect("read reference"),
            "[[New]]"
        );
        assert!(!vault.path().join(".Old.md.anchored-test.backup").exists());
        assert!(!vault
            .path()
            .join(".Reference.md.anchored-test.backup")
            .exists());
        assert!(!vault.path().join(RENAME_JOURNAL_NAME).exists());
    }

    #[test]
    fn refuses_to_rename_a_note_without_a_unique_identity() {
        let vault = tempdir().expect("create fixture vault");
        fs::write(vault.path().join("Legacy.md"), "# Legacy\n").expect("write legacy note");

        let error = rename_markdown_file(
            vault.path(),
            "Legacy.md",
            &vault.path().join("Renamed.md"),
            None,
        )
        .expect_err("reject unidentified note");

        assert_eq!(error.code, "identityConflict");
        assert!(vault.path().join("Legacy.md").exists());
        assert!(!vault.path().join("Renamed.md").exists());
    }

    #[test]
    fn rejects_traversal_and_non_markdown_paths() {
        let vault = tempdir().expect("create fixture vault");
        let outside = tempdir().expect("create outside fixture");
        fs::write(outside.path().join("Private.md"), "# Private").expect("write outside note");
        fs::write(vault.path().join("note.txt"), "not Markdown").expect("write text file");

        let traversal =
            read_markdown_file(vault.path(), "../Private.md").expect_err("reject traversal path");
        let non_markdown =
            read_markdown_file(vault.path(), "note.txt").expect_err("reject text file");

        assert_eq!(traversal.code, "invalidVaultFile");
        assert_eq!(non_markdown.code, "invalidVaultFile");
    }

    #[test]
    fn rejects_oversized_and_non_utf8_markdown() {
        let vault = tempdir().expect("create fixture vault");
        fs::write(
            vault.path().join("Large.md"),
            vec![b'a'; (MAX_MARKDOWN_FILE_BYTES + 1) as usize],
        )
        .expect("write oversized note");
        fs::write(vault.path().join("Binary.md"), [0xff, 0xfe]).expect("write invalid UTF-8 note");

        let oversized =
            read_markdown_file(vault.path(), "Large.md").expect_err("reject oversized note");
        let invalid_utf8 =
            read_markdown_file(vault.path(), "Binary.md").expect_err("reject invalid UTF-8 note");

        assert_eq!(oversized.code, "vaultFileTooLarge");
        assert_eq!(invalid_utf8.code, "invalidMarkdownEncoding");
    }

    #[cfg(unix)]
    #[test]
    fn skips_symlinks_instead_of_following_them() {
        use std::os::unix::fs::symlink;

        let vault = tempdir().expect("create fixture vault");
        let outside = tempdir().expect("create outside fixture");
        fs::write(outside.path().join("Private.md"), "# Private").expect("write outside note");
        symlink(outside.path(), vault.path().join("External")).expect("create symlink");

        let snapshot = scan_vault(vault.path()).expect("scan fixture vault");

        assert!(snapshot.files.is_empty());
        assert_eq!(snapshot.warnings.skipped_symlinks, 1);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_when_opening_markdown() {
        use std::os::unix::fs::symlink;

        let vault = tempdir().expect("create fixture vault");
        let outside = tempdir().expect("create outside fixture");
        fs::write(outside.path().join("Private.md"), "# Private").expect("write outside note");
        symlink(
            outside.path().join("Private.md"),
            vault.path().join("Linked.md"),
        )
        .expect("create file symlink");

        let error =
            read_markdown_file(vault.path(), "Linked.md").expect_err("reject symlinked note");

        assert_eq!(error.code, "invalidVaultFile");
    }
}
