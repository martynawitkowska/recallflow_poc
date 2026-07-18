import { useEffect, useRef } from "react";
import { useCopyText } from "../hooks/useCopyText";
import { EXTERNAL_QUIZ_PROMPT } from "../lib/quizGenerationReference";

export type PreviewTutorialStep = {
  action?: "copy-prompt";
  description: string;
  title: string;
};

type PreviewTutorialProps = {
  onBack: () => void;
  onClose: () => void;
  onNext: () => void;
  step: PreviewTutorialStep;
  stepCount: number;
  stepIndex: number;
};

export default function PreviewTutorial({
  onBack,
  onClose,
  onNext,
  step,
  stepCount,
  stepIndex,
}: PreviewTutorialProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const isLastStep = stepIndex === stepCount - 1;
  const promptCopy = useCopyText(EXTERNAL_QUIZ_PROMPT, "Prompt");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    titleRef.current?.focus();
  }, [stepIndex]);

  useEffect(() => {
    if (step.action !== "copy-prompt") return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById("external-prompt-actions");
      if (!target) return;
      target.scrollIntoView({ block: "start" });

      const scrollBoundary = document.querySelector(
        window.matchMedia("(max-width: 52rem)").matches
          ? ".preview-tutorial-panel"
          : ".app-header",
      );
      if (scrollBoundary) {
        window.scrollBy({
          top:
            target.getBoundingClientRect().top -
            scrollBoundary.getBoundingClientRect().bottom,
        });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [step.action]);

  return (
    <aside
      aria-describedby="preview-tutorial-description"
      aria-labelledby="preview-tutorial-title"
      className={`preview-tutorial-panel${
        step.action === "copy-prompt" ? " preview-tutorial-panel-copy" : ""
      }`}
    >
      <div className="preview-tutorial-header">
        <div>
          <strong>Welcome to RecallFlow</strong>
          <p aria-live="polite">
            Step {stepIndex + 1} of {stepCount}
          </p>
        </div>
        <button
          aria-label="Close walkthrough"
          className="preview-tutorial-close"
          onClick={onClose}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div className="preview-tutorial-body">
        <h2 id="preview-tutorial-title" ref={titleRef} tabIndex={-1}>
          {step.title}
        </h2>
        <p id="preview-tutorial-description">{step.description}</p>
        {step.action === "copy-prompt" && (
          <div className="preview-tutorial-copy-action">
            <button
              className="secondary-button"
              disabled={promptCopy.state.status === "loading"}
              onClick={() => void promptCopy.copy()}
              type="button"
            >
              {promptCopy.state.status === "loading"
                ? "Copying…"
                : "Copy generation prompt"}
            </button>
            {promptCopy.state.status !== "idle" &&
              promptCopy.state.status !== "loading" && (
                <p
                  role={promptCopy.state.status === "error" ? "alert" : "status"}
                >
                  {promptCopy.state.message}
                </p>
              )}
          </div>
        )}
        <progress
          aria-label={`Walkthrough progress: step ${stepIndex + 1} of ${stepCount}`}
          max={stepCount}
          value={stepIndex + 1}
        />
      </div>

      <div className="preview-tutorial-actions">
        <button className="preview-tutorial-skip" onClick={onClose} type="button">
          Skip
        </button>
        <div className="preview-tutorial-navigation">
          <button
            className="secondary-button"
            disabled={stepIndex === 0}
            onClick={onBack}
            type="button"
          >
            Back
          </button>
          <button className="primary-button" onClick={onNext} type="button">
            {isLastStep ? "Try the sample quiz" : "Next"}
          </button>
        </div>
      </div>
    </aside>
  );
}
