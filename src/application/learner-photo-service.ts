import { ValidationError } from "../domain/errors";
import type { LearnerPhoto } from "../domain/learner-photo";
import type { LearnerPhotoRepository } from "../domain/ports/learner-photo-repository";

/** Mirrors `learner_photo::MAX_PHOTO_BYTES` on the Rust side — checked
 * here too so a teacher gets an immediate, specific message instead of
 * waiting on a round trip only to have the backend reject it. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

/**
 * Orchestrates learner-photo use cases. UI code depends on this, never
 * directly on a `LearnerPhotoRepository` — matches every other
 * `*ApplicationService` in this codebase.
 */
export class LearnerPhotoApplicationService {
  constructor(private readonly photos: LearnerPhotoRepository) {}

  getPhoto(learnerId: string): Promise<LearnerPhoto | null> {
    return this.photos.get(learnerId);
  }

  async setPhoto(learnerId: string, photoBytes: Uint8Array, mimeType: string): Promise<boolean> {
    if (photoBytes.length === 0) {
      throw new ValidationError("Please choose a photo file.");
    }
    if (photoBytes.length > MAX_PHOTO_BYTES) {
      throw new ValidationError("Photo file is too large — please choose one under 2 MB.");
    }
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      throw new ValidationError("Photo must be a PNG or JPEG image.");
    }
    return this.photos.set(learnerId, photoBytes, mimeType);
  }

  clearPhoto(learnerId: string): Promise<boolean> {
    return this.photos.clear(learnerId);
  }
}
