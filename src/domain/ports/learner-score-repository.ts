import type {
  ScoreImportPreview,
  ScoreHistoryEntry,
  ComputedTermGrade,
  LearnerScore,
  LearnerScoreRosterEntry,
  LearnerScoreStatus,
} from "../learner-score";

/** Repository port for learner scores. Implicitly scoped to the current
 * session's school — no `schoolId` parameter anywhere here, same
 * convention as {@link SectionRepository}. */
export interface LearnerScoreRepository {
  previewImport?(assessmentItemId: string, csv: string): Promise<ScoreImportPreview>;
  commitImport?(assessmentItemId: string, csv: string, expectedSnapshot: string, reason: string): Promise<number>;
  history?(assessmentItemId: string): Promise<ScoreHistoryEntry[]>;
  rosterForItem(assessmentItemId: string): Promise<LearnerScoreRosterEntry[] | null>;
  record(
    assessmentItemId: string,
    learnerId: string,
    status: LearnerScoreStatus,
    score: number | null,
    reason?: string,
  ): Promise<LearnerScore | null>;
  computeTermGrade(classRecordId: string, learnerId: string): Promise<ComputedTermGrade | null>;
}
