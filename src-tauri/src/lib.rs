pub mod commands;
pub mod models;
pub mod state;

use models::AppInfo;
use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let name = app
                .config()
                .product_name
                .clone()
                .unwrap_or_else(|| env!("CARGO_PKG_NAME").to_owned());
            let version = app.package_info().version.to_string();
            app.manage(AppState::new(AppInfo::new(name, version)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::app::get_app_info])
        .run(tauri::generate_context!())
        .expect("failed to run RecallFlow");
}
