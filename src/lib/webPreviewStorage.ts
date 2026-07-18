import { QUIZ_SCHEMA_EXAMPLE } from "./quizGenerationReference.ts";
import type { QuizAttempt } from "./quizAttempts.ts";
import type { LibraryQuiz, SaveMnemonicRequest } from "./quizLibrary.ts";
import { validateQuiz } from "./validateQuiz.ts";

export const WEB_PREVIEW_STORAGE_KEY = "recallflow.pages.data.v1";
export const MAX_WEB_PREVIEW_QUIZ_BYTES = 500 * 1024;
const WEB_PREVIEW_HEALTH_KEY = "recallflow.pages.health-check";

const STORAGE_VERSION = 1;
export const WEB_PREVIEW_SEED_QUIZ_ID = "recallflow-preview-sample";
const STORAGE_UNAVAILABLE_MESSAGE =
  "Browser preview storage is unavailable. Enable local site storage and try again.";
const STORAGE_FULL_MESSAGE =
  "Browser preview storage is full. Remove a quiz or reset the preview and try again.";
const OVERSIZED_QUIZ_MESSAGE =
  "This quiz is larger than the 500 KB browser-preview limit. Choose a smaller quiz file.";

export type WebStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type PreviewData = {
  version: 1;
  quizzes: LibraryQuiz[];
  attempts: QuizAttempt[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const encodedSize = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;

function storageError(error: unknown): Error {
  const name = isRecord(error) && typeof error.name === "string" ? error.name : "";
  return new Error(
    name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED"
      ? STORAGE_FULL_MESSAGE
      : STORAGE_UNAVAILABLE_MESSAGE,
  );
}

function createSeedQuiz(): LibraryQuiz {
  const validation = validateQuiz(QUIZ_SCHEMA_EXAMPLE);
  if (!validation.valid) throw new Error("The preview sample quiz is invalid.");
  return {
    id: WEB_PREVIEW_SEED_QUIZ_ID,
    name: "recallflow-sample.json",
    size: encodedSize(validation.quiz),
    importedAt: "2026-07-17T00:00:00.000Z",
    quiz: validation.quiz,
  };
}

function createSeedData(): PreviewData {
  return { version: STORAGE_VERSION, quizzes: [createSeedQuiz()], attempts: [] };
}

function parseQuiz(value: unknown): LibraryQuiz {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    typeof value.size !== "number" ||
    !Number.isSafeInteger(value.size) ||
    value.size < 0 ||
    typeof value.importedAt !== "string" ||
    Number.isNaN(Date.parse(value.importedAt))
  ) {
    throw new Error("Invalid preview quiz metadata.");
  }
  const validation = validateQuiz(value.quiz);
  if (!validation.valid) throw new Error("Invalid preview quiz data.");
  return {
    id: value.id.trim(),
    name: value.name.trim(),
    size: value.size,
    importedAt: value.importedAt,
    quiz: validation.quiz,
  };
}

function parseAttempt(value: unknown, quizzes: readonly LibraryQuiz[]): QuizAttempt {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.quizId !== "string" ||
    !value.quizId.trim() ||
    typeof value.completedAt !== "string" ||
    Number.isNaN(Date.parse(value.completedAt)) ||
    typeof value.score !== "number" ||
    !Number.isSafeInteger(value.score) ||
    typeof value.total !== "number" ||
    !Number.isSafeInteger(value.total) ||
    value.total <= 0 ||
    value.score < 0 ||
    value.score > value.total ||
    !Array.isArray(value.incorrectQuestionIds) ||
    !value.incorrectQuestionIds.every(
      (id): id is string => typeof id === "string" && Boolean(id.trim()),
    )
  ) {
    throw new Error("Invalid preview attempt.");
  }

  const incorrectQuestionIds = value.incorrectQuestionIds.map((id) => id.trim());
  const quiz = quizzes.find((candidate) => candidate.id === value.quizId);
  const questionIds = new Set(quiz?.quiz.questions.map((question) => question.id));
  if (
    !quiz ||
    value.total > quiz.quiz.questions.length ||
    incorrectQuestionIds.length !== value.total - value.score ||
    new Set(incorrectQuestionIds).size !== incorrectQuestionIds.length ||
    incorrectQuestionIds.some((id) => !questionIds.has(id))
  ) {
    throw new Error("Invalid preview attempt relationship.");
  }

  return {
    id: value.id.trim(),
    quizId: value.quizId.trim(),
    completedAt: value.completedAt,
    score: value.score,
    total: value.total,
    incorrectQuestionIds,
  };
}

function parseData(value: unknown): PreviewData {
  if (
    !isRecord(value) ||
    value.version !== STORAGE_VERSION ||
    !Array.isArray(value.quizzes) ||
    !Array.isArray(value.attempts)
  ) {
    throw new Error("Invalid preview storage version.");
  }
  const quizzes = value.quizzes.map(parseQuiz);
  if (new Set(quizzes.map((quiz) => quiz.id)).size !== quizzes.length) {
    throw new Error("Duplicate preview quiz identifiers.");
  }
  const attempts = value.attempts.map((attempt) => parseAttempt(attempt, quizzes));
  if (new Set(attempts.map((attempt) => attempt.id)).size !== attempts.length) {
    throw new Error("Duplicate preview attempt identifiers.");
  }
  return { version: STORAGE_VERSION, quizzes, attempts };
}

