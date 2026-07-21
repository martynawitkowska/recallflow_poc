import { validateQuiz } from "../../src/lib/validateQuiz.ts";

const ALLOWED_ORIGINS = new Set([
  "https://martynawitkowska.github.io",
  "http://127.0.0.1:1420",
  "http://localhost:1420",
]);
const MAX_BODY_BYTES = 75_000;
const MAX_MATERIAL_CHARS = 50_000;
const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 2;
const PROVIDER_TIMEOUT_MS = 25_000;
const MONTHLY_GENERATION_LIMIT = 50;

type RateLimiter = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
};

type DurableObjectNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
};

type Env = {
  GENERATION_BUDGET: DurableObjectNamespace;
  GENERATION_ENABLED: string;
  GENERATION_RATE_LIMITER: RateLimiter;
  OPENAI_API_KEY: string;
};

type DurableObjectState = {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
  };
};

export class GenerationBudget {
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/reserve") {
      return new Response(null, { status: 404 });
    }
    const month = new Date().toISOString().slice(0, 7);
    const key = `generation-count:${month}`;
    const count = (await this.state.storage.get<number>(key)) ?? 0;
    if (count >= MONTHLY_GENERATION_LIMIT) {
      return new Response(null, { status: 429 });
    }
    await this.state.storage.put(key, count + 1);
    return new Response(null, { status: 204 });
  }
}

type GenerateRequest = {
  operation: "quiz";
  material: string;
  questionCount: number;
};

const quizSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 200 },
    description: { type: "string", maxLength: 500 },
    questions: {
      type: "array",
      minItems: 1,
      maxItems: MAX_QUESTIONS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 80 },
          type: {
            type: "string",
            enum: ["single_choice", "multiple_choice", "true_false"],
          },
          question: { type: "string", minLength: 1, maxLength: 500 },
          answers: {
            type: "array",
            minItems: 2,
            maxItems: 6,
            items: { type: "string", minLength: 1, maxLength: 300 },
          },
          correctAnswers: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string", minLength: 1, maxLength: 300 },
          },
          explanation: { type: "string", maxLength: 700 },
        },
        required: [
          "id",
          "type",
          "question",
          "answers",
          "correctAnswers",
          "explanation",
        ],
      },
    },
  },
  required: ["title", "description", "questions"],
} as const;

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function json(origin: string, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  });
}

function error(origin: string, status: number, code: string, message: string) {
  return json(origin, status, { error: { code, message } });
}

function parseRequest(value: unknown): GenerateRequest | null {
  if (!value || typeof value !== "object") return null;
  const request = value as Partial<GenerateRequest>;
  if (
    request.operation !== "quiz" ||
    typeof request.material !== "string" ||
    !request.material.trim() ||
    Array.from(request.material).length > MAX_MATERIAL_CHARS ||
    !Number.isInteger(request.questionCount) ||
    request.questionCount! < MIN_QUESTIONS ||
    request.questionCount! > MAX_QUESTIONS
  ) {
    return null;
  }
  return {
    operation: "quiz",
    material: request.material.trim(),
    questionCount: request.questionCount!,
  };
}

function extractOutputText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const response = value as { output?: unknown };
  if (!Array.isArray(response.output)) return null;
  for (const item of response.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

class ProviderHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("OpenAI request failed.");
    this.status = status;
  }
}

class ProviderOutputError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("OpenAI output failed validation.");
    this.code = code;
  }
}

class ProviderTransportError extends Error {
  readonly timedOut: boolean;

  constructor(timedOut = false) {
    super("OpenAI transport failed.");
    this.timedOut = timedOut;
  }
}

async function callOpenAi(
  request: GenerateRequest,
  apiKey: string,
  providerFetch: typeof fetch,
): Promise<unknown> {
  const normalizedApiKey = apiKey.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  let response: Response;
  try {
    response = await providerFetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${normalizedApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        store: false,
        max_output_tokens: 4_000,
        input: [
          {
            role: "developer",
            content:
              "Create a rigorous active-recall quiz grounded only in the supplied material. Answer choices must be concise, parallel, self-contained, and unambiguous. Put reasoning only in explanation. For true_false use exactly True and False. Return exactly the requested number of questions when the material supports them; otherwise return fewer rather than inventing facts.",
          },
          {
            role: "user",
            content: `Requested questions: ${request.questionCount}\n\nStudy material:\n${request.material}`,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "recallflow_quiz",
            strict: true,
            schema: quizSchema,
          },
        },
      }),
      signal: controller.signal,
    });
  } catch {
    throw new ProviderTransportError(controller.signal.aborted);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new ProviderHttpError(response.status);
  try {
    return await response.json();
  } catch {
    throw new ProviderOutputError("provider_response_invalid_envelope");
  }
}

