import { invoke } from "./invoke";
import type {
  EndEnrollmentResult,
  Section,
  SectionMembership,
  SectionRosterMember,
  TransferResult,
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

  transferMembership(input: {
    learnerId: string;
    fromMembershipId: string;
    toSectionId: string;
    effectiveOn: string;
  }): Promise<TransferResult> {
    return invoke<TransferResult>("transfer_learner_membership", input);
  }

  endMembership(input: {
    learnerId: string;
    membershipId: string;
    effectiveOn: string;
  }): Promise<EndEnrollmentResult> {
    return invoke<EndEnrollmentResult>("end_learner_membership", input);
  }
}
