import { invoke, isTauri } from "@tauri-apps/api/core";

const DESKTOP_REQUIRED_MESSAGE =
  "This action requires the RecallFlow desktop app. Start it with `npm run tauri dev` and try again.";
const REQUEST_FAILED_MESSAGE =
  "RecallFlow could not complete the desktop request. Restart the app and try again.";

export function getForwardedCommandError(error: unknown): string | null {
  if (typeof error !== "string") {
    return null;
  }

  return error.trim() || null;
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
      ? getForwardedCommandError(error)
      : null;
    if (commandError) {
      throw new Error(commandError);
    }
    throw new Error(requestFailedMessage);
  }
}
