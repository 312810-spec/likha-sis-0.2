import { invoke } from "./invoke";
import type {
  LearnerEnrollmentHistoryEntry,
  Section,
  SectionMembership,
  SectionRosterMember,
} from "../../domain/section";
import type { SectionRepository } from "../../domain/ports/section-repository";

/** Tauri/SQLite implementation of {@link SectionRepository}. */
export class TauriSectionRepository implements SectionRepository {
  list(): Promise<Section[]> {
    return invoke<Section[]>("list_sections_by_school");
  }

  create(schoolYear: string, gradeLevel: string, name: string): Promise<Section> {
    return invoke<Section>("create_section", { schoolYear, gradeLevel, name });
  }

  enroll(
    sectionId: string,
    learnerId: string,
    startsOn: string,
  ): Promise<SectionMembership | null> {
    return invoke<SectionMembership | null>("enroll_learner_in_section", {
      sectionId,
      learnerId,
      startsOn,
    });
  }

  roster(sectionId: string, asOfDate: string): Promise<SectionRosterMember[]> {
    return invoke<SectionRosterMember[]>("section_roster", { sectionId, asOfDate });
  }

  learnerEnrollmentHistory(learnerId: string): Promise<LearnerEnrollmentHistoryEntry[] | null> {
    return invoke<LearnerEnrollmentHistoryEntry[] | null>("learner_enrollment_history", {
      learnerId,
    });
  }
}
