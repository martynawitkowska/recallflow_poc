import {
  deleteWebPreviewQuiz,
  listWebPreviewAttempts,
  listWebPreviewQuizzes,
  MAX_WEB_PREVIEW_QUIZ_BYTES,
  resetWebPreviewData,
  saveWebPreviewAttempt,
  saveWebPreviewQuiz,
  WEB_PREVIEW_STORAGE_KEY,
  type WebStorage,
} from "./webPreviewStorage.ts";

class MemoryStorage implements WebStorage {
  readonly values = new Map<string, string>();
  failWrites = false;

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.failWrites) {
      throw Object.assign(new Error("private quota detail"), {
        name: "QuotaExceededError",
      });
    }
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function expectError(run: () => void, message: string) {
  try {
    run();
    throw new Error("Expected browser-preview storage operation to fail.");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes(message)) throw error;
  }
}

const storage = new MemoryStorage();
const [sample] = listWebPreviewQuizzes(storage);
expect(sample?.quiz.questions.length === 3, "First load should seed the sample quiz.");

const imported = {
  ...sample,
  id: "imported-quiz",
  name: "imported.json",
  importedAt: "2026-07-17T12:00:00.000Z",
};
saveWebPreviewQuiz(imported, storage);
expect(
  listWebPreviewQuizzes(storage).map((quiz) => quiz.id).join(",") ===
    "imported-quiz,recallflow-preview-sample",
  "Saved quizzes should survive subsequent reads.",
);

saveWebPreviewAttempt(
  {
    id: "attempt-1",
    quizId: imported.id,
    completedAt: "2026-07-17T13:00:00.000Z",
    score: 2,
    total: 3,
    incorrectQuestionIds: ["q2"],
  },
  storage,
);
expect(listWebPreviewAttempts(storage).length === 1, "Attempts should persist.");

deleteWebPreviewQuiz(imported.id, storage);
expect(
  listWebPreviewAttempts(storage).length === 0,
  "Deleting a quiz should cascade to its attempts.",
);

storage.setItem(WEB_PREVIEW_STORAGE_KEY, JSON.stringify({ version: 999 }));
expect(
  listWebPreviewQuizzes(storage)[0]?.id === "recallflow-preview-sample",
  "Invalid or outdated storage should reset safely.",
);

deleteWebPreviewQuiz("recallflow-preview-sample", storage);
expect(listWebPreviewQuizzes(storage).length === 0, "The sample quiz may be removed.");
resetWebPreviewData(storage);
expect(listWebPreviewQuizzes(storage).length === 1, "Reset should restore the sample quiz.");

expectError(
  () =>
    saveWebPreviewQuiz(
      { ...sample, id: "oversized", size: MAX_WEB_PREVIEW_QUIZ_BYTES + 1 },
      storage,
    ),
  "500 KB",
);

const fullStorage = new MemoryStorage();
fullStorage.failWrites = true;
expectError(() => listWebPreviewQuizzes(fullStorage), "storage is full");
