import type { AttendanceRecord, AttendanceRosterEntry, AttendanceStatus } from "../attendance";

/**
 * Daily-only official attendance port for My Advisory.
 *
 * This deliberately excludes monthly summary and school-wide section
 * discovery. Every operation is authorized again by the native adviser
 * boundary added in PR #93; `sectionId` is only an input/navigation pointer,
 * never authorization evidence.
 */
export interface AdviserDailyAttendanceRepository {
  rosterForDate(sectionId: string, attendanceDate: string): Promise<AttendanceRosterEntry[]>;
  record(
    sectionId: string,
    learnerId: string,
    attendanceDate: string,
    status: AttendanceStatus,
  ): Promise<AttendanceRecord | null>;
  /** Marks only currently-unmarked learners Present and preserves existing marks. */
  bulkMarkPresent(sectionId: string, attendanceDate: string): Promise<AttendanceRosterEntry[]>;
}
