import { ValidationError } from "../domain/errors";
import type { SchoolAttendanceRepository } from "../domain/ports/school-attendance-repository";
import type { SchoolDayAttendanceTotals } from "../domain/attendance";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Orchestrates school-wide attendance reads for School Head screens. UI
 * code depends on this, never directly on a `SchoolAttendanceRepository`.
 * School scope is never a parameter — it comes from the caller's
 * authenticated session on the Rust side.
 */
export class SchoolAttendanceApplicationService {
  constructor(private readonly repo: SchoolAttendanceRepository) {}

  async dayTotals(date: string): Promise<SchoolDayAttendanceTotals> {
    const trimmed = date.trim();
    if (!DATE_PATTERN.test(trimmed)) {
      throw new ValidationError("Date must be in YYYY-MM-DD format.");
    }
    return this.repo.dayTotals(trimmed);
  }
}
