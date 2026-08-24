import type { GradingPeriod, GradingPolicy, GradingPolicyPeriod } from "../grading";

/**
 * Repository port for grading policies (reference data) and grading
 * periods (school-scoped). School scope is never a parameter for the
 * period methods — it comes from the caller's authenticated session,
 * same convention as `SectionRepository`.
 */
export interface GradingRepository {
  listPolicies(): Promise<GradingPolicy[]>;
  listPolicyPeriods(policyId: string): Promise<GradingPolicyPeriod[]>;
  listPeriodsBySchoolYear(schoolYear: string): Promise<GradingPeriod[]>;
  createPeriod(
    schoolYear: string,
    policyPeriodId: string,
    startsOn: string,
    endsOn: string,
  ): Promise<GradingPeriod | null>;
}
