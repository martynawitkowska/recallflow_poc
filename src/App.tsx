import AppStatus from "./components/AppStatus";
import { useAppInfo } from "./hooks/useAppInfo";

export default function App() {
  const { state, retry } = useAppInfo();

  return (
    <main>
      <p className="eyebrow">Local-first learning</p>
      <h1>RecallFlow</h1>
      <AppStatus state={state} onRetry={retry} />
    </main>
  );
}
