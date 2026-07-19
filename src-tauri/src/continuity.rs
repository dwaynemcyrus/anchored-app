use std::{
    cmp::Reverse,
    ffi::OsStr,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use ulid::Ulid;

use crate::vault::VaultError;

pub(crate) const INTERNAL_DIRECTORY_NAME: &str = ".anchored";
const VAULT_METADATA_NAME: &str = "vault.json";
const REGISTRY_NAME: &str = "vault-registry.json";
const TRASH_DIRECTORY_NAME: &str = "trash";
const TRASH_INDEX_NAME: &str = "index.json";
const MAX_REMEMBERED_VAULTS: usize = 50;
const MAX_TRASH_ENTRIES: usize = 10_000;
const MAX_METADATA_BYTES: u64 = 64 * 1024;
static CONTINUITY_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultMetadata {
    id: String,
    version: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultRegistryEntry {
    id: String,
    last_opened_at: u64,
    name: String,
    path: String,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultRegistry {
    vaults: Vec<VaultRegistryEntry>,
    version: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RememberedVault {
    pub available: bool,
    pub id: String,
    pub last_opened_at: u64,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrashEntry {
    pub id: String,
    pub is_folder: bool,
    pub name: String,
    pub original_path: String,
    pub trashed_at: u64,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum TrashEntryState {
    Active,
    Moving,
    Restoring,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredTrashEntry {
    id: String,
    #[serde(default)]
    is_folder: bool,
    name: String,
    original_path: String,
    state: TrashEntryState,
    trashed_at: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrashIndex {
    entries: Vec<StoredTrashEntry>,
    version: u32,
}

pub(crate) fn is_internal_component(component: &OsStr) -> bool {
    component
        .to_str()
        .is_some_and(|value| value.eq_ignore_ascii_case(INTERNAL_DIRECTORY_NAME))
}

pub(crate) fn is_internal_relative_path(path: &Path) -> bool {
    path.components()
        .next()
        .is_some_and(|component| is_internal_component(component.as_os_str()))
}

pub(crate) fn ensure_vault_identity(root: &Path) -> Result<String, VaultError> {
    let directory = root.join(INTERNAL_DIRECTORY_NAME);
    match fs::symlink_metadata(&directory) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(VaultError::invalid(
                "The .anchored directory cannot be a symlink.",
            ))
        }
        Ok(metadata) if !metadata.is_dir() => {
            return Err(VaultError::invalid(
                "The .anchored path must be a directory.",
            ))
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(&directory).map_err(|error| {
                VaultError::io("The hidden Anchored directory could not be created", error)
            })?;
            sync_directory(root)?;
        }
        Err(error) => {
            return Err(VaultError::io(
                "The hidden Anchored directory could not be inspected",
                error,
            ))
        }
    }

    let metadata_path = directory.join(VAULT_METADATA_NAME);
    if metadata_path.exists() {
        return read_vault_identity(&metadata_path);
    }

    let id = Ulid::new().to_string();
    let metadata = VaultMetadata { id, version: 1 };
    let bytes = encode_json(&metadata, "The vault identity could not be encoded")?;
    write_new_json_atomically(&metadata_path, &bytes)?;
    read_vault_identity(&metadata_path)
}

pub(crate) fn load_vault_identity(root: &Path) -> Result<String, VaultError> {
    let directory = root.join(INTERNAL_DIRECTORY_NAME);
    let metadata = fs::symlink_metadata(&directory).map_err(|error| {
        VaultError::io(
            "The hidden Anchored directory could not be inspected",
            error,
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(VaultError::invalid(
            "The .anchored path must be a normal directory.",
        ));
    }
    read_vault_identity(&directory.join(VAULT_METADATA_NAME))
}

fn read_vault_identity(path: &Path) -> Result<String, VaultError> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| VaultError::io("The vault identity could not be inspected", error))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(VaultError::invalid(
            "The vault identity must be a normal file.",
        ));
    }
    if metadata.len() > MAX_METADATA_BYTES {
        return Err(VaultError::invalid("The vault identity file is too large."));
    }
    let bytes = fs::read(path)
        .map_err(|error| VaultError::io("The vault identity could not be read", error))?;
    let metadata: VaultMetadata = serde_json::from_slice(&bytes)
        .map_err(|error| VaultError::state(format!("The vault identity is invalid: {error}")))?;
    let parsed = Ulid::from_string(&metadata.id)
        .map_err(|_| VaultError::state("The vault identity is invalid."))?;
    if metadata.version != 1 || parsed.to_string() != metadata.id {
        return Err(VaultError::state("The vault identity is invalid."));
    }
    Ok(metadata.id)
}

pub(crate) fn registry_path(app: &AppHandle) -> Result<PathBuf, VaultError> {
    let directory = app.path().app_data_dir().map_err(|error| {
        VaultError::state(format!(
            "The remembered vault location is unavailable: {error}"
        ))
    })?;
    fs::create_dir_all(&directory).map_err(|error| {
        VaultError::io(
            "The Anchored application data directory could not be created",
            error,
        )
    })?;
    Ok(directory.join(REGISTRY_NAME))
}

pub(crate) fn remember_vault(
    registry_path: &Path,
    root: &Path,
    id: &str,
    name: &str,
    now: u64,
) -> Result<Vec<RememberedVault>, VaultError> {
    validate_vault_id(id)?;
    let canonical_root = fs::canonicalize(root)
        .map_err(|error| VaultError::io("The selected vault could not be remembered", error))?;
    let path = canonical_root
        .to_str()
        .ok_or_else(|| VaultError::state("The selected vault path is not valid UTF-8."))?;
    let mut registry = load_registry(registry_path)?;
    registry
        .vaults
        .retain(|entry| entry.id != id && entry.path != path);
    registry.vaults.push(VaultRegistryEntry {
        id: id.to_owned(),
        last_opened_at: now,
        name: name.to_owned(),
        path: path.to_owned(),
    });
    registry
        .vaults
        .sort_by_key(|entry| Reverse(entry.last_opened_at));
    registry.vaults.truncate(MAX_REMEMBERED_VAULTS);
    write_registry(registry_path, &registry)?;
    Ok(public_registry(&registry))
}

pub(crate) fn list_remembered_vaults(
    registry_path: &Path,
) -> Result<Vec<RememberedVault>, VaultError> {
    Ok(public_registry(&load_registry(registry_path)?))
}

pub(crate) fn forget_vault(
    registry_path: &Path,
    id: &str,
) -> Result<Vec<RememberedVault>, VaultError> {
    validate_vault_id(id)?;
    let mut registry = load_registry(registry_path)?;
    registry.vaults.retain(|entry| entry.id != id);
    write_registry(registry_path, &registry)?;
    Ok(public_registry(&registry))
}

pub(crate) fn remembered_vault_root(registry_path: &Path, id: &str) -> Result<PathBuf, VaultError> {
    validate_vault_id(id)?;
    let registry = load_registry(registry_path)?;
    let entry = registry
        .vaults
        .iter()
        .find(|entry| entry.id == id)
        .ok_or_else(|| VaultError::state("This remembered vault is no longer registered."))?;
    let root = fs::canonicalize(&entry.path)
        .map_err(|error| VaultError::io("The remembered vault could not be opened", error))?;
    let current_id = load_vault_identity(&root)?;
    if current_id != id {
        return Err(VaultError::state(
            "The remembered location now contains a different vault.",
        ));
    }
    Ok(root)
}

pub(crate) fn current_time_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

pub(crate) fn list_trash_entries(root: &Path) -> Result<Vec<TrashEntry>, VaultError> {
    let (_, index) = load_and_recover_trash(root)?;
    Ok(public_trash_entries(&index))
}

pub(crate) fn move_note_to_trash(
    root: &Path,
    relative_path: &str,
    now: u64,
) -> Result<TrashEntry, VaultError> {
    let source = crate::vault::resolve_vault_markdown_file(root, relative_path)?;
    let original_path = Path::new(relative_path);
    validate_original_path(original_path)?;
    let name = original_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| VaultError::invalid_file("The Markdown filename is not valid UTF-8."))?
        .to_owned();
    ensure_vault_identity(root)?;
    let (trash_directory, mut index) = load_and_recover_trash(root)?;
    if index.entries.len() >= MAX_TRASH_ENTRIES {
        return Err(VaultError::state(
            "The Anchored trash index has reached its safe entry limit.",
        ));
    }

    let id = Ulid::new().to_string();
    let destination = trash_file_path(&trash_directory, &id);
    let entry = StoredTrashEntry {
        id: id.clone(),
        is_folder: false,
        name: name.clone(),
        original_path: relative_path.to_owned(),
        state: TrashEntryState::Moving,
        trashed_at: now,
    };
    index.entries.push(entry.clone());
    write_trash_index(&trash_directory, &index)?;

    if let Err(error) = fs::rename(&source, &destination) {
        index.entries.retain(|candidate| candidate.id != id);
        let _ = write_trash_index(&trash_directory, &index);
        return Err(VaultError::io(
            "The Markdown note could not be moved to Trash",
            error,
        ));
    }
    sync_parent(&source)?;
    sync_directory(&trash_directory)?;

    if let Some(stored) = index
        .entries
        .iter_mut()
        .find(|candidate| candidate.id == id)
    {
        stored.state = TrashEntryState::Active;
    }
    if let Err(error) = write_trash_index(&trash_directory, &index) {
        if fs::rename(&destination, &source).is_ok() {
            index.entries.retain(|candidate| candidate.id != id);
            let _ = write_trash_index(&trash_directory, &index);
        }
        return Err(error);
    }

    Ok(TrashEntry {
        id,
        is_folder: false,
        name,
        original_path: relative_path.to_owned(),
        trashed_at: now,
    })
}

pub(crate) fn move_folder_to_trash(
    root: &Path,
    relative_path: &str,
    now: u64,
) -> Result<TrashEntry, VaultError> {
    let original = Path::new(relative_path);
    validate_folder_path(original)?;
    let source = validated_folder_destination(root, original, false)?;
    let metadata = fs::symlink_metadata(&source).map_err(|error| {
        VaultError::io(
            "The folder could not be inspected before moving it to Trash",
            error,
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(VaultError::invalid_file(
            "The selected path is not a folder.",
        ));
    }
    let name = original
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| VaultError::invalid_file("The folder name is not valid UTF-8."))?
        .to_owned();
    ensure_vault_identity(root)?;
    let (trash_directory, mut index) = load_and_recover_trash(root)?;
    if index.entries.len() >= MAX_TRASH_ENTRIES {
        return Err(VaultError::state(
            "The Anchored trash index has reached its safe entry limit.",
        ));
    }
    let id = Ulid::new().to_string();
    let destination = trash_folder_path(&trash_directory, &id);
    let entry = StoredTrashEntry {
        id: id.clone(),
        is_folder: true,
        name: name.clone(),
        original_path: relative_path.to_owned(),
        state: TrashEntryState::Moving,
        trashed_at: now,
    };
    index.entries.push(entry);
    write_trash_index(&trash_directory, &index)?;
    if let Err(error) = fs::rename(&source, &destination) {
        index.entries.retain(|candidate| candidate.id != id);
        let _ = write_trash_index(&trash_directory, &index);
        return Err(VaultError::io(
            "The folder could not be moved to Trash",
            error,
        ));
    }
    sync_parent(&source)?;
    sync_directory(&trash_directory)?;
    if let Some(stored) = index
        .entries
        .iter_mut()
        .find(|candidate| candidate.id == id)
    {
        stored.state = TrashEntryState::Active;
    }
    write_trash_index(&trash_directory, &index)?;
    Ok(TrashEntry {
        id,
        is_folder: true,
        name,
        original_path: relative_path.to_owned(),
        trashed_at: now,
    })
}

pub(crate) fn restore_note_from_trash(
    root: &Path,
    trash_id: &str,
) -> Result<TrashEntry, VaultError> {
    validate_vault_id(trash_id)?;
    let (trash_directory, mut index) = load_and_recover_trash(root)?;
    let entry_index = index
        .entries
        .iter()
        .position(|entry| entry.id == trash_id)
        .ok_or_else(|| VaultError::state("This trashed note is no longer available."))?;
    let entry = index.entries[entry_index].clone();
    let destination = validated_original_destination(root, &entry.original_path, false)?;
    if destination.exists() {
        return Err(VaultError::file_exists());
    }
    if entry.is_folder {
        return Err(VaultError::state("This Trash entry is a folder."));
    }
    let source = trash_file_path(&trash_directory, trash_id);
    index.entries[entry_index].state = TrashEntryState::Restoring;
    write_trash_index(&trash_directory, &index)?;

    let destination = match validated_original_destination(root, &entry.original_path, true) {
        Ok(destination) => destination,
        Err(error) => {
            index.entries[entry_index].state = TrashEntryState::Active;
            let _ = write_trash_index(&trash_directory, &index);
            return Err(error);
        }
    };
    if let Err(error) = fs::rename(&source, &destination) {
        index.entries[entry_index].state = TrashEntryState::Active;
        let _ = write_trash_index(&trash_directory, &index);
        return Err(VaultError::io(
            "The Markdown note could not be restored",
            error,
        ));
    }
    sync_directory(&trash_directory)?;
    sync_parent(&destination)?;

    index.entries.remove(entry_index);
    if let Err(error) = write_trash_index(&trash_directory, &index) {
        if fs::rename(&destination, &source).is_ok() {
            index.entries.push(entry.clone());
            let _ = write_trash_index(&trash_directory, &index);
        }
        return Err(error);
    }

    Ok(TrashEntry {
        id: entry.id,
        is_folder: false,
        name: entry.name,
        original_path: entry.original_path,
        trashed_at: entry.trashed_at,
    })
}

pub(crate) fn restore_folder_from_trash(
    root: &Path,
    trash_id: &str,
) -> Result<TrashEntry, VaultError> {
    validate_vault_id(trash_id)?;
    let (trash_directory, mut index) = load_and_recover_trash(root)?;
    let entry_index = index
        .entries
        .iter()
        .position(|entry| entry.id == trash_id)
        .ok_or_else(|| VaultError::state("This trashed folder is no longer available."))?;
    let entry = index.entries[entry_index].clone();
    if !entry.is_folder {
        return Err(VaultError::state("This Trash entry is a note."));
    }
    let destination = validated_folder_destination(root, Path::new(&entry.original_path), false)?;
    if destination.exists() {
        return Err(VaultError::file_exists());
    }
    let source = trash_folder_path(&trash_directory, trash_id);
    index.entries[entry_index].state = TrashEntryState::Restoring;
    write_trash_index(&trash_directory, &index)?;
    if let Err(error) = fs::rename(&source, &destination) {
        index.entries[entry_index].state = TrashEntryState::Active;
        let _ = write_trash_index(&trash_directory, &index);
        return Err(VaultError::io("The folder could not be restored", error));
    }
    sync_directory(&trash_directory)?;
    sync_parent(&destination)?;
    index.entries.remove(entry_index);
    write_trash_index(&trash_directory, &index)?;
    Ok(TrashEntry {
        id: entry.id,
        is_folder: true,
        name: entry.name,
        original_path: entry.original_path,
        trashed_at: entry.trashed_at,
    })
}

fn load_and_recover_trash(root: &Path) -> Result<(PathBuf, TrashIndex), VaultError> {
    let internal = root.join(INTERNAL_DIRECTORY_NAME);
    let trash_directory = internal.join(TRASH_DIRECTORY_NAME);
    ensure_normal_directory(&trash_directory)?;
    let index_path = trash_directory.join(TRASH_INDEX_NAME);
    let mut index = load_trash_index(&index_path)?;
    let mut changed = false;
    let mut recovered = Vec::with_capacity(index.entries.len());

    for mut entry in index.entries {
        validate_stored_trash_entry(&entry)?;
        let trashed = trash_path(&trash_directory, &entry);
        let trashed_exists = trashed.exists();
        match entry.state {
            TrashEntryState::Active if trashed_exists => recovered.push(entry),
            TrashEntryState::Moving | TrashEntryState::Restoring => {
                let original = if entry.is_folder {
                    validated_folder_destination(root, Path::new(&entry.original_path), false)?
                } else {
                    validated_original_destination(root, &entry.original_path, false)?
                };
                let original_exists = original.exists();
                match entry.state {
                    TrashEntryState::Moving if trashed_exists && !original_exists => {
                        entry.state = TrashEntryState::Active;
                        recovered.push(entry);
                        changed = true;
                    }
                    TrashEntryState::Moving if original_exists && !trashed_exists => {
                        changed = true;
                    }
                    TrashEntryState::Restoring if original_exists && !trashed_exists => {
                        changed = true;
                    }
                    TrashEntryState::Restoring if trashed_exists && !original_exists => {
                        entry.state = TrashEntryState::Active;
                        recovered.push(entry);
                        changed = true;
                    }
                    _ => {
                        return Err(VaultError::state(
                            "The Anchored trash index and stored files do not agree.",
                        ))
                    }
                }
            }
            _ => {
                return Err(VaultError::state(
                    "The Anchored trash index and stored files do not agree.",
                ))
            }
        }
    }
    index = TrashIndex {
        entries: recovered,
        version: 1,
    };
    if changed {
        write_trash_index(&trash_directory, &index)?;
    }
    Ok((trash_directory, index))
}

fn ensure_normal_directory(path: &Path) -> Result<(), VaultError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => Err(
            VaultError::invalid("The Anchored Trash path must be a normal directory."),
        ),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(path).map_err(|error| {
                VaultError::io("The Anchored Trash could not be created", error)
            })?;
            sync_parent(path)
        }
        Err(error) => Err(VaultError::io(
            "The Anchored Trash could not be inspected",
            error,
        )),
    }
}

fn load_trash_index(path: &Path) -> Result<TrashIndex, VaultError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(TrashIndex {
                entries: Vec::new(),
                version: 1,
            })
        }
        Err(error) => {
            return Err(VaultError::io(
                "The Anchored trash index could not be read",
                error,
            ))
        }
    };
    if bytes.len() as u64 > MAX_METADATA_BYTES * 16 {
        return Err(VaultError::state("The Anchored trash index is too large."));
    }
    let index: TrashIndex = serde_json::from_slice(&bytes).map_err(|error| {
        VaultError::state(format!("The Anchored trash index is invalid: {error}"))
    })?;
    if index.version != 1 || index.entries.len() > MAX_TRASH_ENTRIES {
        return Err(VaultError::state("The Anchored trash index is invalid."));
    }
    let mut ids = std::collections::HashSet::new();
    if index
        .entries
        .iter()
        .any(|entry| validate_stored_trash_entry(entry).is_err() || !ids.insert(entry.id.as_str()))
    {
        return Err(VaultError::state("The Anchored trash index is invalid."));
    }
    Ok(index)
}

