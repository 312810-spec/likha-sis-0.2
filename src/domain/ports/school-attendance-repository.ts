import type { SchoolDayAttendanceTotals } from "../attendance";

/**
 * Read port for school-wide attendance figures. School scope is never a
 * parameter — the Rust side derives it from the authenticated session.
 */
export interface SchoolAttendanceRepository {
  /** School-wide present/absent/tardy headcount for the given `YYYY-MM-DD` date. */
  dayTotals(date: string): Promise<SchoolDayAttendanceTotals>;
}
