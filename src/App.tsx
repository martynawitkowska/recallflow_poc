import { useState } from "react";
import AppNavigation, { type ViewKey } from "./components/AppNavigation";
import AppStatus from "./components/AppStatus";
import Icon from "./components/Icon";
import { useAppInfo } from "./hooks/useAppInfo";

export default function App() {
  const [activeView, setActiveView] = useState<ViewKey>("library");
  const { state, retry } = useAppInfo();

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          className="brand"
          onClick={() => setActiveView("library")}
          type="button"
        >
          <span className="brand-mark"><Icon name="logo" size={26} /></span>
          <span>
            <strong>RecallFlow</strong>
            <small>Local-first learning</small>
          </span>
        </button>
        <AppNavigation activeView={activeView} onNavigate={setActiveView} />
      </header>

      <main className="app-content">
        {activeView === "library" && (
          <section>
            <p className="eyebrow">Your study system</p>
            <h1>Library</h1>
            <p className="lede">Your saved quizzes will be ready here.</p>
            <AppStatus state={state} onRetry={retry} />
          </section>
        )}

        {activeView === "import" && (
          <section>
            <p className="eyebrow">Add study material</p>
            <h1>Add a quiz</h1>
            <p className="lede">
              Quiz importing will be available in the next foundation step.
            </p>
          </section>
        )}

        {activeView === "settings" && (
          <section>
            <p className="eyebrow">Provider configuration</p>
            <h1>AI settings</h1>
            <p className="lede">
              Provider settings will be available when AI features are enabled.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
