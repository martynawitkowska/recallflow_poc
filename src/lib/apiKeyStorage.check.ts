import {
  apiKeyRecordNames,
  normalizeApiKey,
  restoreStoredApiKeys,
} from "./apiKeyStorage.ts";

const recordNames = Object.values(apiKeyRecordNames);
if (recordNames.length !== 3 || new Set(recordNames).size !== 3) {
  throw new Error("Each AI provider must use a separate Stronghold record.");
}

if (normalizeApiKey("  provider-api-key-1234  ") !== "provider-api-key-1234") {
  throw new Error("API keys were not normalized before persistence.");
}

for (const invalid of ["short", "provider api key with spaces"]) {
  try {
    normalizeApiKey(invalid);
    throw new Error("An invalid API key was accepted for persistence.");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("without spaces")) {
      throw error;
    }
  }
}

const encoder = new TextEncoder();
const savedProviders: string[] = [];
const restoreReport = await restoreStoredApiKeys(
  async (provider) => {
    if (provider === "claude") {
      return null;
    }
    return encoder.encode(`${provider}-provider-api-key-1234`);
  },
  async (provider) => {
    if (provider === "gemini") {
      throw new Error("simulated session failure containing a secret");
    }
    savedProviders.push(provider);
  },
);

if (
  savedProviders.join() !== "openai" ||
  restoreReport.restoredProviders.join() !== "openai" ||
  restoreReport.failedProviders.join() !== "gemini"
) {
  throw new Error("Startup restoration did not isolate provider failures.");
}

if (JSON.stringify(restoreReport).includes("secret")) {
  throw new Error("Startup restoration exposed a credential or internal failure.");
}
