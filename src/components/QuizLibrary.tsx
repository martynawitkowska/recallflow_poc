import { useState, type FormEvent } from "react";
import type { QuizAttemptsState } from "../hooks/useQuizAttempts";
import type { QuizLibraryState } from "../hooks/useQuizLibrary";
import type { LibraryQuiz } from "../lib/quizLibrary";
import { MAX_LECTURE_TITLE_CHARS } from "../lib/quizGeneration";
import { MAX_VIDEO_URL_CHARS } from "../lib/quizSchema";
import ExternalLink from "./ExternalLink";
import Icon from "./Icon";
import QuizStatisticsModal from "./QuizStatisticsModal";

type QuizLibraryProps = {
  attemptsState: QuizAttemptsState;
  onAddQuiz: () => void;
  onClearQuizzes: () => Promise<void>;
  onRemoveQuiz: (quizId: string) => Promise<void>;
  onRetry: () => Promise<void>;
  onRetryStatistics: () => Promise<void>;
  onStartQuiz: (quiz: LibraryQuiz) => void;
  onUpdateMetadata: (quizId: string, title: string, videoUrl: string) => Promise<void>;
  state: QuizLibraryState;
};

type ManagementFeedback = {
  kind: "success" | "error";
  message: string;
};

const actionErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "RecallFlow could not update the local quiz library. Restart the app and try again.";

