import { ValidationError } from "../domain/errors";
import type {
  EndEnrollmentResult,
  Section,
  SectionMembership,
  SectionRosterMember,
  TransferResult,
} from "../domain/section";
import type { SectionRepository } from "../domain/ports/section-repository";

const MAX_FIELD_LENGTH = 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Orchestrates section-related use cases (creating a section, enrolling a
 * learner into one). UI code depends on this, never directly on a
 * `SectionRepository`. School scope is never a parameter here — it comes
 * from the caller's authenticated session on the Rust side. See
 * `LearnerApplicationService` for the same convention.
 */
export class SectionApplicationService {
  constructor(private readonly sections: SectionRepository) {}

  async createSection(schoolYear: string, gradeLevel: string, name: string): Promise<Section> {
    const trimmedYear = schoolYear.trim();
    const trimmedGrade = gradeLevel.trim();
    const trimmedName = name.trim();
    if (trimmedYear.length === 0) {
      throw new ValidationError("School year is required.");
    }
    if (trimmedGrade.length === 0) {
      throw new ValidationError("Grade level is required.");
    }
    if (trimmedName.length === 0) {
      throw new ValidationError("Section name is required.");
    }
    if (
      trimmedYear.length > MAX_FIELD_LENGTH ||
      trimmedGrade.length > MAX_FIELD_LENGTH ||
      trimmedName.length > MAX_FIELD_LENGTH
    ) {
      throw new ValidationError(`Fields must be at most ${MAX_FIELD_LENGTH} characters.`);
    }

    return this.sections.create(trimmedYear, trimmedGrade, trimmedName);
  }

  listSections(): Promise<Section[]> {
    return this.sections.list();
  }

  async enrollLearner(
    sectionId: string,
    learnerId: string,
    startsOn: string,
  ): Promise<SectionMembership | null> {
    const trimmedSectionId = sectionId.trim();
    const trimmedLearnerId = learnerId.trim();
    if (trimmedSectionId.length === 0) {
      throw new ValidationError("Section is required.");
    }
    if (trimmedLearnerId.length === 0) {
      throw new ValidationError("Learner is required.");
    }
    if (!DATE_PATTERN.test(startsOn)) {
      throw new ValidationError("Start date must be in YYYY-MM-DD format.");
    }

    return this.sections.enroll(trimmedSectionId, trimmedLearnerId, startsOn);
  }

  async roster(sectionId: string, asOfDate: string): Promise<SectionRosterMember[]> {
    const trimmedSectionId = sectionId.trim();
    if (trimmedSectionId.length === 0) {
      throw new ValidationError("Section is required.");
    }
    if (!DATE_PATTERN.test(asOfDate)) {
      throw new ValidationError("Date must be in YYYY-MM-DD format.");
    }

    return this.sections.roster(trimmedSectionId, asOfDate);
  }

  /**
   * Transfer a currently-enrolled learner to another section. Validates the
   * shape of the request (ids present, date well-formed); the Rust side is
   * authoritative on authorization, same-section rejection, whether the
   * membership is still current, and whether the destination exists — those
   * come back as {@link TransferResult} variants, not thrown errors.
   */
  async transferMembership(input: {
    learnerId: string;
    fromMembershipId: string;
    toSectionId: string;
    effectiveOn: string;
  }): Promise<TransferResult> {
    const learnerId = input.learnerId.trim();
    const fromMembershipId = input.fromMembershipId.trim();
    const toSectionId = input.toSectionId.trim();
    if (learnerId.length === 0) {
      throw new ValidationError("Learner is required.");
    }
    if (fromMembershipId.length === 0) {
      throw new ValidationError("The current enrollment is required.");
    }
    if (toSectionId.length === 0) {
      throw new ValidationError("Destination section is required.");
    }
    if (!DATE_PATTERN.test(input.effectiveOn)) {
      throw new ValidationError("Effective date must be in YYYY-MM-DD format.");
    }

    return this.sections.transferMembership({
      learnerId,
      fromMembershipId,
      toSectionId,
      effectiveOn: input.effectiveOn,
    });
  }

  /**
   * End a currently-enrolled learner's membership. As with
   * {@link transferMembership}, negative outcomes come back as an
   * {@link EndEnrollmentResult} variant rather than a thrown error.
   */
  async endMembership(input: {
    learnerId: string;
    membershipId: string;
    effectiveOn: string;
  }): Promise<EndEnrollmentResult> {
    const learnerId = input.learnerId.trim();
    const membershipId = input.membershipId.trim();
    if (learnerId.length === 0) {
      throw new ValidationError("Learner is required.");
    }
    if (membershipId.length === 0) {
      throw new ValidationError("The current enrollment is required.");
    }
    if (!DATE_PATTERN.test(input.effectiveOn)) {
      throw new ValidationError("Effective date must be in YYYY-MM-DD format.");
    }

    return this.sections.endMembership({
      learnerId,
      membershipId,
      effectiveOn: input.effectiveOn,
    });
  }
}
