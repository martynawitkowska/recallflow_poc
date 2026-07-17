import type { QuizAttempt } from "./quizAttempts";

export type PerformanceMetrics = {
  sessions: number;
  correct: number;
  answered: number;
  accuracy: number;
};

export type QuizPerformanceMetrics = PerformanceMetrics & {
  quizId: string;
};

function summarize(attempts: readonly QuizAttempt[]): PerformanceMetrics {
  const correct = attempts.reduce((total, attempt) => total + attempt.score, 0);
  const answered = attempts.reduce((total, attempt) => total + attempt.total, 0);

  return {
    sessions: attempts.length,
    correct,
    answered,
    accuracy: answered ? Math.round((correct / answered) * 100) : 0,
  };
}

export function calculatePerformanceMetrics(
  attempts: readonly QuizAttempt[],
): {
  aggregate: PerformanceMetrics;
  quizzes: QuizPerformanceMetrics[];
} {
  const attemptsByQuiz = new Map<string, QuizAttempt[]>();

  attempts.forEach((attempt) => {
    const quizAttempts = attemptsByQuiz.get(attempt.quizId) ?? [];
    quizAttempts.push(attempt);
    attemptsByQuiz.set(attempt.quizId, quizAttempts);
  });

  return {
    aggregate: summarize(attempts),
    quizzes: Array.from(attemptsByQuiz, ([quizId, quizAttempts]) => ({
      quizId,
      ...summarize(quizAttempts),
    })),
  };
}
