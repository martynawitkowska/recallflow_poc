#[cfg(test)]
mod evaluation;
mod evidence;
mod orchestration;
mod providers;
mod segmentation;
mod selection;
mod verification;

pub(crate) use orchestration::CancellationFlag;

use crate::models::{
    AiProvider, GenerateMnemonicRequest, GenerateQuizRequest, QuestionType, QuizFile,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, sync::Arc};

const MIN_QUESTION_COUNT: i64 = 3;
const MAX_QUESTION_COUNT: i64 = 25;
pub const MAX_MATERIAL_CHARS: usize = 500_000;
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

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProviderCandidateBatch {
    candidates: Vec<ProviderQuestionCandidate>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProviderQuestionCandidate {
    topic: String,
    question_type: QuestionType,
    question: String,
    answers: Vec<String>,
    correct_answers: Vec<String>,
    explanation: String,
    evidence_quote: String,
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

#[derive(Clone)]
pub(crate) struct CandidatePrompt {
    instructions: &'static str,
    input: String,
    #[cfg(test)]
    chunk_id: String,
}

#[derive(Clone)]
pub(crate) struct VerificationPrompt {
    instructions: &'static str,
    input: String,
}

pub(crate) struct DuplicatePrompt {
    instructions: &'static str,
    input: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GenerationCompletion {
    Full,
    QualityLimited,
    IncompleteCoverage,
    QualityEmpty,
    Cancelled,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroundedGenerationResult {
    pub quiz: Option<QuizFile>,
    pub completion: GenerationCompletion,
    pub quality: selection::QualityMetadata,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum GenerationStage {
    PreparingTranscript,
    GeneratingCandidates,
    VerifyingQuestions,
    SelectingQuestions,
    Complete,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GenerationProgress {
    pub run_id: String,
    pub stage: GenerationStage,
    pub completed: usize,
    pub total: Option<usize>,
}

pub(crate) type ProgressReporter = Arc<dyn Fn(GenerationProgress) + Send + Sync>;

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

impl CandidatePrompt {
    fn new(chunk: &segmentation::TranscriptChunk) -> Self {
        const INSTRUCTIONS: &str = "Extract zero, one, or two durable questions from the supplied transcript chunk. Use only the supplied source. Prefer definitions, principles, mechanisms, comparisons, procedures, and explicitly qualified causal relationships. Exclude classroom logistics, jokes, personal anecdotes, slide navigation, lecture-order questions, and unresolved references. Never say according to the lecture, notes, or speaker. Preserve populations, conditions, uncertainty, and other qualifications. Quote exact evidence from the PRIMARY region. Give every question at least two unique, non-empty answers, and copy each correct answer exactly from answers. A single_choice or true_false question has exactly one correct answer; true_false answers must be exactly [\"True\", \"False\"]. An empty candidates array is correct when the source has no independently testable knowledge.";
        let primary = &chunk.context[chunk.primary_context_bytes.clone()];
        let before = &chunk.context[..chunk.primary_context_bytes.start];
        let after = &chunk.context[chunk.primary_context_bytes.end..];
        Self {
            instructions: INSTRUCTIONS,
            input: format!(
                "chunk_id: {}\nCONTEXT BEFORE:\n{}\nPRIMARY:\n{}\nCONTEXT AFTER:\n{}",
                chunk.id, before, primary, after
            ),
            #[cfg(test)]
            chunk_id: chunk.id.clone(),
        }
    }

    #[cfg(test)]
    fn chunk_id(&self) -> &str {
        &self.chunk_id
    }
}

impl VerificationPrompt {
    fn new(
        candidates: &[evidence::ValidatedCandidate],
        chunk: &segmentation::TranscriptChunk,
    ) -> Self {
        const INSTRUCTIONS: &str = "Independently verify every supplied candidate using only its exact evidence and bounded source context. Decide supported, standalone, portable, qualifications_preserved, not_overgeneralized, and choices_unambiguous. According to the lecture/notes/speaker is not portable. Slide order, earlier demonstrations, unnamed people, this, it, and previous-example references fail when their referent is absent. A specific example supports a general rule only when the source states that rule. Preserve study, population, period, condition, uncertainty, and attribution limits. Anecdotes and opinions are not general facts. Distractors must not also be defensible from the evidence. Never rewrite, repair, supplement, or replace a candidate; when uncertain, reject rather than repair.";
        let input = serde_json::json!({
            "source_context": chunk.context,
            "candidates": candidates.iter().map(|item| &item.candidate).collect::<Vec<_>>()
        })
        .to_string();
        Self {
            instructions: INSTRUCTIONS,
            input,
        }
    }
}

impl DuplicatePrompt {
    fn new(candidates: &[evidence::ValidatedCandidate]) -> Self {
        Self {
            instructions: "Group only materially equivalent questions that test the same knowledge and have equivalent correct answers. Return groups of supplied candidate IDs. Do not invent IDs. Do not judge grounding and do not rewrite questions. Omit non-duplicates.",
            input: serde_json::json!({
                "candidates": candidates.iter().map(|item| serde_json::json!({
                    "candidate_id": item.candidate.candidate_id,
                    "question": item.candidate.question,
                    "correct_answers": item.candidate.correct_answers,
                })).collect::<Vec<_>>()
            }).to_string(),
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
    let batch: ProviderCandidateBatch =
        serde_json::from_str(json).map_err(|_| INVALID_QUIZ_ERROR.to_owned())?;
    if batch.candidates.len() > MAX_CANDIDATES_PER_CHUNK {
        return Err(INVALID_QUIZ_ERROR.to_owned());
    }

    let mut batch = CandidateBatch {
        candidates: batch
            .candidates
            .into_iter()
            .enumerate()
            .map(|(index, candidate)| QuestionCandidate {
                candidate_id: format!("{expected_chunk_id}-candidate-{}", index + 1),
                chunk_id: expected_chunk_id.to_owned(),
                topic: candidate.topic,
                question_type: candidate.question_type,
                question: candidate.question,
                answers: candidate.answers,
                correct_answers: candidate.correct_answers,
                explanation: candidate.explanation,
                evidence_quote: candidate.evidence_quote,
            })
            .collect(),
    };
    for candidate in &mut batch.candidates {
        normalize_candidate(candidate);
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
    let result = generate_quiz_with_cancellation(
        request,
        api_key,
        orchestration::CancellationFlag::default(),
        "internal",
        None,
    )
    .await?;
    result.quiz.ok_or_else(|| {
        "RecallFlow could not find enough grounded, standalone knowledge for a quiz. Try clearer study material."
            .to_owned()
    })
}

pub(crate) async fn generate_quiz_with_cancellation(
    request: GenerateQuizRequest,
    api_key: &str,
    cancellation: orchestration::CancellationFlag,
    run_id: &str,
    reporter: Option<ProgressReporter>,
) -> Result<GroundedGenerationResult, String> {
    report_progress(
        &reporter,
        run_id,
        GenerationStage::PreparingTranscript,
        0,
        None,
    );
    let source = validate_generation_request(&request)?;
    let question_count = request.question_count as usize;
    let GenerationSource::Material(material) = source else {
        report_progress(
            &reporter,
            run_id,
            GenerationStage::GeneratingCandidates,
            0,
            Some(1),
        );
        let prompt = GenerationPrompt::new(source, question_count);
        let generated_json =
            providers::generate(request.provider, request.model.as_deref(), api_key, &prompt)
                .await?;
        report_progress(
            &reporter,
            run_id,
            GenerationStage::GeneratingCandidates,
            1,
            Some(1),
        );
        report_progress(
            &reporter,
            run_id,
            GenerationStage::SelectingQuestions,
            0,
            Some(1),
        );
        let quiz = parse_generated_quiz_json(&generated_json, question_count)?;
        let selected_count = quiz.questions.len();
        let result = GroundedGenerationResult {
            quiz: Some(quiz),
            completion: if selected_count == question_count {
                GenerationCompletion::Full
            } else {
                GenerationCompletion::QualityLimited
            },
            quality: selection::QualityMetadata {
                requested_count: question_count,
                generated_candidate_count: selected_count,
                selected_count,
                ..Default::default()
            },
        };
        report_progress(&reporter, run_id, GenerationStage::Complete, 1, Some(1));
        return Ok(result);
    };

    let (_, chunks) = segmentation::segment_transcript(material)?;
    report_progress(
        &reporter,
        run_id,
        GenerationStage::GeneratingCandidates,
        0,
        Some(chunks.len()),
    );
    let generation_progress = reporter.as_ref().map(|reporter| {
        let reporter = reporter.clone();
        let run_id = run_id.to_owned();
        Arc::new(move |completed, total| {
            reporter(GenerationProgress {
                run_id: run_id.clone(),
                stage: GenerationStage::GeneratingCandidates,
                completed,
                total: Some(total),
            });
        }) as Arc<dyn Fn(usize, usize) + Send + Sync>
    });
    let generated = orchestration::generate_candidates_for_chunks(
        chunks.clone(),
        request.provider,
        request.model.clone(),
        api_key.to_owned(),
        cancellation.clone(),
        generation_progress,
    )
    .await;
    if cancellation.is_cancelled() {
        return Ok(cancelled_result(question_count));
    }
    generated.ensure_usable()?;
    let generated_candidate_count = generated.candidate_count;
    let incomplete_generation = generated.failed_chunks > 0;
    let candidates = generated
        .chunks
        .into_iter()
        .flat_map(|status| match status {
            orchestration::ChunkGenerationStatus::Success(candidates) => candidates,
            _ => Vec::new(),
        })
        .collect::<Vec<_>>();
    let (validated, deterministic_rejections) =
        evidence::validate_candidate_set(candidates, &chunks);
    let validated_count = validated.len();
    let verification_batches = validated_count.div_ceil(8);
    report_progress(
        &reporter,
        run_id,
        GenerationStage::VerifyingQuestions,
        0,
        Some(verification_batches),
    );
    let verification_progress = reporter.as_ref().map(|reporter| {
        let reporter = reporter.clone();
        let run_id = run_id.to_owned();
        Arc::new(move |completed, total| {
            reporter(GenerationProgress {
                run_id: run_id.clone(),
                stage: GenerationStage::VerifyingQuestions,
                completed,
                total: Some(total),
            });
        }) as Arc<dyn Fn(usize, usize) + Send + Sync>
    });
    let verified = verification::verify_with_provider(
        validated,
        &chunks,
        request.provider,
        request.model.clone(),
        api_key.to_owned(),
        cancellation.clone(),
        verification_progress,
    )
    .await;
    if cancellation.is_cancelled() || verified.cancelled {
        return Ok(cancelled_result(question_count));
    }
    let semantic_rejection_count = validated_count - verified.accepted.len();
    let incomplete_verification = verified.failed_batches > 0;
    let (exact, exact_duplicate_count) = selection::exact_deduplicate(verified.accepted);
    report_progress(
        &reporter,
        run_id,
        GenerationStage::SelectingQuestions,
        0,
        Some(1),
    );

    let known_ids = exact
        .iter()
        .map(|item| item.candidate.candidate_id.clone())
        .collect::<HashSet<_>>();
    let (deduplicated, semantic_duplicate_count, duplicate_analysis_incomplete) = if exact.len() > 1
    {
        let prompt = DuplicatePrompt::new(&exact);
        match providers::find_duplicates(
            request.provider,
            request.model.as_deref(),
            api_key,
            &prompt,
        )
        .await
        .and_then(|response| selection::parse_duplicate_groups(&response, &known_ids))
        {
            Ok(groups) => {
                let (deduplicated, removed) = selection::apply_semantic_groups(exact, &groups);
                (deduplicated, removed, false)
            }
            Err(_) => (exact, 0, true),
        }
    } else {
        (exact, 0, false)
    };
    let selected = selection::select_balanced(deduplicated, question_count);
    let selected_count = selected.len();
    let incomplete_coverage =
        incomplete_generation || incomplete_verification || duplicate_analysis_incomplete;
    let quality = selection::QualityMetadata {
        requested_count: question_count,
        generated_candidate_count,
        deterministic_rejection_count: deterministic_rejections.len(),
        semantic_rejection_count,
        duplicate_count: exact_duplicate_count + semantic_duplicate_count,
        selected_count,
        incomplete_coverage,
        duplicate_analysis_incomplete,
    };
    if selected.is_empty() {
        let result = GroundedGenerationResult {
            quiz: None,
            completion: GenerationCompletion::QualityEmpty,
            quality,
        };
        report_progress(&reporter, run_id, GenerationStage::Complete, 1, Some(1));
        return Ok(result);
    }
    let completion = if incomplete_coverage {
        GenerationCompletion::IncompleteCoverage
    } else if selected_count < question_count {
        GenerationCompletion::QualityLimited
    } else {
        GenerationCompletion::Full
    };
    let result = GroundedGenerationResult {
        quiz: Some(selection::finalize_quiz(selected)),
        completion,
        quality,
    };
    report_progress(&reporter, run_id, GenerationStage::Complete, 1, Some(1));
    Ok(result)
}

fn report_progress(
    reporter: &Option<ProgressReporter>,
    run_id: &str,
    stage: GenerationStage,
    completed: usize,
    total: Option<usize>,
) {
    if let Some(reporter) = reporter {
        reporter(GenerationProgress {
            run_id: run_id.to_owned(),
            stage,
            completed,
            total,
        });
    }
}

fn cancelled_result(requested_count: usize) -> GroundedGenerationResult {
    GroundedGenerationResult {
        quiz: None,
        completion: GenerationCompletion::Cancelled,
        quality: selection::QualityMetadata {
            requested_count,
            ..Default::default()
        },
    }
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

    fn candidate() -> serde_json::Value {
        json!({
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
            &json!({ "candidates": [candidate()] }).to_string(),
            "chunk-0001",
        )
        .unwrap();
        assert_eq!(parsed.candidates[0].candidate_id, "chunk-0001-candidate-1");
        assert_eq!(parsed.candidates[0].chunk_id, "chunk-0001");
    }

    #[test]
    fn candidate_batches_reject_excessive_and_unknown_fields() {
        assert!(parse_candidate_batch_json(
            &json!({ "candidates": [candidate(), candidate(), candidate()] }).to_string(),
            "chunk-0001",
        )
        .is_err());
        let mut malformed = candidate();
        malformed["unexpected"] = json!(true);
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

    #[test]
    fn progress_events_are_content_free_and_run_scoped() {
        let progress = super::GenerationProgress {
            run_id: "run-1".to_owned(),
            stage: super::GenerationStage::VerifyingQuestions,
            completed: 2,
            total: Some(4),
        };
        let value = serde_json::to_value(progress).unwrap();
        assert_eq!(
            value,
            json!({
                "runId": "run-1",
                "stage": "verifying_questions",
                "completed": 2,
                "total": 4
            })
        );
    }
}
