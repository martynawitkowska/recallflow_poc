use crate::{models::AppInfo, state::AppState};
use tauri::State;

#[tauri::command]
pub fn get_app_info(state: State<'_, AppState>) -> AppInfo {
    state.app_info()
}
