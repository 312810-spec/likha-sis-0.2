/**
 * Academic Excellence Award eligibility engine.
 *
 * IMPORTANT — unverified threshold, not DepEd law: this project's own
 * 2026-09-07 unbuilt-features audit (see `docs/CURRENT-HANDOFF.md`)
 * found that the "GA >= 90, no grade < 80, zero disciplinary
 * anecdotes" rule was never actually implemented in the legacy system
 * (it was hardcoded mock data) and no primary DepEd source for it was
 * ever checked in this project either. `DEFAULT_UNVERIFIED_GA_THRESHOLD`
 * and `DEFAULT_UNVERIFIED_MIN_SUBJECT_GRADE` below are a conservative
 * placeholder a school can override per the ADR for this feature
 * (`docs/adr/0076-award-eligibility-and-certificate-scope.md`) — never
 * present these as verified DepEd policy in UI copy, reports, or a
 * printed certificate.
 *
 * The "zero disciplinary anecdotes" leg of the historical rule is
 * deliberately NOT implemented: there is no Anecdotal Records / Student
 * Guidance feature in this codebase yet for it to check against (see
 * the audit's open question #3). `evaluateAcademicExcellenceEligibility`
 * always reports `anecdotalRecordsChecked: false` — callers and any UI
 * built on this must surface that explicitly rather than silently
 * treating an unchecked leg as "passed".
 */

/** Unverified conservative default — see module doc comment. Configurable,
 * not hardcoded DepEd law. */
export const DEFAULT_UNVERIFIED_GA_THRESHOLD = 90;

/** Unverified conservative default — see module doc comment. */
export const DEFAULT_UNVERIFIED_MIN_SUBJECT_GRADE = 80;

export interface AwardEligibilityInput {
  learnerId: string;
  /** General average for the school year/period being evaluated,
   * already computed by the caller (e.g. an average of
   * `ComputedTermGrade.termGrade` values from
   * `LearnerScoreApplicationService.computeTermGrade`). This module does
   * no grade computation of its own — it consumes already-computed
   * grades. */
  generalAverage: number;
  /** Every subject's term grade being evaluated alongside the general
   * average, so the "no grade below the floor" leg can be checked. */
  subjectGrades: readonly number[];
  /** Override the unverified default threshold — e.g. a school-specific
   * policy entered by a School Head. Never silently substituted for the
   * default without the caller's explicit choice. */
  gaThreshold?: number;
  minSubjectGrade?: number;
}

export interface AwardEligibilityResult {
  learnerId: string;
  eligible: boolean;
  generalAverage: number;
  gaThresholdUsed: number;
  minSubjectGradeUsed: number;
  meetsGaThreshold: boolean;
  meetsMinSubjectGrade: boolean;
  lowestSubjectGrade: number | null;
  /** Always `false` — see module doc comment. Never inferred as "passed"
   * by omission; a certificate/UI built on this result must show that
   * this leg of the historical rule was not evaluated. */
  anecdotalRecordsChecked: false;
  /** Human-readable reasons this learner did not qualify (empty when
   * `eligible` is true). */
  reasons: string[];
}

export function evaluateAcademicExcellenceEligibility(
  input: AwardEligibilityInput,
): AwardEligibilityResult {
  const gaThresholdUsed = input.gaThreshold ?? DEFAULT_UNVERIFIED_GA_THRESHOLD;
  const minSubjectGradeUsed = input.minSubjectGrade ?? DEFAULT_UNVERIFIED_MIN_SUBJECT_GRADE;

  const meetsGaThreshold = input.generalAverage >= gaThresholdUsed;
  const lowestSubjectGrade =
    input.subjectGrades.length > 0 ? Math.min(...input.subjectGrades) : null;
  const meetsMinSubjectGrade =
    lowestSubjectGrade === null ? true : lowestSubjectGrade >= minSubjectGradeUsed;

  const reasons: string[] = [];
  if (!meetsGaThreshold) {
    reasons.push(
      `General average ${input.generalAverage} is below the configured threshold of ${gaThresholdUsed}.`,
    );
  }
  if (!meetsMinSubjectGrade) {
    reasons.push(
      `Lowest subject grade ${lowestSubjectGrade} is below the configured floor of ${minSubjectGradeUsed}.`,
    );
  }

  return {
    learnerId: input.learnerId,
    eligible: meetsGaThreshold && meetsMinSubjectGrade,
    generalAverage: input.generalAverage,
    gaThresholdUsed,
    minSubjectGradeUsed,
    meetsGaThreshold,
    meetsMinSubjectGrade,
    lowestSubjectGrade,
    anecdotalRecordsChecked: false,
    reasons,
  };
}
