import type { Section, SectionMembership, SectionRosterMember } from "../section";

/**
 * Repository port for sections and section memberships. Every method is
 * implicitly scoped to the current session's school — there is
 * intentionally no `schoolId` parameter anywhere in this interface. See
 * `LearnerRepository` for the same convention.
 */
export interface SectionRepository {
  list(): Promise<Section[]>;
  create(schoolYear: string, gradeLevel: string, name: string): Promise<Section>;
  enroll(sectionId: string, learnerId: string, startsOn: string): Promise<SectionMembership | null>;
  roster(sectionId: string, asOfDate: string): Promise<SectionRosterMember[]>;
}
