import { answersMatch, shuffleAnswers } from "./quizAnswers.ts";

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

const answers = ["A", "B", "C"];
const shuffled = shuffleAnswers(answers, () => 0);

if (shuffled.join(",") !== "B,C,A") {
  throw new Error("Answer shuffling returned an unexpected order.");
}

if (answers.join(",") !== "A,B,C") {
  throw new Error("Answer shuffling mutated the source answers.");
}
