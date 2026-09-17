import type { MonthlyAttendanceReport } from "../domain/attendance";
import { ValidationError } from "../domain/errors";
import type { Sf2ExportResult } from "../domain/export";
import type { AdviserMonthlyAttendanceRepository } from "../domain/ports/adviser-monthly-attendance-repository";

function requireSectionId(sectionId: string): string {
  const trimmed = sectionId.trim();
  if (!trimmed) throw new ValidationError("Section is required.");
  return trimmed;
}

function requireYear(year: number): number {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    throw new ValidationError("Year is invalid.");
  }
  return year;
}

function requireMonth(month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ValidationError("Month must be from 1 to 12.");
  }
  return month;
}

/**
 * My Advisory monthly-attendance application boundary.
 *
 * Validation here improves teacher feedback only. The native Rust commands
 * remain authoritative and revalidate adviser/School-Head access at month end.
 */
export class AdviserMonthlyAttendanceApplicationService {
  constructor(private readonly attendance: AdviserMonthlyAttendanceRepository) {}

  summary(sectionId: string, year: number, month: number): Promise<MonthlyAttendanceReport> {
    return this.attendance.summary(
      requireSectionId(sectionId),
      requireYear(year),
      requireMonth(month),
    );
  }

  exportSf2(sectionId: string, year: number, month: number): Promise<Sf2ExportResult> {
    return this.attendance.exportSf2(
      requireSectionId(sectionId),
      requireYear(year),
      requireMonth(month),
    );
  }
}
