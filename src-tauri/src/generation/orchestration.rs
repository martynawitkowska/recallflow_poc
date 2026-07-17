use super::{
    parse_candidate_batch_json, providers, segmentation::TranscriptChunk, CandidatePrompt,
    QuestionCandidate,
};
use crate::models::AiProvider;
use std::{
    future::Future,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::{
    sync::{Notify, Semaphore},
    task::JoinSet,
};

pub(crate) const MAX_CONCURRENT_REQUESTS: usize = 4;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum CandidateCallError {
    Transient(String),
    Permanent(String),
    InvalidResponse,
    Refusal(String),
}

impl CandidateCallError {
    fn message(&self) -> &str {
        match self {
            Self::Transient(message) | Self::Permanent(message) | Self::Refusal(message) => message,
            Self::InvalidResponse => "OpenAI returned an invalid transcript analysis. Try again.",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum ChunkGenerationStatus {
    Success(Vec<QuestionCandidate>),
    Failed(CandidateCallError),
    Cancelled,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct CandidateGenerationOutcome {
    pub chunks: Vec<ChunkGenerationStatus>,
    pub total_chunks: usize,
    pub completed_chunks: usize,
    pub successful_chunks: usize,
    pub failed_chunks: usize,
    pub candidate_count: usize,
}

impl CandidateGenerationOutcome {
    pub(crate) fn ensure_usable(&self) -> Result<(), String> {
        if self.total_chunks > 0 && self.successful_chunks == 0 && self.failed_chunks > 0 {
            let message = self.chunks.iter().find_map(|status| match status {
                ChunkGenerationStatus::Failed(error) => Some(error.message()),
                _ => None,
            });
            Err(message
                .unwrap_or("OpenAI could not analyze the transcript. Try again.")
                .to_owned())
        } else {
            Ok(())
        }
    }
}

#[derive(Debug, Default)]
struct CancellationInner {
    cancelled: AtomicBool,
    notify: Notify,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct CancellationFlag(Arc<CancellationInner>);

impl CancellationFlag {
    pub(crate) fn cancel(&self) {
        self.0.cancelled.store(true, Ordering::Release);
        self.0.notify.notify_waiters();
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        self.0.cancelled.load(Ordering::Acquire)
    }

    pub(crate) async fn cancelled(&self) {
        if !self.is_cancelled() {
            self.0.notify.notified().await;
        }
    }
}

#[cfg(test)]
pub(crate) async fn orchestrate_candidate_generation<F, Fut>(
    chunks: Vec<TranscriptChunk>,
    cancellation: CancellationFlag,
    generate: F,
) -> CandidateGenerationOutcome
where
    F: Fn(CandidatePrompt) -> Fut + Clone + Send + Sync + 'static,
    Fut: Future<Output = Result<String, CandidateCallError>> + Send + 'static,
{
    orchestrate_candidate_generation_with_progress(chunks, cancellation, generate, None).await
}

pub(crate) async fn orchestrate_candidate_generation_with_progress<F, Fut>(
    chunks: Vec<TranscriptChunk>,
    cancellation: CancellationFlag,
    generate: F,
    on_progress: Option<Arc<dyn Fn(usize, usize) + Send + Sync>>,
) -> CandidateGenerationOutcome
where
    F: Fn(CandidatePrompt) -> Fut + Clone + Send + Sync + 'static,
    Fut: Future<Output = Result<String, CandidateCallError>> + Send + 'static,
{
    let total_chunks = chunks.len();
    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_REQUESTS));
    let mut tasks = JoinSet::new();

    for chunk in chunks {
        let semaphore = semaphore.clone();
        let cancellation = cancellation.clone();
        let generate = generate.clone();
        tasks.spawn(async move {
            let index = chunk.source_index;
            let permit = semaphore
                .acquire_owned()
                .await
                .expect("semaphore remains open");
            if cancellation.is_cancelled() {
                return (index, ChunkGenerationStatus::Cancelled);
            }

            let prompt = CandidatePrompt::new(&chunk);
            let mut attempt = 0;
            let status = loop {
                match generate(prompt.clone()).await {
                    Ok(response) => {
                        break match parse_candidate_batch_json(&response, &chunk.id) {
                            Ok(batch) => ChunkGenerationStatus::Success(batch.candidates),
                            Err(_) => {
                                ChunkGenerationStatus::Failed(CandidateCallError::InvalidResponse)
                            }
                        }
                    }
                    Err(CandidateCallError::Transient(_)) if attempt == 0 => {
                        attempt += 1;
                        tokio::time::sleep(Duration::from_millis(50)).await;
                        if cancellation.is_cancelled() {
                            break ChunkGenerationStatus::Cancelled;
                        }
                    }
                    Err(error) => break ChunkGenerationStatus::Failed(error),
                }
            };
            drop(permit);
            (index, status)
        });
    }

    let mut ordered = vec![ChunkGenerationStatus::Cancelled; total_chunks];
    let mut completed = 0;
    while !tasks.is_empty() {
        tokio::select! {
            _ = cancellation.cancelled() => {
                tasks.abort_all();
                while tasks.join_next().await.is_some() {}
                break;
            }
            result = tasks.join_next() => {
                if let Some(Ok((index, status))) = result {
                    ordered[index] = status;
                    completed += 1;
                    if let Some(callback) = &on_progress {
                        callback(completed, total_chunks);
                    }
                }
            }
        }
    }

    let successful_chunks = ordered
        .iter()
        .filter(|status| matches!(status, ChunkGenerationStatus::Success(_)))
        .count();
    let failed_chunks = ordered
        .iter()
        .filter(|status| matches!(status, ChunkGenerationStatus::Failed(_)))
        .count();
    let candidate_count = ordered
        .iter()
        .map(|status| match status {
            ChunkGenerationStatus::Success(candidates) => candidates.len(),
            _ => 0,
        })
        .sum();
    let completed_chunks = successful_chunks + failed_chunks;

    CandidateGenerationOutcome {
        chunks: ordered,
        total_chunks,
        completed_chunks,
        successful_chunks,
        failed_chunks,
        candidate_count,
    }
}

pub(crate) async fn generate_candidates_for_chunks(
    chunks: Vec<TranscriptChunk>,
    provider: AiProvider,
    model: Option<String>,
    api_key: String,
    cancellation: CancellationFlag,
    on_progress: Option<Arc<dyn Fn(usize, usize) + Send + Sync>>,
) -> CandidateGenerationOutcome {
    orchestrate_candidate_generation_with_progress(
        chunks,
        cancellation,
        move |prompt| {
            let model = model.clone();
            let api_key = api_key.clone();
            async move {
                providers::generate_candidates(provider, model.as_deref(), &api_key, &prompt)
                    .await
                    .map_err(|message| classify_provider_error(&message))
            }
        },
        on_progress,
    )
    .await
}

pub(crate) fn classify_provider_error(message: &str) -> CandidateCallError {
    if message.contains("declined") {
        CandidateCallError::Refusal(message.to_owned())
    } else if [
        "rate limiting",
        "temporarily unavailable",
        "connection",
        "too long",
    ]
    .iter()
    .any(|needle| message.contains(needle))
    {
        CandidateCallError::Transient(message.to_owned())
    } else {
        CandidateCallError::Permanent(message.to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::segmentation::segment_transcript;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn response(chunk_id: &str, candidate_id: &str) -> String {
        json!({ "candidates": [{
            "candidate_id": candidate_id,
            "chunk_id": chunk_id,
            "topic": "Topic",
            "question_type": "single_choice",
            "question": "What is durable knowledge?",
            "answers": ["A principle", "A classroom event"],
            "correct_answers": ["A principle"],
            "explanation": "The source states the principle.",
            "evidence_quote": "durable knowledge"
        }] })
        .to_string()
    }

    #[tokio::test]
    async fn concurrency_is_bounded_and_results_return_in_source_order() {
        let (_, chunks) = segment_transcript(&"durable knowledge. ".repeat(5_000)).unwrap();
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let outcome =
            orchestrate_candidate_generation(chunks.clone(), CancellationFlag::default(), {
                let active = active.clone();
                let peak = peak.clone();
                move |prompt| {
                    let active = active.clone();
                    let peak = peak.clone();
                    async move {
                        let now = active.fetch_add(1, Ordering::SeqCst) + 1;
                        peak.fetch_max(now, Ordering::SeqCst);
                        tokio::time::sleep(Duration::from_millis((5 - now.min(4)) as u64 * 5))
                            .await;
                        active.fetch_sub(1, Ordering::SeqCst);
                        let id = prompt.chunk_id().to_owned();
                        Ok(response(&id, &format!("candidate-{id}")))
                    }
                }
            })
            .await;

        assert!(peak.load(Ordering::SeqCst) <= MAX_CONCURRENT_REQUESTS);
        assert_eq!(outcome.successful_chunks, chunks.len());
        for (index, status) in outcome.chunks.iter().enumerate() {
            let ChunkGenerationStatus::Success(candidates) = status else {
                panic!("expected success")
            };
            assert_eq!(candidates[0].chunk_id, format!("chunk-{:04}", index + 1));
        }
    }

    #[tokio::test]
    async fn transient_errors_retry_once_but_invalid_or_permanent_errors_do_not() {
        let (_, chunks) = segment_transcript("durable knowledge").unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let outcome = orchestrate_candidate_generation(chunks, CancellationFlag::default(), {
            let calls = calls.clone();
            move |prompt| {
                let calls = calls.clone();
                async move {
                    if calls.fetch_add(1, Ordering::SeqCst) == 0 {
                        Err(CandidateCallError::Transient(
                            "temporary failure".to_owned(),
                        ))
                    } else {
                        Ok(response(prompt.chunk_id(), "candidate-1"))
                    }
                }
            }
        })
        .await;
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(outcome.successful_chunks, 1);

        for error in [
            CandidateCallError::Permanent("permanent failure".to_owned()),
            CandidateCallError::Refusal("provider refusal".to_owned()),
        ] {
            let (_, chunks) = segment_transcript("durable knowledge").unwrap();
            let calls = Arc::new(AtomicUsize::new(0));
            let outcome = orchestrate_candidate_generation(chunks, CancellationFlag::default(), {
                let calls = calls.clone();
                move |_| {
                    let calls = calls.clone();
                    let error = error.clone();
                    async move {
                        calls.fetch_add(1, Ordering::SeqCst);
                        Err(error)
                    }
                }
            })
            .await;
            assert_eq!(calls.load(Ordering::SeqCst), 1);
            assert_eq!(outcome.failed_chunks, 1);
        }
    }

    #[tokio::test]
    async fn partial_empty_failure_and_cancellation_are_distinct() {
        let (_, chunks) = segment_transcript(&"knowledge. ".repeat(2_000)).unwrap();
        let outcome = orchestrate_candidate_generation(
            chunks,
            CancellationFlag::default(),
            |prompt| async move {
                if prompt.chunk_id() == "chunk-0001" {
                    Ok(r#"{"candidates":[]}"#.to_owned())
                } else {
                    Err(CandidateCallError::Permanent(
                        "permanent failure".to_owned(),
                    ))
                }
            },
        )
        .await;
        assert!(
            matches!(outcome.chunks[0], ChunkGenerationStatus::Success(ref items) if items.is_empty())
        );
        assert!(outcome.failed_chunks > 0);

        let (_, chunks) = segment_transcript(&"knowledge. ".repeat(2_000)).unwrap();
        let cancellation = CancellationFlag::default();
        cancellation.cancel();
        let calls = Arc::new(AtomicUsize::new(0));
        let outcome = orchestrate_candidate_generation(chunks, cancellation, {
            let calls = calls.clone();
            move |_| {
                let calls = calls.clone();
                async move {
                    calls.fetch_add(1, Ordering::SeqCst);
                    Ok(String::new())
                }
            }
        })
        .await;
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        assert!(outcome
            .chunks
            .iter()
            .all(|status| matches!(status, ChunkGenerationStatus::Cancelled)));
    }

    #[tokio::test]
    async fn cancellation_aborts_in_flight_and_queued_work_promptly() {
        let (_, chunks) = segment_transcript(&"knowledge. ".repeat(2_000)).unwrap();
        let cancellation = CancellationFlag::default();
        let cancel_from_test = cancellation.clone();
        let task = tokio::spawn(orchestrate_candidate_generation(
            chunks,
            cancellation,
            |_| async {
                tokio::time::sleep(Duration::from_secs(5)).await;
                Ok(r#"{"candidates":[]}"#.to_owned())
            },
        ));
        tokio::time::sleep(Duration::from_millis(20)).await;
        cancel_from_test.cancel();
        let outcome = tokio::time::timeout(Duration::from_millis(250), task)
            .await
            .expect("cancellation should not wait for provider timeouts")
            .unwrap();
        assert!(outcome
            .chunks
            .iter()
            .all(|status| matches!(status, ChunkGenerationStatus::Cancelled)));
    }

    #[test]
    fn total_provider_failure_is_actionable_and_content_free() {
        let outcome = CandidateGenerationOutcome {
            chunks: vec![ChunkGenerationStatus::Failed(
                CandidateCallError::Permanent(
                    "OpenAI rejected the API key. Check it and try again.".to_owned(),
                ),
            )],
            total_chunks: 1,
            completed_chunks: 1,
            successful_chunks: 0,
            failed_chunks: 1,
            candidate_count: 0,
        };
        let error = outcome.ensure_usable().unwrap_err();
        assert_eq!(
            error,
            "OpenAI rejected the API key. Check it and try again."
        );
        assert!(!error.contains("private transcript"));
    }
}
