import { useEffect, useRef, useState } from "react";
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
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const question = file.quiz.questions[0];

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <section className="quiz-session" aria-labelledby="quiz-session-title">
      <header className="quiz-session-header">
        <button className="secondary-button" onClick={onExit} type="button">
          ← Back to library
        </button>
        <p className="eyebrow">
          Question 1 of {file.quiz.questions.length}
        </p>
        <h1 id="quiz-session-title" ref={titleRef} tabIndex={-1}>
          {file.quiz.title}
        </h1>
      </header>

      <article className="quiz-question" aria-labelledby="quiz-question-title">
        <p className="question-type">{questionTypeLabels[question.type]}</p>
        <h2 id="quiz-question-title">{question.question}</h2>
        {question.type === "single_choice" ? (
          <fieldset className="quiz-answer-list">
            <legend>Choose one answer</legend>
            {question.answers.map((answer) => (
              <label
                className={`quiz-answer-option ${
                  selectedAnswer === answer ? "selected" : ""
                }`}
                key={answer}
              >
                <input
                  checked={selectedAnswer === answer}
                  name={`question-${question.id}`}
                  onChange={() => setSelectedAnswer(answer)}
                  type="radio"
                  value={answer}
                />
                <span>{answer}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <ol className="quiz-answer-list" aria-label="Answer options">
            {question.answers.map((answer) => (
              <li key={answer}>{answer}</li>
            ))}
          </ol>
        )}
      </article>
    </section>
  );
}
