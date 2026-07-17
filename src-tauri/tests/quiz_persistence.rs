use recallflow_lib::{
    commands::library::{
        clear_imported_quizzes_from_pool, delete_imported_quiz_from_pool,
        list_imported_quizzes_from_pool, save_imported_quiz_to_pool, save_quiz_mnemonic_to_pool,
    },
    database::initialize_schema,
    models::{ImportedQuiz, QuestionType, QuizFile, QuizQuestion, SaveMnemonicRequest},
};
use sqlx::sqlite::SqlitePoolOptions;

fn sample_quiz(id: &str, title: &str, imported_at: &str) -> ImportedQuiz {
    ImportedQuiz {
        id: id.to_owned(),
        name: format!("{id}.json"),
        size: 512,
        imported_at: imported_at.to_owned(),
        quiz: QuizFile {
            title: title.to_owned(),
            description: Some("A persisted quiz".to_owned()),
            questions: vec![QuizQuestion {
                id: "q1".to_owned(),
                question_type: QuestionType::TrueFalse,
                question: "RecallFlow stores quizzes locally.".to_owned(),
                answers: vec!["True".to_owned(), "False".to_owned()],
                correct_answers: vec!["True".to_owned()],
                explanation: None,
                mnemonic: Some("Local means it stays close.".to_owned()),
            }],
        },
    }
}

#[test]
fn mnemonic_is_sanitized_persisted_and_idempotent() {
    tauri::async_runtime::block_on(async {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory database should open");
        initialize_schema(&pool)
            .await
            .expect("quiz schema should initialize");
        let quiz = sample_quiz("quiz", "Quiz", "2026-07-17T10:00:00.000Z");
        save_imported_quiz_to_pool(&pool, &quiz).await.unwrap();

        let saved = save_quiz_mnemonic_to_pool(
            &pool,
            SaveMnemonicRequest {
                quiz_id: " quiz ".to_owned(),
                question_id: " q1 ".to_owned(),
                mnemonic: "  Bright\n images\tbring recall.  ".to_owned(),
            },
        )
        .await
        .expect("valid mnemonic should save");
        let repeated = save_quiz_mnemonic_to_pool(
            &pool,
            SaveMnemonicRequest {
                quiz_id: "quiz".to_owned(),
                question_id: "q1".to_owned(),
                mnemonic: "Bright images bring recall.".to_owned(),
            },
        )
        .await
        .expect("repeated save should be idempotent");
        let reloaded = list_imported_quizzes_from_pool(&pool).await.unwrap();

        assert_eq!(
            saved.quiz.questions[0].mnemonic.as_deref(),
            Some("Bright images bring recall.")
        );
        assert_eq!(repeated, saved);
        assert_eq!(reloaded, vec![saved]);
    });
}

#[test]
fn mnemonic_save_rejects_invalid_or_missing_targets_without_changes() {
    tauri::async_runtime::block_on(async {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory database should open");
        initialize_schema(&pool)
            .await
            .expect("quiz schema should initialize");
        let quiz = sample_quiz("quiz", "Quiz", "2026-07-17T10:00:00.000Z");
        save_imported_quiz_to_pool(&pool, &quiz).await.unwrap();

        for request in [
            SaveMnemonicRequest {
                quiz_id: "quiz".to_owned(),
                question_id: "q1".to_owned(),
                mnemonic: " \0 ".to_owned(),
            },
            SaveMnemonicRequest {
                quiz_id: "quiz".to_owned(),
                question_id: "missing".to_owned(),
                mnemonic: "Valid mnemonic".to_owned(),
            },
            SaveMnemonicRequest {
                quiz_id: "missing".to_owned(),
                question_id: "q1".to_owned(),
                mnemonic: "Valid mnemonic".to_owned(),
            },
        ] {
            assert!(save_quiz_mnemonic_to_pool(&pool, request).await.is_err());
        }

        assert_eq!(
            list_imported_quizzes_from_pool(&pool).await.unwrap(),
            vec![quiz]
        );
    });
}

#[test]
fn imported_quizzes_round_trip_in_newest_first_order() {
    tauri::async_runtime::block_on(async {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory database should open");
        initialize_schema(&pool)
            .await
            .expect("quiz schema should initialize");

        let older = sample_quiz("older", "Older quiz", "2026-07-15T10:00:00.000Z");
        let mut newer = sample_quiz("newer", "Newer quiz", "2026-07-16T10:00:00.000Z");
        save_imported_quiz_to_pool(&pool, &older)
            .await
            .expect("older quiz should save");
        save_imported_quiz_to_pool(&pool, &newer)
            .await
            .expect("newer quiz should save");
        newer.quiz.questions[0].mnemonic = Some("Updated local mnemonic.".to_owned());
        save_imported_quiz_to_pool(&pool, &newer)
            .await
            .expect("saved mnemonic should update the quiz");

        let stored = list_imported_quizzes_from_pool(&pool)
            .await
            .expect("stored quizzes should load");

        assert_eq!(stored, vec![newer, older]);
    });
}

#[test]
fn imported_quizzes_can_be_deleted_and_cleared() {
    tauri::async_runtime::block_on(async {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory database should open");
        initialize_schema(&pool)
            .await
            .expect("quiz schema should initialize");

        let first = sample_quiz("first", "First quiz", "2026-07-16T09:00:00.000Z");
        let second = sample_quiz("second", "Second quiz", "2026-07-16T10:00:00.000Z");
        save_imported_quiz_to_pool(&pool, &first)
            .await
            .expect("first quiz should save");
        save_imported_quiz_to_pool(&pool, &second)
            .await
            .expect("second quiz should save");

        delete_imported_quiz_from_pool(&pool, &first.id)
            .await
            .expect("one quiz should delete");
        assert_eq!(
            list_imported_quizzes_from_pool(&pool)
                .await
                .expect("remaining quiz should load"),
            vec![second]
        );

        clear_imported_quizzes_from_pool(&pool)
            .await
            .expect("library should clear");
        assert!(list_imported_quizzes_from_pool(&pool)
            .await
            .expect("cleared library should load")
            .is_empty());
    });
}
