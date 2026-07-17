import { invokeIpc } from "./ipc";
import type { MnemonicProvider } from "./mnemonicProviders";

export type ApiKeyStatus = {
  configured: boolean;
  maskedKey: string | null;
};

export function getApiKeyStatus(
  provider: MnemonicProvider,
): Promise<ApiKeyStatus> {
  return invokeIpc(
    "get_ai_api_key_status",
    { provider },
    "RecallFlow could not read the operating system credential store.",
    true,
  );
}

export function saveApiKey(
  provider: MnemonicProvider,
  apiKey: string,
): Promise<ApiKeyStatus> {
  return invokeIpc(
    "save_ai_api_key",
    { provider, apiKey },
    "RecallFlow could not save the API key securely.",
    true,
  );
}

export function deleteApiKey(
  provider: MnemonicProvider,
): Promise<ApiKeyStatus> {
  return invokeIpc(
    "delete_ai_api_key",
    { provider },
    "RecallFlow could not remove the saved API key.",
    true,
  );
}
