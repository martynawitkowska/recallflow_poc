import { invoke, isTauri } from "@tauri-apps/api/core";

const DESKTOP_REQUIRED_MESSAGE =
  "This action requires the RecallFlow desktop app. Start it with `npm run tauri dev` and try again.";
const REQUEST_FAILED_MESSAGE =
  "RecallFlow could not complete the desktop request. Restart the app and try again.";

export async function invokeIpc<T>(
  command: string,
  args?: Record<string, unknown>,
  requestFailedMessage = REQUEST_FAILED_MESSAGE,
): Promise<T> {
  if (!command.trim()) {
    throw new Error("RecallFlow could not start an invalid desktop request.");
  }

  if (!isTauri()) {
    throw new Error(DESKTOP_REQUIRED_MESSAGE);
  }

  try {
    return await invoke<T>(command, args);
  } catch {
    throw new Error(requestFailedMessage);
  }
}
