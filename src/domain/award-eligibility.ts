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
 * (`docs/adr/0084-award-eligibility-anecdotal-record-check.md`) — never
 * present these as verified DepEd policy in UI copy, reports, or a
 * printed certificate.
 *
 * The "zero disciplinary anecdotes" leg of the historical rule (Batch
 * 13, ADR-0084) now runs for real, against the Anecdotal / Guidance
 * Records entity (ADR-0083): a learner with any anecdotal record in a
 * `DISQUALIFYING_ANECDOTAL_CATEGORIES` category (see
 * `domain/anecdotal-record.ts`) is not eligible. That disqualification
 * rule — "any `negative`-category record, any severity, since this
 * schema has no severity field" — is this project's own conservative
 * interpretation, not a verified DepEd rule either; see
 * `docs/product/OWNER-DECISIONS-NEEDED.md` item 4.
 *
 * This module stays a pure function per `.claude/rules/architecture.md`:
 * it does no I/O of its own. The caller (an application service or a UI
 * screen) is responsible for performing the real anecdotal-record lookup
 * (via `AnecdotalRecordApplicationService`/the narrow read-only
 * `has_anecdotal_category_for_learner` command) and passing its result
 * in as `hasDisqualifyingAnecdotalRecord` — this function never fetches
 * anything and never infers "not checked" as "passed".
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
  /** The real result of looking up whether this learner has any
   * anecdotal/guidance record in a disqualifying category (see module
   * doc comment). The caller must perform this lookup itself — this
   * function does no I/O and never assumes `false` by omission. */
  hasDisqualifyingAnecdotalRecord: boolean;
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
  /** Always `true` as of Batch 13 — the anecdotal-records leg now runs
   * for real against real data, via a narrow read-only lookup the caller
   * performed before calling this function. See module doc comment for
   * the (still unverified-against-DepEd) disqualification rule used. */
  anecdotalRecordsChecked: true;
  /** Echoes the caller-supplied lookup result this evaluation used. */
  hasDisqualifyingAnecdotalRecord: boolean;
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
  if (input.hasDisqualifyingAnecdotalRecord) {
    reasons.push(
      "This learner has at least one anecdotal/guidance record in a disqualifying category " +
        "(this project's own conservative rule, not a verified DepEd standard).",
    );
  }

  return {
    learnerId: input.learnerId,
    eligible: meetsGaThreshold && meetsMinSubjectGrade && !input.hasDisqualifyingAnecdotalRecord,
    generalAverage: input.generalAverage,
    gaThresholdUsed,
    minSubjectGradeUsed,
    meetsGaThreshold,
    meetsMinSubjectGrade,
    lowestSubjectGrade,
    anecdotalRecordsChecked: true,
    hasDisqualifyingAnecdotalRecord: input.hasDisqualifyingAnecdotalRecord,
    reasons,
  };
}
