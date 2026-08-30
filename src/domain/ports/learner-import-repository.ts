import type {
  LearnerImportBatchResult,
  LearnerImportDecision,
  LearnerImportLogEntry,
  LearnerImportPreviewRow,
} from "../learner-import";

/**
 * Repository port for bulk learner import. Like {@link LearnerRepository},
 * every method here is implicitly scoped to the current session's school
 * — no `schoolId` parameter anywhere, isolation enforced server-side.
 */
export interface LearnerImportRepository {
  /** Parses `csvText` and flags any potential duplicate already in this
   * school. A pure read — nothing is written. */
  preview(csvText: string): Promise<LearnerImportPreviewRow[]>;
  /** Commits a reviewed batch atomically: every decision is applied and
   * logged, or none are. */
  commit(decisions: LearnerImportDecision[]): Promise<LearnerImportBatchResult>;
  /** The full provenance trail for one committed batch, in row order. */
  log(batchId: string): Promise<LearnerImportLogEntry[]>;
}
