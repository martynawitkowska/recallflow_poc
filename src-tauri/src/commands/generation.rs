use crate::{
    commands::redact_secret_error,
    credentials, generation,
    models::{GenerateMnemonicRequest, GenerateQuizRequest},
    state::GenerationRuns,
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

const QUIZ_GENERATION_ERROR: &str =
    "OpenAI could not generate a quiz. Check the API key and internet connection, then try again.";
const MNEMONIC_GENERATION_ERROR: &str = "The selected AI provider could not generate a mnemonic. Check the API key and internet connection, then try again.";

#[tauri::command]
pub async fn generate_quiz(
    app: AppHandle,
    runs: State<'_, GenerationRuns>,
    request: GenerateQuizRequest,
    run_id: String,
) -> Result<generation::GroundedGenerationResult, String> {
    let api_key = credentials::get_api_key(request.provider).await?;
    let cancellation = runs.begin(&run_id)?;
    let event_app = app.clone();
    let reporter: generation::ProgressReporter = Arc::new(move |progress| {
        let _ = event_app.emit("quiz-generation-progress", progress);
    });
    let result = generation::generate_quiz_with_cancellation(
        request,
        &api_key,
        cancellation,
        &run_id,
        Some(reporter),
    )
    .await
    .map_err(|error| redact_secret_error(error, &api_key, QUIZ_GENERATION_ERROR));
    runs.finish(&run_id);
    result
}

#[tauri::command]
pub fn cancel_quiz_generation(runs: State<'_, GenerationRuns>, run_id: String) {
    runs.cancel(&run_id);
}

#[tauri::command]
pub async fn generate_mnemonic(request: GenerateMnemonicRequest) -> Result<String, String> {
    let api_key = credentials::get_api_key(request.provider).await?;
    generation::generate_mnemonic(request, &api_key)
        .await
        .map_err(|error| redact_secret_error(error, &api_key, MNEMONIC_GENERATION_ERROR))
}
