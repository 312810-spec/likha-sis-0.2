import { ValidationError } from "../domain/errors";
import type { ScheduleMeeting } from "../domain/schedule-meeting";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type {
  EntryStatus,
  RecordEntryOutcome,
  SubjectAttendanceMonitor,
  SubjectAttendanceRosterRow,
  SubjectAttendanceSession,
  TeachingAssignmentSummary,
} from "../domain/subject-attendance";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required.`);
  }
  return trimmed;
}

function requireIsoDate(value: string): string {
  if (!DATE_PATTERN.test(value)) {
    throw new ValidationError("Date must be in YYYY-MM-DD format.");
  }
  return value;
}

/** Validates shape/non-empty input before calling the two backend ports,
 * matching every other `*ApplicationService`'s convention -- the
 * backend stays authoritative on authorization and every domain rule
 * (own-assignment-only, no-class refusal, out-of-section membership
 * refusal); this layer never re-implements those checks. */
export class SubjectAttendanceApplicationService {
  constructor(
    private readonly subjectAttendance: SubjectAttendanceRepository,
    private readonly teachingAssignments: TeachingAssignmentRepository,
  ) {}

  async listMyAssignments(teacherUserId: string): Promise<TeachingAssignmentSummary[]> {
    const trimmed = requireNonEmpty(teacherUserId, "Teacher");
    return this.teachingAssignments.listMine(trimmed);
  }

  async listMeetings(teachingAssignmentId: string): Promise<ScheduleMeeting[]> {
    const assignment = requireNonEmpty(teachingAssignmentId, "Class");
    return this.teachingAssignments.listMeetings(assignment);
  }

  async openSession(
    teachingAssignmentId: string,
    sessionDate: string,
  ): Promise<SubjectAttendanceSession | null> {
    const assignment = requireNonEmpty(teachingAssignmentId, "Class");
    const date = requireIsoDate(sessionDate);
    return this.subjectAttendance.openSession(assignment, date);
  }

  async markNoClass(
    teachingAssignmentId: string,
    sessionDate: string,
  ): Promise<SubjectAttendanceSession | null> {
    const assignment = requireNonEmpty(teachingAssignmentId, "Class");
    const date = requireIsoDate(sessionDate);
    return this.subjectAttendance.markNoClass(assignment, date);
  }

  async recordEntry(
    teachingAssignmentId: string,
    sessionId: string,
    membershipId: string,
    status: EntryStatus,
    note?: string,
  ): Promise<RecordEntryOutcome> {
    const assignment = requireNonEmpty(teachingAssignmentId, "Class");
    const session = requireNonEmpty(sessionId, "Session");
    const membership = requireNonEmpty(membershipId, "Learner");
    return this.subjectAttendance.recordEntry(assignment, session, membership, status, note);
  }

  async markAllPresent(
    teachingAssignmentId: string,
    sessionId: string,
  ): Promise<SubjectAttendanceRosterRow[] | null> {
    const assignment = requireNonEmpty(teachingAssignmentId, "Class");
    const session = requireNonEmpty(sessionId, "Session");
    return this.subjectAttendance.markAllPresent(assignment, session);
  }

  async rosterForSession(
    teachingAssignmentId: string,
    sessionId: string,
  ): Promise<SubjectAttendanceRosterRow[] | null> {
    const assignment = requireNonEmpty(teachingAssignmentId, "Class");
    const session = requireNonEmpty(sessionId, "Session");
    return this.subjectAttendance.rosterForSession(assignment, session);
  }

  async listSessions(teachingAssignmentId: string): Promise<SubjectAttendanceSession[]> {
    const assignment = requireNonEmpty(teachingAssignmentId, "Class");
    return this.subjectAttendance.listSessions(assignment);
  }

  async monitor(
    teachingAssignmentId: string,
    asOfDate: string,
  ): Promise<SubjectAttendanceMonitor | null> {
    const assignment = requireNonEmpty(teachingAssignmentId, "Class");
    const date = requireIsoDate(asOfDate);
    return this.subjectAttendance.monitor(assignment, date);
  }
}
