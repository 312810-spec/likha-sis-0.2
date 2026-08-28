import type { SectionMembership } from "../section";

/**
 * Read-only access to a learner's retained section placements. School scope
 * comes exclusively from the authenticated backend session.
 */
export interface EnrollmentHistoryRepository {
  listByLearner(learnerId: string): Promise<SectionMembership[]>;
}
