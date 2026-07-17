import { useCallback, useEffect, useRef, useState } from "react";
import AppNavigation, { type ViewKey } from "./components/AppNavigation";
import AppStatus from "./components/AppStatus";
import ConnectivityStatus from "./components/ConnectivityStatus";
import ExternalQuizReference from "./components/ExternalQuizReference";
import FileDropzone from "./components/FileDropzone";
import QuizGenerator from "./components/QuizGenerator";
import QuizLibrary from "./components/QuizLibrary";
import QuizSummary from "./components/QuizSummary";
import QuizSession from "./components/QuizSession";
import Settings from "./components/Settings";
import { useAppInfo } from "./hooks/useAppInfo";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import {
  useQuizFileImport,
  type ValidatedQuizFile,
} from "./hooks/useQuizFileImport";
import { useQuizLibrary } from "./hooks/useQuizLibrary";
import { useQuizAttemptSave } from "./hooks/useQuizAttemptSave";
import { useQuizAttempts } from "./hooks/useQuizAttempts";
import {
  createDefaultAppPreferences,
  parseAppPreferences,
} from "./lib/appPreferences";
import type { LibraryQuiz } from "./lib/quizLibrary";
import {
  createDefaultMnemonicModels,
  isMnemonicModelForProvider,
  isMnemonicProvider,
  type MnemonicModel,
  type MnemonicProvider,
} from "./lib/mnemonicProviders";
import type { QuizResult } from "./lib/quizResults";
import appLogo from "../src-tauri/icons/icon.png";

type ActiveView = ViewKey | "quiz" | "summary";
const APP_PREFERENCES_STORAGE_KEY = "recallflow-app-preferences";
const LEGACY_READING_FONT_STORAGE_KEY = "recallflow-reading-font";
const AI_SELECTION_STORAGE_KEY = "recallflow-ai-selection";

type AiSelection = {
  models: Record<MnemonicProvider, MnemonicModel>;
  provider: MnemonicProvider;
};

const loadAppPreferences = () => {
  try {
    return parseAppPreferences(
      window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY),
      window.localStorage.getItem(LEGACY_READING_FONT_STORAGE_KEY),
    );
  } catch {
    return createDefaultAppPreferences();
  }
};

const loadAiSelection = (): AiSelection => {
  const defaults: AiSelection = {
    models: createDefaultMnemonicModels(),
    provider: "openai",
  };

  try {
    const saved = JSON.parse(
      window.localStorage.getItem(AI_SELECTION_STORAGE_KEY) ?? "null",
    ) as { models?: Record<string, string>; provider?: string } | null;
    if (!saved) {
      return defaults;
    }

    const savedProvider = saved.provider ?? "";
    const provider = isMnemonicProvider(savedProvider)
      ? savedProvider
      : defaults.provider;
    const models = { ...defaults.models };
    const model = saved.models?.openai ?? "";
    if (isMnemonicModelForProvider("openai", model)) {
      models.openai = model;
    }

    return { models, provider };
  } catch {
    return defaults;
  }
};

