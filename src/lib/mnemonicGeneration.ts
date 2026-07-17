import { invokeIpc } from "./ipc";
import type { AiProvider } from "./quizGeneration";

export type GenerateMnemonicRequest = {
  question: string;
  correctAnswers: string[];
  explanation?: string;
  provider: AiProvider;
  model?: string;
  apiKey: string;
};

export function generateMnemonic(
  request: GenerateMnemonicRequest,
): Promise<string> {
  return invokeIpc(
    "generate_mnemonic",
    { request },
    "OpenAI could not generate a mnemonic. Check the API key and internet connection, then try again.",
  );
}
