/**
 * Formative Assessment (ESRU) logging -- domain types and validation
 * (Batch 11, ADR-0082).
 *
 * **Storage decision -- do not "fix" this without re-reading
 * `docs/product/OWNER-DECISIONS-NEEDED.md` item 3 first**: an ESRU
 * rating is a bare literal letter (`"E"` | `"S"` | `"R"` | `"U"`) and
 * ONLY that letter is ever persisted (mirrors
 * `src-tauri/src/repository/formative_assessment.rs`'s own CHECK
 * constraint and doc comment exactly). The full gloss word below
 * (`ESRU_GLOSS`) is a UI-display-only label, explicitly marked
 * unverified against any DepEd primary source -- it must never be
 * passed to a repository port, stored, or compared against a stored
 * value. If the gloss is later found to be wrong, only this label
 * object changes; no migration, no data rewrite.
 */

export type EsruRating = "E" | "S" | "R" | "U";

export const ESRU_RATINGS: readonly EsruRating[] = ["E", "S", "R", "U"];

/**
 * Display-only gloss for each ESRU letter -- **unverified** against any
 * DepEd primary source (`docs/product/OWNER-DECISIONS-NEEDED.md` item 3).
 * Every place this is rendered must visibly mark it as unverified (see
 * `formatEsruRatingLabel` below) -- never show the gloss word alone as
 * if it were confirmed fact.
 */
export const ESRU_GLOSS: Record<EsruRating, string> = {
  E: "Exploration",
  S: "Structured practice",
  R: "Reflection",
  U: "Understanding",
};

/** Renders "E (Exploration — meaning unverified)" -- the one shared
 * formatter every screen that shows an ESRU rating should use, so the
 * "unverified" flag can never be silently dropped from one screen but
 * not another. */
export function formatEsruRatingLabel(rating: EsruRating): string {
  return `${rating} (${ESRU_GLOSS[rating]} — meaning unverified)`;
}

export interface FormativeAssessmentLogInput {
  teachingAssignmentId: string;
  learnerId: string;
  gradingPeriodId: string;
  activityName: string;
  esruRating: EsruRating;
  notes?: string;
}

export class FormativeAssessmentValidationError extends Error {}

/** Throws `FormativeAssessmentValidationError` on the first violation
 * found; returns the trimmed, normalized input on success. Mirrors
 * `repository::formative_assessment::create`'s own validation exactly,
 * so a request that bypasses this service (a forged/raw IPC call) is
 * still rejected server-side, never merely relying on this check. */
export function validateFormativeAssessmentLog(
  input: FormativeAssessmentLogInput,
): FormativeAssessmentLogInput {
  const teachingAssignmentId = input.teachingAssignmentId.trim();
  if (teachingAssignmentId.length === 0) {
    throw new FormativeAssessmentValidationError("A teaching assignment is required.");
  }

  const learnerId = input.learnerId.trim();
  if (learnerId.length === 0) {
    throw new FormativeAssessmentValidationError("A learner is required.");
  }

  const gradingPeriodId = input.gradingPeriodId.trim();
  if (gradingPeriodId.length === 0) {
    throw new FormativeAssessmentValidationError("A grading period (quarter) is required.");
  }

  const activityName = input.activityName.trim();
  if (activityName.length === 0) {
    throw new FormativeAssessmentValidationError("An activity name is required.");
  }
  if (activityName.length > 200) {
    throw new FormativeAssessmentValidationError("The activity name is too long.");
  }

  if (!ESRU_RATINGS.includes(input.esruRating)) {
    throw new FormativeAssessmentValidationError(
      "The ESRU rating must be exactly one of 'E', 'S', 'R', or 'U'.",
    );
  }

  const notes = input.notes?.trim();
  if (notes !== undefined && notes.length > 1000) {
    throw new FormativeAssessmentValidationError("Notes are too long.");
  }

  return {
    teachingAssignmentId,
    learnerId,
    gradingPeriodId,
    activityName,
    esruRating: input.esruRating,
    notes: notes === "" ? undefined : notes,
  };
}

/**
 * A persisted ESRU log. Mirrors Rust's
 * `repository::formative_assessment::FormativeAssessmentLog` exactly.
 */
export interface FormativeAssessmentLog {
  id: string;
  schoolId: string;
  teachingAssignmentId: string;
  learnerId: string;
  gradingPeriodId: string;
  activityName: string;
  esruRating: EsruRating;
  notes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}
