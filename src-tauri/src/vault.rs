use std::{
    fs,
    path::{Path, PathBuf},
    sync::RwLock,
};

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

const MAX_VAULT_ENTRIES: usize = 50_000;
const MAX_VAULT_DEPTH: usize = 64;

#[derive(Default)]
pub struct VaultState {
    root: RwLock<Option<PathBuf>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFile {
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
    pub files: Vec<VaultFile>,
    pub name: String,
    pub warnings: VaultWarnings,
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
    let snapshot = scan_vault(&root)?;

    let mut stored_root = state
        .root
        .write()
        .map_err(|_| VaultError::state("The selected vault state could not be updated."))?;
    *stored_root = Some(root);

    Ok(Some(snapshot))
}

#[tauri::command]
pub async fn rescan_vault(
    state: State<'_, VaultState>,
) -> Result<Option<VaultSnapshot>, VaultError> {
    let root = state
        .root
        .read()
        .map_err(|_| VaultError::state("The selected vault state could not be read."))?
        .clone();

    root.map(|root| scan_vault(&root)).transpose()
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
            skipped_non_utf8_paths,
            skipped_symlinks,
        },
    })
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::{canonical_vault_root, scan_vault};

    #[test]
    fn scans_nested_markdown_in_stable_order() {
        let vault = tempdir().expect("create fixture vault");
        fs::create_dir(vault.path().join("Notes")).expect("create Notes folder");
        fs::write(vault.path().join("Zulu.md"), "# Zulu").expect("write root note");
        fs::write(vault.path().join("Notes/Alpha.MD"), "# Alpha").expect("write nested note");
        fs::write(vault.path().join("Notes/ignore.txt"), "ignored").expect("write ignored file");

        let snapshot = scan_vault(vault.path()).expect("scan fixture vault");
        let paths = snapshot
            .files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect::<Vec<_>>();

        assert_eq!(paths, vec!["Notes/Alpha.MD", "Zulu.md"]);
        assert_eq!(snapshot.warnings.skipped_symlinks, 0);
    }

    #[test]
    fn rejects_a_file_as_the_vault_root() {
        let vault = tempdir().expect("create fixture vault");
        let file = vault.path().join("note.md");
        fs::write(&file, "# Note").expect("write note");

        let error = canonical_vault_root(&file).expect_err("reject file root");

        assert_eq!(error.code, "invalidVault");
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
}
