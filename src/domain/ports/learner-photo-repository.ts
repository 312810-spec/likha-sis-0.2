import type { LearnerPhoto } from "../learner-photo";

/**
 * Repository port for a learner's photo. Like {@link LearnerRepository},
 * scoped server-side to the caller's own school — `learnerId` is passed,
 * but `schoolId` never is.
 */
export interface LearnerPhotoRepository {
  get(learnerId: string): Promise<LearnerPhoto | null>;
  /** Returns `false` when `learnerId` doesn't resolve in the caller's own
   * school (never throws for that case). */
  set(learnerId: string, photoBytes: Uint8Array, mimeType: string): Promise<boolean>;
  clear(learnerId: string): Promise<boolean>;
}
