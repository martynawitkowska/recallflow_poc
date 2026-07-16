import { useCallback, useState } from "react";
import {
  readQuizFile,
  type ImportedQuizFile,
} from "../lib/readQuizFile";

export type QuizFileImportState =
  | { status: "empty" }
  | { status: "loading"; fileName: string }
  | { status: "success"; data: ImportedQuizFile }
  | { status: "error"; fileName: string; message: string };

export function useQuizFileImport() {
  const [state, setState] = useState<QuizFileImportState>({ status: "empty" });

  const importFile = useCallback(async (file: File) => {
    setState({ status: "loading", fileName: file.name });

    try {
      setState({ status: "success", data: await readQuizFile(file) });
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
