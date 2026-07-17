import { useCallback, useRef, useState } from "react";
import {
  generateMnemonic,
  type GenerateMnemonicRequest,
} from "../lib/mnemonicGeneration";

export type MnemonicGenerationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; mnemonic: string }
  | { status: "error"; message: string };

export function useMnemonicGeneration() {
  const [state, setState] = useState<MnemonicGenerationState>({ status: "idle" });
  const requestId = useRef(0);

  const generate = useCallback(async (request: GenerateMnemonicRequest) => {
    const currentRequest = ++requestId.current;
    setState({ status: "loading" });

    try {
      const mnemonic = await generateMnemonic(request);
      if (currentRequest === requestId.current) {
        setState({ status: "success", mnemonic });
        return true;
      }
    } catch (error) {
      if (currentRequest === requestId.current) {
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "OpenAI could not generate a mnemonic. Try again.",
        });
      }
    }

    return false;
  }, []);

  const reset = useCallback(() => {
    requestId.current += 1;
    setState({ status: "idle" });
  }, []);

  return { generate, reset, state };
}
