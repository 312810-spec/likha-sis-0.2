import type { MonthlyAttendanceReport } from "../../domain/attendance";
import type { Sf2ExportResult } from "../../domain/export";
import type { AdviserMonthlyAttendanceRepository } from "../../domain/ports/adviser-monthly-attendance-repository";
import { invoke } from "./invoke";

/** Tauri adapter for adviser-authorized monthly preview and SF2-inspired export. */
export class TauriAdviserMonthlyAttendanceRepository implements AdviserMonthlyAttendanceRepository {
  summary(sectionId: string, year: number, month: number): Promise<MonthlyAttendanceReport> {
    return invoke<MonthlyAttendanceReport>("adviser_monthly_attendance_summary", {
      sectionId,
      year,
      month,
    });
  }

  exportSf2(sectionId: string, year: number, month: number): Promise<Sf2ExportResult> {
    return invoke<Sf2ExportResult>("adviser_export_section_monthly_sf2", {
      sectionId,
      year,
      month,
    });
  }
}
