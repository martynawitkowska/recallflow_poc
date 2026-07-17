import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearImportedQuizzes,
  deleteImportedQuiz,
  listImportedQuizzes,
  saveImportedQuiz,
  type LibraryQuiz,
} from "../lib/quizLibrary";
import type { QuizFile } from "../lib/quizSchema";
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

  const addGeneratedQuiz = useCallback(async (quiz: QuizFile) => {
    const json = JSON.stringify(quiz);
    await addQuiz({
      name: "generated-quiz.json",
      size: new TextEncoder().encode(json).length,
      quiz,
    });
  }, [addQuiz]);

  const saveMnemonic = useCallback(
    async (quizId: string, questionId: string, mnemonic: string) => {
      const normalizedMnemonic = mnemonic.trim();
      if (!normalizedMnemonic) {
        throw new Error("Generate a mnemonic before saving it.");
      }
      if (state.status !== "success") {
        throw new Error("The local quiz library is not available. Try again.");
      }

      const savedQuiz = state.quizzes.find((quiz) => quiz.id === quizId);
      if (!savedQuiz) {
        throw new Error("This quiz is no longer in the local library.");
      }
      const savedQuestion = savedQuiz.quiz.questions.find(
        (question) => question.id === questionId,
      );
      if (!savedQuestion) {
        throw new Error("This question is no longer in the local quiz.");
      }
      if (savedQuestion.mnemonic === normalizedMnemonic) {
        return;
      }

      const updatedQuizFile: QuizFile = {
        ...savedQuiz.quiz,
        questions: savedQuiz.quiz.questions.map((question) =>
          question.id === questionId
            ? { ...question, mnemonic: normalizedMnemonic }
            : question,
        ),
      };
      const updatedQuiz: LibraryQuiz = {
        ...savedQuiz,
        size: new TextEncoder().encode(JSON.stringify(updatedQuizFile)).length,
        quiz: updatedQuizFile,
      };

      await saveImportedQuiz(updatedQuiz);
      setState((current) =>
        current.status === "success"
          ? {
              status: "success",
              quizzes: current.quizzes.map((quiz) =>
                quiz.id === quizId ? updatedQuiz : quiz,
              ),
            }
          : current,
      );
    },
    [state],
  );

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
    addGeneratedQuiz,
    saveMnemonic,
    removeQuiz,
    clearQuizzes,
    retry: loadQuizzes,
  };
}
