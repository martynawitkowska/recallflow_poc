import { invokeIpc } from "./ipc";
import type { MnemonicModel, MnemonicProvider } from "./mnemonicProviders";

export type GenerateMnemonicRequest = {
  question: string;
  correctAnswers: string[];
  explanation?: string;
  provider: MnemonicProvider;
  model?: MnemonicModel;
};

export function generateMnemonic(
  request: GenerateMnemonicRequest,
): Promise<string> {
  return invokeIpc(
    "generate_mnemonic",
    { request },
    "The selected AI provider could not generate a mnemonic. Check the API key and internet connection, then try again.",
    true,
  );
}
