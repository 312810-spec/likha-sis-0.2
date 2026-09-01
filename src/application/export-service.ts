import { ValidationError } from "../domain/errors";
import type {
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf2ExportResult,
  Sf4ExportResult,
  Sf5ExportResult,
  Sf6ExportResult,
} from "../domain/export";
import type { ExportRepository } from "../domain/ports/export-repository";

/**
 * Orchestrates official-form export use cases. UI code depends on this,
 * never directly on an `ExportRepository`. School scope is never a
 * parameter here — it comes from the caller's authenticated session on
 * the Rust side. Validation mirrors `AttendanceApplicationService`'s
 * month/year/section checks — kept as its own small copy rather than a
 * shared helper, since the two services validate for different reasons
 * (one to reject a report request, one to reject an export request) and
 * may diverge later.
 */
export class ExportApplicationService {
  constructor(private readonly exports: ExportRepository) {}

  async exportSectionMonthlySf2(
    sectionId: string,
    year: number,
    month: number,
  ): Promise<Sf2ExportResult | null> {
    const trimmedSectionId = sectionId.trim();
    if (trimmedSectionId.length === 0) {
      throw new ValidationError("Section is required.");
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new ValidationError("Month must be between 1 and 12.");
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new ValidationError("Year is out of range.");
    }

    return this.exports.exportSectionMonthlySf2(trimmedSectionId, year, month);
  }

  async exportSchoolMonthlyAttendanceSf4(
    year: number,
    month: number,
  ): Promise<Sf4ExportResult | null> {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new ValidationError("Month must be between 1 and 12.");
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new ValidationError("Year is out of range.");
    }

    return this.exports.exportSchoolMonthlyAttendanceSf4(year, month);
  }

  async exportSectionEosySf5(
    sectionId: string,
    schoolYear: string,
  ): Promise<Sf5ExportResult | null> {
    const trimmedSectionId = sectionId.trim();
    if (trimmedSectionId.length === 0) {
      throw new ValidationError("Section is required.");
    }
    const trimmedSchoolYear = schoolYear.trim();
    if (trimmedSchoolYear.length === 0) {
      throw new ValidationError("School year is required.");
    }

    return this.exports.exportSectionEosySf5(trimmedSectionId, trimmedSchoolYear);
  }

  async exportSchoolEosySf6(schoolYear: string): Promise<Sf6ExportResult | null> {
    const trimmedSchoolYear = schoolYear.trim();
    if (trimmedSchoolYear.length === 0) {
      throw new ValidationError("School year is required.");
    }

    return this.exports.exportSchoolEosySf6(trimmedSchoolYear);
  }

  async exportClassRecordReportCard(classRecordId: string): Promise<ReportCardExportResult | null> {
    const trimmedRecordId = classRecordId.trim();
    if (trimmedRecordId.length === 0) {
      throw new ValidationError("Class record is required.");
    }

    return this.exports.exportClassRecordReportCard(trimmedRecordId);
  }

  async exportLearnerRoster(): Promise<LearnerRosterExportResult | null> {
    return this.exports.exportLearnerRoster();
  }

  /** `filePath` must come from an export result this service itself
   * already returned -- never from a user-editable field -- so the
   * validation here is only a non-empty check, not a path/format check. */
  async revealExportedFile(filePath: string): Promise<void> {
    const trimmedPath = filePath.trim();
    if (trimmedPath.length === 0) {
      throw new ValidationError("File path is required.");
    }

    return this.exports.revealExportedFile(trimmedPath);
  }
}
