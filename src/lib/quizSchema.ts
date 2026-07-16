export const QUESTION_TYPES = [
  "single_choice",
  "multiple_choice",
  "true_false",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export type QuizQuestion = {
  id: string;
  type: QuestionType;
  question: string;
  answers: string[];
  correctAnswers: string[];
  explanation?: string;
};

export type QuizFile = {
  title: string;
  description?: string;
  questions: QuizQuestion[];
};
