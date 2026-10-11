import type {
  ComputedTermGrade,
  LearnerScore,
  LearnerScoreCorrection,
  LearnerScoreRosterEntry,
  LearnerScoreStatus,
} from "../learner-score";

/** Repository port for learner scores. Implicitly scoped to the current
 * session's school — no `schoolId` parameter anywhere here, same
 * convention as {@link SectionRepository}. */
export interface LearnerScoreRepository {
  rosterForItem(assessmentItemId: string): Promise<LearnerScoreRosterEntry[] | null>;
  record(
    assessmentItemId: string,
    learnerId: string,
    status: LearnerScoreStatus,
    score: number | null,
    /** CTOS M01: required only when this call replaces an existing score.
     * Ignored for a first-time recording; rejected at the boundary when a
     * real correction omits it. */
    correctionReason: string | null,
  ): Promise<LearnerScore | null>;
  /** CTOS M01: the correction lineage for one learner's score on one item,
   * newest first. Empty when the score has never been corrected. */
  correctionHistory(assessmentItemId: string, learnerId: string): Promise<LearnerScoreCorrection[]>;
  computeTermGrade(classRecordId: string, learnerId: string): Promise<ComputedTermGrade | null>;
}
