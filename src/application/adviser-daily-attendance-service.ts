import { ValidationError } from "../domain/errors";
import { ATTENDANCE_STATUSES } from "../domain/attendance";
import type {
  AttendanceRecord,
  AttendanceRosterEntry,
  AttendanceStatus,
} from "../domain/attendance";
import type { AdviserDailyAttendanceRepository } from "../domain/ports/adviser-daily-attendance-repository";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayAsIsoDate(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function requireSectionId(sectionId: string): string {
  const trimmed = sectionId.trim();
  if (!trimmed) throw new ValidationError("Section is required.");
  return trimmed;
}

function requireAttendanceDate(attendanceDate: string, now: Date): string {
  if (!DATE_PATTERN.test(attendanceDate)) {
    throw new ValidationError("Date must be in YYYY-MM-DD format.");
  }
  if (attendanceDate > todayAsIsoDate(now)) {
    throw new ValidationError("Attendance cannot be recorded for a future date.");
  }
  return attendanceDate;
}

/**
 * Application boundary for official daily attendance inside My Advisory.
 * It intentionally exposes no monthly or school-wide operations. Native
 * commands still revalidate adviser/School-Head authority for every call.
 */
export class AdviserDailyAttendanceApplicationService {
  constructor(
    private readonly attendance: AdviserDailyAttendanceRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async rosterForDate(sectionId: string, attendanceDate: string): Promise<AttendanceRosterEntry[]> {
    return this.attendance.rosterForDate(
      requireSectionId(sectionId),
      requireAttendanceDate(attendanceDate, this.now()),
    );
  }

  async recordAttendance(
    sectionId: string,
    learnerId: string,
    attendanceDate: string,
    status: AttendanceStatus,
  ): Promise<AttendanceRecord | null> {
    const trimmedLearnerId = learnerId.trim();
    if (!trimmedLearnerId) throw new ValidationError("Learner is required.");
    if (!ATTENDANCE_STATUSES.includes(status)) {
      throw new ValidationError("Unrecognized attendance status.");
    }

    return this.attendance.record(
      requireSectionId(sectionId),
      trimmedLearnerId,
      requireAttendanceDate(attendanceDate, this.now()),
      status,
    );
  }

  async bulkMarkPresent(
    sectionId: string,
    attendanceDate: string,
  ): Promise<AttendanceRosterEntry[]> {
    return this.attendance.bulkMarkPresent(
      requireSectionId(sectionId),
      requireAttendanceDate(attendanceDate, this.now()),
    );
  }
}
