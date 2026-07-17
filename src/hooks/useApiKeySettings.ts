import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteApiKey,
  getApiKeyStatus,
  saveApiKey,
  type ApiKeyStatus,
} from "../lib/apiKeyStorage";
import type { MnemonicProvider } from "../lib/mnemonicProviders";

export type ApiKeySettingsState =
  | { status: "loading" }
  | {
      status: "ready";
      key: ApiKeyStatus;
      error?: string;
      message?: string;
    }
  | { status: "saving"; key: ApiKeyStatus }
  | { status: "error"; message: string };

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "RecallFlow could not update the saved API key. Try again.";

export function useApiKeySettings(provider: MnemonicProvider) {
  const requestId = useRef(0);
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<ApiKeySettingsState>({ status: "loading" });

  useEffect(() => {
    const currentRequest = ++requestId.current;
    setApiKey("");
    setState({ status: "loading" });
    void getApiKeyStatus(provider).then(
      (key) => {
        if (currentRequest === requestId.current) {
          setState({ status: "ready", key });
        }
      },
      (error) => {
        if (currentRequest === requestId.current) {
          setState({ status: "error", message: errorMessage(error) });
        }
      },
    );
  }, [provider]);

  const save = useCallback(async () => {
    if (state.status !== "ready") {
      return;
    }

    const currentRequest = ++requestId.current;
    setState({ status: "saving", key: state.key });
    try {
      const key = await saveApiKey(provider, apiKey);
      if (currentRequest === requestId.current) {
        setApiKey("");
        setState({ status: "ready", key, message: "API key saved securely." });
      }
    } catch (error) {
      if (currentRequest === requestId.current) {
        setState({ status: "ready", key: state.key, error: errorMessage(error) });
      }
    }
  }, [apiKey, provider, state]);

  const remove = useCallback(async () => {
    if (state.status !== "ready") {
      return;
    }

    const currentRequest = ++requestId.current;
    setState({ status: "saving", key: state.key });
    try {
      const key = await deleteApiKey(provider);
      if (currentRequest === requestId.current) {
        setApiKey("");
        setState({ status: "ready", key, message: "API key removed." });
      }
    } catch (error) {
      if (currentRequest === requestId.current) {
        setState({ status: "ready", key: state.key, error: errorMessage(error) });
      }
    }
  }, [provider, state]);

  return { apiKey, remove, save, setApiKey, state };
}
