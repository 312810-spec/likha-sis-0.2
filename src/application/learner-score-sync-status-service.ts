import { ValidationError } from "../domain/errors";
import type { LearnerScoreSyncStatus } from "../domain/learner-score-sync-status";
import type { LearnerScoreSyncStatusRepository } from "../domain/ports/learner-score-sync-status-repository";

export class LearnerScoreSyncStatusApplicationService {
  constructor(private readonly repository: LearnerScoreSyncStatusRepository) {}

  getStatus(
    teachingAssignmentId: string,
    assessmentItemId: string,
    learnerId: string,
  ): Promise<LearnerScoreSyncStatus | null> {
    const assignmentId = teachingAssignmentId.trim();
    const itemId = assessmentItemId.trim();
    const studentId = learnerId.trim();
    if (!assignmentId) throw new ValidationError("Teaching assignment is required.");
    if (!itemId) throw new ValidationError("Assessment item is required.");
    if (!studentId) throw new ValidationError("Learner is required.");
    return this.repository.getStatus(assignmentId, itemId, studentId);
  }
}
