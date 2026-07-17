mod providers;

use crate::models::{
    AiProvider, GenerateMnemonicRequest, GenerateQuizRequest, QuestionType, QuizFile,
};
use serde::{Deserialize, Serialize};
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
const MAX_CANDIDATES_PER_CHUNK: usize = 2;
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

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CandidateBatch {
    pub candidates: Vec<QuestionCandidate>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct QuestionCandidate {
    pub candidate_id: String,
    pub chunk_id: String,
    pub topic: String,
    pub question_type: QuestionType,
    pub question: String,
    pub answers: Vec<String>,
    pub correct_answers: Vec<String>,
    pub explanation: String,
    pub evidence_quote: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum VerificationReason {
    Accepted,
    Unsupported,
    ContextDependent,
    LectureBound,
    QualificationLost,
    Overgeneralized,
    AmbiguousChoices,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct VerificationDecision {
    pub candidate_id: String,
    pub supported: bool,
    pub standalone: bool,
    pub portable: bool,
    pub qualifications_preserved: bool,
    pub not_overgeneralized: bool,
    pub choices_unambiguous: bool,
    pub reason: VerificationReason,
}

impl VerificationDecision {
    pub(crate) fn accepted(&self) -> bool {
        self.supported
            && self.standalone
            && self.portable
            && self.qualifications_preserved
            && self.not_overgeneralized
            && self.choices_unambiguous
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct VerificationBatch {
    pub decisions: Vec<VerificationDecision>,
}

pub(crate) struct CandidatePrompt {
    instructions: &'static str,
    input: String,
}

pub(crate) struct VerificationPrompt {
    instructions: &'static str,
    input: String,
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

    if quiz.title.is_empty()
        || quiz.questions.is_empty()
        || quiz.questions.len() > expected_question_count
    {
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

pub(crate) fn parse_candidate_batch_json(
    response: &str,
    expected_chunk_id: &str,
) -> Result<CandidateBatch, String> {
    let json = extract_json_object(response)?;
    let mut batch: CandidateBatch =
        serde_json::from_str(json).map_err(|_| INVALID_QUIZ_ERROR.to_owned())?;
    if batch.candidates.len() > MAX_CANDIDATES_PER_CHUNK {
        return Err(INVALID_QUIZ_ERROR.to_owned());
    }

    let mut ids = HashSet::new();
    for candidate in &mut batch.candidates {
        normalize_candidate(candidate);
        if candidate.chunk_id != expected_chunk_id
            || candidate.candidate_id.is_empty()
            || !ids.insert(candidate.candidate_id.clone())
            || candidate.topic.is_empty()
            || candidate.question.is_empty()
            || candidate.explanation.is_empty()
            || candidate.evidence_quote.is_empty()
            || !valid_answers(
                candidate.question_type,
                &candidate.answers,
                &candidate.correct_answers,
            )
        {
            return Err(INVALID_QUIZ_ERROR.to_owned());
        }
    }

    Ok(batch)
}

pub(crate) fn parse_verification_batch_json(
    response: &str,
    expected_candidate_ids: &[String],
) -> Result<VerificationBatch, String> {
    let json = extract_json_object(response)?;
    let mut batch: VerificationBatch =
        serde_json::from_str(json).map_err(|_| INVALID_QUIZ_ERROR.to_owned())?;
    let expected = expected_candidate_ids.iter().collect::<HashSet<_>>();
    let mut seen = HashSet::new();

    for decision in &mut batch.decisions {
        decision.candidate_id = decision.candidate_id.trim().to_owned();
        if !expected.contains(&decision.candidate_id) || !seen.insert(decision.candidate_id.clone())
        {
            return Err(INVALID_QUIZ_ERROR.to_owned());
        }
    }
    if seen.len() != expected.len() {
        return Err(INVALID_QUIZ_ERROR.to_owned());
    }

    Ok(batch)
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

fn normalize_candidate(candidate: &mut QuestionCandidate) {
    candidate.candidate_id = candidate.candidate_id.trim().to_owned();
    candidate.chunk_id = candidate.chunk_id.trim().to_owned();
    candidate.topic = candidate.topic.trim().to_owned();
    candidate.question = candidate.question.trim().to_owned();
    candidate.explanation = candidate.explanation.trim().to_owned();
    candidate.evidence_quote = candidate.evidence_quote.trim().to_owned();
    for answer in &mut candidate.answers {
        *answer = answer.trim().to_owned();
    }
    for answer in &mut candidate.correct_answers {
        *answer = answer.trim().to_owned();
    }
}

fn valid_answers(
    question_type: QuestionType,
    answers: &[String],
    correct_answers: &[String],
) -> bool {
    answers.len() >= 2
        && answers.iter().all(|answer| !answer.is_empty())
        && answers.iter().collect::<HashSet<_>>().len() == answers.len()
        && !correct_answers.is_empty()
        && correct_answers.iter().collect::<HashSet<_>>().len() == correct_answers.len()
        && correct_answers
            .iter()
            .all(|answer| answers.contains(answer))
        && match question_type {
            QuestionType::SingleChoice => correct_answers.len() == 1,
            QuestionType::TrueFalse => correct_answers.len() == 1 && answers == ["True", "False"],
            QuestionType::MultipleChoice => true,
        }
}

pub async fn generate_quiz(
    request: GenerateQuizRequest,
    api_key: &str,
) -> Result<QuizFile, String> {
    let source = validate_generation_request(&request)?;
    let question_count = request.question_count as usize;
    let prompt = GenerationPrompt::new(source, question_count);
    let generated_json =
        providers::generate(request.provider, request.model.as_deref(), api_key, &prompt).await?;

    parse_generated_quiz_json(&generated_json, question_count)
}

pub async fn generate_mnemonic(
    request: GenerateMnemonicRequest,
    api_key: &str,
) -> Result<String, String> {
    validate_mnemonic_request(&request)?;
    let prompt = MnemonicPrompt::new(&request);
    let generated =
        providers::generate_mnemonic(request.provider, request.model.as_deref(), api_key, &prompt)
            .await?;

    parse_generated_mnemonic(&generated)
}

#[cfg(test)]
mod grounded_contract_tests {
    use super::{
        parse_candidate_batch_json, parse_generated_quiz_json, parse_verification_batch_json,
    };
    use serde_json::json;

    fn candidate(id: &str) -> serde_json::Value {
        json!({
            "candidate_id": id,
            "chunk_id": "chunk-0001",
            "topic": "Cell biology",
            "question_type": "single_choice",
            "question": "What produces ATP?",
            "answers": ["Cellular respiration", "Diffusion"],
            "correct_answers": ["Cellular respiration"],
            "explanation": "Cellular respiration produces ATP.",
            "evidence_quote": "Cellular respiration produces ATP."
        })
    }

    fn decision(id: &str) -> serde_json::Value {
        json!({
            "candidate_id": id,
            "supported": true,
            "standalone": true,
            "portable": true,
            "qualifications_preserved": true,
            "not_overgeneralized": true,
            "choices_unambiguous": true,
            "reason": "accepted"
        })
    }

    #[test]
    fn candidate_batches_accept_empty_and_valid_results() {
        assert!(
            parse_candidate_batch_json(r#"{"candidates":[]}"#, "chunk-0001")
                .unwrap()
                .candidates
                .is_empty()
        );
        let parsed = parse_candidate_batch_json(
            &json!({ "candidates": [candidate("candidate-1")] }).to_string(),
            "chunk-0001",
        )
        .unwrap();
        assert_eq!(parsed.candidates[0].candidate_id, "candidate-1");
    }

    #[test]
    fn candidate_batches_reject_excessive_malformed_and_duplicate_results() {
        assert!(parse_candidate_batch_json(
            &json!({ "candidates": [candidate("1"), candidate("2"), candidate("3")] }).to_string(),
            "chunk-0001",
        )
        .is_err());
        assert!(parse_candidate_batch_json(
            &json!({ "candidates": [candidate("same"), candidate("same")] }).to_string(),
            "chunk-0001",
        )
        .is_err());
        let mut malformed = candidate("bad");
        malformed["evidence_quote"] = json!(" ");
        assert!(parse_candidate_batch_json(
            &json!({ "candidates": [malformed] }).to_string(),
            "chunk-0001",
        )
        .is_err());
    }

    #[test]
    fn verification_requires_one_known_decision_per_candidate() {
        let ids = vec!["candidate-1".to_owned(), "candidate-2".to_owned()];
        let valid = json!({ "decisions": [decision("candidate-1"), decision("candidate-2")] });
        assert!(parse_verification_batch_json(&valid.to_string(), &ids).is_ok());

        for invalid in [
            json!({ "decisions": [decision("candidate-1")] }),
            json!({ "decisions": [decision("candidate-1"), decision("candidate-1")] }),
            json!({ "decisions": [decision("candidate-1"), decision("unknown")] }),
        ] {
            assert!(parse_verification_batch_json(&invalid.to_string(), &ids).is_err());
        }
    }

    #[test]
    fn final_quiz_allows_fewer_questions_than_the_requested_maximum() {
        let quiz = json!({
            "title": "Grounded quiz",
            "description": "Only supported questions",
            "questions": [{
                "id": "q1",
                "type": "single_choice",
                "question": "What produces ATP?",
                "answers": ["Cellular respiration", "Diffusion"],
                "correctAnswers": ["Cellular respiration"],
                "explanation": "Cellular respiration produces ATP."
            }]
        });
        assert_eq!(
            parse_generated_quiz_json(&quiz.to_string(), 8)
                .unwrap()
                .questions
                .len(),
            1
        );
        assert!(parse_generated_quiz_json(
            r#"{"title":"Empty","description":"","questions":[]}"#,
            8,
        )
        .is_err());
    }
}
