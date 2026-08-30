import { ValidationError } from "../domain/errors";
import type {
  LearnerEnrollmentHistoryEntry,
  Section,
  SectionMembership,
  SectionRosterMember,
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

  roster(sectionId: string, asOfDate: string): Promise<SectionRosterMember[]> {
    return this.sections.roster(sectionId, asOfDate);
  }

  learnerEnrollmentHistory(learnerId: string): Promise<LearnerEnrollmentHistoryEntry[] | null> {
    return this.sections.learnerEnrollmentHistory(learnerId);
  }
}
