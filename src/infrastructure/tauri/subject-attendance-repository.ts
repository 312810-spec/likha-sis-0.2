import type {
  EntryStatus,
  RecordEntryOutcome,
  SubjectAttendanceMonitor,
  SubjectAttendanceRosterRow,
  SubjectAttendanceSession,
} from "../../domain/subject-attendance";
import type { SubjectAttendanceRepository } from "../../domain/ports/subject-attendance-repository";
import { invoke } from "./invoke";

/** Tauri adapter for `commands::subject_attendance::*`. */
export class TauriSubjectAttendanceRepository implements SubjectAttendanceRepository {
  openSession(
    teachingAssignmentId: string,
    sessionDate: string,
  ): Promise<SubjectAttendanceSession | null> {
    return invoke<SubjectAttendanceSession | null>("open_subject_attendance_session", {
      teachingAssignmentId,
      sessionDate,
    });
  }

  markNoClass(
    teachingAssignmentId: string,
    sessionDate: string,
  ): Promise<SubjectAttendanceSession | null> {
    return invoke<SubjectAttendanceSession | null>("mark_subject_attendance_no_class", {
      teachingAssignmentId,
      sessionDate,
    });
  }

  recordEntry(
    teachingAssignmentId: string,
    sessionId: string,
    membershipId: string,
    status: EntryStatus,
    note?: string,
  ): Promise<RecordEntryOutcome> {
    return invoke<RecordEntryOutcome>("record_subject_attendance_entry", {
      teachingAssignmentId,
      sessionId,
      membershipId,
      status,
      note: note ?? null,
    });
  }

  markAllPresent(
    teachingAssignmentId: string,
    sessionId: string,
  ): Promise<SubjectAttendanceRosterRow[] | null> {
    return invoke<SubjectAttendanceRosterRow[] | null>("mark_subject_attendance_all_present", {
      teachingAssignmentId,
      sessionId,
    });
  }

  rosterForSession(
    teachingAssignmentId: string,
    sessionId: string,
  ): Promise<SubjectAttendanceRosterRow[] | null> {
    return invoke<SubjectAttendanceRosterRow[] | null>("subject_attendance_roster_for_session", {
      teachingAssignmentId,
      sessionId,
    });
  }

  listSessions(teachingAssignmentId: string): Promise<SubjectAttendanceSession[]> {
    return invoke<SubjectAttendanceSession[]>("list_subject_attendance_sessions", {
      teachingAssignmentId,
    });
  }

  monitor(
    teachingAssignmentId: string,
    asOfDate: string,
  ): Promise<SubjectAttendanceMonitor | null> {
    return invoke<SubjectAttendanceMonitor | null>("subject_attendance_monitor", {
      teachingAssignmentId,
      asOfDate,
    });
  }
}
