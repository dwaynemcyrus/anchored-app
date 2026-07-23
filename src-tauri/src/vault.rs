use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    fs::OpenOptions,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, RwLock,
    },
};

#[cfg(test)]
use std::hash::{Hash, Hasher};

use chrono::{Local, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

use crate::continuity::{
    current_time_millis, ensure_no_hidden_descendants, ensure_vault_identity,
    forget_vault as forget_registered_vault, is_internal_component, is_internal_relative_path,
    is_trash_component, is_vault_trash_relative_path,
    list_remembered_vaults as load_remembered_vaults, list_trash_entries, move_folder_to_trash,
    move_note_to_trash, registry_path, remember_vault, remembered_vault_root,
    restore_folder_from_trash, restore_note_from_trash, RememberedVault, TrashEntry,
};
use crate::links::{plan_rename_link_rewrites_by_path, LinkNote, LinkSource};
use crate::metadata::{
    archive_note, archive_note_with_type, inspect_note_aliases, inspect_note_properties,
    inspect_wikilinks, normalize_front_matter_timestamps, restore_note, restore_note_with_type,
    split_note_source, stamp_note_created_at, stamp_note_updated_at, update_note_type,
};
use crate::watcher::VaultWatcher;

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
    metadata_cache: Arc<Mutex<VaultMetadataCache>>,
    rename_transaction: Mutex<()>,
    root: RwLock<Option<PathBuf>>,
    watcher: Mutex<Option<VaultWatcher>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFile {
    pub aliases: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    pub modified_millis: u64,
    pub is_recovery_copy: bool,
    #[serde(skip)]
    signature: Option<FileSignature>,
    pub outgoing_links: Vec<String>,
    pub name: String,
    pub parent: String,
    pub relative_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultAsset {
    pub modified_millis: u64,
    pub name: String,
    pub parent: String,
    pub relative_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultWarnings {
    pub skipped_non_utf8_paths: usize,
    pub skipped_symlinks: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSnapshot {
    pub assets: Vec<VaultAsset>,
    pub files: Vec<VaultFile>,
    pub folders: Vec<String>,
    pub name: String,
    pub vault_id: String,
    pub warnings: VaultWarnings,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimestampMigrationTarget {
    pub expected_modified_millis: u64,
    pub expected_size_bytes: u64,
    pub relative_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimestampMigrationChange {
    pub after: String,
    pub before: String,
    pub line: usize,
    pub property: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimestampMigrationCandidate {
    pub changes: Vec<TimestampMigrationChange>,
    pub expected_modified_millis: u64,
    pub expected_size_bytes: u64,
    pub relative_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimestampMigrationIssue {
    pub line: Option<usize>,
    pub message: String,
    pub property: Option<String>,
    pub relative_path: String,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimestampMigrationPreview {
    pub candidates: Vec<TimestampMigrationCandidate>,
    pub changed_values: usize,
    pub issues: Vec<TimestampMigrationIssue>,
    pub scanned_files: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimestampMigrationOutcome {
    pub changed_values: usize,
    pub message: Option<String>,
    pub relative_path: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimestampMigrationResult {
    pub outcomes: Vec<TimestampMigrationOutcome>,
    pub snapshot: VaultSnapshot,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
struct FileSignature {
    size_bytes: u64,
    modified_millis: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CachedNoteMetadata {
    aliases: Vec<String>,
    archived_at: Option<String>,
    created_at: Option<String>,
    note_type: Option<String>,
    outgoing_links: Vec<String>,
    signature: FileSignature,
    status: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Default)]
struct VaultMetadataCache {
    entries: HashMap<String, CachedNoteMetadata>,
    last_refresh_reads: usize,
    vault_id: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedVaultIndex {
    entries: BTreeMap<String, CachedNoteMetadata>,
    vault_id: String,
    version: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultDocument {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
    pub content: String,
    pub is_recovery_copy: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    pub modified_millis: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note_type: Option<String>,
    pub relative_path: String,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_files: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_links: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchpadDocument {
    pub body: String,
    pub persisted_content: String,
    pub relative_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchpadLinkCandidate {
    pub label: String,
    pub target: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchpadListItem {
    pub created_at: Option<String>,
    pub modified_millis: u64,
    pub name: String,
    pub relative_path: String,
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
pub struct TrashMutationResult {
    pub entry: TrashEntry,
    pub snapshot: VaultSnapshot,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultError {
    pub(crate) code: &'static str,
    pub(crate) message: String,
}

impl VaultError {
    pub(crate) fn io(context: &str, error: std::io::Error) -> Self {
        Self {
            code: "vaultIoError",
            message: format!("{context}: {error}"),
        }
    }

    pub(crate) fn invalid(message: impl Into<String>) -> Self {
        Self {
            code: "invalidVault",
            message: message.into(),
        }
    }

    pub(crate) fn state(message: impl Into<String>) -> Self {
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

    pub(crate) fn invalid_file(message: impl Into<String>) -> Self {
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

    fn archived_read_only() -> Self {
        Self {
            code: "archivedReadOnly",
            message: "Archived notes are read-only. Restore this note before editing it."
                .to_owned(),
        }
    }

    fn lifecycle(message: impl Into<String>) -> Self {
        Self {
            code: "unsafeLifecycleMetadata",
            message: message.into(),
        }
    }

    pub(crate) fn file_exists() -> Self {
        Self {
            code: "vaultFileExists",
            message: "A file or folder already exists at that location. Choose a different name."
                .to_owned(),
        }
    }

    fn rename_conflict(message: impl Into<String>) -> Self {
        Self {
            code: "vaultRenameConflict",
            message: message.into(),
        }
    }
}

fn is_recovery_copy_name(name: &str) -> bool {
    name.contains(" (Anchored conflict ") && name.ends_with(".md")
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
    activate_vault(&app, &state, root).map(Some)
}

#[tauri::command]
pub async fn create_vault(
    app: AppHandle,
    state: State<'_, VaultState>,
    name: String,
) -> Result<Option<VaultSnapshot>, VaultError> {
    let selected = app
        .dialog()
        .file()
        .set_title("Choose where to create this vault")
        .blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let parent = selected
        .into_path()
        .map_err(|error| VaultError::invalid(format!("Unsupported vault path: {error}")))?;
    let root = create_named_vault(&parent, &name)?;
    activate_vault(&app, &state, root).map(Some)
}

#[tauri::command]
pub async fn create_vault_folder(
    app: AppHandle,
    state: State<'_, VaultState>,
    name: String,
    parent_path: Option<String>,
) -> Result<VaultSnapshot, VaultError> {
    let _rename_guard = state
        .rename_transaction
        .lock()
        .map_err(|_| VaultError::state("The folder creation lock could not be acquired."))?;
    let root = selected_vault_root(&state, "creating a folder")?;
    recover_rename_transaction(&root)?;
    create_folder(&root, parent_path.as_deref(), &name)?;
    build_vault_snapshot(&app, &root, state.metadata_cache.as_ref())
}

#[tauri::command]
pub async fn rename_vault_folder(
    app: AppHandle,
    state: State<'_, VaultState>,
    folder_path: String,
    name: String,
) -> Result<VaultSnapshot, VaultError> {
    let _rename_guard = state
        .rename_transaction
        .lock()
        .map_err(|_| VaultError::state("The folder rename lock could not be acquired."))?;
    let root = selected_vault_root(&state, "renaming a folder")?;
    recover_rename_transaction(&root)?;
    rename_folder(&root, &folder_path, &name)?;
    build_vault_snapshot(&app, &root, state.metadata_cache.as_ref())
}

#[tauri::command]
pub async fn move_vault_folder(
    app: AppHandle,
    state: State<'_, VaultState>,
    folder_path: String,
    destination_folder: String,
) -> Result<VaultSnapshot, VaultError> {
    let _rename_guard = state
        .rename_transaction
        .lock()
        .map_err(|_| VaultError::state("The folder move lock could not be acquired."))?;
    let root = selected_vault_root(&state, "moving a folder")?;
    recover_rename_transaction(&root)?;
    move_folder(&root, &folder_path, &destination_folder)?;
    build_vault_snapshot(&app, &root, state.metadata_cache.as_ref())
}

#[tauri::command]
pub async fn delete_vault_folder(
    app: AppHandle,
    state: State<'_, VaultState>,
    folder_path: String,
) -> Result<VaultSnapshot, VaultError> {
    let _rename_guard = state
        .rename_transaction
        .lock()
        .map_err(|_| VaultError::state("The folder delete lock could not be acquired."))?;
    let root = selected_vault_root(&state, "deleting a folder")?;
    recover_rename_transaction(&root)?;
    delete_empty_folder(&root, &folder_path)?;
    build_vault_snapshot(&app, &root, state.metadata_cache.as_ref())
}

#[tauri::command]
pub async fn move_vault_folder_to_trash(
    app: AppHandle,
    state: State<'_, VaultState>,
    folder_path: String,
    confirmation: String,
) -> Result<TrashMutationResult, VaultError> {
    if confirmation != "delete folder" {
        return Err(VaultError::invalid(
            "Type delete folder to confirm moving this folder to Trash.",
        ));
    }
    let _rename_guard = state
        .rename_transaction
        .lock()
        .map_err(|_| VaultError::state("The folder delete lock could not be acquired."))?;
    let root = selected_vault_root(&state, "moving a folder to Trash")?;
    recover_rename_transaction(&root)?;
    let entry = move_folder_to_trash(&root, &folder_path, current_time_millis())?;
    let snapshot = build_vault_snapshot(&app, &root, state.metadata_cache.as_ref())?;
    Ok(TrashMutationResult { entry, snapshot })
}

#[tauri::command]
pub async fn list_remembered_vaults(app: AppHandle) -> Result<Vec<RememberedVault>, VaultError> {
    load_remembered_vaults(&registry_path(&app)?)
}

#[tauri::command]
pub async fn open_remembered_vault(
    app: AppHandle,
    state: State<'_, VaultState>,
    vault_id: String,
) -> Result<VaultSnapshot, VaultError> {
    let root = remembered_vault_root(&registry_path(&app)?, &vault_id)?;
    activate_vault(&app, &state, root)
}

#[tauri::command]
pub async fn open_development_vault(
    app: AppHandle,
    state: State<'_, VaultState>,
) -> Result<VaultSnapshot, VaultError> {
    let root = prepare_development_vault(&app)?;
    activate_vault(&app, &state, root)
}

#[tauri::command]
pub async fn forget_vault(
    app: AppHandle,
    vault_id: String,
) -> Result<Vec<RememberedVault>, VaultError> {
    forget_registered_vault(&registry_path(&app)?, &vault_id)
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
    let cache = Arc::clone(&state.metadata_cache);
    tauri::async_runtime::spawn_blocking(move || {
        build_vault_snapshot(&app, &root, cache.as_ref()).map(Some)
    })
    .await
    .map_err(|error| VaultError::state(format!("Vault refresh could not finish: {error}")))?
}

#[tauri::command]
pub async fn reconcile_vault_file_move(
    state: State<'_, VaultState>,
    old_relative_path: String,
    new_relative_path: String,
    update_type: bool,
) -> Result<VaultDocument, VaultError> {
    let _rename_guard = state
        .rename_transaction
        .lock()
        .map_err(|_| VaultError::state("The external move lock could not be acquired."))?;
    let root = selected_vault_root(&state, "reconciling an external Markdown move")?;
    recover_rename_transaction(&root)?;
    reconcile_external_markdown_move(&root, &old_relative_path, &new_relative_path, update_type)
}

#[tauri::command]
pub async fn preview_vault_timestamp_migration(
    state: State<'_, VaultState>,
) -> Result<TimestampMigrationPreview, VaultError> {
    let root = selected_vault_root(&state, "previewing timestamp migration")?;
    tauri::async_runtime::spawn_blocking(move || preview_timestamp_migration(&root))
        .await
        .map_err(|error| {
            VaultError::state(format!(
                "Timestamp migration preview could not finish: {error}"
            ))
        })?
}

#[tauri::command]
pub async fn apply_vault_timestamp_migration(
    app: AppHandle,
    state: State<'_, VaultState>,
    candidates: Vec<TimestampMigrationTarget>,
) -> Result<TimestampMigrationResult, VaultError> {
    let _rename_guard = state
        .rename_transaction
        .lock()
        .map_err(|_| VaultError::state("The timestamp migration lock could not be acquired."))?;
    let root = selected_vault_root(&state, "applying timestamp migration")?;
    let outcomes = apply_timestamp_migration(&root, &candidates)?;
    let snapshot = build_vault_snapshot(&app, &root, state.metadata_cache.as_ref())?;
    Ok(TimestampMigrationResult { outcomes, snapshot })
}

#[tauri::command]
pub async fn list_vault_trash(state: State<'_, VaultState>) -> Result<Vec<TrashEntry>, VaultError> {
    let root = selected_vault_root(&state, "viewing Trash")?;
    list_trash_entries(&root)
}

#[tauri::command]
pub async fn move_vault_file_to_trash(
    app: AppHandle,
    state: State<'_, VaultState>,
    relative_path: String,
) -> Result<TrashMutationResult, VaultError> {
    let _guard = state
        .rename_transaction
        .lock()
        .map_err(|_| VaultError::state("The vault file operation lock could not be acquired."))?;
    let root = selected_vault_root(&state, "moving a note to Trash")?;
    let entry = move_note_to_trash(&root, &relative_path, current_time_millis())?;
    let snapshot = build_vault_snapshot(&app, &root, state.metadata_cache.as_ref())?;
    Ok(TrashMutationResult { entry, snapshot })
}

#[tauri::command]
pub async fn restore_vault_file_from_trash(
    app: AppHandle,
    state: State<'_, VaultState>,
    trash_id: String,
) -> Result<TrashMutationResult, VaultError> {
    let _guard = state
        .rename_transaction
        .lock()
        .map_err(|_| VaultError::state("The vault file operation lock could not be acquired."))?;
    let root = selected_vault_root(&state, "restoring a note from Trash")?;
    let entry = restore_note_from_trash(&root, &trash_id)?;
    let snapshot = build_vault_snapshot(&app, &root, state.metadata_cache.as_ref())?;
    Ok(TrashMutationResult { entry, snapshot })
}

#[tauri::command]
pub async fn restore_vault_folder_from_trash(
    app: AppHandle,
    state: State<'_, VaultState>,
    trash_id: String,
) -> Result<TrashMutationResult, VaultError> {
    let _guard = state
        .rename_transaction
        .lock()
        .map_err(|_| VaultError::state("The vault file operation lock could not be acquired."))?;
    let root = selected_vault_root(&state, "restoring a folder from Trash")?;
    let entry = restore_folder_from_trash(&root, &trash_id)?;
    let snapshot = build_vault_snapshot(&app, &root, state.metadata_cache.as_ref())?;
    Ok(TrashMutationResult { entry, snapshot })
}

fn selected_vault_root(
    state: &State<'_, VaultState>,
    operation: &str,
) -> Result<PathBuf, VaultError> {
    state
        .root
        .read()
        .map_err(|_| VaultError::state("The selected vault state could not be read."))?
        .clone()
        .ok_or_else(|| VaultError::state(format!("Select a vault before {operation}.")))
}

#[cfg(test)]
fn vault_tree_signature(root: &Path) -> Result<u64, VaultError> {
    let root = canonical_vault_root(root)?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    let mut stack = vec![(root.clone(), 0_usize)];
    let mut visited_entries = 0_usize;

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
            if is_internal_component(&entry.file_name()) {
                continue;
            }
            if depth == 0 && is_trash_component(&entry.file_name()) {
                continue;
            }
            visited_entries += 1;
            if visited_entries > MAX_VAULT_ENTRIES {
                return Err(VaultError::too_large());
            }

            let file_type = entry
                .file_type()
                .map_err(|error| VaultError::io("A vault entry could not be inspected", error))?;
            if file_type.is_symlink() {
                continue;
            }

            let entry_path = entry.path();
            let relative = entry_path
                .strip_prefix(&root)
                .map_err(|_| VaultError::invalid("A vault path could not be inspected."))?;
            relative.to_string_lossy().hash(&mut hasher);
            if file_type.is_dir() {
                0_u8.hash(&mut hasher);
                stack.push((entry_path, depth + 1));
                continue;
            }
            if file_type.is_file() {
                1_u8.hash(&mut hasher);
                let metadata = fs::metadata(entry_path).map_err(|error| {
                    VaultError::io("A vault entry could not be inspected", error)
                })?;
                let signature = file_signature_from_metadata(&metadata);
                signature.hash(&mut hasher);
            }
        }
    }

    Ok(hasher.finish())
}

fn activate_vault(
    app: &AppHandle,
    state: &State<'_, VaultState>,
    root: PathBuf,
) -> Result<VaultSnapshot, VaultError> {
    let snapshot = build_vault_snapshot(app, &root, state.metadata_cache.as_ref())?;
    remember_vault(
        &registry_path(app)?,
        &root,
        &snapshot.vault_id,
        &snapshot.name,
        current_time_millis(),
    )?;
    let mut stored_root = state
        .root
        .write()
        .map_err(|_| VaultError::state("The selected vault state could not be updated."))?;
    *stored_root = Some(root);
    Ok(snapshot)
}

fn prepare_development_vault(app: &AppHandle) -> Result<PathBuf, VaultError> {
    #[cfg(debug_assertions)]
    {
        let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures/dev-vault");
        if !source.is_dir() {
            return Err(VaultError::state(
                "The development fixture vault is missing from the repository.",
            ));
        }

        let cache = app.path().app_cache_dir().map_err(|error| {
            VaultError::state(format!(
                "The development fixture location is unavailable: {error}"
            ))
        })?;
        fs::create_dir_all(&cache).map_err(|error| {
            VaultError::io("The development fixture cache could not be created", error)
        })?;
        let destination = cache.join("dev-vault");
        if let Ok(metadata) = fs::symlink_metadata(&destination) {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(VaultError::invalid(
                    "The development fixture cache is not a normal directory.",
                ));
            }
            fs::remove_dir_all(&destination).map_err(|error| {
                VaultError::io("The previous development fixture could not be reset", error)
            })?;
        }
        copy_development_fixture(&source, &destination)?;
        Ok(destination)
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = app;
        Err(VaultError::state(
            "The development fixture is available only in development builds.",
        ))
    }
}

#[cfg(debug_assertions)]
fn copy_development_fixture(source: &Path, destination: &Path) -> Result<(), VaultError> {
    fs::create_dir_all(destination)
        .map_err(|error| VaultError::io("The development fixture could not be created", error))?;
    for entry in fs::read_dir(source)
        .map_err(|error| VaultError::io("The development fixture could not be read", error))?
    {
        let entry = entry
            .map_err(|error| VaultError::io("The development fixture could not be read", error))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let file_type = entry.file_type().map_err(|error| {
            VaultError::io("The development fixture could not be inspected", error)
        })?;
        if file_type.is_symlink() {
            return Err(VaultError::invalid(
                "The development fixture cannot contain symlinks.",
            ));
        }
        if file_type.is_dir() {
            copy_development_fixture(&source_path, &destination_path)?;
        } else if file_type.is_file() {
            fs::copy(&source_path, &destination_path).map_err(|error| {
                VaultError::io("The development fixture file could not be copied", error)
            })?;
        }
    }
    Ok(())
}

fn preview_timestamp_migration(root: &Path) -> Result<TimestampMigrationPreview, VaultError> {
    let root = canonical_vault_root(root)?;
    let snapshot = scan_vault(&root)?;
    let mut candidates = Vec::new();
    let mut changed_values = 0;
    let mut issues = Vec::new();
    let mut scanned_files = 0;

    for file in snapshot.files {
        if file.is_recovery_copy {
            continue;
        }
        scanned_files += 1;
        let path = match resolve_vault_markdown_file(&root, &file.relative_path) {
            Ok(path) => path,
            Err(error) => {
                issues.push(timestamp_migration_issue(
                    &file.relative_path,
                    None,
                    None,
                    error.message,
                    None,
                ));
                continue;
            }
        };
        let metadata = match fs::metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) => {
                issues.push(timestamp_migration_issue(
                    &file.relative_path,
                    None,
                    None,
                    "A Markdown file could not be inspected.".to_owned(),
                    Some(error.to_string()),
                ));
                continue;
            }
        };
        if metadata.len() > MAX_MARKDOWN_FILE_BYTES {
            issues.push(timestamp_migration_issue(
                &file.relative_path,
                None,
                None,
                "The Markdown file is too large to migrate safely.".to_owned(),
                None,
            ));
            continue;
        }
        let content = match fs::read(&path)
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
        {
            Some(content) => content,
            None => {
                issues.push(timestamp_migration_issue(
                    &file.relative_path,
                    None,
                    None,
                    "The Markdown file is not valid UTF-8.".to_owned(),
                    None,
                ));
                continue;
            }
        };
        let normalization = match normalize_front_matter_timestamps(&content) {
            Ok(normalization) => normalization,
            Err(error) => {
                issues.push(timestamp_migration_issue(
                    &file.relative_path,
                    None,
                    None,
                    "Front matter could not be inspected safely.".to_owned(),
                    Some(error.to_string()),
                ));
                continue;
            }
        };
        issues.extend(
            normalization
                .skips
                .into_iter()
                .map(|skip| TimestampMigrationIssue {
                    line: Some(skip.line),
                    message: skip.reason,
                    property: Some(skip.property),
                    relative_path: file.relative_path.clone(),
                    value: Some(skip.value),
                }),
        );
        if normalization.changes.is_empty() {
            continue;
        }
        changed_values += normalization.changes.len();
        candidates.push(TimestampMigrationCandidate {
            changes: normalization
                .changes
                .into_iter()
                .map(|change| TimestampMigrationChange {
                    after: change.after,
                    before: change.before,
                    line: change.line,
                    property: change.property,
                })
                .collect(),
            expected_modified_millis: file.modified_millis,
            expected_size_bytes: metadata.len(),
            relative_path: file.relative_path,
        });
    }

    Ok(TimestampMigrationPreview {
        candidates,
        changed_values,
        issues,
        scanned_files,
    })
}

fn apply_timestamp_migration(
    root: &Path,
    candidates: &[TimestampMigrationTarget],
) -> Result<Vec<TimestampMigrationOutcome>, VaultError> {
    let root = canonical_vault_root(root)?;
    let mut outcomes = Vec::with_capacity(candidates.len());

    for candidate in candidates {
        let path = match resolve_vault_markdown_file(&root, &candidate.relative_path) {
            Ok(path) => path,
            Err(error) => {
                outcomes.push(timestamp_migration_outcome(
                    &candidate.relative_path,
                    "error",
                    0,
                    Some(error.message),
                ));
                continue;
            }
        };
        let metadata = match fs::metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) => {
                outcomes.push(timestamp_migration_outcome(
                    &candidate.relative_path,
                    "error",
                    0,
                    Some(format!("A Markdown file could not be inspected: {error}")),
                ));
                continue;
            }
        };
        let signature = file_signature_from_metadata(&metadata);
        if signature.size_bytes != candidate.expected_size_bytes
            || signature.modified_millis != candidate.expected_modified_millis
        {
            outcomes.push(timestamp_migration_outcome(
                &candidate.relative_path,
                "conflict",
                0,
                Some("The file changed after the migration preview.".to_owned()),
            ));
            continue;
        }
        let content = match fs::read(&path)
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
        {
            Some(content) => content,
            None => {
                outcomes.push(timestamp_migration_outcome(
                    &candidate.relative_path,
                    "error",
                    0,
                    Some("The Markdown file is not valid UTF-8.".to_owned()),
                ));
                continue;
            }
        };
        let normalization = match normalize_front_matter_timestamps(&content) {
            Ok(normalization) => normalization,
            Err(error) => {
                outcomes.push(timestamp_migration_outcome(
                    &candidate.relative_path,
                    "error",
                    0,
                    Some(format!(
                        "Front matter could not be normalized safely: {error}"
                    )),
                ));
                continue;
            }
        };
        if normalization.changes.is_empty() {
            outcomes.push(timestamp_migration_outcome(
                &candidate.relative_path,
                "unchanged",
                0,
                Some("No eligible timestamp values remain to normalize.".to_owned()),
            ));
            continue;
        }

        let temporary_path = match temporary_sibling_path(&path) {
            Ok(path) => path,
            Err(error) => {
                outcomes.push(timestamp_migration_outcome(
                    &candidate.relative_path,
                    "error",
                    0,
                    Some(error.message),
                ));
                continue;
            }
        };
        if let Err(error) =
            write_atomically(&temporary_path, &path, &normalization.content, &metadata)
        {
            let _ = fs::remove_file(&temporary_path);
            outcomes.push(timestamp_migration_outcome(
                &candidate.relative_path,
                "error",
                0,
                Some(error.message),
            ));
            continue;
        }
        outcomes.push(timestamp_migration_outcome(
            &candidate.relative_path,
            "applied",
            normalization.changes.len(),
            None,
        ));
    }

    Ok(outcomes)
}

fn timestamp_migration_issue(
    relative_path: &str,
    line: Option<usize>,
    property: Option<String>,
    message: String,
    value: Option<String>,
) -> TimestampMigrationIssue {
    TimestampMigrationIssue {
        line,
        message,
        property,
        relative_path: relative_path.to_owned(),
        value,
    }
}

fn timestamp_migration_outcome(
    relative_path: &str,
    status: &str,
    changed_values: usize,
    message: Option<String>,
) -> TimestampMigrationOutcome {
    TimestampMigrationOutcome {
        changed_values,
        message,
        relative_path: relative_path.to_owned(),
        status: status.to_owned(),
    }
}

fn build_vault_snapshot(
    app: &AppHandle,
    root: &Path,
    cache: &Mutex<VaultMetadataCache>,
) -> Result<VaultSnapshot, VaultError> {
    let vault_id = ensure_vault_identity(root)?;
    recover_rename_transaction(root)?;
    let mut snapshot = scan_vault(root)?;
    prepare_metadata_cache(app, &vault_id, cache)?;
    snapshot.vault_id = vault_id;
    enrich_vault_metadata_cached(root, &mut snapshot.files, cache)?;
    persist_metadata_cache(app, cache)?;
    Ok(snapshot)
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
pub async fn watch_vault_file(
    state: State<'_, VaultState>,
    relative_path: String,
) -> Result<(), VaultError> {
    let root = selected_vault_root(&state, "watching a Markdown file")?;
    let _ = resolve_vault_markdown_file(&root, &relative_path)?;
    Ok(())
}

#[tauri::command]
pub async fn stop_vault_file_watch(state: State<'_, VaultState>) -> Result<(), VaultError> {
    let _ = state;
    Ok(())
}

#[tauri::command]
pub async fn watch_vault_tree(
    app: AppHandle,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    let root = selected_vault_root(&state, "watching the vault")?;
    let vault_id = ensure_vault_identity(&root)?;

    let watcher = VaultWatcher::start(app, root, vault_id).map_err(VaultError::state)?;
    let mut current = state
        .watcher
        .lock()
        .map_err(|_| VaultError::state("The vault watcher state could not be updated."))?;
    *current = Some(watcher);

    Ok(())
}

#[tauri::command]
pub async fn stop_vault_tree_watch(state: State<'_, VaultState>) -> Result<(), VaultError> {
    let mut current = state
        .watcher
        .lock()
        .map_err(|_| VaultError::state("The vault watcher state could not be updated."))?;
    current.take();
    Ok(())
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
pub async fn create_vault_conflict_copy(
    state: State<'_, VaultState>,
    relative_path: String,
    content: String,
) -> Result<VaultDocument, VaultError> {
    let root = selected_vault_root(&state, "creating a conflict copy")?;
    create_conflict_copy(&root, &relative_path, &content)
}

#[tauri::command]
pub async fn archive_vault_file(
    state: State<'_, VaultState>,
    relative_path: String,
    expected_content: String,
    note_type: Option<String>,
    update_type: Option<bool>,
) -> Result<VaultDocument, VaultError> {
    let _rename_guard = state
        .rename_transaction
        .lock()
        .map_err(|_| VaultError::state("The note lifecycle lock could not be acquired."))?;
    let root = selected_vault_root(&state, "archiving a Markdown file")?;
    transition_markdown_lifecycle(
        &root,
        &relative_path,
        &expected_content,
        LifecycleTransition::Archive {
            note_type,
            update_type: update_type.unwrap_or(false),
        },
    )
}

#[tauri::command]
pub async fn restore_archived_vault_file(
    state: State<'_, VaultState>,
    relative_path: String,
    expected_content: String,
    destination_status: String,
    note_type: Option<String>,
    update_type: Option<bool>,
) -> Result<VaultDocument, VaultError> {
    let _rename_guard = state
        .rename_transaction
        .lock()
        .map_err(|_| VaultError::state("The note lifecycle lock could not be acquired."))?;
    let root = selected_vault_root(&state, "restoring an archived Markdown file")?;
    transition_markdown_lifecycle(
        &root,
        &relative_path,
        &expected_content,
        LifecycleTransition::Restore {
            destination_status,
            note_type,
            update_type: update_type.unwrap_or(false),
        },
    )
}

#[tauri::command]
pub async fn move_vault_file_to_workbench(
    state: State<'_, VaultState>,
    relative_path: String,
    expected_content: String,
    note_type: Option<String>,
) -> Result<VaultDocument, VaultError> {
    let _rename_guard = state
        .rename_transaction
        .lock()
        .map_err(|_| VaultError::state("The note lifecycle lock could not be acquired."))?;
    let root = selected_vault_root(&state, "moving a Markdown file to Workbench")?;
    transition_markdown_lifecycle(
        &root,
        &relative_path,
        &expected_content,
        LifecycleTransition::Workbench { note_type },
    )
}

#[tauri::command]
pub async fn open_scratchpad(
    app: AppHandle,
    state: State<'_, VaultState>,
    mode: String,
) -> Result<(), VaultError> {
    if !matches!(mode.as_str(), "new" | "previous" | "list") {
        return Err(VaultError::invalid_file("Unsupported Scratchpad mode."));
    }
    selected_vault_root(&state, "opening Scratchpad")?;
    if let Some(window) = app.get_webview_window("scratchpad") {
        window
            .show()
            .map_err(|error| VaultError::state(format!("Scratchpad could not open: {error}")))?;
        window
            .set_focus()
            .map_err(|error| VaultError::state(format!("Scratchpad could not focus: {error}")))?;
        app.emit_to("scratchpad", "scratchpad-mode", &mode)
            .map_err(|error| VaultError::state(format!("Scratchpad could not reset: {error}")))?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        "scratchpad",
        WebviewUrl::App(format!("index.html?scratchpad=1&mode={mode}").into()),
    )
    .title("Anchored Scratchpad")
    .inner_size(520.0, 360.0)
    .min_inner_size(380.0, 240.0)
    .always_on_top(true)
    .center()
    .build()
    .map_err(|error| VaultError::state(format!("Scratchpad could not open: {error}")))?;
    Ok(())
}

#[tauri::command]
pub async fn create_scratchpad_note(
    state: State<'_, VaultState>,
    body: String,
) -> Result<ScratchpadDocument, VaultError> {
    let root = selected_vault_root(&state, "creating a Scratchpad note")?;
    let timestamp = Utc::now().format("%Y-%m-%d %H%M%S").to_string();
    create_scratchpad_markdown_file(&root, &body, &timestamp)
}

fn create_scratchpad_markdown_file(
    root: &Path,
    body: &str,
    filename_timestamp: &str,
) -> Result<ScratchpadDocument, VaultError> {
    if body.trim().is_empty() {
        return Err(VaultError::invalid_file(
            "Scratchpad does not create blank notes.",
        ));
    }
    let source = format!("---\ntype: scratchpad\nstatus: inbox\n---\n{body}");
    let inbox = lifecycle_destination_folder(root, Some("inbox"), None)?;
    let parent = resolve_vault_directory(root, &inbox)?;
    for count in 1..=10_000 {
        let suffix = if count == 1 {
            String::new()
        } else {
            format!(" {count}")
        };
        let destination = parent.join(format!("Scratchpad {filename_timestamp}{suffix}.md"));
        match create_markdown_file(root, &destination, &source) {
            Ok(document) => return scratchpad_document(document),
            Err(error) if error.code == "vaultFileExists" => continue,
            Err(error) => return Err(error),
        }
    }
    Err(VaultError::state(
        "Anchored could not find an available Scratchpad filename.",
    ))
}

#[tauri::command]
pub async fn save_scratchpad_note(
    state: State<'_, VaultState>,
    relative_path: String,
    body: String,
    expected_content: String,
) -> Result<ScratchpadDocument, VaultError> {
    let root = selected_vault_root(&state, "saving a Scratchpad note")?;
    save_scratchpad_markdown_file(&root, &relative_path, &body, &expected_content)
}

fn save_scratchpad_markdown_file(
    root: &Path,
    relative_path: &str,
    body: &str,
    expected_content: &str,
) -> Result<ScratchpadDocument, VaultError> {
    let properties = inspect_note_properties(expected_content);
    if properties.note_type.as_deref() != Some("scratchpad")
        || !matches!(properties.status.as_deref(), None | Some("inbox"))
    {
        return Err(VaultError::invalid_file(
            "Only editable Scratchpad notes can be saved here.",
        ));
    }
    let (prefix, _) = split_note_source(expected_content).ok_or_else(|| {
        VaultError::lifecycle("Scratchpad front matter could not be read safely.")
    })?;
    let updated = format!("{prefix}{body}");
    scratchpad_document(save_markdown_file(
        root,
        relative_path,
        &updated,
        expected_content,
    )?)
}

#[tauri::command]
pub async fn latest_scratchpad_note(
    app: AppHandle,
    state: State<'_, VaultState>,
) -> Result<Option<ScratchpadDocument>, VaultError> {
    let root = selected_vault_root(&state, "opening the previous Scratchpad note")?;
    let snapshot = build_vault_snapshot(&app, &root, state.metadata_cache.as_ref())?;
    let latest = snapshot
        .files
        .iter()
        .filter(|file| {
            file.note_type.as_deref() == Some("scratchpad")
                && matches!(file.status.as_deref(), None | Some("inbox"))
        })
        .max_by(|left, right| {
            left.modified_millis
                .cmp(&right.modified_millis)
                .then_with(|| left.created_at.cmp(&right.created_at))
                .then_with(|| {
                    scratchpad_filename_sequence(&left.name)
                        .cmp(&scratchpad_filename_sequence(&right.name))
                })
        });
    latest
        .map(|file| read_markdown_file(&root, &file.relative_path).and_then(scratchpad_document))
        .transpose()
}

#[tauri::command]
pub async fn list_scratchpad_notes(
    app: AppHandle,
    state: State<'_, VaultState>,
) -> Result<Vec<ScratchpadListItem>, VaultError> {
    let root = selected_vault_root(&state, "listing Scratchpad notes")?;
    let snapshot = build_vault_snapshot(&app, &root, state.metadata_cache.as_ref())?;
    let mut items = snapshot
        .files
        .into_iter()
        .filter(|file| {
            file.note_type.as_deref() == Some("scratchpad")
                && matches!(file.status.as_deref(), None | Some("inbox"))
        })
        .map(|file| ScratchpadListItem {
            created_at: file.created_at,
            modified_millis: file.modified_millis,
            name: file.name,
            relative_path: file.relative_path,
        })
        .collect::<Vec<_>>();
    items.sort_by(|left, right| {
        right
            .modified_millis
            .cmp(&left.modified_millis)
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });
    Ok(items)
}

#[tauri::command]
pub async fn read_scratchpad_note(
    state: State<'_, VaultState>,
    relative_path: String,
) -> Result<ScratchpadDocument, VaultError> {
    let root = selected_vault_root(&state, "opening a Scratchpad note")?;
    let document = read_markdown_file(&root, &relative_path)?;
    let properties = inspect_note_properties(&document.content);
    if properties.note_type.as_deref() != Some("scratchpad")
        || !matches!(properties.status.as_deref(), None | Some("inbox"))
    {
        return Err(VaultError::invalid_file(
            "Only active Inbox Scratchpad notes can open here.",
        ));
    }
    scratchpad_document(document)
}

#[tauri::command]
pub async fn scratchpad_link_candidates(
    app: AppHandle,
    state: State<'_, VaultState>,
) -> Result<Vec<ScratchpadLinkCandidate>, VaultError> {
    let root = selected_vault_root(&state, "loading Scratchpad links")?;
    let snapshot = build_vault_snapshot(&app, &root, state.metadata_cache.as_ref())?;
    Ok(snapshot
        .files
        .into_iter()
        .filter(|file| file.status.as_deref() != Some("archived"))
        .map(|file| ScratchpadLinkCandidate {
            label: file.name.trim_end_matches(".md").to_owned(),
            target: file.relative_path.trim_end_matches(".md").to_owned(),
        })
        .collect())
}

fn scratchpad_document(document: VaultDocument) -> Result<ScratchpadDocument, VaultError> {
    let (_, body) = split_note_source(&document.content).ok_or_else(|| {
        VaultError::lifecycle("Scratchpad front matter could not be read safely.")
    })?;
    Ok(ScratchpadDocument {
        body: body.to_owned(),
        persisted_content: document.content,
        relative_path: document.relative_path,
    })
}

fn scratchpad_filename_sequence(name: &str) -> u32 {
    name.strip_suffix(".md")
        .and_then(|stem| stem.rsplit_once(' '))
        .and_then(|(prefix, suffix)| {
            let has_timestamp = prefix.rsplit_once(' ').is_some_and(|(_, time)| {
                time.len() == 6 && time.bytes().all(|byte| byte.is_ascii_digit())
            });
            has_timestamp.then(|| suffix.parse().ok()).flatten()
        })
        .unwrap_or(1)
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
pub async fn create_inbox_vault_file(
    state: State<'_, VaultState>,
    name: String,
    content: String,
) -> Result<VaultDocument, VaultError> {
    let root = selected_vault_root(&state, "creating an Inbox Markdown file")?;
    create_inbox_markdown_file(&root, &name, &content)
}

#[tauri::command]
pub async fn create_untitled_vault_file(
    state: State<'_, VaultState>,
    content: String,
    parent_path: Option<String>,
) -> Result<VaultDocument, VaultError> {
    let root = state
        .root
        .read()
        .map_err(|_| VaultError::state("The selected vault state could not be read."))?
        .clone()
        .ok_or_else(|| VaultError::state("Select a vault before creating a Markdown file."))?;

    create_untitled_markdown_file(&root, parent_path.as_deref(), &content)
}

#[tauri::command]
pub async fn move_vault_file_to_folder(
    state: State<'_, VaultState>,
    relative_path: String,
    destination_folder: String,
) -> Result<RenameOutcome, VaultError> {
    let _rename_guard = state
        .rename_transaction
        .lock()
        .map_err(|_| VaultError::state("The note move lock could not be acquired."))?;
    let root = selected_vault_root(&state, "moving a Markdown file")?;
    recover_rename_transaction(&root)?;
    move_markdown_file_to_folder(&root, &relative_path, &destination_folder)
}

fn create_untitled_markdown_file(
    root: &Path,
    parent_path: Option<&str>,
    content: &str,
) -> Result<VaultDocument, VaultError> {
    let parent = match parent_path {
        Some(path) => resolve_vault_directory(root, path)?,
        None => {
            let inbox = lifecycle_destination_folder(root, Some("inbox"), None)?;
            resolve_vault_directory(root, &inbox)?
        }
    };
    for count in 1..=10_000 {
        let name = if count == 1 {
            "Untitled.md".to_owned()
        } else {
            format!("Untitled {count}.md")
        };
        let destination = parent.join(name);
        match create_markdown_file(root, &destination, content) {
            Ok(document) => return Ok(document),
            Err(error) if error.code == "vaultFileExists" => continue,
            Err(error) => return Err(error),
        }
    }

    Err(VaultError::state(
        "Anchored could not find an available timestamp filename in this vault.",
    ))
}

fn create_inbox_markdown_file(
    root: &Path,
    name: &str,
    content: &str,
) -> Result<VaultDocument, VaultError> {
    let name = validate_inbox_note_name(name)?;
    let inbox = lifecycle_destination_folder(root, Some("inbox"), None)?;
    let parent = resolve_vault_directory(root, &inbox)?;
    create_markdown_file(root, &parent.join(format!("{name}.md")), content)
}

fn validate_inbox_note_name(name: &str) -> Result<String, VaultError> {
    let trimmed = name.trim();
    let stem = trimmed
        .strip_suffix(".md")
        .or_else(|| trimmed.strip_suffix(".MD"))
        .unwrap_or(trimmed)
        .trim();
    if stem.is_empty()
        || stem.starts_with('.')
        || stem.chars().any(|character| character.is_control())
        || stem.contains('/')
        || stem.contains('\\')
    {
        return Err(VaultError::invalid_file(
            "The new Inbox note name is not valid.",
        ));
    }
    let path = Path::new(stem);
    let mut components = path.components();
    if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
        return Err(VaultError::invalid_file(
            "The new Inbox note name is not valid.",
        ));
    }
    Ok(stem.to_owned())
}

fn move_markdown_file_to_folder(
    root: &Path,
    relative_path: &str,
    destination_folder: &str,
) -> Result<RenameOutcome, VaultError> {
    let destination_directory = resolve_vault_directory(root, destination_folder)?;
    let file_name = Path::new(relative_path).file_name().ok_or_else(|| {
        VaultError::invalid_file("Only relative Markdown file paths can be moved.")
    })?;
    let destination = destination_directory.join(file_name);
    rename_markdown_file(root, relative_path, &destination, None)
}

#[tauri::command]
pub async fn rename_vault_file(
    state: State<'_, VaultState>,
    name: String,
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
    let filename = validate_markdown_filename(&name)?;
    let parent_path = Path::new(&relative_path)
        .parent()
        .and_then(|path| path.to_str())
        .unwrap_or_default();
    let parent = resolve_vault_directory(&root, parent_path)?;
    let destination = parent.join(filename);

    rename_markdown_file(&root, &relative_path, &destination, None).map(Some)
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

fn validate_new_vault_name(name: &str) -> Result<&str, VaultError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(VaultError::invalid(
            "Enter a vault name before creating a vault.",
        ));
    }
    if trimmed.starts_with('.') {
        return Err(VaultError::invalid("Vault names cannot start with a dot."));
    }

    let path = Path::new(trimmed);
    let mut components = path.components();
    let Some(Component::Normal(component)) = components.next() else {
        return Err(VaultError::invalid(
            "Vault names must be a single folder name.",
        ));
    };
    if components.next().is_some() || is_internal_component(component) {
        return Err(VaultError::invalid(
            "Vault names must be a single folder name.",
        ));
    }

    Ok(trimmed)
}

fn create_named_vault(parent: &Path, name: &str) -> Result<PathBuf, VaultError> {
    let parent = canonical_vault_root(parent)?;
    let name = validate_new_vault_name(name)?;
    let destination = parent.join(name);

    match fs::symlink_metadata(&destination) {
        Ok(_) => return Err(VaultError::file_exists()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(VaultError::io(
                "The new vault destination could not be inspected",
                error,
            ))
        }
    }

    fs::create_dir(&destination)
        .map_err(|error| VaultError::io("The new vault folder could not be created", error))?;
    sync_directory(&parent)?;
    canonical_vault_root(&destination)
}

fn validate_folder_name(name: &str) -> Result<&str, VaultError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(VaultError::invalid(
            "Enter a folder name before continuing.",
        ));
    }
    if trimmed.starts_with('.') {
        return Err(VaultError::invalid("Folder names cannot start with a dot."));
    }

    let path = Path::new(trimmed);
    let mut components = path.components();
    let Some(Component::Normal(component)) = components.next() else {
        return Err(VaultError::invalid(
            "Folder names must be a single folder name.",
        ));
    };
    if components.next().is_some() || is_internal_component(component) {
        return Err(VaultError::invalid(
            "Folder names must be a single folder name.",
        ));
    }

    Ok(trimmed)
}

fn validate_markdown_filename(name: &str) -> Result<&str, VaultError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(VaultError::invalid(
            "Enter a filename before renaming this note.",
        ));
    }
    if trimmed.starts_with('.') {
        return Err(VaultError::invalid("Filenames cannot start with a dot."));
    }

    let path = Path::new(trimmed);
    let mut components = path.components();
    let Some(Component::Normal(component)) = components.next() else {
        return Err(VaultError::invalid(
            "Filenames must be a single Markdown filename.",
        ));
    };
    if components.next().is_some() || is_internal_component(component) || !is_markdown(path) {
        return Err(VaultError::invalid(
            "Filenames must be a single Markdown filename.",
        ));
    }

    Ok(trimmed)
}

fn resolve_vault_directory(root: &Path, relative_path: &str) -> Result<PathBuf, VaultError> {
    let root = canonical_vault_root(root)?;
    if relative_path.trim().is_empty() {
        return Ok(root);
    }

    let requested = Path::new(relative_path);
    if is_internal_relative_path(requested) || is_vault_trash_relative_path(requested) {
        return Err(VaultError::invalid_file(
            "The system Trash folder is reserved for Anchored data.",
        ));
    }

    let mut candidate = root.clone();
    for component in requested.components() {
        let Component::Normal(segment) = component else {
            return Err(VaultError::invalid_file(
                "Only relative vault folder paths can be used here.",
            ));
        };

        candidate.push(segment);
        let metadata = fs::symlink_metadata(&candidate)
            .map_err(|error| VaultError::io("The folder could not be inspected", error))?;
        if metadata.file_type().is_symlink() {
            return Err(VaultError::invalid_file(
                "Symlinked folders cannot be used here.",
            ));
        }
    }

    let canonical_directory = fs::canonicalize(&candidate)
        .map_err(|error| VaultError::io("The folder could not be opened", error))?;
    if !canonical_directory.starts_with(&root) {
        return Err(VaultError::invalid_file(
            "The folder resolved outside the selected vault.",
        ));
    }

    let metadata = fs::metadata(&canonical_directory)
        .map_err(|error| VaultError::io("The folder could not be inspected", error))?;
    if !metadata.is_dir() {
        return Err(VaultError::invalid_file(
            "The selected path is not a folder.",
        ));
    }
    Ok(canonical_directory)
}

fn create_folder(
    root: &Path,
    parent_path: Option<&str>,
    name: &str,
) -> Result<PathBuf, VaultError> {
    let root = canonical_vault_root(root)?;
    let parent = resolve_vault_directory(&root, parent_path.unwrap_or_default())?;
    let name = validate_folder_name(name)?;
    let destination = parent.join(name);

    match fs::symlink_metadata(&destination) {
        Ok(_) => return Err(VaultError::file_exists()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(VaultError::io(
                "The new folder destination could not be inspected",
                error,
            ))
        }
    }

    fs::create_dir(&destination)
        .map_err(|error| VaultError::io("The new folder could not be created", error))?;
    sync_directory(&parent)?;
    Ok(destination)
}

fn selected_folder_relative_path(root: &Path, folder_path: &str) -> Result<String, VaultError> {
    let root = canonical_vault_root(root)?;
    let directory = resolve_vault_directory(&root, folder_path)?;
    let relative = directory
        .strip_prefix(&root)
        .map_err(|_| VaultError::invalid_file("The selected folder is outside the vault."))?;
    let relative_path = relative
        .to_str()
        .ok_or_else(|| VaultError::invalid_file("The folder path is not valid UTF-8."))?;
    if relative_path.is_empty() {
        return Err(VaultError::invalid_file(
            "The vault root cannot be renamed or deleted.",
        ));
    }
    Ok(relative_path.to_owned())
}

fn folder_destination_relative_path(
    current_relative_path: &str,
    name: &str,
) -> Result<String, VaultError> {
    let next_name = validate_folder_name(name)?;
    let current_path = Path::new(current_relative_path);
    let current_name = current_path
        .file_name()
        .and_then(|segment| segment.to_str())
        .ok_or_else(|| VaultError::invalid_file("The selected folder could not be renamed."))?;
    let parent = current_path
        .parent()
        .and_then(Path::to_str)
        .unwrap_or_default();
    let destination = if parent.is_empty() {
        next_name.to_owned()
    } else {
        format!("{parent}/{next_name}")
    };
    if destination == current_relative_path || current_name == next_name {
        return Err(VaultError::rename_conflict(
            "Choose a different folder name.",
        ));
    }
    Ok(destination)
}

fn folder_path_with_suffix(
    from_root: &str,
    to_root: &str,
    current_path: &str,
) -> Result<String, VaultError> {
    let suffix = current_path.strip_prefix(from_root).ok_or_else(|| {
        VaultError::invalid_file("The folder entry is outside the selected folder.")
    })?;
    Ok(format!("{to_root}{suffix}"))
}

fn validate_folder_tree_for_rename(directory: &Path) -> Result<(), VaultError> {
    ensure_no_hidden_descendants(directory)?;
    let mut stack = vec![directory.to_path_buf()];
    while let Some(current) = stack.pop() {
        let mut entries = fs::read_dir(&current)
            .map_err(|error| VaultError::io("A folder entry could not be read", error))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| VaultError::io("A folder entry could not be read", error))?;
        entries.sort_by_key(|entry| entry.file_name());

        for entry in entries {
            let file_type = entry
                .file_type()
                .map_err(|error| VaultError::io("A folder entry could not be inspected", error))?;
            if file_type.is_symlink() {
                return Err(VaultError::invalid_file(
                    "Folders with symlinked entries cannot be renamed safely.",
                ));
            }
            if file_type.is_dir() {
                stack.push(entry.path());
                continue;
            }
            if !file_type.is_file() {
                return Err(VaultError::invalid_file(
                    "Only folders containing normal files and subfolders can be moved safely.",
                ));
            }
        }
    }
    Ok(())
}

fn rename_folder(root: &Path, folder_path: &str, name: &str) -> Result<(), VaultError> {
    let current_relative_path = selected_folder_relative_path(root, folder_path)?;
    let destination_relative_path = folder_destination_relative_path(&current_relative_path, name)?;
    relocate_folder(root, &current_relative_path, &destination_relative_path)
}

fn move_folder(root: &Path, folder_path: &str, destination_folder: &str) -> Result<(), VaultError> {
    let current_relative_path = selected_folder_relative_path(root, folder_path)?;
    let current_path = Path::new(&current_relative_path);
    let name = current_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| VaultError::invalid_file("The folder name is not valid UTF-8."))?;
    let destination_parent = resolve_vault_directory(root, destination_folder)?;
    let root = canonical_vault_root(root)?;
    let destination_relative_path = destination_parent
        .join(name)
        .strip_prefix(&root)
        .map_err(|_| VaultError::invalid_file("The folder destination is outside the vault."))?
        .to_str()
        .ok_or_else(|| VaultError::invalid_file("The folder destination is not valid UTF-8."))?
        .to_owned();
    if destination_relative_path == current_relative_path
        || destination_relative_path.starts_with(&format!("{current_relative_path}/"))
    {
        return Err(VaultError::rename_conflict(
            "A folder cannot be moved into itself or its descendants.",
        ));
    }
    relocate_folder(&root, &current_relative_path, &destination_relative_path)
}

fn relocate_folder(
    root: &Path,
    folder_path: &str,
    destination_relative_path: &str,
) -> Result<(), VaultError> {
    let root = canonical_vault_root(root)?;
    let current_relative_path = selected_folder_relative_path(&root, folder_path)?;
    let current_directory = resolve_vault_directory(&root, &current_relative_path)?;
    validate_folder_tree_for_rename(&current_directory)?;
    let destination_directory = root.join(destination_relative_path);

    match fs::symlink_metadata(&destination_directory) {
        Ok(_) => return Err(VaultError::file_exists()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(VaultError::io(
                "The folder rename destination could not be inspected",
                error,
            ))
        }
    }

    let mut snapshot = scan_vault(&root)?;
    enrich_vault_metadata(&root, &mut snapshot.files)?;
    let folder_prefix = format!("{current_relative_path}/");
    let moved_files = snapshot
        .files
        .iter()
        .filter(|file| file.relative_path.starts_with(&folder_prefix))
        .map(|file| file.relative_path.clone())
        .collect::<Vec<_>>();
    let moved_assets = snapshot
        .assets
        .iter()
        .filter(|file| file.relative_path.starts_with(&folder_prefix))
        .map(|file| file.relative_path.clone())
        .collect::<Vec<_>>();

    if moved_files.is_empty() {
        let parent = current_directory.parent().ok_or_else(|| {
            VaultError::invalid_file("The selected folder does not have a writable parent.")
        })?;
        fs::rename(&current_directory, &destination_directory)
            .map_err(|error| VaultError::io("The folder could not be renamed", error))?;
        sync_directory(parent)?;
        return Ok(());
    }

    fs::create_dir(&destination_directory)
        .map_err(|error| VaultError::io("The renamed folder could not be created", error))?;

    let descendant_folders = snapshot
        .folders
        .iter()
        .filter(|folder| {
            folder.as_str() == current_relative_path || folder.starts_with(&folder_prefix)
        })
        .cloned()
        .collect::<Vec<_>>();

    for folder in descendant_folders
        .iter()
        .filter(|folder| folder.as_str() != current_relative_path)
    {
        let destination_relative =
            folder_path_with_suffix(&current_relative_path, destination_relative_path, folder)?;
        fs::create_dir(root.join(destination_relative))
            .map_err(|error| VaultError::io("A renamed subfolder could not be created", error))?;
    }

    let mut renamed_count = 0_usize;
    for relative_path in &moved_files {
        let destination_relative = folder_path_with_suffix(
            &current_relative_path,
            destination_relative_path,
            relative_path,
        )?;
        let destination = root.join(destination_relative);
        rename_markdown_file(&root, relative_path, &destination, None)?;
        renamed_count += 1;
    }

    for relative_path in &moved_assets {
        let destination_relative = folder_path_with_suffix(
            &current_relative_path,
            destination_relative_path,
            relative_path,
        )?;
        fs::rename(root.join(relative_path), root.join(destination_relative)).map_err(|error| {
            VaultError::io("An asset could not be moved with its folder", error)
        })?;
    }

    if renamed_count > 0 {
        let mut folders_to_remove = descendant_folders;
        folders_to_remove.sort_by_key(|folder| std::cmp::Reverse(folder.len()));
        for folder in folders_to_remove {
            let directory = root.join(folder);
            if directory.exists() {
                fs::remove_dir(&directory).map_err(|error| {
                    VaultError::io("An emptied folder could not be removed", error)
                })?;
            }
        }
        let source_parent = current_directory.parent().ok_or_else(|| {
            VaultError::invalid_file("The selected folder does not have a writable parent.")
        })?;
        sync_directory(source_parent)?;
    }

    Ok(())
}

fn delete_empty_folder(root: &Path, folder_path: &str) -> Result<(), VaultError> {
    let root = canonical_vault_root(root)?;
    let relative_path = selected_folder_relative_path(&root, folder_path)?;
    let directory = resolve_vault_directory(&root, &relative_path)?;
    let parent = directory.parent().ok_or_else(|| {
        VaultError::invalid_file("The selected folder does not have a writable parent.")
    })?;
    let mut entries = fs::read_dir(&directory)
        .map_err(|error| VaultError::io("The folder could not be read", error))?;
    if entries.next().is_some() {
        return Err(VaultError::invalid_file(
            "Only empty folders can be deleted safely right now.",
        ));
    }
    fs::remove_dir(&directory)
        .map_err(|error| VaultError::io("The folder could not be deleted", error))?;
    sync_directory(parent)
}

fn scan_vault(root: &Path) -> Result<VaultSnapshot, VaultError> {
    let root = canonical_vault_root(root)?;
    let mut files = Vec::new();
    let mut assets = Vec::new();
    let mut folders = Vec::new();
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
            if is_internal_component(&entry.file_name()) {
                continue;
            }
            if depth == 0 && is_trash_component(&entry.file_name()) {
                continue;
            }
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
                if let Ok(relative) = entry.path().strip_prefix(&root) {
                    if let Some(relative_path) = relative.to_str() {
                        folders.push(relative_path.to_owned());
                    }
                }
                stack.push((entry.path(), depth + 1));
                continue;
            }

            if !file_type.is_file() {
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

            if is_markdown(&entry.path()) {
                let metadata = fs::metadata(&canonical_file).map_err(|error| {
                    VaultError::io("A Markdown file could not be inspected", error)
                })?;
                let signature = file_signature_from_metadata(&metadata);
                files.push(VaultFile {
                    aliases: Vec::new(),
                    archived_at: None,
                    created_at: None,
                    modified_millis: signature.modified_millis,
                    is_recovery_copy: is_recovery_copy_name(&name),
                    signature: Some(signature),
                    outgoing_links: Vec::new(),
                    name,
                    parent,
                    relative_path: relative_path.to_owned(),
                    status: None,
                    note_type: None,
                    updated_at: None,
                });
            } else {
                let metadata = fs::metadata(&canonical_file).map_err(|error| {
                    VaultError::io("An asset file could not be inspected", error)
                })?;
                assets.push(VaultAsset {
                    modified_millis: file_signature_from_metadata(&metadata).modified_millis,
                    name,
                    parent,
                    relative_path: relative_path.to_owned(),
                });
            }
        }
    }

    files.sort_by(|left, right| {
        left.relative_path
            .to_lowercase()
            .cmp(&right.relative_path.to_lowercase())
    });
    assets.sort_by(|left, right| {
        left.relative_path
            .to_lowercase()
            .cmp(&right.relative_path.to_lowercase())
    });
    folders.sort_by_key(|path| path.to_lowercase());

    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Vault")
        .to_owned();

    Ok(VaultSnapshot {
        assets,
        files,
        folders,
        name,
        vault_id: String::new(),
        warnings: VaultWarnings {
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

fn metadata_index_path(app: &AppHandle, vault_id: &str) -> Result<PathBuf, VaultError> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| {
            VaultError::state(format!("The vault index location is unavailable: {error}"))
        })?
        .join("vault-indexes");
    fs::create_dir_all(&directory)
        .map_err(|error| VaultError::io("The vault index directory could not be created", error))?;
    Ok(directory.join(format!("{vault_id}.json")))
}

fn prepare_metadata_cache(
    app: &AppHandle,
    vault_id: &str,
    cache: &Mutex<VaultMetadataCache>,
) -> Result<(), VaultError> {
    let mut cache = cache
        .lock()
        .map_err(|_| VaultError::state("The vault metadata cache could not be prepared."))?;
    if cache.vault_id == vault_id {
        return Ok(());
    }

    let path = metadata_index_path(app, vault_id)?;
    let persisted = fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<PersistedVaultIndex>(&bytes).ok())
        .filter(|index| index.version == 2 && index.vault_id == vault_id);
    cache.vault_id = vault_id.to_owned();
    cache.entries = persisted
        .map(|index| index.entries.into_iter().collect())
        .unwrap_or_default();
    cache.last_refresh_reads = 0;
    Ok(())
}

fn persist_metadata_cache(
    app: &AppHandle,
    cache: &Mutex<VaultMetadataCache>,
) -> Result<(), VaultError> {
    let cache = cache
        .lock()
        .map_err(|_| VaultError::state("The vault metadata cache could not be saved."))?;
    if cache.vault_id.is_empty() {
        return Ok(());
    }
    let payload = PersistedVaultIndex {
        entries: cache
            .entries
            .iter()
            .map(|(path, metadata)| (path.clone(), metadata.clone()))
            .collect(),
        vault_id: cache.vault_id.clone(),
        version: 2,
    };
    let bytes = serde_json::to_vec(&payload)
        .map_err(|error| VaultError::state(format!("The vault index is invalid: {error}")))?;
    let path = metadata_index_path(app, &cache.vault_id)?;
    let temporary_path = path.with_extension(format!(
        "json.anchored-{}-{}.tmp",
        std::process::id(),
        TEMPORARY_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary_path)
        .map_err(|error| VaultError::io("A temporary vault index could not be created", error))?;
    use std::io::Write;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| VaultError::io("The vault index could not be written", error))?;
    drop(file);
    if let Err(error) = fs::rename(&temporary_path, &path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(VaultError::io(
            "The vault index could not be replaced",
            error,
        ));
    }
    sync_parent_directory(&path)
}

fn enrich_vault_metadata(root: &Path, files: &mut [VaultFile]) -> Result<(), VaultError> {
    enrich_vault_metadata_cached(root, files, &Mutex::new(VaultMetadataCache::default()))
}

fn enrich_vault_metadata_cached(
    root: &Path,
    files: &mut [VaultFile],
    cache: &Mutex<VaultMetadataCache>,
) -> Result<(), VaultError> {
    let existing = cache
        .lock()
        .map_err(|_| VaultError::state("The vault metadata cache could not be read."))?
        .entries
        .clone();
    let mut next = HashMap::with_capacity(files.len());
    let mut metadata_reads = 0;

    for file in files.iter_mut() {
        let signature = file
            .signature
            .unwrap_or(vault_file_signature(root, &file.relative_path)?);
        let metadata = if let Some(cached) = existing.get(&file.relative_path) {
            if cached.signature == signature {
                cached.clone()
            } else {
                metadata_reads += 1;
                read_cached_note_metadata(root, &file.relative_path, signature)?
            }
        } else {
            metadata_reads += 1;
            read_cached_note_metadata(root, &file.relative_path, signature)?
        };
        file.aliases.clone_from(&metadata.aliases);
        file.archived_at.clone_from(&metadata.archived_at);
        file.created_at.clone_from(&metadata.created_at);
        file.note_type.clone_from(&metadata.note_type);
        file.outgoing_links.clone_from(&metadata.outgoing_links);
        file.status.clone_from(&metadata.status);
        file.updated_at.clone_from(&metadata.updated_at);
        next.insert(file.relative_path.clone(), metadata);
    }

    let mut cache = cache
        .lock()
        .map_err(|_| VaultError::state("The vault metadata cache could not be updated."))?;
    cache.entries = next;
    cache.last_refresh_reads = metadata_reads;
    Ok(())
}

fn read_cached_note_metadata(
    root: &Path,
    relative_path: &str,
    signature: FileSignature,
) -> Result<CachedNoteMetadata, VaultError> {
    let mut metadata = CachedNoteMetadata {
        aliases: Vec::new(),
        archived_at: None,
        created_at: None,
        note_type: None,
        outgoing_links: Vec::new(),
        signature,
        status: None,
        updated_at: None,
    };
    if signature.size_bytes > MAX_MARKDOWN_FILE_BYTES {
        return Ok(metadata);
    }
    let path = resolve_vault_markdown_file(root, relative_path)?;
    let bytes =
        fs::read(path).map_err(|error| VaultError::io("Note metadata could not be read", error))?;
    let Ok(content) = String::from_utf8(bytes) else {
        return Ok(metadata);
    };
    let properties = inspect_note_properties(&content);
    metadata.aliases = inspect_note_aliases(&content);
    metadata.archived_at = properties.archived_at;
    metadata.created_at = properties.created_at;
    metadata.note_type = properties.note_type;
    metadata.outgoing_links = inspect_wikilinks(&content);
    metadata.status = properties.status;
    metadata.updated_at = properties.updated_at;
    Ok(metadata)
}

fn file_signature_from_metadata(metadata: &fs::Metadata) -> FileSignature {
    let modified_millis = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or_default();
    FileSignature {
        modified_millis,
        size_bytes: metadata.len(),
    }
}

fn vault_file_signature(root: &Path, relative_path: &str) -> Result<FileSignature, VaultError> {
    let path = resolve_vault_markdown_file(root, relative_path)?;
    let metadata = fs::metadata(path)
        .map_err(|error| VaultError::io("A Markdown file could not be inspected", error))?;
    Ok(file_signature_from_metadata(&metadata))
}

enum LifecycleTransition {
    Archive {
        note_type: Option<String>,
        update_type: bool,
    },
    Restore {
        destination_status: String,
        note_type: Option<String>,
        update_type: bool,
    },
    Workbench {
        note_type: Option<String>,
    },
}

fn validated_note_type(note_type: Option<&str>) -> Result<Option<&str>, VaultError> {
    let Some(note_type) = note_type else {
        return Ok(None);
    };
    let value = note_type.trim();
    if value.is_empty() || value.chars().count() > 100 || value.chars().any(char::is_control) {
        return Err(VaultError::lifecycle(
            "Types must contain 1–100 visible characters.",
        ));
    }
    Ok(Some(value))
}

fn derived_note_type(relative_path: &str) -> Option<String> {
    let mut components = Path::new(relative_path).components();
    let first = components.next()?;
    if !matches!(components.next(), Some(Component::Normal(_))) {
        return None;
    }
    let Component::Normal(component) = first else {
        return None;
    };
    let folder = component.to_str()?.to_owned();
    if folder.eq_ignore_ascii_case("inbox")
        || folder.eq_ignore_ascii_case("trash")
        || folder.eq_ignore_ascii_case("archive")
    {
        return None;
    }
    Some(folder)
}

fn current_local_timestamp() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S%:z").to_string()
}

fn vault_document(
    content: String,
    relative_path: String,
    size_bytes: u64,
    modified_millis: u64,
) -> VaultDocument {
    let properties = inspect_note_properties(&content);
    VaultDocument {
        archived_at: properties.archived_at,
        content,
        is_recovery_copy: relative_path
            .rsplit('/')
            .next()
            .is_some_and(is_recovery_copy_name),
        created_at: properties.created_at,
        modified_millis,
        note_type: properties.note_type,
        relative_path,
        size_bytes,
        status: properties.status,
        updated_at: properties.updated_at,
        updated_files: None,
        updated_links: None,
    }
}

fn create_conflict_copy(
    root: &Path,
    relative_path: &str,
    content: &str,
) -> Result<VaultDocument, VaultError> {
    if content.len() as u64 > MAX_MARKDOWN_FILE_BYTES {
        return Err(VaultError::file_too_large());
    }
    let original = Path::new(relative_path);
    let parent_relative = original.parent().and_then(Path::to_str).unwrap_or_default();
    let parent = resolve_vault_directory(root, parent_relative)?;
    let stem = original
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| VaultError::invalid_file("The Markdown filename is not valid UTF-8."))?;
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");

    for suffix in 0..10_000_u32 {
        let suffix = if suffix == 0 {
            String::new()
        } else {
            format!("-{suffix}")
        };
        let name = format!("{stem} (Anchored conflict {timestamp}){suffix}.md");
        let destination = parent.join(name);
        if destination.exists() {
            continue;
        }
        let (destination, relative_path) = resolve_new_vault_markdown_file(root, &destination)?;
        let temporary_path = temporary_sibling_path(&destination)?;
        let write_result = write_new_atomically(&temporary_path, &destination, content);
        if write_result.is_err() {
            let _ = fs::remove_file(&temporary_path);
        }
        write_result?;
        let metadata = fs::metadata(&destination)
            .map_err(|error| VaultError::io("The conflict copy could not be inspected", error))?;
        return Ok(vault_document(
            content.to_owned(),
            relative_path,
            metadata.len(),
            file_signature_from_metadata(&metadata).modified_millis,
        ));
    }

    Err(VaultError::state(
        "Anchored could not find an available conflict-copy filename.",
    ))
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

    Ok(vault_document(
        content,
        relative_path.to_owned(),
        metadata.len(),
        file_signature_from_metadata(&metadata).modified_millis,
    ))
}

fn save_markdown_file(
    root: &Path,
    relative_path: &str,
    content: &str,
    expected_content: &str,
) -> Result<VaultDocument, VaultError> {
    let canonical_file = resolve_vault_markdown_file(root, relative_path)?;
    let current_bytes = fs::read(&canonical_file)
        .map_err(|error| VaultError::io("The Markdown file could not be read", error))?;
    let current_content =
        String::from_utf8(current_bytes).map_err(|_| VaultError::invalid_encoding())?;
    if current_content != expected_content {
        return Err(VaultError::conflict());
    }
    if inspect_note_properties(&current_content).status.as_deref() == Some("archived") {
        return Err(VaultError::archived_read_only());
    }
    if inspect_note_properties(content).status.as_deref() == Some("archived") {
        return Err(VaultError::lifecycle(
            "Use the Archive action so Anchored can write archived_at safely.",
        ));
    }
    let content = if content != current_content {
        let content = normalize_front_matter_timestamps(content)
            .map_err(|error| {
                VaultError::lifecycle(format!(
                    "Anchored could not normalize timestamp metadata safely: {error}."
                ))
            })?
            .content;
        stamp_note_updated_at(&content, &current_local_timestamp()).map_err(|error| {
            VaultError::lifecycle(format!(
                "Anchored could not update authored metadata safely: {error}."
            ))
        })?
    } else {
        content.to_owned()
    };
    if content.len() as u64 > MAX_MARKDOWN_FILE_BYTES {
        return Err(VaultError::file_too_large());
    }

    let metadata = fs::metadata(&canonical_file)
        .map_err(|error| VaultError::io("The Markdown file could not be inspected", error))?;
    let temporary_path = temporary_sibling_path(&canonical_file)?;
    let write_result = write_atomically(&temporary_path, &canonical_file, &content, &metadata);
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    write_result?;

    let metadata = fs::metadata(&canonical_file)
        .map_err(|error| VaultError::io("The Markdown file could not be inspected", error))?;
    let size_bytes = content.len() as u64;
    Ok(vault_document(
        content,
        relative_path.to_owned(),
        size_bytes,
        file_signature_from_metadata(&metadata).modified_millis,
    ))
}

fn transition_markdown_lifecycle(
    root: &Path,
    relative_path: &str,
    expected_content: &str,
    transition: LifecycleTransition,
) -> Result<VaultDocument, VaultError> {
    let canonical_file = resolve_vault_markdown_file(root, relative_path)?;
    let current_bytes = fs::read(&canonical_file)
        .map_err(|error| VaultError::io("The Markdown file could not be read", error))?;
    let current_content =
        String::from_utf8(current_bytes).map_err(|_| VaultError::invalid_encoding())?;
    if current_content != expected_content {
        return Err(VaultError::conflict());
    }

    let current_properties = inspect_note_properties(&current_content);
    let current_status = current_properties.status;
    let updated = match transition {
        LifecycleTransition::Archive {
            note_type,
            update_type,
        } => {
            if current_status.as_deref() == Some("archived") {
                return Err(VaultError::archived_read_only());
            }
            if current_properties.note_type.as_deref() == Some("scratchpad") {
                archive_note(&current_content, &current_local_timestamp())
            } else if update_type {
                archive_note_with_type(
                    &current_content,
                    &current_local_timestamp(),
                    validated_note_type(note_type.as_deref())?,
                )
            } else {
                archive_note(&current_content, &current_local_timestamp())
            }
        }
        LifecycleTransition::Restore {
            destination_status,
            note_type,
            update_type,
        } => {
            if destination_status == "inbox" && current_status.as_deref() == Some("active") {
                restore_note(&current_content, &destination_status)
            } else {
                if current_status.as_deref() != Some("archived") {
                    return Err(VaultError::lifecycle(
                        "Only archived notes can be restored to an editable collection.",
                    ));
                }
                if update_type && current_properties.note_type.as_deref() != Some("scratchpad") {
                    restore_note_with_type(
                        &current_content,
                        &destination_status,
                        validated_note_type(note_type.as_deref())?,
                    )
                } else {
                    restore_note(&current_content, &destination_status)
                }
            }
        }
        LifecycleTransition::Workbench { note_type } => {
            if current_status.as_deref() == Some("archived") {
                return Err(VaultError::lifecycle(
                    "Use Restore to move an archived note to Workbench.",
                ));
            }
            if current_properties.note_type.as_deref() == Some("scratchpad") {
                return Err(VaultError::lifecycle(
                    "Scratchpad notes remain in Inbox until archived.",
                ));
            }
            restore_note_with_type(
                &current_content,
                "active",
                validated_note_type(note_type.as_deref())?,
            )
        }
    }
    .map_err(|error| {
        VaultError::lifecycle(format!(
            "Anchored could not update this note's lifecycle metadata: {error}."
        ))
    })?;
    if updated.len() as u64 > MAX_MARKDOWN_FILE_BYTES {
        return Err(VaultError::file_too_large());
    }

    let updated_properties = inspect_note_properties(&updated);
    let target_status = updated_properties.status.as_deref();
    let current_is_inbox = matches!(current_status.as_deref(), None | Some("inbox"));
    let should_move_to_collection = match target_status {
        Some("inbox") => !current_is_inbox,
        Some("active") | Some("archived") => current_is_inbox,
        _ => false,
    };

    if should_move_to_collection {
        let destination_folder = lifecycle_destination_folder(
            root,
            target_status,
            updated_properties.note_type.as_deref(),
        )?;
        let destination_directory = resolve_vault_directory(root, &destination_folder)?;
        let file_name = Path::new(relative_path).file_name().ok_or_else(|| {
            VaultError::invalid_file("Only relative Markdown file paths can be moved.")
        })?;
        let destination = destination_directory.join(file_name);
        let outcome = rename_markdown_file_with_content(
            root,
            relative_path,
            &destination,
            Some(&updated),
            None,
        )?;
        let mut document = read_markdown_file(root, &outcome.relative_path)?;
        document.updated_files = Some(outcome.updated_files);
        document.updated_links = Some(outcome.updated_links);
        return Ok(document);
    }

    let metadata = fs::metadata(&canonical_file)
        .map_err(|error| VaultError::io("The Markdown file could not be inspected", error))?;
    let temporary_path = temporary_sibling_path(&canonical_file)?;
    let write_result = write_atomically(&temporary_path, &canonical_file, &updated, &metadata);
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    write_result?;

    let metadata = fs::metadata(&canonical_file)
        .map_err(|error| VaultError::io("The Markdown file could not be inspected", error))?;
    Ok(vault_document(
        updated,
        relative_path.to_owned(),
        metadata.len(),
        file_signature_from_metadata(&metadata).modified_millis,
    ))
}

fn lifecycle_destination_folder(
    root: &Path,
    target_status: Option<&str>,
    note_type: Option<&str>,
) -> Result<String, VaultError> {
    let folder = if target_status == Some("inbox") {
        "inbox".to_owned()
    } else if let Some(note_type) = note_type {
        let folder = note_type.to_lowercase();
        validate_folder_name(&folder)?;
        folder
    } else {
        "inbox".to_owned()
    };

    let root = canonical_vault_root(root)?;
    let directory = root.join(&folder);
    if !directory.exists() {
        fs::create_dir(&directory)
            .map_err(|error| VaultError::io("The lifecycle folder could not be created", error))?;
        sync_parent_directory(&directory)?;
    }
    resolve_vault_directory(&root, &folder)?;
    Ok(folder)
}

fn create_markdown_file(
    root: &Path,
    destination: &Path,
    content: &str,
) -> Result<VaultDocument, VaultError> {
    let timestamp = current_local_timestamp();
    let has_authored_content = !content.trim().is_empty();
    let mut content = stamp_note_created_at(content, &timestamp).map_err(|error| {
        VaultError::lifecycle(format!(
            "Anchored could not add creation metadata safely: {error}."
        ))
    })?;
    if has_authored_content {
        content = stamp_note_updated_at(&content, &timestamp).map_err(|error| {
            VaultError::lifecycle(format!(
                "Anchored could not add authored metadata safely: {error}."
            ))
        })?;
    }
    if inspect_note_properties(&content).status.as_deref() == Some("archived") {
        content = archive_note(&content, &timestamp).map_err(|error| {
            VaultError::lifecycle(format!(
                "Anchored could not add archive metadata safely: {error}."
            ))
        })?;
    }
    content = normalize_front_matter_timestamps(&content)
        .map_err(|error| {
            VaultError::lifecycle(format!(
                "Anchored could not normalize timestamp metadata safely: {error}."
            ))
        })?
        .content;
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

    let metadata = fs::metadata(&destination).map_err(|error| {
        VaultError::io("The created Markdown file could not be inspected", error)
    })?;
    Ok(vault_document(
        content,
        relative_path,
        metadata.len(),
        file_signature_from_metadata(&metadata).modified_millis,
    ))
}

fn reconcile_external_markdown_move(
    root: &Path,
    old_relative_path: &str,
    new_relative_path: &str,
    update_type: bool,
) -> Result<VaultDocument, VaultError> {
    let root = canonical_vault_root(root)?;
    let old_path = Path::new(old_relative_path);
    let new_path = Path::new(new_relative_path);
    for path in [old_path, new_path] {
        if path.as_os_str().is_empty()
            || !is_markdown(path)
            || is_internal_relative_path(path)
            || is_vault_trash_relative_path(path)
            || path
                .components()
                .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err(VaultError::invalid_file(
                "Only visible relative Markdown moves can be reconciled safely.",
            ));
        }
    }
    if old_relative_path == new_relative_path {
        return Err(VaultError::rename_conflict(
            "The external move did not change the note path.",
        ));
    }
    if root.join(old_path).exists() {
        return Err(VaultError::conflict());
    }

    let destination_path = resolve_vault_markdown_file(&root, new_relative_path)?;
    let mut snapshot = scan_vault(&root)?;
    enrich_vault_metadata(&root, &mut snapshot.files)?;
    if !snapshot
        .files
        .iter()
        .any(|file| file.relative_path == new_relative_path)
    {
        return Err(VaultError::invalid_file(
            "The moved note is no longer visible in the vault.",
        ));
    }

    let sources = snapshot
        .files
        .iter()
        .map(|file| {
            let document = read_markdown_file(&root, &file.relative_path).map_err(|error| {
                VaultError::rename_conflict(format!(
                    "Every Markdown file must be readable before external links can be updated safely. {}: {}",
                    file.relative_path, error.message
                ))
            })?;
            Ok::<_, VaultError>(LinkSource {
                content: document.content,
                relative_path: file.relative_path.clone(),
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    let target_source = sources
        .iter()
        .find(|source| source.relative_path == new_relative_path)
        .ok_or_else(|| VaultError::invalid_file("The moved note could not be read."))?;
    let target_content = if update_type {
        let note_type = derived_note_type(new_relative_path);
        update_note_type(&target_source.content, note_type.as_deref()).map_err(|error| {
            VaultError::lifecycle(format!(
                "Anchored could not update the moved note's type safely: {error}."
            ))
        })?
    } else {
        target_source.content.clone()
    };

    let planning_sources = sources
        .iter()
        .map(|source| LinkSource {
            content: if source.relative_path == new_relative_path {
                target_content.clone()
            } else {
                source.content.clone()
            },
            relative_path: if source.relative_path == new_relative_path {
                old_relative_path.to_owned()
            } else {
                source.relative_path.clone()
            },
        })
        .collect::<Vec<_>>();
    let notes = snapshot
        .files
        .iter()
        .map(|file| LinkNote {
            aliases: file.aliases.clone(),
            identity: None,
            relative_path: if file.relative_path == new_relative_path {
                old_relative_path.to_owned()
            } else {
                file.relative_path.clone()
            },
        })
        .collect::<Vec<_>>();
    let rewrites = plan_rename_link_rewrites_by_path(
        &notes,
        &planning_sources,
        old_relative_path,
        new_relative_path,
    );
    let updated_links = rewrites
        .iter()
        .map(|rewrite| rewrite.replacement_count)
        .sum();
    let mut final_contents = rewrites
        .into_iter()
        .map(|rewrite| (rewrite.relative_path, rewrite.content))
        .collect::<BTreeMap<_, _>>();
    final_contents.insert(old_relative_path.to_owned(), target_content);

    let target_changed = final_contents
        .get(old_relative_path)
        .is_some_and(|content| content != &target_source.content);
    let mut entries = Vec::with_capacity(final_contents.len());
    for (logical_path, content) in final_contents {
        let actual_path = if logical_path == old_relative_path {
            new_relative_path
        } else {
            logical_path.as_str()
        };
        let source = sources
            .iter()
            .find(|source| source.relative_path == actual_path)
            .ok_or_else(|| VaultError::state("An external move source could not be matched."))?;
        let original_path = resolve_vault_markdown_file(&root, actual_path)?;
        let final_path = if logical_path == old_relative_path {
            destination_path.clone()
        } else {
            original_path.clone()
        };
        if content == source.content && original_path == final_path {
            continue;
        }
        let temporary_path = temporary_sibling_path(&final_path)?;
        let backup_path = transaction_sibling_path(&original_path, "backup")?;
        let metadata = fs::metadata(&original_path)
            .map_err(|error| VaultError::io("A Markdown file could not be inspected", error))?;
        prepare_transaction_file(&temporary_path, &content, &metadata)?;
        entries.push(RenameTransactionEntry {
            backup_path,
            destination_path: final_path,
            original_content: source.content.clone(),
            original_path,
            temporary_path,
        });
    }

    if entries.is_empty() {
        let metadata = fs::metadata(&destination_path)
            .map_err(|error| VaultError::io("The moved note could not be inspected", error))?;
        return Ok(vault_document(
            target_source.content.clone(),
            new_relative_path.to_owned(),
            metadata.len(),
            file_signature_from_metadata(&metadata).modified_millis,
        ));
    }

    for entry in &entries {
        let current = fs::read(&entry.original_path).map_err(|error| {
            VaultError::io("An external move source could not be rechecked", error)
        })?;
        if current != entry.original_content.as_bytes() {
            cleanup_transaction_files(&entries);
            return Err(VaultError::conflict());
        }
    }

    commit_rename_transaction(&root, &entries, None)?;
    let mut document = read_markdown_file(&root, new_relative_path)?;
    document.updated_files = Some(entries.len());
    document.updated_links = Some(updated_links);
    if target_changed && document.updated_files == Some(0) {
        document.updated_files = Some(1);
    }
    Ok(document)
}

fn rename_markdown_file(
    root: &Path,
    relative_path: &str,
    destination: &Path,
    fail_after_installations: Option<usize>,
) -> Result<RenameOutcome, VaultError> {
    rename_markdown_file_with_content(
        root,
        relative_path,
        destination,
        None,
        fail_after_installations,
    )
}

fn rename_markdown_file_with_content(
    root: &Path,
    relative_path: &str,
    destination: &Path,
    replacement_content: Option<&str>,
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
    if !snapshot
        .files
        .iter()
        .any(|file| file.relative_path == relative_path)
    {
        return Err(VaultError::invalid_file(
            "The note to rename is no longer in the vault.",
        ));
    }

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
    let planning_sources = sources
        .iter()
        .map(|source| LinkSource {
            content: if source.relative_path == relative_path {
                replacement_content
                    .map(ToOwned::to_owned)
                    .unwrap_or_else(|| source.content.clone())
            } else {
                source.content.clone()
            },
            relative_path: source.relative_path.clone(),
        })
        .collect::<Vec<_>>();
    let notes = snapshot
        .files
        .iter()
        .map(|file| LinkNote {
            aliases: file.aliases.clone(),
            identity: None,
            relative_path: file.relative_path.clone(),
        })
        .collect::<Vec<_>>();
    let rewrites = plan_rename_link_rewrites_by_path(
        &notes,
        &planning_sources,
        relative_path,
        &new_relative_path,
    );
    let updated_links = rewrites
        .iter()
        .map(|rewrite| rewrite.replacement_count)
        .sum();
    let updated_files = rewrites.len();
    let mut final_contents = rewrites
        .into_iter()
        .map(|rewrite| (rewrite.relative_path, rewrite.content))
        .collect::<BTreeMap<_, _>>();
    let target_content = planning_sources
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
    if is_internal_relative_path(relative) || is_vault_trash_relative_path(relative) {
        return Err(VaultError::invalid_file(
            "The system Trash folder is reserved for Anchored data.",
        ));
    }

    let relative_path = relative
        .to_str()
        .ok_or_else(|| VaultError::invalid_file("The Markdown path is not valid UTF-8."))?
        .to_owned();
    Ok((candidate, relative_path))
}

pub(crate) fn resolve_vault_markdown_file(
    root: &Path,
    relative_path: &str,
) -> Result<PathBuf, VaultError> {
    let root = canonical_vault_root(root)?;
    let requested = Path::new(relative_path);

    if relative_path.is_empty()
        || !is_markdown(requested)
        || is_internal_relative_path(requested)
        || is_vault_trash_relative_path(requested)
    {
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
fn sync_directory(directory: &Path) -> Result<(), VaultError> {
    fs::File::open(directory)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| VaultError::io("The filesystem change could not be finalized", error))
}

#[cfg(not(unix))]
fn sync_directory(_directory: &Path) -> Result<(), VaultError> {
    Ok(())
}

#[cfg(unix)]
fn sync_parent_directory(destination: &Path) -> Result<(), VaultError> {
    let parent = destination.parent().ok_or_else(|| {
        VaultError::invalid_file("The Markdown file does not have a writable parent directory.")
    })?;
    sync_directory(parent)
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
    use std::sync::Mutex;
    use std::time::{Duration, Instant};

    use tempfile::tempdir;

    use super::{
        apply_timestamp_migration, canonical_vault_root, create_conflict_copy, create_folder,
        create_inbox_markdown_file, create_markdown_file, create_named_vault,
        create_scratchpad_markdown_file, create_untitled_markdown_file, delete_empty_folder,
        derived_note_type, enrich_vault_metadata, enrich_vault_metadata_cached, move_folder,
        move_markdown_file_to_folder, preview_timestamp_migration, read_markdown_file,
        reconcile_external_markdown_move, recover_rename_transaction, rename_folder,
        rename_markdown_file, resolve_new_vault_markdown_file, save_markdown_file,
        save_scratchpad_markdown_file, scan_vault, scratchpad_filename_sequence,
        search_markdown_files, transition_markdown_lifecycle, validate_folder_name,
        validate_markdown_filename, validate_new_vault_name, vault_tree_signature,
        write_rename_journal, LifecycleTransition, RenameJournal, RenameJournalEntry,
        RenameJournalPhase, RenameOutcome, TimestampMigrationTarget, VaultMetadataCache,
        MAX_MARKDOWN_FILE_BYTES, MAX_SEARCH_RESULTS, RENAME_JOURNAL_NAME,
    };

    #[test]
    fn scans_nested_markdown_in_stable_order() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("Notes")).expect("create Notes folder");
        fs::create_dir(vault.path().join("trash")).expect("create system Trash folder");
        fs::write(vault.path().join("Zulu.md"), "# Zulu").expect("write root note");
        fs::write(
            vault.path().join("Notes/Alpha.MD"),
            "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\naliases: [First note]\nrelated: '[[Reading]]'\n---\n# Alpha\n[[Zulu]]",
        )
        .expect("write nested note");
        fs::write(vault.path().join("Notes/ignore.txt"), "ignored").expect("write ignored file");
        fs::write(vault.path().join("trash/opaque.md"), "ignored").expect("write Trash file");

        let mut snapshot = scan_vault(vault.path()).expect("scan fixture vault");
        enrich_vault_metadata(vault.path(), &mut snapshot.files).expect("index note metadata");
        let paths = snapshot
            .files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect::<Vec<_>>();

        assert_eq!(paths, vec!["Notes/Alpha.MD", "Zulu.md"]);
        assert_eq!(snapshot.folders, vec!["Notes"]);
        assert_eq!(snapshot.files[0].aliases, vec!["First note"]);
        assert_eq!(snapshot.files[0].outgoing_links, vec!["Reading", "Zulu"]);
        assert_eq!(snapshot.warnings.skipped_symlinks, 0);
    }

    #[test]
    fn excludes_and_reserves_the_hidden_anchored_directory() {
        let vault = tempdir().expect("create fixture vault");
        let internal = vault.path().join(".anchored");
        fs::create_dir(&internal).expect("create hidden directory");
        fs::write(vault.path().join("Visible.md"), "# Visible").expect("write visible note");
        fs::write(internal.join("Hidden.md"), "# Hidden").expect("write hidden note");

        let snapshot = scan_vault(vault.path()).expect("scan fixture vault");
        let read_error = read_markdown_file(vault.path(), ".anchored/Hidden.md")
            .expect_err("refuse hidden read");
        let create_error =
            resolve_new_vault_markdown_file(vault.path(), &internal.join("Created.md"))
                .expect_err("refuse hidden creation");

        assert_eq!(snapshot.files.len(), 1);
        assert_eq!(snapshot.files[0].relative_path, "Visible.md");
        assert_eq!(read_error.code, "invalidVaultFile");
        assert_eq!(create_error.code, "invalidVaultFile");
    }

    #[test]
    fn prunes_all_nested_dot_paths_but_keeps_visible_assets() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir_all(vault.path().join("Notes/.obsidian/cache"))
            .expect("create nested hidden directory");
        fs::write(vault.path().join(".root.md"), "# Hidden").expect("write root dotfile");
        fs::write(vault.path().join("Notes/.draft.md"), "# Hidden").expect("write nested dotfile");
        fs::write(vault.path().join("Notes/.obsidian/cache/schema.json"), "{}")
            .expect("write hidden asset");
        fs::write(vault.path().join("Notes/schema.json"), "{}").expect("write visible asset");

        let snapshot = scan_vault(vault.path()).expect("scan fixture vault");

        assert!(snapshot.files.is_empty());
        assert_eq!(snapshot.assets.len(), 1);
        assert_eq!(snapshot.assets[0].relative_path, "Notes/schema.json");
        assert_eq!(snapshot.folders, vec!["Notes"]);
    }

    #[test]
    fn writes_updated_at_only_for_initial_authored_content() {
        let vault = tempdir().expect("create fixture vault");
        let blank = create_markdown_file(vault.path(), &vault.path().join("Blank.md"), "")
            .expect("create blank note");
        let authored = create_markdown_file(
            vault.path(),
            &vault.path().join("Authored.md"),
            "# Authored\n",
        )
        .expect("create authored note");

        assert!(blank.content.ends_with("---\n\n"));
        assert!(blank.created_at.is_some());
        assert!(blank.updated_at.is_none());
        assert!(authored.created_at.is_some());
        assert_eq!(authored.updated_at, authored.created_at);
    }

    #[test]
    fn normalizes_user_timestamp_properties_during_creation_and_save() {
        let vault = tempdir().expect("create fixture vault");
        let source = "---\npublished_at: 2026-01-02T03:04:05Z\n---\n# Note\n";
        let created = create_markdown_file(vault.path(), &vault.path().join("Note.md"), source)
            .expect("create note with timestamp property");
        assert!(!created
            .content
            .contains("published_at: 2026-01-02T03:04:05Z"));
        assert!(created.content.contains("published_at: 2026-01-02T"));

        let saved_source = created.content.replace("# Note", "# Updated");
        let saved = save_markdown_file(vault.path(), "Note.md", &saved_source, &created.content)
            .expect("save changed note with timestamp property");
        assert!(!saved.content.contains("published_at: 2026-01-02T03:04:05Z"));
        assert!(saved.content.contains("updated_at:"));
        assert!(saved.content.ends_with("# Updated\n"));
    }

    #[test]
    fn indexes_the_checked_in_synthetic_test_vault() {
        let root =
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures/test-vault");
        let mut snapshot = scan_vault(&root).expect("scan checked-in synthetic test vault");
        enrich_vault_metadata(&root, &mut snapshot.files)
            .expect("index synthetic test vault metadata");

        assert!(snapshot.files.len() >= 6);
        let harbor = snapshot
            .files
            .iter()
            .find(|file| file.relative_path == "Notes/Harbor.md")
            .expect("find Harbor fixture");
        assert_eq!(harbor.aliases, vec!["Safe Harbor", "North Star"]);
        assert_eq!(
            harbor.outgoing_links,
            vec![
                "Writing/Field Notes",
                "Field Notes",
                "Reading Shelf",
                "Future Note",
            ]
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
    fn reuses_metadata_for_an_unchanged_large_vault() {
        let vault = tempdir().expect("create fixture vault");
        for folder_index in 0..56 {
            fs::create_dir(vault.path().join(format!("Folder {folder_index:02}")))
                .expect("create fixture folder");
        }
        for note_index in 0..700 {
            let folder = vault.path().join(format!("Folder {:02}", note_index % 56));
            let links = (0..5)
                .map(|offset| format!("[[Note {:04}]]", (note_index + offset + 1) % 700))
                .collect::<Vec<_>>()
                .join(" ");
            fs::write(
                folder.join(format!("Note {note_index:04}.md")),
                format!("---\nstatus: active\ntype: Project\n---\n{links}\n"),
            )
            .expect("write fixture note");
        }

        let cache = Mutex::new(VaultMetadataCache::default());
        let mut first = scan_vault(vault.path()).expect("scan first fixture");
        enrich_vault_metadata_cached(vault.path(), &mut first.files, &cache)
            .expect("index first fixture");
        assert_eq!(cache.lock().expect("read cache").last_refresh_reads, 700);

        let started = Instant::now();
        let mut warm = scan_vault(vault.path()).expect("scan warm fixture");
        enrich_vault_metadata_cached(vault.path(), &mut warm.files, &cache)
            .expect("reuse fixture metadata");
        assert_eq!(cache.lock().expect("read cache").last_refresh_reads, 0);
        assert!(started.elapsed() < Duration::from_secs(1));

        fs::write(
            vault.path().join("Folder 00/Note 0000.md"),
            "---\nstatus: archived\ntype: Project\n---\nChanged content and size.\n",
        )
        .expect("change one fixture note");
        let mut changed = scan_vault(vault.path()).expect("scan changed fixture");
        enrich_vault_metadata_cached(vault.path(), &mut changed.files, &cache)
            .expect("refresh changed metadata");
        assert_eq!(cache.lock().expect("read cache").last_refresh_reads, 1);
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
    fn validates_new_vault_names() {
        assert_eq!(
            validate_new_vault_name("Writing Vault").expect("accept simple name"),
            "Writing Vault"
        );
        assert!(validate_new_vault_name("").is_err());
        assert!(validate_new_vault_name("Notes/Child").is_err());
        assert!(validate_new_vault_name(".hidden").is_err());
        assert!(validate_new_vault_name(".anchored").is_err());
    }

    #[test]
    fn validates_new_folder_names() {
        assert_eq!(
            validate_folder_name("Projects").expect("accept simple name"),
            "Projects"
        );
        assert!(validate_folder_name("").is_err());
        assert!(validate_folder_name("Notes/Child").is_err());
        assert!(validate_folder_name(".hidden").is_err());
        assert!(validate_folder_name(".anchored").is_err());
    }

    #[test]
    fn creates_a_new_named_vault_folder() {
        let parent = tempdir().expect("create parent folder");

        let created =
            create_named_vault(parent.path(), "Second Brain").expect("create named vault");

        assert_eq!(
            created.file_name().and_then(|name| name.to_str()),
            Some("Second Brain")
        );
        assert!(created.is_dir());
    }

    #[test]
    fn refuses_to_create_a_named_vault_over_an_existing_path() {
        let parent = tempdir().expect("create parent folder");
        fs::write(parent.path().join("Taken"), "occupied").expect("write occupied file");

        let error =
            create_named_vault(parent.path(), "Taken").expect_err("reject occupied destination");

        assert_eq!(error.code, "vaultFileExists");
    }

    #[test]
    fn creates_root_and_nested_folders_inside_the_selected_vault() {
        let vault = tempdir().expect("create fixture vault");

        let root_folder =
            create_folder(vault.path(), None, "Projects").expect("create root folder");
        let nested_folder =
            create_folder(vault.path(), Some("Projects"), "Inbox").expect("create nested folder");
        let snapshot = scan_vault(vault.path()).expect("scan folder fixture");

        assert!(root_folder.is_dir());
        assert!(nested_folder.is_dir());
        assert_eq!(snapshot.folders, vec!["Projects", "Projects/Inbox"]);
    }

    #[test]
    fn refuses_to_create_a_folder_over_an_existing_path() {
        let vault = tempdir().expect("create fixture vault");
        fs::write(vault.path().join("Projects"), "occupied").expect("write occupied path");

        let error =
            create_folder(vault.path(), None, "Projects").expect_err("reject occupied destination");

        assert_eq!(error.code, "vaultFileExists");
    }

    #[test]
    fn renames_a_folder_and_updates_nested_note_links() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("Notes")).expect("create Notes folder");
        fs::create_dir(vault.path().join("Notes/Inbox")).expect("create Inbox folder");
        fs::write(
            vault.path().join("Notes/Inbox/Field.md"),
            "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\n---\n# Field\n",
        )
        .expect("write nested target note");
        fs::write(
            vault.path().join("Reference.md"),
            "---\nid: 01JZQ91T3AA6F2M9V3C5T7X1BZ\n---\n[[Notes/Inbox/Field]]\n",
        )
        .expect("write reference note");

        rename_folder(vault.path(), "Notes", "Archive").expect("rename folder");
        let snapshot = scan_vault(vault.path()).expect("scan renamed folder");

        assert_eq!(snapshot.folders, vec!["Archive", "Archive/Inbox"]);
        assert!(vault.path().join("Archive/Inbox/Field.md").exists());
        assert!(!vault.path().join("Notes").exists());
        assert_eq!(
            fs::read_to_string(vault.path().join("Reference.md")).expect("read reference note"),
            "---\nid: 01JZQ91T3AA6F2M9V3C5T7X1BZ\n---\n[[Archive/Inbox/Field]]\n"
        );
    }

    #[test]
    fn renames_a_folder_with_visible_assets() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("Notes")).expect("create Notes folder");
        fs::write(vault.path().join("Notes/image.png"), "png").expect("write attachment");

        rename_folder(vault.path(), "Notes", "Archive").expect("rename attachment folder");

        assert!(!vault.path().join("Notes").exists());
        assert!(vault.path().join("Archive/image.png").is_file());
    }

    #[test]
    fn moves_a_folder_without_entering_its_descendants() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir_all(vault.path().join("Source/Nested")).expect("create source");
        fs::create_dir(vault.path().join("Destination")).expect("create destination");
        fs::write(vault.path().join("Source/Nested/Note.md"), "# Note").expect("write note");

        move_folder(vault.path(), "Source", "Destination").expect("move folder");
        assert!(vault
            .path()
            .join("Destination/Source/Nested/Note.md")
            .is_file());
        let error = move_folder(
            vault.path(),
            "Destination/Source",
            "Destination/Source/Nested",
        )
        .expect_err("refuse descendant move");
        assert_eq!(error.code, "vaultRenameConflict");
    }

    #[test]
    fn deletes_an_empty_folder() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("Empty")).expect("create empty folder");

        delete_empty_folder(vault.path(), "Empty").expect("delete empty folder");
        let snapshot = scan_vault(vault.path()).expect("scan empty vault");

        assert!(snapshot.folders.is_empty());
        assert!(!vault.path().join("Empty").exists());
    }

    #[test]
    fn refuses_to_delete_a_nonempty_folder() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("Notes")).expect("create Notes folder");
        fs::write(vault.path().join("Notes/Field.md"), "# Field\n").expect("write note");

        let error =
            delete_empty_folder(vault.path(), "Notes").expect_err("reject nonempty folder delete");

        assert_eq!(error.code, "invalidVaultFile");
        assert!(vault.path().join("Notes").exists());
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
    fn vault_tree_signature_changes_for_nested_finder_mutations() {
        let vault = tempdir().expect("create fixture vault");
        let nested = vault.path().join("Notes");
        fs::create_dir(&nested).expect("create Notes folder");

        let initial = vault_tree_signature(vault.path()).expect("signature before mutation");
        fs::write(nested.join("Added.md"), "# Added\n").expect("add note");
        let added = vault_tree_signature(vault.path()).expect("signature after add");
        assert_ne!(initial, added);

        fs::rename(&nested, vault.path().join("Moved")).expect("move folder");
        let moved = vault_tree_signature(vault.path()).expect("signature after move");
        assert_ne!(added, moved);

        fs::remove_dir_all(vault.path().join("Moved")).expect("delete folder");
        let deleted = vault_tree_signature(vault.path()).expect("signature after delete");
        assert_ne!(moved, deleted);
    }

    #[test]
    fn saves_markdown_atomically_when_the_original_content_matches() {
        let vault = tempdir().expect("create fixture vault");
        let note = vault.path().join("Note.md");
        fs::write(&note, "# Before\n").expect("write original note");

        let document = save_markdown_file(vault.path(), "Note.md", "# After\n", "# Before\n")
            .expect("save changed note");

        assert!(document.content.contains("updated_at:"));
        assert!(document.content.ends_with("# After\n"));
        assert_eq!(document.size_bytes, document.content.len() as u64);
        assert_eq!(
            fs::read_to_string(&note).expect("read saved note"),
            document.content
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
    fn archives_restores_and_guards_read_only_notes_atomically() {
        let vault = tempdir().expect("create fixture vault");
        let note = vault.path().join("Note.md");
        let original = "---\nstatus: active\n---\n# Note\n";
        fs::write(&note, original).expect("write note");

        let archived = transition_markdown_lifecycle(
            vault.path(),
            "Note.md",
            original,
            LifecycleTransition::Archive {
                note_type: None,
                update_type: false,
            },
        )
        .expect("archive note");
        assert_eq!(archived.status.as_deref(), Some("archived"));
        assert!(archived.archived_at.is_some());
        assert_eq!(
            fs::read_to_string(&note).expect("read archived note"),
            archived.content
        );

        let save_error = save_markdown_file(
            vault.path(),
            "Note.md",
            "# Illicit edit\n",
            &archived.content,
        )
        .expect_err("refuse archived save");
        assert_eq!(save_error.code, "archivedReadOnly");

        let restored = transition_markdown_lifecycle(
            vault.path(),
            "Note.md",
            &archived.content,
            LifecycleTransition::Restore {
                destination_status: "active".to_owned(),
                note_type: None,
                update_type: false,
            },
        )
        .expect("restore note");
        assert_eq!(restored.status.as_deref(), Some("active"));
        assert_eq!(restored.archived_at, None);
        assert!(!restored.content.contains("archived_at:"));

        let saved = save_markdown_file(
            vault.path(),
            "Note.md",
            &format!("{}Edited\n", restored.content),
            &restored.content,
        )
        .expect("save restored note");
        assert!(saved.content.ends_with("Edited\n"));
    }

    #[test]
    fn moves_inbox_notes_by_type_but_restores_archive_to_workbench_in_place() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("inbox")).expect("create inbox folder");
        let original = "---\nstatus: inbox\ntype: Daily Note\n---\n# Note\n";
        fs::write(vault.path().join("Note.md"), original).expect("write note");
        fs::write(vault.path().join("Reference.md"), "[[Note]]\n").expect("write reference");

        let archived = transition_markdown_lifecycle(
            vault.path(),
            "Note.md",
            original,
            LifecycleTransition::Archive {
                note_type: Some("Daily Note".to_owned()),
                update_type: true,
            },
        )
        .expect("archive inbox note");
        assert_eq!(archived.relative_path, "daily note/Note.md");
        assert_eq!(archived.updated_files, Some(1));
        assert_eq!(archived.updated_links, Some(1));
        assert!(!vault.path().join("Note.md").exists());
        assert!(vault.path().join("daily note/Note.md").exists());
        assert_eq!(
            fs::read_to_string(vault.path().join("Reference.md")).expect("read reference"),
            "[[daily note/Note]]\n"
        );

        let restored_to_workbench = transition_markdown_lifecycle(
            vault.path(),
            &archived.relative_path,
            &archived.content,
            LifecycleTransition::Restore {
                destination_status: "active".to_owned(),
                note_type: None,
                update_type: false,
            },
        )
        .expect("restore to Workbench");
        assert_eq!(restored_to_workbench.relative_path, "daily note/Note.md");
        assert_eq!(restored_to_workbench.status.as_deref(), Some("active"));

        let restored_to_inbox = transition_markdown_lifecycle(
            vault.path(),
            &restored_to_workbench.relative_path,
            &restored_to_workbench.content,
            LifecycleTransition::Restore {
                destination_status: "inbox".to_owned(),
                note_type: None,
                update_type: false,
            },
        )
        .expect("restore to Inbox");
        assert_eq!(restored_to_inbox.relative_path, "inbox/Note.md");
        assert_eq!(restored_to_inbox.status.as_deref(), Some("inbox"));
        assert!(vault.path().join("inbox/Note.md").exists());
    }

    #[test]
    fn moves_untyped_inbox_notes_into_the_inbox_folder() {
        let vault = tempdir().expect("create fixture vault");
        fs::write(
            vault.path().join("Note.md"),
            "---\nstatus: inbox\n---\n# Note\n",
        )
        .expect("write note");

        let moved = transition_markdown_lifecycle(
            vault.path(),
            "Note.md",
            "---\nstatus: inbox\n---\n# Note\n",
            LifecycleTransition::Workbench { note_type: None },
        )
        .expect("move untyped note to Workbench");

        assert_eq!(moved.relative_path, "inbox/Note.md");
        assert_eq!(moved.status.as_deref(), Some("active"));
        assert!(vault.path().join("inbox/Note.md").exists());
    }

    #[test]
    fn lifecycle_transitions_preserve_external_changes() {
        let vault = tempdir().expect("create fixture vault");
        fs::write(vault.path().join("Note.md"), "# External\n").expect("write note");

        let error = transition_markdown_lifecycle(
            vault.path(),
            "Note.md",
            "# Stale\n",
            LifecycleTransition::Archive {
                note_type: None,
                update_type: false,
            },
        )
        .expect_err("reject stale archive");

        assert_eq!(error.code, "vaultConflict");
        assert_eq!(
            fs::read_to_string(vault.path().join("Note.md")).expect("read note"),
            "# External\n"
        );
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
    fn creates_unique_visible_conflict_copies_without_changing_original() {
        let vault = tempdir().expect("create fixture vault");
        let note = vault.path().join("Note.md");
        fs::write(&note, "# External revision\n").expect("write note");

        let first = create_conflict_copy(vault.path(), "Note.md", "# Local revision\n")
            .expect("create first conflict copy");
        let second = create_conflict_copy(vault.path(), "Note.md", "# Local revision 2\n")
            .expect("create second conflict copy");

        assert!(first.is_recovery_copy);
        assert!(second.is_recovery_copy);
        assert_ne!(first.relative_path, second.relative_path);
        assert!(first.relative_path.contains(" (Anchored conflict "));
        assert_eq!(
            fs::read_to_string(vault.path().join(&first.relative_path)).unwrap(),
            "# Local revision\n"
        );
        assert_eq!(
            fs::read_to_string(vault.path().join(&second.relative_path)).unwrap(),
            "# Local revision 2\n"
        );
        assert_eq!(fs::read_to_string(&note).unwrap(), "# External revision\n");
    }

    #[test]
    fn creates_a_new_markdown_file_without_leaving_a_temporary_file() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("Notes")).expect("create Notes folder");
        let destination = vault.path().join("Notes/New note.md");

        let document = create_markdown_file(vault.path(), &destination, "# New note\n")
            .expect("create Markdown file");

        assert_eq!(document.relative_path, "Notes/New note.md");
        assert!(document.content.ends_with("\n# New note\n"));
        assert!(document.created_at.is_some());
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
    fn creates_a_timestamped_file_without_replacing_existing_notes() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("inbox")).expect("create inbox folder");
        fs::write(vault.path().join("inbox/Untitled.md"), "# First\n").expect("write first note");
        fs::write(vault.path().join("inbox/Untitled 2.md"), "# Second\n")
            .expect("write second note");

        let document = create_untitled_markdown_file(vault.path(), None, "")
            .expect("create numbered untitled note");

        assert_eq!(document.relative_path, "inbox/Untitled 3.md");
        assert!(document.content.contains("created_at:"));
        assert!(document.created_at.is_some());
        assert_eq!(
            fs::read_to_string(vault.path().join("inbox/Untitled.md")).expect("read first note"),
            "# First\n"
        );
        assert_eq!(
            fs::read_to_string(vault.path().join("inbox/Untitled 2.md")).expect("read second note"),
            "# Second\n"
        );
    }

    #[test]
    fn creates_a_named_note_in_the_physical_inbox() {
        let vault = tempdir().expect("create fixture vault");

        let document = create_inbox_markdown_file(vault.path(), "Future idea", "")
            .expect("create named Inbox note");

        assert_eq!(document.relative_path, "inbox/Future idea.md");
        assert!(vault.path().join("inbox/Future idea.md").is_file());
        assert!(document.content.contains("created_at:"));
    }

    #[test]
    fn refuses_invalid_or_existing_named_inbox_notes() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("inbox")).expect("create inbox folder");
        fs::write(vault.path().join("inbox/Existing.md"), "# Existing\n")
            .expect("write existing note");

        let invalid = create_inbox_markdown_file(vault.path(), "../Outside", "")
            .expect_err("reject unsafe Inbox note name");
        let existing = create_inbox_markdown_file(vault.path(), "Existing", "")
            .expect_err("reject existing Inbox note");

        assert_eq!(invalid.code, "invalidVaultFile");
        assert_eq!(existing.code, "vaultFileExists");
        assert_eq!(
            fs::read_to_string(vault.path().join("inbox/Existing.md")).expect("read existing note"),
            "# Existing\n"
        );
    }

    #[test]
    fn creates_separate_collision_safe_scratchpad_notes() {
        let vault = tempdir().expect("create fixture vault");

        let first = create_scratchpad_markdown_file(
            vault.path(),
            "First capture with [[Linked note]]",
            "2026-11-28 164832",
        )
        .expect("create first Scratchpad note");
        let second =
            create_scratchpad_markdown_file(vault.path(), "Second capture", "2026-11-28 164832")
                .expect("create second Scratchpad note");

        assert_eq!(first.relative_path, "inbox/Scratchpad 2026-11-28 164832.md");
        assert_eq!(
            second.relative_path,
            "inbox/Scratchpad 2026-11-28 164832 2.md"
        );
        assert_eq!(first.body, "First capture with [[Linked note]]");
        assert!(first.persisted_content.contains("type: scratchpad\n"));
        assert!(first.persisted_content.contains("status: inbox\n"));
        assert!(first.persisted_content.contains("created_at:"));
        assert_eq!(scratchpad_filename_sequence(&first.relative_path), 1);
        assert_eq!(scratchpad_filename_sequence(&second.relative_path), 2);
    }

    #[test]
    fn saves_only_the_scratchpad_body_with_conflict_protection() {
        let vault = tempdir().expect("create fixture vault");
        let created = create_scratchpad_markdown_file(vault.path(), "Initial", "2026-11-28 164832")
            .expect("create Scratchpad note");

        let saved = save_scratchpad_markdown_file(
            vault.path(),
            &created.relative_path,
            "Updated Zürich 🚀",
            &created.persisted_content,
        )
        .expect("save Scratchpad note");
        let conflict = save_scratchpad_markdown_file(
            vault.path(),
            &created.relative_path,
            "Stale update",
            &created.persisted_content,
        )
        .expect_err("reject stale Scratchpad update");

        assert_eq!(saved.body, "Updated Zürich 🚀");
        assert!(saved.persisted_content.contains("type: scratchpad\n"));
        assert!(saved.persisted_content.contains("status: inbox\n"));
        assert_eq!(conflict.code, "vaultConflict");
    }

    #[test]
    fn discards_blank_scratchpad_captures() {
        let vault = tempdir().expect("create fixture vault");

        let error = create_scratchpad_markdown_file(vault.path(), " \n\t ", "2026-11-28 164832")
            .expect_err("reject blank Scratchpad note");

        assert_eq!(error.code, "invalidVaultFile");
        assert_eq!(fs::read_dir(vault.path()).expect("read vault").count(), 0);
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
    fn refuses_malformed_front_matter_during_lifecycle_stamping() {
        let vault = tempdir().expect("create fixture vault");
        let destination = vault.path().join("Unsafe.md");
        let content = "---\ntags: [unfinished\n---\n# Unsafe\n";

        let error = create_markdown_file(vault.path(), &destination, content)
            .expect_err("refuse unsafe creation metadata mutation");

        assert_eq!(error.code, "unsafeLifecycleMetadata");
        assert!(!destination.exists());
    }

    #[test]
    fn previews_and_applies_generic_timestamp_migration_with_conflict_protection() {
        let vault = tempdir().expect("create fixture vault");
        let note = vault.path().join("Note.md");
        fs::write(
            &note,
            concat!(
                "---\n",
                "published_at: 2026-01-02T03:04:05Z\n",
                "reviewed_at: 2026-07-23T14:30:00.123+02:00\n",
                "date: 2026-01-02\n",
                "---\nBody\n",
            ),
        )
        .expect("write timestamp note");

        let preview = preview_timestamp_migration(vault.path()).expect("preview migration");
        assert_eq!(preview.scanned_files, 1);
        assert_eq!(preview.candidates.len(), 1);
        assert_eq!(preview.changed_values, 1);
        assert_eq!(preview.issues.len(), 1);
        assert_eq!(preview.issues[0].property.as_deref(), Some("reviewed_at"));

        let candidate = &preview.candidates[0];
        let applied = apply_timestamp_migration(
            vault.path(),
            &[TimestampMigrationTarget {
                expected_modified_millis: candidate.expected_modified_millis,
                expected_size_bytes: candidate.expected_size_bytes,
                relative_path: candidate.relative_path.clone(),
            }],
        )
        .expect("apply migration");
        assert_eq!(applied[0].status, "applied");
        let migrated = fs::read_to_string(&note).expect("read migrated note");
        assert!(!migrated.contains("published_at: 2026-01-02T03:04:05Z"));
        assert!(migrated.contains("reviewed_at: 2026-07-23T14:30:00.123+02:00"));
        assert!(migrated.contains("date: 2026-01-02"));

        let preview = preview_timestamp_migration(vault.path()).expect("preview second migration");
        assert!(preview.candidates.is_empty());

        std::thread::sleep(Duration::from_millis(5));
        fs::write(&note, migrated.replace("Body", "Text")).expect("change note after preview");
        let conflict = apply_timestamp_migration(
            vault.path(),
            &[TimestampMigrationTarget {
                expected_modified_millis: candidate.expected_modified_millis,
                expected_size_bytes: candidate.expected_size_bytes,
                relative_path: candidate.relative_path.clone(),
            }],
        )
        .expect("apply stale migration");
        assert_eq!(conflict[0].status, "conflict");
    }

    #[test]
    fn preserves_an_existing_id_field_in_a_saved_copy() {
        let vault = tempdir().expect("create fixture vault");
        let destination = vault.path().join("Copy.md");
        let original_id = "01JZQ7K8P4A6F2M9V3C5T7X1BY";
        let content = format!("---\nid: {original_id}\n---\n# Copy\n");

        let document =
            create_markdown_file(vault.path(), &destination, &content).expect("create copy");

        assert!(document.content.contains(original_id));
        assert!(document.created_at.is_some());
    }

    #[test]
    fn treats_an_existing_id_field_as_ordinary_user_metadata() {
        let vault = tempdir().expect("create fixture vault");
        let note = vault.path().join("Note.md");
        let original = "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\n---\n# Before\n";
        fs::write(&note, original).expect("write identified note");

        let document = save_markdown_file(vault.path(), "Note.md", "# After\n", original)
            .expect("save without identity guard");

        assert!(document.content.contains("updated_at:"));
        assert!(document.content.ends_with("# After\n"));
        assert_eq!(
            fs::read_to_string(&note).expect("read protected note"),
            document.content
        );
    }

    #[test]
    fn validates_inline_rename_filenames() {
        assert_eq!(
            validate_markdown_filename("  Renamed.md  ").expect("valid filename"),
            "Renamed.md"
        );
        for invalid in [
            "",
            ".hidden.md",
            "../Outside.md",
            "Folder/Note.md",
            "Note.txt",
        ] {
            assert_eq!(
                validate_markdown_filename(invalid)
                    .expect_err("invalid filename should be refused")
                    .code,
                "invalidVault"
            );
        }
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
    fn moves_a_note_into_a_folder_and_updates_path_links() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("Notes")).expect("create Notes folder");
        fs::create_dir(vault.path().join("Archive")).expect("create Archive folder");
        fs::write(
            vault.path().join("Notes/Field.md"),
            "---\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\n---\n# Field\n",
        )
        .expect("write target note");
        fs::write(
            vault.path().join("Reference.md"),
            "---\nid: 01JZQ91T3AA6F2M9V3C5T7X1BZ\n---\n[[Notes/Field]]\n",
        )
        .expect("write reference note");

        let outcome = move_markdown_file_to_folder(vault.path(), "Notes/Field.md", "Archive")
            .expect("move note");

        assert_eq!(
            outcome,
            RenameOutcome {
                relative_path: "Archive/Field.md".to_owned(),
                updated_files: 1,
                updated_links: 1,
            }
        );
        assert!(!vault.path().join("Notes/Field.md").exists());
        assert!(vault.path().join("Archive/Field.md").exists());
        assert_eq!(
            fs::read_to_string(vault.path().join("Reference.md")).expect("read reference note"),
            "---\nid: 01JZQ91T3AA6F2M9V3C5T7X1BZ\n---\n[[Archive/Field]]\n"
        );
    }

    #[test]
    fn reconciles_an_external_move_and_updates_type_and_property_links() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("Notes")).expect("create source folder");
        fs::create_dir_all(vault.path().join("day/run")).expect("create destination folders");
        fs::write(
            vault.path().join("Notes/Old.md"),
            "---\ntype: Old\n---\nMoved note\n",
        )
        .expect("write moved note");
        fs::write(
            vault.path().join("Reference.md"),
            "---\nrelated: \"[[Notes/Old.md]]\"\n---\n[[Notes/Old.md]]\n",
        )
        .expect("write reference note");
        fs::rename(
            vault.path().join("Notes/Old.md"),
            vault.path().join("day/run/Old.md"),
        )
        .expect("move note externally");

        let document =
            reconcile_external_markdown_move(vault.path(), "Notes/Old.md", "day/run/Old.md", true)
                .expect("reconcile external move");

        assert_eq!(document.note_type.as_deref(), Some("day"));
        assert_eq!(document.updated_links, Some(2));
        assert_eq!(document.updated_files, Some(2));
        assert_eq!(
            fs::read_to_string(vault.path().join("day/run/Old.md")).unwrap(),
            "---\ntype: day\n---\nMoved note\n"
        );
        assert_eq!(
            fs::read_to_string(vault.path().join("Reference.md")).unwrap(),
            "---\nrelated: \"[[day/run/Old.md]]\"\n---\n[[day/run/Old.md]]\n"
        );
    }

    #[test]
    fn derives_external_move_types_from_the_first_folder_only() {
        assert_eq!(derived_note_type("Note.md"), None);
        assert_eq!(derived_note_type("Inbox/Note.md"), None);
        assert_eq!(derived_note_type("trash/Note.md"), None);
        assert_eq!(derived_note_type("day/run/Note.md"), Some("day".to_owned()));
        assert_eq!(
            derived_note_type("Projects/Day/Note.md"),
            Some("Projects".to_owned())
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
    fn renames_a_note_without_a_unique_identity() {
        let vault = tempdir().expect("create fixture vault");
        fs::write(vault.path().join("Legacy.md"), "# Legacy\n").expect("write legacy note");

        rename_markdown_file(
            vault.path(),
            "Legacy.md",
            &vault.path().join("Renamed.md"),
            None,
        )
        .expect("rename unidentified note");

        assert!(!vault.path().join("Legacy.md").exists());
        assert!(vault.path().join("Renamed.md").exists());
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
