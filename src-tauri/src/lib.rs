pub mod metadata;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(vault::VaultState::default())
        .invoke_handler(tauri::generate_handler![
            vault::select_vault,
            vault::rescan_vault,
            vault::read_vault_file,
            vault::save_vault_file,
            vault::create_vault_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
