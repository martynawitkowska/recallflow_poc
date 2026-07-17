import { useCallback, useEffect, useRef, useState } from "react";

export type MnemonicSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

export function useMnemonicSave(
  onSave: (questionId: string, mnemonic: string) => Promise<void>,
) {
  const [state, setState] = useState<MnemonicSaveState>({ status: "idle" });
  const requestId = useRef(0);
  const activeRequest = useRef<number | null>(null);

  const reset = useCallback(() => {
    requestId.current += 1;
    activeRequest.current = null;
    setState({ status: "idle" });
  }, []);

  useEffect(
    () => () => {
      requestId.current += 1;
      activeRequest.current = null;
    },
    [],
  );

  const save = useCallback(async (questionId: string, mnemonic: string) => {
    if (activeRequest.current !== null) {
      return;
    }

    const normalizedMnemonic = mnemonic.trim();
    if (!normalizedMnemonic) {
      setState({
        status: "error",
        message: "Generate a mnemonic before saving it.",
      });
      return;
    }

    const currentRequest = ++requestId.current;
    activeRequest.current = currentRequest;
    setState({ status: "saving" });

    try {
      await onSave(questionId, normalizedMnemonic);
      if (currentRequest === requestId.current) {
        setState({ status: "saved" });
      }
    } catch (error) {
      if (currentRequest === requestId.current) {
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "RecallFlow could not save this mnemonic locally. Try again.",
        });
      }
    } finally {
      if (activeRequest.current === currentRequest) {
        activeRequest.current = null;
      }
    }
  }, [onSave]);

  return { reset, save, state };
}
