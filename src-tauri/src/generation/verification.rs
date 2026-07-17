use super::{
    evidence::ValidatedCandidate,
    orchestration::{classify_provider_error, CancellationFlag, CandidateCallError},
    parse_verification_batch_json, providers,
    segmentation::TranscriptChunk,
    VerificationPrompt,
};
use crate::models::AiProvider;
use std::{collections::HashMap, future::Future, sync::Arc, time::Duration};
use tokio::{sync::Semaphore, task::JoinSet};

const MAX_CANDIDATES_PER_VERIFICATION: usize = 8;
const MAX_CONCURRENT_VERIFICATIONS: usize = 4;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct VerificationOutcome {
    pub accepted: Vec<ValidatedCandidate>,
    pub semantic_rejections: usize,
    pub failed_batches: usize,
    pub cancelled: bool,
}

pub(crate) async fn verify_candidates<F, Fut>(
    candidates: Vec<ValidatedCandidate>,
    chunks: &[TranscriptChunk],
    cancellation: CancellationFlag,
    verify: F,
) -> VerificationOutcome
where
    F: Fn(VerificationPrompt) -> Fut + Clone + Send + Sync + 'static,
    Fut: Future<Output = Result<String, CandidateCallError>> + Send + 'static,
{
    let chunks_by_id = chunks
        .iter()
        .map(|chunk| (chunk.id.clone(), chunk.clone()))
        .collect::<HashMap<_, _>>();
    let mut by_chunk = HashMap::<String, Vec<ValidatedCandidate>>::new();
    for candidate in candidates {
        by_chunk
            .entry(candidate.candidate.chunk_id.clone())
            .or_default()
            .push(candidate);
    }

    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_VERIFICATIONS));
    let mut tasks = JoinSet::new();
    let mut batch_index = 0;
    for chunk in chunks {
        let Some(chunk_candidates) = by_chunk.remove(&chunk.id) else {
            continue;
        };
        for batch in chunk_candidates.chunks(MAX_CANDIDATES_PER_VERIFICATION) {
            let batch = batch.to_vec();
            let chunk = chunks_by_id[&chunk.id].clone();
            let semaphore = semaphore.clone();
            let cancellation = cancellation.clone();
            let verify = verify.clone();
            let index = batch_index;
            batch_index += 1;
            tasks.spawn(async move {
                let _permit = semaphore
                    .acquire_owned()
                    .await
                    .expect("semaphore remains open");
                if cancellation.is_cancelled() {
                    return (index, BatchResult::Cancelled);
                }
                let prompt = VerificationPrompt::new(&batch, &chunk);
                let ids = batch
                    .iter()
                    .map(|item| item.candidate.candidate_id.clone())
                    .collect::<Vec<_>>();
                let mut attempt = 0;
                loop {
                    match verify(prompt.clone()).await {
                        Ok(response) => {
                            let Ok(parsed) = parse_verification_batch_json(&response, &ids) else {
                                break (index, BatchResult::Failed);
                            };
                            let decisions = parsed
                                .decisions
                                .into_iter()
                                .map(|decision| (decision.candidate_id.clone(), decision))
                                .collect::<HashMap<_, _>>();
                            let (accepted, rejected): (Vec<_>, Vec<_>) =
                                batch.into_iter().partition(|item| {
                                    decisions[&item.candidate.candidate_id].accepted()
                                });
                            break (index, BatchResult::Verified(accepted, rejected.len()));
                        }
                        Err(CandidateCallError::Transient) if attempt == 0 => {
                            attempt += 1;
                            tokio::time::sleep(Duration::from_millis(50)).await;
                            if cancellation.is_cancelled() {
                                break (index, BatchResult::Cancelled);
                            }
                        }
                        Err(_) => break (index, BatchResult::Failed),
                    }
                }
            });
        }
    }

    let mut ordered = vec![BatchResult::Failed; batch_index];
    while let Some(result) = tasks.join_next().await {
        if let Ok((index, result)) = result {
            ordered[index] = result;
        }
    }

    let mut outcome = VerificationOutcome {
        accepted: Vec::new(),
        semantic_rejections: 0,
        failed_batches: 0,
        cancelled: false,
    };
    for result in ordered {
        match result {
            BatchResult::Verified(mut accepted, rejected) => {
                outcome.accepted.append(&mut accepted);
                outcome.semantic_rejections += rejected;
            }
            BatchResult::Failed => outcome.failed_batches += 1,
            BatchResult::Cancelled => outcome.cancelled = true,
        }
    }
    outcome
}

