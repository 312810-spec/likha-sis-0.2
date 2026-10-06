import { invoke } from "./invoke";
import type {
  ComputedTermGrade,
  LearnerScore,
  LearnerScoreCorrection,
  LearnerScoreRosterEntry,
  LearnerScoreStatus,
} from "../../domain/learner-score";
import type { LearnerScoreRepository } from "../../domain/ports/learner-score-repository";

/** Tauri/SQLite implementation of {@link LearnerScoreRepository}. */
export class TauriLearnerScoreRepository implements LearnerScoreRepository {
  rosterForItem(assessmentItemId: string): Promise<LearnerScoreRosterEntry[] | null> {
    return invoke<LearnerScoreRosterEntry[] | null>("roster_for_assessment_item", {
      assessmentItemId,
    });
  }

  record(
    assessmentItemId: string,
    learnerId: string,
    status: LearnerScoreStatus,
    score: number | null,
    correctionReason: string | null,
  ): Promise<LearnerScore | null> {
    return invoke<LearnerScore | null>("record_learner_score", {
      assessmentItemId,
      learnerId,
      status,
      score,
      correctionReason,
    });
  }

  correctionHistory(
    assessmentItemId: string,
    learnerId: string,
  ): Promise<LearnerScoreCorrection[]> {
    return invoke<LearnerScoreCorrection[]>("learner_score_correction_history", {
      assessmentItemId,
      learnerId,
    });
  }

  computeTermGrade(classRecordId: string, learnerId: string): Promise<ComputedTermGrade | null> {
    return invoke<ComputedTermGrade | null>("compute_learner_term_grade", {
      classRecordId,
      learnerId,
    });
  }
}
