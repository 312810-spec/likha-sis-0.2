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
    status: LearnerScoreSyncStatus;
    service: LearnerScoreSyncStatusApplicationService;
  } | null>(null);
  const identity = JSON.stringify([teachingAssignmentId, assessmentItemId, learnerId]);
  useEffect(() => {
    let cancelled = false;
    // Promise boundary also handles synchronous service validation failures.
    void Promise.resolve()
      .then(() => service.getStatus(teachingAssignmentId, assessmentItemId, learnerId))
      .then((status) => {
        if (!cancelled) setEvidence(status === null ? null : { identity, status, service });
      })
      .catch(() => {
        if (!cancelled) setEvidence(null);
      });
    return () => {
      cancelled = true;
    };
  }, [service, teachingAssignmentId, assessmentItemId, learnerId, identity]);
  if (!evidence || evidence.identity !== identity || evidence.service !== service) return null;
  return <div className="score-saved-note">Last sync check: {LABELS[evidence.status]}</div>;
}
