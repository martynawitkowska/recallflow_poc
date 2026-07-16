import { useCallback, useState, type FormEvent } from "react";
import {
  generateQuiz,
  MAX_MATERIAL_CHARS,
} from "../lib/quizGeneration";
import type { QuizFile } from "../lib/quizSchema";

export type QuizGenerationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; quiz: QuizFile }
  | { status: "error"; message: string };

export function useQuizGeneration() {
  const [material, setMaterial] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<QuizGenerationState>({ status: "idle" });

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!material.trim()) {
        setState({
          status: "error",
          message: "Paste study material before generating a quiz.",
        });
        return;
      }
      if (material.length > MAX_MATERIAL_CHARS) {
        setState({
          status: "error",
          message: `Study material must be ${MAX_MATERIAL_CHARS.toLocaleString()} characters or fewer.`,
        });
        return;
      }
      if (!apiKey.trim()) {
        setState({
          status: "error",
          message: "Enter an OpenAI API key before generating a quiz.",
        });
        return;
      }

      setState({ status: "loading" });
      try {
        const quiz = await generateQuiz({ material, apiKey });
        setApiKey("");
        setState({ status: "success", quiz });
      } catch (error) {
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "OpenAI could not generate a quiz. Try again.",
        });
      }
    },
    [apiKey, material],
  );

  return {
    apiKey,
    material,
    setApiKey,
    setMaterial,
    state,
    submit,
  };
}
