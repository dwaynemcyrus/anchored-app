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
const MAX_REMEMBERED_VAULTS: usize = 50;
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
        ensure_vault_identity, forget_vault, list_remembered_vaults, load_vault_identity,
        remember_vault, remembered_vault_root, INTERNAL_DIRECTORY_NAME,
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
