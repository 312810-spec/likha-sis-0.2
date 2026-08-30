/**
 * Wave 2V/2W: Subject Attendance. Mirrors
 * `repository::subject_attendance`'s Rust types exactly (see
 * `docs/adr/0055-subject-attendance-foundation.md`) — deliberately its
 * own type set, not a reuse of `AttendanceStatus`/`AttendanceRecord`
 * from `domain/attendance.ts`, since Subject Attendance is a separate
 * record from SF2 by design and must never be able to drift into
 * sharing a type with it.
 */

export type SessionStatus = "held" | "no_class";

/** DepEd-familiar four-value mark; distinct from `AttendanceStatus`
 * (which has no "late", since SF2 itself has no separate late code). */
export type EntryStatus = "present" | "absent" | "late" | "excused";

export const ENTRY_STATUSES: readonly EntryStatus[] = ["present", "absent", "late", "excused"];

export interface SubjectAttendanceSession {
  id: string;
  schoolId: string;
  teachingAssignmentId: string;
  sectionId: string;
  subjectId: string;
  sessionDate: string;
  status: SessionStatus;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

/** One roster row for a session: the exact enrollment membership valid
 * on the session's own date, plus its recorded mark if one exists.
 * `entryStatus: null` means "not yet marked" -- never treated as
 * "absent". */
export interface SubjectAttendanceRosterRow {
  membershipId: string;
  learnerId: string;
  givenName: string;
  familyName: string;
  entryStatus: EntryStatus | null;
}

export interface SubjectAttendanceEntry {
  id: string;
  sessionId: string;
  membershipId: string;
  learnerId: string;
  status: EntryStatus;
  note: string | null;
  updatedAt: string;
}

/** Mirrors Rust's `RecordEntryOutcome` (`serde(tag = "kind")`). */
export type RecordEntryOutcome =
  | { kind: "recorded"; entry: SubjectAttendanceEntry }
  | { kind: "sessionNotFound" }
  | { kind: "sessionIsNoClass" }
  | { kind: "membershipNotInSession" };

/** The minimal identity a teacher needs to pick which of their own
 * classes they're checking attendance for -- deliberately not the full
 * `TeachingAssignmentDetail` shape (this is not the deferred Teaching
 * Assignment/Class Schedule UI, only enough to drive Subject
 * Attendance's own assignment picker). */
export interface TeachingAssignmentSummary {
  id: string;
  sectionId: string;
  sectionName: string;
  schoolYear: string;
  subjectId: string;
  subjectName: string;
}

/** One learner's raw attendance counts and current standing for the
 * Subject Monitor screen -- mirrors Rust's `SubjectAttendanceMonitorRow`
 * exactly. Deliberately no automatic flag/threshold beyond the raw
 * streak number: `docs/product/SUBJECT-ATTENDANCE-SPEC.md` defers
 * configurable school thresholds as a later, separately-designed
 * enhancement. */
export interface SubjectAttendanceMonitorRow {
  membershipId: string;
  learnerId: string;
  givenName: string;
  familyName: string;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  /** Consecutive `absent` marks counting back from the most recent
   * `held` session, stopping at the first non-absent mark or the first
   * session this learner has no entry for -- an unmarked session never
   * counts as absent and always breaks the streak. */
  currentConsecutiveAbsences: number;
}

/** Mirrors Rust's `SubjectAttendanceMonitor`. Rows are scoped to the
 * roster as of the requested date -- a learner who has since
 * transferred out no longer appears here. */
export interface SubjectAttendanceMonitor {
  heldSessionCount: number;
  rows: SubjectAttendanceMonitorRow[];
}
