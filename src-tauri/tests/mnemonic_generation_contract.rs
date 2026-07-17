use recallflow_lib::{
    generation::{parse_generated_mnemonic, validate_mnemonic_request},
    models::{AiProvider, GenerateMnemonicRequest},
};

fn valid_request() -> GenerateMnemonicRequest {
    GenerateMnemonicRequest {
        question: "Where are durable memories formed?".to_owned(),
        correct_answers: vec!["Through active recall".to_owned()],
        explanation: Some("Retrieval strengthens memory pathways.".to_owned()),
        provider: AiProvider::Openai,
        model: None,
        api_key: "request-only-key".to_owned(),
    }
}

#[test]
fn mnemonic_request_requires_question_answer_and_key() {
    for provider in [AiProvider::Openai, AiProvider::Gemini, AiProvider::Claude] {
        assert!(validate_mnemonic_request(&GenerateMnemonicRequest {
            provider,
            ..valid_request()
        })
        .is_ok());
    }

    let missing_question = GenerateMnemonicRequest {
        question: "  ".to_owned(),
        ..valid_request()
    };
    let missing_answer = GenerateMnemonicRequest {
        correct_answers: vec![],
        ..valid_request()
    };
    let missing_key = GenerateMnemonicRequest {
        api_key: "  ".to_owned(),
        ..valid_request()
    };

    assert!(validate_mnemonic_request(&missing_question).is_err());
    assert!(validate_mnemonic_request(&missing_answer).is_err());
    assert!(validate_mnemonic_request(&missing_key)
        .expect_err("missing key should fail")
        .contains("API key"));
}

#[test]
fn mnemonic_request_rejects_unsupported_or_oversized_context() {
    let unsupported: GenerateMnemonicRequest = serde_json::from_value(serde_json::json!({
        "question": "Question?",
        "correctAnswers": ["Answer"],
        "provider": "unsupported",
        "apiKey": "request-only-key"
    }))
    .expect("unknown providers should reach command validation");
    let oversized = GenerateMnemonicRequest {
        question: "a".repeat(8_001),
        ..valid_request()
    };

    assert!(validate_mnemonic_request(&unsupported).is_err());
    assert!(validate_mnemonic_request(&oversized).is_err());
}

#[test]
fn mnemonic_response_is_trimmed_and_bounded() {
    assert_eq!(
        parse_generated_mnemonic("  Recall by\n calling\t the answer back.  ").unwrap(),
        "Recall by calling the answer back."
    );
    assert!(parse_generated_mnemonic("   ").is_err());
    assert!(parse_generated_mnemonic("Unsafe\0control").is_err());
    assert!(parse_generated_mnemonic(&"a".repeat(1_001)).is_err());
}
