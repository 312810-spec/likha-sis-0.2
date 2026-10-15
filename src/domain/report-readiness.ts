import type { FieldDisclosure } from "./export";
import type { ComputedTermGrade } from "./learner-score";

/** Read-time bound-review evidence only; never issue authorization. */
export interface ReportPreparationReviewSourceCheck {
  reviewId: string;
  draftId: string;
  classRecordId: string;
  snapshotSha256: string;
  sourceVersion: string;
  storedSourceSha256: string;
  currentSourceSha256: string | null;
  sourceStatus: "matches" | "changed" | "unsupported_version";
  checkedAt: string;
  evidenceScope: "read_time_preparation_evidence_not_issue_authorization";
  officialFidelity: "not_verified";
}

/** Preparation review only, never grade approval, issuance or source verification. */
export interface ReportPreparationReviewRequest {
  draftId: string;
  requestId: string;
  expectedSnapshotSha256: string;
  expectedSourceSha256: string;
  teacherConfirmed: boolean;
  notes: string;
}
export interface ReportPreparationReview {
  id: string;
  classRecordId: string;
  draftId: string;
  requestId: string;
  stage: "review";
  snapshotSha256: string;
  sourceSha256: string;
  sourceVersion: string;
  notes: string;
  reviewedByUserId: string;
  reviewedAt: string;
}

/** Read-time local readiness evidence only; never review/issuance permission. */
export interface ReportCardDraftSourceCheck {
  draftId: string;
  classRecordId: string;
  sourceStatus: "matches" | "changed" | "legacy_unavailable" | "unsupported_version";
  sourceVersion: string | null;
  storedSourceSha256: string | null;
  currentSourceSha256: string | null;
}

/** Native-retained preparation evidence, never reviewed or issued. */
export interface ReportCardDraft {
  id: string;
  classRecordId: string;
  stage: "draft";
  snapshot: ReportCardReadiness;
  snapshotSha256: string;
  createdByUserId: string;
  createdAt: string;
}

/** Read-only projection comparison, explicitly not raw-source freshness or approval. */
export interface ReportCardDraftComparison {
  draftId: string;
  classRecordId: string;
  storedSnapshotSha256: string;
  projectionMatches: boolean;
  changedFields: string[];
  current: ReportCardReadiness;
  comparisonScope: "reporting_projection_only_not_source_lock_or_approval";
}

/** Point-in-time preparation evidence, not issuance or official-form approval. */
export interface ReportCardReadiness {
  classRecordId: string;
  schoolYear: string;
  sectionName: string;
  subjectName: string;
  gradingPeriodLabel: string;
  startsOn: string;
  endsOn: string;
  weightPolicyId: string;
  checkedAt: string;
  learnerCount: number;
  missingGradeCount: number;
  provisionalGradeCount: number;
  completeGradeCount: number;
  missingLrnCount: number;
  officialFidelity: string;
  learners: Array<{
    learnerId: string;
    givenName: string;
    familyName: string;
    lrnMissing: boolean;
    grade: ComputedTermGrade | null;
    issue: string | null;
  }>;
  disclosure: FieldDisclosure;
}
