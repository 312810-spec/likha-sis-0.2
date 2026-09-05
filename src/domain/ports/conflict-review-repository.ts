import type { ConflictResolutionChoice, ConflictReviewSummary } from "../conflict-review";

/**
 * The conflict-review screen's port — lists staged conflicts for the
 * caller's own school and resolves one. `school_id` is never a
 * parameter — always session-derived server-side, matching every other
 * same-school command in this codebase. See
 * `commands::conflict_review::list_conflict_reviews`/
 * `resolve_conflict_review` (Rust) for the exact contract.
 */
export interface ConflictReviewRepository {
  listConflicts(): Promise<ConflictReviewSummary[]>;
  /**
   * Resolves one staged conflict per the teacher's explicit choice.
   * Returns `false` (not a thrown error) when the conflict is already
   * resolved or does not belong to the caller's own school — the two are
   * deliberately indistinguishable, matching
   * `DeviceSyncRepository.revokeDevice`'s established enumeration-safety
   * convention. A thrown error means the choice itself could not be
   * applied (e.g. the incoming change could not be decrypted or applied).
   */
  resolveConflict(conflictId: string, resolution: ConflictResolutionChoice): Promise<boolean>;
}
