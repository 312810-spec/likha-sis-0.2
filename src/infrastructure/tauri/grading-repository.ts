import { invoke } from "./invoke";
import type { GradingPeriod, GradingPolicy, GradingPolicyPeriod } from "../../domain/grading";
import type { GradingRepository } from "../../domain/ports/grading-repository";

/** Tauri/SQLite implementation of {@link GradingRepository}. */
export class TauriGradingRepository implements GradingRepository {
  listPolicies(): Promise<GradingPolicy[]> {
    return invoke<GradingPolicy[]>("list_grading_policies");
  }

  listPolicyPeriods(policyId: string): Promise<GradingPolicyPeriod[]> {
    return invoke<GradingPolicyPeriod[]>("list_grading_policy_periods", { policyId });
  }

  listPeriodsBySchoolYear(schoolYear: string): Promise<GradingPeriod[]> {
    return invoke<GradingPeriod[]>("list_grading_periods_by_school_year", { schoolYear });
  }

  createPeriod(
    schoolYear: string,
    policyPeriodId: string,
    startsOn: string,
    endsOn: string,
  ): Promise<GradingPeriod | null> {
    return invoke<GradingPeriod | null>("create_grading_period", {
      schoolYear,
      policyPeriodId,
      startsOn,
      endsOn,
    });
  }
}
