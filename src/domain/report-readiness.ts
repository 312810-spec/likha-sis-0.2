import type { FieldDisclosure } from "./export";
import type { ComputedTermGrade } from "./learner-score";

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
