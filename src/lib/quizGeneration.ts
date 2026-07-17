import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invokeIpc } from "./ipc.ts";
import { MAX_VIDEO_URL_CHARS, type QuizFile } from "./quizSchema.ts";
import { validateQuiz } from "./validateQuiz.ts";

export const MAX_MATERIAL_CHARS = 500_000;
export const MAX_SOURCE_URL_CHARS = 2_048;
export const MIN_QUESTION_COUNT = 3;
export const MAX_QUESTION_COUNT = 25;
export const DEFAULT_QUESTION_COUNT = 8;

export type AiProvider = "openai";

export type GenerateQuizRequest = {
  material?: string;
  sourceUrl?: string;
  provider: AiProvider;
  model?: string;
  questionCount: number;
};

export type GenerationStage =
  | "preparing_transcript"
  | "generating_candidates"
  | "verifying_questions"
  | "selecting_questions"
  | "complete";

export type GenerationProgress = {
  runId: string;
  stage: GenerationStage;
  completed: number;
  total?: number;
};

export type GenerationQuality = {
  requestedCount: number;
  generatedCandidateCount: number;
  deterministicRejectionCount: number;
  semanticRejectionCount: number;
  duplicateCount: number;
  selectedCount: number;
  incompleteCoverage: boolean;
  duplicateAnalysisIncomplete: boolean;
};

export type GenerationResult = {
  quiz?: QuizFile;
  completion:
    | "full"
    | "quality_limited"
    | "incomplete_coverage"
    | "quality_empty"
    | "cancelled";
  quality: GenerationQuality;
};

const STAGE_ORDER: Record<GenerationStage, number> = {
  preparing_transcript: 0,
  generating_candidates: 1,
  verifying_questions: 2,
  selecting_questions: 3,
  complete: 4,
};

export function mergeGenerationProgress(
  current: GenerationProgress | undefined,
  incoming: GenerationProgress,
  activeRunId: string,
): GenerationProgress | undefined {
  if (incoming.runId !== activeRunId) return current;
  if (!current || STAGE_ORDER[incoming.stage] > STAGE_ORDER[current.stage]) {
    return incoming;
  }
  if (STAGE_ORDER[incoming.stage] < STAGE_ORDER[current.stage]) return current;
  return {
    ...incoming,
    completed: Math.max(current.completed, incoming.completed),
    total: incoming.total ?? current.total,
  };
}

export function countCharacters(value: string): number {
  return Array.from(value).length;
}

export function validateOptionalVideoUrl(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (
      normalized.length > MAX_VIDEO_URL_CHARS ||
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname
    ) {
      return "Enter a complete http:// or https:// video URL.";
    }
  } catch {
    return "Enter a complete http:// or https:// video URL.";
  }
  return null;
}

export function generationProgressLabel(progress: GenerationProgress): string {
  const labels: Record<GenerationStage, string> = {
    preparing_transcript: "Preparing transcript",
    generating_candidates: "Generating candidates",
    verifying_questions: "Verifying questions",
    selecting_questions: "Selecting questions",
    complete: "Complete",
  };
  const count = progress.total === undefined
    ? ""
    : ` (${Math.min(progress.completed, progress.total)} of ${progress.total})`;
  return `${labels[progress.stage]}${count}`;
}

export function generationOutcomeMessage(result: GenerationResult): string | null {
  switch (result.completion) {
    case "quality_limited":
      return `Generated ${result.quality.selectedCount} of ${result.quality.requestedCount} requested questions. RecallFlow omitted candidates that were unsupported, context-dependent, ambiguous, duplicated, or insufficiently qualified.`;
    case "incomplete_coverage":
      return `Generated ${result.quality.selectedCount} trustworthy questions, but one or more source sections could not be fully processed.`;
    case "quality_empty":
      return "RecallFlow found no questions that passed grounding and quality checks. Try material with clearer definitions, mechanisms, or qualified claims.";
    case "cancelled":
      return "Generation cancelled. You can edit the source and try again.";
    case "full":
      return null;
  }
}

