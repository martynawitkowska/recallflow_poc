use crate::{
    generation::sanitize_mnemonic,
    models::{ImportedQuiz, SaveMnemonicRequest},
    state::DatabaseState,
};
use sqlx::{Row, SqlitePool};
use tauri::State;

const READ_ERROR: &str =
    "RecallFlow could not read the local quiz library. Restart the app and try again.";
const WRITE_ERROR: &str =
    "RecallFlow could not update the local quiz library. Restart the app and try again.";
const INVALID_QUIZ_ERROR: &str = "RecallFlow could not save an invalid quiz.";
const INVALID_MNEMONIC_ERROR: &str = "RecallFlow could not save an invalid mnemonic.";
const QUIZ_NOT_FOUND_ERROR: &str = "This quiz is no longer in the local library.";
const QUESTION_NOT_FOUND_ERROR: &str = "This question is no longer in the local quiz.";

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
pub async fn save_quiz_mnemonic(
    state: State<'_, DatabaseState>,
    request: SaveMnemonicRequest,
) -> Result<ImportedQuiz, String> {
    save_quiz_mnemonic_to_pool(state.pool(), request).await
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

pub async fn save_quiz_mnemonic_to_pool(
    pool: &SqlitePool,
    request: SaveMnemonicRequest,
) -> Result<ImportedQuiz, String> {
    let quiz_id = request.quiz_id.trim();
    let question_id = request.question_id.trim();
    let mnemonic =
        sanitize_mnemonic(&request.mnemonic).ok_or_else(|| INVALID_MNEMONIC_ERROR.to_owned())?;
    if quiz_id.is_empty() || question_id.is_empty() {
        return Err(INVALID_MNEMONIC_ERROR.to_owned());
    }

    let mut transaction = pool.begin().await.map_err(|_| WRITE_ERROR.to_owned())?;
    let row = sqlx::query(
        "SELECT id, name, size, imported_at, quiz_json
         FROM imported_quizzes
         WHERE id = ?",
    )
    .bind(quiz_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|_| READ_ERROR.to_owned())?
    .ok_or_else(|| QUIZ_NOT_FOUND_ERROR.to_owned())?;
    let quiz_json: String = row
        .try_get("quiz_json")
        .map_err(|_| READ_ERROR.to_owned())?;
    let mut imported_quiz = ImportedQuiz {
        id: row.try_get("id").map_err(|_| READ_ERROR.to_owned())?,
        name: row.try_get("name").map_err(|_| READ_ERROR.to_owned())?,
        size: row.try_get("size").map_err(|_| READ_ERROR.to_owned())?,
        imported_at: row
            .try_get("imported_at")
            .map_err(|_| READ_ERROR.to_owned())?,
        quiz: serde_json::from_str(&quiz_json).map_err(|_| READ_ERROR.to_owned())?,
    };
    let question = imported_quiz
        .quiz
        .questions
        .iter_mut()
        .find(|question| question.id == question_id)
        .ok_or_else(|| QUESTION_NOT_FOUND_ERROR.to_owned())?;

    if question.mnemonic.as_deref() != Some(&mnemonic) {
        question.mnemonic = Some(mnemonic);
        let quiz_json =
            serde_json::to_string(&imported_quiz.quiz).map_err(|_| WRITE_ERROR.to_owned())?;
        imported_quiz.size = i64::try_from(quiz_json.len()).map_err(|_| WRITE_ERROR.to_owned())?;
        sqlx::query("UPDATE imported_quizzes SET size = ?, quiz_json = ? WHERE id = ?")
            .bind(imported_quiz.size)
            .bind(quiz_json)
            .bind(&imported_quiz.id)
            .execute(&mut *transaction)
            .await
            .map_err(|_| WRITE_ERROR.to_owned())?;
    }

    transaction
        .commit()
        .await
        .map_err(|_| WRITE_ERROR.to_owned())?;
    Ok(imported_quiz)
}

pub async fn delete_imported_quiz_from_pool(
    pool: &SqlitePool,
    quiz_id: &str,
) -> Result<(), String> {
    if quiz_id.trim().is_empty() {
        return Err(WRITE_ERROR.to_owned());
    }

    let mut transaction = pool.begin().await.map_err(|_| WRITE_ERROR.to_owned())?;
    sqlx::query("DELETE FROM quiz_attempts WHERE quiz_id = ?")
        .bind(quiz_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| WRITE_ERROR.to_owned())?;
    sqlx::query("DELETE FROM imported_quizzes WHERE id = ?")
        .bind(quiz_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| WRITE_ERROR.to_owned())?;
    transaction
        .commit()
        .await
        .map_err(|_| WRITE_ERROR.to_owned())?;

    Ok(())
}

pub async fn clear_imported_quizzes_from_pool(pool: &SqlitePool) -> Result<(), String> {
    let mut transaction = pool.begin().await.map_err(|_| WRITE_ERROR.to_owned())?;
    sqlx::query("DELETE FROM quiz_attempts")
        .execute(&mut *transaction)
        .await
        .map_err(|_| WRITE_ERROR.to_owned())?;
    sqlx::query("DELETE FROM imported_quizzes")
        .execute(&mut *transaction)
        .await
        .map_err(|_| WRITE_ERROR.to_owned())?;
    transaction
        .commit()
        .await
        .map_err(|_| WRITE_ERROR.to_owned())?;

    Ok(())
}
