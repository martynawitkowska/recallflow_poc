import { useCallback, useState } from "react";
import type { ValidatedQuizFile } from "./useQuizFileImport";

export type LibraryQuiz = ValidatedQuizFile & {
  id: string;
  importedAt: string;
};

export function useQuizLibrary() {
  const [quizzes, setQuizzes] = useState<LibraryQuiz[]>([]);

  const addQuiz = useCallback((file: ValidatedQuizFile) => {
    setQuizzes((current) => [
      {
        ...file,
        id: crypto.randomUUID(),
        importedAt: new Date().toISOString(),
      },
      ...current,
    ]);
  }, []);

  return { quizzes, addQuiz };
}
