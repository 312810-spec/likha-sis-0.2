import { ValidationError } from "../domain/errors";
import type { Learner } from "../domain/learner";
import type { LearnerRepository } from "../domain/ports/learner-repository";

const MAX_NAME_LENGTH = 100;
const LRN_PATTERN = /^\d{12}$/;

/**
 * Orchestrates learner-related use cases. UI code depends on this, never
 * directly on a `LearnerRepository`. School scope is never a parameter
 * here — it comes from the caller's authenticated session on the Rust
 * side, not from anything this layer passes along. See ADR-0004.
 */
export class LearnerApplicationService {
  constructor(private readonly learners: LearnerRepository) {}

  async enrollLearner(
    givenName: string,
    familyName: string,
    lrn?: string,
    sex?: "M" | "F",
  ): Promise<Learner> {
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
    const trimmedLrn = normalizeLrn(lrn);

    return this.learners.create(trimmedGiven, trimmedFamily, trimmedLrn, sex);
  }

  async updateLearnerProfile(
    learnerId: string,
    givenName: string,
    familyName: string,
    lrn?: string,
    sex?: "M" | "F",
  ): Promise<Learner | null> {
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
    const trimmedLrn = normalizeLrn(lrn);

    return this.learners.updateProfile(learnerId, trimmedGiven, trimmedFamily, trimmedLrn, sex);
  }

  listLearners(): Promise<Learner[]> {
    return this.learners.list();
  }
}

/** LRN is optional, but if given must be exactly the 12 digits DepEd's
 * format requires — this app has no way to verify a real learner's LRN is
 * correct, only that it's shaped like one, so a malformed value is
 * rejected before it can be silently stored as a wrong identifier. */
function normalizeLrn(lrn: string | undefined): string | undefined {
  if (lrn === undefined) return undefined;
  const trimmed = lrn.trim();
  if (trimmed.length === 0) return undefined;
  if (!LRN_PATTERN.test(trimmed)) {
    throw new ValidationError("LRN must be exactly 12 digits.");
  }
  return trimmed;
}
