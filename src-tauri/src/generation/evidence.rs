use super::{segmentation::TranscriptChunk, valid_answers, QuestionCandidate};
use std::{
    collections::{HashMap, HashSet},
    ops::Range,
};

const MAX_ID_CHARS: usize = 128;
const MAX_TOPIC_CHARS: usize = 200;
const MAX_QUESTION_CHARS: usize = 2_000;
const MAX_ANSWER_CHARS: usize = 1_000;
const MAX_EXPLANATION_CHARS: usize = 4_000;
const MAX_EVIDENCE_CHARS: usize = 4_000;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) enum EvidenceRejection {
    UnknownChunk,
    DuplicateCandidateId,
    InvalidAnswerContract,
    EmptyField,
    OversizedField,
    ControlCharacter,
    MissingEvidence,
    EvidenceOutsidePrimary,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ValidatedCandidate {
    pub candidate: QuestionCandidate,
    pub evidence_context_bytes: Range<usize>,
    pub evidence_source_bytes: Range<usize>,
}

pub(crate) fn validate_candidate_set(
    candidates: Vec<QuestionCandidate>,
    chunks: &[TranscriptChunk],
) -> (Vec<ValidatedCandidate>, Vec<EvidenceRejection>) {
    let chunks = chunks
        .iter()
        .map(|chunk| (chunk.id.as_str(), chunk))
        .collect::<HashMap<_, _>>();
    let mut ids = HashSet::new();
    let mut accepted = Vec::new();
    let mut rejected = Vec::new();

    for candidate in candidates {
        if !ids.insert(candidate.candidate_id.clone()) {
            rejected.push(EvidenceRejection::DuplicateCandidateId);
            continue;
        }
        let Some(chunk) = chunks.get(candidate.chunk_id.as_str()) else {
            rejected.push(EvidenceRejection::UnknownChunk);
            continue;
        };
        match validate_candidate(candidate, chunk) {
            Ok(candidate) => accepted.push(candidate),
            Err(reason) => rejected.push(reason),
        }
    }

    (accepted, rejected)
}

fn validate_candidate(
    candidate: QuestionCandidate,
    chunk: &TranscriptChunk,
) -> Result<ValidatedCandidate, EvidenceRejection> {
    if [
        candidate.candidate_id.as_str(),
        candidate.chunk_id.as_str(),
        candidate.topic.as_str(),
        candidate.question.as_str(),
        candidate.explanation.as_str(),
        candidate.evidence_quote.as_str(),
    ]
    .iter()
    .any(|value| value.trim().is_empty())
    {
        return Err(EvidenceRejection::EmptyField);
    }
    if candidate.candidate_id.chars().count() > MAX_ID_CHARS
        || candidate.chunk_id.chars().count() > MAX_ID_CHARS
        || candidate.topic.chars().count() > MAX_TOPIC_CHARS
        || candidate.question.chars().count() > MAX_QUESTION_CHARS
        || candidate
            .answers
            .iter()
            .chain(candidate.correct_answers.iter())
            .any(|answer| answer.chars().count() > MAX_ANSWER_CHARS)
        || candidate.explanation.chars().count() > MAX_EXPLANATION_CHARS
        || candidate.evidence_quote.chars().count() > MAX_EVIDENCE_CHARS
    {
        return Err(EvidenceRejection::OversizedField);
    }
    if candidate_strings(&candidate).any(|value| value.chars().any(disallowed_control)) {
        return Err(EvidenceRejection::ControlCharacter);
    }
    if !valid_answers(
        candidate.question_type,
        &candidate.answers,
        &candidate.correct_answers,
    ) {
        return Err(EvidenceRejection::InvalidAnswerContract);
    }

    let primary = &chunk.context[chunk.primary_context_bytes.clone()];
    let Some(primary_offset) = primary.find(&candidate.evidence_quote) else {
        return Err(if chunk.context.contains(&candidate.evidence_quote) {
            EvidenceRejection::EvidenceOutsidePrimary
        } else {
            EvidenceRejection::MissingEvidence
        });
    };
    let context_start = chunk.primary_context_bytes.start + primary_offset;
    let context_end = context_start + candidate.evidence_quote.len();
    let source_start = chunk.primary_source_bytes.start + primary_offset;

    Ok(ValidatedCandidate {
        evidence_context_bytes: context_start..context_end,
        evidence_source_bytes: source_start..source_start + candidate.evidence_quote.len(),
        candidate,
    })
}

fn candidate_strings(candidate: &QuestionCandidate) -> impl Iterator<Item = &str> {
    [
        candidate.candidate_id.as_str(),
        candidate.chunk_id.as_str(),
        candidate.topic.as_str(),
        candidate.question.as_str(),
        candidate.explanation.as_str(),
        candidate.evidence_quote.as_str(),
    ]
    .into_iter()
    .chain(candidate.answers.iter().map(String::as_str))
    .chain(candidate.correct_answers.iter().map(String::as_str))
}

fn disallowed_control(character: char) -> bool {
    character.is_control() && !matches!(character, '\n' | '\t')
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{generation::segmentation::segment_transcript, models::QuestionType};

    fn candidate(chunk_id: &str, evidence: &str) -> QuestionCandidate {
        QuestionCandidate {
            candidate_id: "candidate-1".to_owned(),
            chunk_id: chunk_id.to_owned(),
            topic: "Biology".to_owned(),
            question_type: QuestionType::SingleChoice,
            question: "What contains exact evidence?".to_owned(),
            answers: vec!["The transcript".to_owned(), "Outside knowledge".to_owned()],
            correct_answers: vec!["The transcript".to_owned()],
            explanation: "The transcript contains the answer.".to_owned(),
            evidence_quote: evidence.to_owned(),
        }
    }

    #[test]
    fn exact_repeated_and_unicode_evidence_resolve_locally() {
        let source = "Zażółć 🧠 exact evidence; exact evidence.";
        let (_, chunks) = segment_transcript(source).unwrap();
        let (valid, rejected) =
            validate_candidate_set(vec![candidate("chunk-0001", "exact evidence")], &chunks);
        assert!(rejected.is_empty());
        let start = source.find("exact evidence").unwrap();
        assert_eq!(
            valid[0].evidence_source_bytes,
            start..start + "exact evidence".len()
        );

        let (unicode, rejected) =
            validate_candidate_set(vec![candidate("chunk-0001", "Zażółć 🧠")], &chunks);
        assert!(rejected.is_empty());
        assert_eq!(
            &source[unicode[0].evidence_source_bytes.clone()],
            "Zażółć 🧠"
        );
    }

    #[test]
    fn fabricated_and_whitespace_changed_evidence_is_rejected() {
        let (_, chunks) = segment_transcript("exact evidence").unwrap();
        for evidence in ["exact evidencf", "exact  evidence"] {
            let (_, rejected) =
                validate_candidate_set(vec![candidate("chunk-0001", evidence)], &chunks);
            assert_eq!(rejected, [EvidenceRejection::MissingEvidence]);
        }
    }

    #[test]
    fn overlap_only_and_cross_boundary_evidence_is_rejected() {
        let source = format!("{}BOUNDARY{}", "a".repeat(8_000), "b".repeat(8_000));
        let (_, chunks) = segment_transcript(&source).unwrap();
        assert!(chunks.len() >= 2);
        let first = &chunks[0];
        let overlap_quote = &first.context[first.primary_context_bytes.end..][..20];
        let (_, rejected) =
            validate_candidate_set(vec![candidate(&first.id, overlap_quote)], &chunks);
        assert_eq!(rejected, [EvidenceRejection::EvidenceOutsidePrimary]);

        let cross_start = first.primary_context_bytes.end - 10;
        let cross_quote = &first.context[cross_start..cross_start + 20];
        let (_, rejected) =
            validate_candidate_set(vec![candidate(&first.id, cross_quote)], &chunks);
        assert_eq!(rejected, [EvidenceRejection::EvidenceOutsidePrimary]);
    }

    #[test]
    fn unknown_chunks_duplicate_ids_and_invalid_answers_are_rejected() {
        let (_, chunks) = segment_transcript("exact evidence").unwrap();
        let mut invalid_answer = candidate("chunk-0001", "exact evidence");
        invalid_answer.candidate_id = "candidate-2".to_owned();
        invalid_answer.correct_answers = vec!["Not an answer".to_owned()];
        let mut unknown = candidate("unknown", "exact evidence");
        unknown.candidate_id = "candidate-unknown".to_owned();
        let candidates = vec![
            unknown,
            candidate("chunk-0001", "exact evidence"),
            candidate("chunk-0001", "exact evidence"),
            invalid_answer,
        ];
        let (_, rejected) = validate_candidate_set(candidates, &chunks);
        assert_eq!(
            rejected,
            [
                EvidenceRejection::UnknownChunk,
                EvidenceRejection::DuplicateCandidateId,
                EvidenceRejection::InvalidAnswerContract,
            ]
        );
    }

    #[test]
    fn size_and_control_character_limits_fail_closed() {
        let (_, chunks) = segment_transcript("exact evidence").unwrap();
        let mut oversized = candidate("chunk-0001", "exact evidence");
        oversized.topic = "x".repeat(MAX_TOPIC_CHARS + 1);
        let mut control = candidate("chunk-0001", "exact evidence");
        control.candidate_id = "candidate-2".to_owned();
        control.question.push('\0');
        let (_, rejected) = validate_candidate_set(vec![oversized, control], &chunks);
        assert_eq!(
            rejected,
            [
                EvidenceRejection::OversizedField,
                EvidenceRejection::ControlCharacter
            ]
        );
    }
}
