export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "true_false";

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
