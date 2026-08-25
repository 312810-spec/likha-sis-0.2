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
  /** How many assessment items exist for this class record at all --
   * distinguishes "nothing set up yet" from "set up but not yet scored,"
   * which `recordedCount`/`totalEligible` alone cannot (both are
   * legitimately 0 in either case). */
  itemCount: number;
  /** How many learner scores (of any status) are recorded across every
   * item in this class record. */
  recordedCount: number;
  /** How many roster entries are eligible to be scored under this class
   * record's section+grading-period range, per item -- multiply by
   * `itemCount` for the theoretical maximum `recordedCount` could reach
   * once every item is fully scored. */
  totalEligible: number;
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
