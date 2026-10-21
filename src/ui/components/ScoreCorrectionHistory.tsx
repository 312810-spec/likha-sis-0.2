import { useEffect, useId, useRef, useState } from "react";
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
 * identity (see `ClassRecordWorkspace`), so a new correction remounts it.
 * Read receipts are also bound to service/item/learner/revision. Refresh is
 * explicit; neither an old receipt nor a late response crosses that boundary.
 * The fetch happens on expand, not on render: a
 * class of forty learners should not pay forty round trips to show a panel
 * nobody has opened. */
export function ScoreCorrectionHistory({
  service,
  assessmentItemId,
  learnerId,
  learnerName,
}: ScoreCorrectionHistoryProps) {
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    service: LearnerScoreApplicationService;
    identity: string;
    revision: number;
    entries: LearnerScoreCorrection[] | null;
    failed: boolean;
  } | null>(null);
  const requestPending = useRef(false);
  const panelId = useId();
  const identity = JSON.stringify([assessmentItemId, learnerId]);
  const current =
    snapshot?.service === service &&
    snapshot.identity === identity &&
    snapshot.revision === revision
      ? snapshot
      : null;
  const loading = open && current === null;
  const history = current?.entries ?? null;
  const error = Boolean(current?.failed);

  function changeOpen(next: boolean) {
    if (next) setRevision((value) => value + 1);
    setOpen(next);
  }

  function refresh() {
    if (loading || requestPending.current) return;
    requestPending.current = true;
    setRevision((value) => value + 1);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    requestPending.current = true;
    // Promise boundary also handles synchronous service validation failures.
    void Promise.resolve()
      .then(() => service.correctionHistory(assessmentItemId, learnerId))
      .then((entries) => {
        if (!cancelled) setSnapshot({ service, identity, revision, entries, failed: false });
      })
      .catch(() => {
        if (!cancelled) {
          setSnapshot({ service, identity, revision, entries: null, failed: true });
        }
      })
      .finally(() => {
        if (!cancelled) requestPending.current = false;
      });
    return () => {
      cancelled = true;
      requestPending.current = false;
    };
  }, [open, service, assessmentItemId, learnerId, identity, revision]);

  return (
    <div className="score-correction-history">
      <button
        type="button"
        className="correction-history-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Correction history for ${learnerName}`}
        onClick={() => changeOpen(!open)}
      >
        {open ? "Hide history" : "History"}
      </button>
      <div id={panelId} className="correction-history-panel" hidden={!open}>
        {open && (
          <>
            <p className="field-hint" role="status" aria-atomic="true">
              {loading
                ? "Loading corrections…"
                : error
                  ? "History not loaded."
                  : "History snapshot; refresh to check again."}
            </p>
            {loading ? null : error ? (
              <p className="field-error" role="alert">
                Could not load the correction history. Retry to check again.
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
                      {authorLabel(
                        entry.correctedByName,
                        entry.correctedByUserId,
                        entry.previousRecordedByName,
                        entry.previousRecordedByUserId,
                      )}
                      {entry.previousRecordedByUserId === entry.correctedByUserId
                        ? ""
                        : ` · was recorded by ${authorLabel(
                            entry.previousRecordedByName,
                            entry.previousRecordedByUserId,
                            entry.correctedByName,
                            entry.correctedByUserId,
                          )}`}{" "}
                      · {formatCorrectionTime(entry.correctedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              aria-label={`${error ? "Retry" : "Refresh"} history for ${learnerName}`}
              aria-disabled={loading}
              onClick={refresh}
            >
              {loading ? "Checking history…" : error ? "Retry history" : "Refresh history"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function authorLabel(
  name: string | null,
  userId: string,
  peerName: string | null,
  peerId: string,
): string {
  if (!name) return userId;
  return name === peerName && userId !== peerId ? `${name} (${userId})` : name;
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
