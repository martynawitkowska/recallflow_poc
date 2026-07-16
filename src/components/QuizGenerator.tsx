import { useQuizGeneration } from "../hooks/useQuizGeneration";
import {
  MAX_MATERIAL_CHARS,
  MAX_QUESTION_COUNT,
  MAX_SOURCE_URL_CHARS,
  MIN_QUESTION_COUNT,
  type AiProvider,
} from "../lib/quizGeneration";
import type { QuizFile } from "../lib/quizSchema";

type QuizGeneratorProps = {
  onSaveQuiz: (quiz: QuizFile) => Promise<void>;
};

export default function QuizGenerator({ onSaveQuiz }: QuizGeneratorProps) {
  const generation = useQuizGeneration(onSaveQuiz);
  const isLoading = generation.state.status === "loading";

  return (
    <section className="quiz-generator" aria-labelledby="quiz-generator-title">
      <header>
        <p className="eyebrow">AI quiz builder</p>
        <h2 id="quiz-generator-title">Generate from notes or a URL</h2>
        <p>
          Give RecallFlow study material or a public lecture or article page,
          then choose how many questions to generate.
        </p>
      </header>

      <form className="generation-form" noValidate onSubmit={generation.submit}>
        <div className="source-options" aria-label="Quiz source">
          <button
            aria-pressed={generation.sourceMode === "material"}
            disabled={isLoading}
            onClick={() => generation.setSourceMode("material")}
            type="button"
          >
            Paste notes
          </button>
          <button
            aria-pressed={generation.sourceMode === "url"}
            disabled={isLoading}
            onClick={() => generation.setSourceMode("url")}
            type="button"
          >
            Use a URL
          </button>
        </div>

        {generation.sourceMode === "material" ? (
          <>
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
          </>
        ) : (
          <>
            <label htmlFor="source-url">Lecture or article URL</label>
            <input
              disabled={isLoading}
              id="source-url"
              inputMode="url"
              maxLength={MAX_SOURCE_URL_CHARS + 1}
              onChange={(event) => generation.setSourceUrl(event.target.value)}
              placeholder="https://example.com/lecture"
              spellCheck={false}
              type="url"
              value={generation.sourceUrl}
            />
            <p className="field-hint">
              The page must be public and readable without signing in. OpenAI
              will use web search to access it.
            </p>
          </>
        )}

        <div className="generation-options">
          <div>
            <label htmlFor="quiz-provider">AI provider</label>
            <select
              disabled={isLoading}
              id="quiz-provider"
              onChange={(event) =>
                generation.setProvider(event.target.value as AiProvider)
              }
              value={generation.provider}
            >
              <option value="openai">OpenAI</option>
              <option disabled value="gemini">Google Gemini — coming soon</option>
              <option disabled value="anthropic">Anthropic — coming soon</option>
            </select>
          </div>
          <div>
            <label htmlFor="question-count">Questions</label>
            <input
              disabled={isLoading}
              id="question-count"
              max={MAX_QUESTION_COUNT}
              min={MIN_QUESTION_COUNT}
              onChange={(event) =>
                generation.setQuestionCount(Number(event.target.value))
              }
              step={1}
              type="number"
              value={generation.questionCount}
            />
          </div>
        </div>
        <p className="field-hint">
          OpenAI is available now. Additional providers will unlock after their
          integrations are enabled.
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
          Your source is sent to OpenAI only after you press Generate. The key
          is used for this request and is not saved.
        </p>

        <button className="primary-button" disabled={isLoading} type="submit">
          {isLoading ? "Generating…" : "Generate quiz"}
        </button>
      </form>

      <div className="generation-status" aria-live="polite">
        {generation.state.status === "loading" && (
          <p role="status">
            {generation.sourceMode === "url"
              ? "Reading the page and creating questions…"
              : "Creating questions from your material…"}
          </p>
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
            <ol className="generated-question-list">
              {generation.state.quiz.questions.map((question) => (
                <li key={question.id}>
                  <details>
                    <summary>{question.question}</summary>
                    <ul>
                      {question.answers.map((answer) => {
                        const isCorrect = question.correctAnswers.includes(answer);
                        return (
                          <li className={isCorrect ? "correct-answer" : ""} key={answer}>
                            {answer}{isCorrect ? " (correct)" : ""}
                          </li>
                        );
                      })}
                    </ul>
                    {question.explanation && (
                      <p><strong>Explanation:</strong> {question.explanation}</p>
                    )}
                  </details>
                </li>
              ))}
            </ol>
            <div className="generated-quiz-actions">
              <p className="draft-note">
                {generation.state.saveState.status === "saved"
                  ? "Saved to your local library."
                  : "Review each question before saving this draft."}
              </p>
              <button
                className="primary-button"
                disabled={
                  generation.state.saveState.status === "saving" ||
                  generation.state.saveState.status === "saved"
                }
                onClick={() => void generation.save()}
                type="button"
              >
                {generation.state.saveState.status === "saving"
                  ? "Saving…"
                  : generation.state.saveState.status === "saved"
                    ? "Saved"
                    : "Save to library"}
              </button>
            </div>
            {generation.state.saveState.status === "error" && (
              <p className="save-error" role="alert">
                {generation.state.saveState.message}
              </p>
            )}
          </article>
        )}
      </div>
    </section>
  );
}
