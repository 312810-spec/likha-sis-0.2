import type { EnrollmentHistoryEntry } from "../domain/enrollment-history";
import { ValidationError } from "../domain/errors";
import type { EnrollmentHistoryRepository } from "../domain/ports/enrollment-history-repository";
import type { Section } from "../domain/section";

interface SectionDirectory {
  list(): Promise<Section[]>;
}

/** Joins retained placements to same-school section labels for display. */
export class EnrollmentHistoryApplicationService {
  constructor(
    private readonly history: EnrollmentHistoryRepository,
    private readonly sections: SectionDirectory,
  ) {}

  async listForLearner(learnerId: string): Promise<EnrollmentHistoryEntry[]> {
    const trimmedLearnerId = learnerId.trim();
    if (trimmedLearnerId.length === 0) {
      throw new ValidationError("Learner is required.");
    }

    const memberships = await this.history.listByLearner(trimmedLearnerId);
    // An empty history is authoritative on its own. Avoid turning it into an
    // error merely because the separate section-label lookup is unavailable.
    if (memberships.length === 0) return [];

    const sections = await this.sections.list();
    const sectionsById = new Map(sections.map((section) => [section.id, section]));

    return memberships.map((membership) => {
      const section = sectionsById.get(membership.sectionId);
      return {
        membershipId: membership.id,
        sectionName: section?.name ?? null,
        gradeLevel: section?.gradeLevel ?? null,
        schoolYear: section?.schoolYear ?? null,
        startsOn: membership.startsOn,
        endsOn: membership.endsOn,
      };
    });
  }
}