fn write_trash_index(trash_directory: &Path, index: &TrashIndex) -> Result<(), VaultError> {
    let bytes = encode_json(index, "The Anchored trash index could not be encoded")?;
    write_json_atomically(
        &trash_directory.join(TRASH_INDEX_NAME),
        &bytes,
        "The Anchored trash index could not be written",
    )
}

fn validate_stored_trash_entry(entry: &StoredTrashEntry) -> Result<(), VaultError> {
    validate_vault_id(&entry.id)?;
    let original = Path::new(&entry.original_path);
    if entry.is_folder {
        validate_folder_path(original)?;
    } else {
        validate_original_path(original)?;
    }
    if original.file_name().and_then(|name| name.to_str()) != Some(entry.name.as_str()) {
        return Err(VaultError::state("The Anchored trash index is invalid."));
    }
    Ok(())
}

fn validate_original_path(path: &Path) -> Result<(), VaultError> {
    if !is_valid_relative_path(path)
        || path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_none_or(|extension| !extension.eq_ignore_ascii_case("md"))
        || path
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err(VaultError::invalid_file(
            "The trashed note has an invalid original Markdown path.",
        ));
    }
    Ok(())
}

fn validate_folder_path(path: &Path) -> Result<(), VaultError> {
    if !is_valid_relative_path(path) {
        return Err(VaultError::invalid_file("The folder path is invalid."));
    }
    Ok(())
}

