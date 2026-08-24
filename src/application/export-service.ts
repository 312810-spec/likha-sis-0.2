import { ValidationError } from "../domain/errors";
import type {
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf2ExportResult,
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
}
