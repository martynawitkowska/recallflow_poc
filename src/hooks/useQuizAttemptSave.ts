import { useCallback, useRef, useState } from "react";
import {
  saveQuizAttempt,
  type QuizAttempt,
} from "../lib/quizAttempts";
import type { QuizResult } from "../lib/quizResults";

export type QuizAttemptSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

export function useQuizAttemptSave() {
  const [state, setState] = useState<QuizAttemptSaveState>({ status: "idle" });
  const pendingAttempt = useRef<QuizAttempt | null>(null);
  const requestId = useRef(0);

  const persist = useCallback(async (attempt: QuizAttempt) => {
    const currentRequest = ++requestId.current;
    setState({ status: "saving" });

    try {
      await saveQuizAttempt(attempt);
      if (currentRequest === requestId.current) {
        setState({ status: "saved" });
      }
    } catch (error) {
      if (currentRequest === requestId.current) {
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "RecallFlow could not save this quiz result locally. Try again.",
        });
      }
    }
  }, []);

  const save = useCallback(
    async (quizId: string, result: QuizResult) => {
      const attempt: QuizAttempt = {
        id: crypto.randomUUID(),
        quizId,
        completedAt: new Date().toISOString(),
        score: result.score,
        total: result.total,
        incorrectQuestionIds: result.details
          .filter((detail) => !detail.correct)
          .map((detail) => detail.questionId),
      };
      pendingAttempt.current = attempt;
      await persist(attempt);
    },
    [persist],
  );

  const retry = useCallback(async () => {
    if (pendingAttempt.current) {
      await persist(pendingAttempt.current);
    }
  }, [persist]);

  return { retry, save, state };
}
