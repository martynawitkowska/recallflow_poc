import { useCallback, useState } from "react";
import {
  readQuizFile,
} from "../lib/readQuizFile";
import type { QuizFile } from "../lib/quizSchema";
import { validateQuiz } from "../lib/validateQuiz";

export type ValidatedQuizFile = {
  name: string;
  size: number;
  quiz: QuizFile;
};

export type QuizFileImportState =
  | { status: "empty" }
  | { status: "loading"; fileName: string }
  | { status: "success"; data: ValidatedQuizFile }
  | { status: "error"; fileName: string; message: string };

export function useQuizFileImport(
  onImported?: (file: ValidatedQuizFile) => void,
) {
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

      const validatedFile = {
        name: importedFile.name,
        size: importedFile.size,
        quiz: validation.quiz,
      };
      setState({ status: "success", data: validatedFile });
      onImported?.(validatedFile);
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
  }, [onImported]);

  return { state, importFile };
}
