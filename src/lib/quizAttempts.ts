import { invokeIpc } from "./ipc";

export type QuizAttempt = {
  id: string;
  quizId: string;
  completedAt: string;
  score: number;
  total: number;
  incorrectQuestionIds: string[];
};

export function listQuizAttempts(): Promise<QuizAttempt[]> {
  return invokeIpc(
    "list_quiz_attempts",
    undefined,
    "RecallFlow could not read saved quiz attempts. Restart the desktop app and try again.",
  );
}

export function saveQuizAttempt(attempt: QuizAttempt): Promise<void> {
  return invokeIpc(
    "save_quiz_attempt",
    { attempt },
    "RecallFlow could not save this quiz result locally. Try again.",
  );
}
