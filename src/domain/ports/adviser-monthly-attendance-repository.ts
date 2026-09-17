import type { MonthlyAttendanceReport } from "../attendance";
import type { Sf2ExportResult } from "../export";

/** Trusted native boundary used by My Advisory for monthly attendance work. */
export interface AdviserMonthlyAttendanceRepository {
  summary(sectionId: string, year: number, month: number): Promise<MonthlyAttendanceReport>;
  exportSf2(sectionId: string, year: number, month: number): Promise<Sf2ExportResult>;
}
