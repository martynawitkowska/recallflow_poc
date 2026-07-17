import { calculateQuizResult } from "./quizResults.ts";
import type { QuizQuestion } from "./quizSchema.ts";

const questions: QuizQuestion[] = [
  {
    id: "single",
    type: "single_choice",
    question: "Choose A.",
    answers: ["A", "B"],
    correctAnswers: ["A"],
  },
  {
    id: "multiple",
    type: "multiple_choice",
    question: "Choose A and B.",
    answers: ["A", "B", "C"],
    correctAnswers: ["A", "B"],
  },
  {
    id: "missing",
    type: "true_false",
    question: "This answer is missing.",
    answers: ["True", "False"],
    correctAnswers: ["True"],
  },
];

const selectedAnswers = ["B", "A"];
const result = calculateQuizResult(questions, {
  single: ["A"],
  multiple: selectedAnswers,
});

if (result.score !== 2 || result.total !== 3) {
  throw new Error("Expected results to score every quiz question consistently.");
}

if (result.details[2].correct || result.details[2].selectedAnswers.length !== 0) {
  throw new Error("Expected unanswered questions to remain incorrect and empty.");
}

selectedAnswers.push("C");
if (result.details[1].selectedAnswers.length !== 2) {
  throw new Error("Expected result details to preserve an answer snapshot.");
}
