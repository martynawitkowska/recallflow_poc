use recallflow_lib::{
    generation::{parse_generated_quiz_json, validate_generation_request, GenerationSource},
    models::{AiProvider, GenerateQuizRequest},
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
fn generation_request_requires_material() {
    let missing_material = GenerateQuizRequest {
        material: Some("  ".to_owned()),
        source_url: None,
        provider: AiProvider::Openai,
        model: None,
        question_count: 8,
    };

    assert!(validate_generation_request(&missing_material)
        .expect_err("empty material should fail")
        .contains("Paste study material"));
}

#[test]
fn generation_request_accepts_one_readable_url_source() {
    let valid_url = GenerateQuizRequest {
        material: None,
        source_url: Some("https://example.com/lecture".to_owned()),
        provider: AiProvider::Openai,
        model: None,
        question_count: 8,
    };
    let invalid_url = GenerateQuizRequest {
        material: None,
        source_url: Some("ftp://example.com/lecture".to_owned()),
        provider: AiProvider::Openai,
        model: None,
        question_count: 8,
    };
    let conflicting_sources = GenerateQuizRequest {
        material: Some("Useful study notes".to_owned()),
        source_url: Some("https://example.com/lecture".to_owned()),
        provider: AiProvider::Openai,
        model: None,
        question_count: 8,
    };

    assert!(matches!(
        validate_generation_request(&valid_url),
        Ok(GenerationSource::Url("https://example.com/lecture"))
    ));
    assert!(validate_generation_request(&invalid_url)
        .expect_err("non-web URL should fail")
        .contains("http:// or https://"));
    assert!(validate_generation_request(&conflicting_sources)
        .expect_err("multiple sources should fail")
        .contains("either pasted study material or a URL"));
}

#[test]
fn generation_request_validates_provider_and_question_count() {
    let unsupported_provider: GenerateQuizRequest = serde_json::from_value(json!({
        "material": "Useful study notes",
        "provider": "gemini",
        "questionCount": 8
    }))
    .expect("known providers should reach command validation");
    let invalid_count = GenerateQuizRequest {
        material: Some("Useful study notes".to_owned()),
        source_url: None,
        provider: AiProvider::Openai,
        model: None,
        question_count: 26,
    };

    assert!(validate_generation_request(&unsupported_provider)
        .expect_err("unsupported provider should fail")
        .contains("selected quiz provider is not available"));
    assert!(matches!(unsupported_provider.provider, AiProvider::Gemini));
    assert!(validate_generation_request(&invalid_count)
        .expect_err("out-of-range count should fail")
        .contains("between 3 and 25"));
}

#[test]
fn generation_request_rejects_oversized_sources() {
    let oversized_material = GenerateQuizRequest {
        material: Some("a".repeat(14_001)),
        source_url: None,
        provider: AiProvider::Openai,
        model: None,
        question_count: 8,
    };
    let oversized_url = GenerateQuizRequest {
        material: None,
        source_url: Some(format!("https://example.com/{}", "a".repeat(2_048))),
        provider: AiProvider::Openai,
        model: None,
        question_count: 8,
    };

    assert!(validate_generation_request(&oversized_material)
        .expect_err("oversized material should fail")
        .contains("14000 characters or fewer"));
    assert!(validate_generation_request(&oversized_url)
        .expect_err("oversized URL should fail")
        .contains("source URL is too long"));
}

#[test]
fn generated_quiz_must_match_the_shared_contract() {
    let valid_json = valid_generated_quiz().to_string();
    let quiz = parse_generated_quiz_json(&valid_json, 8).expect("valid quiz should parse");

    assert_eq!(quiz.title, "Generated quiz");
    assert_eq!(quiz.questions.len(), 8);

    let invalid_json = json!({
        "title": "Invalid quiz",
        "questions": []
    })
    .to_string();
    assert!(parse_generated_quiz_json(&invalid_json, 8).is_err());
    assert!(parse_generated_quiz_json(&valid_json, 7).is_err());
}

#[test]
fn provider_json_is_extracted_and_normalized_before_validation() {
    let mut generated = valid_generated_quiz();
    generated["title"] = json!("  Generated quiz  ");
    generated["description"] = json!("   ");
    generated["questions"][0]["id"] = json!(" q1 ");
    generated["questions"][0]["question"] = json!("  Question 1?  ");
    generated["questions"][0]["answers"] = json!([" Correct ", " Incorrect "]);
    generated["questions"][0]["correctAnswers"] = json!([" Correct "]);
    generated["questions"][0]["explanation"] = json!("   ");
    let wrapped = format!("Here is the quiz:\n```json\n{generated}\n```\n");

    let quiz = parse_generated_quiz_json(&wrapped, 8)
        .expect("wrapped provider JSON should normalize into a valid quiz");

    assert_eq!(quiz.title, "Generated quiz");
    assert_eq!(quiz.description, None);
    assert_eq!(quiz.questions[0].id, "q1");
    assert_eq!(quiz.questions[0].question, "Question 1?");
    assert_eq!(quiz.questions[0].answers, ["Correct", "Incorrect"]);
    assert_eq!(quiz.questions[0].correct_answers, ["Correct"]);
    assert_eq!(quiz.questions[0].explanation, None);
}

#[test]
fn normalized_provider_json_still_rejects_semantic_errors() {
    let mut duplicate_answers = valid_generated_quiz();
    duplicate_answers["questions"][0]["answers"] = json!(["Answer", " Answer "]);
    duplicate_answers["questions"][0]["correctAnswers"] = json!(["Answer"]);

    let mut duplicate_correct_answers = valid_generated_quiz();
    duplicate_correct_answers["questions"][0]["type"] = json!("multiple_choice");
    duplicate_correct_answers["questions"][0]["correctAnswers"] = json!(["Correct", " Correct "]);

    assert!(parse_generated_quiz_json(&duplicate_answers.to_string(), 8).is_err());
    assert!(parse_generated_quiz_json(&duplicate_correct_answers.to_string(), 8).is_err());
    assert!(parse_generated_quiz_json("The provider returned no JSON.", 8).is_err());
}
