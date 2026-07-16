import { useQuizGeneration } from "../hooks/useQuizGeneration";
import { MAX_MATERIAL_CHARS } from "../lib/quizGeneration";

export default function QuizGenerator() {
  const generation = useQuizGeneration();
  const isLoading = generation.state.status === "loading";

  return (
    <section className="quiz-generator" aria-labelledby="quiz-generator-title">
      <header>
        <p className="eyebrow">AI quiz builder</p>
        <h2 id="quiz-generator-title">Generate from notes</h2>
        <p>
          Paste study material and RecallFlow will ask OpenAI for an
          eight-question quiz.
        </p>
      </header>

      <form className="generation-form" onSubmit={generation.submit}>
        <label htmlFor="study-material">Study material</label>
        <textarea
          disabled={isLoading}
          id="study-material"
          maxLength={MAX_MATERIAL_CHARS + 1}
          onChange={(event) => generation.setMaterial(event.target.value)}
          placeholder="Paste notes, a transcript, or article text…"
          rows={10}
          value={generation.material}
        />
        <p className="field-hint character-count">
          {generation.material.length.toLocaleString()} /{" "}
          {MAX_MATERIAL_CHARS.toLocaleString()} characters
        </p>

        <label htmlFor="openai-api-key">OpenAI API key</label>
        <input
          autoComplete="off"
          disabled={isLoading}
          id="openai-api-key"
          onChange={(event) => generation.setApiKey(event.target.value)}
          placeholder="sk-…"
          spellCheck={false}
          type="password"
          value={generation.apiKey}
        />
        <p className="field-hint">
          Your material is sent to OpenAI only after you press Generate. The
          key is used for this request and is not saved.
        </p>

        <button className="primary-button" disabled={isLoading} type="submit">
          {isLoading ? "Generating…" : "Generate quiz"}
        </button>
      </form>

      <div className="generation-status" aria-live="polite">
        {generation.state.status === "loading" && (
          <p role="status">Creating questions from your material…</p>
        )}
        {generation.state.status === "error" && (
          <p role="alert">{generation.state.message}</p>
        )}
        {generation.state.status === "success" && (
          <article className="generated-quiz">
            <div className="generated-quiz-heading">
              <div>
                <p className="eyebrow">Generated draft</p>
                <h3>{generation.state.quiz.title}</h3>
              </div>
              <span>{generation.state.quiz.questions.length} questions</span>
            </div>
            {generation.state.quiz.description && (
              <p>{generation.state.quiz.description}</p>
            )}
            <ol>
              {generation.state.quiz.questions.map((question) => (
                <li key={question.id}>{question.question}</li>
              ))}
            </ol>
            <p className="draft-note">
              Review the questions here. This draft is not saved yet.
            </p>
          </article>
        )}
      </div>
    </section>
  );
}
