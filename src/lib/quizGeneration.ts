import { invokeIpc } from "./ipc.ts";
import type { QuizFile } from "./quizSchema.ts";
import { validateQuiz } from "./validateQuiz.ts";

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

export function validateQuizGenerationRequest(
  request: GenerateQuizRequest,
): string | null {
  const hasMaterial = request.material !== undefined;
  const hasSourceUrl = request.sourceUrl !== undefined;

  if (hasMaterial === hasSourceUrl) {
    return "Choose either pasted study material or a public URL.";
  }
  if (request.material !== undefined) {
    if (!request.material.trim()) {
      return "Paste study material before generating a quiz.";
    }
    if (request.material.length > MAX_MATERIAL_CHARS) {
      return `Study material must be ${MAX_MATERIAL_CHARS.toLocaleString()} characters or fewer.`;
    }
  }
  if (request.sourceUrl !== undefined) {
    if (!request.sourceUrl.trim()) {
      return "Enter a public lecture or article URL before generating a quiz.";
    }
    try {
      const url = new URL(request.sourceUrl.trim());
      if (
        request.sourceUrl.length > MAX_SOURCE_URL_CHARS ||
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        !url.hostname
      ) {
        return "Enter a complete public http:// or https:// URL.";
      }
    } catch {
      return "Enter a complete public http:// or https:// URL.";
    }
  }
  if (!request.apiKey.trim()) {
    return "Enter an OpenAI API key before generating a quiz.";
  }
  if (
    !Number.isInteger(request.questionCount) ||
    request.questionCount < MIN_QUESTION_COUNT ||
    request.questionCount > MAX_QUESTION_COUNT
  ) {
    return `Choose between ${MIN_QUESTION_COUNT} and ${MAX_QUESTION_COUNT} questions.`;
  }

  return null;
}

export async function generateQuiz(
  request: GenerateQuizRequest,
): Promise<QuizFile> {
  const validationError = validateQuizGenerationRequest(request);
  if (validationError) {
    throw new Error(validationError);
  }

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
