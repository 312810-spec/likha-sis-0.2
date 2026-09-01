import { invoke } from "./invoke";
import type {
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf2ExportResult,
  Sf5ExportResult,
  Sf6ExportResult,
} from "../../domain/export";
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

  exportSectionEosySf5(sectionId: string, schoolYear: string): Promise<Sf5ExportResult | null> {
    return invoke<Sf5ExportResult | null>("export_section_eosy_sf5", {
      sectionId,
      schoolYear,
    });
  }

  exportSchoolEosySf6(schoolYear: string): Promise<Sf6ExportResult | null> {
    return invoke<Sf6ExportResult | null>("export_school_eosy_sf6", {
      schoolYear,
    });
  }

  exportClassRecordReportCard(classRecordId: string): Promise<ReportCardExportResult | null> {
    return invoke<ReportCardExportResult | null>("export_class_record_report_card", {
      classRecordId,
    });
  }

  exportLearnerRoster(): Promise<LearnerRosterExportResult | null> {
    return invoke<LearnerRosterExportResult | null>("export_learner_roster");
  }
}
