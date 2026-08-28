import type { SectionMembership } from "../../domain/section";
import type { EnrollmentHistoryRepository } from "../../domain/ports/enrollment-history-repository";
import { invoke } from "./invoke";

/** Tauri adapter for the existing school-scoped enrollment-history command. */
export class TauriEnrollmentHistoryRepository implements EnrollmentHistoryRepository {
  listByLearner(learnerId: string): Promise<SectionMembership[]> {
    return invoke<SectionMembership[]>("list_learner_enrollment_history", { learnerId });
  }
}
