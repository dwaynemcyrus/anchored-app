mod continuity;
pub mod links;
pub mod metadata;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(vault::VaultState::default())
        .invoke_handler(tauri::generate_handler![
            vault::select_vault,
            vault::create_vault,
            vault::create_vault_folder,
            vault::rename_vault_folder,
            vault::delete_vault_folder,
            vault::move_vault_folder_to_trash,
            vault::list_remembered_vaults,
            vault::open_remembered_vault,
            vault::forget_vault,
            vault::rescan_vault,
            vault::list_vault_trash,
            vault::move_vault_file_to_trash,
            vault::restore_vault_file_from_trash,
            vault::restore_vault_folder_from_trash,
            vault::search_vault,
            vault::read_vault_file,
            vault::save_vault_file,
            vault::create_vault_file,
            vault::create_untitled_vault_file,
            vault::move_vault_file_to_folder,
            vault::rename_vault_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
