import type { SectionAdvisoryRepository } from "../../domain/ports/section-advisory-repository";
import type {
  AssignAdviserOutcome,
  EndAdvisoryOutcome,
  SectionAdvisory,
} from "../../domain/section-advisory";
import { invoke } from "./invoke";

/** Tauri adapter for Wave 3E's existing, already-tested
 * `assign_section_adviser`/`end_section_adviser`/`current_section_adviser`
 * commands -- Wave 3G is the first UI to actually call them. */
export class TauriSectionAdvisoryRepository implements SectionAdvisoryRepository {
  currentAdviser(sectionId: string, asOfDate: string): Promise<SectionAdvisory | null> {
    return invoke<SectionAdvisory | null>("current_section_adviser", {
      sectionId,
      asOfDate,
    });
  }

  assign(
    sectionId: string,
    teacherUserId: string,
    startsOn: string,
  ): Promise<AssignAdviserOutcome> {
    return invoke<AssignAdviserOutcome>("assign_section_adviser", {
      sectionId,
      teacherUserId,
      startsOn,
    });
  }

  end(sectionId: string, advisoryId: string, endsOn: string): Promise<EndAdvisoryOutcome> {
    return invoke<EndAdvisoryOutcome>("end_section_adviser", {
      sectionId,
      advisoryId,
      endsOn,
    });
  }
}
