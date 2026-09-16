import type {
  AttendanceRecord,
  AttendanceRosterEntry,
  AttendanceStatus,
} from "../../domain/attendance";
import type { AdviserDailyAttendanceRepository } from "../../domain/ports/adviser-daily-attendance-repository";
import { invoke } from "./invoke";

/** Tauri adapter for the adviser-authorized official daily attendance commands. */
export class TauriAdviserDailyAttendanceRepository implements AdviserDailyAttendanceRepository {
  rosterForDate(sectionId: string, attendanceDate: string): Promise<AttendanceRosterEntry[]> {
    return invoke<AttendanceRosterEntry[]>("adviser_attendance_roster_for_date", {
      sectionId,
      attendanceDate,
    });
  }

  record(
    sectionId: string,
    learnerId: string,
    attendanceDate: string,
    status: AttendanceStatus,
  ): Promise<AttendanceRecord | null> {
    return invoke<AttendanceRecord | null>("adviser_record_attendance", {
      sectionId,
      learnerId,
      attendanceDate,
      status,
    });
  }

  bulkMarkPresent(sectionId: string, attendanceDate: string): Promise<AttendanceRosterEntry[]> {
    return invoke<AttendanceRosterEntry[]>("adviser_bulk_mark_attendance_present", {
      sectionId,
      attendanceDate,
    });
  }
}