export default function App() {
  const mainRef = useRef<HTMLElement>(null);
  const [activeView, setActiveView] = useState<ActiveView>("library");
  const previousViewRef = useRef<ActiveView>(activeView);
  const [activeQuiz, setActiveQuiz] = useState<LibraryQuiz | null>(null);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [repairMode, setRepairMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [appPreferences, setAppPreferences] = useState(loadAppPreferences);
  const [aiSelection, setAiSelection] = useState(loadAiSelection);
  const { state, retry } = useAppInfo();
  const isOnline = useOnlineStatus();
  const attemptSave = useQuizAttemptSave();
  const attempts = useQuizAttempts(activeView === "library");
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
    setFocusMode(appPreferences.startInFocusMode);
    setActiveView("quiz");
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(
        APP_PREFERENCES_STORAGE_KEY,
        JSON.stringify(appPreferences),
      );
    } catch {
      // The preferences still apply for the current session.
    }
  }, [appPreferences]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        AI_SELECTION_STORAGE_KEY,
        JSON.stringify(aiSelection),
      );
    } catch {
      // The selection still applies for the current session.
    }
  }, [aiSelection]);

  useEffect(() => {
    if (previousViewRef.current === activeView) {
      return;
    }

    previousViewRef.current = activeView;
    mainRef.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [activeView]);

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
      className={`app-shell font-${appPreferences.readingFont}${
        focusMode ? " focus-mode" : ""
      }`}
    >
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {!focusMode && (
        <header className="app-header">
          <button
            className="brand"
            onClick={() => navigate("library")}
            type="button"
          >
            <span className="brand-mark">
              <img alt="" height={28} src={appLogo} width={28} />
            </span>
            <span>
              <strong>RecallFlow</strong>
              <small>Local-first learning</small>
            </span>
          </button>
          <AppNavigation activeView={activeView} onNavigate={navigate} />
        </header>
      )}

      <ConnectivityStatus isOnline={isOnline} />

      <main
        className="app-content"
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
      >
        {activeView === "library" && (
          <section>
            <h1 tabIndex={-1}>Your library</h1>
            <p className="lede">Browse the quizzes ready for active recall.</p>
            <QuizLibrary
              attemptsState={attempts.state}
              onAddQuiz={() => navigate("import")}
              onClearQuizzes={library.clearQuizzes}
              onRemoveQuiz={library.removeQuiz}
              onRetry={library.retry}
              onRetryStatistics={attempts.retry}
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
            isOnline={isOnline}
            isRepair={repairMode}
            onExit={() => navigate("library")}
            onFinish={(result) => {
              setFocusMode(false);
              setQuizResult(result);
              setActiveView("summary");
              void attemptSave.save(activeQuiz.id, result);
            }}
            onFocusModeChange={setFocusMode}
            onSaveMnemonic={async (questionId, mnemonic) => {
              const savedMnemonic = await library.saveMnemonic(
                activeQuiz.id,
                questionId,
                mnemonic,
              );
              setActiveQuiz((current) =>
                current?.id === activeQuiz.id
                  ? {
                      ...current,
                      quiz: {
                        ...current.quiz,
                        questions: current.quiz.questions.map((question) =>
                          question.id === questionId
                            ? { ...question, mnemonic: savedMnemonic }
                            : question,
                        ),
                      },
                    }
                  : current,
              );
            }}
            mnemonicModel={aiSelection.models[aiSelection.provider]}
            mnemonicProvider={aiSelection.provider}
            quiz={activeQuiz}
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
              setFocusMode(appPreferences.startInFocusMode);
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
            <h1 tabIndex={-1}>Add a quiz</h1>
            <p className="lede">
              Import a local quiz, generate one from pasted material, or use an
              external AI chat.
            </p>
            <FileDropzone
              onFile={quizFileImport.importFile}
              state={quizFileImport.state}
            />
            <div className="import-divider"><span>or</span></div>
            <QuizGenerator
              isOnline={isOnline}
              onSaveQuiz={library.addGeneratedQuiz}
            />
            <ExternalQuizReference />
          </section>
        )}

        {activeView === "settings" && (
          <Settings
            model={aiSelection.models[aiSelection.provider]}
            onModelChange={(model) =>
              setAiSelection((current) => ({
                ...current,
                models: { ...current.models, [current.provider]: model },
              }))
            }
            onProviderChange={(provider) =>
              setAiSelection((current) => ({ ...current, provider }))
            }
            onReadingFontChange={(readingFont) =>
              setAppPreferences((current) => ({
                ...current,
                readingFont,
              }))
            }
            onStartInFocusModeChange={(startInFocusMode) =>
              setAppPreferences((current) => ({
                ...current,
                startInFocusMode,
              }))
            }
            provider={aiSelection.provider}
            readingFont={appPreferences.readingFont}
            startInFocusMode={appPreferences.startInFocusMode}
          />
        )}
      </main>
    </div>
  );
}
