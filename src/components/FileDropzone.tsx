import { useState, type ChangeEvent, type DragEvent } from "react";
import type { QuizFileImportState } from "../hooks/useQuizFileImport";
import Icon from "./Icon";

type FileDropzoneProps = {
  state: QuizFileImportState;
  onFile: (file: File) => void;
};

export default function FileDropzone({ state, onFile }: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);

  const selectFirstFile = (files: FileList | null) => {
    const file = files?.[0];
    if (file) {
      onFile(file);
    }
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    selectFirstFile(event.currentTarget.files);
    event.currentTarget.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    selectFirstFile(event.dataTransfer.files);
  };

  const success = state.status === "success";

  return (
    <div
      className={`drop-zone${dragging ? " dragging" : ""}${success ? " success" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <span className="drop-zone-icon">
        <Icon name={success ? "check" : "upload"} size={30} />
      </span>
      <div>
        <h2>{success ? "Quiz validated" : "Drop a quiz JSON file"}</h2>
        <p>Choose one local JSON file. RecallFlow validates it only on this device.</p>
      </div>
      <label className="file-picker">
        Browse files
        <input
          accept=".json,application/json"
          disabled={state.status === "loading"}
          onChange={handleInput}
          type="file"
        />
      </label>

      <div className="import-status" aria-live="polite">
        {state.status === "empty" && <p>No file selected.</p>}
        {state.status === "loading" && <p>Reading {state.fileName}…</p>}
        {state.status === "success" && (
          <p>
            <strong>{state.data.quiz.title}</strong> is ready with{" "}
            {state.data.quiz.questions.length} question
            {state.data.quiz.questions.length === 1 ? "" : "s"} from {state.data.name}.
          </p>
        )}
        {state.status === "error" && (
          <p role="alert">
            <strong>{state.fileName}</strong>: {state.message}
          </p>
        )}
      </div>
    </div>
  );
}
