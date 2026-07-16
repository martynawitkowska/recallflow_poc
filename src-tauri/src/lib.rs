pub mod commands;
pub mod database;
pub mod generation;
pub mod models;
pub mod state;

use models::AppInfo;
use state::{AppState, DatabaseState};
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
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|_| std::io::Error::other("RecallFlow could not locate local storage."))?;
            std::fs::create_dir_all(&app_data_dir)
                .map_err(|_| std::io::Error::other("RecallFlow could not create local storage."))?;
            let pool = tauri::async_runtime::block_on(database::connect(
                &app_data_dir.join("recallflow.sqlite3"),
            ))
            .map_err(std::io::Error::other)?;

            app.manage(AppState::new(AppInfo::new(name, version)));
            app.manage(DatabaseState::new(pool));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_app_info,
            commands::generation::generate_quiz,
            commands::library::list_imported_quizzes,
            commands::library::save_imported_quiz,
            commands::library::delete_imported_quiz,
            commands::library::clear_imported_quizzes,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run RecallFlow");
}
