import { invoke } from "@tauri-apps/api/core";
import type {
  AttendanceRecord,
  AttendanceRosterEntry,
  AttendanceStatus,
  MonthlyAttendanceReport,
} from "../../domain/attendance";
import type { AttendanceRepository } from "../../domain/ports/attendance-repository";

/** Tauri/SQLite implementation of {@link AttendanceRepository}. */
export class TauriAttendanceRepository implements AttendanceRepository {
  rosterForDate(sectionId: string, attendanceDate: string): Promise<AttendanceRosterEntry[]> {
    return invoke<AttendanceRosterEntry[]>("attendance_roster_for_date", {
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
    return invoke<AttendanceRecord | null>("record_attendance", {
      sectionId,
      learnerId,
      attendanceDate,
      status,
    });
  }

  bulkMarkPresent(sectionId: string, attendanceDate: string): Promise<AttendanceRosterEntry[]> {
    return invoke<AttendanceRosterEntry[]>("bulk_mark_attendance_present", {
      sectionId,
      attendanceDate,
    });
  }

  monthlySummary(sectionId: string, year: number, month: number): Promise<MonthlyAttendanceReport> {
    return invoke<MonthlyAttendanceReport>("monthly_attendance_summary", {
      sectionId,
      year,
      month,
    });
  }
}
