import { useEffect, useRef } from "react";

export type PreviewTutorialStep = {
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const isLastStep = stepIndex === stepCount - 1;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();

    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    titleRef.current?.focus();
  }, [stepIndex]);

  return (
    <dialog
      aria-describedby="preview-tutorial-description"
      aria-labelledby="preview-tutorial-title"
      className="preview-tutorial-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
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
    </dialog>
  );
}
