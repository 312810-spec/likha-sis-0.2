import type { LearnerScoreSyncStatus } from "../learner-score-sync-status";

/** Read-only, session-scoped access to sync evidence for a Class Record score. */
export interface LearnerScoreSyncStatusRepository {
  getStatus(
    teachingAssignmentId: string,
    assessmentItemId: string,
    learnerId: string,
  ): Promise<LearnerScoreSyncStatus | null>;
}
