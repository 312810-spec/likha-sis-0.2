import type { ReportCardReadiness } from "../report-readiness";

export interface ReportReadinessRepository {
  previewReportCard(classRecordId: string): Promise<ReportCardReadiness | null>;
}
