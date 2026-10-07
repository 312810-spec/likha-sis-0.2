import { invoke } from "./invoke";
import type {
  ScoreImportPreview,
  ScoreHistoryEntry,
  ComputedTermGrade,
  LearnerScore,
  LearnerScoreRosterEntry,
  LearnerScoreStatus,
} from "../../domain/learner-score";
import type { LearnerScoreRepository } from "../../domain/ports/learner-score-repository";

/** Tauri/SQLite implementation of {@link LearnerScoreRepository}. */
export class TauriLearnerScoreRepository implements LearnerScoreRepository {
  previewImport(assessmentItemId: string, csv: string): Promise<ScoreImportPreview> { return invoke("preview_score_import", { assessmentItemId, csv }); }
  commitImport(assessmentItemId: string, csv: string, expectedSnapshot: string, reason: string): Promise<number> { return invoke("commit_score_import", { assessmentItemId, csv, expectedSnapshot, reason }); }
  history(assessmentItemId: string): Promise<ScoreHistoryEntry[]> { return invoke("list_score_history", { assessmentItemId }); }
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
    reason?: string,
  ): Promise<LearnerScore | null> {
    return invoke<LearnerScore | null>("record_learner_score", {
      assessmentItemId,
      learnerId,
      status,
      score,
      ...(reason ? { reason } : {}),
    });
  }

  computeTermGrade(classRecordId: string, learnerId: string): Promise<ComputedTermGrade | null> {
    return invoke<ComputedTermGrade | null>("compute_learner_term_grade", {
      classRecordId,
      learnerId,
    });
  }
}
