use crate::{
    commands::redact_secret_error,
    generation,
    models::{GenerateMnemonicRequest, GenerateQuizRequest, QuizFile},
    state::SecretState,
};
use tauri::State;

const QUIZ_GENERATION_ERROR: &str =
    "OpenAI could not generate a quiz. Check the API key and internet connection, then try again.";
const MNEMONIC_GENERATION_ERROR: &str = "The selected AI provider could not generate a mnemonic. Check the API key and internet connection, then try again.";

#[tauri::command]
pub async fn generate_quiz(
    request: GenerateQuizRequest,
    state: State<'_, SecretState>,
) -> Result<QuizFile, String> {
    let api_key = state.api_key(request.provider)?;
    generation::generate_quiz(request, &api_key)
        .await
        .map_err(|error| redact_secret_error(error, &api_key, QUIZ_GENERATION_ERROR))
}

#[tauri::command]
pub async fn generate_mnemonic(
    request: GenerateMnemonicRequest,
    state: State<'_, SecretState>,
) -> Result<String, String> {
    let api_key = state.api_key(request.provider)?;
    generation::generate_mnemonic(request, &api_key)
        .await
        .map_err(|error| redact_secret_error(error, &api_key, MNEMONIC_GENERATION_ERROR))
}
