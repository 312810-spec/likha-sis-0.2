import type {
  AdviserAttendanceOverview,
  EntryStatus,
  RecordEntryOutcome,
  SubjectAttendanceMonitor,
  SubjectAttendanceRosterRow,
  SubjectAttendanceSession,
} from "../subject-attendance";
import type { Section } from "../section";

/**
 * Subject Attendance's own port -- deliberately not folded into
 * `AttendanceRepository` (SF2's own port), matching the domain's
 * non-negotiable separation from SF2 (see
 * `docs/adr/0055-subject-attendance-foundation.md`). School/teacher
 * scope comes exclusively from the authenticated backend session.
 * Assignment write/monitor methods are gated server-side on ownership;
 * Adviser View methods use the separate section-advisory gate from
 * ADR-0056 and never expose a write operation.
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

  monitor(teachingAssignmentId: string, asOfDate: string): Promise<SubjectAttendanceMonitor | null>;

  listAdviserViewSections(asOfDate: string): Promise<Section[]>;

  adviserOverview(sectionId: string, asOfDate: string): Promise<AdviserAttendanceOverview | null>;
}