export async function handleRequest(
  request: Request,
  env: Env,
  providerFetch: typeof fetch = fetch,
): Promise<Response> {
  const origin = request.headers.get("Origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return error("null", 403, "origin_rejected", "This preview origin is not allowed.");
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST" || new URL(request.url).pathname !== "/generate") {
    return error(origin, 404, "not_found", "This generation route is not available.");
  }
  if (env.GENERATION_ENABLED !== "true") {
    return error(origin, 503, "disabled", "Live generation is temporarily unavailable.");
  }
  if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) {
    return error(origin, 415, "invalid_request", "Send a JSON quiz-generation request.");
  }
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return error(origin, 413, "request_too_large", "Study material is too large for the jury preview.");
  }
  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).length > MAX_BODY_BYTES) {
    return error(origin, 413, "request_too_large", "Study material is too large for the jury preview.");
  }
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return error(origin, 400, "invalid_request", "Send a valid quiz-generation request.");
  }
  const generationRequest = parseRequest(body);
  if (!generationRequest) {
    return error(origin, 400, "invalid_request", "Use 1–2 questions and no more than 50,000 characters.");
  }
  const rateLimit = await env.GENERATION_RATE_LIMITER.limit({ key: "jury-quiz-generation" });
  if (!rateLimit.success) {
    return error(origin, 429, "rate_limited", "The jury preview generation limit was reached. Try again in one minute.");
  }
  const budgetId = env.GENERATION_BUDGET.idFromName("jury-monthly-budget");
  const budget = await env.GENERATION_BUDGET.get(budgetId).fetch(
    new Request("https://budget.internal/reserve", { method: "POST" }),
  );
  if (!budget.ok) {
    return error(origin, 429, "monthly_limit", "The jury preview monthly generation limit was reached.");
  }

  try {
    const providerResponse = await callOpenAi(
      generationRequest,
      env.OPENAI_API_KEY,
      providerFetch,
    );
    const outputText = extractOutputText(providerResponse);
    if (!outputText) throw new ProviderOutputError("provider_output_missing");
    let parsedOutput: unknown;
    try {
      parsedOutput = JSON.parse(outputText);
    } catch {
      throw new ProviderOutputError("provider_output_invalid_json");
    }
    const validation = validateQuiz(parsedOutput);
    if (!validation.valid) throw new ProviderOutputError("provider_output_invalid_quiz");
    if (validation.quiz.questions.length > generationRequest.questionCount) {
      throw new ProviderOutputError("provider_output_excessive_questions");
    }
    return json(origin, 200, { quiz: validation.quiz });
  } catch (providerError) {
    const timedOut =
      providerError instanceof DOMException && providerError.name === "TimeoutError";
    if (providerError instanceof ProviderHttpError) {
      if (providerError.status === 401 || providerError.status === 403) {
        return error(origin, 502, "provider_authentication_failed", "Live generation is not configured correctly.");
      }
      if (providerError.status === 400) {
        return error(origin, 502, "provider_request_rejected", "Live generation needs a configuration update.");
      }
      return error(origin, 503, "provider_unavailable", "OpenAI is temporarily unavailable for this preview.");
    }
    if (providerError instanceof ProviderOutputError) {
      return error(origin, 502, providerError.code, "Live generation returned an invalid quiz. Try again later.");
    }
    if (providerError instanceof ProviderTransportError) {
      return providerError.timedOut
        ? error(origin, 504, "timeout", "Live generation took too long. Try shorter material.")
        : error(origin, 503, "provider_transport_failed", "OpenAI could not be reached from the preview service.");
    }
    return error(
      origin,
      timedOut ? 504 : 502,
      timedOut ? "timeout" : "generation_failed",
      timedOut
        ? "Live generation took too long. Try shorter material."
        : "Live generation could not create a valid quiz. Try again later.",
    );
  }
}

export default {
  fetch(request: Request, env: Env) {
    return handleRequest(request, env);
  },
};
