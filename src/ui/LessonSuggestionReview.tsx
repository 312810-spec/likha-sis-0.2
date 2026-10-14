import { useState } from "react";
import type { LessonSuggestion } from "../domain/lesson-suggestion";
import { ValidationError } from "../domain/errors";
import { Alert } from "./components/Alert";

interface Props {
  raw: string;
  onRawChange: (raw: string) => void;
  onApply: (suggestion: LessonSuggestion) => void;
  onStage: (raw: string) => LessonSuggestion;
  disabled: boolean;
}

/** Local review only: no provider, transmission, generation, or automatic save. */
export function LessonSuggestionReview({ raw, onRawChange, onApply, onStage, disabled }: Props) {
  const [staged, setStaged] = useState<{ raw: string; fields: LessonSuggestion } | null>(null);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = staged?.raw === raw ? staged.fields : null;
  return (
    <details>
      <summary>Review an external AI-assisted planning draft</summary>
      <p id="lesson-suggestion-help" className="muted">
        LIKHA does not generate or send anything to an AI provider here. Paste only a planning
        suggestion you obtained separately; do not paste learner records or personal data.
        Competencies, codes, source references and applicability remain teacher-entered.
      </p>
      <p className="muted">
        JSON fields: learningObjectives, connectionToPreviousLearning, learningExperiences,
        assessment, waysForward. Each must be a string; the connection and ways forward may be
        empty.
      </p>
      <label htmlFor="lesson-suggestion-json">External planning draft JSON</label>
      <textarea
        id="lesson-suggestion-json"
        aria-describedby="lesson-suggestion-help"
        value={raw}
        maxLength={24000}
        disabled={disabled}
        onChange={(event) => {
          setStaged(null);
          setApproved(false);
          setError(null);
          onRawChange(event.target.value);
        }}
      />
      <button
        type="button"
        disabled={disabled || !raw.trim()}
        onClick={() => {
          setApproved(false);
          setStaged(null);
          try {
            setStaged({ raw, fields: onStage(raw) });
            setError(null);
          } catch (err) {
            setError(err instanceof ValidationError ? err.message : "Could not stage this draft.");
          }
        }}
      >
        Stage draft for review
      </button>
      {error && <Alert tone="error">{error}</Alert>}
      {current && (
        <section aria-label="External draft review">
          <h3>Review before replacing planning fields</h3>
          <dl>
            {Object.entries(current).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value || "Blank"}</dd>
              </div>
            ))}
          </dl>
          <label>
            <input
              type="checkbox"
              checked={approved}
              disabled={disabled}
              onChange={(event) => setApproved(event.target.checked)}
            />
            I reviewed this suggestion against my approved sources and authorize replacing these
            five planning fields in this unsaved draft.
          </label>
          <button
            type="button"
            disabled={disabled || !approved}
            onClick={() => {
              if (!current || !approved || disabled) return;
              onApply(current);
              setStaged(null);
              setApproved(false);
            }}
          >
            Apply reviewed draft
          </button>
          <p className="muted">
            Nothing is saved yet. Review or edit the lesson, then save separately.
          </p>
        </section>
      )}
    </details>
  );
}
