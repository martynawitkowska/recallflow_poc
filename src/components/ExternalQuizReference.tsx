import { useCopyText, type CopyTextState } from "../hooks/useCopyText";
import {
  EXTERNAL_QUIZ_PROMPT,
  QUIZ_SCHEMA_REFERENCE,
} from "../lib/quizGenerationReference";

function CopyStatus({ state }: { state: CopyTextState }) {
  if (state.status === "idle" || state.status === "loading") {
    return state.status === "loading" ? <p role="status">Copying…</p> : null;
  }

  return (
    <p role={state.status === "error" ? "alert" : "status"}>
      {state.message}
    </p>
  );
}

export default function ExternalQuizReference() {
  const promptCopy = useCopyText(EXTERNAL_QUIZ_PROMPT, "Prompt");
  const schemaCopy = useCopyText(QUIZ_SCHEMA_REFERENCE, "JSON example");

  return (
    <section className="external-reference" aria-labelledby="external-reference-title">
      <header>
        <p className="eyebrow">Using another AI chat</p>
        <h2 id="external-reference-title">Generate a compatible quiz anywhere</h2>
        <p>
          RecallFlow does not send your material anywhere from this screen. Copy
          the prompt into your preferred AI chat, add your study material, then
          download its generated JSON file and import it above.
        </p>
      </header>

      <ol className="reference-steps">
        <li>Copy the prompt and paste it into ChatGPT, Claude, Gemini, or another AI chat.</li>
        <li>Add your notes, transcript, article text, or accessible video link.</li>
        <li>Download <strong>recallflow-quiz.json</strong> and import it here.</li>
      </ol>

      <article className="reference-card">
        <div className="reference-card-heading">
          <div>
            <h3>External generation prompt</h3>
            <p>Includes the exact format and validation rules RecallFlow expects.</p>
          </div>
          <button
            className="secondary-button"
            disabled={promptCopy.state.status === "loading"}
            onClick={() => void promptCopy.copy()}
            type="button"
          >
            {promptCopy.state.status === "loading" ? "Copying…" : "Copy prompt"}
          </button>
        </div>
        <pre className="reference-preview" tabIndex={0}>
          <code>{EXTERNAL_QUIZ_PROMPT}</code>
        </pre>
        <div className="copy-feedback" aria-live="polite">
          <CopyStatus state={promptCopy.state} />
        </div>
      </article>

      <article className="reference-card">
        <div className="reference-card-heading">
          <div>
            <h3>Quiz JSON example</h3>
            <p>A valid example covering every supported question type.</p>
          </div>
          <button
            className="secondary-button"
            disabled={schemaCopy.state.status === "loading"}
            onClick={() => void schemaCopy.copy()}
            type="button"
          >
            {schemaCopy.state.status === "loading" ? "Copying…" : "Copy example"}
          </button>
        </div>
        <pre className="reference-preview" tabIndex={0}>
          <code>{QUIZ_SCHEMA_REFERENCE}</code>
        </pre>
        <div className="copy-feedback" aria-live="polite">
          <CopyStatus state={schemaCopy.state} />
        </div>
      </article>
    </section>
  );
}
