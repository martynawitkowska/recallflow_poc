import { calculateQuizResult } from "./quizResults.ts";
import type { QuizQuestion } from "./quizSchema.ts";

const questions: QuizQuestion[] = [
  {
    id: "single",
    type: "single_choice",
    question: "Choose A.",
    answers: ["A", "B"],
    correctAnswers: ["A"],
    explanation: "A is the requested answer.",
    mnemonic: "A is the answer to ask for.",
  },
  {
    id: "multiple",
    type: "multiple_choice",
    question: "Choose A and B.",
    answers: ["A", "B", "C"],
    correctAnswers: ["A", "B"],
    mnemonic: "Saved B mnemonic.",
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
const mnemonics = {
  multiple: "A and B belong together.",
};
const result = calculateQuizResult(
  questions,
  {
    single: ["A"],
    multiple: selectedAnswers,
  },
  mnemonics,
);

if (result.score !== 2 || result.total !== 3) {
  throw new Error("Expected results to score every quiz question consistently.");
}

if (result.details[2].correct || result.details[2].selectedAnswers.length !== 0) {
  throw new Error("Expected unanswered questions to remain incorrect and empty.");
}

if (
  result.details[0].question !== "Choose A." ||
  result.details[0].explanation !== "A is the requested answer."
) {
  throw new Error("Expected result details to preserve question context for review.");
}

if (result.details[0].mnemonic !== "A is the answer to ask for.") {
  throw new Error("Expected saved mnemonics in the result detail.");
}

if (result.details[1].mnemonic !== "A and B belong together.") {
  throw new Error("Expected a newly generated mnemonic to replace the saved copy.");
}

if (result.details[2].mnemonic !== undefined) {
  throw new Error("Expected questions without mnemonics to stay empty.");
}

selectedAnswers.push("C");
mnemonics.multiple = "Changed";
if (result.details[1].selectedAnswers.length !== 2) {
  throw new Error("Expected result details to preserve an answer snapshot.");
}

if (result.details[1].mnemonic !== "A and B belong together.") {
  throw new Error("Expected result details to preserve a mnemonic snapshot.");
}
