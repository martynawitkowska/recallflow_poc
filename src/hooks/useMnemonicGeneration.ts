import { useCallback, useRef, useState } from "react";
import { OFFLINE_AI_MESSAGE } from "../lib/connectivity";
import {
  generateMnemonic,
  type GenerateMnemonicRequest,
} from "../lib/mnemonicGeneration";

export type MnemonicGenerationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; mnemonic: string }
  | { status: "error"; message: string };

export function useMnemonicGeneration(isOnline: boolean) {
  const [state, setState] = useState<MnemonicGenerationState>({ status: "idle" });
  const requestId = useRef(0);

  const generate = useCallback(async (request: GenerateMnemonicRequest) => {
    if (!isOnline) {
      setState({ status: "error", message: OFFLINE_AI_MESSAGE });
      return null;
    }

    const currentRequest = ++requestId.current;
    setState({ status: "loading" });

    try {
      const mnemonic = await generateMnemonic(request);
      if (currentRequest === requestId.current) {
        setState({ status: "success", mnemonic });
        return mnemonic;
      }
    } catch (error) {
      if (currentRequest === requestId.current) {
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "The selected AI provider could not generate a mnemonic. Try again.",
        });
      }
    }

    return null;
  }, [isOnline]);

  const reset = useCallback(() => {
    requestId.current += 1;
    setState({ status: "idle" });
  }, []);

  return { generate, reset, state };
}
