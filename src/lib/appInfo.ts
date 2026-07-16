import { invokeIpc } from "./ipc";

export type AppInfo = {
  name: string;
  version: string;
};

export async function getAppInfo(): Promise<AppInfo> {
  const [name, version] = await Promise.all([
    invokeIpc<string>("plugin:app|name"),
    invokeIpc<string>("plugin:app|version"),
  ]);

  if (!name.trim() || !version.trim()) {
    throw new Error(
      "RecallFlow returned incomplete application details. Restart the desktop app and try again.",
    );
  }

  return { name, version };
}
