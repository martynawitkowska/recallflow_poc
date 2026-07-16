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
            <span className="library-card-icon">
              <Icon name="book" size={22} />
            </span>
            <p className="library-file-name">{file.name}</p>
            <h2>{file.quiz.title}</h2>
            <p>
              {file.quiz.questions.length} question
              {file.quiz.questions.length === 1 ? "" : "s"}
            </p>
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
