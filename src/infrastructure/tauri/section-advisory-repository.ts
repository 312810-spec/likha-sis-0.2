import type { SectionAdvisoryRepository } from "../../domain/ports/section-advisory-repository";
import type {
  AssignAdviserOutcome,
  EndAdvisoryOutcome,
  SectionAdvisory,
} from "../../domain/section-advisory";
import { invoke } from "./invoke";

export class TauriSectionAdvisoryRepository implements SectionAdvisoryRepository {
  getCurrentAdviser(sectionId: string, asOfDate: string): Promise<SectionAdvisory | null> {
    return invoke<SectionAdvisory | null>("current_section_adviser", {
      sectionId,
      asOfDate,
    });
  }

  assignAdviser(
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

  endAdviser(sectionId: string, advisoryId: string, endsOn: string): Promise<EndAdvisoryOutcome> {
    return invoke<EndAdvisoryOutcome>("end_section_adviser", {
      sectionId,
      advisoryId,
      endsOn,
    });
  }
}
