use crate::{
    models::{QuizAttempt, QuizFile},
    state::DatabaseState,
};
use sqlx::{Row, SqlitePool};
use std::collections::HashSet;
use tauri::State;

const READ_ERROR: &str =
    "RecallFlow could not read saved quiz attempts. Restart the app and try again.";
const WRITE_ERROR: &str = "RecallFlow could not save this quiz result locally. Try again.";
const INVALID_ATTEMPT_ERROR: &str = "RecallFlow could not save an invalid quiz result.";

#[tauri::command]
pub async fn list_quiz_attempts(
    state: State<'_, DatabaseState>,
) -> Result<Vec<QuizAttempt>, String> {
    list_quiz_attempts_from_pool(state.pool()).await
}

#[tauri::command]
pub async fn save_quiz_attempt(
    state: State<'_, DatabaseState>,
    attempt: QuizAttempt,
) -> Result<(), String> {
    save_quiz_attempt_to_pool(state.pool(), &attempt).await
}

pub async fn list_quiz_attempts_from_pool(pool: &SqlitePool) -> Result<Vec<QuizAttempt>, String> {
    let rows = sqlx::query(
        "SELECT id, quiz_id, completed_at, score, total, incorrect_question_ids_json
         FROM quiz_attempts
         ORDER BY completed_at DESC, id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|_| READ_ERROR.to_owned())?;

    rows.into_iter()
        .map(|row| {
            let incorrect_json: String = row
                .try_get("incorrect_question_ids_json")
                .map_err(|_| READ_ERROR.to_owned())?;
            Ok(QuizAttempt {
                id: row.try_get("id").map_err(|_| READ_ERROR.to_owned())?,
                quiz_id: row.try_get("quiz_id").map_err(|_| READ_ERROR.to_owned())?,
                completed_at: row
                    .try_get("completed_at")
                    .map_err(|_| READ_ERROR.to_owned())?,
                score: row.try_get("score").map_err(|_| READ_ERROR.to_owned())?,
                total: row.try_get("total").map_err(|_| READ_ERROR.to_owned())?,
                incorrect_question_ids: serde_json::from_str(&incorrect_json)
                    .map_err(|_| READ_ERROR.to_owned())?,
            })
        })
        .collect()
}

pub async fn save_quiz_attempt_to_pool(
    pool: &SqlitePool,
    attempt: &QuizAttempt,
) -> Result<(), String> {
    if attempt.id.trim().is_empty()
        || attempt.quiz_id.trim().is_empty()
        || attempt.completed_at.trim().is_empty()
        || attempt.total <= 0
        || attempt.score < 0
        || attempt.score > attempt.total
    {
        return Err(INVALID_ATTEMPT_ERROR.to_owned());
    }

    let incorrect_ids: HashSet<&str> = attempt
        .incorrect_question_ids
        .iter()
        .map(|id| id.trim())
        .collect();
    if incorrect_ids.len() != attempt.incorrect_question_ids.len()
        || incorrect_ids.contains("")
        || attempt.incorrect_question_ids.len() != (attempt.total - attempt.score) as usize
    {
        return Err(INVALID_ATTEMPT_ERROR.to_owned());
    }

    let quiz_json: Option<String> =
        sqlx::query_scalar("SELECT quiz_json FROM imported_quizzes WHERE id = ?")
            .bind(&attempt.quiz_id)
            .fetch_optional(pool)
            .await
            .map_err(|_| WRITE_ERROR.to_owned())?;
    let quiz: QuizFile = serde_json::from_str(
        quiz_json
            .as_deref()
            .ok_or_else(|| INVALID_ATTEMPT_ERROR.to_owned())?,
    )
    .map_err(|_| INVALID_ATTEMPT_ERROR.to_owned())?;
    let question_ids: HashSet<&str> = quiz
        .questions
        .iter()
        .map(|question| question.id.as_str())
        .collect();
    if attempt.total as usize != quiz.questions.len() || !incorrect_ids.is_subset(&question_ids) {
        return Err(INVALID_ATTEMPT_ERROR.to_owned());
    }

    let incorrect_json = serde_json::to_string(&attempt.incorrect_question_ids)
        .map_err(|_| WRITE_ERROR.to_owned())?;
    sqlx::query(
        "INSERT INTO quiz_attempts
            (id, quiz_id, completed_at, score, total, incorrect_question_ids_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            quiz_id = excluded.quiz_id,
            completed_at = excluded.completed_at,
            score = excluded.score,
            total = excluded.total,
            incorrect_question_ids_json = excluded.incorrect_question_ids_json",
    )
    .bind(&attempt.id)
    .bind(&attempt.quiz_id)
    .bind(&attempt.completed_at)
    .bind(attempt.score)
    .bind(attempt.total)
    .bind(incorrect_json)
    .execute(pool)
    .await
    .map_err(|_| WRITE_ERROR.to_owned())?;

    Ok(())
}
