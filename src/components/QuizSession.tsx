import { useEffect, useRef, useState } from "react";
import { answersMatch } from "../lib/quizAnswers";
import type { LibraryQuiz } from "../lib/quizLibrary";

type QuizSessionProps = {
  quiz: LibraryQuiz;
  onExit: () => void;
};

const questionTypeLabels = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  true_false: "True or false",
} as const;

export default function QuizSession({ quiz: file, onExit }: QuizSessionProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [answerChecked, setAnswerChecked] = useState(false);
  const question = file.quiz.questions[currentIndex];
  const isLastQuestion = currentIndex === file.quiz.questions.length - 1;
  const isCorrect = answersMatch(selectedAnswers, question.correctAnswers);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (currentIndex > 0) {
      questionRef.current?.focus();
    }
  }, [currentIndex]);

  const selectAnswer = (answer: string) => {
    if (answerChecked) {
      return;
    }

    if (question.type === "multiple_choice") {
      setSelectedAnswers((current) =>
        current.includes(answer)
          ? current.filter((selected) => selected !== answer)
          : [...current, answer],
      );
      return;
    }

    setSelectedAnswers([answer]);
  };

  const showNextQuestion = () => {
    if (!answerChecked || isLastQuestion) {
      return;
    }

    setSelectedAnswers([]);
    setAnswerChecked(false);
    setCurrentIndex((current) =>
      Math.min(current + 1, file.quiz.questions.length - 1),
    );
  };

  return (
    <section className="quiz-session" aria-labelledby="quiz-session-title">
      <header className="quiz-session-header">
        <button className="secondary-button" onClick={onExit} type="button">
          ← Back to library
        </button>
        <p className="eyebrow">
          Question {currentIndex + 1} of {file.quiz.questions.length}
        </p>
        <h1 id="quiz-session-title" ref={titleRef} tabIndex={-1}>
          {file.quiz.title}
        </h1>
      </header>

      <article className="quiz-question" aria-labelledby="quiz-question-title">
        <p className="question-type">{questionTypeLabels[question.type]}</p>
        <h2 id="quiz-question-title" ref={questionRef} tabIndex={-1}>
          {question.question}
        </h2>
        <fieldset className="quiz-answer-list" disabled={answerChecked}>
          <legend>
            {question.type === "multiple_choice"
              ? "Choose every answer that applies"
              : "Choose one answer"}
          </legend>
          {question.answers.map((answer) => {
            const selected = selectedAnswers.includes(answer);
            const correct = question.correctAnswers.includes(answer);
            const state = answerChecked
              ? correct
                ? "correct"
                : selected
                  ? "incorrect"
                  : ""
              : selected
                ? "selected"
                : "";

            return (
              <label className={`quiz-answer-option ${state}`} key={answer}>
                <input
                  checked={selected}
                  name={`question-${question.id}`}
                  onChange={() => selectAnswer(answer)}
                  type={question.type === "multiple_choice" ? "checkbox" : "radio"}
                  value={answer}
                />
                <span>{answer}</span>
                {answerChecked && (correct || selected) && (
                  <span className="answer-option-result">
                    {correct ? "Correct answer" : "Your answer"}
                  </span>
                )}
              </label>
            );
          })}
        </fieldset>
        <div className="quiz-answer-actions">
          <button
            className="primary-button quiz-check-button"
            disabled={selectedAnswers.length === 0 || answerChecked}
            onClick={() => setAnswerChecked(true)}
            type="button"
          >
            {answerChecked ? "Answer checked" : "Check answer"}
          </button>
          {answerChecked && (
            <>
              <p
                className={`answer-feedback ${isCorrect ? "correct" : "incorrect"}`}
                role="status"
              >
                <strong>{isCorrect ? "Correct." : "Not quite."}</strong>{" "}
                {isCorrect
                  ? "Your selection is correct."
                  : question.type === "multiple_choice"
                    ? "The correct answers are highlighted."
                    : "The correct answer is highlighted."}
              </p>
              <section
                className="answer-explanation"
                aria-labelledby="answer-explanation-title"
              >
                <h3 id="answer-explanation-title">Why this is the answer</h3>
                <p>
                  {question.explanation ||
                    "No explanation was provided for this question."}
                </p>
              </section>
              <div className="quiz-question-navigation">
                {isLastQuestion ? (
                  <p>Final question complete.</p>
                ) : (
                  <button
                    className="primary-button"
                    onClick={showNextQuestion}
                    type="button"
                  >
                    Next question →
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </article>
    </section>
  );
}
