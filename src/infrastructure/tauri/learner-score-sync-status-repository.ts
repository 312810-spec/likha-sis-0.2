import type { LearnerScoreSyncStatus } from "../../domain/learner-score-sync-status";
import type { LearnerScoreSyncStatusRepository } from "../../domain/ports/learner-score-sync-status-repository";
import { invoke } from "./invoke";

export class TauriLearnerScoreSyncStatusRepository implements LearnerScoreSyncStatusRepository {
  getStatus(
    teachingAssignmentId: string,
    assessmentItemId: string,
    learnerId: string,
  ): Promise<LearnerScoreSyncStatus | null> {
    return invoke<LearnerScoreSyncStatus | null>("get_learner_score_sync_status", {
      teachingAssignmentId,
      assessmentItemId,
      learnerId,
    });
  }
}
