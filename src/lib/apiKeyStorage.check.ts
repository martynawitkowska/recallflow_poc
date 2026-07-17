import {
  apiKeyRecordNames,
  normalizeApiKey,
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
