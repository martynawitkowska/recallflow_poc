import { useEffect, useRef } from "react";
import type { QuizAttemptsState } from "../hooks/useQuizAttempts";
import type { LibraryQuiz } from "../lib/quizLibrary";
import Icon from "./Icon";

type QuizHistoryProps = {
  onRetry: () => Promise<void>;
  quizzes: readonly LibraryQuiz[];
  state: QuizAttemptsState;
};

export default function QuizHistory({
  onRetry,
  quizzes,
  state,
}: QuizHistoryProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const attempts = state.status === "success" ? state.attempts : [];
  const answered = attempts.reduce((total, attempt) => total + attempt.total, 0);
  const correct = attempts.reduce((total, attempt) => total + attempt.score, 0);
  const retention = answered ? Math.round((correct / answered) * 100) : 0;
  const quizzesPracticed = new Set(
    attempts.map((attempt) => attempt.quizId),
  ).size;

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="quiz-history-title">
      <p className="eyebrow">Your progress</p>
      <h1 id="quiz-history-title" ref={titleRef} tabIndex={-1}>
        Quiz history
      </h1>
      <p className="lede">Review sessions saved locally on this device.</p>

      {state.status === "loading" && (
        <section className="library-empty" aria-busy="true">
          <span className="library-empty-icon">
            <Icon name="check" size={32} />
          </span>
          <h2>Loading quiz history</h2>
          <p role="status">Reading saved sessions from this device…</p>
        </section>
      )}

      {state.status === "error" && (
        <section className="library-empty">
          <span className="library-empty-icon">
            <Icon name="check" size={32} />
          </span>
          <h2>Quiz history could not be loaded</h2>
          <p role="alert">{state.message}</p>
          <button
            className="primary-button"
            onClick={() => void onRetry()}
            type="button"
          >
            Try again
          </button>
        </section>
      )}

      {state.status === "success" && state.attempts.length === 0 && (
        <section className="library-empty">
          <span className="library-empty-icon">
            <Icon name="check" size={32} />
          </span>
          <h2>No completed sessions yet</h2>
          <p>Finish a quiz and its result will appear here.</p>
        </section>
      )}

      {state.status === "success" && state.attempts.length > 0 && (
        <section aria-label="Saved quiz attempts">
          <div
            className="quiz-summary-score"
            aria-label="Performance statistics"
            role="group"
          >
            <p>
              <span>Study sessions</span>
              <strong>{attempts.length}</strong>
            </p>
            <p>
              <span>Quizzes practiced</span>
              <strong>{quizzesPracticed}</strong>
            </p>
            <p>
              <span>Correct answers</span>
              <strong>{correct} / {answered}</strong>
            </p>
            <p>
              <span>Overall retention</span>
              <strong>{retention}%</strong>
            </p>
          </div>
          <p className="quiz-summary-message">
            Overall retention is the percentage of correct answers across all
            saved sessions.
          </p>
          <p className="quiz-history-count">
            {state.attempts.length} saved{" "}
            {state.attempts.length === 1 ? "session" : "sessions"}
          </p>
          <ol className="quiz-history-list" role="list">
            {state.attempts.map((attempt) => {
              const completedAt = new Date(attempt.completedAt);
              const validDate = !Number.isNaN(completedAt.getTime());
              const quizTitle =
                quizzes.find((quiz) => quiz.id === attempt.quizId)?.quiz.title ??
                "Saved quiz";

              return (
                <li key={attempt.id}>
                  <article className="quiz-history-card">
                    <div>
                      <h2>{quizTitle}</h2>
                      <p>
                        Completed{" "}
                        <time
                          dateTime={validDate ? attempt.completedAt : undefined}
                        >
                          {validDate
                            ? completedAt.toLocaleString()
                            : "at an unknown time"}
                        </time>
                      </p>
                    </div>
                    <p className="quiz-history-score">
                      <strong>{attempt.score} / {attempt.total}</strong>
                      <span>correct</span>
                    </p>
                  </article>
                </li>
              );
            })}
          </ol>
          <p className="session-note">
            Quiz history is stored locally on this device.
          </p>
        </section>
      )}
    </section>
  );
}
