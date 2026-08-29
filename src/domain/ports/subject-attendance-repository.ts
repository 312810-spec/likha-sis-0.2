import type {
  EntryStatus,
  RecordEntryOutcome,
  SubjectAttendanceRosterRow,
  SubjectAttendanceSession,
} from "../subject-attendance";

/**
 * Subject Attendance's own port -- deliberately not folded into
 * `AttendanceRepository` (SF2's own port), matching the domain's
 * non-negotiable separation from SF2 (see
 * `docs/adr/0055-subject-attendance-foundation.md`). School/teacher
 * scope comes exclusively from the authenticated backend session; every
 * method here is additionally gated server-side on the caller owning
 * `teachingAssignmentId`.
 */
export interface SubjectAttendanceRepository {
  openSession(
    teachingAssignmentId: string,
    sessionDate: string,
  ): Promise<SubjectAttendanceSession | null>;

  markNoClass(
    teachingAssignmentId: string,
    sessionDate: string,
  ): Promise<SubjectAttendanceSession | null>;

  recordEntry(
    teachingAssignmentId: string,
    sessionId: string,
    membershipId: string,
    status: EntryStatus,
    note?: string,
  ): Promise<RecordEntryOutcome>;

  markAllPresent(
    teachingAssignmentId: string,
    sessionId: string,
  ): Promise<SubjectAttendanceRosterRow[] | null>;

  rosterForSession(
    teachingAssignmentId: string,
    sessionId: string,
  ): Promise<SubjectAttendanceRosterRow[] | null>;

  listSessions(teachingAssignmentId: string): Promise<SubjectAttendanceSession[]>;
}
