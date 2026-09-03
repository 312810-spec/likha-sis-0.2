import { invoke } from "./invoke";
import type { SchoolAttendanceRepository } from "../../domain/ports/school-attendance-repository";
import type { SchoolDayAttendanceTotals } from "../../domain/attendance";

/** Tauri/SQLite implementation of {@link SchoolAttendanceRepository}. */
export class TauriSchoolAttendanceRepository implements SchoolAttendanceRepository {
  dayTotals(date: string): Promise<SchoolDayAttendanceTotals> {
    return invoke<SchoolDayAttendanceTotals>("school_attendance_day_totals", { date });
  }
}
