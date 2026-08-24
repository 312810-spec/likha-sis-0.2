import { ValidationError } from "../domain/errors";
import type { GradingPeriod, GradingPolicy, GradingPolicyPeriod } from "../domain/grading";
import type { GradingRepository } from "../domain/ports/grading-repository";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Orchestrates grading-period use cases. UI code depends on this, never
 * directly on a `GradingRepository`. School scope is never a parameter
 * here — it comes from the caller's authenticated session on the Rust
 * side. See `SectionApplicationService` for the same convention.
 */
export class GradingApplicationService {
  constructor(private readonly grading: GradingRepository) {}

  listPolicies(): Promise<GradingPolicy[]> {
    return this.grading.listPolicies();
  }

  async listPolicyPeriods(policyId: string): Promise<GradingPolicyPeriod[]> {
    const trimmed = policyId.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("Policy is required.");
    }
    return this.grading.listPolicyPeriods(trimmed);
  }

  async listPeriodsBySchoolYear(schoolYear: string): Promise<GradingPeriod[]> {
    const trimmed = schoolYear.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("School year is required.");
    }
    return this.grading.listPeriodsBySchoolYear(trimmed);
  }

  async createPeriod(
    schoolYear: string,
    policyPeriodId: string,
    startsOn: string,
    endsOn: string,
  ): Promise<GradingPeriod | null> {
    const trimmedSchoolYear = schoolYear.trim();
    const trimmedPeriodId = policyPeriodId.trim();
    if (trimmedSchoolYear.length === 0) {
      throw new ValidationError("School year is required.");
    }
    if (trimmedPeriodId.length === 0) {
      throw new ValidationError("Grading period is required.");
    }
    if (!DATE_PATTERN.test(startsOn) || !DATE_PATTERN.test(endsOn)) {
      throw new ValidationError("Dates must be in YYYY-MM-DD format.");
    }
    if (startsOn > endsOn) {
      throw new ValidationError("The start date must not be after the end date.");
    }

    return this.grading.createPeriod(trimmedSchoolYear, trimmedPeriodId, startsOn, endsOn);
  }
}
