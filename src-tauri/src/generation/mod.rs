mod providers;

use crate::models::{
    AiProvider, GenerateMnemonicRequest, GenerateQuizRequest, QuestionType, QuizFile,
};
use std::collections::HashSet;

const MIN_QUESTION_COUNT: i64 = 3;
const MAX_QUESTION_COUNT: i64 = 25;
const MAX_MATERIAL_CHARS: usize = 14_000;
const MAX_SOURCE_URL_CHARS: usize = 2_048;
const INVALID_QUIZ_ERROR: &str =
    "The AI provider returned an invalid quiz. Try again with a clearer source.";
const INVALID_MNEMONIC_ERROR: &str = "The AI provider did not return a usable mnemonic. Try again.";
const MAX_MNEMONIC_CONTEXT_CHARS: usize = 8_000;
const MAX_MNEMONIC_CHARS: usize = 1_000;
const QUIZ_INSTRUCTIONS: &str = "Create a precise RecallFlow quiz from the provided source. Return only valid JSON matching the requested schema. Use unique question IDs, at least two unique non-empty answers per question, and copy every correctAnswers value exactly from answers. single_choice and true_false questions must have one correct answer. true_false answers must be ordered as True, then False. Use plausible distractors and do not add facts absent from the source.";
const MNEMONIC_INSTRUCTIONS: &str = "Create one vivid mnemonic that helps the learner remember the correct answer. Use a rhyme, acronym, memorable image, or tiny story. Respond in the same language as the question, use no more than three short sentences, and return only the mnemonic.";

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

