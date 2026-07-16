use crate::models::{GenerateQuizRequest, QuestionType, QuizFile};
use serde::Deserialize;
use std::collections::HashSet;

const OPENAI_MODEL: &str = "gpt-5.4-mini";
const QUESTION_COUNT: usize = 8;
const MAX_MATERIAL_CHARS: usize = 14_000;
const INVALID_QUIZ_ERROR: &str =
    "OpenAI returned an invalid quiz. Try again with clearer study material.";
const GENERATION_ERROR: &str =
    "OpenAI could not generate the quiz. Check your connection and try again.";

#[derive(Deserialize)]
struct OpenAiResponse {
    #[serde(default)]
    output: Vec<OpenAiOutputItem>,
}

#[derive(Deserialize)]
struct OpenAiOutputItem {
    #[serde(default)]
    content: Vec<OpenAiContentItem>,
}

#[derive(Deserialize)]
struct OpenAiContentItem {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

pub fn validate_generation_request(request: &GenerateQuizRequest) -> Result<&str, String> {
    let material = request.material.trim();
    if material.is_empty() {
        return Err("Paste study material before generating a quiz.".to_owned());
    }
    if material.chars().count() > MAX_MATERIAL_CHARS {
        return Err(format!(
            "Study material must be {MAX_MATERIAL_CHARS} characters or fewer. Shorten it and try again."
        ));
    }
    if request.api_key.trim().is_empty() {
        return Err("Enter an OpenAI API key before generating a quiz.".to_owned());
    }

    Ok(material)
}

pub fn parse_generated_quiz_json(json: &str) -> Result<QuizFile, String> {
    let quiz: QuizFile = serde_json::from_str(json).map_err(|_| INVALID_QUIZ_ERROR.to_owned())?;

    if quiz.title.trim().is_empty() || quiz.questions.len() != QUESTION_COUNT {
        return Err(INVALID_QUIZ_ERROR.to_owned());
    }

    let mut question_ids = HashSet::new();
    for question in &quiz.questions {
        let answers = question
            .answers
            .iter()
            .map(|answer| answer.trim())
            .collect::<Vec<_>>();
        let unique_answers = answers.iter().copied().collect::<HashSet<_>>();

        if question.id.trim().is_empty()
            || !question_ids.insert(question.id.trim())
            || question.question.trim().is_empty()
            || answers.len() < 2
            || answers.iter().any(|answer| answer.is_empty())
            || unique_answers.len() != answers.len()
            || question.correct_answers.is_empty()
            || question
                .correct_answers
                .iter()
                .any(|answer| !answers.contains(&answer.trim()))
        {
            return Err(INVALID_QUIZ_ERROR.to_owned());
        }

        match question.question_type {
            QuestionType::SingleChoice if question.correct_answers.len() != 1 => {
                return Err(INVALID_QUIZ_ERROR.to_owned());
            }
            QuestionType::TrueFalse
                if question.correct_answers.len() != 1
                    || answers.as_slice() != ["True", "False"] =>
            {
                return Err(INVALID_QUIZ_ERROR.to_owned());
            }
            _ => {}
        }
    }

    Ok(quiz)
}

#[tauri::command]
pub async fn generate_quiz(request: GenerateQuizRequest) -> Result<QuizFile, String> {
    let material = validate_generation_request(&request)?;
    let prompt = format!(
        "Create exactly {QUESTION_COUNT} active-recall questions grounded only in the study material below. Mix supported question types when appropriate.\n\nStudy material:\n{material}"
    );
    let payload = serde_json::json!({
        "model": OPENAI_MODEL,
        "store": false,
        "reasoning": { "effort": "low" },
        "instructions": "Create a precise RecallFlow quiz from the user's study material. Use unique question IDs, at least two unique non-empty answers per question, and copy every correctAnswers value exactly from answers. single_choice and true_false questions must have one correct answer. true_false answers must be ordered as True, then False. Use plausible distractors and do not add facts absent from the material.",
        "input": prompt,
        "max_output_tokens": 3_200,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "recallflow_quiz",
                "strict": true,
                "schema": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["title", "description", "questions"],
                    "properties": {
                        "title": { "type": "string" },
                        "description": { "type": "string" },
                        "questions": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["id", "type", "question", "answers", "correctAnswers", "explanation"],
                                "properties": {
                                    "id": { "type": "string" },
                                    "type": { "type": "string", "enum": ["single_choice", "multiple_choice", "true_false"] },
                                    "question": { "type": "string" },
                                    "answers": { "type": "array", "items": { "type": "string" } },
                                    "correctAnswers": { "type": "array", "items": { "type": "string" } },
                                    "explanation": { "type": "string" }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(request.api_key.trim())
        .json(&payload)
        .send()
        .await
        .map_err(|_| GENERATION_ERROR.to_owned())?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED
        || response.status() == reqwest::StatusCode::FORBIDDEN
    {
        return Err("OpenAI rejected the API key. Check it and try again.".to_owned());
    }
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("OpenAI is rate limiting requests. Wait a moment and try again.".to_owned());
    }
    if !response.status().is_success() {
        return Err(GENERATION_ERROR.to_owned());
    }

    let response: OpenAiResponse = response
        .json()
        .await
        .map_err(|_| GENERATION_ERROR.to_owned())?;
    let generated_json = response
        .output
        .into_iter()
        .flat_map(|item| item.content)
        .find_map(|content| {
            (content.content_type == "output_text")
                .then_some(content.text)
                .flatten()
        })
        .ok_or_else(|| {
            "OpenAI did not return a quiz. Try again with different study material.".to_owned()
        })?;

    parse_generated_quiz_json(&generated_json)
}
