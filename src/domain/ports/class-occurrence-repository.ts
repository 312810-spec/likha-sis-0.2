import type {
  ClassOccurrence,
  LearnerFollowupMarker,
  OccurrenceOutcome,
} from "../class-occurrence";

/**
 * The fields a teacher can capture while a class is in flight. Every one is
 * optional and `null`-able, and the semantics are deliberately not
 * symmetric: `actualStartsAt`/`actualEndsAt`/`actualRoom` are `null` to mean
 * "clear what was recorded", while `learningTarget`/`quickEvidence`/`notes`
 * are `undefined` to mean "leave it alone". That asymmetry is what lets the
 * cockpit save a partial capture — a teacher who typed evidence and nothing
 * else — without blanking the target a lesson plan seeded.
 */
export interface OccurrenceCaptureFields {
  actualStartsAt?: string | null;
  actualEndsAt?: string | null;
  actualRoom?: string | null;
  learningTarget?: string;
  quickEvidence?: string;
  notes?: string;
}

/**
 * The classroom cockpit's port — the CTOS.md §6.3 flow: open scheduled class
 * → start → attendance / current target / quick evidence / notes → finish →
 * review summary → save confirmed occurrence.
 *
 * `schoolId` and the acting teacher are never parameters: both are
 * session-derived server-side, and every write re-checks that the caller is
 * the teacher on `teachingAssignmentId`. `occurrenceDate` IS caller-supplied
 * — the local wall-clock calendar date, matching this codebase's own
 * established convention for "what day is it" (`SubjectAttendanceRepository`'s
 * `sessionDate`, `MyDayRepository`'s `todayDate`) rather than pulling in a
 * server-side clock for this one flow.
 *
 * The distinction this whole port exists to preserve is CTOS.md §6.3's
 * "scheduled class / changed or cancelled class / actual delivered
 * occurrence" — three different things that must never collapse into one.
 */
export interface ClassOccurrenceRepository {
  /** Starts a class for this date, or resumes the one already in flight. */
  start(teachingAssignmentId: string, occurrenceDate: string): Promise<OccurrenceOutcome>;

  /** Records what actually happened in the open class. Resolves to `null`
   * when this class has no occurrence — i.e. it was never started. */
  capture(
    teachingAssignmentId: string,
    occurrenceDate: string,
    fields: OccurrenceCaptureFields,
  ): Promise<ClassOccurrence | null>;

  /** Finishes the class and writes its summary. Refused while attendance
   * has not been checked. */
  finish(
    teachingAssignmentId: string,
    occurrenceDate: string,
    summary: string,
  ): Promise<OccurrenceOutcome>;

  /** Cancels the class. Requires a reason — CTOS.md §5, "weather/advisory
   * information does not automatically cancel class": a cancellation is a
   * human decision and the record must say which one. */
  cancel(
    teachingAssignmentId: string,
    occurrenceDate: string,
    reason: string,
  ): Promise<OccurrenceOutcome>;

  /** Reopens a delivered or cancelled class so it can be corrected. */
  reopen(teachingAssignmentId: string, occurrenceDate: string): Promise<OccurrenceOutcome>;

  /** The occurrence for one class on one date, or `null` when the class has
   * not been started — the honest "not started" state, never a fabricated
   * `planned` row built from the schedule alone. */
  getForDate(teachingAssignmentId: string, occurrenceDate: string): Promise<ClassOccurrence | null>;

  /** Every recorded occurrence for one class, newest first. */
  listForAssignment(teachingAssignmentId: string): Promise<ClassOccurrence[]>;

  /** Marks one learner for follow-up in this class. Resolves to `null` for
   * an unknown occurrence or a membership not on this section's roster. */
  markFollowup(
    classOccurrenceId: string,
    sectionMembershipId: string,
    reason: string,
  ): Promise<LearnerFollowupMarker | null>;

  /** Clears a marker without deleting it. */
  clearFollowup(
    classOccurrenceId: string,
    sectionMembershipId: string,
  ): Promise<LearnerFollowupMarker | null>;

  /** Every marker on one occurrence, open and cleared alike. */
  listFollowupMarkers(classOccurrenceId: string): Promise<LearnerFollowupMarker[]>;
}
