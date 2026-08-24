import type {
  ComputedTermGrade,
  LearnerScore,
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
  ): Promise<LearnerScore | null>;
  computeTermGrade(classRecordId: string, learnerId: string): Promise<ComputedTermGrade | null>;
}
