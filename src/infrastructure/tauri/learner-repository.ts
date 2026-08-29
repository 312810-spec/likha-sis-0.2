import { invoke } from "./invoke";
import type { CreateLearnerResult, Learner } from "../../domain/learner";
import type { LearnerRepository } from "../../domain/ports/learner-repository";

/** Tauri/SQLite implementation of {@link LearnerRepository}. */
export class TauriLearnerRepository implements LearnerRepository {
  list(): Promise<Learner[]> {
    return invoke<Learner[]>("list_learners_by_school");
  }

  create(givenName: string, familyName: string, lrn?: string, sex?: "M" | "F"): Promise<Learner> {
    return invoke<Learner>("create_learner", {
      givenName,
      familyName,
      lrn: lrn ?? null,
      sex: sex ?? null,
    });
  }

  createWithDuplicateCheck(
    givenName: string,
    familyName: string,
    lrn: string | undefined,
    sex: "M" | "F" | undefined,
    confirmed: boolean,
  ): Promise<CreateLearnerResult> {
    return invoke<CreateLearnerResult>("create_learner_with_duplicate_check", {
      givenName,
      familyName,
      lrn: lrn ?? null,
      sex: sex ?? null,
      confirmed,
    });
  }

  updateProfile(
    learnerId: string,
    givenName: string,
    familyName: string,
    lrn?: string,
    sex?: "M" | "F",
  ): Promise<Learner | null> {
    return invoke<Learner | null>("update_learner", {
      learnerId,
      givenName,
      familyName,
      lrn: lrn ?? null,
      sex: sex ?? null,
    });
  }
}
