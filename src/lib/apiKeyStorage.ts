import { invokeIpc } from "./ipc.ts";
import type { MnemonicProvider } from "./mnemonicProviders.ts";

const API_KEY_STATUS_STORAGE_KEY = "recallflow-ai-api-key-status";

export type ApiKeyStatus = {
  configured: boolean | null;
  maskedKey: string | null;
};

const unknownStatus = (): ApiKeyStatus => ({
  configured: null,
  maskedKey: null,
});

export function parseApiKeyStatus(
  value: string | null,
  provider: MnemonicProvider,
): ApiKeyStatus {
  try {
    const status = (
      JSON.parse(value ?? "null") as Record<string, unknown> | null
    )?.[provider];
    if (!status || typeof status !== "object") {
      return unknownStatus();
    }

    const { configured, maskedKey } = status as Record<string, unknown>;
    return (configured === true && typeof maskedKey === "string") ||
      (configured === false && maskedKey === null)
      ? { configured, maskedKey }
      : unknownStatus();
  } catch {
    return unknownStatus();
  }
}

export function getApiKeyStatus(
  provider: MnemonicProvider,
): Promise<ApiKeyStatus> {
  try {
    return Promise.resolve(
      parseApiKeyStatus(
        window.localStorage.getItem(API_KEY_STATUS_STORAGE_KEY),
        provider,
      ),
    );
  } catch {
    return Promise.resolve(unknownStatus());
  }
}

function cacheApiKeyStatus(
  provider: MnemonicProvider,
  status: ApiKeyStatus,
) {
  let cached: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(API_KEY_STATUS_STORAGE_KEY) ?? "{}",
    ) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      cached = parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid display metadata is replaced after the credential operation.
  }

  try {
    window.localStorage.setItem(
      API_KEY_STATUS_STORAGE_KEY,
      JSON.stringify({ ...cached, [provider]: status }),
    );
  } catch {
    // The key remains secure and usable even when display metadata cannot persist.
  }
}

export async function saveApiKey(
  provider: MnemonicProvider,
  apiKey: string,
): Promise<ApiKeyStatus> {
  const status = await invokeIpc<ApiKeyStatus>(
    "save_ai_api_key",
    { provider, apiKey },
    "RecallFlow could not save the API key securely.",
    true,
  );
  cacheApiKeyStatus(provider, status);
  return status;
}

export async function deleteApiKey(
  provider: MnemonicProvider,
): Promise<ApiKeyStatus> {
  const status = await invokeIpc<ApiKeyStatus>(
    "delete_ai_api_key",
    { provider },
    "RecallFlow could not remove the saved API key.",
    true,
  );
  cacheApiKeyStatus(provider, status);
  return status;
}
