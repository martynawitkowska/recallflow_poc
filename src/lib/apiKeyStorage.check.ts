import {
  getApiKeyStatus,
  parseApiKeyStatus,
} from "./apiKeyStorage.ts";

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem: () =>
        JSON.stringify({
          openai: { configured: true, maskedKey: "••••••••5678" },
        }),
    },
  },
});

const cached = await getApiKeyStatus("openai");
if (!cached.configured || cached.maskedKey !== "••••••••5678") {
  throw new Error("Settings should read API key status without desktop IPC.");
}

const unknown = parseApiKeyStatus(null, "openai");
if (unknown.configured !== null || unknown.maskedKey !== null) {
  throw new Error("Missing API key metadata should remain unknown.");
}

const configured = parseApiKeyStatus(
  JSON.stringify({
    openai: { configured: true, maskedKey: "••••••••1234" },
  }),
  "openai",
);
if (!configured.configured || configured.maskedKey !== "••••••••1234") {
  throw new Error("Valid API key metadata was not restored.");
}

for (const invalid of [
  "not json",
  JSON.stringify({ openai: { configured: "yes", maskedKey: null } }),
  JSON.stringify({ openai: { configured: true, maskedKey: null } }),
  JSON.stringify({ openai: { configured: true, maskedKey: 1234 } }),
]) {
  if (parseApiKeyStatus(invalid, "openai").configured !== null) {
    throw new Error("Invalid API key metadata should remain unknown.");
  }
}
