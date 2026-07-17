use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

impl AppInfo {
    pub fn new(name: impl Into<String>, version: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            version: version.into(),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum QuestionType {
    SingleChoice,
    MultipleChoice,
    TrueFalse,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuizQuestion {
    pub id: String,
    #[serde(rename = "type")]
    pub question_type: QuestionType,
    pub question: String,
    pub answers: Vec<String>,
    pub correct_answers: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mnemonic: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuizFile {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub questions: Vec<QuizQuestion>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedQuiz {
    pub id: String,
    pub name: String,
    pub size: i64,
    pub imported_at: String,
    pub quiz: QuizFile,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuizAttempt {
    pub id: String,
    pub quiz_id: String,
    pub completed_at: String,
    pub score: i64,
    pub total: i64,
    pub incorrect_question_ids: Vec<String>,
}

#[derive(Clone, Copy, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    Openai,
    Gemini,
    Claude,
    #[serde(other)]
    Unsupported,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyStatus {
    pub configured: bool,
    pub masked_key: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GenerateQuizRequest {
    pub material: Option<String>,
    pub source_url: Option<String>,
    pub provider: AiProvider,
    pub model: Option<String>,
    pub question_count: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GenerateMnemonicRequest {
    pub question: String,
    pub correct_answers: Vec<String>,
    pub explanation: Option<String>,
    pub provider: AiProvider,
    pub model: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMnemonicRequest {
    pub quiz_id: String,
    pub question_id: String,
    pub mnemonic: String,
}
