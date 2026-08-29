export interface Learner {
  id: string;
  schoolId: string;
  givenName: string;
  familyName: string;
  /** DepEd's national Learner Reference Number, 12 digits. `null` when not
   * yet recorded for this learner — see M17 / ADR-0017: LRN and `sex` were
   * added because this app's own SF2 and report-card exports require
   * them, not speculatively. */
  lrn: string | null;
  /** DepEd's Sex field, 'M' or 'F'. `null` when not yet recorded. */
  sex: "M" | "F" | null;
  createdAt: string;
}

/**
 * Result of a duplicate-aware manual Create Learner attempt (Wave 2U).
 * Mirrors `CreateLearnerOutcome` in `repository::learner` (Rust) --
 * always check `kind`, never assume the call created a learner.
 */
export type CreateLearnerResult =
  | { kind: "created"; learner: Learner }
  /** The entered LRN exactly matches a different learner already in this
   * school. Never overridable -- re-submitting with `confirmed: true`
   * still returns this. */
  | { kind: "lrnConflict"; existing: Learner }
  /** One or more learners already in this school share this name (or,
   * with no exact-LRN hit, this LRN) closely enough to need a human
   * look. Nothing was created. Re-submit with `confirmed: true` to
   * create a separate learner anyway. */
  | { kind: "duplicateCandidates"; candidates: Learner[] };
