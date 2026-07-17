use crate::{
    commands::redact_secret_error,
    models::{AiProvider, ApiKeyStatus},
    state::SecretState,
    vault::{remove_file_if_exists, CURRENT_VAULT_FILE, LEGACY_VAULT_FILE},
};
use tauri::{AppHandle, Manager, State};

const VAULT_RESET_ERROR: &str =
    "RecallFlow could not reset the encrypted API key vault. Close other app windows and try again.";
const LEGACY_CLEANUP_ERROR: &str =
    "RecallFlow migrated the API key but could not remove the old vault. Restart the app and try again.";
const API_KEY_SAVE_ERROR: &str =
    "RecallFlow could not save the API key for this session. Check the key and try again.";

#[tauri::command]
pub fn get_ai_api_key_status(
    provider: AiProvider,
    state: State<'_, SecretState>,
) -> Result<ApiKeyStatus, String> {
    state.status(provider)
}

#[tauri::command]
pub fn save_ai_api_key(
    provider: AiProvider,
    api_key: String,
    state: State<'_, SecretState>,
) -> Result<ApiKeyStatus, String> {
    let secret = api_key.clone();
    state
        .save(provider, api_key)
        .map_err(|error| redact_secret_error(error, &secret, API_KEY_SAVE_ERROR))
}

#[tauri::command]
pub fn delete_ai_api_key(
    provider: AiProvider,
    state: State<'_, SecretState>,
) -> Result<ApiKeyStatus, String> {
    state.remove(provider)
}

#[tauri::command]
pub fn reset_api_key_vault(app: AppHandle, state: State<'_, SecretState>) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| VAULT_RESET_ERROR.to_owned())?;
    remove_file_if_exists(&app_data_dir.join(CURRENT_VAULT_FILE))
        .map_err(|_| VAULT_RESET_ERROR.to_owned())?;
    state.clear()
}

#[tauri::command]
pub fn remove_legacy_openai_vault(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| LEGACY_CLEANUP_ERROR.to_owned())?;
    remove_file_if_exists(&app_data_dir.join(LEGACY_VAULT_FILE))
        .map_err(|_| LEGACY_CLEANUP_ERROR.to_owned())
}
