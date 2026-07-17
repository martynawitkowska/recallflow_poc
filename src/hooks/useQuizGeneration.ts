import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  cancelQuizGeneration,
  generateQuiz,
  generationOutcomeMessage,
  DEFAULT_QUESTION_COUNT,
  mergeGenerationProgress,
  type AiProvider,
  type GenerationProgress,
  type GenerationQuality,
  type GenerationResult,
} from "../lib/quizGeneration";
import { OFFLINE_AI_MESSAGE } from "../lib/connectivity";
import type { QuizFile } from "../lib/quizSchema";

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

export type SuccessfulGenerationState = {
  status: "success";
  quiz: QuizFile;
  completion: GenerationResult["completion"];
  quality: GenerationQuality;
  saveState: SaveState;
};

export type QuizGenerationState =
  | { status: "idle" }
  | {
      status: "loading";
      runId: string;
      progress: GenerationProgress;
      previous?: SuccessfulGenerationState;
      cancelling: boolean;
    }
  | SuccessfulGenerationState
  | { status: "quality-empty"; message: string }
  | { status: "cancelled"; message: string }
  | { status: "error"; message: string };

export type QuizSourceMode = "material" | "url";

export function useQuizGeneration(
  onSaveQuiz: (quiz: QuizFile) => Promise<void>,
  isOnline: boolean,
  model: string,
) {
  const [sourceMode, setSourceMode] = useState<QuizSourceMode>("material");
  const [material, setMaterial] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [questionCount, setQuestionCount] = useState(DEFAULT_QUESTION_COUNT);
  const [state, setState] = useState<QuizGenerationState>({ status: "idle" });
  const activeController = useRef<AbortController | null>(null);

  useEffect(
    () => () => activeController.current?.abort(),
    [],
  );

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!isOnline) {
        setState({ status: "error", message: OFFLINE_AI_MESSAGE });
        return;
      }

      if (state.status === "loading") return;
      const runId = createRunId();
      const controller = new AbortController();
      activeController.current = controller;
      const previous = state.status === "success" ? state : undefined;
      setState({
        status: "loading",
        runId,
        previous,
        cancelling: false,
        progress: {
          runId,
          stage: "preparing_transcript",
          completed: 0,
        },
      });
      try {
        const result = await generateQuiz(
          sourceMode === "material"
            ? { material, provider, model, questionCount }
            : { sourceUrl, provider, model, questionCount },
          runId,
          (incoming) =>
            setState((current) => {
              if (current.status !== "loading" || current.runId !== runId) {
                return current;
              }
              return {
                ...current,
                progress:
                  mergeGenerationProgress(current.progress, incoming, runId) ??
                  current.progress,
              };
            }),
          controller.signal,
        );
        if (result.completion === "cancelled") {
          setState(previous ?? { status: "cancelled", message: generationOutcomeMessage(result)! });
        } else if (result.completion === "quality_empty" || !result.quiz) {
          setState({
            status: "quality-empty",
            message: generationOutcomeMessage(result)!,
          });
        } else {
          setState({
            status: "success",
            quiz: result.quiz,
            completion: result.completion,
            quality: result.quality,
            saveState: { status: "idle" },
          });
        }
      } catch (error) {
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "OpenAI could not generate a quiz. Try again.",
        });
      } finally {
        if (activeController.current === controller) {
          activeController.current = null;
        }
      }
    },
    [isOnline, material, model, provider, questionCount, sourceMode, sourceUrl, state],
  );

  const cancel = useCallback(async () => {
    if (state.status !== "loading" || state.cancelling) return;
    const runId = state.runId;
    setState({ ...state, cancelling: true });
    try {
      await cancelQuizGeneration(runId);
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "RecallFlow could not cancel generation. Try again.",
      });
    }
  }, [state]);

  const save = useCallback(async () => {
    if (
      state.status !== "success" ||
      state.saveState.status === "saving" ||
      state.saveState.status === "saved"
    ) {
      return;
    }

    const quiz = state.quiz;
    const { completion, quality } = state;
    setState({ status: "success", quiz, completion, quality, saveState: { status: "saving" } });
    try {
      await onSaveQuiz(quiz);
      setState({ status: "success", quiz, completion, quality, saveState: { status: "saved" } });
    } catch (error) {
      setState({
        status: "success",
        quiz,
        completion,
        quality,
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
    cancel,
    state,
    submit,
  };
}

function createRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}-${Math.random()}`;
}
