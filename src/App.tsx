import { useCallback, useEffect, useRef, useState } from "react";
import AppNavigation, { type ViewKey } from "./components/AppNavigation";
import AppStatus from "./components/AppStatus";
import ConnectivityStatus from "./components/ConnectivityStatus";
import ExternalQuizReference from "./components/ExternalQuizReference";
import FileDropzone from "./components/FileDropzone";
import PreviewTutorial, {
  type PreviewTutorialStep,
} from "./components/PreviewTutorial";
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
import { isWebPreviewGenerationConfigured } from "./lib/quizGeneration";
import {
  markPreviewTutorialSeen,
  shouldShowPreviewTutorial,
} from "./lib/previewTutorial";
import { isPagesPreview } from "./lib/runtime";
import { WEB_PREVIEW_SEED_QUIZ_ID } from "./lib/webPreviewStorage";
import appLogo from "../src-tauri/icons/icon.png";

type ActiveView = ViewKey | "quiz" | "summary";
type PreviewTutorialStepWithView = PreviewTutorialStep & { view: ViewKey };

const PREVIEW_TUTORIAL_STEPS: readonly PreviewTutorialStepWithView[] = [
  {
    view: "library",
    title: "Start with the sample quiz",
    description:
      "The browser preview includes a short quiz so you can try active recall, answer feedback, and saved results straight away.",
  },
  {
    view: "import",
    title: "Add your own quiz",
    description: isWebPreviewGenerationConfigured
      ? "Import a RecallFlow JSON file or generate a quiz from pasted material. Live generation uses a limited server-side connection, so the preview never asks for an API key."
      : "Import a RecallFlow JSON file in this browser. AI quiz generation stays desktop-only, so the preview never asks for an API key.",
  },
  {
    view: "import",
    action: "copy-prompt",
    title: "Copy the generation prompt",
    description:
      "Copy RecallFlow's prompt into your preferred AI chat, add your study material, then download the generated recallflow-quiz.json file and import it here.",
  },
  {
    view: "settings",
    title: "Make study sessions comfortable",
    description:
      "Choose a reading font and decide whether quizzes start in Focus mode. Preview preferences stay only in this browser.",
  },
  {
    view: "library",
    title: "Ready to practise",
    description:
      "Return to the library and try the included sample quiz. Your answers and results remain on this device.",
  },
];
const APP_PREFERENCES_STORAGE_KEY = isPagesPreview
  ? "recallflow.pages.preferences.v1"
  : "recallflow-app-preferences";
const LEGACY_READING_FONT_STORAGE_KEY = "recallflow-reading-font";
const AI_SELECTION_STORAGE_KEY = isPagesPreview
  ? "recallflow.pages.ai-selection.v1"
  : "recallflow-ai-selection";

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
  const tourButtonRef = useRef<HTMLButtonElement>(null);
  const [activeView, setActiveView] = useState<ActiveView>("library");
  const previousViewRef = useRef<ActiveView>(activeView);
  const [activeQuiz, setActiveQuiz] = useState<LibraryQuiz | null>(null);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [repairMode, setRepairMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState<number | null>(
    () =>
      isPagesPreview && shouldShowPreviewTutorial()
        ? 0
        : null,
  );
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

  const showTutorialStep = useCallback(
    (stepIndex: number) => {
      const step = PREVIEW_TUTORIAL_STEPS[stepIndex];
      if (!step) return;
      navigate(step.view);
      setTutorialStepIndex(stepIndex);
    },
    [navigate],
  );

  const closeTutorial = useCallback((returnFocus = true) => {
    markPreviewTutorialSeen();
    setTutorialStepIndex(null);
    if (returnFocus) {
      window.requestAnimationFrame(() => tourButtonRef.current?.focus());
    }
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
    if (tutorialStepIndex === null) {
      mainRef.current?.querySelector<HTMLElement>("h1")?.focus();
    }
  }, [activeView, tutorialStepIndex]);

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
      }${tutorialStepIndex !== null ? " tutorial-open" : ""}`}
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
      {isPagesPreview && (
        <aside className="preview-banner" aria-label="Preview information">
          <strong>RecallFlow Web Preview</strong>
          <span>
            {isWebPreviewGenerationConfigured
              ? "Quizzes and results stay in this browser. Live quiz and mnemonic generation use a limited server-side connection."
              : "Your quizzes and results stay only in this browser. AI features are available in the desktop app."}
          </span>
          <button
            className="preview-tour-button"
            onClick={() => showTutorialStep(0)}
            ref={tourButtonRef}
            type="button"
          >
            Take the tour
          </button>
        </aside>
      )}

      {isPagesPreview && tutorialStepIndex !== null && (
        <PreviewTutorial
          onBack={() => showTutorialStep(tutorialStepIndex - 1)}
          onClose={() => closeTutorial()}
          onNext={() => {
            if (tutorialStepIndex < PREVIEW_TUTORIAL_STEPS.length - 1) {
              showTutorialStep(tutorialStepIndex + 1);
              return;
            }

            closeTutorial(false);
            const sampleQuiz =
              library.state.status === "success"
                ? library.state.quizzes.find(
                    (quiz) => quiz.id === WEB_PREVIEW_SEED_QUIZ_ID,
                  )
                : undefined;
            if (sampleQuiz) startQuiz(sampleQuiz);
            else navigate("library");
          }}
          step={PREVIEW_TUTORIAL_STEPS[tutorialStepIndex]}
          stepCount={PREVIEW_TUTORIAL_STEPS.length}
          stepIndex={tutorialStepIndex}
        />
      )}

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
              onClearQuizzes={async () => {
                await library.clearQuizzes();
                await attempts.retry();
              }}
              onRemoveQuiz={library.removeQuiz}
              onRetry={library.retry}
              onRetryStatistics={attempts.retry}
              onStartQuiz={startQuiz}
              onUpdateMetadata={library.updateMetadata}
              state={library.state}
            />
            <div className="desktop-status">
              <AppStatus state={state} onRetry={retry} />
            </div>
          </section>
        )}

        {activeView === "quiz" && activeQuiz && (
          <QuizSession
            aiAvailable={!isPagesPreview || isWebPreviewGenerationConfigured}
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
            {isPagesPreview && !isWebPreviewGenerationConfigured ? (
              <section className="preview-unavailable" aria-labelledby="preview-ai-title">
                <h2 id="preview-ai-title">AI quiz generation is desktop-only</h2>
                <p>
                  The jury preview does not accept API keys or send study
                  material to an AI provider. Import a quiz JSON file above to
                  try the complete study flow.
                </p>
              </section>
            ) : (
              <QuizGenerator
                isOnline={isOnline}
                model={aiSelection.models[aiSelection.provider]}
                onSaveQuiz={library.addGeneratedQuiz}
                webPreview={isPagesPreview}
              />
            )}
            <ExternalQuizReference />
          </section>
        )}

        {activeView === "settings" && (
          <Settings
            aiAvailable={!isPagesPreview}
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
            webQuizGenerationAvailable={isWebPreviewGenerationConfigured}
          />
        )}
      </main>
    </div>
  );
}
