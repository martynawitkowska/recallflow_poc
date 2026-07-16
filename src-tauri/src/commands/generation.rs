use crate::{
    generation,
    models::{GenerateQuizRequest, QuizFile},
};

#[tauri::command]
pub async fn generate_quiz(request: GenerateQuizRequest) -> Result<QuizFile, String> {
    generation::generate_quiz(request).await
}
