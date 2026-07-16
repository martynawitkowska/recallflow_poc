import { invokeIpc } from "./ipc";
import type { QuizFile } from "./quizSchema";
import { validateQuiz } from "./validateQuiz";

export const MAX_MATERIAL_CHARS = 14_000;
export const MAX_SOURCE_URL_CHARS = 2_048;
export const MIN_QUESTION_COUNT = 3;
export const MAX_QUESTION_COUNT = 25;
export const DEFAULT_QUESTION_COUNT = 8;

export type AiProvider = "openai";

export type GenerateQuizRequest = {
  material?: string;
  sourceUrl?: string;
  provider: AiProvider;
  model?: string;
  questionCount: number;
  apiKey: string;
};

export async function generateQuiz(
  request: GenerateQuizRequest,
): Promise<QuizFile> {
  const payload = await invokeIpc<unknown>(
    "generate_quiz",
    { request },
    request.sourceUrl
      ? "OpenAI could not read that URL or generate a quiz. Check that the page is public and readable, then try again."
      : "OpenAI could not generate a quiz. Check the API key and internet connection, then try again.",
  );
  const validation = validateQuiz(payload);

  if (!validation.valid) {
    throw new Error(
      "OpenAI returned an invalid quiz. Try again with a clearer source.",
    );
  }

  return validation.quiz;
}
