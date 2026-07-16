import { invokeIpc } from "./ipc";
import type { QuizFile } from "./quizSchema";
import { validateQuiz } from "./validateQuiz";

export const MAX_MATERIAL_CHARS = 14_000;

export type GenerateQuizRequest = {
  material: string;
  apiKey: string;
};

export async function generateQuiz(
  request: GenerateQuizRequest,
): Promise<QuizFile> {
  const payload = await invokeIpc<unknown>(
    "generate_quiz",
    { request },
    "OpenAI could not generate a quiz. Check the API key and internet connection, then try again.",
  );
  const validation = validateQuiz(payload);

  if (!validation.valid) {
    throw new Error(
      "OpenAI returned an invalid quiz. Try again with clearer study material.",
    );
  }

  return validation.quiz;
}
