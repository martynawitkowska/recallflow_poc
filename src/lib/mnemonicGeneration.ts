import { invokeIpc } from "./ipc.ts";
import type { MnemonicModel, MnemonicProvider } from "./mnemonicProviders.ts";
import { webPreviewGenerationEndpoint } from "./quizGeneration.ts";
import { isPagesPreview } from "./runtime.ts";

const MAX_MNEMONIC_CHARS = 1_000;

export type GenerateMnemonicRequest = {
  question: string;
  correctAnswers: string[];
  explanation?: string;
  provider: MnemonicProvider;
  model?: MnemonicModel;
};

export async function generateMnemonic(
  request: GenerateMnemonicRequest,
): Promise<string> {
  if (isPagesPreview) return generateWebPreviewMnemonic(request);
  return invokeIpc(
    "generate_mnemonic",
    { request },
    "The selected AI provider could not generate a mnemonic. Check the API key and internet connection, then try again.",
    true,
  );
}

export async function generateWebPreviewMnemonic(
  request: GenerateMnemonicRequest,
  providerFetch: typeof fetch = fetch,
  generationEndpoint = webPreviewGenerationEndpoint,
): Promise<string> {
  if (!generationEndpoint) {
    throw new Error("Live mnemonic generation is not enabled for this preview yet.");
  }
  let response: Response;
  try {
    response = await providerFetch(generationEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "mnemonic",
        question: request.question,
        correctAnswers: request.correctAnswers,
        explanation: request.explanation,
      }),
    });
  } catch {
    throw new Error("The live generation service is unavailable. Try again later.");
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      429: "The jury preview generation limit was reached. Try again later.",
      503: "Live generation is temporarily disabled.",
      504: "Mnemonic generation took too long. Try again.",
    };
    throw new Error(messages[response.status] ?? "Live generation could not create a mnemonic. Try again later.");
  }
  let payload: { mnemonic?: unknown };
  try {
    payload = await response.json() as { mnemonic?: unknown };
  } catch {
    throw new Error("Live generation returned an invalid mnemonic. Try again later.");
  }
  const mnemonic = typeof payload.mnemonic === "string"
    ? payload.mnemonic.split(/\s+/u).filter(Boolean).join(" ")
    : "";
  if (
    !mnemonic ||
    Array.from(mnemonic).length > MAX_MNEMONIC_CHARS ||
    Array.from(mnemonic).some((character) => /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(character))
  ) {
    throw new Error("Live generation returned an invalid mnemonic. Try again later.");
  }
  return mnemonic;
}
