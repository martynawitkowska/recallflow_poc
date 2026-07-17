import { invokeIpc } from "./ipc";
import { isPagesPreview } from "./runtime";
import type { QuizFile } from "./quizSchema";
import { validateQuiz } from "./validateQuiz";
import {
  checkWebPreviewStorage,
  deleteWebPreviewQuiz,
  listWebPreviewQuizzes,
  resetWebPreviewData,
  saveWebPreviewMnemonic,
  saveWebPreviewQuiz,
} from "./webPreviewStorage";

export type LibraryQuiz = {
  id: string;
  name: string;
  size: number;
  importedAt: string;
  quiz: QuizFile;
};

export type SaveMnemonicRequest = {
  quizId: string;
  questionId: string;
  mnemonic: string;
};

const CORRUPT_LIBRARY_MESSAGE =
  "RecallFlow could not read the local quiz library. Restart the app and try again.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseLibraryQuiz(value: unknown): LibraryQuiz {
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
    !value.importedAt.trim() ||
    Number.isNaN(Date.parse(value.importedAt))
  ) {
    throw new Error(CORRUPT_LIBRARY_MESSAGE);
  }

  const validation = validateQuiz(value.quiz);
  if (!validation.valid) {
    throw new Error(CORRUPT_LIBRARY_MESSAGE);
  }

  return {
    id: value.id,
    name: value.name,
    size: value.size,
    importedAt: value.importedAt,
    quiz: validation.quiz,
  };
}

export async function listImportedQuizzes(): Promise<LibraryQuiz[]> {
  if (isPagesPreview) {
    checkWebPreviewStorage();
    return listWebPreviewQuizzes();
  }
  const payload = await invokeIpc<unknown>("list_imported_quizzes");
  if (!Array.isArray(payload)) {
    throw new Error(CORRUPT_LIBRARY_MESSAGE);
  }

  return payload.map(parseLibraryQuiz);
}

export function saveImportedQuiz(quiz: LibraryQuiz): Promise<void> {
  if (isPagesPreview) {
    saveWebPreviewQuiz(quiz);
    return Promise.resolve();
  }
  return invokeIpc(
    "save_imported_quiz",
    { quiz },
    "RecallFlow could not save the quiz locally. Restart the desktop app and try again.",
  );
}

export async function saveQuizMnemonic(
  request: SaveMnemonicRequest,
): Promise<LibraryQuiz> {
  if (isPagesPreview) return saveWebPreviewMnemonic(request);
  const payload = await invokeIpc<unknown>(
    "save_quiz_mnemonic",
    { request },
    "RecallFlow could not save this mnemonic locally. Try again.",
  );
  return parseLibraryQuiz(payload);
}

export function deleteImportedQuiz(quizId: string): Promise<void> {
  if (isPagesPreview) {
    deleteWebPreviewQuiz(quizId);
    return Promise.resolve();
  }
  return invokeIpc("delete_imported_quiz", { quizId });
}

export function clearImportedQuizzes(): Promise<void> {
  if (isPagesPreview) {
    resetWebPreviewData();
    return Promise.resolve();
  }
  return invokeIpc("clear_imported_quizzes");
}