fn is_valid_relative_path(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && !is_internal_relative_path(path)
        && path
            .components()
            .all(|component| matches!(component, std::path::Component::Normal(_)))
}

fn validated_original_destination(
    root: &Path,
    relative_path: &str,
    create_parents: bool,
) -> Result<PathBuf, VaultError> {
    let relative = Path::new(relative_path);
    validate_original_path(relative)?;
    let mut destination = root.to_path_buf();
    let parent = relative.parent().unwrap_or_else(|| Path::new(""));
    for component in parent.components() {
        let std::path::Component::Normal(segment) = component else {
            return Err(VaultError::invalid_file(
                "The trashed note has an invalid original Markdown path.",
            ));
        };
        destination.push(segment);
        match fs::symlink_metadata(&destination) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                return Err(VaultError::invalid_file(
                    "The restore folder must not contain symlinks or files.",
                ))
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && create_parents => {
                fs::create_dir(&destination).map_err(|error| {
                    VaultError::io("A restore folder could not be created", error)
                })?;
                sync_parent(&destination)?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(VaultError::io(
                    "A restore folder could not be inspected",
                    error,
                ))
            }
        }
    }
    Ok(root.join(relative))
}

fn trash_file_path(trash_directory: &Path, id: &str) -> PathBuf {
    trash_directory.join(format!("{id}.md"))
}

