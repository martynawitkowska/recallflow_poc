use recallflow_lib::{
    commands::{
        attempts::{list_quiz_attempts_from_pool, save_quiz_attempt_to_pool},
        library::{delete_imported_quiz_from_pool, save_imported_quiz_to_pool},
    },
    database::{connect, initialize_schema},
    models::{ImportedQuiz, QuestionType, QuizAttempt, QuizFile, QuizQuestion},
};
use sqlx::sqlite::SqlitePoolOptions;
use std::time::{SystemTime, UNIX_EPOCH};

fn sample_quiz() -> ImportedQuiz {
    ImportedQuiz {
        id: "quiz-1".to_owned(),
        name: "quiz.json".to_owned(),
        size: 512,
        imported_at: "2026-07-17T10:00:00.000Z".to_owned(),
        quiz: QuizFile {
            title: "RecallFlow".to_owned(),
            description: None,
            questions: vec![
                QuizQuestion {
                    id: "q1".to_owned(),
                    question_type: QuestionType::TrueFalse,
                    question: "RecallFlow is local-first.".to_owned(),
                    answers: vec!["True".to_owned(), "False".to_owned()],
                    correct_answers: vec!["True".to_owned()],
                    explanation: None,
                    mnemonic: None,
                },
                QuizQuestion {
                    id: "q2".to_owned(),
                    question_type: QuestionType::SingleChoice,
                    question: "Where are attempts stored?".to_owned(),
                    answers: vec!["Locally".to_owned(), "Remotely".to_owned()],
                    correct_answers: vec!["Locally".to_owned()],
                    explanation: None,
                    mnemonic: None,
                },
            ],
        },
    }
}

#[test]
fn attempts_survive_database_reopen() {
    tauri::async_runtime::block_on(async {
        let database_path = std::env::temp_dir().join(format!(
            "recallflow-attempts-{}-{}.sqlite3",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should follow the Unix epoch")
                .as_nanos()
        ));
        let quiz = sample_quiz();
        let attempt = QuizAttempt {
            id: "attempt-durable".to_owned(),
            quiz_id: quiz.id.clone(),
            completed_at: "2026-07-17T11:00:00.000Z".to_owned(),
            score: 1,
            total: 2,
            incorrect_question_ids: vec!["q2".to_owned()],
        };

        let pool = connect(&database_path)
            .await
            .expect("file database should open");
        save_imported_quiz_to_pool(&pool, &quiz)
            .await
            .expect("quiz should save");
        save_quiz_attempt_to_pool(&pool, &attempt)
            .await
            .expect("attempt should save");
        pool.close().await;

        let reopened = connect(&database_path)
            .await
            .expect("file database should reopen");
        assert_eq!(
            list_quiz_attempts_from_pool(&reopened).await.unwrap(),
            vec![attempt]
        );
        reopened.close().await;
        std::fs::remove_file(database_path).expect("temporary database should delete");
    });
}

#[test]
fn attempts_round_trip_update_idempotently_and_follow_quiz_deletion() {
    tauri::async_runtime::block_on(async {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory database should open");
        initialize_schema(&pool)
            .await
            .expect("quiz schema should initialize");
        let quiz = sample_quiz();
        save_imported_quiz_to_pool(&pool, &quiz)
            .await
            .expect("quiz should save");

        let mut attempt = QuizAttempt {
            id: "attempt-1".to_owned(),
            quiz_id: quiz.id.clone(),
            completed_at: "2026-07-17T11:00:00.000Z".to_owned(),
            score: 1,
            total: 2,
            incorrect_question_ids: vec!["q2".to_owned()],
        };
        save_quiz_attempt_to_pool(&pool, &attempt)
            .await
            .expect("attempt should save");
        assert_eq!(
            list_quiz_attempts_from_pool(&pool).await.unwrap(),
            vec![attempt.clone()]
        );

        attempt.score = 2;
        attempt.incorrect_question_ids.clear();
        save_quiz_attempt_to_pool(&pool, &attempt)
            .await
            .expect("retry should update the same attempt");
        assert_eq!(
            list_quiz_attempts_from_pool(&pool).await.unwrap(),
            vec![attempt.clone()]
        );

        let repair_attempt = QuizAttempt {
            id: "attempt-2".to_owned(),
            quiz_id: quiz.id.clone(),
            completed_at: "2026-07-17T12:00:00.000Z".to_owned(),
            score: 0,
            total: 1,
            incorrect_question_ids: vec!["q2".to_owned()],
        };
        save_quiz_attempt_to_pool(&pool, &repair_attempt)
            .await
            .expect("targeted repair attempt should save");
        assert_eq!(
            list_quiz_attempts_from_pool(&pool).await.unwrap(),
            vec![repair_attempt, attempt]
        );

        delete_imported_quiz_from_pool(&pool, &quiz.id)
            .await
            .expect("quiz and attempts should delete");
        assert!(list_quiz_attempts_from_pool(&pool)
            .await
            .expect("attempt list should load")
            .is_empty());
    });
}

#[test]
fn invalid_attempts_are_rejected() {
    tauri::async_runtime::block_on(async {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory database should open");
        initialize_schema(&pool)
            .await
            .expect("quiz schema should initialize");
        let quiz = sample_quiz();
        save_imported_quiz_to_pool(&pool, &quiz)
            .await
            .expect("quiz should save");

        let invalid = QuizAttempt {
            id: "invalid".to_owned(),
            quiz_id: quiz.id,
            completed_at: "2026-07-17T11:00:00.000Z".to_owned(),
            score: 2,
            total: 2,
            incorrect_question_ids: vec!["q2".to_owned()],
        };

        assert_eq!(
            save_quiz_attempt_to_pool(&pool, &invalid).await,
            Err("RecallFlow could not save an invalid quiz result.".to_owned())
        );

        let oversized = QuizAttempt {
            id: "oversized".to_owned(),
            score: 3,
            total: 3,
            incorrect_question_ids: vec![],
            ..invalid
        };
        assert_eq!(
            save_quiz_attempt_to_pool(&pool, &oversized).await,
            Err("RecallFlow could not save an invalid quiz result.".to_owned())
        );
    });
}
