import type {
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf2ExportResult,
  Sf4ExportResult,
  Sf5ExportResult,
  Sf6ExportResult,
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
  exportSchoolMonthlyAttendanceSf4(year: number, month: number): Promise<Sf4ExportResult | null>;
  exportSectionEosySf5(sectionId: string, schoolYear: string): Promise<Sf5ExportResult | null>;
  exportSchoolEosySf6(schoolYear: string): Promise<Sf6ExportResult | null>;
  exportClassRecordReportCard(classRecordId: string): Promise<ReportCardExportResult | null>;
  exportLearnerRoster(): Promise<LearnerRosterExportResult | null>;
  /** Opens the OS file manager at `filePath`, with the file selected.
   * `filePath` must be a path this app itself just returned from a
   * successful export -- never a user-typed or otherwise untrusted
   * string (see `TauriExportRepository`'s doc comment for why). */
  revealExportedFile(filePath: string): Promise<void>;
}
