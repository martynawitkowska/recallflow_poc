import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearImportedQuizzes,
  deleteImportedQuiz,
  listImportedQuizzes,
  saveImportedQuiz,
  type LibraryQuiz,
} from "../lib/quizLibrary";
import type { ValidatedQuizFile } from "./useQuizFileImport";

export type QuizLibraryState =
  | { status: "loading" }
  | { status: "success"; quizzes: LibraryQuiz[] }
  | { status: "error"; message: string };

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "RecallFlow could not load the local quiz library. Restart the app and try again.";

export function useQuizLibrary() {
  const [state, setState] = useState<QuizLibraryState>({ status: "loading" });
  const requestId = useRef(0);

  const loadQuizzes = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setState({ status: "loading" });

    try {
      const quizzes = await listImportedQuizzes();
      if (currentRequest === requestId.current) {
        setState({ status: "success", quizzes });
      }
    } catch (error) {
      if (currentRequest === requestId.current) {
        setState({ status: "error", message: errorMessage(error) });
      }
    }
  }, []);

  useEffect(() => {
    void loadQuizzes();
  }, [loadQuizzes]);

  const addQuiz = useCallback(async (file: ValidatedQuizFile) => {
    const quiz: LibraryQuiz = {
      ...file,
      id: crypto.randomUUID(),
      importedAt: new Date().toISOString(),
    };

    await saveImportedQuiz(quiz);
    await loadQuizzes();
  }, [loadQuizzes]);

  const removeQuiz = useCallback(async (quizId: string) => {
    ++requestId.current;
    await deleteImportedQuiz(quizId);
    setState((current) => ({
      status: "success",
      quizzes:
        current.status === "success"
          ? current.quizzes.filter((quiz) => quiz.id !== quizId)
          : [],
    }));
  }, []);

  const clearQuizzes = useCallback(async () => {
    ++requestId.current;
    await clearImportedQuizzes();
    setState({ status: "success", quizzes: [] });
  }, []);

  return {
    state,
    addQuiz,
    removeQuiz,
    clearQuizzes,
    retry: loadQuizzes,
  };
}
