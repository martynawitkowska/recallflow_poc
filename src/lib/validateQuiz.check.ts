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
const linkedQuiz = validateQuiz({ ...validQuiz, videoUrl: " https://youtu.be/source " });
if (!linkedQuiz.valid || linkedQuiz.quiz.videoUrl !== "https://youtu.be/source") {
  throw new Error("Expected video source links to be normalized and preserved.");
}
expectError({ ...validQuiz, videoUrl: "javascript:alert(1)" }, "http:// or https://");
expectError({ ...validQuiz, videoUrl: 42 }, "videoUrl must be a string");
const mnemonicQuiz = validateQuiz({
  ...validQuiz,
  questions: [{ ...validQuiz.questions[0], mnemonic: "  Cells make ATP.  " }],
});
if (
  !mnemonicQuiz.valid ||
  mnemonicQuiz.quiz.questions[0].mnemonic !== "Cells make ATP."
) {
  throw new Error("Expected saved mnemonics to be normalized and preserved.");
}
expectError({ ...validQuiz, title: "" }, "title");
expectError(
  {
    ...validQuiz,
    questions: [{ ...validQuiz.questions[0], mnemonic: 42 }],
  },
  "mnemonic must be a string",
);
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

const invalidQuestions: Array<[unknown, string]> = [
  [null, "JSON object"],
  [{ ...validQuiz, description: 42 }, "description must be a string"],
  [{ ...validQuiz, questions: [] }, "at least one question"],
  [{ ...validQuiz, questions: [null] }, "must be a JSON object"],
  [
    { ...validQuiz, questions: [{ ...validQuiz.questions[0], id: " " }] },
    "non-empty id",
  ],
  [
    {
      ...validQuiz,
      questions: [{ ...validQuiz.questions[0], type: "essay" }],
    },
    "type must be",
  ],
  [
    {
      ...validQuiz,
      questions: [{ ...validQuiz.questions[0], question: " " }],
    },
    "question string",
  ],
  [
    {
      ...validQuiz,
      questions: [{ ...validQuiz.questions[0], answers: ["A"] }],
    },
    "at least two",
  ],
  [
    {
      ...validQuiz,
      questions: [
        { ...validQuiz.questions[0], answers: ["A", " A "] },
      ],
    },
    "duplicate answers",
  ],
  [
    {
      ...validQuiz,
      questions: [{
        ...validQuiz.questions[0],
        correctAnswers: ["Mitochondrion", "Mitochondrion"],
      }],
    },
    "duplicate correct answers",
  ],
  [
    {
      ...validQuiz,
      questions: [{
        ...validQuiz.questions[0],
        answers: ["True", "False"],
        correctAnswers: ["True", "False"],
      }],
    },
    "exactly one correct answer",
  ],
  [
    {
      ...validQuiz,
      questions: [{
        ...validQuiz.questions[0],
        type: "true_false",
        answers: ["False", "True"],
        correctAnswers: ["True"],
      }],
    },
    'exactly "True" and "False"',
  ],
  [
    { ...validQuiz, questions: [{ ...validQuiz.questions[0], explanation: 42 }] },
    "explanation must be a string",
  ],
];

for (const [payload, expectedMessage] of invalidQuestions) {
  expectError(payload, expectedMessage);
}

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
