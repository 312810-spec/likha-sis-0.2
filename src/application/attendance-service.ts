import { ValidationError } from "../domain/errors";
import { ATTENDANCE_STATUSES } from "../domain/attendance";
import type {
  AttendanceRecord,
  AttendanceRosterEntry,
  AttendanceStatus,
  MonthlyAttendanceReport,
} from "../domain/attendance";
import type { AttendanceRepository } from "../domain/ports/attendance-repository";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayAsIsoDate(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function requireSectionId(sectionId: string): string {
  const trimmed = sectionId.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("Section is required.");
  }
  return trimmed;
}

/**
 * Orchestrates attendance-related use cases. UI code depends on this, never
 * directly on an `AttendanceRepository`. School scope is never a parameter
 * here — it comes from the caller's authenticated session on the Rust
 * side. `sectionId` IS a parameter, since attendance is recorded per
 * section — see `LearnerApplicationService` for the school-scope
 * convention.
 *
 * `now` is injected (defaulting to the real clock) so future-date
 * rejection is testable without depending on the actual wall clock.
 */
export class AttendanceApplicationService {
  constructor(
    private readonly attendance: AttendanceRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async recordAttendance(
    sectionId: string,
    learnerId: string,
    attendanceDate: string,
    status: AttendanceStatus,
  ): Promise<AttendanceRecord | null> {
    const trimmedSectionId = requireSectionId(sectionId);
    const trimmedLearnerId = learnerId.trim();
    if (trimmedLearnerId.length === 0) {
      throw new ValidationError("Learner is required.");
    }
    if (!DATE_PATTERN.test(attendanceDate)) {
      throw new ValidationError("Date must be in YYYY-MM-DD format.");
    }
    if (attendanceDate > todayAsIsoDate(this.now())) {
      throw new ValidationError("Attendance cannot be recorded for a future date.");
    }
    if (!ATTENDANCE_STATUSES.includes(status)) {
      throw new ValidationError("Unrecognized attendance status.");
    }

    return this.attendance.record(trimmedSectionId, trimmedLearnerId, attendanceDate, status);
  }

  async rosterForDate(sectionId: string, attendanceDate: string): Promise<AttendanceRosterEntry[]> {
    return this.attendance.rosterForDate(requireSectionId(sectionId), attendanceDate);
  }

  async bulkMarkPresent(
    sectionId: string,
    attendanceDate: string,
  ): Promise<AttendanceRosterEntry[]> {
    const trimmedSectionId = requireSectionId(sectionId);
    if (!DATE_PATTERN.test(attendanceDate)) {
      throw new ValidationError("Date must be in YYYY-MM-DD format.");
    }
    if (attendanceDate > todayAsIsoDate(this.now())) {
      throw new ValidationError("Attendance cannot be recorded for a future date.");
    }

    return this.attendance.bulkMarkPresent(trimmedSectionId, attendanceDate);
  }

  async monthlySummary(
    sectionId: string,
    year: number,
    month: number,
  ): Promise<MonthlyAttendanceReport> {
    const trimmedSectionId = requireSectionId(sectionId);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new ValidationError("Month must be between 1 and 12.");
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new ValidationError("Year is out of range.");
    }
    const now = this.now();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    if (year > currentYear || (year === currentYear && month > currentMonth)) {
      throw new ValidationError("Cannot summarize a month that hasn't started yet.");
    }

    return this.attendance.monthlySummary(trimmedSectionId, year, month);
  }
}
