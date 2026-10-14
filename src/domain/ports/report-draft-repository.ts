import type { ReportCardDraft, ReportCardDraftComparison } from "../report-readiness";

export interface ReportDraftRepository {
  captureReportCardDraft(classRecordId: string): Promise<ReportCardDraft | null>;
  listRecentReportCardDrafts(classRecordId: string): Promise<ReportCardDraft[]>;
  compareReportCardDraft(
    classRecordId: string,
    draftId: string,
  ): Promise<ReportCardDraftComparison | null>;
}
