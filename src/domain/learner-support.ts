/**
 * One teacher's plan to act on one learner's evidence from one class —
 * CTOS.md §M08's required loop, persisted:
 *
 * ```text
 * Evidence → identified need → goal → intervention → participation →
 * follow-up → outcome
 * ```
 *
 * The *evidence* and the *follow-up* steps already existed: the class
 * occurrence and its `LearnerFollowupMarker`. This type is the middle of
 * that loop and its outcome end — the teacher's explicit decision about
 * what to do, whether the learner took part, and what came of it.
 *
 * Mirrors Rust's `repository::learner_support::LearnerSupportCase`
 * exactly — field-for-field, including the nullability of every field.
 *
 * @public Consumed structurally by the application service and the
 * learning-support screen; kept exported so those can name it directly.
 */
export interface LearnerSupportCase {
  id: string;
  schoolId: string;
  classOccurrenceId: string;
  sectionMembershipId: string;
  /** The identified need — what the evidence said. Required: a case with
   * no stated need is a status, not a plan. */
  need: string;
  /** The target the intervention aims at. Required alongside `need`: a
   * need with no goal cannot be closed by anything the teacher does. */
  goal: string;
  /** What the teacher will do. Required for the same reason. */
  intervention: string;
  /** `open` until participation is recorded, `in_progress` until the
   * outcome is recorded, `resolved` thereafter. The schema's own CHECK
   * constraints enforce this order — see migration 45. */
  status: LearnerSupportStatus;
  /** The loop's participation step. `null` while the case is still `open`. */
  participation: string | null;
  /** The loop's outcome step. `null` until the case is resolved, and
   * immutable afterward. */
  outcome: string | null;
  openedByUserId: string;
  openedAt: string;
  updatedAt: string;
  /** `null` until the case is resolved. A resolved case keeps this
   * timestamp forever: the outcome is a historical fact about that
   * intervention, and CTOS.md §5's historical-integrity rule forbids a
   * later edit from reinterpreting it. */
  resolvedAt: string | null;
  /** Joined from `learners` via the case's `sectionMembershipId`, resolved
   * at the repository — never client-supplied. The whole point of the list
   * is a teacher reading a person's name, and a membership id says
   * nothing. */
  learnerGivenName: string;
  learnerFamilyName: string;
}

/**
 * The three states the loop's spine passes through, in the one order the
 * schema's CHECK constraints permit. Mirrors `OccurrenceStatus`'s own
 * convention: every value is stored, not derived, so the distinction is
 * the database's rather than whichever query happens to be reading it.
 *
 * @public Consumed structurally as `LearnerSupportCase.status`. */
export type LearnerSupportStatus = "open" | "in_progress" | "resolved";
