import { useEffect, useRef } from "react";
import type { QuizAttemptsState } from "../hooks/useQuizAttempts";
import type { LibraryQuiz } from "../lib/quizLibrary";
import {
  calculatePerformanceMetrics,
  calculateRetentionScore,
  getRetentionLevel,
} from "../lib/quizPerformance";

type QuizStatisticsModalProps = {
  onClose: () => void;
  onRetry: () => Promise<void>;
  quiz: LibraryQuiz;
  state: QuizAttemptsState;
};

export default function QuizStatisticsModal({
  onClose,
  onRetry,
  quiz,
  state,
}: QuizStatisticsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const attempts =
    state.status === "success"
      ? state.attempts.filter((attempt) => attempt.quizId === quiz.id)
      : [];
  const metrics = calculatePerformanceMetrics(attempts).aggregate;

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  return (
    <dialog
      aria-labelledby="quiz-statistics-title"
      className="quiz-statistics-dialog"
      onClose={onClose}
      ref={dialogRef}
    >
      <div className="quiz-statistics-content">
        <header className="quiz-statistics-header">
          <div>
            <h2 id="quiz-statistics-title">
              {quiz.quiz.title} statistics
            </h2>
          </div>
          <button
            className="secondary-button"
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            Close
          </button>
        </header>

        {state.status === "loading" && (
          <div className="quiz-statistics-state" aria-busy="true">
            <p role="status">Loading saved statistics…</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="quiz-statistics-state">
            <p role="alert">{state.message}</p>
            <button
              className="primary-button"
              onClick={() => void onRetry()}
              type="button"
            >
              Try again
            </button>
          </div>
        )}

        {state.status === "success" && (
          <>
            <dl
              aria-label={`Performance statistics for ${quiz.quiz.title}`}
              className="quiz-summary-score quiz-statistics-summary"
            >
              <div>
                <dt>Study sessions</dt>
                <dd>{metrics.sessions}</dd>
              </div>
              <div>
                <dt>Correct answers</dt>
                <dd>{metrics.correct}</dd>
              </div>
              <div>
                <dt>Incorrect answers</dt>
                <dd>{metrics.answered - metrics.correct}</dd>
              </div>
              <div>
                <dt>Weighted accuracy</dt>
                <dd>
                  <strong>{metrics.accuracy}%</strong>
                  <progress
                    aria-label={`${quiz.quiz.title} weighted accuracy`}
                    className="retention-progress"
                    max="100"
                    value={metrics.accuracy}
                  />
                  <small>
                    {metrics.sessions > 0
                      ? getRetentionLevel(metrics.accuracy)
                      : "No data yet"}
                  </small>
                </dd>
              </div>
            </dl>
            <p className="quiz-statistics-note">
              Accuracy is weighted across every saved answer for this quiz.
            </p>

            <h3 className="quiz-statistics-history-title">Session history</h3>
            {attempts.length === 0 ? (
              <p className="quiz-statistics-note">
                Complete this quiz to create its first saved session.
              </p>
            ) : (
              <ol className="quiz-history-list" role="list">
                {attempts.map((attempt) => {
                  const completedAt = new Date(attempt.completedAt);
                  const validDate = !Number.isNaN(completedAt.getTime());

                  return (
                    <li key={attempt.id}>
                      <article className="quiz-history-card">
                        <div>
                          <h3>
                            <time
                              dateTime={
                                validDate ? attempt.completedAt : undefined
                              }
                            >
                              {validDate
                                ? completedAt.toLocaleString()
                                : "Unknown completion time"}
                            </time>
                          </h3>
                        </div>
                        <p className="quiz-history-score">
                          <strong>
                            {attempt.score} / {attempt.total}
                          </strong>
                          <span>
                            {calculateRetentionScore(
                              attempt.score,
                              attempt.total,
                            )}% correct
                          </span>
                        </p>
                      </article>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
