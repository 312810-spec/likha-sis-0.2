import { useEffect, useRef, useState, type FormEvent } from "react";
import type { LearnerApplicationService } from "../application/learner-service";
import { ValidationError } from "../domain/errors";
import type { Learner } from "../domain/learner";
import { useTeacherMode } from "./theme/useTeacherMode";

interface LearnerListScreenProps {
  learnerService: LearnerApplicationService;
}

export function LearnerListScreen({ learnerService }: LearnerListScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // See LoginScreen's equivalent effect — moves focus here whenever
    // this screen mounts (e.g. right after signing in).
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    learnerService
      .listLearners()
      .then((result) => {
        if (!cancelled) setLearners(result);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load learners.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [learnerService]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setConfirmation(null);
    setSubmitting(true);
    try {
      const learner = await learnerService.enrollLearner(givenName, familyName);
      setLearners((current) => [...current, learner]);
      setConfirmation(`${learner.givenName} ${learner.familyName} was enrolled.`);
      setGivenName("");
      setFamilyName("");
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Could not enroll this learner.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-label="Learners">
      <h2 ref={headingRef} tabIndex={-1}>
        Learners
      </h2>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {confirmation && (
        <div className="confirmation-banner" role="status">
          {confirmation}
        </div>
      )}

      {loading ? (
        <p role="status">Loading learners…</p>
      ) : learners.length === 0 ? (
        <p>No learners enrolled yet.</p>
      ) : (
        <ul className="learner-list">
          {learners.map((learner) => (
            <li key={learner.id}>
              {learner.givenName} {learner.familyName}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} aria-label="Enroll a learner">
        <h3>Enroll a learner</h3>
        {mode === "guided" && (
          <p className="field-hint">
            Enter the learner's full legal given and family names as they appear on official school
            records.
          </p>
        )}
        <div className="form-row">
          <div className="field">
            <label htmlFor="learner-given-name">Given name</label>
            <input
              id="learner-given-name"
              type="text"
              value={givenName}
              onChange={(event) => setGivenName(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="learner-family-name">Family name</label>
            <input
              id="learner-family-name"
              type="text"
              value={familyName}
              onChange={(event) => setFamilyName(event.target.value)}
              required
            />
          </div>
        </div>
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Enrolling…" : "Enroll learner"}
        </button>
      </form>
    </section>
  );
}