fn trash_folder_path(trash_directory: &Path, id: &str) -> PathBuf {
    trash_directory.join(format!("{id}.folder"))
}

fn trash_path(trash_directory: &Path, entry: &StoredTrashEntry) -> PathBuf {
    if entry.is_folder {
        trash_folder_path(trash_directory, &entry.id)
    } else {
        trash_file_path(trash_directory, &entry.id)
    }
}

fn validated_folder_destination(
    root: &Path,
    relative: &Path,
    create_parents: bool,
) -> Result<PathBuf, VaultError> {
    validate_folder_path(relative)?;
    let destination = root.join(relative);
    if create_parents {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| VaultError::io("A folder parent could not be created", error))?;
        }
    }
    Ok(destination)
}

fn public_trash_entries(index: &TrashIndex) -> Vec<TrashEntry> {
    let mut entries = index
        .entries
        .iter()
        .filter(|entry| entry.state == TrashEntryState::Active)
        .map(|entry| TrashEntry {
            id: entry.id.clone(),
            is_folder: entry.is_folder,
            name: entry.name.clone(),
            original_path: entry.original_path.clone(),
            trashed_at: entry.trashed_at,
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| Reverse(entry.trashed_at));
    entries
}

fn public_registry(registry: &VaultRegistry) -> Vec<RememberedVault> {
    registry
        .vaults
        .iter()
        .map(|entry| RememberedVault {
            available: Path::new(&entry.path).is_dir(),
            id: entry.id.clone(),
            last_opened_at: entry.last_opened_at,
            name: entry.name.clone(),
        })
        .collect()
}

fn validate_vault_id(id: &str) -> Result<(), VaultError> {
    let parsed =
        Ulid::from_string(id).map_err(|_| VaultError::state("The vault identity is invalid."))?;
    if parsed.to_string() != id {
        return Err(VaultError::state("The vault identity is invalid."));
    }
    Ok(())
}

fn load_registry(path: &Path) -> Result<VaultRegistry, VaultError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(VaultRegistry {
                vaults: Vec::new(),
                version: 1,
            })
        }
        Err(error) => {
            return Err(VaultError::io(
                "The remembered vault list could not be read",
                error,
            ))
        }
    };
    if bytes.len() as u64 > MAX_METADATA_BYTES {
        return Err(VaultError::state("The remembered vault list is too large."));
    }
    let registry: VaultRegistry = serde_json::from_slice(&bytes).map_err(|error| {
        VaultError::state(format!("The remembered vault list is invalid: {error}"))
    })?;
    if registry.version != 1
        || registry
            .vaults
            .iter()
            .any(|entry| validate_vault_id(&entry.id).is_err() || entry.name.is_empty())
    {
        return Err(VaultError::state("The remembered vault list is invalid."));
    }
    Ok(registry)
}

