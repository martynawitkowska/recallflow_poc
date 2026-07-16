mod providers;

use crate::models::{AiProvider, GenerateQuizRequest, QuestionType, QuizFile};
use std::collections::HashSet;

const MIN_QUESTION_COUNT: i64 = 3;
const MAX_QUESTION_COUNT: i64 = 25;
const MAX_MATERIAL_CHARS: usize = 14_000;
const MAX_SOURCE_URL_CHARS: usize = 2_048;
const INVALID_QUIZ_ERROR: &str =
    "The AI provider returned an invalid quiz. Try again with a clearer source.";
const QUIZ_INSTRUCTIONS: &str = "Create a precise RecallFlow quiz from the provided source. Return only valid JSON matching the requested schema. Use unique question IDs, at least two unique non-empty answers per question, and copy every correctAnswers value exactly from answers. single_choice and true_false questions must have one correct answer. true_false answers must be ordered as True, then False. Use plausible distractors and do not add facts absent from the source.";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GenerationSource<'a> {
    Material(&'a str),
    Url(&'a str),
}

pub(crate) struct GenerationPrompt {
    instructions: &'static str,
    input: String,
    question_count: usize,
    uses_web_search: bool,
}

impl GenerationPrompt {
    fn new(source: GenerationSource<'_>, question_count: usize) -> Self {
        let (input, uses_web_search) = match source {
            GenerationSource::Material(material) => (
                format!(
                    "Create exactly {question_count} active-recall questions grounded only in the study material below. Mix supported question types when appropriate.\n\nStudy material:\n{material}"
                ),
                false,
            ),
            GenerationSource::Url(source_url) => (
                format!(
                    "Use web search to read the exact public lecture or article URL below. Create exactly {question_count} active-recall questions grounded only in that page's content. If the page cannot be read or lacks enough study content, do not invent a quiz.\n\nSource URL:\n{source_url}"
                ),
                true,
            ),
        };

        Self {
            instructions: QUIZ_INSTRUCTIONS,
            input,
            question_count,
            uses_web_search,
        }
    }
}

pub fn validate_generation_request(
    request: &GenerateQuizRequest,
) -> Result<GenerationSource<'_>, String> {
    if request.provider == AiProvider::Unsupported {
        return Err("The selected quiz provider is not available yet.".to_owned());
    }
    if !(MIN_QUESTION_COUNT..=MAX_QUESTION_COUNT).contains(&request.question_count) {
        return Err(format!(
            "Choose between {MIN_QUESTION_COUNT} and {MAX_QUESTION_COUNT} questions."
        ));
    }
    if request.api_key.trim().is_empty() {
        return Err(
            "Enter an API key for the selected provider before generating a quiz.".to_owned(),
        );
    }

    let material = request
        .material
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let source_url = request
        .source_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    match (material, source_url) {
        (Some(_), Some(_)) => {
            Err("Provide either pasted study material or a URL, not both.".to_owned())
        }
        (None, None) => Err("Paste study material or enter a readable URL.".to_owned()),
        (Some(material), None) => {
            if material.chars().count() > MAX_MATERIAL_CHARS {
                return Err(format!(
                    "Study material must be {MAX_MATERIAL_CHARS} characters or fewer. Shorten it and try again."
                ));
            }
            Ok(GenerationSource::Material(material))
        }
        (None, Some(source_url)) => {
            if source_url.chars().count() > MAX_SOURCE_URL_CHARS {
                return Err(
                    "The source URL is too long. Use a direct article or lecture link.".to_owned(),
                );
            }
            let parsed = reqwest::Url::parse(source_url)
                .map_err(|_| "Enter a complete public http:// or https:// URL.".to_owned())?;
            if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
                return Err("Enter a complete public http:// or https:// URL.".to_owned());
            }
            Ok(GenerationSource::Url(source_url))
        }
    }
}

pub fn parse_generated_quiz_json(
    json: &str,
    expected_question_count: usize,
) -> Result<QuizFile, String> {
    let quiz: QuizFile = serde_json::from_str(json).map_err(|_| INVALID_QUIZ_ERROR.to_owned())?;

    if quiz.title.trim().is_empty() || quiz.questions.len() != expected_question_count {
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

pub async fn generate_quiz(request: GenerateQuizRequest) -> Result<QuizFile, String> {
    let source = validate_generation_request(&request)?;
    let question_count = request.question_count as usize;
    let prompt = GenerationPrompt::new(source, question_count);
    let generated_json =
        providers::generate(request.provider, request.api_key.trim(), &prompt).await?;

    parse_generated_quiz_json(&generated_json, question_count)
}
