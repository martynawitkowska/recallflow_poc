import { useCallback, useEffect, useState } from "react";
import { getAppInfo, type AppInfo } from "../lib/appInfo";
import type { AsyncState } from "../lib/asyncState";

export function useAppInfo() {
  const [requestId, setRequestId] = useState(0);
  const [state, setState] = useState<AsyncState<AppInfo>>({ status: "loading" });

  useEffect(() => {
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
