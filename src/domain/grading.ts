/**
 * A named, versioned grading-period structure with its own source
 * citation — DepEd's terminology here is policy-driven, not fixed (it
 * changed within this project's own lifetime, see
 * `docs/adr/0010-grading-period-foundation.md`), so this is reference
 * data rather than a hardcoded set of quarters/terms.
 */
export interface GradingPolicy {
  id: string;
  name: string;
  sourceCitation: string;
  isDefault: boolean;
  createdAt: string;
}

export interface GradingPolicyPeriod {
  id: string;
  policyId: string;
  sequence: number;
  label: string;
}

/** A school's actual grading period for one school year — a policy
 * period's fixed label, instantiated with school-entered dates. */
export interface GradingPeriod {
  id: string;
  schoolId: string;
  schoolYear: string;
  policyPeriodId: string;
  label: string;
  startsOn: string;
  endsOn: string;
  createdAt: string;
}
