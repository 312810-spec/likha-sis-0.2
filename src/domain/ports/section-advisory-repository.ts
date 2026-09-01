import type {
  AssignAdviserOutcome,
  EndAdvisoryOutcome,
  SectionAdvisory,
} from "../section-advisory";

/**
 * Port for managing section advisories.
 * Wires the Wave 3E section advisory commands:
 * `current_section_adviser`, `assign_section_adviser`, and `end_section_adviser`.
 */
export interface SectionAdvisoryRepository {
  getCurrentAdviser(sectionId: string, asOfDate: string): Promise<SectionAdvisory | null>;
  assignAdviser(
    sectionId: string,
    teacherUserId: string,
    startsOn: string,
  ): Promise<AssignAdviserOutcome>;
  endAdviser(sectionId: string, advisoryId: string, endsOn: string): Promise<EndAdvisoryOutcome>;
}
