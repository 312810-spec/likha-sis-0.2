import type {
  ReportPreparationReview,
  ReportPreparationReviewRequest,
  ReportPreparationReviewSourceCheck,
} from "../report-readiness";

export interface ReportPreparationReviewRepository {
  checkReportCardPreparationReviewSource(
    classRecordId: string,
    reviewId: string,
  ): Promise<ReportPreparationReviewSourceCheck | null>;
  recordReportCardPreparationReview(
    classRecordId: string,
    request: ReportPreparationReviewRequest,
  ): Promise<ReportPreparationReview | null>;
  listRecentReportCardPreparationReviews(classRecordId: string): Promise<ReportPreparationReview[]>;
}
