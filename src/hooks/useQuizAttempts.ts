import { useCallback, useEffect, useRef, useState } from "react";
import { listQuizAttempts, type QuizAttempt } from "../lib/quizAttempts";

export type QuizAttemptsState =
  | { status: "loading" }
  | { status: "success"; attempts: QuizAttempt[] }
  | { status: "error"; message: string };

export function useQuizAttempts(enabled: boolean) {
  const [state, setState] = useState<QuizAttemptsState>({ status: "loading" });
  const requestId = useRef(0);

  const loadAttempts = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setState({ status: "loading" });

    try {
      const attempts = await listQuizAttempts();
      if (currentRequest === requestId.current) {
        setState({ status: "success", attempts });
      }
    } catch (error) {
      if (currentRequest === requestId.current) {
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "RecallFlow could not read saved quiz attempts. Restart the app and try again.",
        });
      }
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      void loadAttempts();
    }
  }, [enabled, loadAttempts]);

  return { retry: loadAttempts, state };
}
