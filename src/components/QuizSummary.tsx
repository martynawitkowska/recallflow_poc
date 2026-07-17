import { useEffect, useRef } from "react";
import type { QuizAttemptSaveState } from "../hooks/useQuizAttemptSave";
import type { QuizResult } from "../lib/quizResults";

type QuizSummaryProps = {
  onBackToLibrary: () => void;
  onRestart: () => void;
  onRetrySave: () => Promise<void>;
  quizTitle: string;
  result: QuizResult;
  saveState: QuizAttemptSaveState;
};

export default function QuizSummary({
  onBackToLibrary,
  onRestart,
  onRetrySave,
  quizTitle,
  result,
  saveState,
}: QuizSummaryProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const percentage = Math.round((result.score / result.total) * 100);
  const incorrectCount = result.total - result.score;

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <section className="quiz-summary" aria-labelledby="quiz-summary-title">
      <p className="eyebrow">Session complete</p>
      <h1 id="quiz-summary-title" ref={titleRef} tabIndex={-1}>
        {quizTitle}
      </h1>
      <div className="quiz-summary-score">
        <p>
          <span>Correct answers</span>
          <strong>{result.score} / {result.total}</strong>
        </p>
        <p>
          <span>Score</span>
          <strong>{percentage}%</strong>
        </p>
      </div>
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

      <div className="quiz-summary-actions">
        <button className="secondary-button" onClick={onBackToLibrary} type="button">
          Back to library
        </button>
        <button className="primary-button" onClick={onRestart} type="button">
          Study again
        </button>
      </div>
    </section>
  );
}
