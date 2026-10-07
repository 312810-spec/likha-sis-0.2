import type { LearnerSupportCase } from "../learner-support";

/**
 * The learning-support port — CTOS.md §M08's loop, the half of it that did
 * not exist before M08:
 *
 * ```text
 * Evidence → identified need → goal → intervention → participation →
 * follow-up → outcome
 * ```
 *
 * The evidence step is the class occurrence; the follow-up step is
 * `LearnerFollowupMarker`. This port is what sits between them: the
 * teacher's explicit plan, the learner's participation, and the outcome.
 *
 * `schoolId` and the acting teacher are never parameters — both are
 * session-derived server-side, and every write re-derives ownership from
 * the case's own class occurrence rather than trusting a client-supplied
 * case id. The one-order rule (open → in_progress → resolved) is enforced
 * in the schema and again at the boundary, so a stale UI cannot write a
 * transition the loop does not allow; each write resolves to `null` when
 * the transition is not valid for the case's current status, which is what
 * lets the screen say "this case is no longer open" rather than silently
 * succeeding.
 */
export interface LearnerSupportRepository {
  /** Opens a case on one enrollment for one occurrence — the need → goal →
   * intervention plan. Resolves to `null` for an unknown occurrence or a
   * membership not on that section's roster. */
  openCase(
    classOccurrenceId: string,
    sectionMembershipId: string,
    need: string,
    goal: string,
    intervention: string,
  ): Promise<LearnerSupportCase | null>;

  /** Records the loop's participation step, moving the case to
   * `in_progress`. `null` for an unknown case or one that is no longer
   * `open`. */
  recordParticipation(caseId: string, participation: string): Promise<LearnerSupportCase | null>;

  /** Records the loop's outcome and resolves the case. `null` for an
   * unknown case or one that has not yet recorded participation. */
  resolve(caseId: string, outcome: string): Promise<LearnerSupportCase | null>;

  /** Every case on one occurrence, open and resolved alike — the
   * intervention history for this class. */
  listForOccurrence(classOccurrenceId: string): Promise<LearnerSupportCase[]>;
}
