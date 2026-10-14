import type { ReportCardDraft } from "../report-readiness";

export interface ReportDraftRepository {
  captureReportCardDraft(classRecordId: string): Promise<ReportCardDraft | null>;
  listRecentReportCardDrafts(classRecordId: string): Promise<ReportCardDraft[]>;
}
