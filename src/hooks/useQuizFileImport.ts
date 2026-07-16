import { useCallback, useState } from "react";
import {
  readQuizFile,
} from "../lib/readQuizFile";
import type { QuizFile } from "../lib/quizSchema";
import { validateQuiz } from "../lib/validateQuiz";

type ValidatedQuizFile = {
  name: string;
  size: number;
  quiz: QuizFile;
};

export type QuizFileImportState =
  | { status: "empty" }
  | { status: "loading"; fileName: string }
  | { status: "success"; data: ValidatedQuizFile }
  | { status: "error"; fileName: string; message: string };

export function useQuizFileImport() {
  const [state, setState] = useState<QuizFileImportState>({ status: "empty" });

  const importFile = useCallback(async (file: File) => {
    setState({ status: "loading", fileName: file.name });

    try {
      const importedFile = await readQuizFile(file);
      const validation = validateQuiz(importedFile.contents);

      if (!validation.valid) {
        setState({
          status: "error",
          fileName: file.name,
          message: validation.message,
        });
        return;
      }

      setState({
        status: "success",
        data: {
          name: importedFile.name,
          size: importedFile.size,
          quiz: validation.quiz,
        },
      });
    } catch (error) {
      setState({
        status: "error",
        fileName: file.name,
        message:
          error instanceof Error
            ? error.message
            : "RecallFlow could not import this file. Try another JSON file.",
      });
    }
  }, []);

  return { state, importFile };
}
