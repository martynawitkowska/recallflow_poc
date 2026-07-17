use crate::{
    generation,
    models::{GenerateMnemonicRequest, GenerateQuizRequest, QuizFile},
};

#[tauri::command]
pub async fn generate_quiz(request: GenerateQuizRequest) -> Result<QuizFile, String> {
    generation::generate_quiz(request).await
}

#[tauri::command]
pub async fn generate_mnemonic(request: GenerateMnemonicRequest) -> Result<String, String> {
    generation::generate_mnemonic(request).await
}
