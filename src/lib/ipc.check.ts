import {
  getForwardedCommandError,
  getSensitiveArgumentValues,
} from "./ipc.ts";

if (getForwardedCommandError("  OpenAI rejected the API key.  ") !== "OpenAI rejected the API key.") {
  throw new Error("Expected stable command errors to be trimmed and forwarded.");
}

for (const unsafeError of ["   ", new Error("internal"), { raw: "response" }, null]) {
  if (getForwardedCommandError(unsafeError) !== null) {
    throw new Error("Expected non-string or empty command errors to use the safe fallback.");
  }
}

const recognizableApiKey = "sk-REFL67-NEVER-EXPOSE-1234567890";
const sensitiveValues = getSensitiveArgumentValues({
  provider: "openai",
  request: { apiKey: `  ${recognizableApiKey}  ` },
});

if (
  getForwardedCommandError(
    `Provider rejected credential ${recognizableApiKey}`,
    sensitiveValues,
  ) !== null
) {
  throw new Error("Expected command errors containing an API key to use the safe fallback.");
}

if (
  sensitiveValues.includes("openai") ||
  !sensitiveValues.includes(recognizableApiKey)
) {
  throw new Error("Expected only sensitive nested IPC arguments to be protected.");
}
