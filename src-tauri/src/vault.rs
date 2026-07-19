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

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::continuity::{
    current_time_millis, ensure_vault_identity, forget_vault as forget_registered_vault,
    is_internal_component, is_internal_relative_path,
    list_remembered_vaults as load_remembered_vaults, list_trash_entries, move_folder_to_trash,
    move_note_to_trash, registry_path, remember_vault, remembered_vault_root,
    restore_folder_from_trash, restore_note_from_trash, RememberedVault, TrashEntry,
};
use crate::links::{plan_rename_link_rewrites_by_path, LinkNote, LinkSource};
use crate::metadata::{
    archive_note, inspect_note_aliases, inspect_note_properties, inspect_wikilinks, restore_note,
    stamp_note_created_at,
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
    metadata_cache: Arc<Mutex<VaultMetadataCache>>,
    rename_transaction: Mutex<()>,
    root: RwLock<Option<PathBuf>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFile {
    pub aliases: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
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
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultAsset {
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note_type: Option<String>,
    pub relative_path: String,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
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
pub async fn archive_vault_file(
    state: State<'_, VaultState>,
    relative_path: String,
    expected_content: String,
) -> Result<VaultDocument, VaultError> {
    let root = selected_vault_root(&state, "archiving a Markdown file")?;
    transition_markdown_lifecycle(
        &root,
        &relative_path,
        &expected_content,
        LifecycleTransition::Archive,
    )
}

#[tauri::command]
pub async fn restore_archived_vault_file(
    state: State<'_, VaultState>,
    relative_path: String,
    expected_content: String,
    destination_status: String,
) -> Result<VaultDocument, VaultError> {
    let root = selected_vault_root(&state, "restoring an archived Markdown file")?;
    transition_markdown_lifecycle(
        &root,
        &relative_path,
        &expected_content,
        LifecycleTransition::Restore(destination_status),
    )
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
pub async fn create_untitled_vault_file(
    state: State<'_, VaultState>,
    content: String,
) -> Result<VaultDocument, VaultError> {
    let root = state
        .root
        .read()
        .map_err(|_| VaultError::state("The selected vault state could not be read."))?
        .clone()
        .ok_or_else(|| VaultError::state("Select a vault before creating a Markdown file."))?;

    create_untitled_markdown_file(&root, &content)
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

fn create_untitled_markdown_file(root: &Path, content: &str) -> Result<VaultDocument, VaultError> {
    for count in 1..=10_000 {
        let name = if count == 1 {
            "Untitled.md".to_owned()
        } else {
            format!("Untitled {count}.md")
        };
        let destination = root.join(name);
        match create_markdown_file(root, &destination, content) {
            Ok(document) => return Ok(document),
            Err(error) if error.code == "vaultFileExists" => continue,
            Err(error) => return Err(error),
        }
    }

    Err(VaultError::state(
        "Anchored could not find an available Untitled filename in this vault.",
    ))
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

fn resolve_vault_directory(root: &Path, relative_path: &str) -> Result<PathBuf, VaultError> {
    let root = canonical_vault_root(root)?;
    if relative_path.trim().is_empty() {
        return Ok(root);
    }

    let requested = Path::new(relative_path);
    if is_internal_relative_path(requested) {
        return Err(VaultError::invalid_file(
            "The hidden .anchored directory is reserved for Anchored data.",
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
            if !file_type.is_file() || !is_markdown(&entry.path()) {
                return Err(VaultError::invalid_file(
                    "Only folders containing Markdown notes and subfolders can be renamed safely right now.",
                ));
            }
        }
    }
    Ok(())
}

fn rename_folder(root: &Path, folder_path: &str, name: &str) -> Result<(), VaultError> {
    let root = canonical_vault_root(root)?;
    let current_relative_path = selected_folder_relative_path(&root, folder_path)?;
    let current_directory = resolve_vault_directory(&root, &current_relative_path)?;
    validate_folder_tree_for_rename(&current_directory)?;
    let destination_relative_path = folder_destination_relative_path(&current_relative_path, name)?;
    let destination_directory = root.join(&destination_relative_path);

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
            folder_path_with_suffix(&current_relative_path, &destination_relative_path, folder)?;
        fs::create_dir(root.join(destination_relative))
            .map_err(|error| VaultError::io("A renamed subfolder could not be created", error))?;
    }

    let mut renamed_count = 0_usize;
    for relative_path in &moved_files {
        let destination_relative = folder_path_with_suffix(
            &current_relative_path,
            &destination_relative_path,
            relative_path,
        )?;
        let destination = root.join(destination_relative);
        rename_markdown_file(&root, relative_path, &destination, None)?;
        renamed_count += 1;
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
            visited_entries += 1;
            if visited_entries > MAX_VAULT_ENTRIES {
                return Err(VaultError::too_large());
            }

            let file_type = entry
                .file_type()
                .map_err(|error| VaultError::io("A vault entry could not be inspected", error))?;

            if directory == root && is_internal_component(&entry.file_name()) {
                continue;
            }

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
                files.push(VaultFile {
                    aliases: Vec::new(),
                    archived_at: None,
                    created_at: None,
                    signature: Some(file_signature_from_metadata(&metadata)),
                    outgoing_links: Vec::new(),
                    name,
                    parent,
                    relative_path: relative_path.to_owned(),
                    status: None,
                    note_type: None,
                });
            } else {
                assets.push(VaultAsset {
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
        .filter(|index| index.version == 1 && index.vault_id == vault_id);
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
        version: 1,
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
    Archive,
    Restore(String),
}

fn current_utc_timestamp() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

fn vault_document(content: String, relative_path: String, size_bytes: u64) -> VaultDocument {
    let properties = inspect_note_properties(&content);
    VaultDocument {
        archived_at: properties.archived_at,
        content,
        created_at: properties.created_at,
        note_type: properties.note_type,
        relative_path,
        size_bytes,
        status: properties.status,
    }
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
    if content.len() as u64 > MAX_MARKDOWN_FILE_BYTES {
        return Err(VaultError::file_too_large());
    }

    let metadata = fs::metadata(&canonical_file)
        .map_err(|error| VaultError::io("The Markdown file could not be inspected", error))?;
    let temporary_path = temporary_sibling_path(&canonical_file)?;
    let write_result = write_atomically(&temporary_path, &canonical_file, content, &metadata);
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    write_result?;

    let size_bytes = content.len() as u64;
    Ok(vault_document(
        content.to_owned(),
        relative_path.to_owned(),
        size_bytes,
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

    let current_status = inspect_note_properties(&current_content).status;
    let updated = match transition {
        LifecycleTransition::Archive => {
            if current_status.as_deref() == Some("archived") {
                return Err(VaultError::archived_read_only());
            }
            archive_note(&current_content, &current_utc_timestamp())
        }
        LifecycleTransition::Restore(destination_status) => {
            if current_status.as_deref() != Some("archived") {
                return Err(VaultError::lifecycle(
                    "Only archived notes can be restored to an editable collection.",
                ));
            }
            restore_note(&current_content, &destination_status)
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

    let metadata = fs::metadata(&canonical_file)
        .map_err(|error| VaultError::io("The Markdown file could not be inspected", error))?;
    let temporary_path = temporary_sibling_path(&canonical_file)?;
    let write_result = write_atomically(&temporary_path, &canonical_file, &updated, &metadata);
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    write_result?;

    Ok(vault_document(
        updated,
        relative_path.to_owned(),
        fs::metadata(&canonical_file)
            .map_err(|error| VaultError::io("The Markdown file could not be inspected", error))?
            .len(),
    ))
}

fn create_markdown_file(
    root: &Path,
    destination: &Path,
    content: &str,
) -> Result<VaultDocument, VaultError> {
    let timestamp = current_utc_timestamp();
    let mut content = stamp_note_created_at(content, &timestamp).map_err(|error| {
        VaultError::lifecycle(format!(
            "Anchored could not add creation metadata safely: {error}."
        ))
    })?;
    if inspect_note_properties(&content).status.as_deref() == Some("archived") {
        content = archive_note(&content, &timestamp).map_err(|error| {
            VaultError::lifecycle(format!(
                "Anchored could not add archive metadata safely: {error}."
            ))
        })?;
    }
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

    let size_bytes = fs::metadata(&destination)
        .map_err(|error| VaultError::io("The created Markdown file could not be inspected", error))?
        .len();
    Ok(vault_document(content, relative_path, size_bytes))
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
    let notes = snapshot
        .files
        .iter()
        .map(|file| LinkNote {
            aliases: file.aliases.clone(),
            identity: None,
            relative_path: file.relative_path.clone(),
        })
        .collect::<Vec<_>>();
    let rewrites =
        plan_rename_link_rewrites_by_path(&notes, &sources, relative_path, &new_relative_path);
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
    if is_internal_relative_path(relative) {
        return Err(VaultError::invalid_file(
            "The hidden .anchored directory is reserved for Anchored data.",
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

    if relative_path.is_empty() || !is_markdown(requested) || is_internal_relative_path(requested) {
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
        canonical_vault_root, create_folder, create_markdown_file, create_named_vault,
        create_untitled_markdown_file, delete_empty_folder, enrich_vault_metadata,
        enrich_vault_metadata_cached, move_markdown_file_to_folder, read_markdown_file,
        recover_rename_transaction, rename_folder, rename_markdown_file,
        resolve_new_vault_markdown_file, save_markdown_file, scan_vault, search_markdown_files,
        transition_markdown_lifecycle, validate_folder_name, validate_new_vault_name,
        write_rename_journal, LifecycleTransition, RenameJournal, RenameJournalEntry,
        RenameJournalPhase, RenameOutcome, VaultMetadataCache, MAX_MARKDOWN_FILE_BYTES,
        MAX_SEARCH_RESULTS, RENAME_JOURNAL_NAME,
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
    fn refuses_to_rename_a_folder_with_non_markdown_files() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("Notes")).expect("create Notes folder");
        fs::write(vault.path().join("Notes/image.png"), "png").expect("write attachment");

        let error =
            rename_folder(vault.path(), "Notes", "Archive").expect_err("reject attachment folder");

        assert_eq!(error.code, "invalidVaultFile");
        assert!(vault.path().join("Notes").exists());
        assert!(!vault.path().join("Archive").exists());
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
    fn archives_restores_and_guards_read_only_notes_atomically() {
        let vault = tempdir().expect("create fixture vault");
        let note = vault.path().join("Note.md");
        let original = "---\nstatus: active\n---\n# Note\n";
        fs::write(&note, original).expect("write note");

        let archived = transition_markdown_lifecycle(
            vault.path(),
            "Note.md",
            original,
            LifecycleTransition::Archive,
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
            LifecycleTransition::Restore("active".to_owned()),
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
    fn lifecycle_transitions_preserve_external_changes() {
        let vault = tempdir().expect("create fixture vault");
        fs::write(vault.path().join("Note.md"), "# External\n").expect("write note");

        let error = transition_markdown_lifecycle(
            vault.path(),
            "Note.md",
            "# Stale\n",
            LifecycleTransition::Archive,
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
    fn creates_a_numbered_untitled_file_without_replacing_existing_notes() {
        let vault = tempdir().expect("create fixture vault");
        fs::write(vault.path().join("Untitled.md"), "# First\n").expect("write first note");
        fs::write(vault.path().join("Untitled 2.md"), "# Second\n").expect("write second note");

        let document =
            create_untitled_markdown_file(vault.path(), "").expect("create numbered untitled note");

        assert_eq!(document.relative_path, "Untitled 3.md");
        assert!(document.content.contains("created_at:"));
        assert!(document.created_at.is_some());
        assert_eq!(
            fs::read_to_string(vault.path().join("Untitled.md")).expect("read first note"),
            "# First\n"
        );
        assert_eq!(
            fs::read_to_string(vault.path().join("Untitled 2.md")).expect("read second note"),
            "# Second\n"
        );
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

        assert_eq!(document.content, "# After\n");
        assert_eq!(
            fs::read_to_string(&note).expect("read protected note"),
            document.content
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