fn write_registry(path: &Path, registry: &VaultRegistry) -> Result<(), VaultError> {
    let bytes = encode_json(registry, "The remembered vault list could not be encoded")?;
    write_json_atomically(
        path,
        &bytes,
        "The remembered vault list could not be written",
    )
}

fn encode_json<T: Serialize>(value: &T, context: &str) -> Result<Vec<u8>, VaultError> {
    serde_json::to_vec_pretty(value)
        .map_err(|error| VaultError::state(format!("{context}: {error}")))
}

fn temporary_path(destination: &Path) -> Result<PathBuf, VaultError> {
    let parent = destination
        .parent()
        .ok_or_else(|| VaultError::state("The Anchored data file has no parent directory."))?;
    let name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| VaultError::state("The Anchored data filename is invalid."))?;
    Ok(parent.join(format!(
        ".{name}.anchored-{}-{}.tmp",
        std::process::id(),
        CONTINUITY_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
    )))
}

fn write_new_json_atomically(destination: &Path, bytes: &[u8]) -> Result<(), VaultError> {
    let temporary = temporary_path(destination)?;
    write_temporary(&temporary, bytes, "The vault identity could not be written")?;
    match fs::hard_link(&temporary, destination) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let _ = fs::remove_file(&temporary);
            let _ = read_vault_identity(destination)?;
            return Ok(());
        }
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            return Err(VaultError::io(
                "The vault identity could not be installed",
                error,
            ));
        }
    }
    fs::remove_file(&temporary)
        .map_err(|error| VaultError::io("The vault identity temporary file remained", error))?;
    sync_parent(destination)
}

