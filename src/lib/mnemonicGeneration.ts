import { invokeIpc } from "./ipc";

export const mnemonicProviderOptions = [
  {
    value: "openai",
    label: "OpenAI",
    model: "gpt-5.4-mini",
    modelLabel: "GPT-5.4 mini",
    keyLabel: "OpenAI API key",
    keyPlaceholder: "sk-…",
  },
  {
    value: "gemini",
    label: "Google Gemini",
    model: "gemini-3.5-flash",
    modelLabel: "Gemini 3.5 Flash",
    keyLabel: "Gemini API key",
    keyPlaceholder: "AIza…",
  },
  {
    value: "claude",
    label: "Anthropic Claude",
    model: "claude-sonnet-4-6",
    modelLabel: "Claude Sonnet 4.6",
    keyLabel: "Claude API key",
    keyPlaceholder: "sk-ant-…",
  },
] as const;

export type MnemonicProvider =
  (typeof mnemonicProviderOptions)[number]["value"];

export function getMnemonicProviderOption(provider: MnemonicProvider) {
  return (
    mnemonicProviderOptions.find((option) => option.value === provider) ??
    mnemonicProviderOptions[0]
  );
}

export type GenerateMnemonicRequest = {
  question: string;
  correctAnswers: string[];
  explanation?: string;
  provider: MnemonicProvider;
  model?: string;
  apiKey: string;
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
