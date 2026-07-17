use crate::{
    models::{AiProvider, ApiKeyStatus},
    state::SecretState,
};
use tauri::State;

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
    state.save(provider, api_key)
}

#[tauri::command]
pub fn delete_ai_api_key(
    provider: AiProvider,
    state: State<'_, SecretState>,
) -> Result<ApiKeyStatus, String> {
    state.remove(provider)
}
