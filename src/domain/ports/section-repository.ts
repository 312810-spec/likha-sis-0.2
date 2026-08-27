import type {
  EndEnrollmentResult,
  EnrollMembershipResult,
  EnrollmentCandidate,
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
  /**
   * Every learner in the current school with their current open membership
   * state, for the "Enroll learner" picker. The authoritative eligibility
   * check is always {@link enrollMembership}, never this list.
   */
  listEnrollableLearners(): Promise<EnrollmentCandidate[]>;
  /**
   * Place an existing, eligible learner into a section as of `startsOn`
   * (`YYYY-MM-DD`), opening a fresh membership. Never throws for an
   * expected negative case — those come back as an
   * {@link EnrollMembershipResult} variant. Never moves a learner who is
   * already enrolled: that is `alreadyEnrolled`, and the caller must
   * choose transfer explicitly.
   */
  enrollMembership(input: {
    learnerId: string;
    sectionId: string;
    startsOn: string;
  }): Promise<EnrollMembershipResult>;
}
