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

    Ok(())
}
