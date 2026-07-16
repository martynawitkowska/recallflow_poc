import { validateQuiz } from "./validateQuiz.ts";

const validQuiz = {
  title: "Biology",
  questions: [
    {
      id: "cell-1",
      type: "single_choice",
      question: "Which organelle produces ATP?",
      answers: ["Mitochondrion", "Nucleus"],
      correctAnswers: ["Mitochondrion"],
    },
  ],
};

function expectValid(payload: unknown) {
  const result = validateQuiz(payload);
  if (!result.valid) {
    throw new Error(`Expected a valid quiz: ${result.message}`);
  }
}

function expectError(payload: unknown, text: string) {
  const result = validateQuiz(payload);
  if (result.valid || !result.message.includes(text)) {
    throw new Error(`Expected validation error containing "${text}".`);
  }
}

expectValid(validQuiz);
expectError({ ...validQuiz, title: "" }, "title");
expectError(
  { ...validQuiz, questions: [...validQuiz.questions, validQuiz.questions[0]] },
  "unique id",
);
expectError(
  {
    ...validQuiz,
    questions: [{ ...validQuiz.questions[0], correctAnswers: ["Chloroplast"] }],
  },
  "match values from answers",
);
