use recallflow_lib::{
    commands::generation::{
        parse_generated_quiz_json, validate_generation_request, GenerationSource,
    },
    models::GenerateQuizRequest,
};
use serde_json::json;

fn valid_generated_quiz() -> serde_json::Value {
    let questions = (1..=8)
        .map(|index| {
            json!({
                "id": format!("q{index}"),
                "type": "single_choice",
                "question": format!("Question {index}?"),
                "answers": ["Correct", "Incorrect"],
                "correctAnswers": ["Correct"],
                "explanation": "Grounded in the supplied material."
            })
        })
        .collect::<Vec<_>>();

    json!({
        "title": "Generated quiz",
        "description": "Eight generated questions",
        "questions": questions
    })
}

#[test]
fn generation_request_requires_material_and_api_key() {
    let missing_material = GenerateQuizRequest {
        material: Some("  ".to_owned()),
        source_url: None,
        api_key: "request-only-key".to_owned(),
    };
    let missing_key = GenerateQuizRequest {
        material: Some("Useful study notes".to_owned()),
        source_url: None,
        api_key: "  ".to_owned(),
    };

    assert!(validate_generation_request(&missing_material)
        .err()
        .expect("empty material should fail")
        .contains("Paste study material"));
    assert!(validate_generation_request(&missing_key)
        .err()
        .expect("empty API key should fail")
        .contains("OpenAI API key"));
}

#[test]
fn generation_request_accepts_one_readable_url_source() {
    let valid_url = GenerateQuizRequest {
        material: None,
        source_url: Some("https://example.com/lecture".to_owned()),
        api_key: "request-only-key".to_owned(),
    };
    let invalid_url = GenerateQuizRequest {
        material: None,
        source_url: Some("ftp://example.com/lecture".to_owned()),
        api_key: "request-only-key".to_owned(),
    };
    let conflicting_sources = GenerateQuizRequest {
        material: Some("Useful study notes".to_owned()),
        source_url: Some("https://example.com/lecture".to_owned()),
        api_key: "request-only-key".to_owned(),
    };

    assert!(matches!(
        validate_generation_request(&valid_url),
        Ok(GenerationSource::Url("https://example.com/lecture"))
    ));
    assert!(validate_generation_request(&invalid_url)
        .err()
        .expect("non-web URL should fail")
        .contains("http:// or https://"));
    assert!(validate_generation_request(&conflicting_sources)
        .err()
        .expect("multiple sources should fail")
        .contains("either pasted study material or a URL"));
}

#[test]
fn generated_quiz_must_match_the_shared_contract() {
    let valid_json = valid_generated_quiz().to_string();
    let quiz = parse_generated_quiz_json(&valid_json).expect("valid quiz should parse");

    assert_eq!(quiz.title, "Generated quiz");
    assert_eq!(quiz.questions.len(), 8);

    let invalid_json = json!({
        "title": "Invalid quiz",
        "questions": []
    })
    .to_string();
    assert!(parse_generated_quiz_json(&invalid_json).is_err());
}
