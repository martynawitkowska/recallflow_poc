import type { AppInfo } from "../lib/appInfo";
import type { AsyncState } from "../lib/asyncState";
import { isPagesPreview } from "../lib/runtime";

type AppStatusProps = {
  state: AsyncState<AppInfo>;
  onRetry: () => void;
};

export default function AppStatus({ state, onRetry }: AppStatusProps) {
  if (isPagesPreview) {
    return (
      <p role="status">
        GitHub Pages jury preview is ready. Quizzes and results are stored only
        in this browser.
      </p>
    );
  }

  if (state.status === "loading") {
    return <p role="status">Connecting to the RecallFlow desktop app…</p>;
  }

  if (state.status === "error") {
    return (
      <section className="status-card" role="alert">
        <h2>Desktop connection unavailable</h2>
        <p>{state.message}</p>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </section>
    );
  }

  return (
    <p role="status">
      {state.data.name} {state.data.version} desktop foundation is ready.
    </p>
  );
}
