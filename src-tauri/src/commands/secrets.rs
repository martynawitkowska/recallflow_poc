use crate::{
    credentials,
    models::{AiProvider, ApiKeyStatus},
};

#[tauri::command]
pub async fn get_ai_api_key_status(provider: AiProvider) -> Result<ApiKeyStatus, String> {
    credentials::get_api_key_status(provider).await
}

#[tauri::command]
pub async fn save_ai_api_key(
    provider: AiProvider,
    api_key: String,
) -> Result<ApiKeyStatus, String> {
    credentials::save_api_key(provider, api_key).await
}

#[tauri::command]
pub async fn delete_ai_api_key(provider: AiProvider) -> Result<ApiKeyStatus, String> {
    credentials::delete_api_key(provider).await
}
