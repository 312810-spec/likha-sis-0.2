import type { ReportPreparationReview, ReportPreparationReviewRequest } from "../report-readiness";

export interface ReportPreparationReviewRepository {
  recordReportCardPreparationReview(
    classRecordId: string,
    request: ReportPreparationReviewRequest,
  ): Promise<ReportPreparationReview | null>;
  listRecentReportCardPreparationReviews(classRecordId: string): Promise<ReportPreparationReview[]>;
}
