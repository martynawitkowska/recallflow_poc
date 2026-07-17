import {
  QUESTION_TYPES,
  type QuestionType,
  type QuizFile,
  type QuizQuestion,
} from "./quizSchema.ts";

export type QuizValidationResult =
  | { valid: true; quiz: QuizFile }
  | { valid: false; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const stringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);

function invalid(message: string): QuizValidationResult {
  return { valid: false, message };
}

export function validateQuiz(payload: unknown): QuizValidationResult {
  if (!isRecord(payload)) {
    return invalid("The quiz must be a JSON object with title and questions fields.");
  }

  if (!nonEmptyString(payload.title)) {
    return invalid("Add a non-empty title string to the quiz.");
  }

  if (payload.description !== undefined && typeof payload.description !== "string") {
    return invalid("The optional description must be a string.");
  }

  if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
    return invalid("Add at least one question to the questions array.");
  }

  const ids = new Set<string>();
  const questions: QuizQuestion[] = [];

  for (const [index, value] of payload.questions.entries()) {
    const label = `Question ${index + 1}`;

    if (!isRecord(value)) {
      return invalid(`${label} must be a JSON object.`);
    }

    if (!nonEmptyString(value.id)) {
      return invalid(`${label} needs a non-empty id string.`);
    }

    const id = value.id.trim();
    if (ids.has(id)) {
      return invalid(`${label} repeats id "${id}". Give every question a unique id.`);
    }
    ids.add(id);

    if (
      typeof value.type !== "string" ||
      !QUESTION_TYPES.includes(value.type as QuestionType)
    ) {
      return invalid(
        `${label} type must be single_choice, multiple_choice, or true_false.`,
      );
    }

    if (!nonEmptyString(value.question)) {
      return invalid(`${label} needs a non-empty question string.`);
    }

    if (!stringArray(value.answers) || value.answers.length < 2) {
      return invalid(`${label} needs an answers array with at least two non-empty strings.`);
    }

    const answers = value.answers.map((answer) => answer.trim());
    if (new Set(answers).size !== answers.length) {
      return invalid(`${label} contains duplicate answers. Make each answer unique.`);
    }

    if (!stringArray(value.correctAnswers)) {
      return invalid(`${label} needs at least one value in correctAnswers.`);
    }

    const correctAnswers = value.correctAnswers.map((answer) => answer.trim());
    if (new Set(correctAnswers).size !== correctAnswers.length) {
      return invalid(`${label} contains duplicate correct answers.`);
    }
    if (correctAnswers.some((answer) => !answers.includes(answer))) {
      return invalid(`${label} correctAnswers must exactly match values from answers.`);
    }

    if (value.type !== "multiple_choice" && correctAnswers.length !== 1) {
      return invalid(`${label} must have exactly one correct answer for its type.`);
    }

    if (
      value.type === "true_false" &&
      (answers.length !== 2 || answers[0] !== "True" || answers[1] !== "False")
    ) {
      return invalid(`${label} true_false answers must be exactly "True" and "False".`);
    }

    if (value.explanation !== undefined && typeof value.explanation !== "string") {
      return invalid(`${label} explanation must be a string when provided.`);
    }

    if (value.mnemonic !== undefined && typeof value.mnemonic !== "string") {
      return invalid(`${label} mnemonic must be a string when provided.`);
    }

    questions.push({
      id,
      type: value.type as QuestionType,
      question: value.question.trim(),
      answers,
      correctAnswers,
      explanation:
        typeof value.explanation === "string"
          ? value.explanation.trim() || undefined
          : undefined,
      mnemonic:
        typeof value.mnemonic === "string"
          ? value.mnemonic.trim() || undefined
          : undefined,
    });
  }

  return {
    valid: true,
    quiz: {
      title: payload.title.trim(),
      description:
        typeof payload.description === "string"
          ? payload.description.trim() || undefined
          : undefined,
      questions,
    },
  };
}
