import type { FieldDisclosure } from "./export";
import type { ComputedTermGrade } from "./learner-score";

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
