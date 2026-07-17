import { useCallback, useState, type FormEvent } from "react";
import {
  generateQuiz,
  DEFAULT_QUESTION_COUNT,
  type AiProvider,
} from "../lib/quizGeneration";
import { OFFLINE_AI_MESSAGE } from "../lib/connectivity";
import type { QuizFile } from "../lib/quizSchema";

export type QuizGenerationState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success";
      quiz: QuizFile;
      saveState:
        | { status: "idle" }
        | { status: "saving" }
        | { status: "saved" }
        | { status: "error"; message: string };
    }
  | { status: "error"; message: string };

export type QuizSourceMode = "material" | "url";

export function useQuizGeneration(
  onSaveQuiz: (quiz: QuizFile) => Promise<void>,
  isOnline: boolean,
) {
  const [sourceMode, setSourceMode] = useState<QuizSourceMode>("material");
  const [material, setMaterial] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [questionCount, setQuestionCount] = useState(DEFAULT_QUESTION_COUNT);
  const [state, setState] = useState<QuizGenerationState>({ status: "idle" });

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!isOnline) {
        setState({ status: "error", message: OFFLINE_AI_MESSAGE });
        return;
      }

      setState({ status: "loading" });
      try {
        const quiz = await generateQuiz(
          sourceMode === "material"
            ? { material, provider, questionCount }
            : { sourceUrl, provider, questionCount },
        );
        setState({ status: "success", quiz, saveState: { status: "idle" } });
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
    [isOnline, material, provider, questionCount, sourceMode, sourceUrl],
  );

  const save = useCallback(async () => {
    if (
      state.status !== "success" ||
      state.saveState.status === "saving" ||
      state.saveState.status === "saved"
    ) {
      return;
    }

    const quiz = state.quiz;
    setState({ status: "success", quiz, saveState: { status: "saving" } });
    try {
      await onSaveQuiz(quiz);
      setState({ status: "success", quiz, saveState: { status: "saved" } });
    } catch (error) {
      setState({
        status: "success",
        quiz,
        saveState: {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "RecallFlow could not save this quiz locally. Try again.",
        },
      });
    }
  }, [onSaveQuiz, state]);

  return {
    material,
    provider,
    questionCount,
    sourceMode,
    sourceUrl,
    setMaterial,
    setProvider,
    setQuestionCount,
    setSourceMode,
    setSourceUrl,
    save,
    state,
    submit,
  };
}
