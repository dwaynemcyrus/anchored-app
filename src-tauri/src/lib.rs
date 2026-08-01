mod continuity;
mod db;
pub mod links;
pub mod metadata;
mod vault;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Registered before any other plugin so a second launch is turned away
    // before it can touch a vault. Two processes projecting the same vault
    // would each treat the other's writes as external edits and rewrite them
    // back, indefinitely. A second launch raises the existing window instead.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        use tauri::Manager;
        if let Some(window) = app.webview_windows().values().next() {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_process::init())?;
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            Ok(())
        })
        .manage(vault::VaultState::default())
        .invoke_handler(tauri::generate_handler![
            vault::select_vault,
            vault::create_vault,
            vault::create_vault_folder,
            vault::rename_vault_folder,
            vault::move_vault_folder,
            vault::delete_vault_folder,
            vault::move_vault_folder_to_trash,
            vault::list_remembered_vaults,
            vault::open_remembered_vault,
            vault::open_development_vault,
            vault::forget_vault,
            vault::rescan_vault,
            vault::rescan_vault_paths,
            vault::vault_storage_status,
            vault::verify_vault_database,
            vault::create_vault_database_backup,
            vault::reconcile_vault_file_move,
            vault::preview_vault_timestamp_migration,
            vault::apply_vault_timestamp_migration,
            vault::list_vault_trash,
            vault::move_vault_file_to_trash,
            vault::restore_vault_file_from_trash,
            vault::restore_vault_folder_from_trash,
            vault::search_vault,
            vault::read_vault_file,
            vault::watch_vault_file,
            vault::stop_vault_file_watch,
            vault::watch_vault_tree,
            vault::stop_vault_tree_watch,
            vault::save_vault_file,
            vault::create_vault_conflict_copy,
            vault::list_vault_conflicts,
            vault::list_vault_note_versions,
            vault::archive_vault_file,
            vault::restore_archived_vault_file,
            vault::move_vault_file_to_workbench,
            vault::open_scratchpad,
            vault::create_scratchpad_note,
            vault::save_scratchpad_note,
            vault::latest_scratchpad_note,
            vault::list_scratchpad_notes,
            vault::read_scratchpad_note,
            vault::scratchpad_link_candidates,
            vault::create_vault_file,
            vault::create_inbox_vault_file,
            vault::create_untitled_vault_file,
            vault::move_vault_file_to_folder,
            vault::rename_vault_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
