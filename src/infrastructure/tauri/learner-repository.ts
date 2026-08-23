import { invoke } from "@tauri-apps/api/core";
import type { Learner } from "../../domain/learner";
import type { LearnerRepository } from "../../domain/ports/learner-repository";

/** Tauri/SQLite implementation of {@link LearnerRepository}. */
export class TauriLearnerRepository implements LearnerRepository {
  list(): Promise<Learner[]> {
    return invoke<Learner[]>("list_learners_by_school");
  }

  create(givenName: string, familyName: string): Promise<Learner> {
    return invoke<Learner>("create_learner", { givenName, familyName });
  }
}
