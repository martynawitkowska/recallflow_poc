use recallflow_lib::models::{ImportedQuiz, QuestionType, QuizFile};
use serde_json::json;

#[test]
fn quiz_schema_round_trips_the_frontend_contract() {
    let payload = json!({
        "title": "Biology",
        "description": "Cell structure review",
        "questions": [
            {
                "id": "cell-1",
                "type": "single_choice",
                "question": "Which organelle produces ATP?",
                "answers": ["Mitochondrion", "Nucleus"],
                "correctAnswers": ["Mitochondrion"],
                "explanation": "Mitochondria generate most cellular ATP.",
                "mnemonic": "Mighty mitochondria make ATP."
            },
            {
                "id": "cell-2",
                "type": "multiple_choice",
                "question": "Which structures occur in plant cells?",
                "answers": ["Cell wall", "Chloroplast", "Centriole"],
                "correctAnswers": ["Cell wall", "Chloroplast"]
            },
            {
                "id": "cell-3",
                "type": "true_false",
                "question": "The nucleus contains genetic material.",
                "answers": ["True", "False"],
                "correctAnswers": ["True"]
            }
        ]
    });

    let quiz: QuizFile =
        serde_json::from_value(payload.clone()).expect("frontend quiz should deserialize");

    assert_eq!(quiz.questions[0].question_type, QuestionType::SingleChoice);
    assert_eq!(
        quiz.questions[1].question_type,
        QuestionType::MultipleChoice
    );
    assert_eq!(quiz.questions[2].question_type, QuestionType::TrueFalse);
    assert_eq!(
        serde_json::to_value(quiz).expect("quiz should serialize"),
        payload
    );
}

#[test]
fn optional_quiz_fields_can_be_omitted() {
    let payload = json!({
        "title": "Minimal quiz",
        "questions": [{
            "id": "q1",
            "type": "true_false",
            "question": "RecallFlow is local-first.",
            "answers": ["True", "False"],
            "correctAnswers": ["True"]
        }]
    });

    let quiz: QuizFile =
        serde_json::from_value(payload.clone()).expect("optional fields should be optional");

    assert_eq!(
        serde_json::to_value(quiz).expect("quiz should serialize"),
        payload
    );
}

#[test]
fn imported_quiz_serializes_to_the_library_contract() {
    let payload = json!({
        "id": "quiz-1",
        "name": "biology.json",
        "size": 512,
        "importedAt": "2026-07-16T10:00:00.000Z",
        "quiz": {
            "title": "Biology",
            "questions": [{
                "id": "q1",
                "type": "true_false",
                "question": "Cells contain DNA.",
                "answers": ["True", "False"],
                "correctAnswers": ["True"]
            }]
        }
    });

    let imported_quiz: ImportedQuiz =
        serde_json::from_value(payload.clone()).expect("library quiz should deserialize");

    assert_eq!(
        serde_json::to_value(imported_quiz).expect("library quiz should serialize"),
        payload
    );
}
