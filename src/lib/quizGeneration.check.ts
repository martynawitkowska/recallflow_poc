import {
  MAX_MATERIAL_CHARS,
  MAX_SOURCE_URL_CHARS,
  type GenerateQuizRequest,
  validateQuizGenerationRequest,
} from "./quizGeneration.ts";

const validMaterialRequest: GenerateQuizRequest = {
  material: "Cellular respiration produces ATP.",
  provider: "openai",
  questionCount: 8,
  apiKey: "sk-test-only",
};
const validUrlRequest: GenerateQuizRequest = {
  sourceUrl: "https://example.com/lecture",
  provider: "openai",
  questionCount: 3,
  apiKey: "sk-test-only",
};

for (const request of [validMaterialRequest, validUrlRequest]) {
  if (validateQuizGenerationRequest(request) !== null) {
    throw new Error("Expected a valid quiz-generation request.");
  }
}

const invalidRequests: Array<[GenerateQuizRequest, string]> = [
  [{ ...validMaterialRequest, material: undefined }, "either pasted"],
  [{ ...validMaterialRequest, sourceUrl: "https://example.com" }, "either pasted"],
  [{ ...validMaterialRequest, material: "  " }, "Paste study material"],
  [
    { ...validMaterialRequest, material: "x".repeat(MAX_MATERIAL_CHARS + 1) },
    "characters or fewer",
  ],
  [{ ...validUrlRequest, sourceUrl: "  " }, "public lecture"],
  [{ ...validUrlRequest, sourceUrl: "file:///tmp/notes" }, "http:// or https://"],
  [
    { ...validUrlRequest, sourceUrl: `https://example.com/${"x".repeat(MAX_SOURCE_URL_CHARS)}` },
    "http:// or https://",
  ],
  [{ ...validMaterialRequest, apiKey: "  " }, "OpenAI API key"],
  [{ ...validMaterialRequest, questionCount: 2 }, "between 3 and 25"],
  [{ ...validMaterialRequest, questionCount: 3.5 }, "between 3 and 25"],
  [{ ...validMaterialRequest, questionCount: 26 }, "between 3 and 25"],
];

for (const [request, expectedMessage] of invalidRequests) {
  const error = validateQuizGenerationRequest(request);
  if (!error?.includes(expectedMessage)) {
    throw new Error(`Expected validation error containing "${expectedMessage}".`);
  }
  if (error.includes(request.apiKey)) {
    throw new Error("Quiz-generation validation exposed an API key.");
  }
}
