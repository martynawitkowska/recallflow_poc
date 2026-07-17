import {
  createDefaultMnemonicModels,
  getMnemonicModelOption,
  getMnemonicProviderOption,
  isMnemonicModelForProvider,
  isMnemonicProvider,
  mnemonicProviderOptions,
} from "./mnemonicProviders.ts";

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