function browserStorage(): WebStorage {
  try {
    return window.localStorage;
  } catch (error) {
    throw storageError(error);
  }
}

function writeData(storage: WebStorage, data: PreviewData): void {
  try {
    storage.setItem(WEB_PREVIEW_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    throw storageError(error);
  }
}

export function checkWebPreviewStorage(
  storage: WebStorage = browserStorage(),
): void {
  const marker = "recallflow-storage-check";
  let previous: string | null = null;
  let previousRead = false;

  try {
    previous = storage.getItem(WEB_PREVIEW_HEALTH_KEY);
    previousRead = true;
    storage.setItem(WEB_PREVIEW_HEALTH_KEY, marker);
    if (storage.getItem(WEB_PREVIEW_HEALTH_KEY) !== marker) {
      throw new Error("Browser storage did not preserve the health check.");
    }
    if (previous === null) {
      storage.removeItem(WEB_PREVIEW_HEALTH_KEY);
    } else {
      storage.setItem(WEB_PREVIEW_HEALTH_KEY, previous);
    }
  } catch (error) {
    if (previousRead) {
      try {
        if (previous === null) storage.removeItem(WEB_PREVIEW_HEALTH_KEY);
        else storage.setItem(WEB_PREVIEW_HEALTH_KEY, previous);
      } catch {
        // The actionable storage error below covers failed cleanup as well.
      }
    }
    throw storageError(error);
  }
}

function readData(storage: WebStorage): PreviewData {
  let saved: string | null;
  try {
    saved = storage.getItem(WEB_PREVIEW_STORAGE_KEY);
  } catch (error) {
    throw storageError(error);
  }
  if (saved !== null) {
    try {
      return parseData(JSON.parse(saved));
    } catch {
      // Tampered or outdated preview data is replaced with the safe seed.
    }
  }
  const seeded = createSeedData();
  writeData(storage, seeded);
  return seeded;
}

export function listWebPreviewQuizzes(
  storage: WebStorage = browserStorage(),
): LibraryQuiz[] {
  return readData(storage).quizzes.sort(
    (left, right) =>
      right.importedAt.localeCompare(left.importedAt) || right.id.localeCompare(left.id),
  );
}

export function saveWebPreviewQuiz(
  quiz: LibraryQuiz,
  storage: WebStorage = browserStorage(),
): void {
  const normalized = parseQuiz(quiz);
  if (
    normalized.size > MAX_WEB_PREVIEW_QUIZ_BYTES ||
    encodedSize(normalized.quiz) > MAX_WEB_PREVIEW_QUIZ_BYTES
  ) {
    throw new Error(OVERSIZED_QUIZ_MESSAGE);
  }
  const data = readData(storage);
  data.quizzes = [normalized, ...data.quizzes.filter((item) => item.id !== normalized.id)];
  writeData(storage, data);
}

export function saveWebPreviewMnemonic(
  request: SaveMnemonicRequest,
  storage: WebStorage = browserStorage(),
): LibraryQuiz {
  const data = readData(storage);
  const quiz = data.quizzes.find((item) => item.id === request.quizId.trim());
  const question = quiz?.quiz.questions.find(
    (item) => item.id === request.questionId.trim(),
  );
  const mnemonic = request.mnemonic.trim();
  if (!quiz) throw new Error("This quiz is no longer in the preview library.");
  if (!question) throw new Error("This question is no longer in the preview quiz.");
  if (!mnemonic) throw new Error("RecallFlow could not save an invalid mnemonic.");
  question.mnemonic = mnemonic;
  quiz.size = encodedSize(quiz.quiz);
  writeData(storage, data);
  return quiz;
}

export function deleteWebPreviewQuiz(
  quizId: string,
  storage: WebStorage = browserStorage(),
): void {
  const data = readData(storage);
  data.quizzes = data.quizzes.filter((quiz) => quiz.id !== quizId);
  data.attempts = data.attempts.filter((attempt) => attempt.quizId !== quizId);
  writeData(storage, data);
}

export function resetWebPreviewData(storage: WebStorage = browserStorage()): void {
  writeData(storage, createSeedData());
}

export function listWebPreviewAttempts(
  storage: WebStorage = browserStorage(),
): QuizAttempt[] {
  return readData(storage).attempts.sort(
    (left, right) =>
      right.completedAt.localeCompare(left.completedAt) || right.id.localeCompare(left.id),
  );
}

export function saveWebPreviewAttempt(
  attempt: QuizAttempt,
  storage: WebStorage = browserStorage(),
): void {
  const data = readData(storage);
  const normalized = parseAttempt(attempt, data.quizzes);
  data.attempts = [
    normalized,
    ...data.attempts.filter((item) => item.id !== normalized.id),
  ];
  writeData(storage, data);
}
