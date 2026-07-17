import { getForwardedCommandError } from "./ipc.ts";

if (getForwardedCommandError("  OpenAI rejected the API key.  ") !== "OpenAI rejected the API key.") {
  throw new Error("Expected stable command errors to be trimmed and forwarded.");
}

for (const unsafeError of ["   ", new Error("internal"), { raw: "response" }, null]) {
  if (getForwardedCommandError(unsafeError) !== null) {
    throw new Error("Expected non-string or empty command errors to use the safe fallback.");
  }
}
