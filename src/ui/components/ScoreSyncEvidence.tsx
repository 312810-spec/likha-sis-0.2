import { useEffect, useState } from "react";
import type { LearnerScoreSyncStatusApplicationService } from "../../application/learner-score-sync-status-service";
import type { LearnerScoreSyncStatus } from "../../domain/learner-score-sync-status";

interface ScoreSyncEvidenceProps {
  service: LearnerScoreSyncStatusApplicationService;
  teachingAssignmentId: string;
  assessmentItemId: string;
  learnerId: string;
}

const LABELS: Record<LearnerScoreSyncStatus, string> = {
  needsReview: "Needs review",
  waitingToSync: "Waiting to sync",
  synced: "Synced",
  notYetSynced: "Not yet synced",
};

/** Snapshot, not a live sync subscription. The owner keys this component by
 * saved-row identity and removes it while a draft/write/error exists. */
export function ScoreSyncEvidence({
  service,
  teachingAssignmentId,
  assessmentItemId,
  learnerId,
}: ScoreSyncEvidenceProps) {
  const [evidence, setEvidence] = useState<{
    identity: string;
    status: LearnerScoreSyncStatus | "unavailable" | "error";
    service: LearnerScoreSyncStatusApplicationService;
  } | null>(null);
  const identity = JSON.stringify([teachingAssignmentId, assessmentItemId, learnerId]);
  useEffect(() => {
    let cancelled = false;
    // Promise boundary also handles synchronous service validation failures.
    void Promise.resolve()
      .then(() => service.getStatus(teachingAssignmentId, assessmentItemId, learnerId))
      .then((status) => {
        if (!cancelled) setEvidence({ identity, status: status ?? "unavailable", service });
      })
      .catch(() => {
        if (!cancelled) setEvidence({ identity, status: "error", service });
      });
    return () => {
      cancelled = true;
    };
  }, [service, teachingAssignmentId, assessmentItemId, learnerId, identity]);
  const status =
    evidence?.identity === identity && evidence.service === service ? evidence.status : "checking";
  return (
    <div className="score-saved-note" role="status" aria-atomic="true">
      {status === "checking" ? (
        "Checking transfer status…"
      ) : status === "unavailable" ? (
        "Transfer status unavailable. Local save is separate. Refresh transfer status to check again."
      ) : status === "error" ? (
        "Could not check transfer status. Local save is separate. Refresh transfer status to retry."
      ) : (
        <>
          <span>Last sync check: {LABELS[status]}</span>
          <span className="score-snapshot-hint">Snapshot only; refresh to check again.</span>
        </>
      )}
    </div>
  );
}
