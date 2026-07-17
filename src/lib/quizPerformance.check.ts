import type { QuizAttempt } from "./quizAttempts.ts";
import { calculatePerformanceMetrics } from "./quizPerformance.ts";

const attempts: QuizAttempt[] = [
  {
    id: "attempt-1",
    quizId: "quiz-1",
    completedAt: "2026-07-17T12:00:00.000Z",
    score: 1,
    total: 2,
    incorrectQuestionIds: ["q2"],
  },
  {
    id: "attempt-2",
    quizId: "quiz-1",
    completedAt: "2026-07-17T11:00:00.000Z",
    score: 1,
    total: 1,
    incorrectQuestionIds: [],
  },
  {
    id: "attempt-3",
    quizId: "quiz-2",
    completedAt: "2026-07-17T10:00:00.000Z",
    score: 8,
    total: 10,
    incorrectQuestionIds: ["q1", "q2"],
  },
];

const metrics = calculatePerformanceMetrics(attempts);

if (
  metrics.aggregate.sessions !== 3 ||
  metrics.aggregate.correct !== 10 ||
  metrics.aggregate.answered !== 13 ||
  metrics.aggregate.accuracy !== 77
) {
  throw new Error("Expected weighted aggregate performance metrics.");
}

if (
  metrics.quizzes[0].quizId !== "quiz-1" ||
  metrics.quizzes[0].sessions !== 2 ||
  metrics.quizzes[0].accuracy !== 67 ||
  metrics.quizzes[1].quizId !== "quiz-2" ||
  metrics.quizzes[1].accuracy !== 80
) {
  throw new Error("Expected attempts to be summarized per quiz.");
}

const empty = calculatePerformanceMetrics([]);
if (empty.aggregate.accuracy !== 0 || empty.quizzes.length !== 0) {
  throw new Error("Expected empty history to produce safe zero metrics.");
}
