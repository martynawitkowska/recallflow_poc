import { useEffect, useRef, useState } from "react";
import { useMnemonicGeneration } from "../hooks/useMnemonicGeneration";
import { useMnemonicSave } from "../hooks/useMnemonicSave";
import { answersMatch } from "../lib/quizAnswers";
import type { LibraryQuiz } from "../lib/quizLibrary";
import {
  calculateQuizResult,
  type QuizAnswerState,
  type QuizResult,
} from "../lib/quizResults";

type QuizSessionProps = {
  focusMode: boolean;
  isRepair: boolean;
  quiz: LibraryQuiz;
  onExit: () => void;
  onFinish: (result: QuizResult) => void;
  onFocusModeChange: (enabled: boolean) => void;
  onReadingFontChange: (font: ReadingFont) => void;
  onSaveMnemonic: (questionId: string, mnemonic: string) => Promise<void>;
  readingFont: ReadingFont;
};

export const readingFontOptions = [
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Monospace" },
] as const;

export type ReadingFont = (typeof readingFontOptions)[number]["value"];

const questionTypeLabels = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  true_false: "True or false",
} as const;

export default function QuizSession({
  focusMode,
  isRepair,
  quiz: file,
  onExit,
  onFinish,
  onFocusModeChange,
  onReadingFontChange,
  onSaveMnemonic,
  readingFont,
}: QuizSessionProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [answerChecked, setAnswerChecked] = useState(false);
  const [checkedAnswers, setCheckedAnswers] = useState<QuizAnswerState>({});
  const [generatedMnemonics, setGeneratedMnemonics] = useState<
    Readonly<Record<string, string>>
  >({});
  const [mnemonicApiKey, setMnemonicApiKey] = useState("");
  const mnemonicGeneration = useMnemonicGeneration();
  const mnemonicSave = useMnemonicSave(onSaveMnemonic);
  const totalQuestions = file.quiz.questions.length;
  const question = file.quiz.questions[currentIndex];
  const isLastQuestion = currentIndex === totalQuestions - 1;
  const isCorrect = answersMatch(selectedAnswers, question.correctAnswers);
  const result = calculateQuizResult(
    file.quiz.questions,
    checkedAnswers,
    generatedMnemonics,
  );
  const completedQuestions = Object.keys(checkedAnswers).length;

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

  const checkAnswer = () => {
    if (selectedAnswers.length === 0 || answerChecked) {
      return;
    }

    setAnswerChecked(true);
    setCheckedAnswers((current) => ({
      ...current,
      [question.id]: [...selectedAnswers],
    }));
  };

  const finishQuiz = () => {
    if (answerChecked && isLastQuestion) {
      onFinish(result);
    }
  };

  const generateMnemonic = async () => {
    mnemonicSave.reset();
    const generated = await mnemonicGeneration.generate({
      question: question.question,
      correctAnswers: question.correctAnswers,
      explanation: question.explanation,
      provider: "openai",
      apiKey: mnemonicApiKey,
    });
    if (generated) {
      setGeneratedMnemonics((current) => ({
        ...current,
        [question.id]: generated,
      }));
      setMnemonicApiKey("");
    }
  };

  const saveMnemonic = async () => {
    if (mnemonicGeneration.state.status === "success") {
      await mnemonicSave.save(
        question.id,
        mnemonicGeneration.state.mnemonic,
      );
    }
  };

  const showNextQuestion = () => {
    if (!answerChecked || isLastQuestion) {
      return;
    }

    setSelectedAnswers([]);
    setAnswerChecked(false);
    setMnemonicApiKey("");
    mnemonicGeneration.reset();
    mnemonicSave.reset();
    setCurrentIndex((current) =>
      Math.min(current + 1, totalQuestions - 1),
    );
  };

  return (
    <section className="quiz-session" aria-labelledby="quiz-session-title">
      <div
        aria-label="Reading preferences"
        className="quiz-preferences"
        role="group"
      >
        <label>
          Reading font
          <select
            onChange={(event) =>
              onReadingFontChange(event.target.value as ReadingFont)
            }
            value={readingFont}
          >
            {readingFontOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          aria-pressed={focusMode}
          className="secondary-button"
          onClick={() => onFocusModeChange(!focusMode)}
          type="button"
        >
          {focusMode ? "Exit focus mode" : "Focus mode"}
        </button>
      </div>
      <header className="quiz-session-header">
        <button
          className="secondary-button"
          disabled={mnemonicSave.state.status === "saving"}
          onClick={onExit}
          type="button"
        >
          ← Back to library
        </button>
        <div className="quiz-progress-summary">
          <p className="eyebrow">
            {isRepair ? "Repair question" : "Question"} {currentIndex + 1} of{" "}
            {totalQuestions}
          </p>
          <p>
            Correct <strong>{result.score}</strong> of {totalQuestions}
          </p>
        </div>
        <progress
          aria-label="Quiz progress"
          className="quiz-progress"
          max={totalQuestions}
          value={completedQuestions}
        >
          {completedQuestions} of {totalQuestions} questions completed
        </progress>
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
            onClick={checkAnswer}
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
              {!isCorrect && (
                <section
                  className="mnemonic-generator"
                  aria-labelledby="mnemonic-generator-title"
                >
                  <h3 id="mnemonic-generator-title">Need a memory hook?</h3>
                  <p>
                    Ask OpenAI for a short mnemonic tied to this question and
                    its correct answer.
                  </p>
                  <label htmlFor="mnemonic-api-key">OpenAI API key</label>
                  <div className="mnemonic-generator-controls">
                    <input
                      autoComplete="off"
                      disabled={
                        mnemonicGeneration.state.status === "loading" ||
                        mnemonicSave.state.status === "saving"
                      }
                      id="mnemonic-api-key"
                      onChange={(event) => setMnemonicApiKey(event.target.value)}
                      placeholder="sk-…"
                      spellCheck={false}
                      type="password"
                      value={mnemonicApiKey}
                    />
                    <button
                      className="secondary-button"
                      disabled={
                        mnemonicGeneration.state.status === "loading" ||
                        mnemonicSave.state.status === "saving" ||
                        !mnemonicApiKey.trim()
                      }
                      onClick={() => void generateMnemonic()}
                      type="button"
                    >
                      {mnemonicGeneration.state.status === "loading"
                        ? "Generating…"
                        : mnemonicGeneration.state.status === "success"
                          ? "Regenerate"
                          : "Create mnemonic"}
                    </button>
                  </div>
                  <p className="field-hint">
                    The question and answer are sent only after you press the
                    button. The API key is not saved.
                  </p>
                  <div className="mnemonic-generation-status" aria-live="polite">
                    {mnemonicGeneration.state.status === "loading" && (
                      <p role="status">Creating a memory hook…</p>
                    )}
                    {mnemonicGeneration.state.status === "error" && (
                      <p role="alert">{mnemonicGeneration.state.message}</p>
                    )}
                    {mnemonicGeneration.state.status === "success" && (
                      <div>
                        <strong>Mnemonic</strong>
                        <p>{mnemonicGeneration.state.mnemonic}</p>
                        <div className="mnemonic-save-status">
                          {(mnemonicSave.state.status === "idle" ||
                            mnemonicSave.state.status === "error") && (
                            <button
                              className="secondary-button"
                              onClick={() => void saveMnemonic()}
                              type="button"
                            >
                              {mnemonicSave.state.status === "error"
                                ? "Retry save"
                                : "Save to quiz"}
                            </button>
                          )}
                          {mnemonicSave.state.status === "saving" && (
                            <p role="status">Saving mnemonic locally…</p>
                          )}
                          {mnemonicSave.state.status === "saved" && (
                            <p role="status">Saved in quiz JSON.</p>
                          )}
                          {mnemonicSave.state.status === "error" && (
                            <p role="alert">{mnemonicSave.state.message}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
              <div className="quiz-question-navigation">
                {isLastQuestion ? (
                  <button
                    className="primary-button"
                    disabled={mnemonicSave.state.status === "saving"}
                    onClick={finishQuiz}
                    type="button"
                  >
                    View results →
                  </button>
                ) : (
                  <button
                    className="primary-button"
                    disabled={mnemonicSave.state.status === "saving"}
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