export function validateQuizGenerationRequest(
  request: GenerateQuizRequest,
): string | null {
  const hasMaterial = request.material !== undefined;
  const hasSourceUrl = request.sourceUrl !== undefined;

  if (hasMaterial === hasSourceUrl) {
    return "Choose either pasted study material or a public URL.";
  }
  if (request.material !== undefined) {
    if (!request.material.trim()) {
      return "Paste study material before generating a quiz.";
    }
    if (countCharacters(request.material) > MAX_MATERIAL_CHARS) {
      return `Study material must be ${MAX_MATERIAL_CHARS.toLocaleString()} characters or fewer.`;
    }
  }
  if (request.sourceUrl !== undefined) {
    if (!request.sourceUrl.trim()) {
      return "Enter a public lecture or article URL before generating a quiz.";
    }
    try {
      const url = new URL(request.sourceUrl.trim());
      if (
        request.sourceUrl.length > MAX_SOURCE_URL_CHARS ||
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        !url.hostname
      ) {
        return "Enter a complete public http:// or https:// URL.";
      }
    } catch {
      return "Enter a complete public http:// or https:// URL.";
    }
  }
  if (
    !Number.isInteger(request.questionCount) ||
    request.questionCount < MIN_QUESTION_COUNT ||
    request.questionCount > MAX_QUESTION_COUNT
  ) {
    return `Choose between ${MIN_QUESTION_COUNT} and ${MAX_QUESTION_COUNT} questions.`;
  }

  return null;
}

export async function generateQuiz(
  request: GenerateQuizRequest,
  runId: string,
  onProgress: (progress: GenerationProgress) => void,
  signal?: AbortSignal,
): Promise<GenerationResult> {
  const validationError = validateQuizGenerationRequest(request);
  if (validationError) {
    throw new Error(validationError);
  }

  let unlisten: UnlistenFn = () => {};
  let cleaned = false;
  const cleanup = () => {
    if (!cleaned) {
      cleaned = true;
      unlisten();
    }
  };
  if (isTauri()) {
    unlisten = await listen<GenerationProgress>(
      "quiz-generation-progress",
      (event) => onProgress(event.payload),
    );
  }
  signal?.addEventListener("abort", () => {
    cleanup();
    void cancelQuizGeneration(runId);
  }, { once: true });
  let payload: unknown;
  try {
    payload = await invokeIpc<unknown>(
      "generate_quiz",
      { request, runId },
      request.sourceUrl
        ? "OpenAI could not read that URL or generate a quiz. Check that the page is public and readable, then try again."
        : "OpenAI could not generate a trustworthy quiz. Check the API key and connection, then try again.",
      true,
    );
  } finally {
    cleanup();
  }

  if (!isGenerationResult(payload)) {
    throw new Error("OpenAI returned an invalid generation result. Try again.");
  }
  if (!payload.quiz) return payload;
  const validation = validateQuiz(payload.quiz);

  if (!validation.valid) {
    throw new Error(
      "OpenAI returned an invalid quiz. Try again with a clearer source.",
    );
  }

  return { ...payload, quiz: validation.quiz };
}

export async function cancelQuizGeneration(runId: string): Promise<void> {
  await invokeIpc("cancel_quiz_generation", { runId });
}

function isGenerationResult(value: unknown): value is GenerationResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<GenerationResult>;
  const completion = result.completion;
  const quality = result.quality as Partial<GenerationQuality> | undefined;
  return (
    ["full", "quality_limited", "incomplete_coverage", "quality_empty", "cancelled"].includes(
      completion ?? "",
    ) &&
    !!quality &&
    [
      quality.requestedCount,
      quality.generatedCandidateCount,
      quality.deterministicRejectionCount,
      quality.semanticRejectionCount,
      quality.duplicateCount,
      quality.selectedCount,
    ].every((count) => Number.isInteger(count) && (count ?? -1) >= 0) &&
    typeof quality.incompleteCoverage === "boolean" &&
    typeof quality.duplicateAnalysisIncomplete === "boolean" &&
    ((completion === "quality_empty" || completion === "cancelled")
      ? result.quiz === undefined || result.quiz === null
      : result.quiz !== undefined)
  );
}
