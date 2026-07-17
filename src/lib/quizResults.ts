import { answersMatch } from "./quizAnswers.ts";
import type { QuizQuestion } from "./quizSchema.ts";

export type QuizAnswerState = Readonly<
  Record<string, readonly string[]>
>;

export type QuizResultDetail = {
  questionId: string;
  question: string;
  selectedAnswers: string[];
  correctAnswers: string[];
  correct: boolean;
  explanation?: string;
  mnemonic?: string;
};

export type QuizResult = {
  score: number;
  total: number;
  details: QuizResultDetail[];
};

export function calculateQuizResult(
  questions: readonly QuizQuestion[],
  answers: QuizAnswerState,
  mnemonics: Readonly<Record<string, string>> = {},
): QuizResult {
  const details = questions.map((question) => {
    const selectedAnswers = [...(answers[question.id] ?? [])];
    const correctAnswers = [...question.correctAnswers];

    return {
      questionId: question.id,
      question: question.question,
      selectedAnswers,
      correctAnswers,
      correct: answersMatch(selectedAnswers, correctAnswers),
      explanation: question.explanation,
      mnemonic: mnemonics[question.id],
    };
  });

  return {
    score: details.filter((detail) => detail.correct).length,
    total: details.length,
    details,
  };
}
