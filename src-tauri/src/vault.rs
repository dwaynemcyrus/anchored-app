use std::{
    fs,
    fs::OpenOptions,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        RwLock,
    },
};

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::metadata::{
    assign_new_note_identity, generate_note_id, inspect_note_identity, NoteIdentityStatus,
};

const MAX_VAULT_ENTRIES: usize = 50_000;
const MAX_VAULT_DEPTH: usize = 64;
const MAX_MARKDOWN_FILE_BYTES: u64 = 10 * 1024 * 1024;
static TEMPORARY_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

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
pub struct VaultDocument {
    pub content: String,
    pub relative_path: String,
    pub size_bytes: u64,
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

    use tempfile::tempdir;

    use super::{
        canonical_vault_root, create_markdown_file, inspect_note_identity, read_markdown_file,
        save_markdown_file, scan_vault, NoteIdentityStatus, MAX_MARKDOWN_FILE_BYTES,
    };

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