fn write_json_atomically(
    destination: &Path,
    bytes: &[u8],
    context: &str,
) -> Result<(), VaultError> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            VaultError::io("The Anchored data directory could not be created", error)
        })?;
    }
    let temporary = temporary_path(destination)?;
    write_temporary(&temporary, bytes, context)?;
    if let Err(error) = fs::rename(&temporary, destination) {
        let _ = fs::remove_file(&temporary);
        return Err(VaultError::io(context, error));
    }
    sync_parent(destination)
}

fn write_temporary(path: &Path, bytes: &[u8], context: &str) -> Result<(), VaultError> {
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|error| VaultError::io(context, error))?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| VaultError::io(context, error))
}

fn sync_parent(path: &Path) -> Result<(), VaultError> {
    let parent = path
        .parent()
        .ok_or_else(|| VaultError::state("The Anchored data file has no parent directory."))?;
    sync_directory(parent)
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), VaultError> {
    let directory = OpenOptions::new()
        .read(true)
        .open(path)
        .map_err(|error| VaultError::io("An Anchored data directory could not be opened", error))?;
    directory.sync_all().map_err(|error| {
        VaultError::io(
            "An Anchored data directory could not be synchronized",
            error,
        )
    })
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) -> Result<(), VaultError> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::{
        ensure_vault_identity, forget_vault, list_remembered_vaults, list_trash_entries,
        load_trash_index, load_vault_identity, move_folder_to_trash, move_note_to_trash,
        remember_vault, remembered_vault_root, restore_note_from_trash, trash_file_path,
        write_trash_index, TrashEntryState, INTERNAL_DIRECTORY_NAME,
    };

    #[test]
    fn creates_and_reuses_one_opaque_vault_identity() {
        let vault = tempdir().expect("create fixture vault");

        let first = ensure_vault_identity(vault.path()).expect("create identity");
        let second = ensure_vault_identity(vault.path()).expect("reuse identity");

        assert_eq!(first, second);
        assert_eq!(first.len(), 26);
        assert_eq!(load_vault_identity(vault.path()).unwrap(), first);
        assert!(vault
            .path()
            .join(INTERNAL_DIRECTORY_NAME)
            .join("vault.json")
            .is_file());
    }

    #[test]
    fn refuses_malformed_metadata_without_replacing_it() {
        let vault = tempdir().expect("create fixture vault");
        let internal = vault.path().join(INTERNAL_DIRECTORY_NAME);
        fs::create_dir(&internal).expect("create hidden directory");
        fs::write(internal.join("vault.json"), "not json").expect("write invalid metadata");

        let error = ensure_vault_identity(vault.path()).expect_err("reject invalid identity");

        assert_eq!(error.code, "vaultStateError");
        assert_eq!(
            fs::read_to_string(internal.join("vault.json")).unwrap(),
            "not json"
        );
    }

    #[test]
    fn remembers_moves_and_forgets_vaults_without_exposing_paths() {
        let parent = tempdir().expect("create fixture parent");
        let original = parent.path().join("Original");
        let moved = parent.path().join("Moved");
        fs::create_dir(&original).expect("create vault");
        let id = ensure_vault_identity(&original).expect("create identity");
        let registry = parent.path().join("registry.json");

        let remembered =
            remember_vault(&registry, &original, &id, "Original", 100).expect("remember vault");
        assert_eq!(remembered[0].name, "Original");
        assert!(remembered[0].available);
        fs::rename(&original, &moved).expect("move vault");
        assert!(!list_remembered_vaults(&registry).unwrap()[0].available);

        remember_vault(&registry, &moved, &id, "Moved", 200).expect("remember moved vault");
        assert_eq!(
            remembered_vault_root(&registry, &id).unwrap(),
            fs::canonicalize(&moved).unwrap()
        );
        assert!(fs::read_to_string(&registry)
            .unwrap()
            .contains(moved.to_str().unwrap()));

        assert!(forget_vault(&registry, &id).unwrap().is_empty());
        assert!(moved.join(INTERNAL_DIRECTORY_NAME).is_dir());
    }

    #[test]
    fn moves_and_restores_exact_markdown_bytes_and_missing_folders() {
        let vault = tempdir().expect("create fixture vault");
        let notes = vault.path().join("Notes");
        fs::create_dir(&notes).expect("create notes folder");
        let source = notes.join("Original.md");
        let content = b"---\r\nid: 01JZQ7K8P4A6F2M9V3C5T7X1BY\r\n---\r\n# Caf\xC3\xA9\r\n";
        fs::write(&source, content).expect("write source note");

        let trashed =
            move_note_to_trash(vault.path(), "Notes/Original.md", 100).expect("trash note");
        assert!(!source.exists());
        assert_eq!(
            list_trash_entries(vault.path()).unwrap(),
            vec![trashed.clone()]
        );
        fs::remove_dir(&notes).expect("remove empty original folder");

        let restored = restore_note_from_trash(vault.path(), &trashed.id).expect("restore note");
        assert_eq!(restored, trashed);
        assert_eq!(fs::read(&source).expect("read restored note"), content);
        assert!(list_trash_entries(vault.path()).unwrap().is_empty());
    }

    #[test]
    fn refuses_restore_conflicts_without_changing_either_file() {
        let vault = tempdir().expect("create fixture vault");
        let source = vault.path().join("Note.md");
        fs::write(&source, "# Original").expect("write original note");
        let trashed = move_note_to_trash(vault.path(), "Note.md", 100).expect("trash note");
        fs::write(&source, "# Replacement").expect("write replacement note");

        let error = restore_note_from_trash(vault.path(), &trashed.id)
            .expect_err("refuse occupied restore path");

        assert_eq!(error.code, "vaultFileExists");
        assert_eq!(fs::read_to_string(&source).unwrap(), "# Replacement");
        assert_eq!(list_trash_entries(vault.path()).unwrap(), vec![trashed]);
    }

    #[test]
    fn moves_and_restores_a_folder_as_one_trash_entry() {
        let vault = tempdir().expect("create fixture vault");
        let folder = vault.path().join("Projects");
        fs::create_dir(&folder).expect("create folder");
        fs::write(folder.join("Note.md"), "# Note").expect("write note");
        fs::create_dir(folder.join("Assets")).expect("create nested folder");
        fs::write(folder.join("Assets").join("image.png"), b"image").expect("write asset");

        let trashed = move_folder_to_trash(vault.path(), "Projects", 100).expect("trash folder");
        assert!(trashed.is_folder);
        assert!(!folder.exists());
        assert_eq!(
            list_trash_entries(vault.path()).unwrap(),
            vec![trashed.clone()]
        );

        let restored =
            super::restore_folder_from_trash(vault.path(), &trashed.id).expect("restore folder");
        assert_eq!(restored, trashed);
        assert_eq!(
            fs::read_to_string(folder.join("Note.md")).unwrap(),
            "# Note"
        );
        assert!(folder.join("Assets").join("image.png").is_file());
        assert!(list_trash_entries(vault.path()).unwrap().is_empty());
    }

    #[test]
    fn recovers_interrupted_move_and_restore_index_phases() {
        let vault = tempdir().expect("create fixture vault");
        let source = vault.path().join("Note.md");
        fs::write(&source, "# Original").expect("write original note");
        let trashed = move_note_to_trash(vault.path(), "Note.md", 100).expect("trash note");
        let trash_directory = vault.path().join(INTERNAL_DIRECTORY_NAME).join("trash");
        let index_path = trash_directory.join("index.json");
        let mut index = load_trash_index(&index_path).expect("load trash index");
        index.entries[0].state = TrashEntryState::Moving;
        write_trash_index(&trash_directory, &index).expect("write moving phase");

        assert_eq!(
            list_trash_entries(vault.path()).unwrap(),
            vec![trashed.clone()]
        );

        let trash_file = trash_file_path(&trash_directory, &trashed.id);
        fs::rename(&trash_file, &source).expect("simulate restored file installation");
        let mut index = load_trash_index(&index_path).expect("reload trash index");
        index.entries[0].state = TrashEntryState::Restoring;
        write_trash_index(&trash_directory, &index).expect("write restoring phase");

        assert!(list_trash_entries(vault.path()).unwrap().is_empty());
        assert_eq!(fs::read_to_string(source).unwrap(), "# Original");
    }

    #[cfg(unix)]
    #[test]
    fn refuses_restore_through_a_symlinked_original_folder() {
        use std::os::unix::fs::symlink;

        let vault = tempdir().expect("create fixture vault");
        let outside = tempdir().expect("create outside folder");
        fs::create_dir(vault.path().join("Notes")).expect("create notes folder");
        fs::write(vault.path().join("Notes/Note.md"), "# Original").expect("write original note");
        let trashed = move_note_to_trash(vault.path(), "Notes/Note.md", 100).expect("trash note");
        fs::remove_dir(vault.path().join("Notes")).expect("remove notes folder");
        symlink(outside.path(), vault.path().join("Notes")).expect("link outside folder");

        let error = restore_note_from_trash(vault.path(), &trashed.id)
            .expect_err("refuse symlinked restore");

        assert_eq!(error.code, "invalidVaultFile");
        assert!(!outside.path().join("Note.md").exists());
        assert_eq!(list_trash_entries(vault.path()).unwrap(), vec![trashed]);
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlinked_internal_directory() {
        use std::os::unix::fs::symlink;

        let vault = tempdir().expect("create fixture vault");
        let outside = tempdir().expect("create outside directory");
        symlink(outside.path(), vault.path().join(INTERNAL_DIRECTORY_NAME))
            .expect("link hidden directory");

        let error = ensure_vault_identity(vault.path()).expect_err("reject symlink");

        assert_eq!(error.code, "invalidVault");
    }
}
