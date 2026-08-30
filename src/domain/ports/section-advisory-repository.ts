import type {
  AssignAdviserOutcome,
  EndAdvisoryOutcome,
  SectionAdvisory,
} from "../section-advisory";

/** Wave 3G: the School Head's Section Adviser Management screen. Wires
 * the already-shipped `assign_section_adviser`/`end_section_adviser`/
 * `current_section_adviser` commands (Wave 3E's foundation) into a real
 * UI for the first time. */
export interface SectionAdvisoryRepository {
  currentAdviser(sectionId: string, asOfDate: string): Promise<SectionAdvisory | null>;
  assign(sectionId: string, teacherUserId: string, startsOn: string): Promise<AssignAdviserOutcome>;
  end(sectionId: string, advisoryId: string, endsOn: string): Promise<EndAdvisoryOutcome>;
}
