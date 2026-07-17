import { useCallback, useEffect, useState } from "react";
import AppNavigation, { type ViewKey } from "./components/AppNavigation";
import AppStatus from "./components/AppStatus";
import ExternalQuizReference from "./components/ExternalQuizReference";
import FileDropzone from "./components/FileDropzone";
import Icon from "./components/Icon";
import QuizGenerator from "./components/QuizGenerator";
import QuizHistory from "./components/QuizHistory";
import QuizLibrary from "./components/QuizLibrary";
import QuizSummary from "./components/QuizSummary";
import QuizSession, {
  readingFontOptions,
  type ReadingFont,
} from "./components/QuizSession";
import { useAppInfo } from "./hooks/useAppInfo";
import {
  useQuizFileImport,
  type ValidatedQuizFile,
} from "./hooks/useQuizFileImport";
import { useQuizLibrary } from "./hooks/useQuizLibrary";
import { useQuizAttemptSave } from "./hooks/useQuizAttemptSave";
import { useQuizAttempts } from "./hooks/useQuizAttempts";
import type { LibraryQuiz } from "./lib/quizLibrary";
import type { QuizResult } from "./lib/quizResults";

type ActiveView = ViewKey | "quiz" | "summary";
const READING_FONT_STORAGE_KEY = "recallflow-reading-font";

const loadReadingFont = (): ReadingFont => {
  try {
    const saved = window.localStorage.getItem(READING_FONT_STORAGE_KEY);
    return readingFontOptions.some(({ value }) => value === saved)
      ? (saved as ReadingFont)
      : "sans";
  } catch {
    return "sans";
  }
};

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>("library");
  const [activeQuiz, setActiveQuiz] = useState<LibraryQuiz | null>(null);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [repairMode, setRepairMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [readingFont, setReadingFont] = useState(loadReadingFont);
  const { state, retry } = useAppInfo();
  const attemptSave = useQuizAttemptSave();
  const attempts = useQuizAttempts(activeView === "history");
  const library = useQuizLibrary();
  const navigate = useCallback((view: ViewKey) => {
    setFocusMode(false);
    setActiveQuiz(null);
    setQuizResult(null);
    setRepairMode(false);
    setActiveView(view);
  }, []);

  const startQuiz = (quiz: LibraryQuiz, questionIds: readonly string[] = []) => {
    const questions = questionIds.length
      ? quiz.quiz.questions.filter((question) =>
          questionIds.includes(question.id),
        )
      : quiz.quiz.questions;

    if (questions.length === 0) {
      return;
    }

    setRepairMode(questionIds.length > 0);
    setActiveQuiz({ ...quiz, quiz: { ...quiz.quiz, questions } });
    setQuizResult(null);
    setActiveView("quiz");
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(READING_FONT_STORAGE_KEY, readingFont);
    } catch {
      // The preference still applies for the current session.
    }
  }, [readingFont]);
  const handleImported = useCallback(
    async (file: ValidatedQuizFile) => {
      await library.addQuiz(file);
      navigate("library");
    },
    [library.addQuiz, navigate],
  );
  const quizFileImport = useQuizFileImport(handleImported);

  return (
    <div
      className={`app-shell font-${readingFont}${focusMode ? " focus-mode" : ""}`}
    >
      {!focusMode && (
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
      )}

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
              onStartQuiz={startQuiz}
              state={library.state}
            />
            <div className="desktop-status">
              <AppStatus state={state} onRetry={retry} />
            </div>
          </section>
        )}

        {activeView === "quiz" && activeQuiz && (
          <QuizSession
            focusMode={focusMode}
            isRepair={repairMode}
            onExit={() => navigate("library")}
            onFinish={(result) => {
              setFocusMode(false);
              setQuizResult(result);
              setActiveView("summary");
              void attemptSave.save(activeQuiz.id, result);
            }}
            onFocusModeChange={setFocusMode}
            onReadingFontChange={setReadingFont}
            onSaveMnemonic={(questionId, mnemonic) =>
              library.saveMnemonic(activeQuiz.id, questionId, mnemonic)
            }
            quiz={activeQuiz}
            readingFont={readingFont}
          />
        )}

        {activeView === "history" && (
          <QuizHistory
            onRetry={attempts.retry}
            quizzes={
              library.state.status === "success" ? library.state.quizzes : []
            }
            state={attempts.state}
          />
        )}

        {activeView === "summary" && activeQuiz && quizResult && (
          <QuizSummary
            isRepair={repairMode}
            onBackToLibrary={() => navigate("library")}
            onRepair={() =>
              startQuiz(
                activeQuiz,
                quizResult.details
                  .filter((detail) => !detail.correct)
                  .map((detail) => detail.questionId),
              )
            }
            onRestart={() => {
              setQuizResult(null);
              setActiveView("quiz");
            }}
            onRetrySave={attemptSave.retry}
            quizTitle={activeQuiz.quiz.title}
            result={quizResult}
            saveState={attemptSave.state}
          />
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
