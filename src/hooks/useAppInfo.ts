import { useCallback, useEffect, useState } from "react";
import { getAppInfo, type AppInfo } from "../lib/appInfo";
import type { AsyncState } from "../lib/asyncState";
import { isPagesPreview } from "../lib/runtime";

const previewAppInfo: AppInfo = { name: "RecallFlow", version: "web preview" };

export function useAppInfo() {
  const [requestId, setRequestId] = useState(0);
  const [state, setState] = useState<AsyncState<AppInfo>>(
    isPagesPreview
      ? { status: "success", data: previewAppInfo }
      : { status: "loading" },
  );

  useEffect(() => {
    if (isPagesPreview) {
      setState({ status: "success", data: previewAppInfo });
      return;
    }

    let active = true;
    setState({ status: "loading" });

    getAppInfo().then(
      (data) => {
        if (active) {
          setState({ status: "success", data });
        }
      },
      (error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "RecallFlow could not read the desktop application details.",
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [requestId]);

  const retry = useCallback(() => setRequestId((current) => current + 1), []);

  return { state, retry };
}
