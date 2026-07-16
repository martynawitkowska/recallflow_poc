import type { LibraryQuiz } from "../hooks/useQuizLibrary";
import Icon from "./Icon";

type QuizLibraryProps = {
  quizzes: LibraryQuiz[];
  onAddQuiz: () => void;
};

export default function QuizLibrary({ quizzes, onAddQuiz }: QuizLibraryProps) {
  if (quizzes.length === 0) {
    return (
      <section className="library-empty">
        <span className="library-empty-icon">
          <Icon name="book" size={32} />
        </span>
        <h2>Your library is quiet</h2>
        <p>Import a validated quiz file to start your local study library.</p>
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
          {quizzes.length} quiz{quizzes.length === 1 ? "" : "zes"} in this
          session
        </p>
        <button className="primary-button" onClick={onAddQuiz} type="button">
          <Icon name="upload" size={16} />
          Add quiz
        </button>
      </div>
      <div className="library-grid">
        {quizzes.map((file) => (
          <article className="library-card" key={file.id}>
            <div className="library-card-top">
              <span className="library-card-icon">
                <Icon name="book" size={22} />
              </span>
              <span className="question-count">
                {file.quiz.questions.length} question
                {file.quiz.questions.length === 1 ? "" : "s"}
              </span>
            </div>
            <h2>{file.quiz.title}</h2>
            <p className="library-description">
              {file.quiz.description || "No quiz description provided."}
            </p>
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
                <dt>Imported</dt>
                <dd>{new Date(file.importedAt).toLocaleString()}</dd>
              </div>
            </dl>
            <details className="question-preview">
              <summary>Preview questions</summary>
              <ol>
                {file.quiz.questions.map((question) => (
                  <li key={question.id}>{question.question}</li>
                ))}
              </ol>
            </details>
          </article>
        ))}
      </div>
      <p className="session-note">
        Quizzes remain local to this app session until SQLite persistence is
        enabled.
      </p>
    </section>
  );
}
