import type { Learner } from "../learner";

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
  create(givenName: string, familyName: string): Promise<Learner>;
}
