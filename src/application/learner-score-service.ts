import { ValidationError } from "../domain/errors";
import type {
  ScoreImportPreview,
  ScoreHistoryEntry,
  ComputedTermGrade,
  LearnerScore,
  LearnerScoreRosterEntry,
  LearnerScoreStatus,
} from "../domain/learner-score";
import type { LearnerScoreRepository } from "../domain/ports/learner-score-repository";

/**
 * Orchestrates learner-score use cases. UI code depends on this, never
 * directly on a `LearnerScoreRepository`. School scope and the recording
 * teacher's identity are never parameters here — both come from the
 * caller's authenticated session on the Rust side.
 *
 * Score-range validation (0 <= score <= the item's max score) happens
 * here as a `ValidationError` with a specific message, in addition to
 * the Rust repository's own fail-closed `null` rejection — the same
 * split ADR-0011 already established for other business rules: this
 * layer gives the teacher an actionable message, the Rust layer is the
 * backstop that holds even if this validation is ever bypassed.
 */
export class LearnerScoreApplicationService {
  constructor(private readonly scores: LearnerScoreRepository) {}

  previewImport(assessmentItemId: string, csv: string): Promise<ScoreImportPreview> {
    if (!this.scores.previewImport)
      throw new ValidationError("Score import is unavailable on this installation.");
    return this.scores.previewImport(assessmentItemId, csv);
  }
  commitImport(
    assessmentItemId: string,
    csv: string,
    expectedSnapshot: string,
    reason: string,
  ): Promise<number> {
    if (!reason.trim()) throw new ValidationError("Give a reason for importing these scores.");
    if (!this.scores.commitImport)
      throw new ValidationError("Score import is unavailable on this installation.");
    return this.scores.commitImport(assessmentItemId, csv, expectedSnapshot, reason.trim());
  }
  history(assessmentItemId: string): Promise<ScoreHistoryEntry[]> {
    return this.scores.history?.(assessmentItemId) ?? Promise.resolve([]);
  }

  rosterForItem(assessmentItemId: string): Promise<LearnerScoreRosterEntry[] | null> {
    return this.scores.rosterForItem(assessmentItemId);
  }

  async recordScore(
    assessmentItemId: string,
    learnerId: string,
    status: LearnerScoreStatus,
    score: number | null,
    maxScore: number,
    reason?: string,
  ): Promise<LearnerScore | null> {
    const trimmedItemId = assessmentItemId.trim();
    const trimmedLearnerId = learnerId.trim();
    if (trimmedItemId.length === 0) {
      throw new ValidationError("Assessment item is required.");
    }
    if (trimmedLearnerId.length === 0) {
      throw new ValidationError("Learner is required.");
    }
    if (status === "scored") {
      if (score === null || !Number.isFinite(score)) {
        throw new ValidationError("A score is required when status is Scored.");
      }
      if (score < 0 || score > maxScore) {
        throw new ValidationError(`Score must be between 0 and ${maxScore}.`);
      }
    } else if (score !== null) {
      throw new ValidationError("Excused/Not Applicable entries must not have a score value.");
    }

    return reason
      ? this.scores.record(trimmedItemId, trimmedLearnerId, status, score, reason)
      : this.scores.record(trimmedItemId, trimmedLearnerId, status, score);
  }

  /** Computes a learner's DepEd term grade for a class record. Returns
   * `null` both for a foreign/unknown `classRecordId` and for a genuinely
   * not-yet-computable grade (some required category has no scored item
   * yet) — the Rust layer deliberately doesn't distinguish these, so the
   * UI must show one honest "not available yet" state either way, not
   * claim a specific reason it can't verify. */
  async computeTermGrade(
    classRecordId: string,
    learnerId: string,
  ): Promise<ComputedTermGrade | null> {
    const trimmedRecordId = classRecordId.trim();
    const trimmedLearnerId = learnerId.trim();
    if (trimmedRecordId.length === 0) {
      throw new ValidationError("Class record is required.");
    }
    if (trimmedLearnerId.length === 0) {
      throw new ValidationError("Learner is required.");
    }
    try {
      return await this.scores.computeTermGrade(trimmedRecordId, trimmedLearnerId);
    } catch (error) {
      if (String(error).includes("grade calculation error")) {
        throw new ValidationError(
          "A grade falls between the published grading ranges. Confirm the rounding rule before finalizing this grade.",
        );
      }
      throw error;
    }
  }
}
