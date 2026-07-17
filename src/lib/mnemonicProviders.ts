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
  {
    value: "gemini",
    label: "Google Gemini",
    keyLabel: "Gemini API key",
    keyPlaceholder: "AIza…",
    models: [
      {
        value: "gemini-3.5-flash",
        label: "Gemini 3.5 Flash",
        description: "Fast Gemini model for short creative mnemonics.",
      },
      {
        value: "gemini-3.1-flash-lite",
        label: "Gemini 3.1 Flash-Lite",
        description: "Lowest-latency Gemini option.",
      },
      {
        value: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        description: "Higher-quality Gemini reasoning for harder questions.",
      },
      {
        value: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        description: "Balanced Gemini speed and quality.",
      },
    ],
  },
  {
    value: "claude",
    label: "Anthropic Claude",
    keyLabel: "Claude API key",
    keyPlaceholder: "sk-ant-…",
    models: [
      {
        value: "claude-sonnet-4-6",
        label: "Claude Sonnet 4.6",
        description: "Best Claude balance of quality, speed, and cost.",
      },
      {
        value: "claude-haiku-4-5",
        label: "Claude Haiku 4.5",
        description: "Fastest Claude option for quick memory hooks.",
      },
      {
        value: "claude-opus-4-8",
        label: "Claude Opus 4.8",
        description: "Highest Claude quality for difficult questions.",
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
  gemini: "gemini-3.5-flash",
  claude: "claude-sonnet-4-6",
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
