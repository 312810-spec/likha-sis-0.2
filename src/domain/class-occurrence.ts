/**
 * One actual class occurrence — the third term of CTOS.md §5's scheduling
 * invariant, "assignment ≠ planned meeting ≠ actual class occurrence". The
 * first two already existed (`TeachingAssignment`, `ScheduleMeeting`); this
 * is what records that a class *actually occurred*, and how it deviated from
 * the recurring plan. Mirrors Rust's
 * `repository::class_occurrence::ClassOccurrence` exactly — field-for-field,
 * including the nullability of every field.
 *
 * @public Consumed structurally by the application service and the
 * classroom screen's fixtures; kept exported so those can name it directly.
 */
export interface ClassOccurrence {
  id: string;
  schoolId: string;
  teachingAssignmentId: string;
  occurrenceDate: string;
  status: OccurrenceStatus;
  /** The recurring-plan snapshot taken when this occurrence was started.
   * `null` when no `ScheduleMeeting` existed for this weekday at all — an
   * ad-hoc class. A snapshot, not a live join: a later schedule edit must
   * not rewrite what this occurrence was planned as. */
  plannedStartsAt: string | null;
  plannedEndsAt: string | null;
  plannedRoom: string | null;
  /** What actually happened. `null` until the teacher records it. */
  actualStartsAt: string | null;
  actualEndsAt: string | null;
  actualRoom: string | null;
  learningTarget: string;
  quickEvidence: string;
  notes: string;
  summary: string;
  cancelledReason: string;
  startedAt: string | null;
  finishedAt: string | null;
  cancelledAt: string | null;
  /** Bumped each time a delivered/cancelled occurrence is reopened. */
  revision: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The four states CTOS M06's acceptance clause names, so that "planned,
 * changed, cancelled, and delivered occurrences remain distinguishable".
 * Every one is stored, not derived — the distinction is enforced by the
 * schema's own `CHECK` constraint, not by whichever query happens to be
 * reading it.
 *
 * `planned` does not mean "scheduled": it means an occurrence was *opened*
 * and is still on its recurring slot. A class that has not been started has
 * no occurrence row at all — CTOS.md §5, "a planned schedule does not prove
 * a class occurred".
 */
export type OccurrenceStatus = "planned" | "changed" | "cancelled" | "delivered";

/**
 * Every reason a start/finish/cancel/reopen call can decline. Mirrors
 * Rust's `OccurrenceOutcome` (serde `tag = "outcome", content =
 * "occurrence"`), so the tagged union here is the serialized shape itself —
 * no adapter translation layer in between.
 *
 * The success cases carry the occurrence; the cockpit needs it for both
 * "started" and "already open" so it can render the resumed session without
 * a second round trip.
 */
export type OccurrenceOutcome =
  | { outcome: "started"; occurrence: ClassOccurrence }
  | { outcome: "updated"; occurrence: ClassOccurrence }
  | { outcome: "alreadyOpen"; occurrence: ClassOccurrence }
  | { outcome: "notYourClass" }
  | { outcome: "unknownAssignment" }
  | { outcome: "invalidDate" }
  | { outcome: "alreadyDelivered" }
  | { outcome: "alreadyCancelled" }
  | { outcome: "notStarted" }
  | { outcome: "cancelledCannotFinish" }
  | { outcome: "cancelRequiresReason" }
  | { outcome: "attendanceNotChecked" };

/**
 * One persisted follow-up marker on one enrollment for one occurrence.
 * Cleared, never deleted — CTOS.md §6.4 asks "what requires learner
 * follow-up?", a question about history rather than only the current moment,
 * so a cleared marker stays answerable after the fact. Mirrors Rust's
 * `LearnerFollowupMarker` exactly.
 *
 * @public Consumed structurally, as `listFollowupMarkers`'s element type.
 */
export interface LearnerFollowupMarker {
  id: string;
  schoolId: string;
  classOccurrenceId: string;
  /** The enrollment span, not a bare learner id — matching
   * `SubjectAttendanceEntry`'s own keying. */
  sectionMembershipId: string;
  reason: string;
  /** Set once a teacher cleared the marker; `null` while it stands. */
  clearedAt: string | null;
  markedByUserId: string;
  markedAt: string;
}
