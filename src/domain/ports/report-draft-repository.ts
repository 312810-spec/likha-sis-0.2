import type {
  ReportCardDraft,
  ReportCardDraftComparison,
  ReportCardDraftSourceCheck,
} from "../report-readiness";

export interface ReportDraftRepository {
  checkReportCardDraftSource(
    classRecordId: string,
    draftId: string,
  ): Promise<ReportCardDraftSourceCheck | null>;
  captureReportCardDraft(classRecordId: string): Promise<ReportCardDraft | null>;
  listRecentReportCardDrafts(classRecordId: string): Promise<ReportCardDraft[]>;
  compareReportCardDraft(
    classRecordId: string,
    draftId: string,
  ): Promise<ReportCardDraftComparison | null>;
}
