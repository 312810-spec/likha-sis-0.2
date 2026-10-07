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

/** One entry in a score's correction lineage — CTOS M01 (CTOS.md §5:
 * "corrections preserve previous values, reason, author, and time where
 * required"). The live `LearnerScore` row stays the current truth; this is
 * the immutable record of every state it replaced, newest first.
 *
 * The `*ByName` fields are M07 — a teacher reviewing a class record needs to
 * read a person's name, not their user id. They are resolved server-side by
 * joining `users`, mirroring how `AuditLogEntry.actorUsername` is resolved,
 * and are optional only for defensive parity with that join: the schema's
 * non-cascading `REFERENCES users(id)` means an author of a correction
 * cannot be deleted while the lineage exists.
 *
 * A first recording has no correction history — there is no prior state to
 * preserve. */
export interface LearnerScoreCorrection {
  id: string;
  assessmentItemId: string;
  learnerId: string;
  /** The state this correction replaced. */
  previousStatus: LearnerScoreStatus;
  previousScore: number | null;
  previousRecordedByUserId: string;
  previousRecordedByName: string | null;
  previousRecordedAt: string;
  /** The state that replaced it. */
  newStatus: LearnerScoreStatus;
  newScore: number | null;
  correctedByUserId: string;
  correctedByName: string | null;
  /** Required — a correction with no reason is rejected at the boundary. */
  reason: string;
  correctedAt: string;
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
  /** True only when every assessment item this class record holds under a
   * category the resolved weight policy actually pools has a recorded
   * status — no blanks remaining. False means the grade is real but
   * provisional: it is computed exactly as DepEd specifies from what has
   * been entered so far, and it will move once the outstanding items are
   * recorded. A provisional value must never be presented as final
   * (CTOS §5). */
  complete: boolean;
}
