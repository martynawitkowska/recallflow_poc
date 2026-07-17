import { useEffect, useRef } from "react";
import type { QuizAttemptSaveState } from "../hooks/useQuizAttemptSave";
import type { QuizResult } from "../lib/quizResults";

type QuizSummaryProps = {
  isRepair: boolean;
  onBackToLibrary: () => void;
  onRepair: () => void;
  onRestart: () => void;
  onRetrySave: () => Promise<void>;
  quizTitle: string;
  result: QuizResult;
  saveState: QuizAttemptSaveState;
};

function formatAnswers(answers: readonly string[]) {
  return answers.length > 0 ? answers.join(", ") : "No answer recorded";
}

export default function QuizSummary({
  isRepair,
  onBackToLibrary,
  onRepair,
  onRestart,
  onRetrySave,
  quizTitle,
  result,
  saveState,
}: QuizSummaryProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const percentage = result.total
    ? Math.round((result.score / result.total) * 100)
    : 0;
  const incorrectCount = result.total - result.score;

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <section className="quiz-summary" aria-labelledby="quiz-summary-title">
      <p className="eyebrow">
        {isRepair ? "Repair session complete" : "Session complete"}
      </p>
      <h1 id="quiz-summary-title" ref={titleRef} tabIndex={-1}>
        {quizTitle}
      </h1>
      <dl className="quiz-summary-score">
        <div>
          <dt>Correct answers</dt>
          <dd>{result.score} / {result.total}</dd>
        </div>
        <div>
          <dt>Score</dt>
          <dd>{percentage}%</dd>
        </div>
      </dl>
      <p className="quiz-summary-message">
        {incorrectCount === 0
          ? "Perfect recall. Every answer was correct."
          : `${incorrectCount} ${incorrectCount === 1 ? "answer needs" : "answers need"} another pass.`}
      </p>

      <div className="quiz-attempt-save-status">
        {saveState.status === "saving" && (
          <p role="status">Saving this session locally…</p>
        )}
        {saveState.status === "saved" && (
          <p role="status">Session saved locally.</p>
        )}
        {saveState.status === "error" && (
          <div role="alert">
            <p>{saveState.message}</p>
            <button
              className="secondary-button"
              onClick={() => void onRetrySave()}
              type="button"
            >
              Retry save
            </button>
          </div>
        )}
      </div>

      <section
        className="quiz-answer-review"
        aria-labelledby="quiz-answer-review-title"
      >
        <h2 id="quiz-answer-review-title">Answer review</h2>
        {result.details.length > 0 ? (
          <ol className="quiz-answer-review-list" role="list">
            {result.details.map((detail, index) => (
              <li
                className={`quiz-answer-review-item ${
                  detail.correct ? "correct" : "incorrect"
                }`}
                key={detail.questionId}
              >
                <p className="quiz-answer-review-status">
                  {detail.correct ? "Correct" : "Incorrect"}
                </p>
                <h3>
                  {index + 1}. {detail.question}
                </h3>
                <dl className="quiz-answer-review-answers">
                  <div>
                    <dt>Your answer</dt>
                    <dd>{formatAnswers(detail.selectedAnswers)}</dd>
                  </div>
                  <div>
                    <dt>Correct answer</dt>
                    <dd>{formatAnswers(detail.correctAnswers)}</dd>
                  </div>
                </dl>
                {detail.explanation && (
                  <p className="quiz-answer-review-explanation">
                    <strong>Explanation:</strong> {detail.explanation}
                  </p>
                )}
                {detail.mnemonic && (
                  <p className="quiz-answer-review-mnemonic">
                    <strong>Mnemonic:</strong> {detail.mnemonic}
                  </p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="quiz-answer-review-empty">
            No answers are available to review.
          </p>
        )}
      </section>

      <div className="quiz-summary-actions">
        <button className="secondary-button" onClick={onBackToLibrary} type="button">
          Back to library
        </button>
        <button className="primary-button" onClick={onRestart} type="button">
          Study again
        </button>
        {incorrectCount > 0 && (
          <button className="primary-button" onClick={onRepair} type="button">
            Repair missed answers
          </button>
        )}
      </div>
    </section>
  );
}
