import type {
  AttendanceRecord,
  AttendanceRosterEntry,
  AttendanceStatus,
  MonthlyAttendanceReport,
} from "../attendance";

/**
 * Repository port for attendance. Every method is implicitly scoped to the
 * current session's school — there is intentionally no `schoolId`
 * parameter anywhere in this interface. `sectionId` IS a parameter,
 * following the same convention as `learnerId`/`sectionId` in
 * `SectionRepository`: it identifies WHICH section, isolation is still
 * enforced server-side against the session's school. See ADR-0004 and
 * `LearnerRepository` for the same convention.
 */
export interface AttendanceRepository {
  rosterForDate(sectionId: string, attendanceDate: string): Promise<AttendanceRosterEntry[]>;
  record(
    sectionId: string,
    learnerId: string,
    attendanceDate: string,
    status: AttendanceStatus,
  ): Promise<AttendanceRecord | null>;
  /** Marks every currently-unmarked learner on the roster as Present,
   * leaving any already-marked learner untouched, and returns the
   * resulting roster. See `repository::attendance::bulk_mark_present`. */
  bulkMarkPresent(sectionId: string, attendanceDate: string): Promise<AttendanceRosterEntry[]>;
  monthlySummary(sectionId: string, year: number, month: number): Promise<MonthlyAttendanceReport>;
}
