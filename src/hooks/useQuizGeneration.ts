import { useCallback, useState, type FormEvent } from "react";
import {
  generateQuiz,
  DEFAULT_QUESTION_COUNT,
  MAX_MATERIAL_CHARS,
  MAX_QUESTION_COUNT,
  MAX_SOURCE_URL_CHARS,
  MIN_QUESTION_COUNT,
  type AiProvider,
} from "../lib/quizGeneration";
import type { QuizFile } from "../lib/quizSchema";

export type QuizGenerationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; quiz: QuizFile }
  | { status: "error"; message: string };

export type QuizSourceMode = "material" | "url";

function isReadableUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function useQuizGeneration() {
  const [sourceMode, setSourceMode] = useState<QuizSourceMode>("material");
  const [material, setMaterial] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [questionCount, setQuestionCount] = useState(DEFAULT_QUESTION_COUNT);
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<QuizGenerationState>({ status: "idle" });

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (sourceMode === "material" && !material.trim()) {
        setState({
          status: "error",
          message: "Paste study material before generating a quiz.",
        });
        return;
      }
      if (sourceMode === "material" && material.length > MAX_MATERIAL_CHARS) {
        setState({
          status: "error",
          message: `Study material must be ${MAX_MATERIAL_CHARS.toLocaleString()} characters or fewer.`,
        });
        return;
      }
      if (sourceMode === "url" && !sourceUrl.trim()) {
        setState({
          status: "error",
          message: "Enter a public lecture or article URL before generating a quiz.",
        });
        return;
      }
      if (
        sourceMode === "url" &&
        (sourceUrl.length > MAX_SOURCE_URL_CHARS || !isReadableUrl(sourceUrl.trim()))
      ) {
        setState({
          status: "error",
          message: "Enter a complete public http:// or https:// URL.",
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
      if (
        !Number.isInteger(questionCount) ||
        questionCount < MIN_QUESTION_COUNT ||
        questionCount > MAX_QUESTION_COUNT
      ) {
        setState({
          status: "error",
          message: `Choose between ${MIN_QUESTION_COUNT} and ${MAX_QUESTION_COUNT} questions.`,
        });
        return;
      }

      setState({ status: "loading" });
      try {
        const quiz = await generateQuiz(
          sourceMode === "material"
            ? { material, apiKey, provider, questionCount }
            : { sourceUrl, apiKey, provider, questionCount },
        );
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
    [apiKey, material, provider, questionCount, sourceMode, sourceUrl],
  );

  return {
    apiKey,
    material,
    provider,
    questionCount,
    sourceMode,
    sourceUrl,
    setApiKey,
    setMaterial,
    setProvider,
    setQuestionCount,
    setSourceMode,
    setSourceUrl,
    state,
    submit,
  };
}
