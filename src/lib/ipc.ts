import { invoke, isTauri } from "@tauri-apps/api/core";

const DESKTOP_REQUIRED_MESSAGE =
  "This action requires the RecallFlow desktop app. Start it with `npm run tauri dev` and try again.";
const REQUEST_FAILED_MESSAGE =
  "RecallFlow could not complete the desktop request. Restart the app and try again.";

const SENSITIVE_ARGUMENT_NAME = /(?:api.?key|password|secret|token)/i;

export function getSensitiveArgumentValues(
  value: unknown,
  argumentName = "",
): string[] {
  if (typeof value === "string") {
    return SENSITIVE_ARGUMENT_NAME.test(argumentName) && value.trim()
      ? [value, value.trim()]
      : [];
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([name, nestedValue]) =>
    getSensitiveArgumentValues(nestedValue, name),
  );
}

export function getForwardedCommandError(
  error: unknown,
  sensitiveValues: readonly string[] = [],
): string | null {
  if (typeof error !== "string") {
    return null;
  }

  const commandError = error.trim();
  if (
    !commandError ||
    sensitiveValues.some(
      (value) => value.length > 0 && commandError.includes(value),
    )
  ) {
    return null;
  }

  return commandError;
}

export async function invokeIpc<T>(
  command: string,
  args?: Record<string, unknown>,
  requestFailedMessage = REQUEST_FAILED_MESSAGE,
  forwardCommandError = false,
): Promise<T> {
  if (!command.trim()) {
    throw new Error("RecallFlow could not start an invalid desktop request.");
  }

  if (!isTauri()) {
    throw new Error(DESKTOP_REQUIRED_MESSAGE);
  }

  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const commandError = forwardCommandError
      ? getForwardedCommandError(error, getSensitiveArgumentValues(args))
      : null;
    if (commandError) {
      throw new Error(commandError);
    }
    throw new Error(requestFailedMessage);
  }
}
