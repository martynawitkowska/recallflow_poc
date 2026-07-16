import { answersMatch } from "./quizAnswers.ts";

function expectMatch(
  selectedAnswers: string[],
  correctAnswers: string[],
  expected: boolean,
) {
  if (answersMatch(selectedAnswers, correctAnswers) !== expected) {
    throw new Error("Answer comparison returned an unexpected result.");
  }
}

expectMatch(["A"], ["A"], true);
expectMatch(["B", "A"], ["A", "B"], true);
expectMatch(["A"], ["A", "B"], false);
expectMatch(["A", "C"], ["A", "B"], false);
expectMatch(["A", "A"], ["A", "A"], false);
expectMatch(["A", "B"], ["A", "A"], false);
