use super::{
    evidence::validate_candidate_set,
    orchestration::{orchestrate_candidate_generation, CancellationFlag, ChunkGenerationStatus},
    segmentation::segment_transcript,
    selection::{exact_deduplicate, finalize_quiz, select_balanced},
    verification::verify_candidates,
};
use serde_json::json;
use std::collections::HashSet;

#[test]
fn curated_corpus_is_synthetic_and_covers_every_release_category() {
    let corpus: serde_json::Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/grounded_generation_corpus.json"
    ))
    .unwrap();
    assert!(corpus["license"].as_str().unwrap().contains("synthetic"));
    let fixtures = corpus["fixtures"].as_array().unwrap();
    let covered = fixtures
        .iter()
        .flat_map(|fixture| fixture["covers"].as_array().unwrap())
        .map(|category| category.as_str().unwrap())
        .collect::<HashSet<_>>();
    for category in [
        "direct_definition",
        "multi_sentence_mechanism",
        "explicit_comparison",
        "qualified_claim",
        "general_principle_with_example",
        "example_without_principle",
        "classroom_logistics",
        "jokes",
        "speaker_comments",
        "audience_question",
        "personal_anecdote",
        "slide_order",
        "earlier_reference",
        "unresolved_pronoun",
        "evidence_not_entail_answer",
        "overgeneralization",
        "ambiguous_distractors",
        "adjacent_overlap_duplicate",
        "distant_semantic_duplicate",
        "distributed_topics",
        "unicode",
        "timestamps",
        "crlf",
        "long_paragraph",
        "partial_chunk_failure",
        "verifier_failure",
        "quality_empty",
    ] {
        assert!(
            covered.contains(category),
            "missing corpus category {category}"
        );
    }
    for fixture in fixtures {
        assert!(fixture["expectedAcceptedConcepts"].is_array());
        assert!(fixture["expectedRejectionCategories"].is_array());
        assert!(!fixture["transcript"].as_str().unwrap().trim().is_empty());
    }
}

#[tokio::test]
async fn mocked_pipeline_never_bypasses_evidence_or_verification() {
    let source = "ATP transfers usable chemical energy within cells.";
    let (normalized, chunks) = segment_transcript(source).unwrap();
    let generated = orchestrate_candidate_generation(
        chunks.clone(),
        CancellationFlag::default(),
        |_| async move {
            Ok(json!({ "candidates": [
                {
                    "topic": "Energy",
                    "question_type": "single_choice", "question": "What does ATP transfer within cells?",
                    "answers": ["Usable chemical energy", "Genetic information"],
                    "correct_answers": ["Usable chemical energy"], "explanation": "ATP transfers energy.",
                    "evidence_quote": "ATP transfers usable chemical energy within cells."
                },
                {
                    "topic": "Energy",
                    "question_type": "single_choice", "question": "Where is ATP made?",
                    "answers": ["The nucleus", "The membrane"], "correct_answers": ["The nucleus"],
                    "explanation": "Not in the fixture.", "evidence_quote": "ATP is made in the nucleus."
                }
            ] }).to_string())
        },
    )
    .await;
    assert!(matches!(
        generated.chunks[0],
        ChunkGenerationStatus::Success(_)
    ));
    let candidates = generated
        .chunks
        .into_iter()
        .flat_map(|status| match status {
            ChunkGenerationStatus::Success(items) => items,
            _ => Vec::new(),
        })
        .collect();
    let (validated, deterministic_rejections) = validate_candidate_set(candidates, &chunks);
    assert_eq!(deterministic_rejections.len(), 1);
    assert_eq!(
        &normalized[validated[0].evidence_source_bytes.clone()],
        validated[0].candidate.evidence_quote
    );
    let verified = verify_candidates(validated, &chunks, CancellationFlag::default(), |_| async {
        Ok(json!({ "decisions": [{
            "candidate_id": "chunk-0001-candidate-1", "supported": true, "standalone": true,
            "portable": true, "qualifications_preserved": true, "not_overgeneralized": true,
            "choices_unambiguous": true, "reason": "accepted"
        }] })
        .to_string())
    })
    .await;
    assert_eq!(verified.accepted.len(), 1);
    let (deduplicated, _) = exact_deduplicate(verified.accepted);
    let selected = select_balanced(deduplicated, 8);
    let quiz = finalize_quiz(selected);
    assert_eq!(quiz.questions.len(), 1);
    assert_eq!(quiz.questions[0].id, "q-0001");
}
