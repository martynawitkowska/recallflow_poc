export const mnemonicProviderOptions = [
  {
    value: "openai",
    label: "OpenAI",
    keyLabel: "OpenAI API key",
    keyPlaceholder: "sk-…",
    models: [
      {
        value: "gpt-5.5",
        label: "GPT-5.5",
        description: "Best OpenAI quality for vivid memory hooks.",
      },
      {
        value: "gpt-5.4",
        label: "GPT-5.4",
        description: "Lower cost while keeping strong OpenAI quality.",
      },
      {
        value: "gpt-5.4-mini",
        label: "GPT-5.4 mini",
        description: "Fastest and cheapest OpenAI option.",
      },
    ],
  },
] as const;

export type MnemonicProvider =
  (typeof mnemonicProviderOptions)[number]["value"];
export type MnemonicModel =
  (typeof mnemonicProviderOptions)[number]["models"][number]["value"];

export const defaultMnemonicModels: Record<MnemonicProvider, MnemonicModel> = {
  openai: "gpt-5.5",
};

export function createDefaultMnemonicModels() {
  return { ...defaultMnemonicModels };
}

export function isMnemonicProvider(value: string): value is MnemonicProvider {
  return mnemonicProviderOptions.some((option) => option.value === value);
}

export function getMnemonicProviderOption(provider: MnemonicProvider) {
  return (
    mnemonicProviderOptions.find((option) => option.value === provider) ??
    mnemonicProviderOptions[0]
  );
}

export function isMnemonicModelForProvider(
  provider: MnemonicProvider,
  model: string,
): model is MnemonicModel {
  return getMnemonicProviderOption(provider).models.some(
    (option) => option.value === model,
  );
}

export function getMnemonicModelOption(
  provider: MnemonicProvider,
  model: MnemonicModel,
) {
  const providerOption = getMnemonicProviderOption(provider);
  return (
    providerOption.models.find((option) => option.value === model) ??
    providerOption.models[0]
  );
}
