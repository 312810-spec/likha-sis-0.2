import { ValidationError } from "../domain/errors";
import type {
  LearnerImportBatchResult,
  LearnerImportDecision,
  LearnerImportLogEntry,
  LearnerImportPreviewRow,
} from "../domain/learner-import";
import type { LearnerImportRepository } from "../domain/ports/learner-import-repository";

const MAX_NAME_LENGTH = 100;
const LRN_PATTERN = /^\d{12}$/;

/**
 * Orchestrates bulk-learner-import use cases. UI code depends on this,
 * never directly on a `LearnerImportRepository` — matches every other
 * `*ApplicationService` in this codebase. School scope is never a
 * parameter; it comes from the session on the Rust side. See ADR-0046.
 */
export class LearnerImportApplicationService {
  constructor(private readonly imports: LearnerImportRepository) {}

  async previewImport(csvText: string): Promise<LearnerImportPreviewRow[]> {
    if (csvText.trim().length === 0) {
      throw new ValidationError("Please choose a CSV file to import.");
    }
    return this.imports.preview(csvText);
  }

  /**
   * The conservative starting decision for a previewed row, before a
   * human reviews it: a flagged potential duplicate defaults to `skip`
   * (touch nothing until a person confirms it's the same learner), and
   * an unflagged row defaults to `create`. Never `update` by default —
   * this app never silently merges records. The caller (the review UI)
   * may change the action and/or the final field values before commit.
   */
  defaultDecisionFor(row: LearnerImportPreviewRow): LearnerImportDecision {
    const hasDuplicate = row.potentialDuplicate !== null;
    return {
      rowNumber: row.rowNumber,
      action: hasDuplicate ? "skip" : "create",
      existingLearnerId: row.potentialDuplicate?.id ?? null,
      importedGivenName: row.givenName,
      importedFamilyName: row.familyName,
      importedLrn: row.lrn,
      importedSex: row.sex,
      finalGivenName: row.givenName,
      finalFamilyName: row.familyName,
      finalLrn: row.lrn,
      finalSex: row.sex,
    };
  }

  async commitImport(decisions: LearnerImportDecision[]): Promise<LearnerImportBatchResult> {
    if (decisions.length === 0) {
      throw new ValidationError("There is nothing to import.");
    }
    for (const decision of decisions) {
      if (decision.action === "update" || decision.action === "skip") {
        if (!decision.existingLearnerId) {
          throw new ValidationError(
            `Row ${decision.rowNumber}: no existing learner to ${decision.action}.`,
          );
        }
      }
      if (decision.action === "skip") continue;

      const trimmedGiven = decision.finalGivenName.trim();
      const trimmedFamily = decision.finalFamilyName.trim();
      if (trimmedGiven.length === 0 || trimmedFamily.length === 0) {
        throw new ValidationError(`Row ${decision.rowNumber}: given and family name are required.`);
      }
      if (trimmedGiven.length > MAX_NAME_LENGTH || trimmedFamily.length > MAX_NAME_LENGTH) {
        throw new ValidationError(
          `Row ${decision.rowNumber}: names must be at most ${MAX_NAME_LENGTH} characters.`,
        );
      }
      if (decision.finalLrn !== null && !LRN_PATTERN.test(decision.finalLrn)) {
        throw new ValidationError(`Row ${decision.rowNumber}: LRN must be exactly 12 digits.`);
      }
    }
    return this.imports.commit(decisions);
  }

  getImportLog(batchId: string): Promise<LearnerImportLogEntry[]> {
    return this.imports.log(batchId);
  }
}
