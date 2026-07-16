import { useCallback, useEffect, useRef, useState } from "react";

export type CopyTextState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function useCopyText(text: string, label: string) {
  const [state, setState] = useState<CopyTextState>({ status: "idle" });
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    window.clearTimeout(resetTimer.current);
    setState({ status: "loading" });
    let operationTimer: number | undefined;

    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise<never>((_, reject) => {
          operationTimer = window.setTimeout(reject, 2_000);
        }),
      ]);
      setState({ status: "success", message: `${label} copied.` });
      resetTimer.current = window.setTimeout(
        () => setState({ status: "idle" }),
        2_000,
      );
    } catch {
      setState({
        status: "error",
        message: `${label} could not be copied. Select the text below and copy it manually.`,
      });
    } finally {
      window.clearTimeout(operationTimer);
    }
  }, [label, text]);

  return { state, copy };
}
