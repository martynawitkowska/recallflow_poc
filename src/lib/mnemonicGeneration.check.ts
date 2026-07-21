import {
  createDefaultMnemonicModels,
  getMnemonicModelOption,
  getMnemonicProviderOption,
  isMnemonicModelForProvider,
  isMnemonicProvider,
  mnemonicProviderOptions,
} from "./mnemonicProviders.ts";
import { generateWebPreviewMnemonic } from "./mnemonicGeneration.ts";

const defaults = createDefaultMnemonicModels();

for (const provider of mnemonicProviderOptions) {
  if (!isMnemonicProvider(provider.value)) {
    throw new Error(`Provider ${provider.value} was not recognized.`);
  }
  if (!isMnemonicModelForProvider(provider.value, defaults[provider.value])) {
    throw new Error(`Default model for ${provider.value} is invalid.`);
  }
  if (
    getMnemonicProviderOption(provider.value).value !== provider.value ||
    getMnemonicModelOption(provider.value, defaults[provider.value]).value !==
      defaults[provider.value]
  ) {
    throw new Error(`Provider lookup failed for ${provider.value}.`);
  }
}

if (isMnemonicProvider("unknown")) {
  throw new Error("Unknown provider was accepted.");
}
if (isMnemonicModelForProvider("openai", "gemini-3.5-flash")) {
  throw new Error("A model from another provider was accepted.");
}

const request = {
  question: "What produces cellular ATP?",
  correctAnswers: ["Mitochondria"],
  explanation: "Mitochondria generate most cellular ATP.",
  provider: "openai" as const,
  model: "gpt-5.4-mini" as const,
};
let sentBody: Record<string, unknown> | undefined;
const mnemonic = await generateWebPreviewMnemonic(
  request,
  async (_input, init) => {
    sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ mnemonic: "  Mighty\nmitochondria make ATP.  " });
  },
  "https://worker.example/generate",
);
if (
  mnemonic !== "Mighty mitochondria make ATP." ||
  sentBody?.operation !== "mnemonic" ||
  "provider" in (sentBody ?? {}) ||
  "model" in (sentBody ?? {})
) {
  throw new Error("Expected the preview to return a normalized mnemonic without client provider settings.");
}

await generateWebPreviewMnemonic(
  request,
  async () => Response.json({ mnemonic: "" }),
  "https://worker.example/generate",
).then(
  () => { throw new Error("Expected an invalid preview mnemonic to be rejected."); },
  (error: unknown) => {
    if (!(error instanceof Error) || !error.message.includes("invalid mnemonic")) throw error;
  },
);
