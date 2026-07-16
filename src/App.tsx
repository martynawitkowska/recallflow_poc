import { useCallback, useState } from "react";
import AppNavigation, { type ViewKey } from "./components/AppNavigation";
import AppStatus from "./components/AppStatus";
import ExternalQuizReference from "./components/ExternalQuizReference";
import FileDropzone from "./components/FileDropzone";
import Icon from "./components/Icon";
import QuizGenerator from "./components/QuizGenerator";
import QuizLibrary from "./components/QuizLibrary";
import QuizSession from "./components/QuizSession";
import { useAppInfo } from "./hooks/useAppInfo";
import {
  useQuizFileImport,
  type ValidatedQuizFile,
} from "./hooks/useQuizFileImport";
import { useQuizLibrary } from "./hooks/useQuizLibrary";
import type { LibraryQuiz } from "./lib/quizLibrary";

type ActiveView = ViewKey | "quiz";

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>("library");
  const [activeQuiz, setActiveQuiz] = useState<LibraryQuiz | null>(null);
  const { state, retry } = useAppInfo();
  const library = useQuizLibrary();
  const navigate = useCallback((view: ViewKey) => {
    setActiveQuiz(null);
    setActiveView(view);
  }, []);
  const handleImported = useCallback(
    async (file: ValidatedQuizFile) => {
      await library.addQuiz(file);
      navigate("library");
    },
    [library.addQuiz, navigate],
  );
  const quizFileImport = useQuizFileImport(handleImported);

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          className="brand"
          onClick={() => navigate("library")}
          type="button"
        >
          <span className="brand-mark"><Icon name="logo" size={26} /></span>
          <span>
            <strong>RecallFlow</strong>
            <small>Local-first learning</small>
          </span>
        </button>
        <AppNavigation activeView={activeView} onNavigate={navigate} />
      </header>

      <main className="app-content">
        {activeView === "library" && (
          <section>
            <p className="eyebrow">Your study system</p>
            <h1>Library</h1>
            <p className="lede">Browse the quizzes ready for active recall.</p>
            <QuizLibrary
              onAddQuiz={() => navigate("import")}
              onClearQuizzes={library.clearQuizzes}
              onRemoveQuiz={library.removeQuiz}
              onRetry={library.retry}
              onStartQuiz={(quiz) => {
                setActiveQuiz(quiz);
                setActiveView("quiz");
              }}
              state={library.state}
            />
            <div className="desktop-status">
              <AppStatus state={state} onRetry={retry} />
            </div>
          </section>
        )}

        {activeView === "quiz" && activeQuiz && (
          <QuizSession quiz={activeQuiz} onExit={() => navigate("library")} />
        )}

        {activeView === "import" && (
          <section className="narrow-page">
            <p className="eyebrow">Add study material</p>
            <h1>Add a quiz</h1>
            <p className="lede">
              Import a local quiz, generate one from pasted material, or use an
              external AI chat.
            </p>
            <FileDropzone
              onFile={quizFileImport.importFile}
              state={quizFileImport.state}
            />
            <div className="import-divider"><span>or</span></div>
            <QuizGenerator onSaveQuiz={library.addGeneratedQuiz} />
            <ExternalQuizReference />
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
