import { ValidationError } from "../domain/errors";
import type {
  ClassSummaryExportResult,
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf10ExportResult,
  Sf2ExportResult,
  Sf4ExportResult,
  Sf5ExportResult,
  Sf6ExportResult,
} from "../domain/export";
import type { ExportRepository } from "../domain/ports/export-repository";
import type { ReportReadinessRepository } from "../domain/ports/report-readiness-repository";
import type {
  ReportCardDraft,
  ReportCardDraftComparison,
  ReportCardDraftSourceCheck,
  ReportCardReadiness,
  ReportPreparationReview,
  ReportPreparationReviewRequest,
} from "../domain/report-readiness";
import type { ReportDraftRepository } from "../domain/ports/report-draft-repository";
import type { ReportPreparationReviewRepository } from "../domain/ports/report-preparation-review-repository";

/**
 * Orchestrates official-form export use cases. UI code depends on this,
 * never directly on an `ExportRepository`. School scope is never a
 * parameter here — it comes from the caller's authenticated session on
 * the Rust side. Validation mirrors `AttendanceApplicationService`'s
 * month/year/section checks — kept as its own small copy rather than a
 * shared helper, since the two services validate for different reasons
 * (one to reject a report request, one to reject an export request) and
 * may diverge later.
 */
export class ExportApplicationService {
  constructor(
    private readonly exports: ExportRepository,
    private readonly readiness?: ReportReadinessRepository,
    private readonly drafts?: ReportDraftRepository,
    private readonly reviews?: ReportPreparationReviewRepository,
  ) {}

  recordReportCardPreparationReview(
    classRecordId: string,
    request: ReportPreparationReviewRequest,
  ): Promise<ReportPreparationReview | null> {
    const id = classRecordId.trim();
    const draftId = request.draftId.trim();
    const requestId = request.requestId.trim().toLowerCase();
    if (!id || !draftId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(requestId))
      throw new ValidationError("Class record, draft and review request identity are required.");
    if (
      !request.teacherConfirmed ||
      !/^[0-9a-f]{64}$/.test(request.expectedSnapshotSha256) ||
      !/^[0-9a-f]{64}$/.test(request.expectedSourceSha256) ||
      [...request.notes.trim()].length > 2000
    )
      throw new ValidationError(
        "Confirm preparation review with valid evidence and bounded notes.",
      );
    if (!this.reviews) throw new ValidationError("Preparation reviews are unavailable.");
    return this.reviews.recordReportCardPreparationReview(id, {
      draftId,
      requestId,
      expectedSnapshotSha256: request.expectedSnapshotSha256,
      expectedSourceSha256: request.expectedSourceSha256,
      teacherConfirmed: true,
      notes: request.notes.trim(),
    });
  }

  listRecentReportCardPreparationReviews(
    classRecordId: string,
  ): Promise<ReportPreparationReview[]> {
    const id = classRecordId.trim();
    if (!id) throw new ValidationError("Class record is required.");
    if (!this.reviews) throw new ValidationError("Preparation reviews are unavailable.");
    return this.reviews.listRecentReportCardPreparationReviews(id);
  }

  captureReportCardDraft(classRecordId: string): Promise<ReportCardDraft | null> {
    const id = classRecordId.trim();
    if (!id) throw new ValidationError("Class record is required.");
    if (!this.drafts) throw new ValidationError("Reporting drafts are unavailable.");
    return this.drafts.captureReportCardDraft(id);
  }

  checkReportCardDraftSource(
    classRecordId: string,
    draftId: string,
  ): Promise<ReportCardDraftSourceCheck | null> {
    const record = classRecordId.trim();
    const draft = draftId.trim();
    if (!record || !draft) throw new ValidationError("Class record and draft are required.");
    if (!this.drafts) throw new ValidationError("Reporting source check is unavailable.");
    return this.drafts.checkReportCardDraftSource(record, draft);
  }

  compareReportCardDraft(
    classRecordId: string,
    draftId: string,
  ): Promise<ReportCardDraftComparison | null> {
    const record = classRecordId.trim();
    const draft = draftId.trim();
    if (!record || !draft) throw new ValidationError("Class record and draft are required.");
    if (!this.drafts) throw new ValidationError("Reporting draft comparison is unavailable.");
    return this.drafts.compareReportCardDraft(record, draft);
  }

