import type { QuizFile } from "./quizSchema";

export const QUIZ_SCHEMA_EXAMPLE = {
  title: "Biology review",
  description: "A short active-recall quiz about cell biology.",
  videoUrl: "https://www.youtube.com/watch?v=example",
  questions: [
    {
      id: "q1",
      type: "single_choice",
      question: "Which organelle produces most cellular ATP?",
      answers: ["Mitochondrion", "Nucleus", "Ribosome", "Lysosome"],
      correctAnswers: ["Mitochondrion"],
      explanation: "Mitochondria produce most cellular ATP through respiration.",
    },
    {
      id: "q2",
      type: "multiple_choice",
      question: "Which structures are found in plant cells?",
      answers: ["Cell wall", "Chloroplast", "Flagellum", "Capsule"],
      correctAnswers: ["Cell wall", "Chloroplast"],
    },
    {
      id: "q3",
      type: "true_false",
      question: "The nucleus contains genetic material.",
      answers: ["True", "False"],
      correctAnswers: ["True"],
    },
  ],
} satisfies QuizFile;

export const QUIZ_SCHEMA_REFERENCE = JSON.stringify(QUIZ_SCHEMA_EXAMPLE, null, 2);

export const EXTERNAL_QUIZ_PROMPT = `Create a RecallFlow quiz and provide it as a downloadable JSON file named recallflow-quiz.json.

The file must contain valid JSON only.

Use this exact structure:
${QUIZ_SCHEMA_REFERENCE}

Rules:
- Attach the completed quiz as a downloadable .json file named recallflow-quiz.json.
- Put only JSON in the file. Do not wrap it in Markdown or add commentary.
- Include a non-empty title and at least one question.
- Give every question a unique, non-empty id.
- Use only these question types: single_choice, multiple_choice, true_false.
- Give every question at least two unique, non-empty answers.
- correctAnswers must exactly match values from answers.
- single_choice and true_false questions must have exactly one correct answer.
- For true_false questions, use exactly ["True", "False"] as the answers.
- description, explanation, and videoUrl are optional. videoUrl must be a complete http:// or https:// URL. Do not include null values or extra fields.
- Make every question useful for active recall and grounded only in the supplied material.

Create 10 questions from the material I paste after this prompt. If I provide a link you cannot access, ask me to paste the transcript, notes, or article text instead. When the quiz is complete, create recallflow-quiz.json and present it for download.`;
