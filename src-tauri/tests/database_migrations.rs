use recallflow_lib::{
    commands::{
        attempts::{list_quiz_attempts_from_pool, save_quiz_attempt_to_pool},
        library::list_imported_quizzes_from_pool,
    },
    database::initialize_schema,
    models::{ImportedQuiz, QuestionType, QuizAttempt, QuizFile, QuizQuestion},
};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};

fn legacy_quiz() -> ImportedQuiz {
    ImportedQuiz {
        id: "legacy-quiz".to_owned(),
        name: "legacy.json".to_owned(),
        size: 512,
        imported_at: "2026-07-16T10:00:00.000Z".to_owned(),
        quiz: QuizFile {
            title: "Legacy library quiz".to_owned(),
            description: None,
            video_url: None,
            questions: vec![QuizQuestion {
                id: "q1".to_owned(),
                question_type: QuestionType::TrueFalse,
                question: "Existing local data survives migrations.".to_owned(),
                answers: vec!["True".to_owned(), "False".to_owned()],
                correct_answers: vec!["True".to_owned()],
                explanation: None,
                mnemonic: None,
            }],
        },
    }
}

async fn legacy_database() -> (SqlitePool, ImportedQuiz) {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("legacy database should open");
    sqlx::query(
        "CREATE TABLE imported_quizzes (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            size INTEGER NOT NULL,
            imported_at TEXT NOT NULL,
            quiz_json TEXT NOT NULL
        )",
    )
    .execute(&pool)
    .await
    .expect("legacy library schema should exist");

    let quiz = legacy_quiz();
    sqlx::query(
        "INSERT INTO imported_quizzes (id, name, size, imported_at, quiz_json)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&quiz.id)
    .bind(&quiz.name)
    .bind(quiz.size)
    .bind(&quiz.imported_at)
    .bind(serde_json::to_string(&quiz.quiz).unwrap())
    .execute(&pool)
    .await
    .expect("legacy quiz should save");

    (pool, quiz)
}

#[test]
fn legacy_library_schema_migrates_idempotently_without_data_loss() {
    tauri::async_runtime::block_on(async {
        let (pool, quiz) = legacy_database().await;

        initialize_schema(&pool)
            .await
            .expect("legacy schema should migrate");
        initialize_schema(&pool)
            .await
            .expect("migration should be idempotent");

        assert_eq!(
            list_imported_quizzes_from_pool(&pool).await.unwrap(),
            vec![quiz.clone()]
        );
        let schema_objects: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master
             WHERE name IN ('imported_quizzes', 'quiz_attempts', 'idx_quiz_attempts_quiz_id')
             ORDER BY name",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(
            schema_objects,
            [
                "idx_quiz_attempts_quiz_id",
                "imported_quizzes",
                "quiz_attempts"
            ]
        );

        let attempt = QuizAttempt {
            id: "post-migration-attempt".to_owned(),
            quiz_id: quiz.id,
            completed_at: "2026-07-17T10:00:00.000Z".to_owned(),
            score: 1,
            total: 1,
            incorrect_question_ids: vec![],
        };
        save_quiz_attempt_to_pool(&pool, &attempt)
            .await
            .expect("migrated attempt storage should be usable");
        assert_eq!(
            list_quiz_attempts_from_pool(&pool).await.unwrap(),
            vec![attempt]
        );
    });
}

#[test]
fn incompatible_schema_fails_safely_without_deleting_legacy_data() {
    tauri::async_runtime::block_on(async {
        let (pool, quiz) = legacy_database().await;
        sqlx::query("CREATE TABLE quiz_attempts (id TEXT PRIMARY KEY NOT NULL)")
            .execute(&pool)
            .await
            .expect("incompatible table should exist");

        assert_eq!(
            initialize_schema(&pool).await,
            Err(
                "RecallFlow could not initialize local storage. Restart the app and try again."
                    .to_owned()
            )
        );
        assert_eq!(
            list_imported_quizzes_from_pool(&pool).await.unwrap(),
            vec![quiz]
        );
    });
}
