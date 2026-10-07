import { useEffect, useState } from "react";
import type { LearnerScoreApplicationService } from "../../application/learner-score-service";
import type { LearnerScoreCorrection, LearnerScoreStatus } from "../../domain/learner-score";

interface ScoreCorrectionHistoryProps {
  service: LearnerScoreApplicationService;
  assessmentItemId: string;
  learnerId: string;
  /** Only for the toggle's accessible label — the owner already has the name. */
  learnerName: string;
}

/** CTOS M07 — the review half of fast evidence capture. The correction
 * lineage has been written since M01 (append-only
 * `learner_score_corrections`, reason required at the boundary), and the
 * whole stack up to the Tauri command existed, but nothing ever read it in
 * production: a teacher could make a correction and give a reason, then had
 * no way to see any of it back. This is that surface.
 *
 * A snapshot, not a subscription. The owner keys this component by saved-row
 * identity (see `ClassRecordWorkspace`), so a new correction remounts it and
 * the lineage it shows is never stale — the same pattern
 * `ScoreSyncEvidence` uses. The fetch happens on expand, not on render: a
 * class of forty learners should not pay forty round trips to show a panel
 * nobody has opened. */
export function ScoreCorrectionHistory({
  service,
  assessmentItemId,
  learnerId,
  learnerName,
}: ScoreCorrectionHistoryProps) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<LearnerScoreCorrection[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // The loading/error reset happens in the toggle handler rather than here:
    // setState directly in an effect body is a lint error, and resetting at the
    // moment of opening is also what gives the immediate feedback before the
    // first await resolves.
    // Promise boundary also handles synchronous service validation failures.
    void Promise.resolve()
      .then(() => service.correctionHistory(assessmentItemId, learnerId))
      .then((entries) => {
        if (!cancelled) setHistory(entries);
      })
      .catch(() => {
        if (!cancelled) {
          setHistory(null);
          setError("Could not load the correction history. Try opening it again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, service, assessmentItemId, learnerId]);

  return (
    <div className="score-correction-history">
      <button
        type="button"
        className="correction-history-toggle"
        aria-expanded={open}
        aria-controls={`correction-history-${learnerId}`}
        aria-label={`Correction history for ${learnerName}`}
        onClick={() => {
          setOpen((current) => !current);
          if (!open) {
            setLoading(true);
            setError(null);
          }
        }}
      >
        {open ? "Hide history" : "History"}
      </button>
      {open && (
        <div id={`correction-history-${learnerId}`} className="correction-history-panel">
          {loading ? (
            <p className="field-hint">Loading corrections…</p>
          ) : error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : history === null ? null : history.length === 0 ? (
            <p className="field-hint">No corrections recorded for this score.</p>
          ) : (
            <ul className="correction-history-list">
              {history.map((entry) => (
                <li key={entry.id} className="correction-history-entry">
                  <p className="correction-history-change">
                    {describe(entry.previousStatus, entry.previousScore)} →{" "}
                    <strong>{describe(entry.newStatus, entry.newScore)}</strong>
                  </p>
                  <p className="correction-history-reason">“{entry.reason}”</p>
                  <p className="correction-history-meta">
                    {entry.correctedByName ?? entry.correctedByUserId}
                    {entry.previousRecordedByName === entry.correctedByName
                      ? ""
                      : ` · was recorded by ${
                          entry.previousRecordedByName ?? entry.previousRecordedByUserId
                        }`}{" "}
                    · {formatCorrectionTime(entry.correctedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function describe(status: LearnerScoreStatus, score: number | null): string {
  if (status === "excused") return "Excused";
  if (status === "not_applicable") return "N/A";
  return score === null ? "—" : String(score);
}

function formatCorrectionTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
