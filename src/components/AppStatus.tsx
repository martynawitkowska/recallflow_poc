import type { AppInfo } from "../lib/appInfo";
import type { AsyncState } from "../lib/asyncState";

type AppStatusProps = {
  state: AsyncState<AppInfo>;
  onRetry: () => void;
};

export default function AppStatus({ state, onRetry }: AppStatusProps) {
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