pub(crate) async fn verify_with_provider(
    candidates: Vec<ValidatedCandidate>,
    chunks: &[TranscriptChunk],
    provider: AiProvider,
    model: Option<String>,
    api_key: String,
    cancellation: CancellationFlag,
) -> VerificationOutcome {
    verify_candidates(candidates, chunks, cancellation, move |prompt| {
        let model = model.clone();
        let api_key = api_key.clone();
        async move {
            providers::verify_candidates(provider, model.as_deref(), &api_key, &prompt)
                .await
                .map_err(|message| classify_provider_error(&message))
        }
    })
    .await
}

#[derive(Clone)]
enum BatchResult {
    Verified(Vec<ValidatedCandidate>, usize),
    Failed,
    Cancelled,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        generation::{
            evidence::validate_candidate_set, segmentation::segment_transcript, QuestionCandidate,
        },
        models::QuestionType,
    };
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn candidates() -> (Vec<ValidatedCandidate>, Vec<TranscriptChunk>) {
        let (_, chunks) =
            segment_transcript("Mitochondria produce ATP by cellular respiration.").unwrap();
        let candidate = QuestionCandidate {
            candidate_id: "candidate-1".to_owned(),
            chunk_id: "chunk-0001".to_owned(),
            topic: "Cell biology".to_owned(),
            question_type: QuestionType::SingleChoice,
            question: "What process produces ATP in mitochondria?".to_owned(),
            answers: vec!["Cellular respiration".to_owned(), "Osmosis".to_owned()],
            correct_answers: vec!["Cellular respiration".to_owned()],
            explanation: "Mitochondria use cellular respiration.".to_owned(),
            evidence_quote: "Mitochondria produce ATP by cellular respiration.".to_owned(),
        };
        (validate_candidate_set(vec![candidate], &chunks).0, chunks)
    }

    fn decision(overrides: serde_json::Value) -> String {
        let mut value = json!({
            "candidate_id": "candidate-1",
            "supported": true,
            "standalone": true,
            "portable": true,
            "qualifications_preserved": true,
            "not_overgeneralized": true,
            "choices_unambiguous": true,
            "reason": "accepted"
        });
        for (key, item) in overrides.as_object().unwrap() {
            value[key] = item.clone();
        }
        json!({ "decisions": [value] }).to_string()
    }

    #[tokio::test]
    async fn every_boolean_must_pass_for_acceptance() {
        let (items, chunks) = candidates();
        let accepted = verify_candidates(
            items.clone(),
            &chunks,
            CancellationFlag::default(),
            |_| async { Ok(decision(json!({}))) },
        )
        .await;
        assert_eq!(accepted.accepted.len(), 1);

        for field in [
            "supported",
            "standalone",
            "portable",
            "qualifications_preserved",
            "not_overgeneralized",
            "choices_unambiguous",
        ] {
            let (items, chunks) = candidates();
            let rejected =
                verify_candidates(
                    items,
                    &chunks,
                    CancellationFlag::default(),
                    move |_| async move {
                        Ok(decision(json!({ field: false, "reason": "unsupported" })))
                    },
                )
                .await;
            assert!(rejected.accepted.is_empty(), "field={field}");
            assert_eq!(rejected.semantic_rejections, 1);
        }
    }

    #[tokio::test]
    async fn malformed_missing_unknown_refusal_and_failure_are_fail_closed() {
        for response in [
            Ok(r#"{"decisions":[]}"#.to_owned()),
            Ok(decision(json!({ "candidate_id": "unknown" }))),
            Err(CandidateCallError::Refusal),
            Err(CandidateCallError::Permanent),
        ] {
            let (items, chunks) = candidates();
            let outcome =
                verify_candidates(items, &chunks, CancellationFlag::default(), move |_| {
                    let response = response.clone();
                    async move { response }
                })
                .await;
            assert!(outcome.accepted.is_empty());
            assert_eq!(outcome.failed_batches, 1);
        }
    }

    #[tokio::test]
    async fn transient_transport_failure_retries_once() {
        let (items, chunks) = candidates();
        let calls = Arc::new(AtomicUsize::new(0));
        let outcome = verify_candidates(items, &chunks, CancellationFlag::default(), {
            let calls = calls.clone();
            move |_| {
                let calls = calls.clone();
                async move {
                    if calls.fetch_add(1, Ordering::SeqCst) == 0 {
                        Err(CandidateCallError::Transient)
                    } else {
                        Ok(decision(json!({})))
                    }
                }
            }
        })
        .await;
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(outcome.accepted.len(), 1);
    }

    #[test]
    fn prompt_is_bounded_and_contains_no_rewrite_or_confidence_request() {
        let (items, chunks) = candidates();
        let prompt = VerificationPrompt::new(&items, &chunks[0]);
        assert!(prompt.input.contains("Mitochondria produce ATP"));
        assert!(prompt.input.len() < 12_000);
        assert!(prompt.instructions.contains("reject rather than repair"));
        assert!(!prompt.instructions.contains("confidence score"));
    }
}