export default function QuizLibrary({
  attemptsState,
  state,
  onAddQuiz,
  onClearQuizzes,
  onRemoveQuiz,
  onRetry,
  onRetryStatistics,
  onStartQuiz,
  onUpdateMetadata,
}: QuizLibraryProps) {
  const [managementFeedback, setManagementFeedback] =
    useState<ManagementFeedback | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [confirmingQuizId, setConfirmingQuizId] = useState<string | null>(null);
  const [statisticsQuiz, setStatisticsQuiz] = useState<LibraryQuiz | null>(null);
  const [editingMetadata, setEditingMetadata] = useState<{
    quizId: string;
    title: string;
    videoUrl: string;
  } | null>(null);

  const removeQuiz = async (file: LibraryQuiz) => {
    setPendingAction(file.id);
    setConfirmingQuizId(null);
    setManagementFeedback(null);
    try {
      await onRemoveQuiz(file.id);
      setManagementFeedback({
        kind: "success",
        message: `${file.quiz.title} was removed from the library.`,
      });
    } catch (error) {
      setManagementFeedback({ kind: "error", message: actionErrorMessage(error) });
    } finally {
      setPendingAction(null);
    }
  };

  const clearLibrary = async () => {
    setPendingAction("clear");
    setConfirmingClear(false);
    setManagementFeedback(null);
    try {
      await onClearQuizzes();
      setManagementFeedback({
        kind: "success",
        message: "The local library was cleared.",
      });
    } catch (error) {
      setManagementFeedback({ kind: "error", message: actionErrorMessage(error) });
    } finally {
      setPendingAction(null);
    }
  };

  const saveMetadata = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingMetadata) return;
    setPendingAction(`metadata:${editingMetadata.quizId}`);
    setManagementFeedback(null);
    try {
      await onUpdateMetadata(
        editingMetadata.quizId,
        editingMetadata.title,
        editingMetadata.videoUrl,
      );
      setManagementFeedback({ kind: "success", message: "Quiz details were updated." });
      setEditingMetadata(null);
    } catch (error) {
      setManagementFeedback({ kind: "error", message: actionErrorMessage(error) });
    } finally {
      setPendingAction(null);
    }
  };

  if (state.status === "loading") {
    return (
      <section className="library-empty" aria-busy="true">
        <span className="library-empty-icon">
          <Icon name="book" size={32} />
        </span>
        <h2>Loading your library</h2>
        <p role="status">Reading quizzes stored on this device…</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="library-empty">
        <span className="library-empty-icon">
          <Icon name="book" size={32} />
        </span>
        <h2>Your library could not be loaded</h2>
        <p role="alert">{state.message}</p>
        <button
          className="primary-button"
          onClick={() => void onRetry()}
          type="button"
        >
          Try again
        </button>
      </section>
    );
  }

  const { quizzes } = state;
  const feedback = managementFeedback && (
    <p
      className={`management-status ${
        managementFeedback.kind === "error" ? "management-status-error" : ""
      }`}
      role={managementFeedback.kind === "error" ? "alert" : "status"}
    >
      {managementFeedback.message}
    </p>
  );

  if (quizzes.length === 0) {
    return (
      <section className="library-empty">
        <span className="library-empty-icon">
          <Icon name="book" size={32} />
        </span>
        <h2>Your library is quiet</h2>
        <p>Import or generate a quiz to start your local study library.</p>
        {feedback}
        <button className="primary-button" onClick={onAddQuiz} type="button">
          <Icon name="upload" size={16} />
          Add a quiz
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Quiz library">
      <div className="library-heading">
        <p>
          {quizzes.length} quiz{quizzes.length === 1 ? "" : "zes"} stored
          locally
        </p>
        <div className="library-heading-actions">
          {confirmingClear ? (
            <>
              <button
                className="secondary-button"
                disabled={pendingAction !== null}
                onClick={() => setConfirmingClear(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={pendingAction !== null}
                onClick={() => void clearLibrary()}
                type="button"
              >
                Confirm clear
              </button>
            </>
          ) : (
            <button
              className="danger-button"
              disabled={pendingAction !== null}
              onClick={() => setConfirmingClear(true)}
              type="button"
            >
              <Icon name="trash" size={16} />
              {pendingAction === "clear" ? "Clearing…" : "Clear library"}
            </button>
          )}
          <button className="primary-button" onClick={onAddQuiz} type="button">
            <Icon name="upload" size={16} />
            Add quiz
          </button>
        </div>
      </div>
      {feedback}
      <div className="library-grid">
        {quizzes.map((file) => (
          <article className="library-card" key={file.id}>
            <div className="library-card-summary">
              <div>
                <h2>{file.quiz.title}</h2>
                <p className="library-description">
                  {file.quiz.description || "No quiz description provided."}
                </p>
                {file.quiz.videoUrl && (
                  <ExternalLink href={file.quiz.videoUrl}>
                    Link to lecture video
                  </ExternalLink>
                )}
              </div>
              <span className="question-count">
                {file.quiz.questions.length} question
                {file.quiz.questions.length === 1 ? "" : "s"}
              </span>
            </div>
            {editingMetadata?.quizId === file.id && (
              <form className="library-metadata-form" onSubmit={(event) => void saveMetadata(event)}>
                <label htmlFor={`metadata-title-${file.id}`}>Quiz title</label>
                <input
                  disabled={pendingAction !== null}
                  id={`metadata-title-${file.id}`}
                  maxLength={MAX_LECTURE_TITLE_CHARS + 1}
                  onChange={(event) =>
                    setEditingMetadata({ ...editingMetadata, title: event.target.value })
                  }
                  required
                  type="text"
                  value={editingMetadata.title}
                />
                <label htmlFor={`metadata-video-${file.id}`}>
                  Lecture video URL (optional)
                </label>
                <input
                  disabled={pendingAction !== null}
                  id={`metadata-video-${file.id}`}
                  inputMode="url"
                  maxLength={MAX_VIDEO_URL_CHARS + 1}
                  onChange={(event) =>
                    setEditingMetadata({ ...editingMetadata, videoUrl: event.target.value })
                  }
                  placeholder="https://www.youtube.com/watch?v=…"
                  spellCheck={false}
                  type="url"
                  value={editingMetadata.videoUrl}
                />
                <div className="library-metadata-form-actions">
                  <button
                    className="secondary-button"
                    disabled={pendingAction !== null}
                    onClick={() => setEditingMetadata(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button className="primary-button" disabled={pendingAction !== null} type="submit">
                    {pendingAction === `metadata:${file.id}` ? "Saving…" : "Save details"}
                  </button>
                </div>
              </form>
            )}
            <dl className="library-metadata">
              <div>
                <dt>Source</dt>
                <dd title={file.name}>{file.name}</dd>
              </div>
              <div>
                <dt>File size</dt>
                <dd>
                  {file.size < 1024
                    ? `${file.size} B`
                    : `${(file.size / 1024).toFixed(1)} KB`}
                </dd>
              </div>
              <div>
                <dt>Added</dt>
                <dd>{new Date(file.importedAt).toLocaleString()}</dd>
              </div>
            </dl>
            <div className="library-card-footer">
              <details className="question-preview">
                <summary>Preview questions</summary>
                <ol>
                  {file.quiz.questions.map((question) => (
                    <li key={question.id}>{question.question}</li>
                  ))}
                </ol>
              </details>
              <div className="library-card-actions">
                <button
                  className="primary-button"
                  disabled={pendingAction !== null}
                  onClick={() => onStartQuiz(file)}
                  type="button"
                >
                  Start quiz
                </button>
                <button
                  aria-label={`Statistics for ${file.quiz.title}`}
                  className="secondary-button"
                  disabled={pendingAction !== null}
                  onClick={() => setStatisticsQuiz(file)}
                  type="button"
                >
                  Statistics
                </button>
                <button
                  aria-label={`Edit quiz details for ${file.quiz.title}`}
                  className="secondary-button"
                  disabled={pendingAction !== null}
                  onClick={() => {
                    setConfirmingQuizId(null);
                    setEditingMetadata({
                      quizId: file.id,
                      title: file.quiz.title,
                      videoUrl: file.quiz.videoUrl ?? "",
                    });
                  }}
                  type="button"
                >
                  Edit quiz details
                </button>
                {confirmingQuizId === file.id ? (
                  <>
                    <button
                      className="secondary-button"
                      disabled={pendingAction !== null}
                      onClick={() => setConfirmingQuizId(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="danger-button"
                      disabled={pendingAction !== null}
                      onClick={() => void removeQuiz(file)}
                      type="button"
                    >
                      Confirm remove
                    </button>
                  </>
                ) : (
                  <button
                    aria-label={`Remove ${file.quiz.title}`}
                    className="danger-button"
                    disabled={pendingAction !== null}
                    onClick={() => setConfirmingQuizId(file.id)}
                    type="button"
                  >
                    <Icon name="trash" size={15} />
                    Remove
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {statisticsQuiz && (
        <QuizStatisticsModal
          onClose={() => setStatisticsQuiz(null)}
          onRetry={onRetryStatistics}
          quiz={statisticsQuiz}
          state={attemptsState}
        />
      )}
      <p className="session-note">Quizzes are stored locally on this device.</p>
    </section>
  );
}
