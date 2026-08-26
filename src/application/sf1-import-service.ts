import { ValidationError } from "../domain/errors";
import type { FilePicker } from "../domain/ports/file-picker";
import type { Sf1ImportRepository } from "../domain/ports/sf1-import-repository";
import type {
  DuplicateDecision,
  Sf1ImportPreview,
  Sf1ImportRow,
  Sf1ImportSummary,
  Sf1RowAction,
  Sf1RowCommitPlan,
} from "../domain/sf1-import";

/**
 * Orchestrates the SF1 import workflow (Wave 2C / ADR-0043). UI code
 * depends on this, never directly on `Sf1ImportRepository`/`FilePicker`.
 * This service never re-implements Wave 2B's parsing, normalization,
 * validation, or duplicate-matching rules — it only assembles a commit
 * plan from a preview the backend already computed, plus whatever
 * decisions the teacher made for rows the backend flagged as needing
 * review.
 */
export class Sf1ImportApplicationService {
  constructor(
    private readonly imports: Sf1ImportRepository,
    private readonly filePicker: FilePicker,
  ) {}

  pickWorkbookFile(): Promise<string | null> {
    return this.filePicker.pickSf1Workbook();
  }

  async previewImport(filePath: string): Promise<Sf1ImportPreview> {
    const trimmed = filePath.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("No file was selected.");
    }
    return this.imports.preview(trimmed);
  }

  /**
   * How many `needsReview` rows still have no decision recorded — the
   * single source of truth for whether import can proceed. `0` means
   * every suspected duplicate has been explicitly resolved (`useExisting`
   * or `createSeparate`); a row is never silently defaulted either way.
   */
  unresolvedReviewCount(
    preview: Sf1ImportPreview,
    decisions: ReadonlyMap<number, DuplicateDecision>,
  ): number {
    return preview.needsReview.filter((match) => !decisions.has(match.rowNumber)).length;
  }

  /**
   * Assembles the exact commit plan for an approved import:
   * - every `new` row becomes `createNewLearner`;
   * - every `exactMatches` row becomes `enrollExistingLearner` against
   *   the backend's own deterministic LRN match — never re-decided here;
   * - every `needsReview` row is included ONLY if it has an explicit
   *   decision; an unresolved suspected duplicate is silently excluded
   *   from the plan, never guessed at either outcome.
   *
   * A row missing a required name field (should already be excluded by
   * `errors`, but never trusted blindly here either) is skipped rather
   * than sent to the backend with a null name.
   */
  buildCommitPlan(
    preview: Sf1ImportPreview,
    decisions: ReadonlyMap<number, DuplicateDecision>,
  ): Sf1RowCommitPlan[] {
    const rowByNumber = new Map(preview.rows.map((row) => [row.rowNumber, row]));
    const plans: Sf1RowCommitPlan[] = [];

    for (const rowNumber of preview.newRows) {
      const row = rowByNumber.get(rowNumber);
      const plan = row && planFor(row, "createNewLearner");
      if (plan) plans.push(plan);
    }

    for (const match of preview.exactMatches) {
      const row = rowByNumber.get(match.rowNumber);
      const learnerId = match.candidates[0]?.id;
      if (!row || !learnerId) continue;
      const plan = planFor(row, { enrollExistingLearner: { learnerId } });
      if (plan) plans.push(plan);
    }

    for (const match of preview.needsReview) {
      const decision = decisions.get(match.rowNumber);
      const row = rowByNumber.get(match.rowNumber);
      if (!decision || !row) continue;
      const action: Sf1RowAction =
        decision.type === "useExisting"
          ? { enrollExistingLearner: { learnerId: decision.learnerId } }
          : "createNewLearner";
      const plan = planFor(row, action);
      if (plan) plans.push(plan);
    }

    return plans;
  }

  async commitImport(
    sectionId: string,
    startsOn: string,
    plans: Sf1RowCommitPlan[],
  ): Promise<Sf1ImportSummary> {
    if (plans.length === 0) {
      throw new ValidationError("There is nothing to import.");
    }
    return this.imports.commit(sectionId, startsOn, plans);
  }
}

function planFor(row: Sf1ImportRow, action: Sf1RowAction): Sf1RowCommitPlan | null {
  if (row.givenName === null || row.familyName === null) return null;
  return {
    rowNumber: row.rowNumber,
    givenName: row.givenName,
    familyName: row.familyName,
    lrn: row.lrn,
    sex: row.sex,
    action,
  };
}