pub(crate) struct MnemonicPrompt {
    instructions: &'static str,
    input: String,
    max_output_tokens: usize,
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

impl MnemonicPrompt {
    fn new(request: &GenerateMnemonicRequest) -> Self {
        let explanation = request
            .explanation
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("No explanation was provided.");
        let correct_answers = request
            .correct_answers
            .iter()
            .map(|answer| answer.trim())
            .collect::<Vec<_>>()
            .join(", ");

        Self {
            instructions: MNEMONIC_INSTRUCTIONS,
            input: format!(
                "Question: {}\nCorrect answer: {correct_answers}\nExplanation: {explanation}",
                request.question.trim()
            ),
            max_output_tokens: 220,
        }
    }
}

pub fn validate_mnemonic_request(request: &GenerateMnemonicRequest) -> Result<(), String> {
    if request.provider == AiProvider::Unsupported {
        return Err("The selected mnemonic provider is not available yet.".to_owned());
    }
    if request.api_key.trim().is_empty() {
        return Err("Enter an API key before generating a mnemonic.".to_owned());
    }
    if request.question.trim().is_empty()
        || request.correct_answers.is_empty()
        || request
            .correct_answers
            .iter()
            .any(|answer| answer.trim().is_empty())
    {
        return Err("A question and its correct answer are required.".to_owned());
    }

    let context_chars = request.question.chars().count()
        + request
            .correct_answers
            .iter()
            .map(|answer| answer.chars().count())
            .sum::<usize>()
        + request
            .explanation
            .as_deref()
            .map(str::chars)
            .map(Iterator::count)
            .unwrap_or_default();
    if context_chars > MAX_MNEMONIC_CONTEXT_CHARS {
        return Err("This question is too long for mnemonic generation.".to_owned());
    }

    Ok(())
}

pub fn parse_generated_mnemonic(response: &str) -> Result<String, String> {
    sanitize_mnemonic(response).ok_or_else(|| INVALID_MNEMONIC_ERROR.to_owned())
}

pub(crate) fn sanitize_mnemonic(value: &str) -> Option<String> {
    if value
        .chars()
        .any(|character| character.is_control() && !character.is_whitespace())
    {
        return None;
    }

    let mnemonic = value.split_whitespace().collect::<Vec<_>>().join(" ");
    (!mnemonic.is_empty() && mnemonic.chars().count() <= MAX_MNEMONIC_CHARS).then_some(mnemonic)
}

pub fn validate_generation_request(
    request: &GenerateQuizRequest,
) -> Result<GenerationSource<'_>, String> {
    if request.provider != AiProvider::Openai {
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
    response: &str,
    expected_question_count: usize,
) -> Result<QuizFile, String> {
    let json = extract_json_object(response)?;
    let quiz: QuizFile = serde_json::from_str(json).map_err(|_| INVALID_QUIZ_ERROR.to_owned())?;
    let quiz = normalize_quiz(quiz);

    if quiz.title.is_empty() || quiz.questions.len() != expected_question_count {
        return Err(INVALID_QUIZ_ERROR.to_owned());
    }

    let mut question_ids = HashSet::new();
    for question in &quiz.questions {
        let unique_answers = question.answers.iter().collect::<HashSet<_>>();

        if question.id.is_empty()
            || !question_ids.insert(&question.id)
            || question.question.is_empty()
            || question.answers.len() < 2
            || question.answers.iter().any(String::is_empty)
            || unique_answers.len() != question.answers.len()
            || question.correct_answers.is_empty()
            || question
                .correct_answers
                .iter()
                .collect::<HashSet<_>>()
                .len()
                != question.correct_answers.len()
            || question
                .correct_answers
                .iter()
                .any(|answer| !question.answers.contains(answer))
        {
            return Err(INVALID_QUIZ_ERROR.to_owned());
        }

        match question.question_type {
            QuestionType::SingleChoice if question.correct_answers.len() != 1 => {
                return Err(INVALID_QUIZ_ERROR.to_owned());
            }
            QuestionType::TrueFalse
                if question.correct_answers.len() != 1
                    || question.answers.as_slice() != ["True", "False"] =>
            {
                return Err(INVALID_QUIZ_ERROR.to_owned());
            }
            _ => {}
        }
    }

    Ok(quiz)
}

fn extract_json_object(response: &str) -> Result<&str, String> {
    let response = response.trim();
    let response = response
        .strip_prefix("```json")
        .or_else(|| response.strip_prefix("```"))
        .unwrap_or(response)
        .trim();
    let response = response.strip_suffix("```").unwrap_or(response).trim();
    let start = response
        .find('{')
        .ok_or_else(|| INVALID_QUIZ_ERROR.to_owned())?;
    let end = response
        .rfind('}')
        .ok_or_else(|| INVALID_QUIZ_ERROR.to_owned())?;

    if end <= start {
        return Err(INVALID_QUIZ_ERROR.to_owned());
    }

    Ok(&response[start..=end])
}

fn normalize_quiz(mut quiz: QuizFile) -> QuizFile {
    quiz.title = quiz.title.trim().to_owned();
    quiz.description = quiz
        .description
        .take()
        .map(|description| description.trim().to_owned())
        .filter(|description| !description.is_empty());

    for question in &mut quiz.questions {
        question.id = question.id.trim().to_owned();
        question.question = question.question.trim().to_owned();
        for answer in &mut question.answers {
            *answer = answer.trim().to_owned();
        }
        for answer in &mut question.correct_answers {
            *answer = answer.trim().to_owned();
        }
        question.explanation = question
            .explanation
            .take()
            .map(|explanation| explanation.trim().to_owned())
            .filter(|explanation| !explanation.is_empty());
    }

    quiz
}

pub async fn generate_quiz(request: GenerateQuizRequest) -> Result<QuizFile, String> {
    let source = validate_generation_request(&request)?;
    let question_count = request.question_count as usize;
    let prompt = GenerationPrompt::new(source, question_count);
    let generated_json = providers::generate(
        request.provider,
        request.model.as_deref(),
        request.api_key.trim(),
        &prompt,
    )
    .await?;

    parse_generated_quiz_json(&generated_json, question_count)
}

pub async fn generate_mnemonic(request: GenerateMnemonicRequest) -> Result<String, String> {
    validate_mnemonic_request(&request)?;
    let prompt = MnemonicPrompt::new(&request);
    let generated = providers::generate_mnemonic(
        request.provider,
        request.model.as_deref(),
        request.api_key.trim(),
        &prompt,
    )
    .await?;

    parse_generated_mnemonic(&generated)
}
