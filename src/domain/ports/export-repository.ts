import type {
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf2ExportResult,
  Sf5ExportResult,
} from "../export";

/**
 * Repository port for official-form exports. School scope is never a
 * parameter — it comes from the caller's authenticated session on the
 * Rust side, same convention as `AttendanceRepository`.
 */
export interface ExportRepository {
  exportSectionMonthlySf2(
    sectionId: string,
    year: number,
    month: number,
  ): Promise<Sf2ExportResult | null>;
  exportSectionEosySf5(sectionId: string, schoolYear: string): Promise<Sf5ExportResult | null>;
  exportClassRecordReportCard(classRecordId: string): Promise<ReportCardExportResult | null>;
  exportLearnerRoster(): Promise<LearnerRosterExportResult | null>;
}
