use recallflow_lib::models::{
    AiProvider, ApiKeyStatus, GenerateMnemonicRequest, GenerateQuizRequest, QuizAttempt,
    SaveMnemonicRequest,
};
use serde_json::json;

#[test]
fn quiz_attempt_round_trips_the_frontend_contract() {
    let payload = json!({
        "id": "attempt-1",
        "quizId": "quiz-1",
        "completedAt": "2026-07-17T12:00:00.000Z",
        "score": 2,
        "total": 3,
        "incorrectQuestionIds": ["q3"]
    });

    let attempt: QuizAttempt =
        serde_json::from_value(payload.clone()).expect("frontend attempt should deserialize");

    assert_eq!(attempt.quiz_id, "quiz-1");
    assert_eq!(attempt.incorrect_question_ids, ["q3"]);
    assert_eq!(
        serde_json::to_value(attempt).expect("attempt should serialize"),
        payload
    );
}

#[test]
fn generation_requests_deserialize_the_frontend_contract() {
    let quiz: GenerateQuizRequest = serde_json::from_value(json!({
        "sourceUrl": "https://example.com/lecture",
        "provider": "openai",
        "model": "gpt-5.4-mini",
        "questionCount": 8
    }))
    .expect("quiz request should deserialize");
    let mnemonic: GenerateMnemonicRequest = serde_json::from_value(json!({
        "question": "Where are memories formed?",
        "correctAnswers": ["Through active recall"],
        "explanation": "Retrieval strengthens memory.",
        "provider": "gemini",
        "model": "gemini-3.5-flash"
    }))
    .expect("mnemonic request should deserialize");

    assert_eq!(quiz.material, None);
    assert_eq!(
        quiz.source_url.as_deref(),
        Some("https://example.com/lecture")
    );
    assert_eq!(quiz.question_count, 8);
    assert!(matches!(quiz.provider, AiProvider::Openai));
    assert_eq!(mnemonic.correct_answers, ["Through active recall"]);
    assert!(matches!(mnemonic.provider, AiProvider::Gemini));
    assert_eq!(mnemonic.model.as_deref(), Some("gemini-3.5-flash"));
}

#[test]
fn secret_and_mnemonic_payloads_keep_stable_public_fields() {
    let status = ApiKeyStatus {
        configured: true,
        masked_key: Some("••••••••1234".to_owned()),
    };
    let save_request: SaveMnemonicRequest = serde_json::from_value(json!({
        "quizId": "quiz-1",
        "questionId": "q1",
        "mnemonic": "Memory hook"
    }))
    .expect("mnemonic save request should deserialize");
    let unknown_provider: AiProvider =
        serde_json::from_value(json!("future-provider")).expect("unknown provider should parse");

    assert_eq!(
        serde_json::to_value(status).expect("status should serialize"),
        json!({ "configured": true, "maskedKey": "••••••••1234" })
    );
    assert_eq!(save_request.quiz_id, "quiz-1");
    assert_eq!(save_request.question_id, "q1");
    assert_eq!(save_request.mnemonic, "Memory hook");
    assert!(matches!(unknown_provider, AiProvider::Unsupported));
}
