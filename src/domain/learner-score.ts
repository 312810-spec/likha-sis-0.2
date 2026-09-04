/** Every state a learner's score for one assessment item can be in.
 * Absence of a score entirely ("not yet recorded") is represented by no
 * `LearnerScore` existing for that learner/item pair, not a fourth value
 * here — matching `AttendanceStatus`'s equivalent convention. */
export type LearnerScoreStatus = "scored" | "excused" | "not_applicable";

export interface LearnerScore {
  id: string;
  schoolId: string;
  assessmentItemId: string;
  learnerId: string;
  status: LearnerScoreStatus;
  score: number | null;
  recordedByUserId: string;
  recordedAt: string;
  updatedAt: string;
}

/** One roster row for a given assessment item: a learner joined with
 * their score status for that item, or `null` if nobody has recorded it
 * yet — matching `AttendanceRosterEntry`'s shape. */
export interface LearnerScoreRosterEntry {
  learnerId: string;
  givenName: string;
  familyName: string;
  status: LearnerScoreStatus | null;
  score: number | null;
  updatedAt: string | null;
}

/** A learner's computed grade for a class record's grading period, per
 * DepEd Order No. 015, s. 2026 — see
 * `src-tauri/src/repository/grading_computation.rs` for the full
 * algorithm and `docs/adr/0013-deped-grade-computation.md` for the
 * research record. `initialGrade` is the weighted-sum percentage before
 * transmutation/rounding; `termGrade` is the final whole-number grade
 * actually reported. */
export interface ComputedTermGrade {
  initialGrade: number;
  termGrade: number;
  /** True if the SY 2026-2027 Adjusted Transmutation Table was applied.
   * False means the Zero-Based Grading System applied instead (SY
   * 2027-2028 onward) — `termGrade` is `initialGrade` rounded directly. */
  wasTransmuted: boolean;
  /** True if the computed grade fell below 60 and was raised to DepEd's
   * explicit floor. When true, `initialGrade` (not `termGrade`) reflects
   * the learner's true raw performance. */
  wasFloored: boolean;
}
