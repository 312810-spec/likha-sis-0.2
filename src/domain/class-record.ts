/** The workspace a teacher opens to record scores for one section, one
 * subject, one grading period. `weightPolicyId` is `null` only for a
 * class record created before this app supported explicit weight-policy
 * selection — see `ClassRecordDetail.weightPolicyId` for the resolved
 * (never-null) value grade computation actually uses. */
export interface ClassRecord {
  id: string;
  schoolId: string;
  sectionId: string;
  subjectId: string;
  gradingPeriodId: string;
  weightPolicyId: string | null;
  createdAt: string;
}

/** A class record joined with the names a list/picker screen needs, so it
 * doesn't need a separate round trip per row. `weightPolicyId`/
 * `weightPolicyName` are always resolved (never empty) — a class record
 * predating explicit weight-policy selection shows the current default
 * policy here, exactly the one grade computation actually applies to it. */
export interface ClassRecordDetail {
  id: string;
  schoolId: string;
  sectionId: string;
  sectionName: string;
  subjectId: string;
  subjectName: string;
  gradingPeriodId: string;
  gradingPeriodLabel: string;
  schoolYear: string;
  weightPolicyId: string;
  weightPolicyName: string;
  createdAt: string;
}

/** A named, versioned DepEd grade-weighting policy — which learning-area
 * group it applies to and its source citation. Reference data, not
 * school-scoped. A teacher picks one explicitly per class record — never
 * inferred from a subject's name. */
export interface GradingWeightPolicy {
  id: string;
  name: string;
  sourceCitation: string;
  isDefault: boolean;
}
