import type { ClassRecord, ClassRecordDetail, GradingWeightPolicy } from "../class-record";

/** Repository port for class records. Implicitly scoped to the current
 * session's school — no `schoolId` parameter anywhere here, same
 * convention as {@link SectionRepository}. */
export interface ClassRecordRepository {
  list(): Promise<ClassRecordDetail[]>;
  create(
    sectionId: string,
    subjectId: string,
    gradingPeriodId: string,
    weightPolicyId: string,
  ): Promise<ClassRecord | null>;
  listGradingWeightPolicies(): Promise<GradingWeightPolicy[]>;
}
