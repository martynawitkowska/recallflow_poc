import { GenerationBudget, handleRequest } from "./index.ts";

const origin = "https://martynawitkowska.github.io";

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function request(body: unknown, requestOrigin = origin) {
  return new Request("https://worker.example/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: requestOrigin },
    body: JSON.stringify(body),
  });
}

function env(enabled = true, rateAllowed = true, budgetAllowed = true) {
  return {
    GENERATION_BUDGET: {
      idFromName(name: string) {
        return name;
      },
      get() {
        return {
          async fetch() {
            return new Response(null, { status: budgetAllowed ? 204 : 429 });
          },
        };
      },
    },
    GENERATION_ENABLED: enabled ? "true" : "false",
    GENERATION_RATE_LIMITER: {
      async limit() {
        return { success: rateAllowed };
      },
    },
    OPENAI_API_KEY: " test-only-key\n",
  };
}

const generationRequest = {
  operation: "quiz",
  material: "Mitochondria generate most cellular ATP.",
  questionCount: 3,
};

const quiz = {
  title: "Cell biology",
  description: "A focused review.",
  questions: [1, 2, 3].map((number) => ({
    id: `q${number}`,
    type: "single_choice",
    question: `Question ${number}?`,
    answers: ["Correct", "Distractor"],
    correctAnswers: ["Correct"],
    explanation: "Grounded in the supplied material.",
  })),
};

const rejectedOrigin = await handleRequest(
  request(generationRequest, "https://attacker.example"),
  env(),
);
expect(rejectedOrigin.status === 403, "Unapproved origins must be rejected.");
expect(
  rejectedOrigin.headers.get("Access-Control-Allow-Origin") === "null",
  "Rejected origins must not receive an allowed CORS origin.",
);

expect(
  (await handleRequest(request(generationRequest), env(false))).status === 503,
  "The emergency switch must disable generation.",
);
const unsupportedContentType = new Request("https://worker.example/generate", {
  method: "POST",
  headers: { "Content-Type": "text/plain", Origin: origin },
  body: JSON.stringify(generationRequest),
});
expect(
  (await handleRequest(unsupportedContentType, env())).status === 415,
  "Unsupported content types must be rejected before the provider call.",
);
expect(
  (await handleRequest(request({ ...generationRequest, questionCount: 20 }), env())).status === 400,
  "Excessive question counts must be rejected before the provider call.",
);
expect(
  (await handleRequest(request(generationRequest), env(true, false))).status === 429,
  "Rate-limited requests must return 429.",
);
expect(
  (await handleRequest(request(generationRequest), env(true, true, false))).status === 429,
  "Requests beyond the monthly budget gate must return 429.",
);

const storedBudget = new Map<string, unknown>();
const budget = new GenerationBudget({
  storage: {
    async get<T>(key: string) {
      return storedBudget.get(key) as T | undefined;
    },
    async put(key: string, value: unknown) {
      storedBudget.set(key, value);
    },
  },
});
for (let attempt = 0; attempt < 50; attempt += 1) {
  expect(
    (await budget.fetch(new Request("https://budget.internal/reserve", { method: "POST" }))).status === 204,
    "The configured monthly request allowance must be reservable.",
  );
}
expect(
  (await budget.fetch(new Request("https://budget.internal/reserve", { method: "POST" }))).status === 429,
  "The monthly budget gate must reject request 51.",
);

let receivedSecret = false;
const success = await handleRequest(
  request(generationRequest),
  env(),
  async (_input, init) => {
    receivedSecret = new Headers(init?.headers).get("Authorization") === "Bearer test-only-key";
    return Response.json({
      output: [
        {
          content: [{ type: "output_text", text: JSON.stringify(quiz) }],
        },
      ],
    });
  },
);
expect(success.status === 200, "A valid structured quiz should succeed.");
expect(receivedSecret, "The provider request must use the server-side secret.");
expect(
  success.headers.get("Access-Control-Allow-Origin") === origin,
  "Successful responses must allow only the requesting approved origin.",
);

const invalidProviderOutput = await handleRequest(
  request(generationRequest),
  env(),
  async () => Response.json({ output: [{ content: [{ type: "output_text", text: "{}" }] }] }),
);
const invalidProviderBody = await invalidProviderOutput.text();
expect(
  invalidProviderOutput.status === 502 &&
    invalidProviderBody.includes("provider_output_invalid_quiz") &&
    !invalidProviderBody.includes("test-only-key"),
  "Invalid provider output must fail without exposing secrets.",
);

const rejectedProviderRequest = await handleRequest(
  request(generationRequest),
  env(),
  async () => new Response("provider detail must stay private", { status: 400 }),
);
const rejectedProviderBody = await rejectedProviderRequest.text();
expect(
  rejectedProviderRequest.status === 502 &&
    rejectedProviderBody.includes("provider_request_rejected") &&
    !rejectedProviderBody.includes("provider detail"),
  "Provider request errors must expose only a safe classification.",
);

const transportFailure = await handleRequest(
  request(generationRequest),
  env(),
  async () => {
    throw new Error("private transport detail");
  },
);
expect(
  transportFailure.status === 503 &&
    (await transportFailure.text()).includes("provider_transport_failed"),
  "Transport failures must expose only a safe classification.",
);
