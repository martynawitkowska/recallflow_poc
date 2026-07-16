import { invokeIpc } from "./ipc";

export type AppInfo = {
  name: string;
  version: string;
};

export async function getAppInfo(): Promise<AppInfo> {
  const appInfo = await invokeIpc<unknown>("get_app_info");

  if (
    typeof appInfo !== "object" ||
    appInfo === null ||
    !("name" in appInfo) ||
    typeof appInfo.name !== "string" ||
    !appInfo.name.trim() ||
    !("version" in appInfo) ||
    typeof appInfo.version !== "string" ||
    !appInfo.version.trim()
  ) {
    throw new Error(
      "RecallFlow returned incomplete application details. Restart the desktop app and try again.",
    );
  }

  return appInfo as AppInfo;
}
