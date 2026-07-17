import {
  countCharacters,
  generationProgressLabel,
  generationOutcomeMessage,
  MAX_MATERIAL_CHARS,
  MAX_SOURCE_URL_CHARS,
  mergeGenerationProgress,
  type GenerateQuizRequest,
  validateOptionalVideoUrl,
  validateQuizGenerationRequest,
} from "./quizGeneration.ts";

if (countCharacters("A🧠B") !== 3) {
  throw new Error("Expected transcript limits to count Unicode characters.");
}

if (validateOptionalVideoUrl("") !== null || validateOptionalVideoUrl(" https://youtu.be/demo ") !== null) {
  throw new Error("Expected empty and HTTPS video links to be valid.");
}
if (!validateOptionalVideoUrl("javascript:alert(1)")) {
  throw new Error("Expected unsafe video URL schemes to be rejected.");
}

const validMaterialRequest: GenerateQuizRequest = {
  material: "Cellular respiration produces ATP.",
  provider: "openai",
  questionCount: 8,
};
const validUrlRequest: GenerateQuizRequest = {
  sourceUrl: "https://example.com/lecture",
  provider: "openai",
  questionCount: 3,
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
  [{ ...validMaterialRequest, questionCount: 2 }, "between 3 and 25"],
  [{ ...validMaterialRequest, questionCount: 3.5 }, "between 3 and 25"],
  [{ ...validMaterialRequest, questionCount: 26 }, "between 3 and 25"],
];

for (const [request, expectedMessage] of invalidRequests) {
  const error = validateQuizGenerationRequest(request);
  if (!error?.includes(expectedMessage)) {
    throw new Error(`Expected validation error containing "${expectedMessage}".`);
  }
}

if ("apiKey" in validMaterialRequest) {
  throw new Error("Quiz-generation requests must not carry saved API keys.");
}

const active = {
  runId: "run-active",
  stage: "generating_candidates" as const,
  completed: 2,
  total: 5,
};
const stale = mergeGenerationProgress(active, { ...active, runId: "run-stale", completed: 5 }, "run-active");
if (stale !== active) {
  throw new Error("Expected stale generation events to be ignored.");
}
const regressed = mergeGenerationProgress(active, { ...active, completed: 1 }, "run-active");
if (regressed?.completed !== 2) {
  throw new Error("Expected chunk progress to remain monotonic.");
}
const advanced = mergeGenerationProgress(active, {
  runId: "run-active",
  stage: "verifying_questions",
  completed: 0,
  total: 2,
}, "run-active");
if (generationProgressLabel(advanced!) !== "Verifying questions (0 of 2)") {
  throw new Error("Expected accessible stage and batch progress text.");
}

const quality = {
  requestedCount: 8,
  generatedCandidateCount: 5,
  deterministicRejectionCount: 1,
  semanticRejectionCount: 1,
  duplicateCount: 1,
  selectedCount: 5,
  incompleteCoverage: false,
  duplicateAnalysisIncomplete: false,
};
for (const [completion, expected] of [
  ["quality_limited", "Generated 5 of 8"],
  ["incomplete_coverage", "source sections"],
  ["quality_empty", "no questions"],
  ["cancelled", "cancelled"],
] as const) {
  const message = generationOutcomeMessage({ completion, quality });
  if (!message?.includes(expected)) {
    throw new Error(`Expected ${completion} completion guidance.`);
  }
}
if (generationOutcomeMessage({ completion: "full", quality }) !== null) {
  throw new Error("Expected full generation to need no quality warning.");
}
