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
- Write concise answer choices that directly answer the question in parallel form.
- Make every choice self-contained, grammatical, and clear. Do not copy transcript fragments, missing referents, speaker-centric phrasing, or slang into an answer.
- Do not include choices that are paraphrases of each other. When a question asks for a specific number of cases or items, include that many distinct correct answers.
- Put reasoning only in explanation. Do not write explanatory sentences as answer choices or repeat the term being asked about. For “What does X mean?”, use choices like “Lower bound”, not “X means lower bound”.
- Make distractors the same kind and level of detail as the correct answer. Do not reveal the answer through wording, length, or grammar.
- single_choice and true_false questions must have exactly one correct answer.
- For true_false questions, use exactly ["True", "False"] as the answers.
- description, explanation, and videoUrl are optional. videoUrl must be a complete http:// or https:// URL. Do not include null values or extra fields.
- Make every question useful for active recall and grounded only in the supplied material.

Create 10 questions from the material I paste after this prompt. If I provide a link you cannot access, ask me to paste the transcript, notes, or article text instead. When the quiz is complete, create recallflow-quiz.json and present it for download.`;
