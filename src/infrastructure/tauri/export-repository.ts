import { invoke } from "@tauri-apps/api/core";
import type { ReportCardExportResult, Sf2ExportResult } from "../../domain/export";
import type { ExportRepository } from "../../domain/ports/export-repository";

/** Tauri/SQLite implementation of {@link ExportRepository}. */
export class TauriExportRepository implements ExportRepository {
  exportSectionMonthlySf2(
    sectionId: string,
    year: number,
    month: number,
  ): Promise<Sf2ExportResult | null> {
    return invoke<Sf2ExportResult | null>("export_section_monthly_sf2", {
      sectionId,
      year,
      month,
    });
  }

  exportClassRecordReportCard(classRecordId: string): Promise<ReportCardExportResult | null> {
    return invoke<ReportCardExportResult | null>("export_class_record_report_card", {
      classRecordId,
    });
  }
}
