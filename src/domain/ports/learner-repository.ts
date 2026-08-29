import type { CreateLearnerResult, Learner } from "../learner";

/**
 * Repository port for learners. Every method here is implicitly scoped to
 * the current session's school — there is intentionally no `schoolId`
 * parameter anywhere in this interface, and no "list all learners"
 * method. Isolation is enforced server-side and derived from the active
 * session; it cannot be bypassed by a caller supplying a different scope,
 * because there is no such parameter to supply. See ADR-0004.
 */
export interface LearnerRepository {
  list(): Promise<Learner[]>;
  create(givenName: string, familyName: string, lrn?: string, sex?: "M" | "F"): Promise<Learner>;
  /**
   * Manual Create Learner's duplicate-aware entry point (Wave 2U) — see
   * `CreateLearnerResult`. `confirmed` distinguishes an initial
   * submission (`false`, the default) from an explicit "create separate
   * learner anyway" after a teacher has reviewed a
   * `duplicateCandidates` result; it never overrides an `lrnConflict`.
   */
  createWithDuplicateCheck(
    givenName: string,
    familyName: string,
    lrn: string | undefined,
    sex: "M" | "F" | undefined,
    confirmed: boolean,
  ): Promise<CreateLearnerResult>;
  updateProfile(
    learnerId: string,
    givenName: string,
    familyName: string,
    lrn?: string,
    sex?: "M" | "F",
  ): Promise<Learner | null>;
}
