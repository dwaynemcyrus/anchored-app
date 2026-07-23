use std::{
    path::{Path, PathBuf},
    sync::mpsc::{self, Receiver, RecvTimeoutError, Sender},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use crate::continuity::is_vault_trash_relative_path;
use notify::{
    event::{CreateKind, ModifyKind, RemoveKind, RenameMode},
    Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

const DEBOUNCE_WINDOW: Duration = Duration::from_millis(200);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultChange {
    pub kind: String,
    pub relative_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_relative_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultChangeBatch {
    pub changes: Vec<VaultChange>,
    pub vault_id: String,
}

pub struct VaultWatcher {
    stop: Option<Sender<WatcherMessage>>,
    thread: Option<JoinHandle<()>>,
}

impl VaultWatcher {
    pub fn start(app: AppHandle, root: PathBuf, vault_id: String) -> Result<Self, String> {
        let (message_sender, message_receiver) = mpsc::channel();
        let event_sender = message_sender.clone();
        let mut native_watcher = notify::recommended_watcher(move |event| {
            let _ = event_sender.send(WatcherMessage::Event(event));
        })
        .map_err(|error| format!("The vault watcher could not start: {error}"))?;

        native_watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|error| format!("The vault watcher could not watch the vault: {error}"))?;

        let thread = thread::spawn(move || {
            run_event_loop(app, root, vault_id, native_watcher, message_receiver);
        });

        Ok(Self {
            stop: Some(message_sender),
            thread: Some(thread),
        })
    }
}

impl Drop for VaultWatcher {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(WatcherMessage::Stop);
        }
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn run_event_loop(
    app: AppHandle,
    root: PathBuf,
    vault_id: String,
    _native_watcher: RecommendedWatcher,
    message_receiver: Receiver<WatcherMessage>,
) {
    let mut pending = Vec::new();
    let mut flush_at: Option<Instant> = None;

    loop {
        let timeout = flush_at
            .map(|deadline| deadline.saturating_duration_since(Instant::now()))
            .unwrap_or(Duration::from_secs(60));

        match message_receiver.recv_timeout(timeout) {
            Ok(WatcherMessage::Stop) | Err(RecvTimeoutError::Disconnected) => break,
            Ok(WatcherMessage::Event(event)) => {
                if let Ok(event) = event {
                    pending.extend(normalize_event(&root, event));
                }
                flush_at = Some(Instant::now() + DEBOUNCE_WINDOW);
            }
            Err(RecvTimeoutError::Timeout) => {
                emit_pending(&app, &vault_id, &mut pending);
                flush_at = None;
            }
        }
    }

    emit_pending(&app, &vault_id, &mut pending);
}

enum WatcherMessage {
    Event(notify::Result<Event>),
    Stop,
}

fn emit_pending(app: &AppHandle, vault_id: &str, pending: &mut Vec<VaultChange>) {
    if pending.is_empty() {
        return;
    }

    pending.sort_by(|left, right| {
        left.relative_path
            .cmp(&right.relative_path)
            .then(left.kind.cmp(&right.kind))
    });
    pending.dedup_by(|left, right| {
        left.kind == right.kind
            && left.relative_path == right.relative_path
            && left.old_relative_path == right.old_relative_path
    });

    let _ = app.emit(
        "vault-changed",
        VaultChangeBatch {
            changes: std::mem::take(pending),
            vault_id: vault_id.to_owned(),
        },
    );
}

fn normalize_event(root: &Path, event: Event) -> Vec<VaultChange> {
    let kind = match event.kind {
        EventKind::Create(CreateKind::File | CreateKind::Folder | CreateKind::Any) => "created",
        EventKind::Remove(RemoveKind::File | RemoveKind::Folder | RemoveKind::Any) => "deleted",
        EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => "renamed",
        EventKind::Modify(ModifyKind::Name(RenameMode::From | RenameMode::To)) => "moved",
        EventKind::Modify(_) => "modified",
        _ => return Vec::new(),
    };

    let paths: Vec<String> = event
        .paths
        .iter()
        .filter_map(|path| relative_visible_path(root, path))
        .collect();

    if paths.is_empty() {
        return Vec::new();
    }

    if kind == "renamed" && paths.len() >= 2 {
        return vec![VaultChange {
            kind: kind.to_owned(),
            relative_path: paths[1].clone(),
            old_relative_path: Some(paths[0].clone()),
        }];
    }

    paths
        .into_iter()
        .map(|relative_path| VaultChange {
            kind: kind.to_owned(),
            relative_path,
            old_relative_path: None,
        })
        .collect()
}

fn relative_visible_path(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let components: Vec<_> = relative.components().collect();
    if components.is_empty()
        || components.iter().any(|component| {
            component
                .as_os_str()
                .to_str()
                .is_none_or(|value| value.starts_with('.'))
        })
    {
        return None;
    }
    if is_vault_trash_relative_path(relative) {
        return None;
    }
    relative.to_str().map(|value| value.replace('\\', "/"))
}

#[cfg(test)]
mod tests {
    use super::{normalize_event, relative_visible_path};
    use notify::{event::CreateKind, Event, EventKind};
    use std::path::Path;

    #[test]
    fn ignores_internal_and_hidden_paths() {
        let root = Path::new("/vault");
        assert_eq!(
            relative_visible_path(root, Path::new("/vault/.anchored/a")),
            None
        );
        assert_eq!(
            relative_visible_path(root, Path::new("/vault/Notes/.draft.md")),
            None
        );
        assert_eq!(
            relative_visible_path(root, Path::new("/vault/trash/opaque.md")),
            None
        );
    }

    #[test]
    fn normalizes_created_paths() {
        let event = Event {
            kind: EventKind::Create(CreateKind::File),
            paths: vec!["/vault/Notes/New.md".into()],
            attrs: Default::default(),
        };
        let changes = normalize_event(Path::new("/vault"), event);
        assert_eq!(changes[0].kind, "created");
        assert_eq!(changes[0].relative_path, "Notes/New.md");
    }
}