  listRecentReportCardDrafts(classRecordId: string): Promise<ReportCardDraft[]> {
    const id = classRecordId.trim();
    if (!id) throw new ValidationError("Class record is required.");
    if (!this.drafts) throw new ValidationError("Reporting drafts are unavailable.");
    return this.drafts.listRecentReportCardDrafts(id);
  }

  previewReportCard(classRecordId: string): Promise<ReportCardReadiness | null> {
    const id = classRecordId.trim();
    if (!id) throw new ValidationError("Class record is required.");
    if (!this.readiness) throw new ValidationError("Reporting preview is unavailable.");
    return this.readiness.previewReportCard(id);
  }

  async exportSectionMonthlySf2(
    sectionId: string,
    year: number,
    month: number,
  ): Promise<Sf2ExportResult | null> {
    const trimmedSectionId = sectionId.trim();
    if (trimmedSectionId.length === 0) {
      throw new ValidationError("Section is required.");
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new ValidationError("Month must be between 1 and 12.");
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new ValidationError("Year is out of range.");
    }

    return this.exports.exportSectionMonthlySf2(trimmedSectionId, year, month);
  }

  async exportSchoolMonthlyAttendanceSf4(
    year: number,
    month: number,
  ): Promise<Sf4ExportResult | null> {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new ValidationError("Month must be between 1 and 12.");
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new ValidationError("Year is out of range.");
    }

    return this.exports.exportSchoolMonthlyAttendanceSf4(year, month);
  }

  async exportSectionEosySf5(
    sectionId: string,
    schoolYear: string,
  ): Promise<Sf5ExportResult | null> {
    const trimmedSectionId = sectionId.trim();
    if (trimmedSectionId.length === 0) {
      throw new ValidationError("Section is required.");
    }
    const trimmedSchoolYear = schoolYear.trim();
    if (trimmedSchoolYear.length === 0) {
      throw new ValidationError("School year is required.");
    }

    return this.exports.exportSectionEosySf5(trimmedSectionId, trimmedSchoolYear);
  }

  async exportSchoolEosySf6(schoolYear: string): Promise<Sf6ExportResult | null> {
    const trimmedSchoolYear = schoolYear.trim();
    if (trimmedSchoolYear.length === 0) {
      throw new ValidationError("School year is required.");
    }

    return this.exports.exportSchoolEosySf6(trimmedSchoolYear);
  }

  async exportClassRecordReportCard(classRecordId: string): Promise<ReportCardExportResult | null> {
    const trimmedRecordId = classRecordId.trim();
    if (trimmedRecordId.length === 0) {
      throw new ValidationError("Class record is required.");
    }

    return this.exports.exportClassRecordReportCard(trimmedRecordId);
  }

  async exportClassRecordSummary(classRecordId: string): Promise<ClassSummaryExportResult | null> {
    const trimmedRecordId = classRecordId.trim();
    if (trimmedRecordId.length === 0) {
      throw new ValidationError("Class record is required.");
    }

    return this.exports.exportClassRecordSummary(trimmedRecordId);
  }

  async exportLearnerRoster(): Promise<LearnerRosterExportResult | null> {
    return this.exports.exportLearnerRoster();
  }

  async exportLearnerPermanentRecordSf10(learnerId: string): Promise<Sf10ExportResult | null> {
    const trimmedLearnerId = learnerId.trim();
    if (trimmedLearnerId.length === 0) {
      throw new ValidationError("Learner is required.");
    }

    return this.exports.exportLearnerPermanentRecordSf10(trimmedLearnerId);
  }

  /** `filePath` must come from an export result this service itself
   * already returned -- never from a user-editable field -- so the
   * validation here is only a non-empty check, not a path/format check. */
  async revealExportedFile(filePath: string): Promise<void> {
    const trimmedPath = filePath.trim();
    if (trimmedPath.length === 0) {
      throw new ValidationError("File path is required.");
    }

    return this.exports.revealExportedFile(trimmedPath);
  }
}
