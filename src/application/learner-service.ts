import { ValidationError } from "../domain/errors";
import type { Learner } from "../domain/learner";
import type { LearnerRepository } from "../domain/ports/learner-repository";

const MAX_NAME_LENGTH = 100;

/**
 * Orchestrates learner-related use cases. UI code depends on this, never
 * directly on a `LearnerRepository`. School scope is never a parameter
 * here — it comes from the caller's authenticated session on the Rust
 * side, not from anything this layer passes along. See ADR-0004.
 */
export class LearnerApplicationService {
  constructor(private readonly learners: LearnerRepository) {}

  async enrollLearner(givenName: string, familyName: string): Promise<Learner> {
    const trimmedGiven = givenName.trim();
    const trimmedFamily = familyName.trim();
    if (trimmedGiven.length === 0) {
      throw new ValidationError("Given name must not be empty.");
    }
    if (trimmedFamily.length === 0) {
      throw new ValidationError("Family name must not be empty.");
    }
    if (trimmedGiven.length > MAX_NAME_LENGTH || trimmedFamily.length > MAX_NAME_LENGTH) {
      throw new ValidationError(`Names must be at most ${MAX_NAME_LENGTH} characters.`);
    }

    return this.learners.create(trimmedGiven, trimmedFamily);
  }

  listLearners(): Promise<Learner[]> {
    return this.learners.list();
  }
}
