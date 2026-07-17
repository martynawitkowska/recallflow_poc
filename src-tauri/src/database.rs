use sqlx::{sqlite::SqliteConnectOptions, sqlite::SqlitePoolOptions, SqlitePool};
use std::path::Path;

const DATABASE_ERROR: &str =
    "RecallFlow could not initialize local storage. Restart the app and try again.";

pub async fn connect(database_path: &Path) -> Result<SqlitePool, String> {
    let options = SqliteConnectOptions::new()
        .filename(database_path)
        .create_if_missing(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|_| DATABASE_ERROR.to_owned())?;

    initialize_schema(&pool).await?;
    Ok(pool)
}

pub async fn initialize_schema(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS imported_quizzes (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            size INTEGER NOT NULL,
            imported_at TEXT NOT NULL,
            quiz_json TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await
    .map_err(|_| DATABASE_ERROR.to_owned())?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS quiz_attempts (
            id TEXT PRIMARY KEY NOT NULL,
            quiz_id TEXT NOT NULL,
            completed_at TEXT NOT NULL,
            score INTEGER NOT NULL,
            total INTEGER NOT NULL,
            incorrect_question_ids_json TEXT NOT NULL,
            FOREIGN KEY (quiz_id) REFERENCES imported_quizzes(id) ON DELETE CASCADE
        )",
    )
    .execute(pool)
    .await
    .map_err(|_| DATABASE_ERROR.to_owned())?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id
         ON quiz_attempts(quiz_id)",
    )
    .execute(pool)
    .await
    .map_err(|_| DATABASE_ERROR.to_owned())?;

    Ok(())
}
