use crate::{models::ImportedQuiz, state::DatabaseState};
use sqlx::{Row, SqlitePool};
use tauri::State;

const READ_ERROR: &str =
    "RecallFlow could not read the local quiz library. Restart the app and try again.";
const WRITE_ERROR: &str =
    "RecallFlow could not update the local quiz library. Restart the app and try again.";
const INVALID_QUIZ_ERROR: &str = "RecallFlow could not save an invalid quiz.";

#[tauri::command]
pub async fn list_imported_quizzes(
    state: State<'_, DatabaseState>,
) -> Result<Vec<ImportedQuiz>, String> {
    list_imported_quizzes_from_pool(state.pool()).await
}

#[tauri::command]
pub async fn save_imported_quiz(
    state: State<'_, DatabaseState>,
    quiz: ImportedQuiz,
) -> Result<(), String> {
    save_imported_quiz_to_pool(state.pool(), &quiz).await
}

#[tauri::command]
pub async fn delete_imported_quiz(
    state: State<'_, DatabaseState>,
    quiz_id: String,
) -> Result<(), String> {
    delete_imported_quiz_from_pool(state.pool(), &quiz_id).await
}

#[tauri::command]
pub async fn clear_imported_quizzes(state: State<'_, DatabaseState>) -> Result<(), String> {
    clear_imported_quizzes_from_pool(state.pool()).await
}

pub async fn list_imported_quizzes_from_pool(
    pool: &SqlitePool,
) -> Result<Vec<ImportedQuiz>, String> {
    let rows = sqlx::query(
        "SELECT id, name, size, imported_at, quiz_json
         FROM imported_quizzes
         ORDER BY imported_at DESC, id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|_| READ_ERROR.to_owned())?;

    rows.into_iter()
        .map(|row| {
            let quiz_json: String = row
                .try_get("quiz_json")
                .map_err(|_| READ_ERROR.to_owned())?;
            Ok(ImportedQuiz {
                id: row.try_get("id").map_err(|_| READ_ERROR.to_owned())?,
                name: row.try_get("name").map_err(|_| READ_ERROR.to_owned())?,
                size: row.try_get("size").map_err(|_| READ_ERROR.to_owned())?,
                imported_at: row
                    .try_get("imported_at")
                    .map_err(|_| READ_ERROR.to_owned())?,
                quiz: serde_json::from_str(&quiz_json).map_err(|_| READ_ERROR.to_owned())?,
            })
        })
        .collect()
}

pub async fn save_imported_quiz_to_pool(
    pool: &SqlitePool,
    imported_quiz: &ImportedQuiz,
) -> Result<(), String> {
    if imported_quiz.id.trim().is_empty()
        || imported_quiz.name.trim().is_empty()
        || imported_quiz.imported_at.trim().is_empty()
        || imported_quiz.size < 0
    {
        return Err(INVALID_QUIZ_ERROR.to_owned());
    }

    let quiz_json =
        serde_json::to_string(&imported_quiz.quiz).map_err(|_| WRITE_ERROR.to_owned())?;
    sqlx::query(
        "INSERT INTO imported_quizzes (id, name, size, imported_at, quiz_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            size = excluded.size,
            imported_at = excluded.imported_at,
            quiz_json = excluded.quiz_json",
    )
    .bind(&imported_quiz.id)
    .bind(&imported_quiz.name)
    .bind(imported_quiz.size)
    .bind(&imported_quiz.imported_at)
    .bind(quiz_json)
    .execute(pool)
    .await
    .map_err(|_| WRITE_ERROR.to_owned())?;

    Ok(())
}

pub async fn delete_imported_quiz_from_pool(
    pool: &SqlitePool,
    quiz_id: &str,
) -> Result<(), String> {
    if quiz_id.trim().is_empty() {
        return Err(WRITE_ERROR.to_owned());
    }

    sqlx::query("DELETE FROM imported_quizzes WHERE id = ?")
        .bind(quiz_id)
        .execute(pool)
        .await
        .map_err(|_| WRITE_ERROR.to_owned())?;

    Ok(())
}

pub async fn clear_imported_quizzes_from_pool(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query("DELETE FROM imported_quizzes")
        .execute(pool)
        .await
        .map_err(|_| WRITE_ERROR.to_owned())?;

    Ok(())
}
