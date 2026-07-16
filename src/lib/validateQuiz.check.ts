import { validateQuiz } from "./validateQuiz.ts";
import {
  EXTERNAL_QUIZ_PROMPT,
  QUIZ_SCHEMA_EXAMPLE,
  QUIZ_SCHEMA_REFERENCE,
} from "./quizGenerationReference.ts";

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
expectValid(QUIZ_SCHEMA_EXAMPLE);
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

if (!EXTERNAL_QUIZ_PROMPT.includes(QUIZ_SCHEMA_REFERENCE)) {
  throw new Error("Expected the external generation prompt to include the schema example.");
}

if (
  !EXTERNAL_QUIZ_PROMPT.includes(
    "downloadable JSON file named recallflow-quiz.json",
  )
) {
  throw new Error("Expected the external generation prompt to request a JSON download.");
}
