import type {
  EndEnrollmentResult,
  Section,
  SectionMembership,
  SectionRosterMember,
  TransferResult,
} from "../section";

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
  /**
   * Move a currently-enrolled learner's specific open membership to another
   * section, effective `effectiveOn` (`YYYY-MM-DD`). The old membership is
   * closed and a new one opened atomically on the Rust side. Never throws
   * for an expected negative case — those come back as a {@link TransferResult}
   * variant.
   */
  transferMembership(input: {
    learnerId: string;
    fromMembershipId: string;
    toSectionId: string;
    effectiveOn: string;
  }): Promise<TransferResult>;
  /**
   * End a currently-enrolled learner's specific open membership, effective
   * `effectiveOn`. Sets the membership's end date (never deletes), so the
   * placement history is preserved.
   */
  endMembership(input: {
    learnerId: string;
    membershipId: string;
    effectiveOn: string;
  }): Promise<EndEnrollmentResult>;
}
